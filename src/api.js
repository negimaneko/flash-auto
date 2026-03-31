import { DETAIL_LEVELS } from "./constants.js";
import { normalizeLanguageValue, getLangLabel } from "./utils.js";
import { trackEvent } from "./lib/tracking.js";

export async function callAI(prompt, maxTokens = 1024) {
  const endpoints = [
    { url: "/api/ollama", provider: "ollama" },
    { url: "/api/groq",   provider: "groq"   },
    { url: "/api/gemini", provider: "gemini" },
  ];
  const errors = [];
  let attemptCount = 0;

  for (const ep of endpoints) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      let r;
      try {
        r = await fetch(ep.url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt, maxTokens }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }
      const isJson = (r.headers.get("content-type") || "").includes("application/json");
      const d = isJson ? await r.json() : { error: await r.text() };

      if (r.status === 404 && ep !== endpoints[endpoints.length - 1]) {
        errors.push({ provider: ep.provider, status: 404, message: "not deployed" });
        attemptCount++;
        continue;
      }
      if (r.status === 429 && ep !== endpoints[endpoints.length - 1]) {
        errors.push({ provider: ep.provider, status: 429, message: d.error || "rate limited" });
        attemptCount++;
        continue;
      }
      if (r.status === 503 && ep !== endpoints[endpoints.length - 1]) {
        errors.push({ provider: ep.provider, status: 503, message: d.error || "unavailable" });
        attemptCount++;
        continue;
      }
      if (!r.ok) {
        throw new Error(d.error || `AI request failed (${r.status})`);
      }
      if (!d.text) {
        throw new Error("AI returned an empty response");
      }
      return { text: d.text, provider: ep.provider, fallbackUsed: attemptCount > 0 };
    } catch (e) {
      const message = e && e.name === "AbortError"
        ? "タイムアウト（10秒）"
        : (e instanceof Error ? e.message : "AI request failed");
      errors.push({ provider: ep.provider, message });
      attemptCount++;
      if (ep === endpoints[endpoints.length - 1]) {
        console.error("[callAI] All providers failed:", JSON.stringify(errors));
        throw new Error("AIに接続できませんでした。しばらくしてから再試行してください。");
      }
    }
  }

  console.error("[callAI] Exhausted all endpoints:", JSON.stringify(errors));
  throw new Error("AIに接続できませんでした。しばらくしてから再試行してください。");
}

export async function fetchDeckFromCacheOrGenerate(payload) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000);
  let response;
  try {
    response = await fetch("/api/deck-cache", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (e) {
    clearTimeout(timeoutId);
    if (e && e.name === "AbortError") {
      throw new Error("単語帳の生成がタイムアウトしました。もう一度お試しください。");
    }
    throw e;
  }
  clearTimeout(timeoutId);
  const isJson = (response.headers.get("content-type") || "").includes("application/json");
  const result = isJson ? await response.json() : { error: await response.text() };

  if (!response.ok) {
    const err = new Error(result.error || "単語帳の取得に失敗しました。");
    if (result.credits) err.credits = result.credits;
    throw err;
  }

  return result;
}

export async function aiSuggest({ term, wordLang, defLang, detailLevel, deckName, otherWords }) {
  const normalizedWordLang = normalizeLanguageValue(wordLang);
  const normalizedDefLang = normalizeLanguageValue(defLang);
  const wl = getLangLabel(normalizedWordLang);
  const dl = getLangLabel(normalizedDefLang);
  const lvl = DETAIL_LEVELS.find((l) => l.id === detailLevel) || DETAIL_LEVELS[1];
  const context = (otherWords || []).filter(Boolean).slice(0, 12).join(", ");
  const isTechnical = normalizedWordLang === "technical";
  const noWordInDefRule = `CRITICAL: NEVER include the word "${term}" in the definition. Do not write "${term}とは", "${term}は", "${term} is", "${term} refers to", or any phrase containing "${term}". Write as if the word is hidden.`;
  const prompt = isTechnical
    ? [
        `Define the technical term "${term}" as it is commonly used in Japan, and write the definition in ${dl}.`,
        `Deck: ${deckName || "Untitled"}`,
        context ? `Related words: ${context}` : "",
        lvl.id === 1 ? "Return one short sentence." : lvl.id === 2 ? "Return 2-3 sentences." : "Return 4-6 sentences with examples.",
        `Use assertive, dictionary-style tone (断定・体言止め). Never use polite form (ですます調). Example: "〜すること。" "〜を指す。" "〜の手法。"`,
        noWordInDefRule,
        "Return the definition only.",
      ].filter(Boolean).join("\n")
    : [
        `Translate the ${wl} word "${term}" into ${dl}.`,
        `Return only the translated word or short phrase in ${dl}. Do not add any explanation, examples, or extra sentences.`,
        noWordInDefRule,
        context ? `Context (related words in this deck): ${context}` : "",
      ].filter(Boolean).join("\n");
  const maxTk = isTechnical
    ? (lvl.id === 1 ? 80 : lvl.id === 2 ? 200 : 500)
    : 30;
  const t0 = Date.now();
  try {
    const { text, provider, fallbackUsed } = await callAI(prompt, maxTk);
    trackEvent("generate_word", {
      input_word: term,
      generation_latency_ms: Date.now() - t0,
      generation_success: true,
      ai_provider: provider,
      fallback_used: fallbackUsed,
    });
    // 単語が定義の冒頭に含まれる場合は後処理で除去
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`^${escaped}\\s*(?:とは|は|：|:|-|—|\\(|（|、|,)?\\s*`, "i");
    return text.trim().replace(pattern, "").trim() || text.trim();
  } catch (e) {
    trackEvent("generate_word", {
      input_word: term,
      generation_latency_ms: Date.now() - t0,
      generation_success: false,
      generation_error: e instanceof Error ? e.message : "Unknown error",
    });
    throw e;
  }
}

export async function aiEval(term, correctDef, userAns, defLang) {
  try {
    const prompt = `Evaluate whether the learner answer matches the correct definition. Term: ${term}\nCorrect: ${correctDef}\nLearner: ${userAns}\nReturn JSON only: {"correct":true/false,"feedback":"short feedback in ${getLangLabel(normalizeLanguageValue(defLang))}"}`;
    const { text } = await callAI(prompt, 200);
    const cleaned = text.split("```json").join("").split("```").join("").trim();
    return JSON.parse(cleaned || '{"correct":false,"feedback":""}');
  } catch (e) {
    return { correct: false, feedback: "Could not evaluate the answer." };
  }
}

export async function aiMastery(results) {
  try {
    const prompt = `Judge whether this study result means the learner mastered the deck. Result: ${JSON.stringify(results)}\nReturn JSON only: {"cleared":true/false,"message":"short message in Japanese"}`;
    const { text } = await callAI(prompt, 200);
    const cleaned = text.split("```json").join("").split("```").join("").trim();
    return JSON.parse(cleaned || '{"cleared":false,"message":""}');
  } catch (e) {
    return { cleared: false, message: "Mastery check could not be completed." };
  }
}

import { requestGroqChat } from "./_shared/groq.js";
import { getSupabaseAdmin, isSupabaseConfigured } from "./_shared/supabase.js";
import { handlePreflight, setCors } from "./_shared/cors.js";

const DAILY_CREDIT_LIMIT = Number(process.env.AI_GENERATE_DAILY_LIMIT || 3);

function normalizeLanguageValue(value, fallback = "ja") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function normalizeTopicKey(topic) {
  return String(topic ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function normalizeWordKey(word) {
  return String(word ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function getTodayKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDeckPayload(raw) {
  let cleaned = String(raw || "");
  // Remove <think>...</think> blocks (some reasoning models include these)
  cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/gi, "");
  // Remove markdown code fences
  cleaned = cleaned.split("```json").join("").split("```").join("").trim();
  // Extract the first JSON object found
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    cleaned = cleaned.slice(start, end + 1);
  }
  return JSON.parse(cleaned);
}

function stripWordFromDefinition(word, definition) {
  if (!word || !definition) return definition;
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // 「単語とは〜」「単語は〜」「単語：〜」などのパターンを冒頭から除去
  const pattern = new RegExp(`^${escaped}\\s*(?:とは|は|：|:|-|—|\\(|（|、|,)?\\s*`, "i");
  const stripped = definition.replace(pattern, "").trim();
  return stripped || definition;
}

function sanitizeCards(cards, minCards, maxCards, excludedWords = []) {
  const excluded = new Set(excludedWords.map(normalizeWordKey));
  const seen = new Set();

  const sanitized = (Array.isArray(cards) ? cards : [])
    .filter((card) => card?.word && card?.definition)
    .map((card) => ({
      word: String(card.word).trim(),
      definition: stripWordFromDefinition(String(card.word).trim(), String(card.definition).trim()),
    }))
    .filter((card) => {
      const key = normalizeWordKey(card.word);
      if (!key || excluded.has(key) || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, maxCards);

  if (sanitized.length < minCards) {
    throw new Error("AI returned an invalid deck.");
  }

  return sanitized;
}

const DECK_SYSTEM_PROMPT = [
  "You are a factual flashcard generator.",
  "CRITICAL RULES:",
  "- Only output information you are confident is accurate.",
  "- NEVER invent or fabricate names, terms, or definitions.",
  "- If the topic asks about specific items (e.g. characters, people, cities, species), list ONLY real, verifiable items that belong to that category.",
  "- Do NOT include generic/peripheral concepts (e.g. 'merchandise', 'fan art', 'collaboration', 'pop culture') unless the topic explicitly asks for them.",
  "- If you cannot confidently list 10 accurate items, return fewer. Accuracy is more important than quantity.",
  "- Each definition must describe the specific item in the 'word' field, not the broader topic.",
].join("\n");

function buildInitialPrompt({ topic, wordLang, defLang, detailLevel, mustIncludeWords }) {
  const detailInstructions = detailLevel === 1
    ? "Each definition should be one short sentence."
    : detailLevel === 2
      ? "Each definition should be 2-3 sentences."
      : "Each definition should be detailed and include examples.";

  const wordLangInstruction = wordLang && wordLang !== "technical"
    ? `Word/term language: ${wordLang} (write each word/term in ${wordLang}).`
    : "Words/terms should be in the original language commonly used for the topic.";

  const mustIncludeInstruction = mustIncludeWords
    ? `You MUST include cards for all of the following words/terms (in addition to other important terms): ${mustIncludeWords}. These are required — do not skip any of them.`
    : null;

  return [
    `Create a study flashcard deck about: ${topic}`,
    "Number of cards: 10 to 15, but accuracy comes first — return fewer if you are not confident.",
    "Each card's 'word' field must be a specific, real item that directly belongs to the topic.",
    "If the topic is about characters, list actual character names. If the topic is about a field of study, list key terms. If the topic is about places, list actual place names.",
    "Do NOT include generic peripheral words like 'merchandise', 'fan art', 'collaboration', 'pop culture', or 'character goods' — only include items that ARE the topic's core content.",
    "CRITICAL: The definition must NEVER start with or contain the word/term itself. Do NOT write '〜とは', '〜は', 'X is', 'X refers to', or any variation that includes the word. Write as if the word is hidden — define the concept without naming it.",
    mustIncludeInstruction,
    wordLangInstruction,
    `Definition language: ${defLang}`,
    detailInstructions,
    'Return JSON only: {"deckName":"...","tags":["#tag1","#tag2"],"cards":[{"word":"...","definition":"..."}]}',
  ].filter(Boolean).join("\n");
}

function buildContinuationPrompt({ topic, wordLang, defLang, detailLevel, existingWords }) {
  const detailInstructions = detailLevel === 1
    ? "Each definition should be one short sentence."
    : detailLevel === 2
      ? "Each definition should be 2-3 sentences."
      : "Each definition should be detailed and include examples.";

  const wordLangInstruction = wordLang && wordLang !== "technical"
    ? `Word/term language: ${wordLang} (write each word/term in ${wordLang}).`
    : "Words/terms should be in the original language commonly used for the topic.";

  return [
    `Continue a study flashcard deck about: ${topic}`,
    `Already generated words: ${existingWords.join(", ")}`,
    "Generate 5 to 10 additional cards, but accuracy comes first — return fewer if you are not confident.",
    "Every new card must be a new term and must not duplicate or paraphrase any existing word.",
    "Each card's 'word' must be a specific, real item that directly belongs to the topic — no generic peripheral concepts.",
    "CRITICAL: The definition must NEVER start with or contain the word/term itself. Do NOT write '〜とは', '〜は', 'X is', 'X refers to', or any variation that includes the word. Write as if the word is hidden — define the concept without naming it.",
    wordLangInstruction,
    `Definition language: ${defLang}`,
    detailInstructions,
    'Return JSON only: {"cards":[{"word":"...","definition":"..."}]}',
  ].join("\n");
}

function mapDeckRow(row, fallbackDetailLevel) {
  return {
    cacheId: row.id,
    deck: {
      deckName: row.deck_name,
      tags: row.tags || [],
      cards: row.cards || [],
      wordLang: row.word_lang || "technical",
      defLang: row.def_lang,
      detailLevel: row.detail_level || fallbackDetailLevel,
    },
  };
}

async function readCredits(supabase, userId, usageDate) {
  const { data, error } = await supabase
    .from("daily_generate_usage")
    .select("count")
    .eq("user_id", userId)
    .eq("usage_date", usageDate)
    .limit(1);

  if (error) throw new Error(error.message);
  return data?.[0]?.count || 0;
}

async function consumeCredit(supabase, userId, usageDate) {
  const usedCredits = await readCredits(supabase, userId, usageDate);
  if (usedCredits >= DAILY_CREDIT_LIMIT) {
    throw new Error(`今日のクレジット（${DAILY_CREDIT_LIMIT}回）を使い切りました。明日またお試しください。`);
  }

  const nextCredits = usedCredits + 1;
  const { error } = await supabase
    .from("daily_generate_usage")
    .upsert({
      user_id: userId,
      usage_date: usageDate,
      count: nextCredits,
    }, {
      onConflict: "user_id,usage_date",
    });

  if (error) throw new Error(error.message);
  return Math.max(0, DAILY_CREDIT_LIMIT - nextCredits);
}

async function fetchCachedDeck(supabase, topicKey, defLang) {
  const { data, error } = await supabase
    .from("deck_cache")
    .select("id,deck_name,tags,cards,word_lang,def_lang,detail_level")
    .eq("topic_key", topicKey)
    .eq("def_lang", defLang)
    .limit(1);

  if (error) throw new Error(error.message);
  return data?.[0] || null;
}

async function fetchCachedDeckById(supabase, cacheId) {
  const { data, error } = await supabase
    .from("deck_cache")
    .select("id,topic,topic_key,deck_name,tags,cards,word_lang,def_lang,detail_level")
    .eq("id", cacheId)
    .limit(1);

  if (error) throw new Error(error.message);
  return data?.[0] || null;
}

async function generateInitialDeck({ topic, wordLang, defLang, detailLevel, mustIncludeWords }) {
  const prompt = buildInitialPrompt({ topic, wordLang, defLang, detailLevel, mustIncludeWords });
  const maxTokens = detailLevel === 3 ? 6000 : 4000;
  const raw = await requestGroqChat({ prompt, maxTokens, systemPrompt: DECK_SYSTEM_PROMPT, temperature: 0.3 });
  const parsed = parseDeckPayload(raw);

  return {
    deckName: String(parsed.deckName || "").trim() || "AI生成単語帳",
    tags: Array.isArray(parsed.tags) ? parsed.tags.filter(Boolean).slice(0, 10) : [],
    cards: sanitizeCards(parsed.cards, 5, 15),
  };
}

async function generateContinuationCards({ topic, wordLang, defLang, detailLevel, existingWords }) {
  const prompt = buildContinuationPrompt({ topic, wordLang, defLang, detailLevel, existingWords });
  const raw = await requestGroqChat({ prompt, maxTokens: 2500, systemPrompt: DECK_SYSTEM_PROMPT, temperature: 0.3 });
  const parsed = parseDeckPayload(raw);
  return sanitizeCards(parsed.cards, 3, 10, existingWords);
}

export default async function handler(req, res) {
  if (handlePreflight(req, res)) return;
  setCors(req, res);

  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const action = String(req.body?.action || "initial").trim();
  const topic = String(req.body?.topic || "").trim();
  const wordLang = normalizeLanguageValue(req.body?.wordLang, "technical");
  const defLang = normalizeLanguageValue(req.body?.defLang);
  const detailLevel = Number(req.body?.detailLevel || 2);
  const userId = String(req.body?.userId || "").trim();
  const mustIncludeWords = String(req.body?.mustIncludeWords || "").trim();
  const usageDate = getTodayKey();

  if (!topic) return res.status(400).json({ error: "topic is required" });
  if (topic.length > 200) return res.status(400).json({ error: "テーマは200文字以内で入力してください" });
  if (mustIncludeWords.length > 200) return res.status(400).json({ error: "「必ず含める単語」は200文字以内で入力してください" });
  if (!userId) return res.status(400).json({ error: "userId is required" });

  try {
    const supabase = getSupabaseAdmin();
    const topicKey = normalizeTopicKey(topic);

    // --- Supabase未設定時: キャッシュ・クレジットなしで直接生成 ---
    if (!supabase) {
      if (action === "initial") {
        const generated = await generateInitialDeck({ topic, wordLang, defLang, detailLevel, mustIncludeWords });
        return res.status(200).json({
          source: "generated",
          remainingCredits: null,
          cacheId: null,
          deck: {
            deckName: generated.deckName,
            tags: generated.tags,
            cards: generated.cards,
            wordLang,
            defLang,
            detailLevel,
          },
        });
      }

      if (action === "continue") {
        const existingWords = Array.isArray(req.body?.existingWords)
          ? req.body.existingWords.map((word) => String(word || "").trim()).filter(Boolean)
          : [];

        const continuationCards = await generateContinuationCards({
          topic,
          wordLang,
          defLang,
          detailLevel,
          existingWords,
        });

        return res.status(200).json({
          source: "continued",
          addedCount: continuationCards.length,
          remainingCredits: null,
          cacheId: null,
          deck: { cards: continuationCards },
        });
      }

      return res.status(400).json({ error: "Unsupported action" });
    }

    // --- Supabase設定済み: キャッシュ・クレジットあり ---
    if (action === "initial") {
      const remainingCredits = Math.max(0, DAILY_CREDIT_LIMIT - await readCredits(supabase, userId, usageDate));

      // mustIncludeWords が指定されている場合はキャッシュを使わず新規生成
      if (!mustIncludeWords) {
        const cached = await fetchCachedDeck(supabase, topicKey, defLang);
        if (cached) {
          return res.status(200).json({
            source: "cache",
            remainingCredits,
            ...mapDeckRow(cached, detailLevel),
          });
        }
      }

      const remainingAfterConsume = await consumeCredit(supabase, userId, usageDate);
      const generated = await generateInitialDeck({ topic, wordLang, defLang, detailLevel, mustIncludeWords });

      const { data, error } = await supabase
        .from("deck_cache")
        .upsert({
          topic,
          topic_key: topicKey,
          deck_name: generated.deckName,
          tags: generated.tags,
          cards: generated.cards,
          word_lang: wordLang,
          def_lang: defLang,
          detail_level: detailLevel,
          created_by_user_id: userId,
        }, {
          onConflict: "topic_key,def_lang",
        })
        .select("id,deck_name,tags,cards,word_lang,def_lang,detail_level")
        .limit(1);

      if (error) throw new Error(error.message);

      return res.status(200).json({
        source: "generated",
        remainingCredits: remainingAfterConsume,
        ...mapDeckRow(data[0], detailLevel),
      });
    }

    if (action === "continue") {
      const cacheId = Number(req.body?.cacheId);
      const existingWords = Array.isArray(req.body?.existingWords)
        ? req.body.existingWords.map((word) => String(word || "").trim()).filter(Boolean)
        : [];

      if (!cacheId) return res.status(400).json({ error: "cacheId is required" });

      const cached = await fetchCachedDeckById(supabase, cacheId);
      if (!cached) {
        return res.status(404).json({ error: "キャッシュ済み単語帳が見つかりません。" });
      }

      const mergedExistingWords = [
        ...(cached.cards || []).map((card) => card?.word),
        ...existingWords,
      ].filter(Boolean);

      const remainingAfterConsume = await consumeCredit(supabase, userId, usageDate);
      const continuationCards = await generateContinuationCards({
        topic: cached.topic || topic,
        wordLang: cached.word_lang || wordLang,
        defLang: cached.def_lang || defLang,
        detailLevel: cached.detail_level || detailLevel,
        existingWords: mergedExistingWords,
      });

      const updatedCards = sanitizeCards(
        [...(cached.cards || []), ...continuationCards],
        10,
        (cached.cards || []).length + continuationCards.length,
      );

      const { data, error } = await supabase
        .from("deck_cache")
        .update({
          cards: updatedCards,
          detail_level: cached.detail_level || detailLevel,
        })
        .eq("id", cacheId)
        .select("id,deck_name,tags,cards,word_lang,def_lang,detail_level")
        .limit(1);

      if (error) throw new Error(error.message);

      return res.status(200).json({
        source: "continued",
        addedCount: continuationCards.length,
        remainingCredits: remainingAfterConsume,
        ...mapDeckRow(data[0], detailLevel),
      });
    }

    return res.status(400).json({ error: "Unsupported action" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load deck cache";
    const status = /今日のクレジット/.test(message) ? 429 : 500;
    console.error(`[/api/deck-cache] ${status} error:`, message);
    return res.status(status).json({ error: message });
  }
}

// テスト用export
export { parseDeckPayload, sanitizeCards, buildInitialPrompt, buildContinuationPrompt, stripWordFromDefinition, DECK_SYSTEM_PROMPT };

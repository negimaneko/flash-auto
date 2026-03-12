import { requestGroqChat } from "./_shared/groq.js";
import { getSupabaseAdmin, isSupabaseConfigured } from "./_shared/supabase.js";

const DAILY_CREDIT_LIMIT = Number(process.env.AI_GENERATE_DAILY_LIMIT || 3);

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

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
  const cleaned = String(raw || "").split("```json").join("").split("```").join("").trim();
  return JSON.parse(cleaned);
}

function sanitizeCards(cards, minCards, maxCards, excludedWords = []) {
  const excluded = new Set(excludedWords.map(normalizeWordKey));
  const seen = new Set();

  const sanitized = (Array.isArray(cards) ? cards : [])
    .filter((card) => card?.word && card?.definition)
    .map((card) => ({
      word: String(card.word).trim(),
      definition: String(card.definition).trim(),
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

function buildInitialPrompt({ topic, wordLang, defLang, detailLevel }) {
  const detailInstructions = detailLevel === 1
    ? "Each definition should be one short sentence."
    : detailLevel === 2
      ? "Each definition should be 2-3 sentences."
      : "Each definition should be detailed and include examples.";

  const wordLangInstruction = wordLang && wordLang !== "technical"
    ? `Word/term language: ${wordLang} (write each word/term in ${wordLang}).`
    : "Words/terms should be in the original language commonly used for the topic.";

  return [
    `Create a study flashcard deck about: ${topic}`,
    "Number of cards: 10 to 15.",
    "You must always return at least 10 cards in the cards array.",
    "Start from the 10 most important cards.",
    "If there are additional must-know terms that do not fit within those 10, you may add up to 5 extra cards.",
    "Only add extra cards when they are clearly essential.",
    "Never return fewer than 10 cards, and never return more than 15 cards.",
    wordLangInstruction,
    `Definition language: ${defLang}`,
    detailInstructions,
    'Return JSON only: {"deckName":"...","tags":["#tag1","#tag2"],"cards":[{"word":"...","definition":"..."}]}',
  ].join("\n");
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
    "Generate 5 to 10 additional cards.",
    "Every new card must be a new term and must not duplicate or paraphrase any existing word.",
    "Only add genuinely useful next-step terms that expand the deck.",
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

async function generateInitialDeck({ topic, wordLang, defLang, detailLevel }) {
  const prompt = buildInitialPrompt({ topic, wordLang, defLang, detailLevel });
  const raw = await requestGroqChat({ prompt, maxTokens: 4000 });
  const parsed = parseDeckPayload(raw);

  return {
    deckName: String(parsed.deckName || "").trim() || "AI生成単語帳",
    tags: Array.isArray(parsed.tags) ? parsed.tags.filter(Boolean).slice(0, 10) : [],
    cards: sanitizeCards(parsed.cards, 10, 15),
  };
}

async function generateContinuationCards({ topic, wordLang, defLang, detailLevel, existingWords }) {
  const prompt = buildContinuationPrompt({ topic, wordLang, defLang, detailLevel, existingWords });
  const raw = await requestGroqChat({ prompt, maxTokens: 2500 });
  const parsed = parseDeckPayload(raw);
  return sanitizeCards(parsed.cards, 5, 10, existingWords);
}

export default async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const action = String(req.body?.action || "initial").trim();
  const topic = String(req.body?.topic || "").trim();
  const wordLang = normalizeLanguageValue(req.body?.wordLang, "technical");
  const defLang = normalizeLanguageValue(req.body?.defLang);
  const detailLevel = Number(req.body?.detailLevel || 2);
  const userId = String(req.body?.userId || "").trim();
  const usageDate = getTodayKey();

  if (!topic) return res.status(400).json({ error: "topic is required" });
  if (!userId) return res.status(400).json({ error: "userId is required" });

  try {
    const supabase = getSupabaseAdmin();
    const topicKey = normalizeTopicKey(topic);

    // --- Supabase未設定時: キャッシュ・クレジットなしで直接生成 ---
    if (!supabase) {
      if (action === "initial") {
        const generated = await generateInitialDeck({ topic, wordLang, defLang, detailLevel });
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
      const cached = await fetchCachedDeck(supabase, topicKey, defLang);
      const remainingCredits = Math.max(0, DAILY_CREDIT_LIMIT - await readCredits(supabase, userId, usageDate));

      if (cached) {
        return res.status(200).json({
          source: "cache",
          remainingCredits,
          ...mapDeckRow(cached, detailLevel),
        });
      }

      const remainingAfterConsume = await consumeCredit(supabase, userId, usageDate);
      const generated = await generateInitialDeck({ topic, wordLang, defLang, detailLevel });

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
    return res.status(status).json({ error: message });
  }
}

import { requestGroqChat } from "./_shared/groq.js";
import { requestGeminiChat } from "./_shared/gemini.js";
import { getSupabaseAdmin, isSupabaseConfigured } from "./_shared/supabase.js";
import { handlePreflight, setCors } from "./_shared/cors.js";

/**
 * デッキ生成用LLMを選択する。
 * GEMINI_API_KEY が設定されていれば Gemini を使い、なければ従来通り Groq を使う。
 * キャラクター検証(verifyCharacterCards)は常に Groq を使う（クロスモデル検証のため）。
 */
function getDeckGenerationLLM() {
  if (process.env.GEMINI_API_KEY) {
    return requestGeminiChat;
  }
  return requestGroqChat;
}

/**
 * キャラクター検証用LLMを選択する。
 * 生成と異なるモデルで検証する「クロスモデル検証」を実現するため、
 * Geminiで生成する場合は検証にGroqを、Groqで生成する場合でもGroqを使う。
 * 将来的に検証専用モデルを変更する場合はここだけ変えればよい。
 */
function getVerificationLLM() {
  return requestGroqChat;
}

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

// ---- キャラクタートピック判定 ----

/**
 * テーマが「特定作品の登場人物」系かどうかを判定する。
 * 例: 「ハズビンホテルのキャラクター」「SPY×FAMILYの登場人物」
 */
function isCharacterTopic(topic) {
  return /の(?:キャラクター|登場人物|キャスト|人物|メンバー)/.test(topic);
}

/**
 * 「XのキャラクターY」→「X」（作品タイトル部分）を抽出する。
 * 例: 「ハズビンホテルのキャラクター」→「ハズビンホテル」
 */
function extractWorkTitle(topic) {
  const match = topic.match(/^(.+?)の(?:キャラクター|登場人物|キャスト|人物|メンバー)/);
  return match ? match[1].trim() : null;
}

/**
 * キャラクタートピックで「役職語・職業語」を含む明らかに誤ったカードを除去する。
 * AIがテーマ中の固有名詞（例: ホテル）を職業の文脈で誤解した場合に防ぐ。
 */
const GENERIC_ROLE_PATTERNS = [
  /スタッフ/,
  /マネージャー/,
  /マネジャー/,
  /フロント(?:スタッフ|係|デスク|担当)?/,
  /メイド/,
  /ウェイター/,
  /ウェイトレス/,
  /支配人/,
  /従業員/,
  /受付(?:係)?/,
  /ベルボーイ/,
  /コンシェルジュ/,
  /役職/,       // 「ホテルの運営を管理する役職。」のような定義も短文チェックで捕捉する
  /\bstaff\b/i,
  /\bmanager\b/i,
  /\bmaid\b/i,
  /\breceptionist\b/i,
  /\bwaiter\b/i,
  /\bwaitress\b/i,
  /\bemployee\b/i,
  /\bconcierge\b/i,
  /\bbellboy\b/i,
];

function isGenericRoleWord(word) {
  return GENERIC_ROLE_PATTERNS.some((pattern) => pattern.test(word));
}

/**
 * キャラクタートピックのときのみ、役職語カードをフィルタして除去する。
 * 除去したカードはログに残す（デバッグ用）。
 */
function filterCharacterCards(cards, topic) {
  if (!isCharacterTopic(topic)) return cards;

  const before = cards.length;
  const filtered = cards.filter((card) => {
    if (isGenericRoleWord(card.word)) {
      console.warn(`[deck-cache] Filtered generic role word: "${card.word}" (topic: "${topic}")`);
      return false;
    }
    return true;
  });

  if (filtered.length < before) {
    console.warn(`[deck-cache] Removed ${before - filtered.length} generic role card(s) for topic "${topic}"`);
  }
  return filtered;
}

/**
 * キャラクタートピック用の定義文テンプレートを生成する。
 * 通常テーマの「概念説明」とは別に、キャラクター固有の情報を求める指示にする。
 * 「○○はホテルのスタッフです」のような職種説明だけの定義を防ぐ。
 */
function buildCharacterDefinitionInstruction(detailLevel) {
  const base = detailLevel === 1
    ? "Describe the character in one sentence: cover their personality, appearance, or role in the story — NOT just their job title."
    : detailLevel === 2
      ? "Describe the character in 2-3 sentences: who they are, their personality or notable traits, and their relationships or role in the story."
      : "Describe the character thoroughly: personality, appearance, abilities, key relationships, and story arc.";
  return (
    base +
    " NEVER write a definition that only states the character's job or occupation" +
    " (e.g. 'A hotel staff member.' is WRONG — describe what makes this character unique)."
  );
}

/**
 * キャラクタートピック用：定義文が「職種説明のみ」になっていないかを判定する。
 * 「○○はホテルのスタッフです」のような、キャラクター固有情報を含まない定義を異常として検出する。
 */
const JOB_DESCRIPTION_ONLY_PATTERNS = [
  // 「の[役職]です/である/をしている」で終わるパターン (例: ホテルのスタッフです)
  /(?:の|で|として)(?:スタッフ|従業員|職員|担当者?|マネージャー|マネジャー|支配人|メイド|ウェイター|ウェイトレス|コンシェルジュ|フロント(?:係|スタッフ|担当)?)(?:です|である|でした|をしている|として働く|として勤務)[。．\s]*$/,
  // 「[施設]の[役職]」で始まり短い定義
  /^(?:ホテル|レストラン|カフェ|施設|旅館)(?:の|で)(?:スタッフ|従業員|職員|担当者?|マネージャー|支配人|メイド|ウェイター|フロント)/,
  // 英語版: "is/works as a [job] at [place]"
  /\b(?:is|works as|serves as|employed as)\s+(?:a|an|the)\s+(?:staff|employee|maid|receptionist|manager|waiter|waitress|concierge|front desk\s*(?:clerk|staff)?)\b/i,
];

function isJobDescriptionDefinition(definition) {
  if (!definition) return false;
  const d = definition.trim();
  // 短い定義（40文字未満）で役職語を含む場合は職種説明とみなす
  if (d.length < 40 && GENERIC_ROLE_PATTERNS.some((p) => p.test(d))) return true;
  // 特定の職種説明パターンに一致する場合
  return JOB_DESCRIPTION_ONLY_PATTERNS.some((p) => p.test(d));
}

// ---- 一般概念語・周辺語フィルタ ----

/**
 * 「キャラクター名として使われてはいけない」一般語・周辺語のパターン。
 * ファンアート、コラボ、グッズ、ポップカルチャー等、作品キャラクターの固有名詞ではない語を検出する。
 */
const GENERIC_CONCEPT_PATTERNS = [
  /コラボレーション/,
  /ファンアート/,
  /キャラクターグッズ/,
  /ポップカルチャー/,
  /大衆文化/,
  /ファンダム/,
  /ファンコミュニティ/,
  /\bcollaboration\b/i,
  /\bfan.?art\b/i,
  /\bmerchandise\b/i,
  /\bpop.?culture\b/i,
  /\bfandom\b/i,
  /\bcharacter goods\b/i,
];

function isGenericConceptWord(word) {
  return GENERIC_CONCEPT_PATTERNS.some((pattern) => pattern.test(word));
}

/**
 * キャラクタートピックのとき、一般概念語・周辺語のカードを除去する。
 * 「コラボレーション」「ファンアート」「キャラクターグッズ」等、
 * 作品キャラクターの固有名詞ではない語が混入するパターンを防ぐ。
 */
function filterGenericConceptCards(cards, topic) {
  if (!isCharacterTopic(topic)) return cards;

  const before = cards.length;
  const filtered = cards.filter((card) => {
    if (isGenericConceptWord(card.word)) {
      console.warn(`[deck-cache] Filtered generic concept word: "${card.word}" (topic: "${topic}")`);
      return false;
    }
    return true;
  });

  if (filtered.length < before) {
    console.warn(`[deck-cache] Removed ${before - filtered.length} generic concept card(s) for topic "${topic}"`);
  }
  return filtered;
}

/**
 * キャラクタートピックで不正カード率が高すぎる場合に無効デッキと判定する。
 * rawCount >= 6 かつ validCount / rawCount < 0.4 のとき例外を投げる。
 * rawCount < 6 の場合はスキップし、sanitizeCards の最低件数チェックに委ねる。
 */
function checkCharacterDeckRatio(rawCount, validCount, topic) {
  if (!isCharacterTopic(topic)) return;
  if (rawCount < 6) return;
  const ratio = validCount / rawCount;
  if (ratio < 0.4) {
    console.warn(
      `[deck-cache] Rejected deck: only ${validCount}/${rawCount} cards (${Math.round(ratio * 100)}%) passed validation for topic "${topic}"`
    );
    throw new Error("AI returned an invalid deck.");
  }
}

// ---- LLM外部照合（キャラクター名の実在確認）----

/**
 * 外部照合用のシステムプロンプト。
 * 生成時とは全く別の厳格な「事実確認者」の立場で照合する。
 */
const VERIFICATION_SYSTEM_PROMPT = [
  "You are a strict fact-checker for fictional works.",
  "You will be given a list of candidate names and a fictional work title.",
  "Your sole task is to confirm which names are actual named characters from that specific work.",
  "CRITICAL RULES:",
  "- Only include names you are CERTAIN appear in this specific work as named characters.",
  "- If a name is a job role, general term, concept, or peripheral word, exclude it.",
  "- If you are not sure whether a name belongs to this specific work, exclude it.",
  "- Do NOT add any names that were not in the candidate list.",
  "- Returning fewer confirmed names is better than including uncertain ones.",
  "- Empty confirmed list is acceptable if no candidates can be verified.",
].join("\n");

/**
 * 外部照合用プロンプトを生成する。
 * @param {string[]} candidateNames - 照合対象のキャラクター名候補
 * @param {string} workTitle - 作品タイトル
 */
function buildVerificationPrompt(candidateNames, workTitle) {
  return [
    `Fictional work to check against: "${workTitle}"`,
    `Candidate names to verify: ${candidateNames.join(", ")}`,
    "",
    `From this list, return ONLY the names that are confirmed named characters from "${workTitle}".`,
    "Exclude: job titles, roles, general concepts, peripheral words, or any name you are uncertain about.",
    "If none can be confirmed with certainty, return an empty array.",
    `Return JSON only: {"confirmed": ["name1", "name2"]}`,
  ].join("\n");
}

/**
 * LLMを使ってキャラクター名候補を外部照合し、確認済みのカードのみを返す。
 * callLLM はテスト時にモックに差し替え可能。
 * 照合LLM呼び出しが失敗した場合はフォールバックとして入力カードをそのまま返す（生成は止めない）。
 *
 * @param {Array<{word: string, definition: string}>} cards - 照合対象カード
 * @param {string} workTitle - 作品タイトル
 * @param {{ callLLM: function }} options - callLLM: (params) => Promise<string>
 * @returns {Promise<Array<{word: string, definition: string}>>} - 確認済みカードのみ
 */
async function verifyCharacterCards(cards, workTitle, { callLLM }) {
  if (!cards || cards.length === 0) return [];

  const candidateNames = cards.map((c) => c.word);
  const prompt = buildVerificationPrompt(candidateNames, workTitle);

  let confirmed = [];
  try {
    const raw = await callLLM({ prompt, maxTokens: 512, systemPrompt: VERIFICATION_SYSTEM_PROMPT, temperature: 0 });
    // <think>ブロックやコードフェンスを除去してJSONを抽出
    const cleaned = String(raw || "")
      .replace(/<think>[\s\S]*?<\/think>/gi, "")
      .replace(/```(?:json)?/g, "")
      .trim();
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) throw new Error("No JSON found in verification response");
    const parsed = JSON.parse(cleaned.slice(start, end + 1));
    confirmed = Array.isArray(parsed.confirmed) ? parsed.confirmed : [];
    console.log(`[deck-cache] LLM verification: ${confirmed.length}/${candidateNames.length} confirmed for "${workTitle}"`);
  } catch (err) {
    // 照合失敗時はフォールバック: 内部フィルタ済みカードをそのまま通す（生成を止めない）
    console.warn(`[deck-cache] Character verification failed, falling back to internal filters: ${err.message}`);
    return cards;
  }

  // 確認済み名のセット（ケース非依存で照合）
  const confirmedSet = new Set(confirmed.map((name) => String(name).trim().toLowerCase()));
  const verified = cards.filter((card) => confirmedSet.has(card.word.toLowerCase()));

  if (verified.length < cards.length) {
    console.warn(
      `[deck-cache] Verification removed ${cards.length - verified.length} unconfirmed candidate(s) for "${workTitle}"`
    );
  }

  return verified;
}

/**
 * キャラクタートピックのとき、定義文が「職種説明のみ」のカードを除去する。
 * word が役職語でなくても定義文が職種説明なら除去する（架空名+職種説明の組合せを防ぐ）。
 */
function filterJobDescriptionCards(cards, topic) {
  if (!isCharacterTopic(topic)) return cards;

  const before = cards.length;
  const filtered = cards.filter((card) => {
    if (isJobDescriptionDefinition(card.definition)) {
      console.warn(
        `[deck-cache] Filtered job-description definition: word="${card.word}" def="${card.definition}" (topic: "${topic}")`
      );
      return false;
    }
    return true;
  });

  if (filtered.length < before) {
    console.warn(
      `[deck-cache] Removed ${before - filtered.length} job-description card(s) for topic "${topic}"`
    );
  }
  return filtered;
}

const DECK_SYSTEM_PROMPT = [
  "You are a factual flashcard generator.",
  "CRITICAL RULES:",
  "- Only output information you are confident is accurate.",
  "- NEVER invent or fabricate names, terms, or definitions.",
  "- If the topic asks about specific items (e.g. characters, people, cities, species), list ONLY real, verifiable items that belong to that category.",
  "- Do NOT include generic/peripheral concepts (e.g. 'merchandise', 'fan art', 'collaboration', 'pop culture') unless the topic explicitly asks for them.",
  "- YOUR GOAL IS NOT TO FILL A COUNT. Output ONLY items you are confident are accurate and belong to the topic.",
  "- If you can confidently list only 3 items, return 3. Never invent or guess items to pad the list.",
  "- Each definition must describe the specific item in the 'word' field — not the broader topic, and not the item's occupation alone.",
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

  // キャラクター系テーマのとき、作品タイトルを明示してAIの誤解釈を防ぐ
  const workTitle = extractWorkTitle(topic);
  const isCharacter = isCharacterTopic(topic);

  const characterTopicInstruction = isCharacter
    ? [
        workTitle
          ? `CRITICAL: "${workTitle}" is the TITLE of a specific fictional work (anime, cartoon, game, comic, movie, or TV show). It is NOT a real-world place, business, or institution. Do NOT interpret it as a real location.`
          : null,
        "Each 'word' must be a PROPER NAME (given name, nickname, or known alias) of an actual named character from this specific fictional work.",
        "STRICTLY FORBIDDEN as 'word': job titles, roles, occupations, or positions — such as 'hotel manager', 'hotel staff', 'maid', 'receptionist', 'front desk clerk', 'guard', 'waiter', or any similar occupational terms.",
        "ALSO STRICTLY FORBIDDEN as 'word': general concepts, peripheral words, merchandise, fan art, collaboration, pop culture, goods, fandom, or any word that is not a specific character's name.",
        "If you are not certain a name belongs to this specific work, OMIT it entirely. Do NOT invent or guess names.",
      ].filter(Boolean).join("\n")
    : null;

  // キャラクタートピックと通常テーマで定義文の指示を分ける
  const definitionInstruction = isCharacter
    ? buildCharacterDefinitionInstruction(detailLevel)
    : detailInstructions;

  return [
    `Create a study flashcard deck about: ${topic}`,
    "GOAL: Output ONLY items that genuinely satisfy this topic's criteria. Do NOT guess or pad to meet a number.",
    "Card count: up to 15. Return as many as you are confident about — even if that is fewer than 10. 3 correct cards is better than 10 guessed cards.",
    characterTopicInstruction,
    "Each card's 'word' field must be a specific, real item that directly belongs to the topic.",
    isCharacter
      ? null
      : "If the topic is about a field of study, list key terms. If the topic is about places, list actual place names.",
    "Do NOT include generic peripheral words like 'merchandise', 'fan art', 'collaboration', 'pop culture', or 'character goods' — only include items that ARE the topic's core content.",
    "CRITICAL: The definition must NEVER start with or contain the word/term itself. Do NOT write '〜とは', '〜は', 'X is', 'X refers to', or any variation that includes the word. Write as if the word is hidden — define the concept without naming it.",
    mustIncludeInstruction,
    wordLangInstruction,
    `Definition language: ${defLang}`,
    definitionInstruction,
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

  const isCharacter = isCharacterTopic(topic);
  const definitionInstruction = isCharacter
    ? buildCharacterDefinitionInstruction(detailLevel)
    : detailInstructions;

  const characterContinuationInstruction = isCharacter
    ? [
        "Each 'word' must be a PROPER NAME (given name, nickname, or alias) of a real named character from this specific fictional work.",
        "STRICTLY FORBIDDEN as 'word': job titles, roles, occupations, general concepts, merchandise, fan art, collaboration, pop culture, or any non-character-name word.",
        "If you are not certain a name belongs to this work, OMIT it entirely. Do NOT invent or guess names.",
      ].join("\n")
    : null;

  return [
    `Continue a study flashcard deck about: ${topic}`,
    `Already generated words: ${existingWords.join(", ")}`,
    "GOAL: Output ONLY additional items that genuinely belong to this topic. Do NOT invent items to reach a count.",
    "Generate up to 10 additional cards. Return fewer if you are not confident. Never guess or fabricate.",
    "Every new card must be a new term and must not duplicate or paraphrase any existing word.",
    "Each card's 'word' must be a specific, real item that directly belongs to the topic — no generic peripheral concepts.",
    characterContinuationInstruction,
    "CRITICAL: The definition must NEVER start with or contain the word/term itself. Do NOT write '〜とは', '〜は', 'X is', 'X refers to', or any variation that includes the word. Write as if the word is hidden — define the concept without naming it.",
    wordLangInstruction,
    `Definition language: ${defLang}`,
    definitionInstruction,
    'Return JSON only: {"cards":[{"word":"...","definition":"..."}]}',
  ].filter(Boolean).join("\n");
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

async function generateInitialDeck({ topic, wordLang, defLang, detailLevel, mustIncludeWords, _callVerifyLLM, _callGenerateLLM }) {
  const prompt = buildInitialPrompt({ topic, wordLang, defLang, detailLevel, mustIncludeWords });
  const maxTokens = detailLevel === 3 ? 6000 : 4000;
  const generateLLM = _callGenerateLLM ?? getDeckGenerationLLM();
  const raw = await generateLLM({ prompt, maxTokens, systemPrompt: DECK_SYSTEM_PROMPT, temperature: 0.3 });
  const parsed = parseDeckPayload(raw);
  // 内部バリデーション（3層）:
  //   1. 役職語・職業語のword → filterCharacterCards
  //   2. 一般概念語・周辺語のword → filterGenericConceptCards
  //   3. 職種説明のみの定義文 → filterJobDescriptionCards
  const rawCards = parsed.cards || [];
  const afterRoleFilter = filterCharacterCards(rawCards, topic);
  const afterConceptFilter = filterGenericConceptCards(afterRoleFilter, topic);
  const internalFiltered = filterJobDescriptionCards(afterConceptFilter, topic);

  // 外部照合ゲート: キャラクタートピックかつ候補が残っている場合のみ実行
  let finalCards = internalFiltered;
  if (isCharacterTopic(topic) && internalFiltered.length > 0) {
    const workTitle = extractWorkTitle(topic) || topic;
    const callLLM = _callVerifyLLM ?? getVerificationLLM();
    finalCards = await verifyCharacterCards(internalFiltered, workTitle, { callLLM });
  }

  // 不正カード比率チェック: raw枚数基準で最終残存が少なすぎたら無効デッキ
  checkCharacterDeckRatio(rawCards.length, finalCards.length, topic);

  return {
    deckName: String(parsed.deckName || "").trim() || "AI生成単語帳",
    tags: Array.isArray(parsed.tags) ? parsed.tags.filter(Boolean).slice(0, 10) : [],
    cards: sanitizeCards(finalCards, 5, 15),
  };
}

async function generateContinuationCards({ topic, wordLang, defLang, detailLevel, existingWords, _callVerifyLLM, _callGenerateLLM }) {
  const prompt = buildContinuationPrompt({ topic, wordLang, defLang, detailLevel, existingWords });
  const generateLLM = _callGenerateLLM ?? getDeckGenerationLLM();
  const raw = await generateLLM({ prompt, maxTokens: 2500, systemPrompt: DECK_SYSTEM_PROMPT, temperature: 0.3 });
  const parsed = parseDeckPayload(raw);
  const rawCards = parsed.cards || [];
  const afterRoleFilter = filterCharacterCards(rawCards, topic);
  const afterConceptFilter = filterGenericConceptCards(afterRoleFilter, topic);
  const internalFiltered = filterJobDescriptionCards(afterConceptFilter, topic);

  let finalCards = internalFiltered;
  if (isCharacterTopic(topic) && internalFiltered.length > 0) {
    const workTitle = extractWorkTitle(topic) || topic;
    const callLLM = _callVerifyLLM ?? getVerificationLLM();
    finalCards = await verifyCharacterCards(internalFiltered, workTitle, { callLLM });
  }

  checkCharacterDeckRatio(rawCards.length, finalCards.length, topic);
  return sanitizeCards(finalCards, 3, 10, existingWords);
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
    return res.status(status).json({ error: message, remainingCredits: status === 429 ? 0 : undefined });
  }
}

// テスト用export
export {
  parseDeckPayload,
  sanitizeCards,
  buildInitialPrompt,
  buildContinuationPrompt,
  stripWordFromDefinition,
  DECK_SYSTEM_PROMPT,
  isCharacterTopic,
  extractWorkTitle,
  isGenericRoleWord,
  filterCharacterCards,
  buildCharacterDefinitionInstruction,
  isJobDescriptionDefinition,
  filterJobDescriptionCards,
  isGenericConceptWord,
  filterGenericConceptCards,
  checkCharacterDeckRatio,
  verifyCharacterCards,
  buildVerificationPrompt,
  VERIFICATION_SYSTEM_PROMPT,
  getDeckGenerationLLM,
  getVerificationLLM,
};

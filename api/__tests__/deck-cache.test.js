import { describe, it, expect } from "vitest";
import {
  parseDeckPayload,
  sanitizeCards,
  buildInitialPrompt,
  buildContinuationPrompt,
  stripWordFromDefinition,
  DECK_SYSTEM_PROMPT,
} from "../deck-cache.js";

// ====================================================================
// parseDeckPayload
// ====================================================================
describe("parseDeckPayload", () => {
  it("通常のJSONをパースできる", () => {
    const raw = '{"deckName":"テスト","cards":[{"word":"A","definition":"B"}]}';
    const result = parseDeckPayload(raw);
    expect(result.deckName).toBe("テスト");
    expect(result.cards).toHaveLength(1);
  });

  it("コードフェンス付きJSONをパースできる", () => {
    const raw = '```json\n{"deckName":"テスト","cards":[]}\n```';
    const result = parseDeckPayload(raw);
    expect(result.deckName).toBe("テスト");
  });

  it("<think>ブロックを除去してパースできる", () => {
    const raw = '<think>考え中...</think>{"deckName":"OK","cards":[]}';
    const result = parseDeckPayload(raw);
    expect(result.deckName).toBe("OK");
  });

  it("JSON前後に余分なテキストがあってもパースできる", () => {
    const raw = 'Here is the result:\n{"deckName":"OK","cards":[]}\nDone!';
    const result = parseDeckPayload(raw);
    expect(result.deckName).toBe("OK");
  });

  it("不正なJSONはエラーを投げる", () => {
    expect(() => parseDeckPayload("not json at all")).toThrow();
  });
});

// ====================================================================
// stripWordFromDefinition
// ====================================================================
describe("stripWordFromDefinition", () => {
  it("「単語とは〜」パターンを除去する", () => {
    expect(stripWordFromDefinition("CPU", "CPUとは中央処理装置のこと。")).toBe("中央処理装置のこと。");
  });

  it("「単語は〜」パターンを除去する", () => {
    expect(stripWordFromDefinition("ちいかわ", "ちいかわは日本のキャラクター。")).toBe("日本のキャラクター。");
  });

  it("単語が含まれない定義はそのまま返す", () => {
    expect(stripWordFromDefinition("API", "アプリケーション間の通信手段。")).toBe("アプリケーション間の通信手段。");
  });

  it("wordが空でもクラッシュしない", () => {
    expect(stripWordFromDefinition("", "テスト")).toBe("テスト");
    expect(stripWordFromDefinition(null, "テスト")).toBe("テスト");
  });
});

// ====================================================================
// sanitizeCards
// ====================================================================
describe("sanitizeCards", () => {
  const makeCards = (n) =>
    Array.from({ length: n }, (_, i) => ({
      word: `word${i}`,
      definition: `def${i}`,
    }));

  it("正常なカード配列をそのまま通す", () => {
    const cards = makeCards(10);
    const result = sanitizeCards(cards, 5, 15);
    expect(result).toHaveLength(10);
  });

  it("最低枚数5未満でエラーを投げる", () => {
    const cards = makeCards(3);
    expect(() => sanitizeCards(cards, 5, 15)).toThrow("AI returned an invalid deck.");
  });

  it("最低枚数5以上ならエラーにならない（緩和確認）", () => {
    const cards = makeCards(5);
    expect(() => sanitizeCards(cards, 5, 15)).not.toThrow();
  });

  it("重複カードを除去する", () => {
    const cards = [
      { word: "ちいかわ", definition: "定義1" },
      { word: "ちいかわ", definition: "定義2" },
      { word: "ハチワレ", definition: "定義3" },
    ];
    const result = sanitizeCards(cards, 1, 15);
    expect(result).toHaveLength(2);
  });

  it("excludedWordsに含まれるカードを除外する", () => {
    const cards = [
      { word: "ちいかわ", definition: "定義1" },
      { word: "ハチワレ", definition: "定義2" },
    ];
    const result = sanitizeCards(cards, 1, 15, ["ちいかわ"]);
    expect(result).toHaveLength(1);
    expect(result[0].word).toBe("ハチワレ");
  });

  it("maxCardsを超えるカードは切り捨てる", () => {
    const cards = makeCards(20);
    const result = sanitizeCards(cards, 5, 15);
    expect(result).toHaveLength(15);
  });

  it("wordやdefinitionが空のカードを除外する", () => {
    const cards = [
      { word: "", definition: "定義" },
      { word: "単語", definition: "" },
      { word: "OK", definition: "OK定義" },
    ];
    const result = sanitizeCards(cards, 1, 15);
    expect(result).toHaveLength(1);
    expect(result[0].word).toBe("OK");
  });

  it("定義冒頭の単語名を除去する（stripWordFromDefinition連携）", () => {
    const cards = [
      { word: "ちいかわ", definition: "ちいかわは小さくてかわいいキャラクター。" },
    ];
    const result = sanitizeCards(cards, 1, 15);
    expect(result[0].definition).toBe("小さくてかわいいキャラクター。");
  });
});

// ====================================================================
// buildInitialPrompt — プロンプト内容の検証
// ====================================================================
describe("buildInitialPrompt", () => {
  const defaultArgs = {
    topic: "ちいかわのキャラクター",
    wordLang: "technical",
    defLang: "ja",
    detailLevel: 2,
    mustIncludeWords: "",
  };

  it("テーマがプロンプトに含まれる", () => {
    const prompt = buildInitialPrompt(defaultArgs);
    expect(prompt).toContain("ちいかわのキャラクター");
  });

  it("「accuracy comes first」が含まれる（正確さ優先の指示）", () => {
    const prompt = buildInitialPrompt(defaultArgs);
    expect(prompt).toContain("accuracy comes first");
  });

  it("キャラクター名列挙を促す指示が含まれる", () => {
    const prompt = buildInitialPrompt(defaultArgs);
    expect(prompt).toContain("character names");
  });

  it("一般語を除外する指示が含まれる", () => {
    const prompt = buildInitialPrompt(defaultArgs);
    expect(prompt).toContain("merchandise");
    expect(prompt).toContain("fan art");
    expect(prompt).toContain("Do NOT include generic peripheral");
  });

  it("旧プロンプトの「dictionary or glossary」が含まれない", () => {
    const prompt = buildInitialPrompt(defaultArgs);
    expect(prompt).not.toContain("dictionary or glossary");
  });

  it("旧プロンプトの「Never return fewer than 10」が含まれない（最低枚数強制の除去）", () => {
    const prompt = buildInitialPrompt(defaultArgs);
    expect(prompt).not.toContain("Never return fewer than 10");
  });

  it("mustIncludeWordsが指定されたらプロンプトに含まれる", () => {
    const prompt = buildInitialPrompt({ ...defaultArgs, mustIncludeWords: "ハチワレ, うさぎ" });
    expect(prompt).toContain("ハチワレ, うさぎ");
    expect(prompt).toContain("MUST include");
  });

  it("定義に単語を含めない指示が含まれる", () => {
    const prompt = buildInitialPrompt(defaultArgs);
    expect(prompt).toContain("definition must NEVER start with");
  });
});

// ====================================================================
// buildContinuationPrompt
// ====================================================================
describe("buildContinuationPrompt", () => {
  it("既存単語リストが含まれる", () => {
    const prompt = buildContinuationPrompt({
      topic: "ちいかわのキャラクター",
      wordLang: "technical",
      defLang: "ja",
      detailLevel: 2,
      existingWords: ["ちいかわ", "ハチワレ"],
    });
    expect(prompt).toContain("ちいかわ, ハチワレ");
  });

  it("正確さ優先の指示が含まれる", () => {
    const prompt = buildContinuationPrompt({
      topic: "テスト",
      wordLang: "technical",
      defLang: "ja",
      detailLevel: 2,
      existingWords: [],
    });
    expect(prompt).toContain("accuracy comes first");
  });

  it("一般語を除外する指示が含まれる", () => {
    const prompt = buildContinuationPrompt({
      topic: "テスト",
      wordLang: "technical",
      defLang: "ja",
      detailLevel: 2,
      existingWords: [],
    });
    expect(prompt).toContain("no generic peripheral");
  });
});

// ====================================================================
// DECK_SYSTEM_PROMPT — system promptの内容検証
// ====================================================================
describe("DECK_SYSTEM_PROMPT", () => {
  it("ハルシネーション禁止の指示が含まれる", () => {
    expect(DECK_SYSTEM_PROMPT).toContain("NEVER invent or fabricate");
  });

  it("一般語除外の指示が含まれる", () => {
    expect(DECK_SYSTEM_PROMPT).toContain("Do NOT include generic/peripheral");
  });

  it("正確さ優先の指示が含まれる", () => {
    expect(DECK_SYSTEM_PROMPT).toContain("Accuracy is more important than quantity");
  });
});

// ====================================================================
// シミュレーション: 「ちいかわのキャラクター」で不正な応答が返った場合
// ====================================================================
describe("不正なAI応答のシミュレーション", () => {
  // 修正前に実際に返ってきたような不正応答を再現
  const badAiResponse = JSON.stringify({
    deckName: "ちいかわのキャラクター",
    tags: ["#アニメ", "#キャラクター"],
    cards: [
      { word: "ちいかわ", definition: "ちいかわは日本のキャラクターです。" },
      { word: "ハチワレ", definition: "ハチワレはちいかわの友人。" },
      { word: "うさぎ", definition: "うさぎはちいかわの仲間。" },
      { word: "モモンガ", definition: "小さな体のキャラクター。" },
      { word: "くりまんじゅう", definition: "栗の形をしたキャラクター。" },
      // 以下、問題のあるカード
      { word: "コラボレーション", definition: "他ブランドとの共同制作。" },
      { word: "ファンアート", definition: "ファンが描いたイラスト。" },
      { word: "キャラクターグッズ", definition: "キャラクターを使った商品。" },
      { word: "日本のポップカルチャー", definition: "日本の大衆文化。" },
      { word: "ももちゃん", definition: "ピンク色のキャラクター。" },
    ],
  });

  it("parseDeckPayloadは不正応答もパースできてしまう（パーサの責任ではないことの確認）", () => {
    const parsed = parseDeckPayload(badAiResponse);
    expect(parsed.cards).toHaveLength(10);
  });

  it("sanitizeCardsは構造的に正しければ不正カードも通過させる（バリデーション限界の確認）", () => {
    const parsed = parseDeckPayload(badAiResponse);
    // minCards=5に緩和されたので5枚でもOK
    const result = sanitizeCards(parsed.cards, 5, 15);
    // 「コラボレーション」等の一般語もsanitizeCardsレベルでは除外できない
    const words = result.map((c) => c.word);
    expect(words).toContain("コラボレーション");
    // → これはプロンプト改善で防ぐべき問題であり、sanitizeCardsの責任範囲外
  });

  it("stripWordFromDefinitionが定義冒頭の単語名を除去する", () => {
    const parsed = parseDeckPayload(badAiResponse);
    const result = sanitizeCards(parsed.cards, 5, 15);
    const chiikawa = result.find((c) => c.word === "ちいかわ");
    // 「ちいかわは日本のキャラクターです。」→「日本のキャラクターです。」
    expect(chiikawa.definition).not.toMatch(/^ちいかわ/);
  });
});

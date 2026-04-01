import { describe, it, expect, afterEach } from "vitest";
import {
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
    expect(() => sanitizeCards(cards, 5, 15)).toThrow("AIが有効な単語帳を生成できませんでした。もう一度お試しください。");
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

  it("「条件を満たすものだけ出す」という指示が含まれる（旧: accuracy comes first）", () => {
    const prompt = buildInitialPrompt(defaultArgs);
    expect(prompt).toContain("GOAL: Output ONLY items that genuinely satisfy");
  });

  it("キャラクター名テーマでは固有名詞のみを求める指示が含まれる", () => {
    // ちいかわのキャラクター → isCharacterTopic=true → PROPER NAME 指示が入る
    const prompt = buildInitialPrompt(defaultArgs);
    expect(prompt).toContain("PROPER NAME");
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

  it("「条件を満たすものだけ追加する」指示が含まれる（旧: accuracy comes first）", () => {
    const prompt = buildContinuationPrompt({
      topic: "テスト",
      wordLang: "technical",
      defLang: "ja",
      detailLevel: 2,
      existingWords: [],
    });
    expect(prompt).toContain("GOAL: Output ONLY additional items that genuinely belong");
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

  it("「件数埋め禁止」の指示が含まれる（旧: Accuracy is more important than quantity）", () => {
    expect(DECK_SYSTEM_PROMPT).toContain("YOUR GOAL IS NOT TO FILL A COUNT");
  });
});

// ====================================================================
// DECK_SYSTEM_PROMPT — 件数埋め禁止フレーミングの検証
// ====================================================================
describe("DECK_SYSTEM_PROMPT (件数埋め禁止)", () => {
  it("「件数を埋めるな」という指示が含まれる", () => {
    expect(DECK_SYSTEM_PROMPT).toContain("YOUR GOAL IS NOT TO FILL A COUNT");
  });

  it("「3件でも返してよい」という指示が含まれる", () => {
    expect(DECK_SYSTEM_PROMPT).toContain("return 3");
  });

  it("「リストを水増しするな」という指示が含まれる", () => {
    expect(DECK_SYSTEM_PROMPT).toContain("Never invent or guess items to pad the list");
  });

  it("定義文が職種のみになるパターンを禁止する指示が含まれる", () => {
    expect(DECK_SYSTEM_PROMPT).toContain("not the item's occupation alone");
  });
});

// ====================================================================
// buildInitialPrompt — 「条件を満たすものだけ出す」仕様の検証
// ====================================================================
describe("buildInitialPrompt (条件該当のみ出力仕様)", () => {
  const args = {
    topic: "ハズビンホテルのキャラクター",
    wordLang: "technical",
    defLang: "ja",
    detailLevel: 2,
    mustIncludeWords: "",
  };

  it("「件数目標ではなく条件を満たすものだけ出す」という指示が含まれる", () => {
    const prompt = buildInitialPrompt(args);
    expect(prompt).toContain("GOAL: Output ONLY items that genuinely satisfy");
  });

  it("「10件未満でもよい」と明示する指示が含まれる", () => {
    const prompt = buildInitialPrompt(args);
    expect(prompt).toContain("even if that is fewer than 10");
  });

  it("「3件の方が10件より良い」という指示が含まれる", () => {
    const prompt = buildInitialPrompt(args);
    expect(prompt).toContain("3 correct cards is better than 10 guessed cards");
  });

  it("通常テーマでも「条件該当のみ」指示が含まれる", () => {
    const prompt = buildInitialPrompt({ ...args, topic: "量子力学の基礎" });
    expect(prompt).toContain("GOAL: Output ONLY items");
  });
});

// ====================================================================
// buildContinuationPrompt — 同仕様の検証
// ====================================================================
describe("buildContinuationPrompt (条件該当のみ出力仕様)", () => {
  const args = {
    topic: "ハズビンホテルのキャラクター",
    wordLang: "technical",
    defLang: "ja",
    detailLevel: 2,
    existingWords: ["ハスク", "アラスター"],
  };

  it("「条件を満たすものだけ追加する」指示が含まれる", () => {
    const prompt = buildContinuationPrompt(args);
    expect(prompt).toContain("GOAL: Output ONLY additional items that genuinely belong");
  });

  it("「件数に達するために創作するな」という指示が含まれる", () => {
    const prompt = buildContinuationPrompt(args);
    expect(prompt).toContain("Never guess or fabricate");
  });
});

// ====================================================================
// buildCharacterDefinitionInstruction — キャラクター用定義テンプレート
// ====================================================================
describe("buildCharacterDefinitionInstruction", () => {
  it("Level 1: キャラクターの個性・外見・役割を求める指示が含まれる", () => {
    const inst = buildCharacterDefinitionInstruction(1);
    expect(inst).toContain("personality");
    expect(inst).toContain("appearance");
  });

  it("Level 2: 2-3文でキャラクターを説明する指示が含まれる", () => {
    const inst = buildCharacterDefinitionInstruction(2);
    expect(inst).toContain("2-3 sentences");
    expect(inst).toContain("relationships");
  });

  it("Level 3: 詳細な説明を求める指示が含まれる", () => {
    const inst = buildCharacterDefinitionInstruction(3);
    expect(inst).toContain("story arc");
  });

  it("「職種だけの説明は禁止」という指示が含まれる", () => {
    const inst = buildCharacterDefinitionInstruction(2);
    expect(inst).toContain("only states the character's job or occupation");
    expect(inst).toContain("is WRONG");
  });

  it("buildInitialPromptのキャラクターテーマにはこの指示が使われる", () => {
    const prompt = buildInitialPrompt({
      topic: "ハズビンホテルのキャラクター",
      wordLang: "technical",
      defLang: "ja",
      detailLevel: 2,
      mustIncludeWords: "",
    });
    // 通常の detailInstructions の文言が含まれていないことを確認
    expect(prompt).not.toContain("Each definition should be 2-3 sentences.");
    // キャラクター用の指示が含まれていることを確認
    expect(prompt).toContain("personality");
    expect(prompt).toContain("is WRONG");
  });

  it("通常テーマでは通常のdetailInstructionsが使われる（キャラクター用ではない）", () => {
    const prompt = buildInitialPrompt({
      topic: "量子力学の基礎",
      wordLang: "technical",
      defLang: "ja",
      detailLevel: 2,
      mustIncludeWords: "",
    });
    expect(prompt).toContain("Each definition should be 2-3 sentences.");
    expect(prompt).not.toContain("is WRONG");
  });
});

// ====================================================================
// isJobDescriptionDefinition — 職種説明のみの定義を検出
// ====================================================================
describe("isJobDescriptionDefinition", () => {
  // 今回の不具合で実際に出た定義文（「○○はホテルのスタッフです」パターン）
  it("「ホテルの運営を管理する役職」を異常として検出する", () => {
    expect(isJobDescriptionDefinition("ホテルの運営を管理する役職。")).toBe(true);
  });

  it("「ホテルのフロントで接客する従業員です」を異常として検出する", () => {
    expect(isJobDescriptionDefinition("ホテルのフロントで接客する従業員です。")).toBe(true);
  });

  it("「客室の清掃を担当するスタッフです」を異常として検出する", () => {
    expect(isJobDescriptionDefinition("客室の清掃を担当するスタッフです。")).toBe(true);
  });

  it("短い定義で役職語を含む場合は異常として検出する（40文字未満）", () => {
    expect(isJobDescriptionDefinition("ホテルのスタッフです。")).toBe(true);
    expect(isJobDescriptionDefinition("バーのウェイターです。")).toBe(true);
  });

  it("英語の職種説明パターンを検出する", () => {
    expect(isJobDescriptionDefinition("is a staff member at the hotel.")).toBe(true);
    expect(isJobDescriptionDefinition("works as a receptionist.")).toBe(true);
  });

  // 正常なキャラクター説明（誤って弾いてはいけない例）
  it("「バーテンダーを務める元天使」は異常として検出しない（キャラ情報あり）", () => {
    expect(isJobDescriptionDefinition("バーテンダーを務める元天使。過去に高い地位を持っていた悪魔。")).toBe(false);
  });

  it("「ラジオデーモンとして知られる強力な悪魔」は異常として検出しない", () => {
    expect(isJobDescriptionDefinition("ラジオデーモンとして知られる強力な悪魔。カリスマ的な性格と謎めいた過去を持つ。")).toBe(false);
  });

  it("「ホテルを創設した地獄の王女」は異常として検出しない", () => {
    expect(isJobDescriptionDefinition("ホテルを創設した地獄の王女。明るく前向きな性格で、罪人の更生を信じている。")).toBe(false);
  });

  it("空文字・nullはfalseを返す", () => {
    expect(isJobDescriptionDefinition("")).toBe(false);
    expect(isJobDescriptionDefinition(null)).toBe(false);
  });
});

// ====================================================================
// filterJobDescriptionCards — 職種説明定義カードの除去
// ====================================================================
describe("filterJobDescriptionCards", () => {
  const mixed = [
    // 正常: キャラクター情報あり
    { word: "ハスク", definition: "バーテンダーを務める元天使。過去に高い地位を持っていた。" },
    { word: "アラスター", definition: "ラジオデーモンとして知られる強力な悪魔。" },
    { word: "チャーリー", definition: "ホテルを創設した地獄の王女。明るく前向きな性格。" },
    // 異常: 職種説明のみ（架空名+職種説明の組合せ）
    { word: "バツ", definition: "ホテルのスタッフです。" },
    { word: "ノーム", definition: "客室の清掃を担当するスタッフです。" },
  ];

  it("キャラクタートピックのとき職種説明のみの定義を除去する", () => {
    const result = filterJobDescriptionCards(mixed, "ハズビンホテルのキャラクター");
    const words = result.map((c) => c.word);
    expect(words).toContain("ハスク");
    expect(words).toContain("アラスター");
    expect(words).toContain("チャーリー");
    expect(words).not.toContain("バツ");
    expect(words).not.toContain("ノーム");
  });

  it("キャラクタートピックでない場合は職種説明も通過する", () => {
    const hotelTerms = [
      { word: "フロントデスク", definition: "ホテルのフロントで接客する従業員です。" },
    ];
    const result = filterJobDescriptionCards(hotelTerms, "ホテルの接客用語");
    expect(result).toHaveLength(1); // 除去されない
  });

  it("wordの役職語フィルタとdefinitionの職種説明フィルタは独立して機能する", () => {
    // word が役職語でない + definition が職種説明 → filterJobDescriptionCards が除去する
    const badDef = [{ word: "キャラA", definition: "ホテルのスタッフです。" }];
    const afterRole = filterCharacterCards(badDef, "ハズビンホテルのキャラクター");
    expect(afterRole).toHaveLength(1); // filterCharacterCardsは除去しない
    const afterJob = filterJobDescriptionCards(afterRole, "ハズビンホテルのキャラクター");
    expect(afterJob).toHaveLength(0); // filterJobDescriptionCardsが除去する
  });
});

// ====================================================================
// 統合テスト: 役職語フィルタ → 職種説明フィルタ → sanitizeCards のチェーン
// ====================================================================
describe("フィルタチェーン統合テスト", () => {
  it("ハズビンホテル不具合再現: 両フィルタ適用後の残存件数が正しい", () => {
    const badResponse = [
      // 正常 (3枚)
      { word: "ハスク", definition: "バーテンダーを務める元天使。独自の魔法カードを使う。" },
      { word: "アラスター", definition: "ラジオデーモンとして知られる強力な悪魔。独特の笑顔が特徴。" },
      { word: "チャーリー", definition: "ホテルを創設した地獄の王女。罪人の更生を本気で信じている。" },
      // 役職語word (3枚) → filterCharacterCards が除去
      { word: "ホテルマネージャー", definition: "ホテルの経営を担当。" },
      { word: "フロントスタッフ", definition: "受付係として来客対応。" },
      { word: "メイド", definition: "客室の清掃担当。" },
      // 架空名 + 職種説明定義 (2枚) → filterJobDescriptionCards が除去
      { word: "バツ", definition: "ホテルのスタッフです。" },
      { word: "ノーム", definition: "チャーリーのホテルの従業員です。" },
    ];

    const topic = "ハズビンホテルのキャラクター";
    const step1 = filterCharacterCards(badResponse, topic);
    expect(step1).toHaveLength(5); // 役職語word 3枚除去

    const step2 = filterJobDescriptionCards(step1, topic);
    expect(step2).toHaveLength(3); // 職種説明定義 2枚除去

    // 最終的に5枚未満 → sanitizeCards(min=5) はエラー
    expect(() => sanitizeCards(step2, 5, 15)).toThrow("AIが有効な単語帳を生成できませんでした。もう一度お試しください。");
    // min=3 にすれば通過
    expect(() => sanitizeCards(step2, 3, 15)).not.toThrow();
  });
});

// ====================================================================
// isCharacterTopic — キャラクタートピック判定
// ====================================================================
describe("isCharacterTopic", () => {
  it("「のキャラクター」を含むテーマを検出する", () => {
    expect(isCharacterTopic("ハズビンホテルのキャラクター")).toBe(true);
    expect(isCharacterTopic("ちいかわのキャラクター")).toBe(true);
  });

  it("「の登場人物」を含むテーマを検出する", () => {
    expect(isCharacterTopic("進撃の巨人の登場人物")).toBe(true);
  });

  it("「のキャスト」「のメンバー」「の人物」も検出する", () => {
    expect(isCharacterTopic("進撃の巨人のキャスト")).toBe(true);
    expect(isCharacterTopic("BTSのメンバー")).toBe(true);
    expect(isCharacterTopic("歴史上の人物")).toBe(true);
  });

  it("キャラクター系でないテーマは検出しない", () => {
    expect(isCharacterTopic("量子力学の基礎")).toBe(false);
    expect(isCharacterTopic("ホテルのサービス用語")).toBe(false);
    expect(isCharacterTopic("経済学の応用")).toBe(false);
  });
});

// ====================================================================
// extractWorkTitle — 作品タイトル抽出
// ====================================================================
describe("extractWorkTitle", () => {
  it("「XのキャラクターY」→「X」を抽出する", () => {
    expect(extractWorkTitle("ハズビンホテルのキャラクター")).toBe("ハズビンホテル");
    expect(extractWorkTitle("ちいかわのキャラクター")).toBe("ちいかわ");
    expect(extractWorkTitle("SPY×FAMILYの登場人物")).toBe("SPY×FAMILY");
  });

  it("キャラクター系でない場合はnullを返す", () => {
    expect(extractWorkTitle("量子力学の基礎")).toBeNull();
  });
});

// ====================================================================
// isGenericRoleWord — 役職語・職業語の検出
// ====================================================================
describe("isGenericRoleWord", () => {
  // 今回の不具合で実際に出た語
  it("「ホテルマネージャー」を役職語として検出する", () => {
    expect(isGenericRoleWord("ホテルマネージャー")).toBe(true);
  });

  it("「フロントスタッフ」を役職語として検出する", () => {
    expect(isGenericRoleWord("フロントスタッフ")).toBe(true);
  });

  it("「メイド」を役職語として検出する", () => {
    expect(isGenericRoleWord("メイド")).toBe(true);
  });

  it("その他の役職語を検出する", () => {
    expect(isGenericRoleWord("支配人")).toBe(true);
    expect(isGenericRoleWord("ウェイター")).toBe(true);
    expect(isGenericRoleWord("受付係")).toBe(true);
    expect(isGenericRoleWord("manager")).toBe(true);
    expect(isGenericRoleWord("receptionist")).toBe(true);
    expect(isGenericRoleWord("hotel staff")).toBe(true);
  });

  it("実在するキャラクター名は役職語と判定しない", () => {
    expect(isGenericRoleWord("ハスク")).toBe(false);
    expect(isGenericRoleWord("アラスター")).toBe(false);
    expect(isGenericRoleWord("チャーリー")).toBe(false);
    expect(isGenericRoleWord("ちいかわ")).toBe(false);
    expect(isGenericRoleWord("ハチワレ")).toBe(false);
  });
});

// ====================================================================
// filterCharacterCards — 役職語カードの除去
// ====================================================================
describe("filterCharacterCards", () => {
  const hazbinBadResponse = [
    { word: "ハスク", definition: "バーテンダーを務める元天使。" },
    { word: "アラスター", definition: "ラジオデーモンと呼ばれる強力な悪魔。" },
    { word: "チャーリー", definition: "ハズビンホテルの創設者。" },
    // 今回の不具合で実際に出た語
    { word: "ホテルマネージャー", definition: "ホテルの運営を管理する役職。" },
    { word: "フロントスタッフ", definition: "ホテルのフロントで接客する従業員。" },
    { word: "メイド", definition: "客室の清掃を担当するスタッフ。" },
  ];

  it("キャラクタートピックのとき役職語カードを除去する", () => {
    const result = filterCharacterCards(hazbinBadResponse, "ハズビンホテルのキャラクター");
    const words = result.map((c) => c.word);
    expect(words).toContain("ハスク");
    expect(words).toContain("アラスター");
    expect(words).toContain("チャーリー");
    expect(words).not.toContain("ホテルマネージャー");
    expect(words).not.toContain("フロントスタッフ");
    expect(words).not.toContain("メイド");
  });

  it("キャラクタートピックでないときは何も除去しない", () => {
    const hotelTerms = [
      { word: "メイド", definition: "清掃スタッフ。" },
      { word: "コンシェルジュ", definition: "案内担当。" },
    ];
    const result = filterCharacterCards(hotelTerms, "ホテルの接客用語");
    expect(result).toHaveLength(2); // 除去されない
  });

  it("役職語が多くてsanitizeCards最低枚数を下回った場合はエラーになる", () => {
    // 役職語ばかりのひどい応答（有効カードが3枚未満）
    const allBadCards = [
      { word: "ホテルマネージャー", definition: "管理者。" },
      { word: "フロントスタッフ", definition: "受付担当。" },
      { word: "メイド", definition: "清掃担当。" },
      { word: "ウェイター", definition: "給仕担当。" },
    ];
    const filtered = filterCharacterCards(allBadCards, "ハズビンホテルのキャラクター");
    expect(filtered).toHaveLength(0);
    // sanitizeCards(filtered, 3, 15) がエラーを投げることを確認
    expect(() => sanitizeCards(filtered, 3, 15)).toThrow("AIが有効な単語帳を生成できませんでした。もう一度お試しください。");
  });
});

// ====================================================================
// buildInitialPrompt — ハズビンホテル系テーマの指示検証
// ====================================================================
describe("buildInitialPrompt (キャラクタートピック強化)", () => {
  const hazbinArgs = {
    topic: "ハズビンホテルのキャラクター",
    wordLang: "technical",
    defLang: "ja",
    detailLevel: 2,
    mustIncludeWords: "",
  };

  it("作品タイトル「ハズビンホテル」がフィクション作品であることを明示する指示が含まれる", () => {
    const prompt = buildInitialPrompt(hazbinArgs);
    expect(prompt).toContain("ハズビンホテル");
    expect(prompt).toContain("fictional work");
  });

  it("「実在の場所・施設ではない」という指示が含まれる", () => {
    const prompt = buildInitialPrompt(hazbinArgs);
    expect(prompt).toContain("NOT a real-world place");
  });

  it("固有名詞（proper name）のみ出力する指示が含まれる", () => {
    const prompt = buildInitialPrompt(hazbinArgs);
    expect(prompt).toContain("PROPER NAME");
  });

  it("職業語・役職語を禁止する指示が含まれる", () => {
    const prompt = buildInitialPrompt(hazbinArgs);
    expect(prompt).toContain("STRICTLY FORBIDDEN");
    expect(prompt).toContain("job titles");
    expect(prompt).toContain("maid");
    expect(prompt).toContain("receptionist");
  });

  it("不明なキャラクターを作らない指示が含まれる", () => {
    const prompt = buildInitialPrompt(hazbinArgs);
    expect(prompt).toContain("OMIT it entirely");
    expect(prompt).toContain("Do NOT invent or guess names");
  });

  it("通常テーマ（非キャラクター）ではcharacterTopicInstructionが含まれない", () => {
    const prompt = buildInitialPrompt({
      ...hazbinArgs,
      topic: "量子力学の基礎",
    });
    expect(prompt).not.toContain("fictional work");
    expect(prompt).not.toContain("STRICTLY FORBIDDEN");
  });
});

// ====================================================================
// シミュレーション: 「ハズビンホテルのキャラクター」で不正な応答が返った場合
// ====================================================================
describe("不正なAI応答のシミュレーション (ハズビンホテル)", () => {
  const hazbinBadResponse = JSON.stringify({
    deckName: "ハズビンホテルのキャラクター",
    tags: ["#アニメ", "#キャラクター"],
    cards: [
      // 実在するキャラクター
      { word: "ハスク", definition: "バーテンダーを務める元天使。過去に高い地位を持っていた。" },
      { word: "アラスター", definition: "ラジオデーモンとして知られる強力な悪魔。" },
      { word: "チャーリー", definition: "ホテルを創設した地獄の王女。" },
      // 架空名（ハルシネーション）
      { word: "バツ", definition: "ホテルのバーテンダー。" },
      { word: "ノーム", definition: "チャーリーの幼馴染。" },
      // 一般語
      { word: "ホテルマネージャー", definition: "ホテルの経営を担当。" },
      { word: "フロントスタッフ", definition: "受付係として来客対応。" },
      { word: "メイド", definition: "客室の清掃担当。" },
    ],
  });

  it("filterCharacterCardsが役職語3枚を除去する", () => {
    const parsed = parseDeckPayload(hazbinBadResponse);
    const filtered = filterCharacterCards(parsed.cards, "ハズビンホテルのキャラクター");
    const words = filtered.map((c) => c.word);
    expect(words).not.toContain("ホテルマネージャー");
    expect(words).not.toContain("フロントスタッフ");
    expect(words).not.toContain("メイド");
    expect(filtered).toHaveLength(5); // 8枚 - 役職語3枚 = 5枚
  });

  it("filterCharacterCards後にsanitizeCardsが正常に通過する（5枚以上）", () => {
    const parsed = parseDeckPayload(hazbinBadResponse);
    const filtered = filterCharacterCards(parsed.cards, "ハズビンホテルのキャラクター");
    expect(() => sanitizeCards(filtered, 5, 15)).not.toThrow();
  });

  it("定義に役職語が入っても定義文として許容される（word欄の役職語だけを弾く）", () => {
    const parsed = parseDeckPayload(hazbinBadResponse);
    const filtered = filterCharacterCards(parsed.cards, "ハズビンホテルのキャラクター");
    const husk = filtered.find((c) => c.word === "ハスク");
    // ハスクの定義文に「バーテンダー」が入っていてもwordがキャラ名なら通過
    expect(husk).toBeDefined();
  });
});

// ====================================================================
// isGenericConceptWord — 一般概念語・周辺語の検出
// ====================================================================
describe("isGenericConceptWord", () => {
  it("「コラボレーション」を一般語として検出する", () => {
    expect(isGenericConceptWord("コラボレーション")).toBe(true);
  });

  it("「ファンアート」を一般語として検出する", () => {
    expect(isGenericConceptWord("ファンアート")).toBe(true);
  });

  it("「キャラクターグッズ」を一般語として検出する", () => {
    expect(isGenericConceptWord("キャラクターグッズ")).toBe(true);
  });

  it("「ポップカルチャー」を一般語として検出する", () => {
    expect(isGenericConceptWord("ポップカルチャー")).toBe(true);
  });

  it("「日本のポップカルチャー」を一般語として検出する", () => {
    expect(isGenericConceptWord("日本のポップカルチャー")).toBe(true);
  });

  it("「ファンダム」を一般語として検出する", () => {
    expect(isGenericConceptWord("ファンダム")).toBe(true);
  });

  it("英語の一般語を検出する", () => {
    expect(isGenericConceptWord("fan art")).toBe(true);
    expect(isGenericConceptWord("merchandise")).toBe(true);
    expect(isGenericConceptWord("collaboration")).toBe(true);
    expect(isGenericConceptWord("fandom")).toBe(true);
    expect(isGenericConceptWord("character goods")).toBe(true);
  });

  it("実在するキャラクター名は一般語と判定しない", () => {
    expect(isGenericConceptWord("ちいかわ")).toBe(false);
    expect(isGenericConceptWord("ハチワレ")).toBe(false);
    expect(isGenericConceptWord("うさぎ")).toBe(false);
    expect(isGenericConceptWord("ハスク")).toBe(false);
    expect(isGenericConceptWord("アラスター")).toBe(false);
  });

  it("通常の学習単語は一般語と判定しない", () => {
    expect(isGenericConceptWord("量子力学")).toBe(false);
    expect(isGenericConceptWord("CPU")).toBe(false);
    expect(isGenericConceptWord("マーケティング")).toBe(false);
  });
});

// ====================================================================
// filterGenericConceptCards — 一般概念語カードの除去
// ====================================================================
describe("filterGenericConceptCards", () => {
  const chiikawaWithGenericWords = [
    // 正常 (5枚)
    { word: "ちいかわ", definition: "小さくてかわいいキャラクター。臆病だが心優しい。" },
    { word: "ハチワレ", definition: "ちいかわの親友。ハチワレ模様の猫型キャラクター。" },
    { word: "うさぎ", definition: "うさぎ型の快活なキャラクター。謎が多い。" },
    { word: "くりまんじゅう", definition: "栗の形をしたかわいいキャラクター。" },
    { word: "モモンガ", definition: "もちふわのモモンガ型キャラクター。" },
    // 一般語 (5枚) → 除去対象
    { word: "コラボレーション", definition: "他ブランドとの共同制作。" },
    { word: "ファンアート", definition: "ファンが描いたイラスト。" },
    { word: "キャラクターグッズ", definition: "キャラクターを使った商品。" },
    { word: "日本のポップカルチャー", definition: "日本の大衆文化。" },
    { word: "ファンダム", definition: "熱狂的なファンのコミュニティ。" },
  ];

  it("キャラクタートピックのとき一般語カードを除去する", () => {
    const result = filterGenericConceptCards(chiikawaWithGenericWords, "ちいかわのキャラクター");
    const words = result.map((c) => c.word);
    expect(words).toContain("ちいかわ");
    expect(words).toContain("ハチワレ");
    expect(words).toContain("うさぎ");
    expect(words).not.toContain("コラボレーション");
    expect(words).not.toContain("ファンアート");
    expect(words).not.toContain("キャラクターグッズ");
    expect(words).not.toContain("日本のポップカルチャー");
    expect(words).not.toContain("ファンダム");
    expect(result).toHaveLength(5);
  });

  it("キャラクタートピックでない場合は一般語も通過する", () => {
    const popCultureTerms = [
      { word: "コラボレーション", definition: "共同制作のこと。" },
      { word: "ファンアート", definition: "ファンによる二次創作。" },
    ];
    const result = filterGenericConceptCards(popCultureTerms, "ポップカルチャー用語集");
    expect(result).toHaveLength(2); // 除去されない
  });
});

// ====================================================================
// checkCharacterDeckRatio — 不正カード比率チェック
// ====================================================================
describe("checkCharacterDeckRatio", () => {
  it("キャラクタートピックでrawCount>=6かつvalidRatio<0.4のとき例外を投げる", () => {
    // 10枚中3枚しか残らなかった場合 (30% < 40%)
    expect(() => checkCharacterDeckRatio(10, 3, "ちいかわのキャラクター")).toThrow("AIが有効な単語帳を生成できませんでした。もう一度お試しください。");
  });

  it("validRatioが0.4以上ならエラーにならない", () => {
    // 10枚中5枚 (50% >= 40%)
    expect(() => checkCharacterDeckRatio(10, 5, "ちいかわのキャラクター")).not.toThrow();
  });

  it("rawCount<6のときはチェックをスキップする", () => {
    // 5枚中0枚でもrawCount<6ならスキップ
    expect(() => checkCharacterDeckRatio(5, 0, "ちいかわのキャラクター")).not.toThrow();
  });

  it("キャラクタートピックでない場合はチェックをスキップする", () => {
    // 10枚中2枚でも通常テーマはスキップ
    expect(() => checkCharacterDeckRatio(10, 2, "量子力学の基礎")).not.toThrow();
  });

  it("rawCount=0のときはチェックをスキップする", () => {
    expect(() => checkCharacterDeckRatio(0, 0, "ちいかわのキャラクター")).not.toThrow();
  });
});

// ====================================================================
// buildContinuationPrompt — キャラクタートピック時の専用ルール
// ====================================================================
describe("buildContinuationPrompt (キャラクタートピック専用ルール)", () => {
  const hazbinArgs = {
    topic: "ハズビンホテルのキャラクター",
    wordLang: "technical",
    defLang: "ja",
    detailLevel: 2,
    existingWords: ["ハスク", "アラスター"],
  };

  it("キャラクタートピックのとき固有名詞のみを求める指示が含まれる", () => {
    const prompt = buildContinuationPrompt(hazbinArgs);
    expect(prompt).toContain("PROPER NAME");
  });

  it("キャラクタートピックのとき役職語を禁止する指示が含まれる", () => {
    const prompt = buildContinuationPrompt(hazbinArgs);
    expect(prompt).toContain("STRICTLY FORBIDDEN");
  });

  it("キャラクタートピックのとき不明な名前を出さない指示が含まれる", () => {
    const prompt = buildContinuationPrompt(hazbinArgs);
    expect(prompt).toContain("OMIT");
  });

  it("通常テーマではキャラクター専用ルールが含まれない", () => {
    const normalPrompt = buildContinuationPrompt({
      ...hazbinArgs,
      topic: "量子力学の基礎",
    });
    expect(normalPrompt).not.toContain("PROPER NAME");
  });
});

// ====================================================================
// buildInitialPrompt — 一般概念語の明示的禁止
// ====================================================================
describe("buildInitialPrompt (一般概念語の明示的禁止)", () => {
  it("キャラクタートピックで一般概念語を禁止する指示が含まれる", () => {
    const prompt = buildInitialPrompt({
      topic: "ちいかわのキャラクター",
      wordLang: "technical",
      defLang: "ja",
      detailLevel: 2,
      mustIncludeWords: "",
    });
    // 一般語禁止の言及が含まれること
    expect(prompt).toContain("general concepts");
    expect(prompt).toContain("merchandise");
  });

  it("通常テーマでは一般概念語禁止の指示がcharacterTopicInstructionから来ない", () => {
    const prompt = buildInitialPrompt({
      topic: "量子力学の基礎",
      wordLang: "technical",
      defLang: "ja",
      detailLevel: 2,
      mustIncludeWords: "",
    });
    // characterTopicInstruction が含まれないことの確認
    expect(prompt).not.toContain("fictional work");
  });
});

// ====================================================================
// 回帰テスト: 「ちいかわのキャラクター」 一般語混入パターン
// ====================================================================
describe("回帰テスト: ちいかわのキャラクター (一般語混入パターン)", () => {
  const badResponse = JSON.stringify({
    deckName: "ちいかわのキャラクター",
    tags: ["#アニメ", "#キャラクター"],
    cards: [
      // 正常 (5枚)
      { word: "ちいかわ", definition: "小さくてかわいいキャラクター。臆病だが心優しい。" },
      { word: "ハチワレ", definition: "ちいかわの親友。ハチワレ模様が特徴。" },
      { word: "うさぎ", definition: "快活なうさぎ型キャラクター。謎が多い。" },
      { word: "くりまんじゅう", definition: "栗の形のかわいいキャラクター。" },
      { word: "モモンガ", definition: "もちふわのモモンガ型キャラクター。" },
      // 一般語 (5枚) → 除去対象
      { word: "コラボレーション", definition: "他ブランドとの共同制作。" },
      { word: "ファンアート", definition: "ファンが描いたイラスト。" },
      { word: "キャラクターグッズ", definition: "キャラクターを使った商品。" },
      { word: "日本のポップカルチャー", definition: "日本の大衆文化。" },
      { word: "ファンダム", definition: "熱狂的なファンのコミュニティ。" },
    ],
  });

  it("filterGenericConceptCardsが一般語5枚を除去する", () => {
    const parsed = parseDeckPayload(badResponse);
    const afterRole = filterCharacterCards(parsed.cards, "ちいかわのキャラクター");
    const afterConcept = filterGenericConceptCards(afterRole, "ちいかわのキャラクター");
    const words = afterConcept.map((c) => c.word);
    expect(words).not.toContain("コラボレーション");
    expect(words).not.toContain("ファンアート");
    expect(words).not.toContain("キャラクターグッズ");
    expect(words).not.toContain("日本のポップカルチャー");
    expect(words).not.toContain("ファンダム");
    expect(afterConcept).toHaveLength(5);
  });

  it("フィルタ後に正常カードが残っておりsanitizeCardsを通過する", () => {
    const parsed = parseDeckPayload(badResponse);
    const afterRole = filterCharacterCards(parsed.cards, "ちいかわのキャラクター");
    const afterConcept = filterGenericConceptCards(afterRole, "ちいかわのキャラクター");
    const afterJob = filterJobDescriptionCards(afterConcept, "ちいかわのキャラクター");
    expect(() => sanitizeCards(afterJob, 5, 15)).not.toThrow();
    const result = sanitizeCards(afterJob, 5, 15);
    expect(result.map((c) => c.word)).toContain("ちいかわ");
    expect(result.map((c) => c.word)).toContain("ハチワレ");
  });

  it("checkCharacterDeckRatioが一般語過多のとき例外を投げる（rawCount=10, valid=3のケース）", () => {
    // raw=10枚のうち7枚がフィルタされた場合(valid=3, 30%<40%)
    expect(() => checkCharacterDeckRatio(10, 3, "ちいかわのキャラクター")).toThrow("AIが有効な単語帳を生成できませんでした。もう一度お試しください。");
  });
});

// ====================================================================
// 回帰テスト: 「ハズビンホテルのキャラクター」 全パターン統合
// ====================================================================
describe("回帰テスト: ハズビンホテルのキャラクター (役職語+一般語+職種説明の複合パターン)", () => {
  const badResponse = JSON.stringify({
    deckName: "ハズビンホテルのキャラクター",
    tags: ["#アニメ", "#キャラクター"],
    cards: [
      // 実在キャラ (3枚)
      { word: "ハスク", definition: "バーテンダーを務める元天使。過去に高い地位を持っていた悪魔。" },
      { word: "アラスター", definition: "ラジオデーモンとして知られる強力な悪魔。カリスマ的な笑顔が特徴。" },
      { word: "チャーリー", definition: "ホテルを創設した地獄の王女。明るく前向きな性格。" },
      // 役職語word (3枚) → filterCharacterCards
      { word: "ホテルマネージャー", definition: "ホテルの経営を担当する役職。" },
      { word: "フロントスタッフ", definition: "受付係として来客対応をする従業員。" },
      { word: "メイド", definition: "客室の清掃担当。" },
      // 架空名+職種説明 (2枚) → filterJobDescriptionCards
      { word: "バツ", definition: "ホテルのスタッフです。" },
      { word: "ノーム", definition: "チャーリーのホテルの従業員です。" },
      // 一般語 (2枚) → filterGenericConceptCards
      { word: "コラボレーション", definition: "他作品との共同企画。" },
      { word: "ファンアート", definition: "ファンが描いたキャラクターイラスト。" },
    ],
  });

  it("役職語3枚を除去する (filterCharacterCards)", () => {
    const parsed = parseDeckPayload(badResponse);
    const afterRole = filterCharacterCards(parsed.cards, "ハズビンホテルのキャラクター");
    expect(afterRole.map((c) => c.word)).not.toContain("ホテルマネージャー");
    expect(afterRole.map((c) => c.word)).not.toContain("フロントスタッフ");
    expect(afterRole.map((c) => c.word)).not.toContain("メイド");
    expect(afterRole).toHaveLength(7); // 10 - 3 = 7
  });

  it("一般語2枚を除去する (filterGenericConceptCards)", () => {
    const parsed = parseDeckPayload(badResponse);
    const afterRole = filterCharacterCards(parsed.cards, "ハズビンホテルのキャラクター");
    const afterConcept = filterGenericConceptCards(afterRole, "ハズビンホテルのキャラクター");
    expect(afterConcept.map((c) => c.word)).not.toContain("コラボレーション");
    expect(afterConcept.map((c) => c.word)).not.toContain("ファンアート");
    expect(afterConcept).toHaveLength(5); // 7 - 2 = 5
  });

  it("職種説明定義2枚を除去する (filterJobDescriptionCards)", () => {
    const parsed = parseDeckPayload(badResponse);
    const afterRole = filterCharacterCards(parsed.cards, "ハズビンホテルのキャラクター");
    const afterConcept = filterGenericConceptCards(afterRole, "ハズビンホテルのキャラクター");
    const afterJob = filterJobDescriptionCards(afterConcept, "ハズビンホテルのキャラクター");
    expect(afterJob.map((c) => c.word)).not.toContain("バツ");
    expect(afterJob.map((c) => c.word)).not.toContain("ノーム");
    expect(afterJob).toHaveLength(3); // 5 - 2 = 3
  });

  it("全フィルタ適用後の残存3枚でcheckCharacterDeckRatioが例外を投げる", () => {
    // rawCount=10, validCount=3 → 30% < 40% → invalid
    expect(() => checkCharacterDeckRatio(10, 3, "ハズビンホテルのキャラクター")).toThrow("AIが有効な単語帳を生成できませんでした。もう一度お試しください。");
  });

  it("全フィルタ適用後の残存3枚でsanitizeCards(min=5)が例外を投げる", () => {
    const parsed = parseDeckPayload(badResponse);
    const afterRole = filterCharacterCards(parsed.cards, "ハズビンホテルのキャラクター");
    const afterConcept = filterGenericConceptCards(afterRole, "ハズビンホテルのキャラクター");
    const afterJob = filterJobDescriptionCards(afterConcept, "ハズビンホテルのキャラクター");
    expect(() => sanitizeCards(afterJob, 5, 15)).toThrow("AIが有効な単語帳を生成できませんでした。もう一度お試しください。");
  });

  it("実在キャラ3枚は全フィルタ後も残る", () => {
    const parsed = parseDeckPayload(badResponse);
    const afterRole = filterCharacterCards(parsed.cards, "ハズビンホテルのキャラクター");
    const afterConcept = filterGenericConceptCards(afterRole, "ハズビンホテルのキャラクター");
    const afterJob = filterJobDescriptionCards(afterConcept, "ハズビンホテルのキャラクター");
    const words = afterJob.map((c) => c.word);
    expect(words).toContain("ハスク");
    expect(words).toContain("アラスター");
    expect(words).toContain("チャーリー");
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

// ====================================================================
// VERIFICATION_SYSTEM_PROMPT — 検証用システムプロンプトの内容確認
// ====================================================================
describe("VERIFICATION_SYSTEM_PROMPT", () => {
  it("厳格なファクトチェックの指示が含まれる", () => {
    expect(VERIFICATION_SYSTEM_PROMPT).toContain("fact-checker");
  });

  it("確信のない名前を除外する指示が含まれる", () => {
    expect(VERIFICATION_SYSTEM_PROMPT).toContain("not sure");
  });

  it("役職語・一般語を除外する指示が含まれる", () => {
    expect(VERIFICATION_SYSTEM_PROMPT).toContain("job role");
  });

  it("件数より正確さを優先する指示が含まれる", () => {
    expect(VERIFICATION_SYSTEM_PROMPT).toContain("fewer");
  });
});

// ====================================================================
// buildVerificationPrompt — 照合プロンプトの内容確認
// ====================================================================
describe("buildVerificationPrompt", () => {
  it("作品タイトルがプロンプトに含まれる", () => {
    const prompt = buildVerificationPrompt(["ちいかわ", "ハチワレ"], "ちいかわ");
    expect(prompt).toContain("ちいかわ");
  });

  it("候補名一覧がプロンプトに含まれる", () => {
    const prompt = buildVerificationPrompt(["ハスク", "アラスター", "バツ"], "ハズビンホテル");
    expect(prompt).toContain("ハスク");
    expect(prompt).toContain("アラスター");
    expect(prompt).toContain("バツ");
  });

  it("確認済み名のみ返すよう指示されている", () => {
    const prompt = buildVerificationPrompt(["ちいかわ"], "ちいかわ");
    expect(prompt).toContain("confirmed");
  });

  it('JSONのみを返すよう指示されている', () => {
    const prompt = buildVerificationPrompt(["ちいかわ"], "ちいかわ");
    expect(prompt).toContain('{"confirmed"');
  });
});

// ====================================================================
// verifyCharacterCards — LLM外部照合（モックによるテスト）
// ====================================================================
describe("verifyCharacterCards", () => {
  // モックcallLLM: confirmリストを返す
  const makeCallLLM = (confirmedNames) => async () =>
    JSON.stringify({ confirmed: confirmedNames });

  // モックcallLLM: エラーを投げる
  const failCallLLM = async () => {
    throw new Error("LLM connection error");
  };

  // モックcallLLM: 不正なJSONを返す
  const badJsonCallLLM = async () => "this is not json at all";

  const sampleCards = [
    { word: "ちいかわ", definition: "小さくてかわいいキャラクター。臆病だが心優しい。" },
    { word: "ハチワレ", definition: "ちいかわの親友。ハチワレ模様が特徴。" },
    { word: "うさぎ", definition: "快活なうさぎ型キャラクター。謎が多い。" },
    { word: "架空のキャラXYZ", definition: "存在しないキャラクター。" },
    { word: "もも太郎", definition: "別の架空キャラ。" },
  ];

  it("確認済みのキャラクター名のみを返す", async () => {
    const callLLM = makeCallLLM(["ちいかわ", "ハチワレ", "うさぎ"]);
    const result = await verifyCharacterCards(sampleCards, "ちいかわ", { callLLM });
    const words = result.map((c) => c.word);
    expect(words).toContain("ちいかわ");
    expect(words).toContain("ハチワレ");
    expect(words).toContain("うさぎ");
    expect(words).not.toContain("架空のキャラXYZ");
    expect(words).not.toContain("もも太郎");
    expect(result).toHaveLength(3);
  });

  it("全候補が確認できない場合は空配列を返す", async () => {
    const callLLM = makeCallLLM([]);
    const result = await verifyCharacterCards(sampleCards, "ちいかわ", { callLLM });
    expect(result).toHaveLength(0);
  });

  it("LLM呼び出しが失敗した場合はフォールバック（入力カードをそのまま返す）", async () => {
    const result = await verifyCharacterCards(sampleCards, "ちいかわ", { callLLM: failCallLLM });
    // フォールバック: 内部フィルタ済みカードをそのまま通す
    expect(result).toHaveLength(sampleCards.length);
    expect(result).toEqual(sampleCards);
  });

  it("LLMが不正なJSONを返した場合もフォールバックする", async () => {
    const result = await verifyCharacterCards(sampleCards, "ちいかわ", { callLLM: badJsonCallLLM });
    expect(result).toHaveLength(sampleCards.length);
  });

  it("入力カードが空の場合は空配列を返す", async () => {
    const callLLM = makeCallLLM(["ちいかわ"]);
    const result = await verifyCharacterCards([], "ちいかわ", { callLLM });
    expect(result).toHaveLength(0);
  });

  it("確認済みリストにない名前は大文字小文字を問わず除外する（ケース非依存）", async () => {
    const callLLM = makeCallLLM(["Husk", "Alastor"]); // 英語キャラ名
    const engCards = [
      { word: "Husk", definition: "A former angel working as a bartender." },
      { word: "Alastor", definition: "The Radio Demon, a powerful overlord." },
      { word: "FakeCharacter", definition: "Doesn't exist." },
    ];
    const result = await verifyCharacterCards(engCards, "Hazbin Hotel", { callLLM });
    const words = result.map((c) => c.word);
    expect(words).toContain("Husk");
    expect(words).toContain("Alastor");
    expect(words).not.toContain("FakeCharacter");
  });

  it("一般語（役職語）はLLMが確認しないので除外される", async () => {
    // 役職語を通さないLLM（正しい挙動）
    const callLLM = makeCallLLM(["ハスク", "アラスター", "チャーリー"]);
    const mixedCards = [
      { word: "ハスク", definition: "バーテンダーを務める元天使。" },
      { word: "アラスター", definition: "ラジオデーモンとして知られる強力な悪魔。" },
      { word: "チャーリー", definition: "ホテルを創設した地獄の王女。" },
      { word: "ホテルマネージャー", definition: "ホテルの経営を担当。" },
      { word: "コラボレーション", definition: "他作品との共同企画。" },
    ];
    const result = await verifyCharacterCards(mixedCards, "ハズビンホテル", { callLLM });
    const words = result.map((c) => c.word);
    expect(words).toContain("ハスク");
    expect(words).toContain("アラスター");
    expect(words).toContain("チャーリー");
    expect(words).not.toContain("ホテルマネージャー");
    expect(words).not.toContain("コラボレーション");
  });
});

// ====================================================================
// 回帰テスト: 「ちいかわのキャラクター」 外部照合ゲート
// ====================================================================
describe("回帰テスト: ちいかわのキャラクター (外部照合ゲート)", () => {
  it("照合で架空キャラ名を落とし、checkCharacterDeckRatioで失敗扱いにできる", () => {
    // 照合後に残った候補が少ない（rawCount基準で比率不足）場合
    expect(() => checkCharacterDeckRatio(10, 2, "ちいかわのキャラクター")).toThrow("AIが有効な単語帳を生成できませんでした。もう一度お試しください。");
  });

  it("照合後に実在キャラが十分あれば通過する", async () => {
    // 5枚のうち3枚が照合で確認 → rawが5以下なのでratio checkスキップ → sanitizeCardsに委ねる
    const callLLM = async () => JSON.stringify({ confirmed: ["ちいかわ", "ハチワレ", "うさぎ"] });
    const cards = [
      { word: "ちいかわ", definition: "小さくてかわいいキャラクター。" },
      { word: "ハチワレ", definition: "ちいかわの親友。" },
      { word: "うさぎ", definition: "快活なうさぎ型キャラクター。" },
      { word: "架空A", definition: "存在しない。" },
      { word: "架空B", definition: "存在しない。" },
    ];
    const result = await verifyCharacterCards(cards, "ちいかわ", { callLLM });
    expect(result).toHaveLength(3);
    expect(result.map((c) => c.word)).toContain("ちいかわ");
  });
});

// ====================================================================
// 回帰テスト: 「ハズビンホテルのキャラクター」 外部照合ゲート
// ====================================================================
describe("回帰テスト: ハズビンホテルのキャラクター (外部照合ゲート)", () => {
  it("架空名+実在キャラ混在 → 照合が架空名を落とす", async () => {
    // 実在キャラ3枚 + 架空名2枚 → 照合後3枚
    const callLLM = async () =>
      JSON.stringify({ confirmed: ["ハスク", "アラスター", "チャーリー"] });
    const cards = [
      { word: "ハスク", definition: "バーテンダーを務める元天使。カード魔法を使う。" },
      { word: "アラスター", definition: "ラジオデーモン。強力なオーバーロード。" },
      { word: "チャーリー", definition: "地獄の王女。罪人の更生を信じる。" },
      { word: "バツ", definition: "チャーリーの側近として働く悪魔。" }, // 架空
      { word: "ノーム", definition: "ホテルの新人スタッフ。" },          // 架空
    ];
    const result = await verifyCharacterCards(cards, "ハズビンホテル", { callLLM });
    const words = result.map((c) => c.word);
    expect(words).toContain("ハスク");
    expect(words).toContain("アラスター");
    expect(words).toContain("チャーリー");
    expect(words).not.toContain("バツ");
    expect(words).not.toContain("ノーム");
    expect(result).toHaveLength(3);
  });

  it("照合が全て失敗した場合はフォールバック（内部フィルタ済みカードを返す）", async () => {
    const failCallLLM = async () => { throw new Error("API error"); };
    const cards = [
      { word: "ハスク", definition: "バーテンダー。" },
      { word: "アラスター", definition: "ラジオデーモン。" },
    ];
    const result = await verifyCharacterCards(cards, "ハズビンホテル", { callLLM: failCallLLM });
    // フォールバック: 元のカードをそのまま返す
    expect(result).toHaveLength(2);
  });

  it("照合結果が空のとき、checkCharacterDeckRatioで無効判定できる", () => {
    // rawCount=8, validCount=0 → 0% < 40% → invalid
    expect(() => checkCharacterDeckRatio(8, 0, "ハズビンホテルのキャラクター")).toThrow("AIが有効な単語帳を生成できませんでした。もう一度お試しください。");
  });
});

// ====================================================================
// getDeckGenerationLLM / getVerificationLLM（プロバイダー切り替え）
// ====================================================================
describe("getDeckGenerationLLM", () => {
  const originalEnv = process.env.GEMINI_API_KEY;

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.GEMINI_API_KEY = originalEnv;
    } else {
      delete process.env.GEMINI_API_KEY;
    }
  });

  it("GEMINI_API_KEY が未設定のとき、Groq (requestGroqChat) を返す", () => {
    delete process.env.GEMINI_API_KEY;
    const llm = getDeckGenerationLLM();
    // Groq の関数名で判定
    expect(llm.name).toBe("requestGroqChat");
  });

  it("GEMINI_API_KEY が設定されているとき、Gemini (requestGeminiChat) を返す", () => {
    process.env.GEMINI_API_KEY = "test-key";
    const llm = getDeckGenerationLLM();
    expect(llm.name).toBe("requestGeminiChat");
  });
});

describe("getVerificationLLM", () => {
  it("常に Groq (requestGroqChat) を返す（クロスモデル検証のため）", () => {
    const llm = getVerificationLLM();
    expect(llm.name).toBe("requestGroqChat");
  });

  it("GEMINI_API_KEY が設定されていても Groq を返す", () => {
    const original = process.env.GEMINI_API_KEY;
    process.env.GEMINI_API_KEY = "test-key";
    const llm = getVerificationLLM();
    expect(llm.name).toBe("requestGroqChat");
    if (original !== undefined) {
      process.env.GEMINI_API_KEY = original;
    } else {
      delete process.env.GEMINI_API_KEY;
    }
  });
});

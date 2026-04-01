#!/usr/bin/env node
// ============================================================
// run-cache-audit.js — ハイブリッドキャッシュ棚卸し
//
// Phase 1: Supabaseから統計・候補を固定ロジックで収集（トークン0）
// ゲート: 問題なし → exit 0（Claude起動しない）
// Phase 2: 削除候補がある場合のみ claude -p で判断を依頼
// ============================================================

import { createClient } from "@supabase/supabase-js";
import { execSync } from "child_process";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "../..");

// .env.local から環境変数を読み込み
function loadEnv() {
  try {
    const envPath = resolve(PROJECT_ROOT, ".env.local");
    const content = readFileSync(envPath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIndex = trimmed.indexOf("=");
      if (eqIndex === -1) continue;
      const key = trimmed.slice(0, eqIndex).trim();
      let val = trimmed.slice(eqIndex + 1).trim();
      // クォート除去
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {
    // .env.local がなくても環境変数で動作可能
  }
}

loadEnv();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("[エラー] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が未設定です");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ---- 色定義 ----
const C = {
  red: "\x1b[0;31m",
  green: "\x1b[0;32m",
  yellow: "\x1b[0;33m",
  cyan: "\x1b[0;36m",
  dim: "\x1b[2m",
  nc: "\x1b[0m",
};

// ---- Phase 1: 固定ロジックで統計収集 ----
async function collectStats() {
  console.log(`${C.cyan}[Phase 1] キャッシュ統計を収集中...${C.nc}\n`);

  // 全件取得（id, topic, topic_key, def_lang, cards, created_at, updated_at）
  const { data: allDecks, error } = await supabase
    .from("deck_cache")
    .select("id, topic, topic_key, def_lang, cards, detail_level, created_at, updated_at")
    .order("created_at", { ascending: true });

  if (error) {
    console.error(`${C.red}[エラー] Supabase取得失敗: ${error.message}${C.nc}`);
    process.exit(1);
  }

  if (!allDecks || allDecks.length === 0) {
    console.log(`${C.green}[ゲート] キャッシュが空です。棚卸し不要。${C.nc}`);
    process.exit(0);
  }

  const now = new Date();
  const DAYS_30 = 30 * 24 * 60 * 60 * 1000;
  const DAYS_90 = 90 * 24 * 60 * 60 * 1000;

  // --- 統計計算（全部固定ロジック） ---
  const stats = {
    total: allDecks.length,
    totalCards: 0,
    byLang: {},
    oldDecks_30d: [],   // 30日以上更新なし
    oldDecks_90d: [],   // 90日以上更新なし
    fewCards: [],       // カード3枚以下
    duplicateTopics: [], // 同一topic_keyで複数def_lang
    emptyDefinitions: [], // 空定義を含むデッキ
  };

  const topicMap = new Map(); // topic_key -> [deck]

  for (const deck of allDecks) {
    const cards = Array.isArray(deck.cards) ? deck.cards : [];
    const cardCount = cards.length;
    stats.totalCards += cardCount;

    // 言語別集計
    const lang = deck.def_lang || "unknown";
    stats.byLang[lang] = (stats.byLang[lang] || 0) + 1;

    // 古さチェック
    const updatedAt = new Date(deck.updated_at || deck.created_at);
    const age = now - updatedAt;
    if (age > DAYS_90) {
      stats.oldDecks_90d.push({ id: deck.id, topic: deck.topic, def_lang: lang, cardCount, days: Math.floor(age / (24 * 60 * 60 * 1000)) });
    } else if (age > DAYS_30) {
      stats.oldDecks_30d.push({ id: deck.id, topic: deck.topic, def_lang: lang, cardCount, days: Math.floor(age / (24 * 60 * 60 * 1000)) });
    }

    // カード枚数チェック
    if (cardCount <= 3 && cardCount > 0) {
      stats.fewCards.push({ id: deck.id, topic: deck.topic, def_lang: lang, cardCount });
    }

    // 空定義チェック
    const emptyDefs = cards.filter(c => !c.definition || c.definition.trim() === "").length;
    if (emptyDefs > 0) {
      stats.emptyDefinitions.push({ id: deck.id, topic: deck.topic, def_lang: lang, emptyDefs, cardCount });
    }

    // topic_key重複チェック
    const key = deck.topic_key;
    if (!topicMap.has(key)) topicMap.set(key, []);
    topicMap.get(key).push({ id: deck.id, def_lang: lang, cardCount });
  }

  // 3言語以上に存在するトピックを重複候補に
  for (const [key, decks] of topicMap) {
    if (decks.length >= 3) {
      stats.duplicateTopics.push({ topic_key: key, count: decks.length, decks });
    }
  }

  return stats;
}

function printStats(stats) {
  console.log(`${C.cyan}--- キャッシュ統計 ---${C.nc}`);
  console.log(`  総デッキ数: ${stats.total}`);
  console.log(`  総カード数: ${stats.totalCards}`);
  console.log(`  言語別: ${Object.entries(stats.byLang).map(([k, v]) => `${k}=${v}`).join(", ")}`);
  console.log(`  90日以上未更新: ${stats.oldDecks_90d.length}件`);
  console.log(`  30-90日未更新: ${stats.oldDecks_30d.length}件`);
  console.log(`  カード3枚以下: ${stats.fewCards.length}件`);
  console.log(`  空定義あり: ${stats.emptyDefinitions.length}件`);
  console.log(`  3言語以上の重複: ${stats.duplicateTopics.length}件`);
  console.log("");
}

function buildClaudeReport(stats) {
  const issues = [];

  if (stats.oldDecks_90d.length > 0) {
    const list = stats.oldDecks_90d.map(d => `  - id=${d.id} "${d.topic}" (${d.def_lang}, ${d.cardCount}枚, ${d.days}日前)`).join("\n");
    issues.push(`### 90日以上未更新 (${stats.oldDecks_90d.length}件)\n${list}`);
  }

  if (stats.fewCards.length > 0) {
    const list = stats.fewCards.map(d => `  - id=${d.id} "${d.topic}" (${d.def_lang}, ${d.cardCount}枚)`).join("\n");
    issues.push(`### カード3枚以下 (${stats.fewCards.length}件)\n${list}`);
  }

  if (stats.emptyDefinitions.length > 0) {
    const list = stats.emptyDefinitions.map(d => `  - id=${d.id} "${d.topic}" (${d.def_lang}, 空${d.emptyDefs}/${d.cardCount}枚)`).join("\n");
    issues.push(`### 空定義あり (${stats.emptyDefinitions.length}件)\n${list}`);
  }

  if (stats.duplicateTopics.length > 0) {
    const list = stats.duplicateTopics.map(d => `  - "${d.topic_key}" → ${d.count}言語 (${d.decks.map(dd => `${dd.def_lang}:${dd.cardCount}枚`).join(", ")})`).join("\n");
    issues.push(`### 3言語以上の重複 (${stats.duplicateTopics.length}件)\n${list}`);
  }

  return issues;
}

// ---- メイン ----
async function main() {
  const stats = await collectStats();
  printStats(stats);

  const issues = buildClaudeReport(stats);

  // ゲート判定
  if (issues.length === 0) {
    console.log(`${C.green}[ゲート] 問題のあるキャッシュなし。Claude起動不要。${C.nc}`);
    process.exit(0);
  }

  console.log(`${C.yellow}[ゲート] ${issues.length}カテゴリの問題を検出。${C.nc}\n`);

  // Phase 2: Claude に判断を依頼
  const report = `以下はflash-autoのデッキキャッシュ(Supabase deck_cache)の棚卸し結果です。
各候補について「削除すべきか・残すべきか」を判断し、削除推奨のIDリストを返してください。

## 統計サマリー
- 総デッキ数: ${stats.total}
- 総カード数: ${stats.totalCards}

## 問題候補
${issues.join("\n\n")}

## 判断基準
- 90日以上未更新かつカード枚数が少ない → 削除候補
- 空定義が多い（50%以上） → 削除候補
- カード3枚以下で学習価値が低い → 削除候補
- ただし人気トピック（量子力学、プログラミング等）は残す判断もあり得る
- 重複は情報提供のみ（別言語は正常）

## 出力形式
削除推奨: [id1, id2, ...]
残す推奨: [id3, id4, ...] (理由)
`;

  console.log(`${C.cyan}[Phase 2] Claudeに判断を依頼中...${C.nc}\n`);

  try {
    const result = execSync(`echo ${JSON.stringify(report)} | claude -p --output-format text`, {
      cwd: PROJECT_ROOT,
      encoding: "utf-8",
      timeout: 60000,
      stdio: ["pipe", "pipe", "pipe"],
    });
    console.log(result);
  } catch (e) {
    console.error(`${C.red}[エラー] Claude実行失敗${C.nc}`);
    console.log("\n--- レポート（手動確認用） ---");
    console.log(report);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(`${C.red}[エラー] ${err.message}${C.nc}`);
  process.exit(1);
});

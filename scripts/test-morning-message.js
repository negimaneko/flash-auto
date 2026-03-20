#!/usr/bin/env node

/**
 * 毎朝メッセージのローカルテストスクリプト
 *
 * 使い方:
 *   node scripts/test-morning-message.js           # 実際にTelegramに送信
 *   node scripts/test-morning-message.js --dry      # 送信せずにメッセージ確認
 */

import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "..", ".env.local") });

const isDryRun = process.argv.includes("--dry");

// ─── Telegram 送信 ───
async function sendTelegram(text) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!botToken || !chatId) {
    console.error("❌ TELEGRAM_BOT_TOKEN または TELEGRAM_CHAT_ID が未設定です");
    return { ok: false };
  }

  const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });

  const data = await res.json();
  return data;
}

// ─── AI でメッセージ生成 ───
async function generateWithGroq() {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY 未設定");

  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
  const dayOfWeek = new Date().toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo", weekday: "long" });

  const prompt = `今日は${today}（${dayOfWeek}）です。
以下の形式で、今日の目標1つとTODOリスト3つを日本語で生成してください。
生産的で前向きな内容にしてください。

形式（この通りに出力）:
目標: （1文で）
TODO1: （具体的なタスク）
TODO2: （具体的なタスク）
TODO3: （具体的なタスク）`;

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: "あなたは生産性コーチです。簡潔で実行可能な日次目標とTODOを提案します。余計な説明は不要です。指定された形式だけで回答してください。" },
        { role: "user", content: prompt },
      ],
      max_tokens: 256,
      temperature: 0.8,
    }),
  });

  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error?.message || "Groq failed");
  return data.choices?.[0]?.message?.content || "";
}

// ─── パース ───
function parseResponse(text) {
  const goalMatch = text.match(/目標[:：]\s*(.+)/);
  const goal = goalMatch ? goalMatch[1].trim() : "今日も一歩ずつ前に進もう";

  const todos = [];
  const pattern = /TODO\d*[:：]\s*(.+)/g;
  let m;
  while ((m = pattern.exec(text)) !== null) todos.push(m[1].trim());

  if (todos.length === 0) {
    for (const line of text.split("\n")) {
      const bm = line.match(/^[\s]*[-・•]\s*(.+)/);
      if (bm && !line.includes("目標")) todos.push(bm[1].trim());
    }
  }

  return { goal, todos: todos.length > 0 ? todos.slice(0, 5) : ["最重要タスクを1つ決めて着手する"] };
}

// ─── メッセージ整形 ───
function formatMessage(goal, todos, source) {
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
  const dayOfWeek = new Date().toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo", weekday: "long" });

  let msg = `☀️ おはようございます！\n`;
  msg += `📅 ${today}（${dayOfWeek}）\n\n`;
  msg += `【今日の目標】\n${goal}\n\n`;
  msg += `【TODO】\n`;
  todos.forEach((t, i) => { msg += `${i + 1}. ${t}\n`; });
  msg += `\n${source}`;
  return msg;
}

// ─── メイン ───
async function main() {
  console.log(isDryRun ? "🔍 Dry-run モード（送信しません）" : "📤 テスト送信モード");
  console.log("---");

  let goal, todos, source;

  try {
    console.log("🤖 AI で目標を生成中...");
    const raw = await generateWithGroq();
    console.log("📝 AI レスポンス:\n", raw, "\n---");
    const parsed = parseResponse(raw);
    goal = parsed.goal;
    todos = parsed.todos;
    source = "🤖 AI生成（テスト）";
  } catch (err) {
    console.warn("⚠️ AI 生成失敗:", err.message);
    goal = "今日の目標をまだ設定していません。今日やるべき最重要タスクを1つ決めて着手してください。";
    todos = ["最優先タスクを1つ書き出す", "25分だけ集中して取り組む", "終わったら自分を褒める"];
    source = "📝 フォールバック";
  }

  const message = formatMessage(goal, todos, source);
  console.log("📨 送信メッセージ:\n");
  console.log(message);
  console.log("\n---");

  if (isDryRun) {
    console.log("✅ Dry-run 完了（送信はスキップ）");
    return;
  }

  const result = await sendTelegram(message);
  if (result.ok) {
    console.log("✅ Telegram 送信成功！スマホを確認してください。");
  } else {
    console.error("❌ 送信失敗:", result.description || result);
  }
}

main().catch((err) => {
  console.error("❌ エラー:", err);
  process.exit(1);
});

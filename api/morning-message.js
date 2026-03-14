/**
 * 毎朝メッセージ送信 API
 *
 * Vercel Cron から毎日 20:00 UTC（= 05:00 JST）に呼び出される。
 * 1. Supabase から今日の目標/TODOを取得
 * 2. なければ AI で生成
 * 3. それも失敗したらフォールバック文面
 * 4. Telegram に送信
 *
 * テスト送信: POST /api/morning-message?test=1
 * Dry-run:    POST /api/morning-message?dry=1
 */

import { getSupabaseAdmin, isSupabaseConfigured } from "./_shared/supabase.js";
import { requestGroqChat } from "./_shared/groq.js";
import { requestGeminiChat } from "./_shared/gemini.js";
import { sendTelegramMessage } from "./_shared/telegram.js";

// ─── タイムゾーンヘルパー ───
function getTodayJST() {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
  // "2026-03-15" 形式
}

// ─── Cron 認証 ───
function verifyCronAuth(req) {
  // テストモード: test=1 パラメータで認証スキップ可能（ローカル開発用）
  const url = new URL(req.url, `http://${req.headers.get?.("host") || req.headers?.host || "localhost"}`);
  if (url.searchParams.get("test") === "1") {
    return true;
  }

  // Vercel Cron は Authorization ヘッダーに CRON_SECRET を送る
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    // CRON_SECRET 未設定時はローカル開発と見なして許可
    console.warn("[morning-message] CRON_SECRET 未設定 — 認証スキップ");
    return true;
  }

  const authHeader = req.headers.get?.("authorization") || req.headers?.authorization || "";
  return authHeader === `Bearer ${cronSecret}`;
}

// ─── Supabase から今日の目標を取得 ───
async function fetchTodayGoals(dateStr) {
  if (!isSupabaseConfigured()) return null;

  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  try {
    const { data, error } = await supabase
      .from("daily_goals")
      .select("*")
      .eq("goal_date", dateStr)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("[morning-message] Supabase 取得エラー:", error.message);
      return null;
    }

    return data; // null if no row
  } catch (err) {
    console.error("[morning-message] Supabase 例外:", err.message);
    return null;
  }
}

// ─── AI で目標/TODO を生成 ───
async function generateGoalsWithAI() {
  const todayJST = getTodayJST();
  const dayOfWeek = new Date().toLocaleDateString("ja-JP", {
    timeZone: "Asia/Tokyo",
    weekday: "long",
  });

  const prompt = `今日は${todayJST}（${dayOfWeek}）です。
以下の形式で、今日の目標1つとTODOリスト3つを日本語で生成してください。
生産的で前向きな内容にしてください。

形式（この通りに出力）:
目標: （1文で）
TODO1: （具体的なタスク）
TODO2: （具体的なタスク）
TODO3: （具体的なタスク）`;

  const systemPrompt = "あなたは生産性コーチです。簡潔で実行可能な日次目標とTODOを提案します。余計な説明は不要です。指定された形式だけで回答してください。";

  // Groq → Gemini フォールバック
  let rawText = null;

  try {
    rawText = await requestGroqChat({
      prompt,
      systemPrompt,
      maxTokens: 256,
      temperature: 0.8,
    });
    console.log("[morning-message] Groq で生成成功");
  } catch (groqErr) {
    console.warn("[morning-message] Groq 失敗:", groqErr.message);
    try {
      rawText = await requestGeminiChat({
        prompt,
        systemPrompt,
        maxTokens: 256,
        temperature: 0.8,
      });
      console.log("[morning-message] Gemini で生成成功");
    } catch (geminiErr) {
      console.error("[morning-message] Gemini も失敗:", geminiErr.message);
      return null;
    }
  }

  return parseAIResponse(rawText);
}

// ─── AI レスポンスをパースする ───
function parseAIResponse(text) {
  if (!text || typeof text !== "string") return null;

  // 「目標:」行を探す
  const goalMatch = text.match(/目標[:：]\s*(.+)/);
  const goal = goalMatch ? goalMatch[1].trim() : null;

  // TODO行を探す（TODO1: ... / TODO2: ... / TODO3: ...）
  const todos = [];
  const todoPattern = /TODO\d*[:：]\s*(.+)/g;
  let match;
  while ((match = todoPattern.exec(text)) !== null) {
    todos.push(match[1].trim());
  }

  // 箇条書き形式のフォールバック（- xxx や ・xxx）
  if (todos.length === 0) {
    const lines = text.split("\n");
    for (const line of lines) {
      const bulletMatch = line.match(/^[\s]*[-・•]\s*(.+)/);
      if (bulletMatch && !line.includes("目標")) {
        todos.push(bulletMatch[1].trim());
      }
    }
  }

  if (!goal && todos.length === 0) return null;

  return {
    goal: goal || "今日も一歩ずつ前に進もう",
    todos: todos.length > 0 ? todos.slice(0, 5) : ["最重要タスクを1つ決めて着手する"],
  };
}

// ─── メッセージを整形する ───
function formatMessage(goal, todos, source) {
  const todayJST = getTodayJST();
  const dayOfWeek = new Date().toLocaleDateString("ja-JP", {
    timeZone: "Asia/Tokyo",
    weekday: "long",
  });

  const sourceLabel = {
    saved: "📋 保存済み",
    ai: "🤖 AI生成",
    fallback: "📝 デフォルト",
  }[source] || source;

  let msg = `☀️ おはようございます！\n`;
  msg += `📅 ${todayJST}（${dayOfWeek}）\n\n`;
  msg += `【今日の目標】\n`;
  msg += `${goal}\n\n`;
  msg += `【TODO】\n`;
  todos.forEach((todo, i) => {
    msg += `${i + 1}. ${todo}\n`;
  });
  msg += `\n${sourceLabel}`;

  return msg;
}

// ─── フォールバック文面 ───
function getFallbackMessage() {
  return {
    goal: "今日の目標をまだ設定していません。今日やるべき最重要タスクを1つ決めて着手してください。",
    todos: [
      "最優先タスクを1つ書き出す",
      "25分だけ集中して取り組む",
      "終わったら自分を褒める",
    ],
  };
}

// ─── 結果を Supabase に保存 ───
async function saveGoals(dateStr, goal, todos, source) {
  if (!isSupabaseConfigured()) return;

  const supabase = getSupabaseAdmin();
  if (!supabase) return;

  try {
    const { error } = await supabase.from("daily_goals").upsert(
      {
        goal_date: dateStr,
        goal,
        todos: JSON.stringify(todos),
        source,
        sent_at: new Date().toISOString(),
      },
      { onConflict: "goal_date" }
    );

    if (error) {
      console.error("[morning-message] 保存エラー:", error.message);
    } else {
      console.log("[morning-message] 保存完了:", dateStr);
    }
  } catch (err) {
    console.error("[morning-message] 保存例外:", err.message);
  }
}

// ─── メインハンドラー ───
export default async function handler(req, res) {
  console.log("[morning-message] 実行開始:", new Date().toISOString());

  // 認証チェック
  if (!verifyCronAuth(req)) {
    console.warn("[morning-message] 認証失敗");
    return res.status(401).json({ error: "Unauthorized" });
  }

  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const isDryRun = url.searchParams.get("dry") === "1";
  const todayJST = getTodayJST();

  let goal, todos, source;

  // 優先順位A: 保存済みデータ
  const savedData = await fetchTodayGoals(todayJST);
  if (savedData) {
    goal = savedData.goal;
    try {
      todos = typeof savedData.todos === "string" ? JSON.parse(savedData.todos) : savedData.todos;
    } catch {
      todos = [savedData.todos];
    }
    source = "saved";
    console.log("[morning-message] 保存済みデータを使用");
  }

  // 優先順位B: AI生成
  if (!goal) {
    const aiResult = await generateGoalsWithAI();
    if (aiResult) {
      goal = aiResult.goal;
      todos = aiResult.todos;
      source = "ai";
      console.log("[morning-message] AI生成データを使用");
    }
  }

  // 優先順位C: フォールバック
  if (!goal) {
    const fallback = getFallbackMessage();
    goal = fallback.goal;
    todos = fallback.todos;
    source = "fallback";
    console.log("[morning-message] フォールバックを使用");
  }

  const message = formatMessage(goal, todos, source);

  // Dry-run: 送信せずにメッセージだけ返す
  if (isDryRun) {
    console.log("[morning-message] dry-run モード — 送信スキップ");
    return res.status(200).json({
      ok: true,
      dryRun: true,
      date: todayJST,
      source,
      message,
    });
  }

  // Telegram 送信
  const sendResult = await sendTelegramMessage(message);

  // 送信成功時のみ保存（同じ日の再送信を防ぐため source が saved 以外のとき）
  if (sendResult.ok && source !== "saved") {
    await saveGoals(todayJST, goal, todos, source);
  }

  console.log("[morning-message] 完了:", { date: todayJST, source, sent: sendResult.ok });

  return res.status(sendResult.ok ? 200 : 500).json({
    ok: sendResult.ok,
    date: todayJST,
    source,
    sent: sendResult.ok,
    error: sendResult.error || undefined,
  });
}

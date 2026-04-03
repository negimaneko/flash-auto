/**
 * flash auto デイリーレポート API
 *
 * Vercel Cron から毎日 13:53 UTC（= 22:53 JST）に呼び出される。
 * Supabase からイベントデータを集計し、グラフ付きでTelegramに送信する。
 *
 * テスト送信: POST /api/daily-report?test=1
 * Dry-run:    POST /api/daily-report?dry=1
 */

import { getSupabaseAdmin, isSupabaseConfigured } from "./_shared/supabase.js";
import { sendTelegramMessage } from "./_shared/telegram.js";

export const config = { maxDuration: 60 };

// ─── タイムゾーンヘルパー ───
function getTodayJST() {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
}

// eslint-disable-next-line no-unused-vars -- 将来使用予定
function getNowJST() {
  return new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
}

// ─── Cron 認証 ───
function verifyCronAuth(req) {
  const url = new URL(req.url, `http://${req.headers.get?.("host") || req.headers?.host || "localhost"}`);
  if (url.searchParams.get("test") === "1") return true;

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.warn("[daily-report] CRON_SECRET 未設定 — 認証スキップ");
    return true;
  }

  const authHeader = req.headers.get?.("authorization") || req.headers?.authorization || "";
  return authHeader === `Bearer ${cronSecret}`;
}

// ─── QuickChart でグラフ画像URL生成 ───
function makeChartUrl(labels, data, title, chartType = "bar") {
  const colors = [
    "rgba(54,162,235,0.8)", "rgba(255,206,86,0.8)", "rgba(75,192,192,0.8)",
    "rgba(153,102,255,0.8)", "rgba(255,159,64,0.8)", "rgba(255,99,132,0.8)",
  ];
  const payload = {
    backgroundColor: "white",
    chart: {
      type: chartType,
      data: {
        labels,
        datasets: [{
          label: title,
          data,
          backgroundColor: colors.slice(0, data.length),
          borderColor: colors.slice(0, data.length),
          fill: false,
        }],
      },
      options: {
        title: { display: true, text: title },
        scales: { yAxes: [{ ticks: { beginAtZero: true } }] },
      },
    },
  };

  const encoded = encodeURIComponent(JSON.stringify(payload.chart));
  return `https://quickchart.io/chart?c=${encoded}&w=600&h=300&backgroundColor=white`;
}

// ─── Telegram に画像送信 ───
async function sendTelegramPhoto(chartUrl, caption) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!botToken || !chatId) return false;

  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, photo: chartUrl, caption }),
    });
    const data = await res.json();
    return data.ok || false;
  } catch {
    return false;
  }
}

// ─── メインハンドラー ───
export default async function handler(req, res) {
  console.log("[daily-report] 実行開始:", new Date().toISOString());

  if (!verifyCronAuth(req)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const isDryRun = url.searchParams.get("dry") === "1";

  if (!isSupabaseConfigured()) {
    return res.status(500).json({ error: "Supabase 未設定" });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return res.status(500).json({ error: "Supabase 初期化失敗" });
  }

  const todayJST = getTodayJST();
  // JSTの今日0:00〜23:59をUTCに変換
  const todayStart = new Date(`${todayJST}T00:00:00+09:00`).toISOString();
  const todayEnd = new Date(`${todayJST}T23:59:59+09:00`).toISOString();

  // ─── ユーザー取得 ───
  let users = [];
  try {
    const { data, error } = await supabase
      .from("users")
      .select("id, is_internal, created_at");
    if (error) throw error;
    users = data || [];
  } catch (err) {
    console.error("[daily-report] ユーザー取得エラー:", err.message);
    await sendTelegramMessage(`❌ flash auto デイリーレポート失敗\nSupabase接続エラー: ${err.message}`);
    return res.status(500).json({ error: err.message });
  }

  const internalIds = new Set(users.filter((u) => u.is_internal).map((u) => u.id));
  const externalTotal = users.filter((u) => !u.is_internal).length;
  const newToday = users.filter(
    (u) => !u.is_internal && u.created_at >= todayStart && u.created_at <= todayEnd
  ).length;

  // ─── 新規ユーザー0人ならスキップ ───
  if (newToday === 0 && !isDryRun && url.searchParams.get("test") !== "1") {
    console.log("[daily-report] 新規ユーザー0人 → スキップ");
    return res.status(200).json({ ok: true, skipped: true, reason: "no_new_users" });
  }

  // ─── イベント取得 ───
  let events = [];
  try {
    const { data, error } = await supabase
      .from("events")
      .select("event_name, occurred_at, user_id, metadata")
      .order("occurred_at", { ascending: false })
      .limit(5000);
    if (error) throw error;
    events = data || [];
  } catch (err) {
    console.error("[daily-report] イベント取得エラー:", err.message);
    await sendTelegramMessage(`❌ flash auto デイリーレポート失敗\nイベント取得エラー: ${err.message}`);
    return res.status(500).json({ error: err.message });
  }

  const todayEvents = events.filter(
    (e) => e.occurred_at >= todayStart && e.occurred_at <= todayEnd && !internalIds.has(e.user_id)
  );

  // ─── 集計 ───
  const counts = {};
  const usersByEvent = {};
  for (const e of todayEvents) {
    const name = e.event_name;
    counts[name] = (counts[name] || 0) + 1;
    if (!usersByEvent[name]) usersByEvent[name] = new Set();
    if (e.user_id) usersByEvent[name].add(e.user_id);
  }

  const appOpen = counts.app_open || 0;
  const appOpenUniq = (usersByEvent.app_open || new Set()).size;
  const genWord = counts.generate_word || 0;
  const genDeck = counts.generate_theme_deck || 0;
  const saveDeck = counts.save_deck || 0;
  const reviewCard = counts.review_card || 0;

  const genUsers = new Set([
    ...(usersByEvent.generate_word || []),
    ...(usersByEvent.generate_theme_deck || []),
  ]).size;
  const saveUsers = (usersByEvent.save_deck || new Set()).size;
  const reviewUsers = (usersByEvent.review_card || new Set()).size;

  const saveRate = genUsers > 0 ? `${Math.round((saveUsers / genUsers) * 100)}%` : "-%";
  const reviewRate = saveUsers > 0 ? `${Math.round((reviewUsers / saveUsers) * 100)}%` : "-%";

  // ─── AI集計 ───
  const aiProviders = {};
  const latencies = [];
  let fallbacks = 0;
  let errors = 0;
  for (const e of todayEvents) {
    let meta = e.metadata || {};
    if (typeof meta === "string") {
      try { meta = JSON.parse(meta); } catch { meta = {}; }
    }
    if (meta.provider) aiProviders[meta.provider] = (aiProviders[meta.provider] || 0) + 1;
    if (meta.latency_ms) latencies.push(meta.latency_ms);
    if (meta.is_fallback) fallbacks++;
    if (meta.error) errors++;
  }

  const aiTotal = Object.values(aiProviders).reduce((a, b) => a + b, 0);
  const providerStr = Object.keys(aiProviders).length > 0
    ? Object.entries(aiProviders).map(([k, v]) => `${k} ${v}回`).join(" / ")
    : "データなし";
  const avgLat = latencies.length > 0
    ? `${Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)}ms`
    : "データなし";
  const fallbackRate = aiTotal > 0 ? `${Math.round((fallbacks / aiTotal) * 100)}%` : "-%";
  const errorRate = aiTotal > 0 ? `${Math.round((errors / aiTotal) * 100)}%` : "-%";

  // ─── 直近7日の日別app_open ───
  const daily = {};
  for (const e of events) {
    if (e.event_name === "app_open" && !internalIds.has(e.user_id)) {
      const d = e.occurred_at.slice(0, 10);
      daily[d] = (daily[d] || 0) + 1;
    }
  }
  const weekLabels = Object.keys(daily).sort().slice(-7);
  const weekData = weekLabels.map((d) => daily[d]);
  const weekLabelsDisp = weekLabels.map((d) => d.slice(5)); // MM-DD

  // ─── Google フォーム回答取得 ───
  let feedbackSummary = "取得に失敗しました";
  let feedbackCount = 0;
  try {
    const csvRes = await fetch(
      "https://docs.google.com/spreadsheets/d/1YkVPFQ3c_K_Uu-MldkcEIkUbKIr5kyEs6lwbXy2YSPs/export?format=csv",
      { signal: AbortSignal.timeout(15000) }
    );
    const csvText = await csvRes.text();
    const lines = csvText.trim().split("\n");
    const todayGF = new Date().toLocaleDateString("ja-JP", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "numeric",
      day: "numeric",
    }).replace(/\//g, "/");
    const todayRows = lines.slice(1).filter((l) => l.startsWith(todayGF));
    feedbackCount = todayRows.length;
    feedbackSummary = feedbackCount === 0
      ? "本日の回答はありませんでした"
      : `${feedbackCount}件の回答あり（内容は別途確認）`;
  } catch {
    // フォーム取得失敗は無視
  }

  // ─── レポート組み立て ───
  const dateStr = new Date().toLocaleDateString("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric",
  });

  const report = `📊 flash auto デイリーレポート（${dateStr}）

■ 今日の数値（内部ユーザー除外）
・新規ユーザー: ${newToday}人
・app_open: ${appOpen}回（ユニーク ${appOpenUniq}人）
・generate_word: ${genWord}回
・generate_theme_deck: ${genDeck}回
・save_deck: ${saveDeck}回（実行率 ${saveRate}）
・review_card: ${reviewCard}回（実行率 ${reviewRate}）

■ AI 生成状況
・使用プロバイダー: ${providerStr}
・平均レイテンシ: ${avgLat}
・フォールバック発生率: ${fallbackRate}
・エラー率: ${errorRate}

■ ご意見箱（本日）
・回答数: ${feedbackCount}件
・${feedbackSummary}

■ 外部ユーザー累計: ${externalTotal}人`;

  if (isDryRun) {
    return res.status(200).json({ ok: true, dryRun: true, report });
  }

  // ─── グラフ送信 ───
  try {
    const chart1 = makeChartUrl(
      ["app_open", "generate_word", "generate_theme_deck", "save_deck", "review_card"],
      [appOpen, genWord, genDeck, saveDeck, reviewCard],
      "flash auto 本日のイベント"
    );
    await sendTelegramPhoto(chart1, "📊 本日のイベント（内部ユーザー除外）");
  } catch { /* グラフ送信失敗は無視 */ }

  try {
    if (weekLabels.length > 0) {
      const chart2 = makeChartUrl(weekLabelsDisp, weekData, "直近7日のapp_open", "line");
      await sendTelegramPhoto(chart2, "📈 直近7日のapp_open");
    }
  } catch { /* グラフ送信失敗は無視 */ }

  // ─── テキストレポート送信 ───
  const sendResult = await sendTelegramMessage(report);

  console.log("[daily-report] 完了:", { date: todayJST, sent: sendResult.ok });

  return res.status(sendResult.ok ? 200 : 500).json({
    ok: sendResult.ok,
    date: todayJST,
    sent: sendResult.ok,
    error: sendResult.error || undefined,
  });
}

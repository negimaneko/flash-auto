/**
 * 毎朝メッセージ送信 API
 *
 * Vercel Cron から毎日 20:00 UTC（= 05:00 JST）に呼び出される。
 * GitHub API で昨日のコミット履歴を取得し、朝の振り返りメッセージを送信する。
 *
 * テスト送信: POST /api/morning-message?test=1
 * Dry-run:    POST /api/morning-message?dry=1
 */

import { sendTelegramMessage } from "./_shared/telegram.js";

const GITHUB_OWNER = "negimaneko";
const GITHUB_REPO = "flash-auto";

// ─── タイムゾーンヘルパー ───
function getJSTDate(offsetDays = 0) {
  const now = new Date();
  now.setDate(now.getDate() + offsetDays);
  return now.toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
}

function getDayOfWeek() {
  return new Date().toLocaleDateString("ja-JP", {
    timeZone: "Asia/Tokyo",
    weekday: "long",
  });
}

// ─── Cron 認証 ───
function verifyCronAuth(req) {
  const url = new URL(req.url, `http://${req.headers.get?.("host") || req.headers?.host || "localhost"}`);
  if (url.searchParams.get("test") === "1") return true;

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.warn("[morning-message] CRON_SECRET 未設定 — 認証スキップ");
    return true;
  }

  const authHeader = req.headers.get?.("authorization") || req.headers?.authorization || "";
  return authHeader === `Bearer ${cronSecret}`;
}

// ─── GitHub API で昨日のコミットを取得 ───
async function fetchYesterdayCommits() {
  const yesterday = getJSTDate(-1);
  const today = getJSTDate(0);

  // JST の昨日 00:00 〜 今日 00:00 を UTC に変換
  const since = new Date(`${yesterday}T00:00:00+09:00`).toISOString();
  const until = new Date(`${today}T00:00:00+09:00`).toISOString();

  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/commits?since=${since}&until=${until}&per_page=50`;

  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "flash-auto-morning-message",
  };

  // トークンがあれば認証付きで（レートリミット緩和）
  const token = process.env.GITHUB_TOKEN;
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  try {
    const res = await fetch(url, { headers });

    if (!res.ok) {
      console.error("[morning-message] GitHub API エラー:", res.status, await res.text());
      return [];
    }

    const commits = await res.json();
    return commits.map((c) => ({
      message: c.commit.message.split("\n")[0], // 1行目だけ
      hash: c.sha.slice(0, 7),
      date: c.commit.committer.date,
    }));
  } catch (err) {
    console.error("[morning-message] GitHub API 例外:", err.message);
    return [];
  }
}

// ─── メッセージ整形 ───
function formatMessage(commits) {
  const todayStr = getJSTDate(0);
  const dayOfWeek = getDayOfWeek();
  const yesterdayStr = getJSTDate(-1);

  let msg = `☀️ おはようございます！\n`;
  msg += `📅 ${todayStr}（${dayOfWeek}）\n\n`;

  if (commits.length === 0) {
    msg += `【昨日の作業】\n`;
    msg += `${yesterdayStr} のコミットはありませんでした。\n`;
    msg += `今日も頑張りましょう！`;
    return msg;
  }

  msg += `【昨日の作業（${commits.length}件）】\n`;
  for (const c of commits) {
    // Co-Authored-By 等のノイズを除外して表示
    const cleanMsg = c.message.replace(/\s*Co-Authored-By:.*/i, "").trim();
    msg += `• ${cleanMsg}\n`;
  }

  return msg;
}

// ─── メインハンドラー ───
export default async function handler(req, res) {
  console.log("[morning-message] 実行開始:", new Date().toISOString());

  if (!verifyCronAuth(req)) {
    console.warn("[morning-message] 認証失敗");
    return res.status(401).json({ error: "Unauthorized" });
  }

  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const isDryRun = url.searchParams.get("dry") === "1";

  const commits = await fetchYesterdayCommits();
  const message = formatMessage(commits);

  if (isDryRun) {
    console.log("[morning-message] dry-run モード — 送信スキップ");
    return res.status(200).json({
      ok: true,
      dryRun: true,
      commits: commits.length,
      message,
    });
  }

  const sendResult = await sendTelegramMessage(message);

  console.log("[morning-message] 完了:", { commits: commits.length, sent: sendResult.ok });

  return res.status(sendResult.ok ? 200 : 500).json({
    ok: sendResult.ok,
    commits: commits.length,
    sent: sendResult.ok,
    error: sendResult.error || undefined,
  });
}

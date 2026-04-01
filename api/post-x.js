/**
 * X (Twitter) 自動投稿 API
 *
 * Vercel Cron から毎日 03:17 UTC（= 12:17 JST）に呼び出される。
 * 1. Notion 開発ログから直近の作業内容を取得
 * 2. 実際の開発内容をもとに AI で投稿文を生成
 * 3. X に投稿
 * 4. Telegram に投稿結果を通知
 *
 * テスト送信: POST /api/post-x?test=1
 * Dry-run:    POST /api/post-x?dry=1
 */

import { requestGroqChat } from "./_shared/groq.js";
import { requestGeminiChat } from "./_shared/gemini.js";
import { postTweet } from "./_shared/twitter.js";
import { sendTelegramMessage } from "./_shared/telegram.js";
import { fetchRecentDevLogs } from "./_shared/notion.js";

// ─── タイムゾーンヘルパー ───
function getTodayJST() {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
}

function getDayOfWeekJST() {
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
    console.warn("[post-x] CRON_SECRET 未設定 — 認証スキップ");
    return true;
  }

  const authHeader = req.headers.get?.("authorization") || req.headers?.authorization || "";
  return authHeader === `Bearer ${cronSecret}`;
}

// ─── 開発ログを整形 ───
function formatDevContext(logs) {
  if (!logs || logs.length === 0) return null;

  return logs
    .filter((log) => log.summary)
    .map((log) => {
      const lines = [`【${log.date}】${log.project ? ` (${log.project})` : ""}`];
      lines.push(log.summary);
      if (log.commits) lines.push(`コミット数: ${log.commits} / +${log.added} -${log.deleted}行`);
      return lines.join("\n");
    })
    .join("\n\n");
}

// ─── AI で投稿文を生成 ───
async function generateXPost() {
  const todayJST = getTodayJST();
  const dayOfWeek = getDayOfWeekJST();

  // Notion から直近の開発ログを取得
  let devContext = null;
  let recentDrafts = [];
  try {
    const logs = await fetchRecentDevLogs(3);
    devContext = formatDevContext(logs);
    recentDrafts = logs.map((l) => l.draft).filter(Boolean);
    console.log(`[post-x] 開発ログ ${logs.length} 件取得`);
  } catch (err) {
    console.warn("[post-x] 開発ログ取得失敗（フォールバック）:", err.message);
  }

  const prompt = `今日は${todayJST}（${dayOfWeek}）です。
あなたは個人開発者のXアカウント（@create_Aiapp）の運用を代行しています。

以下の「実際の開発内容」をもとに、X（旧Twitter）の投稿文を1つ生成してください。

${devContext ? `═══ 直近の開発内容（これが最も重要な素材）═══
${devContext}
═══════════════════════════════════════` : "（開発ログの取得に失敗しました。一般的な個人開発の話題で書いてください）"}

${recentDrafts.length > 0 ? `═══ 過去の投稿下書き（これらと似た内容は避けること）═══
${recentDrafts.map((d, i) => `${i + 1}. ${d}`).join("\n")}
═══════════════════════════════════════` : ""}

【投稿の方向性 — 以下の切り口からランダムに選ぶこと】
- 今日やった作業の具体的な内容・結果（「〜を実装した」「〜を修正した」）
- 試行錯誤のエピソード（「〜を入れたけど微妙だったから消した」「3時間ハマった」）
- 仕組みづくりの話（自動化、Notion連携、Claude活用、CI/CDなど）
- 技術選定の裏話（「〜を選んだ理由」「〜は合わなかった」）
- 開発で学んだこと・気づき
- ユーザー目線での体験の変化（「この機能で〜が楽になった」）
- 個人開発のリアル（モチベ、時間管理、失敗談）
- AI活用の具体例（「AIに〜させたら〜だった」）

【最重要ルール — 具体性】
- 上の「直近の開発内容」から具体的な技術名・機能名・数字を必ず1つ以上使え（例：Wikipedia、Notion、Telegram、Groq、2000行、17ファイルなど）
- 抽象的な「開発してた」「機能追加した」だけの投稿は禁止。何を・なぜ・どうなったかを書け
- 架空の進捗やエピソードを書くな。上の開発ログにない内容を捏造するな
- 「Flash Auto」のプロモーションが主目的ではない。開発者の独り言・日記として面白い投稿を書く
- プロダクト名は毎回入れなくてよい。文脈で自然に触れる程度でOK
- 過去の投稿と同じ切り口・構成にしない

【アカウント情報】
- 19歳・未経験の個人開発者
- AI生成単語帳アプリ「Flash Auto」を開発中
- Claude Code（AI）を活用して開発を進めている

【口調ルール（最重要 — 必ず守ること）】
- 断定系多め。「〜かもしれない」「〜な気がする」は禁止。「〜だった」「〜の方がいい」「〜は微妙」のように言い切る
- 短い文。1文が長くならないように切る
- 少し切るような言い方。柔らかくしすぎない
- 倒置法OK。強調したいときに使う
- 比喩は控えめ。ふわふわした比喩やポエム調は禁止
- 「開発者の独り言」のようなトーン。丁寧すぎず、飾らない
- 「〜かもしれませんが〜嬉しいです」「まるで魔法のような〜」のような表現は絶対に使わない

【書式ルール】
- 280文字以内（日本語）
- 1文ごとに改行を入れて読みやすくする
- 冒頭にキャッチーな一言を置き、改行で区切る
- 絵文字を適度に使う（1〜3個。多すぎない）
- ハッシュタグは最終行にまとめ、本文と1行空ける
- 短い文を積み重ねるスタイル。ダラダラ続く長文は禁止

【口調の例（この温度感に合わせること）】
・「地味だけど、ここが一番まずかった」
・「直したのはUIではなく挙動の方」
・「便利そうで、実際は微妙だった」
・「検索機能つけたら精度が全然変わった。Wikipedia偉大すぎる」
・「3時間溶けた。でもやっと動いた」
・「入れた機能、その日のうちに消した。よくある」

【ハッシュタグ】
#個人開発 #AI活用 #語学学習 から1〜2個。内容に合わせて選ぶ

投稿文のみ出力してください。説明や前置きは不要。`;

  const systemPrompt = "あなたはSNS運用のプロです。開発者の実際の作業内容をもとに、リアルで共感できる投稿を作成します。断定的で短い文体、飾らない独り言トーン。宣伝臭を出さず、開発の日記・裏話として面白い投稿を書きます。ポエム調や丁寧すぎる表現は禁止。投稿文のみを出力してください。";

  let text = null;

  // Groq → Gemini フォールバック
  try {
    text = await requestGroqChat({
      prompt,
      systemPrompt,
      maxTokens: 512,
      temperature: 0.9,
    });
    console.log("[post-x] Groq で生成成功");
  } catch (groqErr) {
    console.warn("[post-x] Groq 失敗:", groqErr.message);
    try {
      text = await requestGeminiChat({
        prompt,
        systemPrompt,
        maxTokens: 512,
        temperature: 0.9,
      });
      console.log("[post-x] Gemini で生成成功");
    } catch (geminiErr) {
      console.error("[post-x] Gemini も失敗:", geminiErr.message);
      return null;
    }
  }

  if (!text) return null;

  // 余計な引用符やマークダウンを除去
  text = text.replace(/^["「『]+|["」』]+$/g, "").trim();
  // 280文字制限
  if (text.length > 280) {
    text = text.slice(0, 277) + "...";
  }

  return text;
}

// ─── メインハンドラー ───
export default async function handler(req, res) {
  console.log("[post-x] 実行開始:", new Date().toISOString());

  if (!verifyCronAuth(req)) {
    console.warn("[post-x] 認証失敗");
    return res.status(401).json({ error: "Unauthorized" });
  }

  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const isDryRun = url.searchParams.get("dry") === "1";
  const isDebug = url.searchParams.get("debug") === "1";

  // デバッグモード: 環境変数の読み込み状態を返す（値は先頭4文字のみ）
  if (isDebug) {
    const keys = ["X_API_KEY", "X_API_KEY_SECRET", "X_ACCESS_TOKEN", "X_ACCESS_TOKEN_SECRET"];
    const info = {};
    for (const k of keys) {
      const v = process.env[k];
      if (!v) { info[k] = "未設定"; continue; }
      const trimmed = v.trim();
      info[k] = {
        head: v.slice(0, 4),
        tail: v.slice(-4),
        len: v.length,
        trimLen: trimmed.length,
        hasWhitespace: v !== trimmed,
        hasNewline: v.includes("\n") || v.includes("\r"),
        hasQuote: v.includes('"') || v.includes("'"),
      };
    }
    return res.status(200).json({ envCheck: info });
  }

  // カスタムテキストが指定されていればそれを使う、なければAI生成
  let body = {};
  try { body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {}; } catch {}
  const postText = body.customText || await generateXPost();

  if (!postText) {
    const errorMsg = "[post-x] 投稿文の生成に失敗しました";
    console.error(errorMsg);
    await sendTelegramMessage(`❌ X自動投稿失敗\n投稿文の生成に失敗しました`);
    return res.status(500).json({ ok: false, error: "Failed to generate post" });
  }

  // Dry-run: 投稿せずに内容だけ返す
  if (isDryRun) {
    console.log("[post-x] dry-run モード — 投稿スキップ");
    return res.status(200).json({
      ok: true,
      dryRun: true,
      date: getTodayJST(),
      postText,
    });
  }

  // X に投稿
  const result = await postTweet(postText);

  // Telegram に結果を通知
  if (result.ok) {
    await sendTelegramMessage(
      `✅ X自動投稿完了\n\n${postText}\n\nhttps://x.com/i/status/${result.tweetId}`
    );
  } else {
    await sendTelegramMessage(
      `❌ X自動投稿失敗\nエラー: ${result.error}\n\n生成された投稿文:\n${postText}`
    );
  }

  console.log("[post-x] 完了:", { date: getTodayJST(), posted: result.ok });

  return res.status(result.ok ? 200 : 500).json({
    ok: result.ok,
    date: getTodayJST(),
    posted: result.ok,
    tweetId: result.tweetId || undefined,
    postText,
    error: result.error || undefined,
  });
}

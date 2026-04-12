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
import { fetchRecentDevLogs, fetchRecentPostedTexts, savePostedText, popXStockDraft } from "./_shared/notion.js";

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

// ─── 曜日ごとの切り口ローテーション ───
const ANGLE_BY_DAY = {
  0: { label: "個人開発のリアル", desc: "モチベーション、時間管理、失敗談、個人開発ならではの苦労や楽しさ" },
  1: { label: "今日やった作業の具体的な内容・結果", desc: "「〜を実装した」「〜を修正した」のように、具体的に何をしたか" },
  2: { label: "試行錯誤のエピソード", desc: "「〜を入れたけど微妙だったから消した」「3時間ハマった」のような泥臭い話" },
  3: { label: "仕組みづくりの話", desc: "自動化、Notion連携、Claude活用、CI/CDなど、開発環境・ワークフローの工夫" },
  4: { label: "技術選定の裏話", desc: "「〜を選んだ理由」「〜は合わなかった」のように、なぜその技術を使ったか" },
  5: { label: "開発で学んだこと・気づき", desc: "開発を通じて得た知見、意外だったこと、考え方の変化" },
  6: { label: "AI活用の具体例", desc: "「AIに〜させたら〜だった」のように、AIをどう使ってどうなったか" },
};

function getTodayAngle() {
  const dow = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Tokyo" })).getDay();
  return ANGLE_BY_DAY[dow];
}

// ─── AI で投稿文を生成 ───
async function generateXPost() {
  const todayJST = getTodayJST();
  const dayOfWeek = getDayOfWeekJST();
  const angle = getTodayAngle();

  // Notion から直近の開発ログ + 投稿済みテキストを取得
  let devContext = null;
  let recentDrafts = [];
  let postedTexts = [];
  try {
    const [logs, posted] = await Promise.all([
      fetchRecentDevLogs(7),
      fetchRecentPostedTexts(14),
    ]);
    devContext = formatDevContext(logs);
    recentDrafts = logs.map((l) => l.draft).filter(Boolean);
    postedTexts = posted;
    console.log(`[post-x] 開発ログ ${logs.length} 件、投稿済み ${posted.length} 件取得`);
  } catch (err) {
    console.warn("[post-x] 開発ログ取得失敗（フォールバック）:", err.message);
  }

  const prompt = `今日は${todayJST}（${dayOfWeek}）です。
あなたは個人開発者のXアカウント（@create_Aiapp）の運用を代行しています。

以下の「実際の開発内容」をもとに、X（旧Twitter）の投稿文を1つ生成してください。

${devContext ? `═══ 直近の開発内容（これが最も重要な素材）═══
${devContext}
═══════════════════════════════════════` : "（開発ログの取得に失敗しました。一般的な個人開発の話題で書いてください）"}

${(() => {
    const allPast = [...new Set([...postedTexts, ...recentDrafts])];
    if (allPast.length === 0) return "";
    return `═══ 過去の投稿（これらと似た内容・構成・切り口は絶対に避けること）═══
${allPast.map((d, i) => `${i + 1}. ${d}`).join("\n")}
═══════════════════════════════════════`;
  })()}

【今日の投稿の切り口 — 最優先で従うこと】
テーマ: ${angle.label}
説明: ${angle.desc}
⚠️ このテーマに合うエピソードを開発ログから1つだけ選べ。複数の話題を詰め込むな。1投稿1エピソード。

【最重要ルール — 具体性と焦点】
- 開発ログから今日のテーマに最も合う1つのエピソードを選び、それだけを深く書け
- そのエピソードに含まれる具体的な技術名・機能名・数字を必ず使え
- 複数日の内容をまとめて書くな。1つの出来事にフォーカスしろ
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

【ハッシュタグ — 重要：同じタグの連続使用を避けること】
以下のプールから内容に最も合うものを1〜2個選べ。毎回同じタグにならないよう意識すること。
- 開発系: #個人開発 #プログラミング #開発日記 #ものづくり #webサービス
- AI系: #AI活用 #AI開発 #生成AI #Claude
- 学習系: #語学学習 #英語学習 #単語帳 #学習アプリ
- その他: #駆け出しエンジニア #19歳 #未経験エンジニア
ハッシュタグなしの投稿もOK（3回に1回程度はタグなしにする）

投稿文のみ出力してください。説明や前置きは不要。`;

  const systemPrompt = "あなたはSNS運用のプロです。開発者の実際の作業内容をもとに、リアルで共感できる投稿を作成します。断定的で短い文体、飾らない独り言トーン。宣伝臭を出さず、開発の日記・裏話として面白い投稿を書きます。ポエム調や丁寧すぎる表現は禁止。投稿文のみを出力してください。";

  let text = null;

  // Groq → Gemini フォールバック
  let lastError = null;
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
    lastError = `Groq: ${groqErr.message}`;
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
      lastError += ` / Gemini: ${geminiErr.message}`;
      return { text: null, error: lastError };
    }
  }

  if (!text) return { text: null, error: lastError || "text was empty" };

  // 余計な引用符やマークダウンを除去
  text = text.replace(/^["「『]+|["」』]+$/g, "").trim();
  // 280文字制限
  if (text.length > 280) {
    text = text.slice(0, 277) + "...";
  }

  return { text, error: null };
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
  // カスタムテキストが指定されていればそれを使う、なければAI生成
  let body = {};
  try { body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {}; } catch { /* ignore parse errors */ }

  let postText;
  let genError;
  let source = "ai";
  if (body.customText) {
    postText = body.customText;
    source = "custom";
  } else {
    // ストックから未使用の下書きを優先的に使う（dry-runでは消費しない）
    try {
      const stock = await popXStockDraft(!isDryRun);
      if (stock) {
        postText = stock.text;
        source = "stock";
        console.log("[post-x] ストックから取得:", stock.pageId);
      }
    } catch (stockErr) {
      console.warn("[post-x] ストック取得失敗:", stockErr.message);
    }

    // ストックがなければAI生成
    if (!postText) {
      const result = await generateXPost();
      postText = result?.text || null;
      genError = result?.error || null;
    }
  }

  if (!postText) {
    const errorMsg = `[post-x] 投稿文の生成に失敗しました: ${genError || "unknown"}`;
    console.error(errorMsg);
    await sendTelegramMessage(`❌ X自動投稿失敗\n${genError || "投稿文の生成に失敗しました"}`);
    return res.status(500).json({ ok: false, error: genError || "Failed to generate post" });
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

  // 投稿成功時: Notionに投稿済みテキストを保存 + Telegram通知
  const sourceLabel = source === "stock" ? "📦ストック" : source === "custom" ? "✏️カスタム" : "🤖AI生成";
  if (result.ok) {
    // 投稿済みテキストをNotionに書き戻し（次回以降の重複回避に使用）
    try {
      await savePostedText(postText);
      console.log("[post-x] 投稿済みテキストをNotionに保存");
    } catch (saveErr) {
      console.warn("[post-x] 投稿済みテキスト保存失敗:", saveErr.message);
    }
    await sendTelegramMessage(
      `✅ X自動投稿完了（${sourceLabel}）\n\n${postText}\n\nhttps://x.com/i/status/${result.tweetId}`
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

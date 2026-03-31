/**
 * X (Twitter) 自動投稿 API
 *
 * Vercel Cron から毎日 14:50 UTC（= 23:50 JST）に呼び出される。
 * 1. 当日の git コミットログを取得（Vercel上では取得不可のため AI 生成のみ）
 * 2. AI で X 投稿文を生成
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

// ─── AI で投稿文を生成 ───
async function generateXPost() {
  const todayJST = getTodayJST();
  const dayOfWeek = getDayOfWeekJST();

  const prompt = `今日は${todayJST}（${dayOfWeek}）です。
あなたは個人開発者のXアカウントの運用を代行しています。

以下のルールに従って、X（旧Twitter）の投稿文を1つ生成してください。

【プロジェクト情報】
- AI生成単語帳アプリ「Flash Auto」を個人開発中
- テーマを入力するとAIが自動で単語帳を作成する
- 語学学習・専門用語の学習に使える
- Claude Code（AI）を活用して開発を進めている

【投稿ルール】
- ターゲット: 個人開発者、語学学習者、AI活用に興味がある非エンジニア
- 内容: 技術の詳細ではなく「何が便利になったか」「どんな体験ができるか」を読者目線で書く
- アプリURLは含めない
- ハッシュタグ: #個人開発 #AI活用 #語学学習 から1〜2個使用
- 280文字以内（日本語）
- 投稿文のみ出力（説明や前置きは不要）

【口調ルール（最重要 — 必ず守ること）】
- 断定系多め。「〜かもしれない」「〜な気がする」は禁止。「〜だった」「〜の方がいい」「〜は微妙」のように言い切る
- 短い文。1文が長くならないように切る
- 少し切るような言い方。柔らかくしすぎない
- 倒置法OK。強調したいときに使う
- 比喩は控えめ。ふわふわした比喩やポエム調は禁止
- 「開発者の独り言」のようなトーン。丁寧すぎず、飾らない
- 「〜かもしれませんが〜嬉しいです」「まるで魔法のような〜」のような表現は絶対に使わない

【書式ルール】
- 1文ごとに改行を入れて読みやすくする
- 冒頭にキャッチーな一言を置き、改行で区切る
- 絵文字を適度に使う（1〜3個。多すぎない）
- ハッシュタグは最終行にまとめ、本文と1行空ける
- ダラダラ続く長文は禁止。短い文を積み重ねるスタイル

【口調の例（この温度感に合わせること）】
・「地味だけど、ここが一番まずかった」
・「直したのはUIではなく挙動の方」
・「便利そうで、実際は微妙だった」
・「検索機能つけたら精度が全然変わった。Wikipedia偉大すぎる」
・「3時間溶けた。でもやっと動いた」

【書式の例】
単語帳、手で作るの正直だるい🤔

だからAIに全部やらせることにした。
テーマ入れるだけで単語も定義も出てくる。

これが正解だった。

#個人開発 #語学学習

【バリエーション】
毎日違う切り口で書いてください。例：
- 開発の進捗・裏話
- 語学学習のあるある・コツ
- AI活用の面白さ
- 個人開発のモチベーション
- ユーザー目線の便利さ`;

  const systemPrompt = "あなたはSNS運用のプロです。断定的で短い文体、飾らない開発者の独り言のようなトーンで投稿を作成します。ポエム調や丁寧すぎる表現は禁止。投稿文のみを出力してください。";

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

  // 投稿文を生成
  const postText = await generateXPost();

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

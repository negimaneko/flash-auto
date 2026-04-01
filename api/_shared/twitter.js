/**
 * X (Twitter) 投稿モジュール
 * twitter-api-v2 を使用した OAuth 1.0a 認証
 */

import { TwitterApi } from "twitter-api-v2";

/**
 * X にツイートを投稿する
 * @param {string} text - 投稿するテキスト（280文字以内）
 * @returns {Promise<{ok: boolean, tweetId?: string, error?: string}>}
 */
export async function postTweet(text) {
  const apiKey = process.env.X_API_KEY;
  const apiSecret = process.env.X_API_KEY_SECRET;
  const accessToken = process.env.X_ACCESS_TOKEN;
  const accessSecret = process.env.X_ACCESS_TOKEN_SECRET;

  const missing = [];
  if (!apiKey) missing.push("X_API_KEY");
  if (!apiSecret) missing.push("X_API_KEY_SECRET");
  if (!accessToken) missing.push("X_ACCESS_TOKEN");
  if (!accessSecret) missing.push("X_ACCESS_TOKEN_SECRET");

  if (missing.length > 0) {
    console.error(`[Twitter] 環境変数が未設定: ${missing.join(", ")}`);
    return { ok: false, error: `Missing env: ${missing.join(", ")}` };
  }

  // デバッグ: キーの先頭4文字だけ表示（値が正しく読まれているか確認）
  console.log(`[Twitter] keys: API=${apiKey?.slice(0,4)}... SECRET=${apiSecret?.slice(0,4)}... TOKEN=${accessToken?.slice(0,4)}... TOKEN_SECRET=${accessSecret?.slice(0,4)}...`);

  try {
    const client = new TwitterApi({
      appKey: apiKey,
      appSecret: apiSecret,
      accessToken,
      accessSecret,
    });

    // v2 → v1 フォールバック
    try {
      const { data } = await client.v2.tweet(text);
      console.log("[Twitter] v2 投稿成功, tweet_id:", data.id);
      return { ok: true, tweetId: data.id };
    } catch (v2Err) {
      console.warn("[Twitter] v2 失敗:", v2Err.message, "— v1 にフォールバック");
      const tweet = await client.v1.tweet(text);
      console.log("[Twitter] v1 投稿成功, tweet_id:", tweet.id_str);
      return { ok: true, tweetId: tweet.id_str };
    }
  } catch (err) {
    const detail = err.data ? JSON.stringify(err.data) : err.message;
    console.error("[Twitter] 投稿失敗:", detail);
    console.error("[Twitter] code:", err.code, "statusCode:", err.statusCode);
    return { ok: false, error: detail };
  }
}

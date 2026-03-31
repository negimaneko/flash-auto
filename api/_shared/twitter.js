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

  try {
    const client = new TwitterApi({
      appKey: apiKey,
      appSecret: apiSecret,
      accessToken,
      accessSecret,
    });

    const { data } = await client.v2.tweet(text);
    console.log("[Twitter] 投稿成功, tweet_id:", data.id);
    return { ok: true, tweetId: data.id };
  } catch (err) {
    console.error("[Twitter] 投稿失敗:", err.message);
    return { ok: false, error: err.message };
  }
}

/**
 * Telegram 通知 API
 *
 * リモートトリガー（x-post-prep）から呼び出され、
 * X投稿の下書きをTelegramに送信する。
 *
 * POST /api/notify-telegram
 * Body: { "message": "送信するテキスト" }
 * Header: Authorization: Bearer <CRON_SECRET>
 *
 * テスト: POST /api/notify-telegram?test=1
 */

import { sendTelegramMessage } from "./_shared/telegram.js";

export default async function handler(req, res) {
  console.log("[notify-telegram] 実行開始:", new Date().toISOString());

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // 認証
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const isTest = url.searchParams.get("test") === "1";
  const cronSecret = process.env.CRON_SECRET;

  if (!isTest) {
    if (!cronSecret) {
      console.warn("[notify-telegram] CRON_SECRET 未設定 — 認証スキップ");
    } else {
      const authHeader = req.headers.authorization || "";
      if (authHeader !== `Bearer ${cronSecret}`) {
        return res.status(401).json({ error: "Unauthorized" });
      }
    }
  }

  // メッセージ取得
  const { message } = req.body || {};
  if (!message || typeof message !== "string") {
    return res.status(400).json({ error: "message は必須です" });
  }

  if (message.length > 4096) {
    return res.status(400).json({ error: "メッセージが長すぎます（4096文字以内）" });
  }

  // Telegram 送信
  const result = await sendTelegramMessage(message);

  console.log("[notify-telegram] 完了:", { sent: result.ok });

  return res.status(result.ok ? 200 : 500).json({
    ok: result.ok,
    error: result.error || undefined,
  });
}

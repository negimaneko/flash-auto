/**
 * Telegram メッセージ送信モジュール
 */

const TELEGRAM_API_BASE = "https://api.telegram.org";

/**
 * Telegram にメッセージを送信する
 * @param {string} text - 送信するメッセージ（MarkdownV2 または プレーンテキスト）
 * @param {object} [options]
 * @param {string} [options.parseMode] - "MarkdownV2" | "HTML" | undefined
 * @returns {Promise<{ok: boolean, messageId?: number, error?: string}>}
 */
export async function sendTelegramMessage(text, options = {}) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!botToken || !chatId) {
    const missing = [];
    if (!botToken) missing.push("TELEGRAM_BOT_TOKEN");
    if (!chatId) missing.push("TELEGRAM_CHAT_ID");
    console.error(`[Telegram] 環境変数が未設定: ${missing.join(", ")}`);
    return { ok: false, error: `Missing env: ${missing.join(", ")}` };
  }

  const url = `${TELEGRAM_API_BASE}/bot${botToken}/sendMessage`;

  const body = {
    chat_id: chatId,
    text,
  };

  if (options.parseMode) {
    body.parse_mode = options.parseMode;
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (!data.ok) {
      console.error("[Telegram] 送信失敗:", data.description || data);
      return { ok: false, error: data.description || "Send failed" };
    }

    console.log("[Telegram] 送信成功, message_id:", data.result?.message_id);
    return { ok: true, messageId: data.result?.message_id };
  } catch (err) {
    console.error("[Telegram] ネットワークエラー:", err.message);
    return { ok: false, error: err.message };
  }
}

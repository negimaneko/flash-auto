/**
 * IP単位のインメモリレート制限
 *
 * Vercel Serverless ではウォームインスタンス内でメモリが共有されるため、
 * 同一インスタンスへの連続リクエストを制限できる。
 * コールドスタート時にはリセットされるが、バースト攻撃（DevTools連打等）には有効。
 */

/** @type {Map<string, number[]>} IP → タイムスタンプ配列 */
const ipRequestMap = new Map();

/** 古いエントリを定期的にクリーンアップ（メモリリーク防止） */
const CLEANUP_INTERVAL_MS = 60_000;
let lastCleanup = Date.now();

function cleanup(windowMs) {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;
  const cutoff = now - windowMs;
  for (const [ip, timestamps] of ipRequestMap) {
    const valid = timestamps.filter((t) => t > cutoff);
    if (valid.length === 0) {
      ipRequestMap.delete(ip);
    } else {
      ipRequestMap.set(ip, valid);
    }
  }
}

/**
 * リクエスト元IPを取得する。
 * Vercel では x-forwarded-for ヘッダーにクライアントIPが入る。
 */
export function getClientIp(req) {
  // Vercel が設定する x-real-ip はクライアント偽装不可（プラットフォーム側で上書き）
  const realIp = req.headers["x-real-ip"];
  if (realIp) {
    return String(realIp).trim();
  }
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) {
    return String(forwarded).split(",")[0].trim();
  }
  return req.socket?.remoteAddress || "unknown";
}

/**
 * レート制限をチェックする。
 *
 * @param {object} req - リクエストオブジェクト
 * @param {object} res - レスポンスオブジェクト
 * @param {object} options
 * @param {number} options.maxRequests - ウィンドウ内の最大リクエスト数
 * @param {number} options.windowMs - ウィンドウの長さ（ミリ秒）
 * @param {string} [options.prefix] - 同一IPでもエンドポイント別にカウントするためのプレフィックス
 * @returns {boolean} true = レート制限超過（呼び出し側はreturnすべき）
 */
export function checkRateLimit(req, res, { maxRequests, windowMs, prefix = "" }) {
  cleanup(windowMs);

  const ip = getClientIp(req);
  const key = prefix ? `${prefix}:${ip}` : ip;
  const now = Date.now();
  const cutoff = now - windowMs;

  const timestamps = (ipRequestMap.get(key) || []).filter((t) => t > cutoff);

  if (timestamps.length >= maxRequests) {
    res.status(429).json({
      error: "リクエストが多すぎます。しばらく待ってから再試行してください。",
    });
    return true;
  }

  timestamps.push(now);
  ipRequestMap.set(key, timestamps);
  return false;
}

/**
 * CORS設定 - 許可ドメインを限定する
 *
 * 本番: https://flashauto.vercel.app
 * 開発: http://localhost:5173
 */

const ALLOWED_ORIGINS = [
  "https://flashauto.vercel.app",
  "http://localhost:5173",
];

/**
 * リクエスト元が許可ドメインかチェックし、CORSヘッダーをセットする。
 * 許可されていないドメインからのリクエストにはCORSヘッダーを付けない
 * （ブラウザが自動的にブロックする）。
 */
export function setCors(req, res) {
  const origin = req.headers.origin;

  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  }
}

/**
 * OPTIONSプリフライトを処理する。
 * 許可ドメインならCORSヘッダー付きで200を返す。
 * 返り値: true = プリフライト処理済み（呼び出し側はreturnすべき）
 */
export function handlePreflight(req, res) {
  setCors(req, res);

  if (req.method === "OPTIONS") {
    res.status(200).end();
    return true;
  }

  return false;
}

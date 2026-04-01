/**
 * Notion API ヘルパー
 * 開発ログDBから最新エントリを取得する
 */

const NOTION_API = "https://api.notion.com/v1";
const DEV_LOG_DB_ID = "4491dc36-089f-459f-96fd-9f965a1cec7c";

function getHeaders() {
  const token = process.env.NOTION_API_KEY;
  if (!token) throw new Error("NOTION_API_KEY が未設定です");
  return {
    Authorization: `Bearer ${token}`,
    "Notion-Version": "2022-06-28",
    "Content-Type": "application/json",
  };
}

/**
 * 開発ログDBから直近 n 件を取得
 * @param {number} limit 取得件数（デフォルト3）
 * @returns {Array<{date: string, summary: string, draft: string, commits: number, added: number, deleted: number, project: string}>}
 */
export async function fetchRecentDevLogs(limit = 3) {
  const res = await fetch(`${NOTION_API}/databases/${DEV_LOG_DB_ID}/query`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({
      sorts: [{ property: "日付", direction: "descending" }],
      page_size: limit,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Notion API エラー (${res.status}): ${body}`);
  }

  const data = await res.json();

  return data.results.map((page) => {
    const p = page.properties;
    return {
      date: p["日付"]?.title?.[0]?.plain_text || "",
      summary: p["サマリー"]?.rich_text?.[0]?.plain_text || "",
      draft: p["X投稿 下書き"]?.rich_text?.[0]?.plain_text || "",
      commits: p["コミット数"]?.number || 0,
      added: p["追加行数"]?.number || 0,
      deleted: p["削除行数"]?.number || 0,
      project: p["プロジェクト"]?.select?.name || "",
      posted: p["投稿済み"]?.checkbox || false,
    };
  });
}

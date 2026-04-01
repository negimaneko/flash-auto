/**
 * Notion API ヘルパー
 * 開発ログDBから最新エントリを取得する
 */

const NOTION_API = "https://api.notion.com/v1";
const DEV_LOG_DB_ID = "4491dc36-089f-459f-96fd-9f965a1cec7c";
const CC_TOOLS_DB_ID = "d7504663-b810-4297-8dea-af4d2b3d9237";

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

/**
 * CC Tools DBから既存エントリの名前一覧を取得（重複チェック用）
 * @returns {Set<string>} 既存ツール名のSet
 */
export async function fetchCCToolNames() {
  const results = [];
  let cursor;

  do {
    const body = {
      page_size: 100,
      ...(cursor && { start_cursor: cursor }),
    };
    const res = await fetch(`${NOTION_API}/databases/${CC_TOOLS_DB_ID}/query`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Notion API エラー (${res.status}): ${text}`);
    }
    const data = await res.json();
    for (const page of data.results) {
      const name = page.properties["名前"]?.title?.[0]?.plain_text;
      if (name) results.push(name.toLowerCase());
    }
    cursor = data.has_more ? data.next_cursor : null;
  } while (cursor);

  return new Set(results);
}

/**
 * CC Tools DBに新規エントリを作成
 * @param {{ name: string, category: string, environment: string, url: string, summary: string }} entry
 */
export async function createCCToolEntry({ name, category, environment, url, summary, rank }) {
  const res = await fetch(`${NOTION_API}/pages`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({
      parent: { database_id: CC_TOOLS_DB_ID },
      properties: {
        "名前": { title: [{ text: { content: name } }] },
        "カテゴリ": { select: { name: category } },
        "対応環境": { select: { name: environment } },
        "導入済み": { checkbox: false },
        ...(rank && { "ランク": { select: { name: rank } } }),
        "発見日": { date: { start: new Date().toISOString().split("T")[0] } },
        "URL": { url: url || null },
        "概要": { rich_text: [{ text: { content: summary.slice(0, 2000) } }] },
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Notion 書き込みエラー (${res.status}): ${text}`);
  }
  return res.json();
}

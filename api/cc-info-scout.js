/**
 * CC Info Scout — Claude Code 関連の新ツール・プラグイン・機能を自動収集
 * Vercel Cron で月水金 09:00 JST に実行
 *
 * 処理フロー:
 *   1. 情報源から新しいツール情報を収集
 *   2. 既存の CC Tools DB と照合して重複を除外
 *   3. 新規のみ Gemini で1行要約を生成
 *   4. Notion CC Tools DB に書き込み
 */

import { fetchCCToolNames, createCCToolEntry } from "./_shared/notion.js";
import { requestGeminiChat } from "./_shared/gemini.js";

// ── 情報源 ──────────────────────────────────────────

const GITHUB_SOURCES = [
  { owner: "anthropics", repo: "claude-code", label: "公式" },
];

const NPM_KEYWORDS = ["claude-code", "claude-mcp", "claude-plugin"];

// ── GitHub: 直近7日のリリース・タグを取得 ──────────────

async function fetchGitHubReleases(owner, repo) {
  const since = new Date(Date.now() - 7 * 86400_000).toISOString();
  const url = `https://api.github.com/repos/${owner}/${repo}/releases?per_page=10`;
  const res = await fetch(url, {
    headers: { "User-Agent": "cc-info-scout" },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) return [];
  const releases = await res.json();
  return releases
    .filter((r) => new Date(r.published_at) >= new Date(since))
    .map((r) => ({
      name: `${repo} ${r.tag_name}`,
      url: r.html_url,
      raw: r.name || r.tag_name,
      category: "新機能",
      environment: "両方",
    }));
}

// ── npm パッケージのカテゴリ判定 ──────────────────────

function classifyNpmPackage(name, description) {
  const text = `${name} ${description}`.toLowerCase();
  if (/\bmcp\b/.test(text)) return "MCP Server";
  if (/\bplugin\b/.test(text)) return "プラグイン";
  if (/\bskill\b/.test(text)) return "スキル";
  return "プラグイン";
}

// ── npm registry: キーワードで新パッケージを検索 ──────

async function searchNpm(keyword) {
  const url = `https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(keyword)}&size=10`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) return [];
  const data = await res.json();

  const oneWeekAgo = Date.now() - 7 * 86400_000;
  return (data.objects || [])
    .filter((o) => new Date(o.package.date) >= oneWeekAgo)
    .map((o) => ({
      name: o.package.name,
      url: `https://www.npmjs.com/package/${o.package.name}`,
      raw: o.package.description || "",
      category: classifyNpmPackage(o.package.name, o.package.description || ""),
      environment: "不明",
    }));
}

// ── Gemini で要約を生成 ───────────────────────────────

async function summarize(toolName, rawInfo) {
  try {
    return await requestGeminiChat({
      prompt: `以下のツール/機能について、1行（50文字以内）で日本語の要約を書いてください。要約のみ出力してください。\n\n名前: ${toolName}\n情報: ${rawInfo}`,
      maxTokens: 100,
      temperature: 0.3,
    });
  } catch {
    return rawInfo.slice(0, 100);
  }
}

// ── メイン処理 ────────────────────────────────────────

export default async function handler(req, res) {
  try {
    // 1. 既存エントリ取得（重複チェック用）
    const existing = await fetchCCToolNames();

    // 2. 全ソースから並列収集
    const tasks = [
      ...GITHUB_SOURCES.map((s) => fetchGitHubReleases(s.owner, s.repo)),
      ...NPM_KEYWORDS.map((kw) => searchNpm(kw)),
    ];
    const results = (await Promise.allSettled(tasks))
      .filter((r) => r.status === "fulfilled")
      .flatMap((r) => r.value);

    // 3. 重複除外
    const seen = new Set();
    const newItems = results.filter((item) => {
      const key = item.name.toLowerCase();
      if (existing.has(key) || seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // 4. 要約生成 → Notion書き込み（ランクは後でClaudeが判定）
    let added = 0;
    for (const item of newItems.slice(0, 15)) {
      const summary = await summarize(item.name, item.raw);
      await createCCToolEntry({
        name: item.name,
        category: item.category,
        environment: item.environment,
        url: item.url,
        summary: summary.trim(),
      });
      added++;
    }

    const message = `CC Info Scout 完了: ${results.length}件収集 → ${newItems.length}件が新規 → ${added}件をNotionに追加`;
    console.log(message);
    return res.status(200).json({ ok: true, message, collected: results.length, new: newItems.length, added });
  } catch (err) {
    console.error("CC Info Scout エラー:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}

import { setCors, handlePreflight } from "./_shared/cors.js";
import { checkRateLimit } from "./_shared/rate-limit.js";
import {
  isSupabaseConfigured,
  getSupabaseAdmin,
} from "./_shared/supabase.js";

/**
 * 公開ライブラリ API
 *
 * GET  ?action=list[&q=...&tag=...]  公開デッキ一覧
 * POST { action: "publish", deck, userId }  デッキを公開
 * POST { action: "fav", deckId, delta }     お気に入り増減
 */
export default async function handler(req, res) {
  if (handlePreflight(req, res)) return;
  setCors(req, res);

  if (!isSupabaseConfigured()) {
    return res.status(503).json({ error: "データベースが設定されていません。" });
  }

  const sb = getSupabaseAdmin();

  // --- GET: 一覧取得 ---
  if (req.method === "GET") {
    return handleList(req, res, sb);
  }

  // --- POST ---
  if (req.method === "POST") {
    const { action } = req.body || {};

    if (action === "publish") {
      if (checkRateLimit(req, res, { maxRequests: 10, windowMs: 60_000, prefix: "pub-lib" })) return;
      return handlePublish(req, res, sb);
    }

    if (action === "fav") {
      if (checkRateLimit(req, res, { maxRequests: 30, windowMs: 60_000, prefix: "pub-fav" })) return;
      return handleFav(req, res, sb);
    }

    return res.status(400).json({ error: "不明なアクションです。" });
  }

  res.status(405).json({ error: "Method not allowed" });
}

// ─── 一覧取得 ───
async function handleList(req, res, sb) {
  const { q, tag, limit: rawLimit, offset: rawOffset } = req.query;
  const limit = Math.min(parseInt(rawLimit) || 30, 100);
  const offset = parseInt(rawOffset) || 0;

  let query = sb
    .from("public_decks")
    .select("id, deck_name, author, word_lang, def_lang, detail_level, tags, cards, card_count, save_count, published_by, created_at")
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  // テキスト検索（デッキ名の部分一致）
  if (q && q.trim()) {
    query = query.ilike("deck_name", `%${q.trim()}%`);
  }

  // タグフィルタ（JSONB配列に含まれるか）
  if (tag && tag.trim()) {
    query = query.contains("tags", JSON.stringify([tag.trim()]));
  }

  const { data, error } = await query;

  if (error) {
    console.error("public_decks select error:", error);
    return res.status(500).json({ error: "データ取得に失敗しました。" });
  }

  const decks = (data || []).map(mapRow);
  return res.status(200).json({ decks });
}

// ─── 投稿 ───
async function handlePublish(req, res, sb) {
  const { deck, userId } = req.body || {};

  if (!deck || !deck.name || !Array.isArray(deck.cards) || deck.cards.length === 0) {
    return res.status(400).json({ error: "デッキ名とカードは必須です。" });
  }

  if (deck.cards.length > 200) {
    return res.status(400).json({ error: "カードは200枚までです。" });
  }

  // カードを必要最低限のフィールドに絞る
  const cleanCards = deck.cards.map((c) => ({
    word: String(c.word || "").slice(0, 200),
    definition: String(c.definition || "").slice(0, 1000),
  }));

  const row = {
    deck_name: String(deck.name).slice(0, 100),
    author: String(deck.author || "匿名").slice(0, 50),
    word_lang: String(deck.wordLang || "en").slice(0, 20),
    def_lang: String(deck.defLang || "ja").slice(0, 20),
    detail_level: Math.max(1, Math.min(3, parseInt(deck.detailLevel) || 2)),
    tags: (deck.tags || []).slice(0, 10).map((t) => String(t).slice(0, 30)),
    cards: cleanCards,
    card_count: cleanCards.length,
    published_by: userId || null,
    source_deck_id: deck.id ? String(deck.id).slice(0, 100) : null,
  };

  // source_deck_id + published_by が一致する既存行があれば更新、なければ挿入
  const { data, error } = await sb
    .from("public_decks")
    .upsert(row, { onConflict: "published_by,source_deck_id", ignoreDuplicates: false })
    .select("id, created_at")
    .single();

  if (error) {
    console.error("public_decks insert error:", error);
    return res.status(500).json({ error: "公開に失敗しました。" });
  }

  return res.status(201).json({ id: data.id, created_at: data.created_at });
}

// ─── お気に入り増減 ───
async function handleFav(req, res, sb) {
  const { deckId, delta } = req.body || {};

  if (!deckId || (delta !== 1 && delta !== -1)) {
    return res.status(400).json({ error: "deckId と delta(1 or -1) は必須です。" });
  }

  const { data: result, error: rpcErr } = await sb
    .rpc("increment_save_count", { deck_id: deckId, delta });

  if (rpcErr) {
    console.error("increment_save_count error:", rpcErr);
    const is404 = rpcErr.message?.includes("Deck not found");
    return res.status(is404 ? 404 : 500).json({
      error: is404 ? "デッキが見つかりません。" : "更新に失敗しました。",
    });
  }

  return res.status(200).json({ save_count: result });
}

// ─── DB行 → クライアント形式に変換 ───
function mapRow(row) {
  return {
    id: "pub-" + row.id,
    publicId: row.id,
    name: row.deck_name,
    author: row.author,
    wordLang: row.word_lang,
    defLang: row.def_lang,
    detailLevel: row.detail_level,
    tags: row.tags || [],
    cards: (row.cards || []).map((c, i) => ({
      id: `pub-${row.id}-${i}`,
      word: c.word || "",
      definition: c.definition || "",
    })),
    cardCount: row.card_count,
    favCount: row.save_count || 0,
    publishedBy: row.published_by,
    createdAt: row.created_at,
    isPublic: true,
    favorited: false,
    cleared: false,
    masteredIds: [],
  };
}

import { supabase } from "./supabase.js";

// サンプル（シード）デッキはアカウントに同期しない
export const isSeedDeck = (id) => String(id).startsWith("seed-");

// サーバーからログインユーザーの単語帳を取得
export async function fetchUserDecks(userId) {
  if (!supabase || !userId) return [];
  const { data, error } = await supabase
    .from("user_decks")
    .select("data")
    .eq("user_id", userId);
  if (error) {
    console.error("[deckSync] 取得エラー:", error);
    return [];
  }
  return (data || []).map((row) => row.data).filter(Boolean);
}

// 単語帳をサーバーに保存（作成・更新）
export async function upsertUserDecks(userId, decks) {
  if (!supabase || !userId || !decks?.length) return;
  const rows = decks
    .filter((d) => d && d.id != null && !isSeedDeck(d.id))
    .map((d) => ({
      user_id: userId,
      deck_id: String(d.id),
      data: d,
      updated_at: new Date().toISOString(),
    }));
  if (!rows.length) return;
  const { error } = await supabase
    .from("user_decks")
    .upsert(rows, { onConflict: "user_id,deck_id" });
  if (error) console.error("[deckSync] 保存エラー:", error);
}

// 単語帳をサーバーから削除
export async function deleteUserDecks(userId, deckIds) {
  if (!supabase || !userId || !deckIds?.length) return;
  const { error } = await supabase
    .from("user_decks")
    .delete()
    .eq("user_id", userId)
    .in("deck_id", deckIds.map(String));
  if (error) console.error("[deckSync] 削除エラー:", error);
}

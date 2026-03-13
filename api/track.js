/**
 * POST /api/track
 * イベントログをサーバー経由で Supabase に保存する。
 *
 * body: {
 *   anonymousUserId: string,  // localStorage の UUID
 *   eventName:       string,  // 許可リスト参照
 *   metadata:        object   // 任意の付加情報
 * }
 *
 * - Supabase 未設定時はサイレントに 200 を返す
 * - 記録失敗時もサイレントに 200 を返す（UX に影響させない）
 */

import { getSupabaseAdmin, isSupabaseConfigured } from "./_shared/supabase.js";
import { handlePreflight, setCors } from "./_shared/cors.js";

const ALLOWED_EVENTS = new Set([
  "app_open",
  "signup_guest",
  "generate_word",
  "generate_theme_deck",
  "save_deck",
  "review_card",
  "return_visit",
  "login_upgrade",
]);

export default async function handler(req, res) {
  if (handlePreflight(req, res)) return;
  setCors(req, res);

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const { anonymousUserId, eventName, metadata, isInternal } = req.body || {};

  // バリデーション
  if (!anonymousUserId || typeof anonymousUserId !== "string" || anonymousUserId.length > 128) {
    res.status(400).json({ error: "anonymousUserId is required" });
    return;
  }

  if (!eventName || !ALLOWED_EVENTS.has(eventName)) {
    res.status(400).json({ error: "Invalid eventName" });
    return;
  }

  // Supabase 未設定時はスキップ（ローカル開発やSupabase未連携環境）
  if (!isSupabaseConfigured()) {
    res.status(200).json({ ok: true });
    return;
  }

  const supabase = getSupabaseAdmin();

  try {
    // users テーブルに upsert（初回 → INSERT / 再訪問 → last_seen_at を更新）
    const upsertData = {
      anonymous_user_id: anonymousUserId,
      last_seen_at: new Date().toISOString(),
    };
    // isInternal フラグが true の場合のみ設定（一度 true になったら戻さない）
    if (isInternal === true) {
      upsertData.is_internal = true;
    }

    const { data: user, error: upsertError } = await supabase
      .from("users")
      .upsert(upsertData, { onConflict: "anonymous_user_id" })
      .select("id")
      .single();

    if (upsertError) throw upsertError;

    // events テーブルに INSERT
    const { error: insertError } = await supabase.from("events").insert({
      user_id: user.id,
      event_name: eventName,
      metadata: metadata || null,
    });

    if (insertError) throw insertError;

    res.status(200).json({ ok: true });
  } catch (e) {
    // 記録失敗はクライアントに伝えない
    console.error("[/api/track] error:", e?.message ?? e);
    res.status(200).json({ ok: true });
  }
}

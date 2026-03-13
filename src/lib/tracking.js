/**
 * tracking.js
 * 匿名ユーザーID管理とイベントトラッキングの共通処理
 *
 * 責務:
 * - localStorage への anonymous_user_id の永続化
 * - 旧キー名からの移行（後方互換）
 * - trackEvent() 経由でサーバーにイベントを送信
 */

const ANON_ID_KEY = "mnemox_anon_id";
const LEGACY_KEY = "flash auto-anonymous-user-id"; // 旧キー（スペースあり）移行用

function buildAnonymousUserId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `anon-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * ユーザーが新規かどうかを判定する。
 * getAnonymousUserId() を呼ぶ前に実行すること（呼び出し後は常に false になる）。
 */
export function isNewUser() {
  if (typeof window === "undefined") return false;
  try {
    const hasNew = !!window.localStorage.getItem(ANON_ID_KEY);
    const hasLegacy = !!window.localStorage.getItem(LEGACY_KEY);
    return !hasNew && !hasLegacy;
  } catch {
    return false;
  }
}

/**
 * 匿名ユーザーIDを取得する。存在しない場合は生成して保存する。
 * 旧キー（"flash auto-anonymous-user-id"）があれば新キーへ自動移行する。
 */
export function getAnonymousUserId() {
  if (typeof window === "undefined") return null;
  try {
    // 旧キーから新キーへの移行（一度だけ実行される）
    const legacy = window.localStorage.getItem(LEGACY_KEY);
    if (legacy && !window.localStorage.getItem(ANON_ID_KEY)) {
      window.localStorage.setItem(ANON_ID_KEY, legacy);
    }

    const existing = window.localStorage.getItem(ANON_ID_KEY);
    if (existing) return existing;

    const nextId = buildAnonymousUserId();
    window.localStorage.setItem(ANON_ID_KEY, nextId);
    return nextId;
  } catch {
    return null;
  }
}

/**
 * イベントをサーバー経由で Supabase に記録する。
 * fire-and-forget: 失敗しても UX に影響しない。
 *
 * @param {string} eventName - イベント名（ALLOWED_EVENTS に含まれるもの）
 * @param {object} metadata  - 付加情報（任意）
 */
export async function trackEvent(eventName, metadata = {}) {
  const userId = getAnonymousUserId();
  if (!userId) return;
  try {
    await fetch("/api/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ anonymousUserId: userId, eventName, metadata }),
    });
  } catch {
    // サイレントに失敗（ユーザーには見せない）
  }
}

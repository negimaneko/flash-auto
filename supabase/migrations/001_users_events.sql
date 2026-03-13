-- ============================================================
-- MNEMOX Migration 001: users + events テーブル導入
-- 実行場所: Supabase SQL Editor
-- ============================================================

-- ① users テーブル（ゲストユーザー管理）
CREATE TABLE IF NOT EXISTS users (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_guest          BOOLEAN NOT NULL DEFAULT TRUE,
  anonymous_user_id TEXT NOT NULL UNIQUE,  -- フロントの localStorage UUID
  device_id         TEXT,                  -- 将来のフィンガープリント用（nullable）
  email             TEXT UNIQUE,           -- 昇格時に設定（nullable）
  upgraded_at       TIMESTAMPTZ            -- guest→正式アカウントの日時（nullable）
);

CREATE INDEX IF NOT EXISTS idx_users_anonymous_user_id ON users (anonymous_user_id);

-- ② events テーブル（イベントログ）
CREATE TABLE IF NOT EXISTS events (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_name  TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata    JSONB
);

CREATE INDEX IF NOT EXISTS idx_events_user_id     ON events (user_id);
CREATE INDEX IF NOT EXISTS idx_events_event_name  ON events (event_name);
CREATE INDEX IF NOT EXISTS idx_events_occurred_at ON events (occurred_at DESC);

-- ③ deck_cache に user_id を追加（nullable: 既存データを壊さない）
ALTER TABLE deck_cache
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id);

-- ============================================================
-- RLS は無効のまま（サービスロールキー経由でサーバーから書くため）
-- ============================================================

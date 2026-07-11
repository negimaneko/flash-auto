-- ログインユーザーの単語帳（マイセット）をアカウントに保存・端末間同期するためのテーブル
-- 進捗（cleared / masteredIds / カードの streak）も data(jsonb) に含めて丸ごと保存する
create table if not exists public.user_decks (
  user_id uuid not null references auth.users(id) on delete cascade,
  deck_id text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, deck_id)
);

-- 検索用インデックス（ユーザー単位の取得）
create index if not exists user_decks_user_id_idx
  on public.user_decks (user_id);

-- 行レベルセキュリティ：本人の行だけ読み書きできる
alter table public.user_decks enable row level security;

drop policy if exists "user_decks_select_own" on public.user_decks;
create policy "user_decks_select_own"
  on public.user_decks for select
  using (auth.uid() = user_id);

drop policy if exists "user_decks_insert_own" on public.user_decks;
create policy "user_decks_insert_own"
  on public.user_decks for insert
  with check (auth.uid() = user_id);

drop policy if exists "user_decks_update_own" on public.user_decks;
create policy "user_decks_update_own"
  on public.user_decks for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "user_decks_delete_own" on public.user_decks;
create policy "user_decks_delete_own"
  on public.user_decks for delete
  using (auth.uid() = user_id);

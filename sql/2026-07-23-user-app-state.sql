-- 端末ローカルにしか無かったユーザーデータをアカウントへ紐づける。
-- 対象: 重要マーク / 通知ベル / 通知ON / 非表示作品 / 作品ごとの色
-- 目的: ①別端末でログインしたときに引き継がれる ②ログアウトしても再ログインで必ず戻る
-- クライアントは本人の行だけを読み書きする（他人には一切見えない）。

create table if not exists public.user_app_state (
  user_id             uuid primary key references auth.users(id) on delete cascade,
  important_event_ids jsonb,   -- string[]
  bell_event_ids      jsonb,   -- string[]
  notify_event_ids    jsonb,   -- string[]
  hidden_work_ids     jsonb,   -- string[]
  work_colors         jsonb,   -- Record<workId, colorHex>
  updated_at          timestamptz not null default now()
);

alter table public.user_app_state enable row level security;

-- 名前不明の残存ポリシーを一掃してから貼り直す（2026-07-22のRLS監査で踏んだ罠の対策）
do $$
declare p record;
begin
  for p in select policyname from pg_policies
            where schemaname = 'public' and tablename = 'user_app_state'
  loop
    execute format('drop policy %I on public.user_app_state', p.policyname);
  end loop;
end $$;

create policy user_app_state_select_own on public.user_app_state
  for select to authenticated using (user_id = auth.uid());
create policy user_app_state_insert_own on public.user_app_state
  for insert to authenticated with check (user_id = auth.uid());
create policy user_app_state_update_own on public.user_app_state
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 確認用:
--   select count(*) from public.user_app_state;

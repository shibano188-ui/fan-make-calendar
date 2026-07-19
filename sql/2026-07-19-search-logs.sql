-- データ資産化②の素材: 検索クエリログ
-- ユーザーが実際に入力する略称・呼び方と、そのヒット件数（0件=辞書の穴）、
-- 検索後に選んだ作品名（表記ゆれペアの右辺）を記録する。
-- クライアントは insert のみ。閲覧は service_role に限る。

create table if not exists search_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  context text not null,       -- 'explore' | 'saved' | 'work_follow' | 'post_work'
  query text not null,
  result_count int,            -- 検索時のヒット件数（0=表記ゆれ辞書の候補）
  picked text,                 -- 検索後に選んだ/フォローした作品名（query→picked が別名ペア）
  created_at timestamptz not null default now()
);

alter table search_logs enable row level security;

drop policy if exists "search_logs_insert" on search_logs;
create policy "search_logs_insert" on search_logs
  for insert to authenticated
  with check (user_id is null or auth.uid() = user_id);

create index if not exists idx_search_logs_context on search_logs (context, created_at);
create index if not exists idx_search_logs_query on search_logs (query);

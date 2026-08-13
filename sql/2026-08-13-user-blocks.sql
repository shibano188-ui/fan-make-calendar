-- ============================================================================
-- ユーザーのブロック
--
-- App Store の審査要件（ガイドライン 1.2 ユーザー生成コンテンツ）で、
-- 投稿を扱うアプリには「迷惑なユーザーをブロックできること」が要る。
-- 通報（reports）は投稿1件ごとの申告なので、投稿者そのものを遮断できなかった。
--
-- ブロックは「自分の画面から相手の投稿を消す」だけの片方向の設定。
-- events（共有データ）には触らないので、他の人の見え方は変わらない。
-- 相手には通知しないし、ブロックされたことも分からない。
-- ============================================================================

create table if not exists public.blocks (
  blocker_id uuid not null,
  blocked_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint blocks_not_self check (blocker_id <> blocked_id)
);

create index if not exists blocks_blocker_idx on public.blocks (blocker_id);

alter table public.blocks enable row level security;

-- 本人のみ読み書き。誰にブロックされているかは誰にも見えない
-- （相手から見えると「ブロックされた」と分かってしまう）
drop policy if exists blocks_select on public.blocks;
drop policy if exists blocks_insert on public.blocks;
drop policy if exists blocks_delete on public.blocks;
create policy blocks_select on public.blocks for select using (blocker_id = auth.uid());
create policy blocks_insert on public.blocks for insert with check (blocker_id = auth.uid());
create policy blocks_delete on public.blocks for delete using (blocker_id = auth.uid());

-- 投稿の方法の作り直し（2026-09-29）。**足すだけ**（既存のテーブル・ポリシーには触らない）。
-- 古い iOS の画面は新しいテーブルを読まないので、何も変わらない。
--   personal_events … 自分用の予定（本人だけが読み書きできる）
--   info_submissions … 「情報を送る」で送られた情報（ボットが処理する）
--   edit_proposals   … ＋α の重要な修正の提案（ボットがリンクで確かめてから event_edits 等に書く）

-- ── 自分用の予定 ─────────────────────────────────────────
create table if not exists public.personal_events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  work_id     uuid not null references public.works(id) on delete cascade,
  title       text not null check (length(title) between 1 and 200),
  event_date  date,
  end_date    date,
  event_time  time,
  category    text,
  memo        text check (memo is null or length(memo) <= 2000),
  image_url   text,
  link_url    text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists personal_events_user_idx on public.personal_events (user_id, event_date);

alter table public.personal_events enable row level security;
drop policy if exists pe_owner on public.personal_events;
create policy pe_owner on public.personal_events for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ── 情報を送る ───────────────────────────────────────────
-- status: pending（未処理）→ published（新しい予定にした）/ merged（既存の予定にURLを足した）/
--         needs_review（ボットでは決められない。運営が見る）/ rejected（読めなかった等）
create table if not exists public.info_submissions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  work_name       text not null check (length(work_name) between 1 and 100),
  urls            text[] not null check (cardinality(urls) between 1 and 10),
  comment         text check (comment is null or length(comment) <= 500),
  status          text not null default 'pending' check (status in ('pending', 'published', 'merged', 'needs_review', 'rejected')),
  reason          text,
  result_event_ids uuid[],
  created_at      timestamptz not null default now(),
  processed_at    timestamptz
);
create index if not exists info_submissions_pending_idx on public.info_submissions (created_at) where status = 'pending';

alter table public.info_submissions enable row level security;
drop policy if exists is_insert_self on public.info_submissions;
drop policy if exists is_select_self on public.info_submissions;
create policy is_insert_self on public.info_submissions for insert to authenticated with check (user_id = auth.uid());
-- 送った本人は結果を見られる。運営は全部見られる
create policy is_select_self on public.info_submissions for select to authenticated
  using (user_id = auth.uid() or public.is_staff_admin());

-- ── ＋α の提案 ───────────────────────────────────────────
-- patch は event_edits.patch と同じ形（date / preorderEnd / saleStatus / price …）。
-- 購入リンクの追加は patch.addedOfferUrl に入れる。evidence_urls は一緒に貼られたURL（裏付けに使う）。
-- status: pending → applied（確かめて反映した）/ rejected（食い違い・期限切れ）
create table if not exists public.edit_proposals (
  id            uuid primary key default gen_random_uuid(),
  event_id      uuid not null references public.events(id) on delete cascade,
  patch         jsonb not null,
  evidence_urls text[] not null default '{}',
  created_by    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  status        text not null default 'pending' check (status in ('pending', 'applied', 'rejected')),
  reason        text,
  created_at    timestamptz not null default now(),
  checked_at    timestamptz
);
create index if not exists edit_proposals_pending_idx on public.edit_proposals (created_at) where status = 'pending';
create index if not exists edit_proposals_event_idx on public.edit_proposals (event_id, created_at);

alter table public.edit_proposals enable row level security;
drop policy if exists ep_select on public.edit_proposals;
drop policy if exists ep_insert_self on public.edit_proposals;
-- 確認中の提案は詳細に出して、ほかの人が「合っている」を押せるようにする（Waze 式）ので誰でも読める
create policy ep_select on public.edit_proposals for select using (true);
create policy ep_insert_self on public.edit_proposals for insert to authenticated
  with check (created_by = auth.uid() and status = 'pending');
-- 更新（反映・却下）はボット（service role）だけ。クライアントには update/delete のポリシーを作らない

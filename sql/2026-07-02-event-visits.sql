-- ============================================================================
-- 個人の「行く日（来店予定）」テーブル
--
-- 長期イベントは全期間カレンダーに出て煩わしいという要望への対応。
-- ユーザーが行く日/期間を登録すると、自分の保存カレンダーではその日だけ表示する。
-- events（共有データ）は一切書き換えない。ここは本人しか読めない完全プライベート。
-- (user, event) に複数行OK＝別日に複数回行くケースに対応。単日は start=end。
-- ============================================================================

create table if not exists public.event_visits (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references public.events(id) on delete cascade,
  user_id    uuid not null,
  start_date date not null,
  end_date   date not null,
  created_at timestamptz not null default now()
);

create index if not exists event_visits_user_event_idx on public.event_visits (user_id, event_id);

alter table public.event_visits enable row level security;

-- 本人のみ読み書き（他人からは物理的に見えない）
drop policy if exists event_visits_select on public.event_visits;
drop policy if exists event_visits_insert on public.event_visits;
drop policy if exists event_visits_delete on public.event_visits;
create policy event_visits_select on public.event_visits for select using (user_id = auth.uid());
create policy event_visits_insert on public.event_visits for insert with check (user_id = auth.uid());
create policy event_visits_delete on public.event_visits for delete using (user_id = auth.uid());

-- =========================================================
-- 1件の予定に複数の日程を持たせる（2026-10-31 柴野）
--
-- イベントの昼の部・夜の部、東京公演・大阪公演、予約の一次受付・二次受付など。
-- 今までは予定1件に開催1組・予約1組しか持てず、1日にまとまって見えていた。
--   kind='session'  … 開催の回（昼の部・東京公演など）
--   kind='preorder' … 受付の回（一次受付・二次受付など）。start_date が開始、end_date が締切
-- 足すだけ。無ければアプリは今までどおり予定本体の日付で動く。
-- 読むのは全員、書けるのはその予定の投稿者と運営だけ。
--
-- 適用：
--   本番……未適用
-- =========================================================

create table if not exists public.event_schedules (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references public.events(id) on delete cascade,
  kind       text not null check (kind in ('session', 'preorder')),
  label      text not null check (length(label) between 1 and 40),
  start_date date not null,
  end_date   date,
  start_time time,
  end_time   time,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (end_date is null or end_date >= start_date)
);
create index if not exists event_schedules_event_idx on public.event_schedules (event_id, start_date);

alter table public.event_schedules enable row level security;
drop policy if exists es_select_all on public.event_schedules;
drop policy if exists es_write_owner on public.event_schedules;
create policy es_select_all on public.event_schedules for select to anon, authenticated using (true);
create policy es_write_owner on public.event_schedules for all to authenticated
  using (public.is_staff_admin() or exists (select 1 from public.events e where e.id = event_id and e.author_id = auth.uid()))
  with check (public.is_staff_admin() or exists (select 1 from public.events e where e.id = event_id and e.author_id = auth.uid()));

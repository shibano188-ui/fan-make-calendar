-- 共同編集: 日時/状態の編集をパッチ(変更分)として追記。表示時に base へ重ねる。削除=revert。
-- 本体eventsを直接UPDATEしない（RLS安全）。履歴＝この行たち。
create table if not exists public.event_edits (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references public.events(id) on delete cascade,
  patch      jsonb not null,          -- { date, endDate, time, isOrderMade, preorderStart, preorderEnd } の変更分
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists event_edits_event_idx on public.event_edits (event_id, created_at);

alter table public.event_edits enable row level security;
drop policy if exists ee_select on public.event_edits;
drop policy if exists ee_insert on public.event_edits;
drop policy if exists ee_delete on public.event_edits;
create policy ee_select on public.event_edits for select using (true);
create policy ee_insert on public.event_edits for insert with check (true);
create policy ee_delete on public.event_edits for delete using (true);

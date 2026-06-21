-- ＋（カレンダーに追加）の人数を記録するテーブル。likes と同じ作り。
-- 「○人がカレンダーに追加しています」の社会的証明＋2段ファネル(いいね→＋)の計測に使う。
create table if not exists public.calendar_adds (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references public.events(id) on delete cascade,
  user_id    uuid not null,
  created_at timestamptz not null default now(),
  unique (event_id, user_id)
);

create index if not exists calendar_adds_event_idx on public.calendar_adds (event_id);

alter table public.calendar_adds enable row level security;

-- likes と同様、クライアント信頼の運用（件数は誰でも読める／追加・削除は許可）
drop policy if exists calendar_adds_select on public.calendar_adds;
drop policy if exists calendar_adds_insert on public.calendar_adds;
drop policy if exists calendar_adds_delete on public.calendar_adds;
create policy calendar_adds_select on public.calendar_adds for select using (true);
create policy calendar_adds_insert on public.calendar_adds for insert with check (true);
create policy calendar_adds_delete on public.calendar_adds for delete using (true);

-- 2026-11-13 ホーム・探すの一覧を「前回から変わった予定だけ」取れるようにする（Supabase の転送量を減らすため）。
-- 足すだけ。流すまではアプリが列なしでも動く（列が無いと全件の取り直しに戻る）。

-- 予定を最後に書き換えた時刻。
-- 今ある行は 2000-01-01 にする（流した時刻にすると、全行が「流した直後に変わった」ことになり、差分で全部取ってしまう）。
-- 列を足すときの既定値は表を書き直さずに入る（全行の書き換えにはならない）。そのあと、新しい行の既定値を now() にする
alter table public.events
  add column if not exists updated_at timestamptz not null default '2000-01-01T00:00:00Z';
alter table public.events
  alter column updated_at set default now();

create or replace function public.events_touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists events_touch_updated_at on public.events;
create trigger events_touch_updated_at
  before update on public.events
  for each row execute function public.events_touch_updated_at();

create index if not exists events_updated_at_idx on public.events (updated_at);

-- 消した予定。アプリは「前回より後に消えたもの」をここで知って、手元の一覧から外す
create table if not exists public.deleted_events (
  id uuid primary key,
  deleted_at timestamptz not null default now()
);
create index if not exists deleted_events_deleted_at_idx on public.deleted_events (deleted_at);

alter table public.deleted_events enable row level security;
drop policy if exists de_select on public.deleted_events;
create policy de_select on public.deleted_events for select using (true);

create or replace function public.events_record_delete() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.deleted_events (id) values (old.id) on conflict (id) do update set deleted_at = now();
  return old;
end;
$$;

drop trigger if exists events_record_delete on public.events;
create trigger events_record_delete
  after delete on public.events
  for each row execute function public.events_record_delete();

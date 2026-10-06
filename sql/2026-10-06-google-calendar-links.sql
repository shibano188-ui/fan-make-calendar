-- 「Googleで連携」（Calendar API）用の2つの表。足すだけで、既存の表には触らない。
--
-- google_calendar_links: 連携した人ごとに1行。refresh_token は service_role（api/_gcal.ts）だけが読む。
--   本人は「連携しているか・最終同期・エラー」だけ読める（列ごとの権限で refresh_token を外している）。
-- google_oauth_states: 同意画面に渡す使い捨ての値（15分）。service_role だけが読み書きする。

create table if not exists public.google_calendar_links (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  refresh_token text not null,
  calendar_id   text,
  synced_at     timestamptz,
  last_error    text,
  created_at    timestamptz not null default now()
);

alter table public.google_calendar_links enable row level security;

drop policy if exists google_calendar_links_select_own on public.google_calendar_links;
create policy google_calendar_links_select_own on public.google_calendar_links
  for select to authenticated using (user_id = auth.uid());

-- refresh_token は本人にも見せない
revoke all on public.google_calendar_links from anon, authenticated;
grant select (user_id, calendar_id, synced_at, last_error, created_at) on public.google_calendar_links to authenticated;

create table if not exists public.google_oauth_states (
  state      text primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.google_oauth_states enable row level security;
revoke all on public.google_oauth_states from anon, authenticated;

-- 確認用:
--   select user_id, calendar_id, synced_at, last_error from public.google_calendar_links;

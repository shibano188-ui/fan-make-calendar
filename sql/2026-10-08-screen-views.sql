-- =========================================================
-- 見た画面の記録と、新しく来た人の内訳（2026-10-08）
--
-- ① screen_views … アプリが「どの画面を開いたか」を1行ずつ足す（src/lib/screenLog.ts）。
--    どこで離れたか・何日使ったかを人ごとに追うためのもの。Vercel Analytics はアプリの中では動いていない
--    （iOS は画面を同梱・Android もネイティブ扱い）ので、自前で持つ。
--    path は '/open'（起動・30分以上たって戻った）、'/'・'/explore' などの画面、'/onboarding/…'・'/tour/…' の案内の段階。
--    '/open' の行だけ referrer（Web の来た元のホスト名か utm:…）が入る。
--    本人が自分の行を足すことだけできる。読むのは service_role（ダッシュボード）だけ。
--
-- ② collect_acquisition_metrics … その日に作られたアカウントを、来た経路で数えて metrics_daily（source='acq'）へ。
--    new_ios_app / new_android_app / new_web_phone / new_web_pc / new_test / new_unknown
--    テスト・ボット = 自動操作の印（匿名ログイン時の user_metadata.automated）、クローラー・ヘッドレスの UA、
--    またはそれと同じ IP から作られたもの（チームの動作確認スクリプトがほとんど。2026-10-08 に調べた）。
--    アプリかどうかは、記録があれば screen_views の platform、無ければ最初のセッションの UA で決める。
--    UA は auth.sessions にしか無く、ログアウトなどで消えると unknown になる。
--
-- 適用：
--   本番……（未適用）
-- =========================================================

create table if not exists public.screen_views (
  id         bigint generated always as identity primary key,
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  path       text not null check (length(path) <= 80),
  platform   text not null check (platform in ('ios', 'android', 'web')),
  referrer   text check (length(referrer) <= 200),
  created_at timestamptz not null default now()
);
create index if not exists screen_views_user_idx on public.screen_views (user_id, created_at);
create index if not exists screen_views_created_idx on public.screen_views (created_at);

alter table public.screen_views enable row level security;
drop policy if exists screen_views_insert_own on public.screen_views;
create policy screen_views_insert_own on public.screen_views
  for insert to authenticated with check (user_id = auth.uid());


-- クローラー・自動操作の UA（Playwright のヘッドレス、Google のクローラー、Play の審査の端末など）
create or replace function public.ua_is_automated(ua text) returns boolean
language sql immutable as $$
  select ua is not null and ua ~* '(headless|bot|crawl|spider|lighthouse|playstore-google|inspectiontool|^google$)'
$$;


create or replace function public.collect_acquisition_metrics(target_day date) returns int
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $fn$
declare
  d0 timestamptz := (target_day::timestamp at time zone 'Asia/Tokyo');
  d1 timestamptz := ((target_day + 1)::timestamp at time zone 'Asia/Tokyo');
  n  int := 0;
begin
  with u as (
    select id, raw_user_meta_data as meta from auth.users where created_at >= d0 and created_at < d1
  ), s as (
    select distinct on (user_id) user_id, user_agent as ua, ip
    from auth.sessions where user_id in (select id from u) order by user_id, created_at
  ), test_ips as (
    select distinct ip from auth.sessions
    where ip is not null and public.ua_is_automated(user_agent) and created_at >= d0 - interval '60 days' and created_at < d1
  ), p as (
    select distinct on (user_id) user_id, platform from public.screen_views
    where user_id in (select id from u) order by user_id, created_at
  ), k as (
    select case
      when coalesce(u.meta->>'automated', '') = 'true' or public.ua_is_automated(s.ua) or s.ip in (select ip from test_ips) then 'test'
      when p.platform = 'ios' then 'ios_app'
      when p.platform = 'android' then 'android_app'
      when s.ua is null and p.platform is null then 'unknown'
      when p.platform is null and s.ua ~ '; wv\)' then 'android_app'
      when p.platform is null and s.ua ~ '(iPhone|iPad)' and s.ua !~ 'Safari' then 'ios_app'
      when coalesce(s.ua, '') ~* '(iPhone|iPad|Android|Mobile)' then 'web_phone'
      else 'web_pc'
    end as kind
    from u left join s on s.user_id = u.id left join p on p.user_id = u.id
  )
  insert into public.metrics_daily (day, source, metric, value)
  select target_day, 'acq', 'new_' || kinds.kind, (select count(*) from k where k.kind = kinds.kind)
  from (values ('ios_app'), ('android_app'), ('web_phone'), ('web_pc'), ('test'), ('unknown')) as kinds(kind)
  on conflict (day, source, metric) do update set value = excluded.value, updated_at = now();

  get diagnostics n = row_count;
  return n;
end;
$fn$;

revoke all on function public.collect_acquisition_metrics(date) from public, anon, authenticated;


-- 過去を埋める（1回だけ）。UA の残っていない古いアカウントは unknown になる
--   select sum(public.collect_acquisition_metrics(d::date)) from generate_series(date '2026-05-22', current_date, interval '1 day') d;
-- 確かめ:
--   select metric, sum(value) from metrics_daily where source = 'acq' and day > current_date - 30 group by 1 order by 2 desc;

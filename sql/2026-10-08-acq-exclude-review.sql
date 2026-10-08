-- =========================================================
-- 新しく来た人の数から、Apple の審査の端末を外す（2026-10-08）
--
-- iPhone アプリの新規アカウント（30日で48）が App Store の初回ダウンロード（17）を大きく上回っていた。
-- 48のうち27は 139.178.128.0/18（whois: Apple Inc.）からで、作られた日が審査に出した日と重なる＝審査の端末。
-- Apple の回線（17.0.0.0/8 と 139.178.128.0/18）から作られたアカウントを test に入れる。
-- Google Play の審査は UA に PlayStore-Google が入るので、前から test になっている。
--
-- 関数を置き換えたあと、過去分を埋め直す（下の最後の select）。
--
-- 適用：
--   本番……2026-10-08 柴野（SQL Editor。過去分の埋め直しまで。30日の new_ios_app 48→20）
-- =========================================================

create or replace function public.collect_acquisition_metrics(target_day date) returns int
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $fn$
declare
  d0 timestamptz := (target_day::timestamp at time zone 'Asia/Tokyo');
  d1 timestamptz := ((target_day + 1)::timestamp at time zone 'Asia/Tokyo');
  n  int := 0;
  -- ストアの審査の回線。審査に出すたびに審査担当がアプリを開いて新しいアカウントができる
  review_nets inet[] := array['17.0.0.0/8', '139.178.128.0/18']::inet[];
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
      when coalesce(u.meta->>'automated', '') = 'true' or public.ua_is_automated(s.ua) or s.ip in (select ip from test_ips) or s.ip << any (review_nets) then 'test'
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

select sum(public.collect_acquisition_metrics(d::date)) from generate_series(date '2026-05-22', current_date, interval '1 day') d;

-- 確かめ: new_ios_app が 30日で 20 前後になるはず
select metric, sum(value) from metrics_daily where source = 'acq' and day > current_date - 31 group by 1 order by 2 desc;

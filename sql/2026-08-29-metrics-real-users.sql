-- 「ユーザー数」を実態に合わせて数え直す。
--
-- 背景: アプリもWebも、セッションが無い訪問者には signInAnonymously() で
-- 匿名ユーザーがそのまま作られる（src/contexts/AuthContext.tsx）。
-- そのため auth.users の件数は「アプリの利用者数」ではなく
-- **これまでに開かれた端末・ブラウザの延べ数**になる。ブラウザを変えた同じ人も
-- プライベート閲覧で開いた人も別々に積まれる。
--
-- 足す指標:
--   users_registered … 匿名でない（実際にアカウントを作った）人。累計・埋め直せる
--   users_engaged    … 投稿・いいね・保存のどれかを1回でもした人。累計・埋め直せる
--   users_app        … プッシュtrokenを持つ人＝アプリを入れた人。当日値のみ
--   users_ios / users_android … その内訳。当日値のみ
--
-- users_app が当日値しか取れないのは、push_tokens に created_at が無く
-- updated_at しか持っていないため（いつ入れたかを遡れない）。

create or replace function public.collect_daily_metrics(
  target_day date,
  include_snapshot boolean default true
) returns int
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $fn$
declare
  d0 timestamptz := (target_day::timestamp at time zone 'Asia/Tokyo');
  d1 timestamptz := ((target_day + 1)::timestamp at time zone 'Asia/Tokyo');
  n  int := 0;
begin
  insert into public.metrics_daily (day, source, metric, value) values
    (target_day, 'app', 'signups',
      (select count(*) from auth.users where created_at >= d0 and created_at < d1)),
    (target_day, 'app', 'events_created',
      (select count(*) from public.events where created_at >= d0 and created_at < d1)),
    (target_day, 'app', 'likes',
      (select count(*) from public.likes where created_at >= d0 and created_at < d1)),
    (target_day, 'app', 'calendar_adds',
      (select count(*) from public.calendar_adds where created_at >= d0 and created_at < d1)),
    (target_day, 'app', 'buy_clicks',
      (select count(*) from public.buy_click_logs where created_at >= d0 and created_at < d1)),
    (target_day, 'app', 'searches',
      (select count(*) from public.search_logs where created_at >= d0 and created_at < d1)),
    (target_day, 'app', 'ai_calls',
      (select count(*) from public.ai_usage where created_at >= d0 and created_at < d1)),
    (target_day, 'app', 'ai_cost_jpy',
      (select coalesce(sum(cost_jpy), 0) from public.ai_usage where created_at >= d0 and created_at < d1)),
    (target_day, 'app', 'active_users',
      (select count(*) from (
         select author_id as uid from public.events         where created_at >= d0 and created_at < d1
         union
         select user_id          from public.likes          where created_at >= d0 and created_at < d1
         union
         select user_id          from public.calendar_adds  where created_at >= d0 and created_at < d1
         union
         select user_id          from public.event_visits   where created_at >= d0 and created_at < d1
         union
         select user_id          from public.buy_click_logs where created_at >= d0 and created_at < d1
         union
         select user_id          from public.search_logs    where created_at >= d0 and created_at < d1
       ) u where uid is not null)),
    -- 延べ訪問端末。Webのふらっと訪問も1件ずつ積まれるので、利用者数ではない
    (target_day, 'app', 'users_total',
      (select count(*) from auth.users where created_at < d1)),
    -- 実際にアカウントを作った人（匿名でない）
    (target_day, 'app', 'users_registered',
      (select count(*) from auth.users
        where coalesce(is_anonymous, false) = false and created_at < d1)),
    -- 1回でも中身に触った人。ふらっと来ただけの訪問者と分ける
    (target_day, 'app', 'users_engaged',
      (select count(*) from (
         select author_id as uid from public.events        where created_at < d1
         union
         select user_id          from public.likes         where created_at < d1
         union
         select user_id          from public.calendar_adds where created_at < d1
       ) u where uid is not null)),
    (target_day, 'app', 'events_total',
      (select count(*) from public.events where created_at < d1))
  on conflict (day, source, metric) do update
    set value = excluded.value, updated_at = now();

  get diagnostics n = row_count;

  -- ここから下は「いまの状態」なので、過去にさかのぼって埋め直せない。
  if include_snapshot then
    insert into public.metrics_daily (day, source, metric, value) values
      (target_day, 'app', 'paid_active',
        (select count(*) from public.user_private where subscription_status = 'active')),
      (target_day, 'app', 'paid_grace',
        (select count(*) from public.user_private where subscription_status = 'grace')),
      (target_day, 'app', 'paid_canceled',
        (select count(*) from public.user_private where subscription_status = 'canceled')),
      (target_day, 'app', 'paid_trial',
        (select count(*) from public.user_private
          where subscription_status = 'active' and subscription_period_type = 'TRIAL')),
      (target_day, 'app', 'paid_monthly',
        (select count(*) from public.user_private
          where subscription_status = 'active' and subscription_plan = 'monthly')),
      (target_day, 'app', 'paid_yearly',
        (select count(*) from public.user_private
          where subscription_status = 'active' and subscription_plan = 'yearly')),
      (target_day, 'app', 'follows_total',
        (select count(*) from public.participations)),
      -- アプリを入れた人。push_tokens は native のみが登録するので、Webは入らない
      (target_day, 'app', 'users_app',
        (select count(distinct user_id) from public.push_tokens)),
      (target_day, 'app', 'users_ios',
        (select count(distinct user_id) from public.push_tokens where platform = 'ios')),
      (target_day, 'app', 'users_android',
        (select count(distinct user_id) from public.push_tokens where platform = 'android'))
    on conflict (day, source, metric) do update
      set value = excluded.value, updated_at = now();
  end if;

  return n;
end;
$fn$;

grant execute on function public.collect_daily_metrics(date, boolean) to service_role;

-- 足した2つ(users_registered / users_engaged)を過去にさかのぼって埋める:
--   select public.backfill_daily_metrics('2026-05-22', current_date - 1);
-- アプリ利用者(users_app)を今すぐ入れる:
--   select public.collect_daily_metrics(current_date, true);

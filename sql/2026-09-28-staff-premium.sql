-- 運営（staff.role='admin' の4人）は課金しなくても有料の機能を全部使えるようにする（柴野の判断・2026-09-28）。
-- アプリ・通知・カレンダー連携は、どれも user_private.subscription_status で有料かを見ているので、
-- ここを active（支払い方法 'staff'・期限なし）にするだけで、コードを変えずに全部が有料扱いになる。
-- ダッシュボードの「有料会員数」は同じ列を数えているので、支払い方法 'staff' は数えないように
-- 2026-08-29-metrics-real-users.sql の collect_daily_metrics を直す（user_private を数える6か所に条件を足しただけ）。
-- 戻すとき: update public.user_private set subscription_status = 'free', payment_provider = null, subscription_plan = null
--           where payment_provider = 'staff';

-- ① 運営4人を有料扱いにする
insert into public.user_private (user_id, subscription_status, subscription_plan, subscription_expires_at, payment_provider)
select s.user_id, 'active', 'staff', null, 'staff'
  from public.staff s
 where s.role = 'admin'
on conflict (user_id) do update
  set subscription_status     = excluded.subscription_status,
      subscription_plan       = excluded.subscription_plan,
      subscription_expires_at = excluded.subscription_expires_at,
      payment_provider        = excluded.payment_provider
  -- 本当に課金している人（App Store・Google Play の有効な購読）は上書きしない
  where public.user_private.subscription_status is distinct from 'active'
     or public.user_private.payment_provider is null
     or public.user_private.payment_provider = 'staff';

select u.email, p.subscription_status, p.payment_provider
  from public.user_private p join auth.users u on u.id = p.user_id
 where p.payment_provider = 'staff';

-- ② 有料会員数に運営を数えない
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
        (select count(*) from public.user_private where coalesce(payment_provider, '') <> 'staff' and subscription_status = 'active')),
      (target_day, 'app', 'paid_grace',
        (select count(*) from public.user_private where coalesce(payment_provider, '') <> 'staff' and subscription_status = 'grace')),
      (target_day, 'app', 'paid_canceled',
        (select count(*) from public.user_private where coalesce(payment_provider, '') <> 'staff' and subscription_status = 'canceled')),
      (target_day, 'app', 'paid_trial',
        (select count(*) from public.user_private
          where coalesce(payment_provider, '') <> 'staff' and subscription_status = 'active' and subscription_period_type = 'TRIAL')),
      (target_day, 'app', 'paid_monthly',
        (select count(*) from public.user_private
          where coalesce(payment_provider, '') <> 'staff' and subscription_status = 'active' and subscription_plan = 'monthly')),
      (target_day, 'app', 'paid_yearly',
        (select count(*) from public.user_private
          where coalesce(payment_provider, '') <> 'staff' and subscription_status = 'active' and subscription_plan = 'yearly')),
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

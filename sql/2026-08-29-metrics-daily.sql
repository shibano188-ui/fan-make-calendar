-- ダッシュボード用の日次指標。1行 = 1日 × 1指標。
--
-- 推移は「貯め始めてからしか作れない」ので、表示より先にこれを動かす。
-- 画面（Looker Studio でも自前のページでも）はこの1テーブルだけを読めばよい。
--
-- source: 'app'(Supabase) / 'revenuecat' / 'appstore' / 'play'
--   いまは 'app' だけ。ストア連携は次の段階で足す（テーブルは触らずに source が増えるだけ）。

create table if not exists public.metrics_daily (
  day        date not null,
  source     text not null,
  metric     text not null,
  value      numeric not null,
  updated_at timestamptz not null default now(),
  primary key (day, source, metric)
);

-- 推移を引くときの並び（source, metric で絞って day 順）
create index if not exists metrics_daily_series_idx
  on public.metrics_daily (source, metric, day);

-- クライアントには一切見せない。policy を1つも作らない＝anon/authenticated からは0行。
-- 読み書きは service_role（Cron と、ダッシュボード用の読み取り専用ロール）だけ。
alter table public.metrics_daily enable row level security;


-- 指定日の指標を集めて metrics_daily に入れ直す（何度流しても同じ結果になる）。
--
-- target_day は **日本時間の1日**。created_at は timestamptz なので、
-- JSTの 00:00〜翌00:00 に変換して数える（UTCで切ると9時間ずれる）。
--
-- include_snapshot:
--   false … created_at から後から再現できる指標だけ（過去を埋め直すとき用）
--   true  … 「いま何人が課金中か」のような、実行した瞬間しか取れない指標も含める
create or replace function public.collect_daily_metrics(
  target_day date,
  include_snapshot boolean default true
) returns int
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  d0 timestamptz := (target_day::timestamp at time zone 'Asia/Tokyo');
  d1 timestamptz := ((target_day + 1)::timestamp at time zone 'Asia/Tokyo');
  n  int := 0;
begin
  -- その日に起きた数 ＋ その日の終わり時点の累計。どちらも created_at から再現できる。
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
    -- その日に何かした人の数（投稿・いいね・保存・閲覧・購入リンク・検索のいずれか）
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
    (target_day, 'app', 'users_total',
      (select count(*) from auth.users where created_at < d1)),
    (target_day, 'app', 'events_total',
      (select count(*) from public.events where created_at < d1))
  on conflict (day, source, metric) do update
    set value = excluded.value, updated_at = now();

  get diagnostics n = row_count;

  -- ここから下は「いまの状態」なので、過去にさかのぼって埋め直せない。
  -- user_private には履歴が無く、解約されると上書きされてしまうため。
  if include_snapshot then
    insert into public.metrics_daily (day, source, metric, value) values
      (target_day, 'app', 'paid_active',
        (select count(*) from public.user_private where subscription_status = 'active')),
      (target_day, 'app', 'paid_grace',
        (select count(*) from public.user_private where subscription_status = 'grace')),
      (target_day, 'app', 'paid_canceled',
        (select count(*) from public.user_private where subscription_status = 'canceled')),
      -- 無料お試し中（RevenueCat の period_type）。課金に転換したかを見るのに要る。
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
        (select count(*) from public.participations))
    on conflict (day, source, metric) do update
      set value = excluded.value, updated_at = now();
  end if;

  return n;
end;
$$;


-- 過去を埋める。created_at から再現できる指標だけが入る（スナップショットは入らない）。
-- 初回に1回だけ流す想定: select public.backfill_daily_metrics('2026-05-22', current_date - 1);
create or replace function public.backfill_daily_metrics(from_day date, to_day date)
returns int
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  d date;
  n int := 0;
begin
  for d in select generate_series(from_day, to_day, interval '1 day')::date loop
    n := n + public.collect_daily_metrics(d, false);
  end loop;
  return n;
end;
$$;


-- security definer の関数は、既定だと誰でも実行できてしまう。service_role だけに絞る。
revoke all on function public.collect_daily_metrics(date, boolean) from public, anon, authenticated;
revoke all on function public.backfill_daily_metrics(date, date)   from public, anon, authenticated;


-- 流したあとの確認:
--   select public.backfill_daily_metrics('2026-05-22', current_date - 1);
--   select day, metric, value from public.metrics_daily
--    where metric = 'users_total' order by day desc limit 14;

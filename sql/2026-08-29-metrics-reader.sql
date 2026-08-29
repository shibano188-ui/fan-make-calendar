-- ダッシュボード（Looker Studio）から metrics_daily を読むための入り口。
-- 2026-08-29 に本番へ適用済み。
--
-- 1) 読み取り専用ロール
-- 2) そのロールにだけ読ませる RLS ポリシー
-- 3) 「1日1行・1指標1列」のビュー（Looker Studio は縦持ちより横持ちが扱いやすい）

-- ── 1) 読み取り専用ロール ───────────────────────────────
-- パスワードは本人が設定。権限は metrics_daily の SELECT だけなので、
-- 漏れても他のテーブルには手が届かない。
--
--   create role metrics_reader with login password '<設定した値>';
--   grant connect on database postgres to metrics_reader;
--   grant usage on schema public to metrics_reader;
--   grant select on public.metrics_daily to metrics_reader;

-- ── 2) RLS ポリシー ────────────────────────────────────
-- metrics_daily は policy を1つも作らずに RLS を有効にしてある（＝誰にも見えない）。
-- このロールにだけ穴を開ける。anon / authenticated からは引き続き0行。
--
--   create policy metrics_reader_read on public.metrics_daily
--     for select to metrics_reader using (true);

-- ── 3) 横持ちのビュー ──────────────────────────────────
-- metrics_daily は (day, source, metric, value) の縦持ち。指標を足すのは楽だが、
-- Looker Studio で「登録者数の折れ線」と「有料会員の折れ線」を並べるには
-- 1日1行に畳んだ方が扱いやすい。指標を足したらここに1行足す。
--
-- security_invoker = true が要る。付けないとビューは所有者(postgres)の権限で走り、
-- metrics_daily の RLS を素通りして誰にでも中身が見えてしまう。
create or replace view public.metrics_daily_wide
with (security_invoker = true) as
select
  day,
  max(value) filter (where metric = 'signups')        as signups,
  max(value) filter (where metric = 'active_users')   as active_users,
  max(value) filter (where metric = 'events_created') as events_created,
  max(value) filter (where metric = 'likes')          as likes,
  max(value) filter (where metric = 'calendar_adds')  as calendar_adds,
  max(value) filter (where metric = 'searches')       as searches,
  max(value) filter (where metric = 'buy_clicks')     as buy_clicks,
  max(value) filter (where metric = 'ai_calls')       as ai_calls,
  max(value) filter (where metric = 'ai_cost_jpy')    as ai_cost_jpy,
  max(value) filter (where metric = 'users_total')    as users_total,
  max(value) filter (where metric = 'events_total')   as events_total,
  max(value) filter (where metric = 'follows_total')  as follows_total,
  max(value) filter (where metric = 'paid_active')    as paid_active,
  max(value) filter (where metric = 'paid_trial')     as paid_trial,
  max(value) filter (where metric = 'paid_monthly')   as paid_monthly,
  max(value) filter (where metric = 'paid_yearly')    as paid_yearly,
  max(value) filter (where metric = 'paid_grace')     as paid_grace,
  max(value) filter (where metric = 'paid_canceled')  as paid_canceled
from public.metrics_daily
where source = 'app'
group by day;

grant select on public.metrics_daily_wide to metrics_reader;

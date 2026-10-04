-- フォロー作品の新着通知の見直し（2026-10-04 柴野）。
-- 仕様 → Obsidian: Decisions/2026-10-04-fanhive-home-story-premium.md
--   無料: 毎朝9時に1通（今までは課金の人だけだった＝2026-08-04 の決定を変更）
--   課金: 届き方を選べる。すぐ（30分ごとにまとめて）／1日3回（9・13・19時）／1日1回（9時）
--   止める（new_events_digest_off）は今までどおり全員が選べる
--
-- ⚠️ 本番には未適用。開発用（fanhive-dev）で流して動きを見てから本番へ。
-- ⚠️ 下の cron の <CRON_SECRET> は、流したあと末尾の「鍵を写す」で既存のジョブから写す（手で貼らない）。
--    2026-10-04 に置き換えないまま流して、2つのジョブが 401 で失敗していた。
-- ⚠️ cron は PR #14 をマージしてから動かす。マージ前の api/notify-new-events は ?slot= を知らず、
--    13・19時と30分ごとの回でも古い送り方（課金の人に1日1回）が動いてしまう

-- 届き方（課金の人だけが選べる）。null＝1日1回
alter table public.user_app_state add column if not exists new_events_notify text
  check (new_events_notify is null or new_events_notify in ('instant', 'thrice', 'daily'));

-- 人ごとに「どこまで知らせたか」。これより後に投稿された予定だけを次に送る（1日に何度か送っても重ならない）
create table if not exists public.new_event_notify_cursor (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  notified_until timestamptz not null
);
-- サーバー（service role）だけが読み書きする。ポリシーは作らない＝アプリからは読めない
alter table public.new_event_notify_cursor enable row level security;

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 13時・19時（JST）＝ 4:00・10:00 UTC。「1日3回」の人へ
select cron.unschedule('fanhive-new-events-thrice')
where exists (select 1 from cron.job where jobname = 'fanhive-new-events-thrice');
select cron.schedule(
  'fanhive-new-events-thrice',
  '0 4,10 * * *',
  $$
    select net.http_post(
      url     := 'https://fanhive.jp/api/notify-new-events?slot=thrice',
      headers := '{"Authorization": "Bearer <CRON_SECRET>", "Content-Type": "application/json"}'::jsonb
    );
  $$
);

-- 30分ごと。「すぐ」の人へ（投稿のたびではなく、30分の間に入った分をまとめて1通）
select cron.unschedule('fanhive-new-events-instant')
where exists (select 1 from cron.job where jobname = 'fanhive-new-events-instant');
select cron.schedule(
  'fanhive-new-events-instant',
  '*/30 * * * *',
  $$
    select net.http_post(
      url     := 'https://fanhive.jp/api/notify-new-events?slot=instant',
      headers := '{"Authorization": "Bearer <CRON_SECRET>", "Content-Type": "application/json"}'::jsonb
    );
  $$
);

-- 毎朝9時のジョブ（fanhive-new-events-digest）は今のまま。slot なし＝9時の回として扱う

-- ─── 鍵を写して動かす（PR #14 のマージ後に流す）──────────────────────
-- 受付開始の通知のジョブ（fanhive-preorder-alerts）が持っている鍵を、上の2つに写す
select cron.alter_job(j.jobid,
  command := replace(j.command, '<CRON_SECRET>',
             (select substring(command from 'Bearer ([0-9a-f]+)') from cron.job where jobname = 'fanhive-preorder-alerts')),
  active := true)
from cron.job j
where j.jobname in ('fanhive-new-events-thrice', 'fanhive-new-events-instant');

-- 確認用:
--   select jobid, jobname, active, position('<CRON_SECRET>' in command) = 0 as secret_ok from cron.job;
--   select id, status_code, content from net._http_response order by created desc limit 5;  -- 401 でなければよい


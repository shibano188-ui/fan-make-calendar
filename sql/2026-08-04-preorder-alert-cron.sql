-- 受付開始の即時通知を回すスケジューラ（Supabase の pg_cron から /api/notify-preorder-starts を叩く）。
--
-- なぜVercel Cronでないか: Vercelは **Hobbyプランだと1日1回まで**（2026-08-04時点）。
-- 受付開始は時刻に意味があるので1日1回では通知にならない。Supabaseなら5分おきに回せる。
-- Proに上げたら vercel.json の crons に移して、ここは `cron.unschedule` で止めればよい。
--
-- ⚠️ 実行前に <CRON_SECRET> を Vercel の環境変数と同じ値に置き換えること。
--    この定義は cron.job テーブルに平文で残る（DBを見られる人＝本人だけなので許容）。

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 貼り直しても増えないように、同名のジョブがあれば先に消す
select cron.unschedule('fanhive-preorder-alerts')
where exists (select 1 from cron.job where jobname = 'fanhive-preorder-alerts');

select cron.schedule(
  'fanhive-preorder-alerts',
  '*/5 * * * *',
  $$
    select net.http_post(
      url     := 'https://fanhive.jp/api/notify-preorder-starts',
      headers := '{"Authorization": "Bearer <CRON_SECRET>", "Content-Type": "application/json"}'::jsonb
    );
  $$
);

-- フォロー作品の新着まとめ（毎朝9時JST = 0:00 UTC に1回だけ）
select cron.unschedule('fanhive-new-events-digest')
where exists (select 1 from cron.job where jobname = 'fanhive-new-events-digest');

select cron.schedule(
  'fanhive-new-events-digest',
  '0 0 * * *',
  $$
    select net.http_post(
      url     := 'https://fanhive.jp/api/notify-new-events',
      headers := '{"Authorization": "Bearer <CRON_SECRET>", "Content-Type": "application/json"}'::jsonb
    );
  $$
);

-- 確認用:
--   select jobid, jobname, schedule, active from cron.job;
--   select * from cron.job_run_details order by start_time desc limit 10;   -- 実行できているか
--   select id, status_code, content from net._http_response order by created desc limit 5;  -- APIの応答

-- 運営のボット（GitHub Actions の .github/workflows/bot.yml）を、Supabase の pg_cron から10分おきに起動する（2026-11-22 柴野）。
-- GitHub の定期実行（schedule）はこのリポジトリだと数時間遅れることがあるので、実行ボタン（workflow_dispatch）を外から押す。
--
-- ⚠️ <GITHUB_TOKEN> を、GitHub で作ったトークンに置き換えてから流す（このファイルには書かない・コミットしない）。
--    トークンは fine-grained で、対象リポジトリは fan-make-calendar だけ、権限は Actions: Read and write だけ。
--    この定義は cron.job に平文で残る（DB を見られる人＝本人だけなので許容。CRON_SECRET と同じ扱い）。

select cron.unschedule('fanhive-bot-actions') where exists (select 1 from cron.job where jobname = 'fanhive-bot-actions');

select cron.schedule(
  'fanhive-bot-actions',
  '*/10 * * * *',
  $$
    select net.http_post(
      url     := 'https://api.github.com/repos/shibano188-ui/fan-make-calendar/actions/workflows/bot.yml/dispatches',
      headers := '{"Authorization": "Bearer <GITHUB_TOKEN>", "Accept": "application/vnd.github+json", "User-Agent": "fanhive-cron", "Content-Type": "application/json"}'::jsonb,
      body    := '{"ref": "main"}'::jsonb
    );
  $$
);

-- 動いたか: GitHub の Actions で「ボット」が workflow_dispatch で10分おきに増えていること。
-- 呼び出しの結果は net._http_response に残る（204 なら成功）:
--   select status_code, created from net._http_response order by created desc limit 5;
--
-- 動いたら、Vercel 側のジョブを止める:
--   select cron.unschedule('fanhive-bot');

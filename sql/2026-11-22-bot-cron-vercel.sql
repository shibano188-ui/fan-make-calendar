-- 運営のボットを、いったん Supabase の pg_cron → Vercel（/api/metrics?task=bot）に戻す（2026-11-22 柴野）。
-- GitHub Actions の定期実行（schedule）が数時間遅れる・動かないことがあるため。
-- Actions は pg_cron から実行ボタンを押す形（2026-11-22-bot-cron-actions.sql）に移す。それが動いたら、このジョブは止める。
--
-- 認証の書き方（CRON_SECRET）は、受付開始の通知のジョブ（fanhive-preorder-alerts）からそのまま写す。秘密の値をここに書かないため。

-- 貼り直しても増えないように、同名のジョブがあれば先に消す
select cron.unschedule('fanhive-bot') where exists (select 1 from cron.job where jobname = 'fanhive-bot');

select cron.schedule('fanhive-bot', '*/10 * * * *', replace(command, '/api/notify-preorder-starts', '/api/metrics?task=bot'))
from cron.job where jobname = 'fanhive-preorder-alerts';

-- 確認: 2行（fanhive-preorder-alerts と fanhive-bot）が出て、fanhive-bot の URL が /api/metrics?task=bot になっていること
select jobname, schedule, active, substring(command from 'url\s*:=\s*''([^'']+)') as url from cron.job where jobname in ('fanhive-preorder-alerts', 'fanhive-bot');

-- 止めるとき
-- select cron.unschedule('fanhive-bot');

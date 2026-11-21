-- 運営のボットを GitHub Actions（.github/workflows/bot.yml）に移したので、pg_cron の呼び出しを止める（2026-11-21 柴野）。
-- Vercel の無料枠の CPU（月4時間）をこの巡回でほぼ使い切っていたため。
-- ⚠️ Actions が動いているのを確かめてから流す（Actions のタブで「ボット」が緑になっていること）。
-- 通知（fanhive-preorder-alerts など）は止めない。止めるのは /api/metrics?task=bot を叩くジョブだけ。

-- 1. 先に、どのジョブが止まるかを見る（1行だけ出るはず）
select jobid, jobname, schedule, active from cron.job where command like '%task=bot%';

-- 2. 止める
select cron.unschedule(jobid) from cron.job where command like '%task=bot%';

-- 戻すとき: Actions のワークフローを止めて、前の定義（Supabase の cron.job にあったもの）を貼り直す

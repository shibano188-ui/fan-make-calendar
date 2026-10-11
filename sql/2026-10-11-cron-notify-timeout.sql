-- 通知の定期実行（pg_cron）が呼ぶ API を、120秒まで待つようにする（2026-10-11 柴野）。
--
-- 何があったか：待つ時間（timeout_milliseconds）を書いていないと pg_net は5秒で待つのをやめる。
--   予約開始（5分おき）は購入リンクの取り直しで、新着（30分おき）は毎回5秒を超えていて、
--   net._http_response に結果が残らなかった（関数は Vercel 側で最後まで動いて 200 を返していた）。
--   10/5 から新着のお知らせが届いていない原因を、9時の回の結果を読んで調べるためにも要る。
-- 変えるもの：ジョブ 3・4・6・7 の command に timeout_milliseconds := 120000 を足すだけ。
--   呼ぶ先・時刻・合言葉は変えない（合言葉は今の command からそのまま引き継ぐ。手で貼らない）。
--   bot（ジョブ 5）は前から 120000。
--
-- 適用：
--   本番……2026-10-11 Claude（柴野の指示。先に同じ置き換えを select で見て、4つとも1か所だけ足されるのを確かめた）

select jobid, cron.alter_job(
  jobid,
  command := regexp_replace(command, '(url\s*:=\s*''[^'']+'',)', '\1 timeout_milliseconds := 120000,')
)
from cron.job
where jobname in ('fanhive-preorder-alerts', 'fanhive-new-events-digest', 'fanhive-new-events-thrice', 'fanhive-new-events-instant')
  and command not like '%timeout_milliseconds%';

-- 確かめ：
-- select jobid, jobname, substring(command from 'timeout_milliseconds\s*:=\s*(\d+)') from cron.job order by jobid;

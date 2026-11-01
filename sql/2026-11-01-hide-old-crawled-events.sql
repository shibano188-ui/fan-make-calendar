-- 巡回が入れた古い予定を画面から外す（2026-11-01 柴野）。
-- 店に在庫が残っている過去のコミック（「ヒカルの碁(2)」1999年など）や昔のグッズが、発売当時の日付で全作品に入っていた。
-- 入口の直しは同じコミットの api/_crawl.ts（発売から1か月より前の商品を巡回で入れない）。
-- 対象: ボットが入れた、発売日が 2026-01-01 より前の予定。いいねが付いたものと受付中のものは残す。
-- 行は消さず pool=9 にする。戻すときは update events set pool = 0 where pool = 9;
--
-- 適用：
--   本番……2026-11-01 柴野（確認済み: pool=9 が7,240件）

begin;
update events e set pool = 9
from staff s
where s.user_id = e.author_id and s.role = 'bot'
  and e.pool = 0
  and e.event_date < '2026-01-01'
  and coalesce(e.like_count, 0) = 0
  and coalesce(e.preorder_end_date, '2000-01-01') < current_date;
commit;

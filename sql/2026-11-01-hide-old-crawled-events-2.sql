-- 巡回が入れた古い予定を、発売から1か月より前まで広げて画面から外す（2026-11-01 柴野）。
-- 1本目（hide-old-crawled-events）は 2026-01-01 より前だけで、探す・ホームが取る過去12か月にはほとんど入っていなかった。
-- 巡回の入口と同じ「発売から1か月より前」を 2026-10-02 より前として切る。
-- 対象: ボットが入れた、発売日が 2026-10-02 より前で、開催や期間も終わった予定。いいねが付いたものと受付中のものは残す。
-- 行は消さず pool=9 にする。戻すときは update events set pool = 0 where pool = 9;
--
-- 適用：
--   本番……2026-11-01 柴野

begin;
update events e set pool = 9
from staff s
where s.user_id = e.author_id and s.role = 'bot'
  and e.pool = 0
  and e.event_date < '2026-10-02'
  and coalesce(e.end_date, e.event_date) < current_date
  and coalesce(e.like_count, 0) = 0
  and coalesce(e.preorder_end_date, '2000-01-01') < current_date;
commit;

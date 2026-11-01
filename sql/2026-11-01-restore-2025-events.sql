-- 古い予定として外した行のうち、2025年以降に発売したものを戻す（2026-11-01 柴野）。
-- 外すのは2025年より前だけにする。過去のコミックの巻（category に 書籍）は、作品ごとに巻が並ぶので外したままにする。
-- 巡回の下限も同じコミットの api/_crawl.ts で揃えた。
--
-- 適用：
--   本番……未適用

update events
set pool = 0
where pool = 9
  and event_date >= '2025-01-01'
  and coalesce(category, '') not like '%書籍%';

-- 外したままにしていた2025年以降のコミックを戻す（2026-11-01 柴野「コミックは入れてもいい」）。
--
-- 適用：
--   本番……未適用

update events
set pool = 0
where pool = 9
  and event_date >= '2025-01-01';

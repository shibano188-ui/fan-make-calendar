-- 古い予定として pool=9 に入れた行のうち、いいねが付いていた1件を戻す（2026-11-01）。
-- like_count が0のままで、実際の likes は2件・スタンプ1件あった（映画ちいかわ サウンドトラック）。
-- like_count も実際の件数に揃える。
--
-- 適用：
--   本番……2026-11-01 柴野

update events
set pool = 0, like_count = (select count(*) from likes where event_id = '19c3f96b-7275-4f1c-a7bd-9262dbfb9a6d')
where id = '19c3f96b-7275-4f1c-a7bd-9262dbfb9a6d' and pool = 9;

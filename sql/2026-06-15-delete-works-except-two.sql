-- ============================================================================
-- 「ちいかわ」「ハイキュー!!」以外の作品（カレンダー）を全削除する
-- ============================================================================
-- 実行場所: Supabase Dashboard → SQL Editor（管理者として認証済みで実行）
-- 依存テーブル: likes / reactions / reports は event_id 経由、
--               events / participations は work_id 経由で works にぶら下がる。
--               FK の CASCADE 設定に依存せず、明示的に依存順で削除する。
--
-- ⚠️ 破壊的操作。実行前に backup-supabase.mjs でバックアップを取ること。
-- ============================================================================

-- ① まず削除対象（残す2作品以外）を確認する。ここで出た作品が消える。
select id, name, participant_count, created_at
from works
where name not in ('ちいかわ', 'ハイキュー!!')
order by created_at;

-- ② 内容を確認したら、以下のトランザクションを実行する。
begin;

with targets as (
  select id from works where name not in ('ちいかわ', 'ハイキュー!!')
),
target_events as (
  select id from events where work_id in (select id from targets)
)
-- 子テーブル（event_id 参照）から先に消す
, del_likes as (
  delete from likes     where event_id in (select id from target_events) returning 1
)
, del_reactions as (
  delete from reactions where event_id in (select id from target_events) returning 1
)
, del_reports as (
  delete from reports   where event_id in (select id from target_events) returning 1
)
-- works 直下（work_id 参照）
, del_events as (
  delete from events        where work_id in (select id from targets) returning 1
)
, del_parts as (
  delete from participations where work_id in (select id from targets) returning 1
)
-- 最後に works 本体
, del_works as (
  delete from works where id in (select id from targets) returning 1
)
select
  (select count(*) from del_likes)     as deleted_likes,
  (select count(*) from del_reactions) as deleted_reactions,
  (select count(*) from del_reports)   as deleted_reports,
  (select count(*) from del_events)    as deleted_events,
  (select count(*) from del_parts)     as deleted_participations,
  (select count(*) from del_works)     as deleted_works;

-- ③ 上の件数が想定どおりなら commit、おかしければ rollback。
commit;
-- rollback;

-- ④ 確認: 残っているのが2作品だけか。
select id, name from works order by created_at;

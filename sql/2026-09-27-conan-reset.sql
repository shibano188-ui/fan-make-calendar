-- 名探偵コナンの予定を全部消して、巡回ボットに新しい分け方で入れ直させる（柴野の判断・2026-09-27）。
-- 9/26 に柴野が一覧から入れた25件（いいね0）。古い分け方で別のアイテムが混ざっている
-- （「メタルブックマーカー・ダイカットステッカー・メタルクリアファイル」など）。
-- 巡回先にコナンを足したので（api/_crawl.ts）、消したあとボットがアニメイト・ムービックから入れ直す。
-- PR #5 のマージ後、ボットを動かす前に流す。

-- ① 消す前に写しておく（戻すとき用）
create table if not exists backup_20260927_conan_events as
  select e.* from events e join works w on w.id = e.work_id where w.name = '名探偵コナン';
alter table backup_20260927_conan_events enable row level security; -- public に置く表は API から読めないようにする
select count(*) as 写した件数 from backup_20260927_conan_events;

-- ② 消す。予定に付いているもの（いいね・購入リンクの追加・編集履歴など）は外部キーの cascade で一緒に消える
delete from likes where event_id in (select id from backup_20260927_conan_events);
delete from events where id in (select id from backup_20260927_conan_events);

-- 戻すとき: insert into events select * from backup_20260927_conan_events;

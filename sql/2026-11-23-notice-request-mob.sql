-- モブサイコの追加を依頼してくれた人に「運営から」のお知らせを1件送る（2026-11-23 作成）。
--   c09571e7… モブサイコ（依頼 11-14。作品は前からあったが予定が0件だった。
--   Yahoo! の巡回（api/_catalog.ts の crawlYahooWorks）で予約受付中のグッズが入ったので送る）
-- 書き方は sql/2026-11-14-notice-request-works-3.sql と同じ。依頼は feedbacks の page='/onboarding/works'。
-- 同じ頭の id が2人以上当たるとき・もう送ってあるときは何もしない。流したあとの select で、この人の行が出れば送れている。
--
-- 適用：
--   本番……2026-11-23 Claude（柴野の指示。c09571e7 に1件。予定は Yahoo! の巡回で14件入ったあと）

insert into notifications (user_id, kind, title, body, path)
select u.user_id, 'support', 'ご依頼の作品を追加しました', v.body, v.path
from (values
  ('c09571e7%',
   'ご依頼ありがとうございます。「モブサイコ100」の予約受付中のグッズを追加しました。探すからご覧いただけます。' || E'\n' ||
   'FanHive の予定は、みんなの投稿で充実していきます。推し活仲間をどんどん誘ってみてください！',
   '/explore?work=2eff703c-55b2-46dd-8c3f-2d1df5261439')
) as v(uid, body, path)
join lateral (
  select distinct user_id from feedbacks
  where page = '/onboarding/works' and user_id::text like v.uid
) u on true
where (select count(distinct user_id) from feedbacks where page = '/onboarding/works' and user_id::text like v.uid) = 1
  and not exists (
    select 1 from notifications n
    where n.user_id = u.user_id and n.kind = 'support' and n.title = 'ご依頼の作品を追加しました'
  );

select left(user_id::text, 8) as uid, title, created_at from notifications
where kind = 'support' and title = 'ご依頼の作品を追加しました';

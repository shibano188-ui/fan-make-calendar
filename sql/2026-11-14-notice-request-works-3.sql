-- 桃源暗鬼の追加を依頼してくれた人に「運営から」のお知らせを1件送る（2026-11-14 作成）。
--   56e62567… 桃源暗鬼（依頼 11-07。作品は同じ日にでき、予定が41件ある・本人はフォロー済み）
-- 書き方は sql/2026-11-05-notice-request-works-2.sql と同じ。依頼は feedbacks の page='/onboarding/works'。
-- 同じ頭の id が2人以上当たるとき・もう送ってあるときは何もしない。流したあとの select で、この人の行が出れば送れている。
--
-- 魔入りました！入間くん・Re:ゼロから始める異世界生活は、巡回で予定が入ってから別に送る。
-- メルクストーリア・終末なにしてますか？は予定が無いので、お知らせでは触れない（嘘喰いと同じ）
--
-- 適用：
--   本番……2026-11-14 Claude（柴野の指示。56e62567 に1件）

insert into notifications (user_id, kind, title, body, path)
select u.user_id, 'support', 'ご依頼の作品を追加しました', v.body, v.path
from (values
  ('56e62567%',
   'ご依頼ありがとうございます。「桃源暗鬼」のグッズを追加しました。探すからご覧いただけます。' || E'\n' ||
   'FanHive の予定は、みんなの投稿で充実していきます。推し活仲間をどんどん誘ってみてください！',
   '/explore?work=afaeb770-2fdf-46fe-8c24-784d7e6dc953')
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

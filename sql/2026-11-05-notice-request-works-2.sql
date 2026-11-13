-- 作品の追加を依頼してくれた2人に「運営から」のお知らせを1件ずつ送る（2026-11-05 作成・送るのは予定がそれなりに揃ってから）。
--   7d8b638c… とんがり帽子のアトリエ
--   f851c32e… TRIGUN（嘘喰いも依頼されたが、予定が無いのでお知らせでは触れない・柴野）
-- 依頼は feedbacks の page='/onboarding/works'。開いたときに下からカードで1回出て、「開く」で探すのその作品の予定に飛ぶ。
-- 同じ頭の id が2人以上当たるとき・もう送ってあるときは何もしない。流したあとの select で2行出れば送れている。
--
-- 送る前の確かめ（予定の数）:
--   select w.name, count(e.id) from works w left join events e on e.work_id = w.id
--   where w.name in ('TRIGUN', 'とんがり帽子のアトリエ') group by 1;
--
-- 適用：
--   本番……2026-11-14 Claude（柴野の指示。TRIGUN 53件・とんがり 20件で送った。7d8b638c・f851c32e に1件ずつ）

insert into notifications (user_id, kind, title, body, path)
select u.user_id, 'support', 'ご依頼の作品を追加しました', v.body, v.path
from (values
  ('7d8b638c%',
   'ご依頼ありがとうございます。「とんがり帽子のアトリエ」のグッズを追加しました。探すからご覧いただけます。' || E'\n' ||
   'FanHive の予定は、みんなの投稿で充実していきます。推し活仲間をどんどん誘ってみてください！',
   '/explore?work=47d44466-9e53-4dbc-9dcb-296f061bc461'),
  ('f851c32e%',
   'ご依頼ありがとうございます。「TRIGUN」のグッズを追加しました。探すからご覧いただけます。' || E'\n' ||
   'FanHive の予定は、みんなの投稿で充実していきます。推し活仲間をどんどん誘ってみてください！',
   '/explore?work=abaf568d-db86-46c9-b52e-706c19bb1379')
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

select user_id, title, created_at from notifications
where kind = 'support' and title = 'ご依頼の作品を追加しました';

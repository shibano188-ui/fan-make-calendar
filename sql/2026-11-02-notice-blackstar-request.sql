-- ブラスタの追加を依頼してくれた人（042bbd25…）に「運営から」のお知らせを1件送る（2026-11-02）。
-- 依頼は feedbacks の page='/onboarding/works'。開いたときに下からカードで1回出て、「開く」で探すのブラスタの予定に飛ぶ。
-- 同じ人が2人以上当たるとき・もう送ってあるときは何もしない。流したあとの select で1行出れば送れている。
--
-- 適用：
--   本番……2026-11-02 柴野

insert into notifications (user_id, kind, title, body, path)
select u.user_id, 'support', 'ご依頼の作品を追加しました',
  'ご依頼ありがとうございます。「ブラックスター -Theater Starless-」の公式ストアのグッズを追加しました。探すからご覧いただけます。' || E'\n' ||
  'FanHive の予定は、みんなの投稿で充実していきます。推し活仲間をどんどん誘ってみてください！',
  '/explore?work=46a0c10e-d9b0-4d79-b0ea-5ada54de399a'
from (
  select distinct user_id from feedbacks
  where page = '/onboarding/works' and user_id::text like '042bbd25%'
) u
where (select count(distinct user_id) from feedbacks where page = '/onboarding/works' and user_id::text like '042bbd25%') = 1
  and not exists (
    select 1 from notifications n
    where n.user_id = u.user_id and n.kind = 'support' and n.title = 'ご依頼の作品を追加しました'
  );

select user_id, title, created_at from notifications
where kind = 'support' and title = 'ご依頼の作品を追加しました';

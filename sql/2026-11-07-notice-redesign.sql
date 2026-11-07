-- デザインの一新（PR #72・2026-11-07 20:31 に本番へ）を、今の利用者に「運営から」のお知らせで伝える。
-- アプリを開いたときに下からカードで1回出て、「開く」でカレンダーへ飛ぶ（プッシュは送らない）。
--
-- 送る人: 本番に出す前から作品をフォローしていた人（participations が 2026-11-07 20:31 より前にある人）。
--         出したあとに入った人は新しい案内を見ているので送らない。
-- 同じお知らせをもう送ってある人には送らない（2回流しても1回分だけ）。
--
-- **流すのは iOS 1.22 が公開されてから**。前に流すと、iPhone の人は古い画面のまま「新しくなりました」を見ることになる。
-- 先に開発用（fanhive-dev）で流して、最後の select の件数を見る。
--
-- 適用：
--   開発用……（未）
--   本番……（未）

insert into notifications (user_id, kind, title, body, path)
select u.user_id, 'support', 'カレンダーが新しくなりました',
  '予定が「あと何日」で並ぶ、新しいカレンダーになりました。日付未定の予定は、長押しで好きな日に仮置きできます。',
  '/saved'
from (
  select distinct user_id from participations
  where created_at < '2026-11-07 20:31:00+09'
) u
where not exists (
  select 1 from notifications n
  where n.user_id = u.user_id and n.kind = 'support' and n.title = 'カレンダーが新しくなりました'
);

select count(*) as sent from notifications
where kind = 'support' and title = 'カレンダーが新しくなりました';

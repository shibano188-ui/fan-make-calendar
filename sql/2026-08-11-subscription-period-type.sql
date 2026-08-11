-- 無料お試し中かどうかを持つ列。Webhook（api/revenuecat-webhook.ts）が書く。
--
-- なぜ要るか: 「無料期間が終わる前に知らせる」には、いまが無料お試しなのかを区別する必要がある。
-- 期限（subscription_expires_at）だけでは、月額の次の請求日と区別がつかない。
-- 毎月「請求日が近づいています」と出すのは邪魔なだけなので、お試しのときだけ出す。
--
-- 値は RevenueCat の period_type をそのまま入れる: TRIAL / NORMAL / INTRO
alter table user_private
  add column if not exists subscription_period_type text;

-- 他の課金系の列と同じ扱いにする。本人には読ませてよいが、書けるのは service_role だけ。
-- （sql/2026-07-25-subscription-columns-server-only.sql と揃える）
revoke update (subscription_period_type) on user_private from authenticated;
grant  update (subscription_period_type) on user_private to service_role;

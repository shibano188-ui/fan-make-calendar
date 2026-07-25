-- user_private の課金列を「サーバー(service_role)だけが書ける」ようにする。
--
-- 背景（2026-07-25 実データで確認した穴）:
--   user_private_upsert_own / user_private_update_own は **行単位** のRLSなので、
--   本人は自分の行の *どの列でも* 書ける。つまりアプリを介さず
--     POST /rest/v1/user_private  {"user_id":"<自分>","subscription_status":"active"}
--   を投げるだけで **誰でも自分をプレミアムにできる**（実際に 201 Created を確認）。
--   RLSは列を隠せない／守れないので、課金状態をこの列でゲートする前に必ず塞ぐ。
--
-- 方法: **列レベルの GRANT**。RLSと併用でき、service_role は権限チェックをバイパスするので
--   将来のWebhook（Play/RevenueCat）側は影響を受けない。
--   ⚠️ PostgreSQLでは「テーブル全体のUPDATE権限を持っている間は、列単位のREVOKEは効かない」。
--      先にテーブル全体の INSERT/UPDATE を外し、本人が触ってよい列だけ grant し直す。

-- 1) テーブル全体の書き込み権限を外す（SELECTは残す＝本人は自分の課金状態を読める）
revoke insert, update on public.user_private from authenticated, anon;

-- 2) 本人が触ってよい列だけ戻す
--    home_prefecture … 居住地（[[fanhive-domain-mail-setup]] の移送先）
--    linked_providers … アカウント連携の記録
--    user_id/updated_at … PostgRESTのupsertが ON CONFLICT DO UPDATE で必ず含めるため必要
grant insert (user_id, home_prefecture, linked_providers, updated_at) on public.user_private to authenticated;
grant update (user_id, home_prefecture, linked_providers, updated_at) on public.user_private to authenticated;

-- 確認①: 権限が意図どおりか
--   select grantee, privilege_type, column_name
--     from information_schema.column_privileges
--    where table_name = 'user_private' and grantee in ('authenticated','anon')
--    order by grantee, privilege_type, column_name;
--   → authenticated の INSERT/UPDATE に subscription_* / payment_provider / provider_customer_id が
--     出てこなければOK（SELECT には出てよい）
--
-- 確認②: 攻撃者クライアントで塞がったことを確かめる（匿名サインイン→自己プレミアム化を試す）
--   POST /auth/v1/signup {} でトークンを取り、
--   POST /rest/v1/user_private {"user_id":"<自分>","subscription_status":"active"}
--   → **403 (42501)** になればOK。実行前は 201 Created だった。
--
-- 確認③: 既存機能が壊れていないこと
--   居住地の保存（MyPage → 居住地）が通ること。内部は
--   upsert({user_id, home_prefecture, updated_at}) なので上の grant で足りる。

-- 開発中にプレミアムを手動で有効化する（決済ができるまでの動作確認用）。
-- Supabase SQL Editor は service_role 相当なので上の制限を受けない。
--   insert into public.user_private (user_id, subscription_status, subscription_plan, subscription_expires_at, payment_provider)
--   values ('<自分のuid>', 'active', 'premium_monthly', now() + interval '30 days', 'manual')
--   on conflict (user_id) do update
--     set subscription_status = excluded.subscription_status,
--         subscription_plan   = excluded.subscription_plan,
--         subscription_expires_at = excluded.subscription_expires_at,
--         payment_provider    = excluded.payment_provider,
--         updated_at = now();
-- 戻すとき: update public.user_private set subscription_status = 'free' where user_id = '<自分のuid>';

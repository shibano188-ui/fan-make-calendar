-- RLS強化（2026-07-22 セキュリティ監査の発見事項を修正）
-- 監査で「匿名クライアントが他人のデータを改ざん/削除できる」穴が判明したため塞ぐ。
-- 実行は冪等（drop policy if exists → create）。

-- ─────────────────────────────────────────────
-- 🔴 works: 誰でもupdate可能だった（作品名の改ざん・参加人数の水増し）
--   クライアントは works を update しない（getOrCreateWorkはinsertのみ／participant_countはトリガーが security definer で更新）。
--   → select=全員, insert=認証ユーザー, update/deleteポリシーは作らない（＝クライアントからは不可）。
-- ─────────────────────────────────────────────
alter table public.works enable row level security;
drop policy if exists "works_select_all"   on public.works;
drop policy if exists "works_insert_auth"   on public.works;
drop policy if exists "works_update_any"    on public.works;  -- 万一存在した緩いポリシーを除去
drop policy if exists "works_update"         on public.works;
drop policy if exists "works_delete"         on public.works;
drop policy if exists "works_all"            on public.works;
create policy "works_select_all" on public.works
  for select using (true);
create policy "works_insert_auth" on public.works
  for insert to authenticated with check (true);
-- update/delete ポリシーなし = クライアント不可。トリガー(security definer)は影響を受けない。

-- ─────────────────────────────────────────────
-- 🟠 共同編集系4テーブル: 誰でもdelete可能だった → 本人(作成者)のみに限定。
--   insert時も created_by/user_id を本人に強制（他人になりすました編集の投入を防ぐ）。
--   select は表示に必要なので全員可のまま。
-- ─────────────────────────────────────────────

-- calendar_adds (user_id)
alter table public.calendar_adds enable row level security;
drop policy if exists calendar_adds_select on public.calendar_adds;
drop policy if exists calendar_adds_insert on public.calendar_adds;
drop policy if exists calendar_adds_delete on public.calendar_adds;
create policy calendar_adds_select on public.calendar_adds for select using (true);
create policy calendar_adds_insert on public.calendar_adds for insert to authenticated with check (user_id = auth.uid());
create policy calendar_adds_delete on public.calendar_adds for delete to authenticated using (user_id = auth.uid());

-- event_edits (created_by)
alter table public.event_edits enable row level security;
drop policy if exists ee_select on public.event_edits;
drop policy if exists ee_insert on public.event_edits;
drop policy if exists ee_delete on public.event_edits;
create policy ee_select on public.event_edits for select using (true);
create policy ee_insert on public.event_edits for insert to authenticated with check (created_by = auth.uid());
create policy ee_delete on public.event_edits for delete to authenticated using (created_by = auth.uid());

-- stock_reports (created_by)
alter table public.stock_reports enable row level security;
drop policy if exists sr_select on public.stock_reports;
drop policy if exists sr_insert on public.stock_reports;
drop policy if exists sr_delete on public.stock_reports;
create policy sr_select on public.stock_reports for select using (true);
create policy sr_insert on public.stock_reports for insert to authenticated with check (created_by = auth.uid());
create policy sr_delete on public.stock_reports for delete to authenticated using (created_by = auth.uid());

-- event_offer_contribs (created_by)
alter table public.event_offer_contribs enable row level security;
drop policy if exists eoc_select on public.event_offer_contribs;
drop policy if exists eoc_insert on public.event_offer_contribs;
drop policy if exists eoc_delete on public.event_offer_contribs;
create policy eoc_select on public.event_offer_contribs for select using (true);
create policy eoc_insert on public.event_offer_contribs for insert to authenticated with check (created_by = auth.uid());
create policy eoc_delete on public.event_offer_contribs for delete to authenticated using (created_by = auth.uid());

-- ─────────────────────────────────────────────
-- 🔒 将来の機微情報（課金・サブスク状態・アカウント連携）の置き場。
--   本人しか読み書きできない。公開テーブル(user_settings等)には決して入れない。
--   payment_provider/status 等はサーバー(Webhook/service_role)が更新する想定。
-- ─────────────────────────────────────────────
create table if not exists public.user_private (
  user_id            uuid primary key references auth.users(id) on delete cascade,
  subscription_status text,          -- 'free' | 'active' | 'canceled' | 'grace' 等
  subscription_plan   text,          -- 'premium_monthly' 等
  subscription_expires_at timestamptz,
  payment_provider    text,          -- 'play' | 'appstore' | 'stripe' 等
  provider_customer_id text,         -- 決済プロバイダ側のID（本人にのみ紐づく）
  linked_providers    jsonb default '[]'::jsonb, -- 連携済みID一覧（google 等）
  updated_at          timestamptz not null default now()
);
alter table public.user_private enable row level security;
drop policy if exists user_private_select_own on public.user_private;
drop policy if exists user_private_upsert_own on public.user_private;
drop policy if exists user_private_update_own on public.user_private;
-- 本人のみ読める。書き込みは基本サーバー(service_role)。本人の非決済フィールド更新余地として own upsert/update も許可（決済状態はサーバーのみが正とする運用）。
create policy user_private_select_own on public.user_private
  for select to authenticated using (user_id = auth.uid());
create policy user_private_upsert_own on public.user_private
  for insert to authenticated with check (user_id = auth.uid());
create policy user_private_update_own on public.user_private
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

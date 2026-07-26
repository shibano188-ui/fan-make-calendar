-- 通知のミュート（値下げ・再入荷アラート用）。
-- アラートは「いいねしたグッズは自動で対象」＝オプトアウト方式なので、
--  ・muted_event_ids … このグッズだけ通知しない
--  ・muted_work_ids  … この作品はまるごと通知しない（フォロー管理ページのベルで切り替え）
-- を持つ。どちらも本人だけが読み書きする既存テーブルへの列追加なので、RLSは既存のまま
-- （user_app_state_select_own / insert_own / update_own が行単位で守っている）。
--
-- 「非表示作品(hidden_work_ids)」とは別物。あちらは一覧から消す、こちらは通知だけ止める。

alter table public.user_app_state add column if not exists muted_event_ids jsonb;  -- string[]
alter table public.user_app_state add column if not exists muted_work_ids  jsonb;  -- string[]

-- 確認用:
--   select user_id, muted_event_ids, muted_work_ids from public.user_app_state;

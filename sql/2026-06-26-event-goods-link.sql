-- ============================================================================
-- イベント⇄グッズ紐付け（案1.5）
-- ============================================================================
-- 実行場所: Supabase Dashboard → SQL Editor
--
-- 目的: イベント投稿の中で「販売グッズ」を追加したとき、グッズを独立した
--       events 行（type='goods'）として作り、親イベントへ related_event_id で
--       紐付ける。これでグッズは「探す→グッズ」一覧にも出つつ、両画面で相互
--       リンクできる。
--
-- 安全: 既存行はすべて related_event_id = NULL（従来どおりの単独アイテム）。
-- ============================================================================

alter table events
  add column if not exists related_event_id uuid references events(id) on delete set null;

-- イベント詳細から「このイベントのグッズ」を引く検索用インデックス
create index if not exists events_related_event_id_idx
  on events (related_event_id)
  where related_event_id is not null;

-- ピボット: events を「グッズ/イベント統一アイテム」化する拡張カラム。
-- 既存行は default 'event' / NULL で無変更のまま動く（探すにそのまま出る）。

alter table public.events
  add column if not exists type        text    not null default 'event',  -- 'event' | 'goods'
  add column if not exists price       integer,                            -- グッズ価格（円）
  add column if not exists stock_note  text,                               -- 在庫コメント（最新要約）
  add column if not exists retailer    text,                               -- 販路名
  add column if not exists affiliate_url text,                             -- アフィリンク化後URL
  add column if not exists has_affiliate boolean not null default false;   -- アフィ対応販路か

-- type の値を制約（任意・後で外せる）
alter table public.events
  drop constraint if exists events_type_check;
alter table public.events
  add constraint events_type_check check (type in ('event', 'goods'));

-- 探すフィードは type で絞り込むことがあるので軽くインデックス
create index if not exists events_type_idx on public.events (type);

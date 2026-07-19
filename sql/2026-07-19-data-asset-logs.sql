-- データ資産化の蛇口（fanhive-data-asset-plan ①④）
-- ①: AI抽出の教師データ（入力×AI出力×ユーザー最終保存値）
-- ④: 購入リンククリック（需要シグナル＋リンク構造の学習素材）
-- どちらもクライアントは insert のみ。閲覧は service_role（ダッシュボード/分析）に限る。

create table if not exists ai_extraction_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  source_url text,
  source_text text,
  source_kind text not null,   -- 'url' | 'image' | 'shared_text'
  ai_output jsonb not null,    -- AIが返した ParsedEvent
  final_saved jsonb not null,  -- ユーザーが実際に保存した投稿内容
  model text,
  created_at timestamptz not null default now()
);

alter table ai_extraction_logs enable row level security;

drop policy if exists "ai_logs_insert_own" on ai_extraction_logs;
create policy "ai_logs_insert_own" on ai_extraction_logs
  for insert to authenticated
  with check (auth.uid() = user_id);
-- select ポリシーなし＝クライアントからは読めない

create table if not exists buy_click_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  event_id text,               -- eventsへのFKは張らない（イベント削除後もログは残す）
  url text not null,
  domain text,
  retailer text,
  has_affiliate boolean,
  source text,                 -- クリック元画面: 'home' | 'explore' | 'saved' | 'item'
  created_at timestamptz not null default now()
);

alter table buy_click_logs enable row level security;

drop policy if exists "buy_clicks_insert" on buy_click_logs;
create policy "buy_clicks_insert" on buy_click_logs
  for insert to authenticated
  with check (user_id is null or auth.uid() = user_id);

-- 集計に使う索引
create index if not exists idx_buy_clicks_event on buy_click_logs (event_id);
create index if not exists idx_buy_clicks_domain on buy_click_logs (domain);
create index if not exists idx_ai_logs_created on ai_extraction_logs (created_at);

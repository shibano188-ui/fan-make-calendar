-- 投稿済みグッズの自動の手直し（api/_enrich.ts の autoEnrich）。本人要望・2026-09-27。
-- 管理画面で下見→選ぶ→書き込みをしていたものを、定期実行で自動で回す。
-- 足すだけ（既存の表・データには触らない）。定期実行の登録は別（柴野が行う）。

-- ① ボットの続きの位置（どこまで見たか）。ほかのボットでも使えるように key で分ける
create table if not exists bot_state (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table bot_state enable row level security; -- ポリシー無し＝サーバー（service_role）だけが読み書きする

-- ② 自動で書き換えた記録。before を使えば元に戻せる
create table if not exists enrich_log (
  id bigint generated always as identity primary key,
  event_id uuid not null references events(id) on delete cascade,
  before jsonb,
  after jsonb not null,
  notes text[] not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists enrich_log_created_at on enrich_log (created_at desc);
alter table enrich_log enable row level security;

-- 直近の書き換え: select e.title, l.notes, l.created_at from enrich_log l join events e on e.id = l.event_id order by l.created_at desc limit 50;

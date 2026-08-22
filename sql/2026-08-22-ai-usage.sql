-- AI利用の台帳（回数ではなく「円」で数える）と、上限を素通りするオーナーの一覧。
-- 方針 → Obsidian: Decisions/2026-08-22-ai-usage-limits.md
--
-- Anthropic には残高照会APIが無いので、この台帳が残高計の代わりになる。
-- 書き込むのはサーバー(service_role)だけ。クライアントからは読み書きさせない。

create table if not exists ai_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  endpoint text not null,                  -- 'parse-event' | 'theme-generate' …
  tier text,                               -- 'owner'|'registered'|'anonymous'|'new'|null(身元不明)
  model text,
  calls int not null default 1,            -- 1リクエストで走ったAPI呼び出し数（再試行を含む）
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  cache_read_tokens int not null default 0,
  cache_write_tokens int not null default 0,
  cost_usd numeric(12,6) not null default 0,
  cost_jpy numeric(12,4) not null default 0,
  created_at timestamptz not null default now()
);

-- service_role は RLS を迂回するので、**ポリシーは1つも作らない**＝クライアントからは触れない
alter table ai_usage enable row level security;

create index if not exists idx_ai_usage_created  on ai_usage (created_at desc);
create index if not exists idx_ai_usage_endpoint on ai_usage (endpoint, created_at desc);
create index if not exists idx_ai_usage_user     on ai_usage (user_id, created_at desc);

-- 役割。オーナーは上限を素通りする。
-- メンバーを増やすときはここに1行足すだけ（環境変数にしなかったのは再デプロイを要らなくするため）。
create table if not exists app_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('owner')),
  note text,
  created_at timestamptz not null default now()
);
alter table app_roles enable row level security;

-- 日別の集計。security_invoker=true にして、呼び出した側の権限でRLSを効かせる
-- （既定の definer のままだと、匿名クライアントから中身が見えてしまう）。
create or replace view ai_usage_daily
  with (security_invoker = true) as
select
  date_trunc('day', created_at) as day,
  endpoint,
  count(*)        as requests,
  sum(calls)      as api_calls,
  sum(cost_jpy)   as jpy
from ai_usage
group by 1, 2
order by 1 desc, 2;

-- ── オーナーの追加のしかた ──────────────────────────────────
-- 1. Supabase の Authentication > Users で自分の user id を確認する
--    （メール登録済みなら: select id, email from auth.users where email = 'you@example.com';）
-- 2. insert into app_roles (user_id, role, note)
--    values ('<user id>', 'owner', 'shisoh');
-- 反映はサーバー側のキャッシュ(5分)が切れ次第。

-- 販路リスト（どこで・いくらで買えるか）。発売に向けて随時増える。
-- 既存の単一 link/affiliate_url 等は後方互換で残し、offers が本体になる。
alter table public.events
  add column if not exists offers jsonb not null default '[]'::jsonb;

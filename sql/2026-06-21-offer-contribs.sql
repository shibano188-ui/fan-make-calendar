-- 共同編集: 他ユーザーが「購入リンク」を追記できる（append-only）。
-- 他人の予定を直接UPDATEせず、ここにINSERTして詳細で合算表示。削除=revert。
create table if not exists public.event_offer_contribs (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references public.events(id) on delete cascade,
  offer      jsonb not null,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists event_offer_contribs_event_idx on public.event_offer_contribs (event_id);

alter table public.event_offer_contribs enable row level security;
drop policy if exists eoc_select on public.event_offer_contribs;
drop policy if exists eoc_insert on public.event_offer_contribs;
drop policy if exists eoc_delete on public.event_offer_contribs;
create policy eoc_select on public.event_offer_contribs for select using (true);
create policy eoc_insert on public.event_offer_contribs for insert with check (true);
create policy eoc_delete on public.event_offer_contribs for delete using (true);

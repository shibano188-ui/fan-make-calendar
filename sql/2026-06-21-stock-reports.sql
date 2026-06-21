-- 共同編集: 在庫情報の追記ログ（append-only）。「池袋本店 残りわずか」等を時刻つきで積む。
-- 上書きしない＝荒らされても古いのが残る／新しい＋複数報告で自己修正。
create table if not exists public.stock_reports (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references public.events(id) on delete cascade,
  note       text not null,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists stock_reports_event_idx on public.stock_reports (event_id);

alter table public.stock_reports enable row level security;
drop policy if exists sr_select on public.stock_reports;
drop policy if exists sr_insert on public.stock_reports;
drop policy if exists sr_delete on public.stock_reports;
create policy sr_select on public.stock_reports for select using (true);
create policy sr_insert on public.stock_reports for insert with check (true);
create policy sr_delete on public.stock_reports for delete using (true);

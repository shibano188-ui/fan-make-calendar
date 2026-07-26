-- 値下げ・再入荷の検知ログ。書けるのは毎日Cron(service_role)だけ。
-- 毎日 api/refresh-offers が全グッズの価格・在庫を取り直しているので、前回値との差分を
-- ここに積む。アプリは「いいねしたグッズに値下がりがある」ことだけを見て導線を出す。
-- プッシュ基盤(FCM)が入るまでは、開いたときに気づける形（案A）。

create table if not exists public.price_changes (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references public.events(id) on delete cascade,
  kind       text not null check (kind in ('price_drop', 'restock')),
  old_price  integer,     -- 値下げのみ。再入荷は null
  new_price  integer,
  created_at timestamptz not null default now()
);

create index if not exists price_changes_event_idx on public.price_changes (event_id, created_at desc);
create index if not exists price_changes_created_idx on public.price_changes (created_at desc);

alter table public.price_changes enable row level security;

-- 残存ポリシーを一掃してから貼り直す（2026-07-22のRLS監査で踏んだ罠の対策）
do $$
declare p record;
begin
  for p in select policyname from pg_policies
            where schemaname = 'public' and tablename = 'price_changes'
  loop
    execute format('drop policy %I on public.price_changes', p.policyname);
  end loop;
end $$;

-- 読むのは誰でも可（イベント自体が公開情報。どのイベントが値下がりしたかは秘密ではない）。
-- 「誰の分か」はクライアントが自分のいいねと突き合わせて決める＝ここに user_id は持たない。
create policy price_changes_select on public.price_changes for select using (true);
-- insert/update/delete のポリシーは作らない ＝ service_role 以外は書けない。
-- （偽の「値下げ」を仕込まれると通知の信頼が壊れるため）

-- 確認用:
--   select kind, count(*) from public.price_changes group by kind;
--   select * from public.price_changes order by created_at desc limit 20;

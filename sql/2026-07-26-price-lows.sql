-- グッズごとの「これまでの最安値」。毎日Cron(service_role)だけが書く。
--
-- 値下げの通知を「金額のしきい値」ではなく「過去最安の更新」で決めるために要る。
-- 前日比だけで判定すると、店の値段が 2000→1800→2000→1800 と揺れるたびに毎日「値下がり」に
-- なってしまう。過去最安を持てば、出たときは必ず「今が過去最安」と言い切れる。
--
-- events に列を足さないのは、events は投稿者が自由にUPDATEできる（RLS events_update_self）ため。
-- 通知の根拠になる値は本人にも書かせない（course: user_private の課金列と同じ考え方）。

create table if not exists public.event_price_lows (
  event_id   uuid primary key references public.events(id) on delete cascade,
  low_price  integer not null,
  updated_at timestamptz not null default now()
);

alter table public.event_price_lows enable row level security;

-- 残存ポリシーを一掃（2026-07-22のRLS監査で踏んだ罠の対策）
do $$
declare p record;
begin
  for p in select policyname from pg_policies
            where schemaname = 'public' and tablename = 'event_price_lows'
  loop
    execute format('drop policy %I on public.event_price_lows', p.policyname);
  end loop;
end $$;

-- ポリシーを1つも作らない ＝ service_role 以外は読み書きできない。
-- クライアントはこの値を使わない（画面に出すのは price_changes の old/new だけ）。

-- 確認用:
--   select count(*), min(low_price), max(low_price) from public.event_price_lows;

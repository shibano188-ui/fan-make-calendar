-- お知らせ履歴。「通知を消したらもう見返せない」を解消するためのテーブル。
--
-- なぜ端末ではなくサーバーに持つか: アプリが閉じている間に届いた通知はJSに渡ってこないので、
-- 端末側で受信を拾う作りだと**取りこぼす**。送った側（Cron）が書くのが唯一確実。
-- 値下げ・再入荷は price_changes にも残るが、あちらは「今の状態」を出すためのもので、
-- 受付開始・新着まとめは記録がどこにも無かった。3種類ともここに1本化する。

create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  kind       text not null check (kind in ('price_drop', 'restock', 'preorder_start', 'new_events')),
  title      text not null,
  body       text not null default '',
  -- タップ先。1件なら商品ページ、まとめならその一覧
  path       text not null default '/',
  -- 商品ページに飛ぶもの以外は null（まとめ通知など）
  event_id   uuid references public.events(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_created_idx
  on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;

-- 名前不明の残存ポリシーを一掃してから貼り直す（2026-07-22のRLS監査で踏んだ罠の対策）
do $$
declare p record;
begin
  for p in select policyname from pg_policies
            where schemaname = 'public' and tablename = 'notifications'
  loop
    execute format('drop policy %I on public.notifications', p.policyname);
  end loop;
end $$;

-- 自分宛てだけ読める。書けるのは service_role（Cron）だけ＝ポリシーを作らない。
-- 消せるようにもしない（履歴なので、消せると「見返したい」という目的と衝突する）。
create policy notifications_select_self on public.notifications
  for select using (auth.uid() = user_id);

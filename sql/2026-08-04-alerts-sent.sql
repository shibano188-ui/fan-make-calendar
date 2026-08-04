-- 「この予定のこの通知はもう送った」の記録。二重送信を防ぐためだけのテーブル。
--
-- 受付開始の通知は数分おきに動くCronが送るので、送信済みの目印が無いと毎回送ってしまう。
-- 目印をアプリ側（端末）に持たせると、端末が増えるたびに送られるので**サーバーに持つ**。
-- 「誰に送ったか」は持たない（宛先は毎回その時点のいいね・プレミアム・ベル設定で決まる）。

create table if not exists public.event_alerts_sent (
  event_id uuid not null references public.events(id) on delete cascade,
  kind     text not null check (kind in ('preorder_start')),
  sent_at  timestamptz not null default now(),
  primary key (event_id, kind)
);

alter table public.event_alerts_sent enable row level security;

-- 名前不明の残存ポリシーを一掃してから貼り直す（2026-07-22のRLS監査で踏んだ罠の対策）
do $$
declare p record;
begin
  for p in select policyname from pg_policies
            where schemaname = 'public' and tablename = 'event_alerts_sent'
  loop
    execute format('drop policy %I on public.event_alerts_sent', p.policyname);
  end loop;
end $$;

-- ポリシーは1つも作らない ＝ service_role（Cron）以外は読み書きできない。
-- クライアントが読む必要はなく、書けると通知を止められてしまう。

-- ─── フォロー作品の新着まとめ（毎朝9時・プレミアム限定） ─────────────────

-- その人にその日のまとめを送ったか。1日1通に保つ（Cronが二度回っても増やさない）。
create table if not exists public.user_alert_digests (
  user_id     uuid not null references auth.users(id) on delete cascade,
  digest_date date not null,
  sent_at     timestamptz not null default now(),
  primary key (user_id, digest_date)
);

alter table public.user_alert_digests enable row level security;

do $$
declare p record;
begin
  for p in select policyname from pg_policies
            where schemaname = 'public' and tablename = 'user_alert_digests'
  loop
    execute format('drop policy %I on public.user_alert_digests', p.policyname);
  end loop;
end $$;
-- ポリシーは作らない ＝ service_role（Cron）だけが読み書きできる

-- まとめ通知の停止スイッチ（既定は受け取る＝オプトアウト方式）。
-- ⚠️ この列は**プレミアムの端末間同期(pushAppState)とは独立に**クライアントが直接書く。
--    あちらは「デバイス間の同時同期」を契約している人しか書かないので、
--    まとめ通知だけ契約している状態だとOFFがサーバーに届かず、止めたのに送られてしまう。
alter table public.user_app_state add column if not exists new_events_digest_off boolean;

-- 確認用:
--   select * from public.event_alerts_sent order by sent_at desc limit 20;
--   select * from public.user_alert_digests order by sent_at desc limit 20;

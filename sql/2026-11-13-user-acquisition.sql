-- =========================================================
-- 人ごとの「どこから来たか」（2026-11-13）
--
-- user_acquisition … 1人につき kind ごとに1行。**最初の1回だけ**残し、あとから上書きしない。
--   kind = 'answer' … 案内の最後の「FanHiveをどこで知りましたか？」の答え（OnboardingTour の source の段）
--                     x / friend / tiktok / instagram / search / event / other / skipped
--   kind = 'play'   … Android を Google Play から入れたときの Install Referrer（src/lib/deepLink.ts）
--                     utm_source / utm_medium / utm_content（共有ページからなら予定の id）を並べ直したもの。
--                     utm が無ければ生の文字列、空なら '(empty)'
--   kind = 'web'    … Web で最初に開いたときの来た元（screenLog.ts の entryReferrer と同じ値）。
--                     utm:<?src= の値> か、外のサイトのホスト名。何も無ければ 'direct'
--   送るのは src/lib/acquisition.ts。ログイン前の分は端末にためておき、ログインしたら送る。
--
-- 権限: 本人が自分の行を足すことだけできる（screen_views と同じ）。読む・書き換える・消すポリシーは作らない。
--   読むのは service_role（ダッシュボード）だけ。2回目の insert は主キーで 23505 になり、最初の値が残る。
--   アカウントを消すと一緒に消える（on delete cascade）。
--
-- 適用：
--   開発用……
--   本番……未
-- =========================================================

create table if not exists public.user_acquisition (
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind       text not null check (kind in ('answer', 'play', 'web')),
  value      text not null check (length(value) between 1 and 200),
  created_at timestamptz not null default now(),
  primary key (user_id, kind)
);

alter table public.user_acquisition enable row level security;
drop policy if exists user_acquisition_insert_own on public.user_acquisition;
create policy user_acquisition_insert_own on public.user_acquisition
  for insert to authenticated with check (user_id = auth.uid());


-- 確かめ:
--   ① kind ごとの内訳
--   select kind, value, count(*) from public.user_acquisition group by 1, 2 order by 1, 3 desc;
--   ② ポリシーが insert の1つだけか
--   select policyname, cmd, roles from pg_policies where tablename = 'user_acquisition';
--   ③ アプリから2回送っても1行のまま（2回目は 23505 duplicate key になる）
--   select user_id, count(*) from public.user_acquisition group by 1, kind having count(*) > 1;  -- 0行ならOK

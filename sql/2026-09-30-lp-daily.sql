-- =========================================================
-- LP（fanhive.jp/lp.html）の計測
--
-- 目的：LP の閲覧数とダウンロードボタンのクリック数を、流入経路（?src=）と
--       ボタンの位置ごとに数える。CAC（獲得単価）を経路別に出すため。
-- 触るもの：表 lp_daily と関数 lp_track を足すだけ。既存の表・ポリシーには触らない。
--
-- 方針：
--   - lp_daily は RLS を有効にし、ポリシーを作らない（anon は直接読めも書けもしない）
--   - anon に許すのは lp_track の execute だけ。anon が本番に書き込める初めての入口なので、
--     行が増え続けない・中身が汚れないように次の制限をかけている
--       ・指標は page_views / download_clicks の2つだけ受け付ける（それ以外は無視）
--       ・src / placement / store は英小文字・数字・_ - のみ、文字数も制限（外れたら 'invalid'）
--       ・1回ごとに行を足すのではなく、日 × 経路 × 位置 × ストア × 指標 の行を +1 する
--   - 回数制限は無いので、数字の水増しは防げない。LP の計測としては許容する
--   - 日付は metrics_daily と同じく日本時間で区切る
--
-- 適用：
--   開発用（fanhive-dev）……2026-09-30 さくや（プレビューの LP から記録されることを確認）
--   本番……2026-09-30 さくや
-- =========================================================

create table if not exists public.lp_daily (
  day        date        not null,
  src        text        not null default 'direct',
  placement  text        not null default '',
  store      text        not null default '',
  metric     text        not null check (metric in ('page_views', 'download_clicks')),
  value      integer     not null default 0,
  updated_at timestamptz not null default now(),
  primary key (day, src, placement, store, metric)
);

alter table public.lp_daily enable row level security;


create or replace function public.lp_track(
  p_metric    text,
  p_src       text default '',
  p_placement text default '',
  p_store     text default ''
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if p_metric not in ('page_views', 'download_clicks') then
    return;
  end if;

  p_src       := lower(coalesce(nullif(trim(p_src), ''), 'direct'));
  p_placement := lower(coalesce(trim(p_placement), ''));
  p_store     := lower(coalesce(trim(p_store), ''));
  if p_src       !~ '^[a-z0-9_-]{1,40}$' then p_src       := 'invalid'; end if;
  if p_placement !~ '^[a-z0-9_-]{0,20}$' then p_placement := 'invalid'; end if;
  if p_store     !~ '^[a-z0-9_-]{0,20}$' then p_store     := 'invalid'; end if;

  insert into public.lp_daily (day, src, placement, store, metric, value)
  values ((now() at time zone 'Asia/Tokyo')::date, p_src, p_placement, p_store, p_metric, 1)
  on conflict (day, src, placement, store, metric)
  do update set value = public.lp_daily.value + 1, updated_at = now();
end;
$fn$;

revoke all on function public.lp_track(text, text, text, text) from public, anon, authenticated;
grant execute on function public.lp_track(text, text, text, text) to anon, authenticated, service_role;


-- =========================================================
-- 流したあとの確認
-- =========================================================
-- select * from public.lp_daily order by updated_at desc limit 20;
--
-- 経路別の合計（本番で数字を見るとき）
-- select src,
--        sum(value) filter (where metric = 'page_views')      as page_views,
--        sum(value) filter (where metric = 'download_clicks') as download_clicks
-- from public.lp_daily
-- where src <> 'test'
-- group by src order by page_views desc nulls last;

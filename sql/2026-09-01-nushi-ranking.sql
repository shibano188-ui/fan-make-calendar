-- ヌシ称号とランキングの土台。1行 = 1作品 × 1ヶ月 × 1人。
-- 仕様 → Obsidian: Decisions/2026-09-01-nushi-ranking-score.md ／ 元仕様: 2026-08-29-nushi-title.md
--
-- テーブルを2つに分けてある。役割が違うので混ぜてはいけない:
--   work_month_scores … 集計。events/likes から**何度でも作り直してよい**
--   work_nushi        … 確定。月初に締めたスナップショット。**後から変えない**
-- 係数を変えたときランキングの並びは過去まで作り直るが、
-- 一度授与されたヌシは変わらない（授与された事実なので）。
--
-- 数え方でここだけは外さないこと:
--   投稿   … events の pool = 0 のみ。pool は重複投稿の深さで、同じ作品・同日・同タイトルで
--            投げると 1,2… と積まれる。表示側は全部 pool = 0 で絞っているので集計も揃える
--   いいね … likes の**行数**。events.like_count は使わない（add_like_tap RPC がDBに生きており、
--            アプリからは呼ばれないがAPIを直接叩けば加算できる）
--   自演   … likes.user_id = events.author_id は数えない

-- ─────────────────────────────────────────────
-- 集計テーブル
-- ─────────────────────────────────────────────
create table if not exists public.work_month_scores (
  work_id uuid not null references public.works(id) on delete cascade,
  -- その月の1日（JST基準）。月をまたぐ判定は全部この列で行う
  month   date not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  posts   int  not null default 0,
  likes   int  not null default 0,
  -- 係数はここ1箇所。JS側は score を読むだけで計算しない（2箇所に置くと必ずずれる）。
  -- 変えるときは drop column → add column で、既存行も自動で計算し直される。
  score   int  generated always as (posts * 3 + likes) stored,
  -- 同点の順位づけ用。スコアは増える一方なので「最後に加点された時刻」＝「今のスコアに到達した時刻」。
  -- 早いほうが上（仕様の「先に到達した順」）
  reached_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (work_id, month, user_id)
);

-- 作品ごとのランキング（その月の上位を score 降順で引く）
create index if not exists work_month_scores_rank_idx
  on public.work_month_scores (work_id, month, score desc, reached_at);

-- 総合ランキング（月で絞って全作品を合算する）
create index if not exists work_month_scores_month_idx
  on public.work_month_scores (month, user_id);

-- 順位は隠すものではないので誰でも読める。書き込みはポリシーを作らない＝
-- 下の security definer 関数（＝Cron）だけが入れられる。
alter table public.work_month_scores enable row level security;
drop policy if exists work_month_scores_select on public.work_month_scores;
create policy work_month_scores_select on public.work_month_scores for select using (true);


-- ─────────────────────────────────────────────
-- 確定テーブル（歴代ヌシ）
-- ─────────────────────────────────────────────
-- score を生成列にしていないのは、これがスナップショットだから。
-- 後で係数を変えても、当時の並びと点数がそのまま残る。
create table if not exists public.work_nushi (
  work_id uuid not null references public.works(id) on delete cascade,
  month   date not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  rank    int  not null,
  posts   int  not null,
  likes   int  not null,
  score   int  not null,
  created_at timestamptz not null default now(),
  primary key (work_id, month, user_id)
);

create index if not exists work_nushi_month_idx on public.work_nushi (month desc, work_id, rank);
create index if not exists work_nushi_user_idx  on public.work_nushi (user_id, month desc);

alter table public.work_nushi enable row level security;
drop policy if exists work_nushi_select on public.work_nushi;
create policy work_nushi_select on public.work_nushi for select using (true);


-- ─────────────────────────────────────────────
-- 表示名を設定していない人の通し番号
-- ─────────────────────────────────────────────
-- ANON_NAME は全員同じ「名無しさん」なので、ランキングに並べると誰が誰か分からない。
-- そこで番号を振って「名無しさん(10)」にする。
--
-- **順位の連番にしてはいけない。** ヌシは確定テーブルに履歴として残るので、
-- 月ごとに番号が振り直されると「7月のヌシ 名無しさん(3)」と「8月のヌシ 名無しさん(3)」が
-- 別人を指すことになり、履歴が読めなくなる。番号は人に固定する。
--
-- 一度振ったら変えない。欠番が出ても詰めない（詰めると同じ問題が起きる）。
-- 表示名を設定したらそちらが優先され、番号は表に出なくなるが、行は残す
-- （名前を消したときに同じ番号へ戻すため）。
create table if not exists public.anon_numbers (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  n          int  not null unique,
  created_at timestamptz not null default now()
);

alter table public.anon_numbers enable row level security;
drop policy if exists anon_numbers_select on public.anon_numbers;
create policy anon_numbers_select on public.anon_numbers for select using (true);

-- 採番。ランキングに載る人にだけ振る（訪問しただけの匿名アカウントはスコア0で載らないので振られない）。
create or replace function public.assign_anon_numbers()
returns int
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $fn$
declare
  -- 変数名を n にしない（anon_numbers.n と衝突して ambiguous になる）
  cnt int;
begin
  insert into public.anon_numbers (user_id, n)
  select s.user_id,
         (select coalesce(max(a.n), 0) from public.anon_numbers a)
           + row_number() over (order by min(s.updated_at), s.user_id)
    from public.work_month_scores s
   where not exists (select 1 from public.anon_numbers a where a.user_id = s.user_id)
   group by s.user_id
  on conflict (user_id) do nothing;

  get diagnostics cnt = row_count;
  return cnt;
end;
$fn$;


-- ─────────────────────────────────────────────
-- 集計: 指定月を数え直す（何度流しても同じ結果になる）
-- ─────────────────────────────────────────────
-- target_month は月初日（例: 2026-08-01）。月の境界は**日本時間**で切る。
-- created_at は timestamptz なので、UTCで切ると9時間ずれて月末月初の投稿が隣の月に入る。
--
-- チーム（app_roles に owner）は除外する。種まきをしている本人たちが上位を占めると
-- 「運営が全部持っている」ように見えるので、席は最初から空けておく。
create or replace function public.refresh_work_month_scores(target_month date)
returns int
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $fn$
declare
  m0 timestamptz := (date_trunc('month', target_month)::timestamp at time zone 'Asia/Tokyo');
  m1 timestamptz := ((date_trunc('month', target_month) + interval '1 month')::timestamp at time zone 'Asia/Tokyo');
  mm date        := date_trunc('month', target_month)::date;
  n  int;
begin
  -- 作り直しなので、その月をいったん捨てる（投稿が消された場合に古い行が残らない）
  delete from public.work_month_scores where month = mm;

  with owners as (
    select user_id from public.app_roles where role = 'owner'
  ),
  -- その月に作られた投稿（重複の山＝pool>0 は数えない）
  posted as (
    select e.work_id, e.author_id as user_id,
           count(*)::int as posts,
           max(e.created_at) as last_at
      from public.events e
     where e.pool = 0
       and e.work_id is not null
       and e.author_id is not null
       and e.created_at >= m0 and e.created_at < m1
       and e.author_id not in (select user_id from owners)
       -- 退会した人は数えない。events.author_id には auth.users への外部キーが無く、
       -- **退会しても投稿が残る**（本番に1件あった）。ここで弾かないと
       -- work_month_scores.user_id の外部キーに引っかかって集計ごと落ちる
       and exists (select 1 from auth.users u where u.id = e.author_id)
     group by e.work_id, e.author_id
  ),
  -- その月にもらったいいね。**投稿がいつのものかは問わない**（古い投稿に今月ついた分も入る）。
  -- 数えるのは likes の行数＝人数。自分で自分の投稿に押した分は除く。
  received as (
    select e.work_id, e.author_id as user_id,
           count(*)::int as likes,
           max(l.created_at) as last_at
      from public.likes l
      join public.events e on e.id = l.event_id
     where e.pool = 0
       and e.work_id is not null
       and e.author_id is not null
       and l.user_id <> e.author_id
       and l.created_at >= m0 and l.created_at < m1
       and e.author_id not in (select user_id from owners)
       and exists (select 1 from auth.users u where u.id = e.author_id)
     group by e.work_id, e.author_id
  )
  insert into public.work_month_scores (work_id, month, user_id, posts, likes, reached_at, updated_at)
  select coalesce(p.work_id, r.work_id),
         mm,
         coalesce(p.user_id, r.user_id),
         coalesce(p.posts, 0),
         coalesce(r.likes, 0),
         greatest(p.last_at, r.last_at),
         now()
    from posted p
    full outer join received r
      on r.work_id = p.work_id and r.user_id = p.user_id;

  get diagnostics n = row_count;

  -- 新しく載った人に番号を振る（既に持っている人は触らない）
  perform public.assign_anon_numbers();

  return n;
end;
$fn$;


-- ─────────────────────────────────────────────
-- 確定: 前月を締めてヌシを決める
-- ─────────────────────────────────────────────
-- seats / min_score は仕様どおり「定数で持ち、後から変えられる」形にしてある。
-- min_score の初期値15は「投稿5件」相当（投稿1件=3点）。人が増えたら実データで調整する。
--
-- 既に確定済みの月は触らない（授与の取り消しをしないため）。
-- 締め直したいときは work_nushi から手でその月を消してから呼ぶ。
create or replace function public.finalize_nushi(
  target_month date,
  seats int default 3,
  min_score int default 15
) returns int
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $fn$
declare
  mm date := date_trunc('month', target_month)::date;
  n  int;
begin
  -- 確定の前に必ず数え直す（月末ぎりぎりの投稿・いいねを取りこぼさない）
  perform public.refresh_work_month_scores(mm);

  insert into public.work_nushi (work_id, month, user_id, rank, posts, likes, score)
  select work_id, month, user_id, rnk, posts, likes, score
    from (
      select s.*,
             row_number() over (
               partition by s.work_id
               -- 同点なら先に到達したほうが上
               order by s.score desc, s.reached_at asc nulls last
             ) as rnk
        from public.work_month_scores s
       where s.month = mm
         and s.score >= min_score
    ) ranked
   where rnk <= seats
  on conflict (work_id, month, user_id) do nothing;

  get diagnostics n = row_count;
  return n;
end;
$fn$;


-- ─────────────────────────────────────────────
-- 今のヌシ（失効の判定込み）
-- ─────────────────────────────────────────────
-- 「2ヶ月連続で条件を外したら失効」＝ 直近2つの締め済み月のどちらかに入っていれば今もヌシ。
-- 猶予中は席が3人を超えてよい（仕様で許容と決定済み）。
--
-- ⚠️ 窓は **暦（今日）** から決める。work_nushi の max(month) から決めてはいけない。
--    誰も条件を満たさない月は work_nushi に1行も入らないので、max(month) が進まず
--    **失効が永久に来ない**（8月のヌシが9月10月と誰も出ないまま居座る）。
--
-- 8月のヌシの場合:
--   10/1 時点 … 窓=8月以降 → まだ残る（9月に外しただけ＝1ヶ月）
--   11/1 時点 … 窓=9月以降 → 消える（9月10月と2ヶ月連続で外した）
create or replace function public.list_nushi_current(as_of date default null)
returns table (work_id uuid, user_id uuid, last_month date, best_rank int)
language sql
stable
as $fn$
  select n.work_id, n.user_id, max(n.month) as last_month, min(n.rank)::int as best_rank
    from public.work_nushi n
   where n.month >= (date_trunc('month',
           coalesce(as_of, (now() at time zone 'Asia/Tokyo')::date)
         ) - interval '2 month')::date
   group by n.work_id, n.user_id;
$fn$;

-- 画面はこのビューを読むだけでよい（PostgREST から素直に引ける）
create or replace view public.work_nushi_current
with (security_invoker = on) as
select * from public.list_nushi_current();


-- ─────────────────────────────────────────────
-- 総合ランキング（全作品を合算）
-- ─────────────────────────────────────────────
-- PostgREST では group by ができないので、合算はここで作っておく。
-- 画面は month で絞って score 降順に読むだけでよい。
create or replace view public.month_scores_total
with (security_invoker = on) as
select month,
       user_id,
       sum(posts)::int  as posts,
       sum(likes)::int  as likes,
       sum(score)::int  as score,
       max(reached_at)  as reached_at
  from public.work_month_scores
 group by month, user_id;


-- ─────────────────────────────────────────────
-- 通知の種類に 'nushi' を足す
-- ─────────────────────────────────────────────
-- notifications.kind は CHECK で4種類に限定されている。付け替えないと履歴が書けない。
-- 通知は「なったときだけ」。失ったときは知らせない（仕様）。
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('price_drop', 'restock', 'preorder_start', 'new_events', 'nushi'));


-- 手で流すとき:
--   select public.refresh_work_month_scores(date_trunc('month', now())::date);  -- 今月を数え直す
--   select public.finalize_nushi('2026-08-01');                                  -- 8月を締める

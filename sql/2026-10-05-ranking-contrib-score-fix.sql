-- 2026-10-05-ranking-contrib-score.sql の直し（2026-10-05）。
-- 集計の関数の中で、変数の n と CTE の列の n がぶつかり「column reference "n" is ambiguous」で落ちていた。
-- 列の追加・点数の作り直し・ヌシの条件は本番に入っているので、関数だけを置き換えて、今月を数え直す。

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
  -- ⚠️ 下の CTE の列に n を使わない。変数の n と区別がつかず「column reference "n" is ambiguous」で落ちる（2026-10-05 に一度落とした）
  -- 作り直しなので、その月をいったん捨てる（投稿が消された場合に古い行が残らない）
  delete from public.work_month_scores where month = mm;

  with owners as (
    -- 数えない人: 運営（app_roles の owner）と、巡回ボットの投稿アカウント（staff の bot＝FanHive公式）
    select user_id from public.app_roles where role = 'owner'
    union
    select user_id from public.staff where role = 'bot'
  ),
  -- 退会した人は数えない（work_month_scores.user_id の外部キーに引っかかって集計ごと落ちるため）
  alive as (select id from auth.users),
  -- 投稿: その月に作られた予定（重複の山＝pool>0 は数えない）
  posted as (
    select e.work_id, e.author_id as user_id, count(*)::int as cnt, max(e.created_at) as last_at
      from public.events e
     where e.pool = 0 and e.work_id is not null and e.author_id is not null
       and e.created_at >= m0 and e.created_at < m1
       and e.author_id not in (select user_id from owners)
       and e.author_id in (select id from alive)
     group by e.work_id, e.author_id
  ),
  -- もらったいいね: その月に付いた分（投稿がいつのものかは問わない）。自分で押した分は除く
  received as (
    select e.work_id, e.author_id as user_id, count(*)::int as cnt, max(l.created_at) as last_at
      from public.likes l
      join public.events e on e.id = l.event_id
     where e.pool = 0 and e.work_id is not null and e.author_id is not null
       and l.user_id <> e.author_id
       and l.created_at >= m0 and l.created_at < m1
       and e.author_id not in (select user_id from owners)
       and e.author_id in (select id from alive)
     group by e.work_id, e.author_id
  ),
  -- ＋α: 1つの予定につき1人1種類1回まで。自分の予定への分は数えない
  plus_raw as (
    select e.work_id, r.user_id, r.event_id, r.kind, min(r.created_at) as added_at,
           case r.kind when 'edit' then 2 else 1 end as pts
      from (
        select event_id, created_by as user_id, created_at, 'edit'::text as kind from public.event_edits
         where created_at >= m0 and created_at < m1
        union all
        select event_id, created_by, created_at, 'offer' from public.event_offer_contribs
         where created_at >= m0 and created_at < m1
        union all
        select event_id, created_by, created_at, 'stock' from public.stock_reports
         where created_at >= m0 and created_at < m1
      ) r
      join public.events e on e.id = r.event_id
     where e.pool = 0 and e.work_id is not null and r.user_id is not null
       and r.user_id is distinct from e.author_id
       and r.user_id not in (select user_id from owners)
       and r.user_id in (select id from alive)
     group by e.work_id, r.user_id, r.event_id, r.kind
  ),
  -- ＋α は1日（日本時間）10点まで。早く入れた分から数える
  plus as (
    select work_id, user_id, sum(pts)::int as cnt, max(added_at) as last_at
      from (
        select work_id, user_id, added_at,
               greatest(0, least(pts, 10 - coalesce(sum(pts) over (
                 partition by user_id, (added_at at time zone 'Asia/Tokyo')::date
                 order by added_at, event_id, kind
                 rows between unbounded preceding and 1 preceding), 0))) as pts
          from plus_raw
      ) capped
     group by work_id, user_id
    having sum(pts) > 0
  ),
  -- いいねしたこと: 他の人の予定へのいいね10回で1点・1日（日本時間）1点まで（作品ごと）
  given as (
    select work_id, user_id, sum(p)::int as cnt, max(last_at) as last_at
      from (
        select e.work_id, l.user_id, (l.created_at at time zone 'Asia/Tokyo')::date as d,
               least(1, count(*) / 10) as p, max(l.created_at) as last_at
          from public.likes l
          join public.events e on e.id = l.event_id
         where e.pool = 0 and e.work_id is not null
           and l.user_id is distinct from e.author_id
           and l.created_at >= m0 and l.created_at < m1
           and l.user_id not in (select user_id from owners)
           and l.user_id in (select id from alive)
         group by e.work_id, l.user_id, d
      ) per_day
     group by work_id, user_id
    having sum(p) > 0
  )
  insert into public.work_month_scores (work_id, month, user_id, posts, likes, plus, likes_given, reached_at, updated_at)
  select work_id, mm, user_id,
         sum(posts)::int, sum(likes)::int, sum(plus)::int, sum(given)::int,
         -- 同点の順位づけ用。最後に加点された時刻＝今の点数に届いた時刻（早いほうが上）
         max(last_at), now()
    from (
      select work_id, user_id, cnt as posts, 0 as likes, 0 as plus, 0 as given, last_at from posted
      union all select work_id, user_id, 0, cnt, 0, 0, last_at from received
      union all select work_id, user_id, 0, 0, cnt, 0, last_at from plus
      union all select work_id, user_id, 0, 0, 0, cnt, last_at from given
    ) u
   group by work_id, user_id;

  get diagnostics n = row_count;

  -- 新しく載った人に番号を振る（既に持っている人は触らない）
  perform public.assign_anon_numbers();

  return n;
end;
$fn$;


-- 今月を新しい点数で数え直す（前月以前の確定済みのヌシは変わらない）
select public.refresh_work_month_scores(date_trunc('month', now() at time zone 'Asia/Tokyo')::date) as 作り直した行数;

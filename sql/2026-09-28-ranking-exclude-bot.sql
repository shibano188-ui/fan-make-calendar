-- ランキング・ヌシから、巡回ボットの投稿アカウント（staff.role='bot'＝FanHive公式）を外す（柴野の判断・2026-09-28）。
-- 2026-09-01-nushi-ranking.sql の refresh_work_month_scores の「数えない人」に staff の bot を足しただけ。ほかは同じ。
-- 流したあと、今月の集計を作り直す（最後の select）。前月以前の確定済みのヌシには触らない。

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

  -- 数えない人: 運営（app_roles の owner）と、巡回ボットの投稿アカウント（staff の bot＝FanHive公式）。
  -- ボットは毎日何十件も入れるので、数えるとランキングとヌシを取り続けてしまう（2026-09-28）
  with owners as (
    select user_id from public.app_roles where role = 'owner'
    union
    select user_id from public.staff where role = 'bot'
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

select public.refresh_work_month_scores(date_trunc('month', (now() at time zone 'Asia/Tokyo'))::date) as 作り直した行数;

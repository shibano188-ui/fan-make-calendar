-- events.like_count が「他人からのいいね」で増えないバグの修正。
--
-- 症状（2026-09-01 に本番データで確認）:
--   like_count が実数より多い行  … 0件
--   実数と一致する行            … 211件
--   実数より少ない行            … 77件（うち49件は「いいねがあるのに 0」）
--
-- 原因: toggleLike（src/lib/api.ts）が最後に
--   supabase.from('events').update({ like_count: count }).eq('id', eventId)
-- を撃つが、events の UPDATE は本人のみに絞られている（2026-06-12-events-rls.sql の Phase 3）。
-- **他人の投稿にいいねすると黙って弾かれる**ので、like_count が上がらない。
-- 自分の投稿にいいねしたときだけ通るため、一致している211件はほぼその分。
--
-- 影響: マイページの「もらったいいね」（getTotalReceivedLikes = like_count の合計）が
-- 実際より少なく出ている。ランキングは likes の行数で数えるので、直さないと
-- **同じ「いいね」という言葉で画面ごとに違う数**が出る。
--
-- 直し方: 加算ではなく **likes から数え直す** SECURITY DEFINER 関数に逃がす。
-- 加算にしないのは、取り消し（いいねを外す）でも同じ関数で正しくなるため。

create or replace function public.sync_like_count(p_event_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_count integer;
begin
  select count(*) into v_count from public.likes where event_id = p_event_id;
  update public.events set like_count = v_count where id = p_event_id;
  return v_count;
end;
$fn$;

-- 既にずれている行を実数に合わせる（1回だけ流せばよい。何度流しても同じ結果）。
update public.events e
   set like_count = (select count(*) from public.likes l where l.event_id = e.id)
 where coalesce(e.like_count, 0) <> (select count(*) from public.likes l where l.event_id = e.id);

-- 確認用:
--   select count(*) from public.events e
--    where coalesce(e.like_count,0) <> (select count(*) from public.likes l where l.event_id = e.id);
--   -- → 0 になるはず

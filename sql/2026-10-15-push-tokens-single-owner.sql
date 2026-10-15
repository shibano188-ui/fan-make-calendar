-- 1台の端末の宛先（push_tokens.token）を、最後に登録したアカウント1つだけに持たせる（2026-10-15 柴野）。
--
-- 何があったか：匿名で始めてから既存のアカウントにログインし直すと、匿名側はログアウトしたことにならず
--   unregisterPush が走らない。同じ token が匿名アカウントにも残り、両方が同じ作品をフォローしていると
--   新着のまとめが1台に2通届いた（柴野の Android・iPhone とも。本番で複数アカウントが持つ token は10個）。
--   クライアントは RLS で他人の行を消せないので、DB 側で消す。
-- 変えるもの：
--   ① token が登録・更新されたら、同じ token を持つ他のアカウントの行を消すトリガー
--   ② いま重なっている token は、updated_at が一番新しいアカウント（同じなら user_id の大きい方）だけ残す
--
-- 適用：
--   開発（fanhive-dev）……
--   本番……

begin;

create or replace function public.push_tokens_single_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.push_tokens
  where token = new.token and user_id <> new.user_id;
  return new;
end;
$$;

drop trigger if exists trg_push_tokens_single_owner on public.push_tokens;
create trigger trg_push_tokens_single_owner
  before insert or update on public.push_tokens
  for each row execute function public.push_tokens_single_owner();

delete from public.push_tokens p
where exists (
  select 1 from public.push_tokens q
  where q.token = p.token
    and q.user_id <> p.user_id
    and (q.updated_at > p.updated_at or (q.updated_at = p.updated_at and q.user_id > p.user_id))
)
returning p.user_id, p.platform, right(p.token, 8) as token_tail;

commit;

-- 確かめ：
-- select count(*) from (select token from public.push_tokens group by token having count(distinct user_id) > 1) x;  -- 0
-- select tgname from pg_trigger where tgrelid = 'public.push_tokens'::regclass and not tgisinternal;

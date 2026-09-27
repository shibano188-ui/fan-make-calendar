-- 投稿済みグッズの自動の手直し（api/_enrich.ts の autoEnrich）。本人要望・2026-09-27。
-- 管理画面で下見→選ぶ→書き込みをしていたものを、定期実行で自動で回す。
-- 表を足す・運営の権限を足す・delete_event に運営を足す。既存のデータには触らない。定期実行の登録は別（柴野が行う）。

-- ① ボットの続きの位置（どこまで見たか）。ほかのボットでも使えるように key で分ける
create table if not exists bot_state (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table bot_state enable row level security; -- ポリシー無し＝サーバー（service_role）だけが読み書きする

-- ② 自動で書き換えた記録。before を使えば元に戻せる
create table if not exists enrich_log (
  id bigint generated always as identity primary key,
  event_id uuid not null references events(id) on delete cascade,
  before jsonb,
  after jsonb not null,
  notes text[] not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists enrich_log_created_at on enrich_log (created_at desc);
alter table enrich_log enable row level security;

-- 直近の書き換え: select e.title, l.notes, l.created_at from enrich_log l join events e on e.id = l.event_id order by l.created_at desc limit 50;

-- ③ 運営の印。admin＝誰の予定でも直せる・消せる（4人）、bot＝巡回ボットが投稿するアカウント（1つ）
create table if not exists staff (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'bot')),
  created_at timestamptz not null default now()
);
alter table staff enable row level security;
drop policy if exists staff_select_self on staff;
create policy staff_select_self on staff for select to authenticated using (user_id = auth.uid()); -- 自分が運営かだけ分かる

create or replace function public.is_staff_admin()
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from staff where user_id = auth.uid() and role = 'admin') $$;
grant execute on function public.is_staff_admin() to authenticated;

-- 運営は誰の予定でも書き換えられる（投稿者本人の events_update_self に足す。どちらかに当てはまれば通る）
drop policy if exists events_update_staff on public.events;
create policy events_update_staff on public.events for update to authenticated
  using (public.is_staff_admin()) with check (public.is_staff_admin());

-- 予定の削除は投稿者本人か運営（2026-06-12-events-rls.sql の delete_event に運営を足す）
create or replace function public.delete_event(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_author uuid;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  select author_id into v_author from events where id = p_event_id;
  if v_author is null then raise exception 'event not found'; end if;
  if v_author <> v_uid and not public.is_staff_admin() then raise exception 'forbidden'; end if;

  delete from likes  where event_id = p_event_id;
  delete from events where id = p_event_id;
end;
$$;

-- ④ 運営の登録（柴野が流す。user_id は Authentication → Users で確かめる）
-- insert into staff (user_id, role) values
--   ('<運営アカウント>', 'bot'),
--   ('<柴野>', 'admin'), ('<メンバー2>', 'admin'), ('<メンバー3>', 'admin'), ('<メンバー4>', 'admin')
-- on conflict (user_id) do update set role = excluded.role;

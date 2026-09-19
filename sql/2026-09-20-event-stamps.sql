-- リアクション（スタンプ）を 1人1予定に複数押せるようにする。
--
-- 古い iOS アプリは reactions に `onConflict: 'event_id,user_id'`（1人1つ）で書き続けるので、
-- reactions の一意制約は変えずに新しい表 event_stamps を作る。
-- アプリは event_stamps だけを読み書きし、reactions に書かれた分はトリガーで event_stamps へ写す。

create table if not exists public.event_stamps (
  event_id   uuid not null references public.events(id) on delete cascade,
  user_id    uuid not null,
  stamp      text not null,
  created_at timestamptz not null default now(),
  primary key (event_id, user_id, stamp)
);
create index if not exists event_stamps_user_idx on public.event_stamps (user_id);

alter table public.event_stamps enable row level security;
drop policy if exists es_select on public.event_stamps;
drop policy if exists es_insert on public.event_stamps;
drop policy if exists es_delete on public.event_stamps;
create policy es_select on public.event_stamps for select using (true);
create policy es_insert on public.event_stamps for insert to authenticated with check (user_id = auth.uid());
create policy es_delete on public.event_stamps for delete to authenticated using (user_id = auth.uid());

-- 今あるリアクションを写す
insert into public.event_stamps (event_id, user_id, stamp)
select event_id, user_id, reaction_type from public.reactions
where event_id is not null and user_id is not null and reaction_type is not null
on conflict do nothing;

-- 古いアプリが reactions に書いたら event_stamps にも反映する。
-- 古いアプリは「付け替え」を UPDATE で行うので、前の種類を消して新しい種類を足す
create or replace function public.mirror_reaction_to_stamp() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op in ('UPDATE', 'DELETE') and old.user_id is not null then
    delete from public.event_stamps
    where event_id = old.event_id and user_id = old.user_id and stamp = old.reaction_type;
  end if;
  if tg_op in ('INSERT', 'UPDATE') and new.user_id is not null and new.reaction_type is not null then
    insert into public.event_stamps (event_id, user_id, stamp)
    values (new.event_id, new.user_id, new.reaction_type)
    on conflict do nothing;
  end if;
  return null;
end $$;

drop trigger if exists reactions_mirror_to_stamps on public.reactions;
create trigger reactions_mirror_to_stamps
after insert or update or delete on public.reactions
for each row execute function public.mirror_reaction_to_stamp();

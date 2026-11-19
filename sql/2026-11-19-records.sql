-- 記録（買った・行ったを、刷った1枚として残す）。2026-11-19 柴野。設計 → Obsidian: Projects/fanhive-implementation-plan-2026-12.md
-- 足すだけ。読めるのは自分の行だけ。書くのは print_record だけ（1つの予定に1枚・刷り直しはできない）。
-- 紙の色・入鋏・版のずれ（seed）はここで決める。画面には説明を出さない。

create table if not exists public.records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  kind text not null check (kind in ('bought', 'went')),
  day date not null,                 -- 手に入れた・行った日（日本時間）
  serial int not null,               -- 人ごとの通し番号
  paper text not null,               -- 白・桃・空・檸檬・若草・銀
  punch text not null,               -- 入鋏の形（行ったは消印なので使わない）
  mode text not null check (mode in ('riso', 'cheki', 'seal', 'plain')),  -- plain＝文字だけ。刷り方を選べば1回だけ置き換わる
  seed int not null,                 -- 版のずれ・光もれなど
  photo_path text,                   -- 自分の写真（段7。まだ使わない）
  develop_at timestamptz,            -- 翌朝に仕上げる（段7。まだ使わない）
  created_at timestamptz not null default now(),
  unique (user_id, event_id, kind)
);
create index if not exists records_user_day_idx on public.records (user_id, day);

alter table public.records enable row level security;
drop policy if exists records_select_own on public.records;
create policy records_select_own on public.records for select to authenticated using (user_id = auth.uid());

create or replace function public.print_record(p_event_id uuid, p_kind text, p_mode text)
returns public.records
language plpgsql security definer set search_path = public
as $fn$
declare
  r public.records;
  n int;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if p_kind not in ('bought', 'went') then raise exception 'bad kind'; end if;
  if p_mode not in ('riso', 'cheki', 'seal', 'plain') then raise exception 'bad mode'; end if;
  select * into r from public.records where user_id = auth.uid() and event_id = p_event_id and kind = p_kind;
  if found then
    -- 文字だけの1枚は、刷り方を選んだときに1回だけ置き換わる。それ以外は刷り直さない
    if r.mode = 'plain' and p_mode <> 'plain' then
      update public.records set mode = p_mode where id = r.id returning * into r;
    end if;
    return r;
  end if;
  select count(*) + 1 into n from public.records where user_id = auth.uid();
  insert into public.records (user_id, event_id, kind, day, serial, paper, punch, mode, seed)
  values (
    auth.uid(), p_event_id, p_kind, (now() at time zone 'Asia/Tokyo')::date, n,
    case when n % 50 = 0 or (n > 10 and n::text ~ '^(\d)\1+$') then '銀'
         else (array['白', '桃', '空', '檸檬', '若草'])[1 + floor(random() * 5)::int] end,
    (array['丸', '四角', '三角', '菱', '星', '半月', '十字', '雫'])[1 + floor(random() * 8)::int],
    p_mode, floor(random() * 1000000)::int
  )
  returning * into r;
  return r;
end
$fn$;

revoke all on function public.print_record(uuid, text, text) from public;
grant execute on function public.print_record(uuid, text, text) to authenticated;

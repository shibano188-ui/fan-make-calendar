-- FanHive公式アカウント（巡回ボットの投稿者。staff.role='bot'）の表示名と、なりすまし対策（柴野の判断・2026-09-28）。
-- 画面では名前の横に公式マークを出し、ブロックできないようにしている（src/lib/constants.ts の OFFICIAL_USER_ID）。

-- ① 公式アカウントの表示名
insert into public.user_settings (user_id, display_name, updated_at)
select user_id, 'FanHive公式', now() from public.staff where role = 'bot'
on conflict (user_id) do update set display_name = excluded.display_name, updated_at = now();

-- ② ほかの人は「FanHive」「ファンハイブ」「公式」「運営」を表示名に使えない（古い版のアプリから保存しても止める）
create or replace function public.guard_reserved_display_name()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.display_name is not null
     and lower(regexp_replace(normalize(new.display_name, NFKC), '\s', '', 'g')) ~ '(fanhive|ファンハイブ|公式|運営)'
     and not exists (select 1 from public.staff where user_id = new.user_id and role = 'bot') then
    raise exception 'reserved_name';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_reserved_display_name on public.user_settings;
create trigger guard_reserved_display_name
  before insert or update of display_name on public.user_settings
  for each row execute function public.guard_reserved_display_name();

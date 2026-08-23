-- 使う人が作ったテーマ（設定表）の置き場。
-- 方針 → Obsidian: Decisions/2026-08-22-fanhive-theme-consolidation.md
--
-- 置き場所を端末(localStorage)でなくサーバーにする理由:
--   ・機種変・再インストールで消えると「作った」ものが消える＝課金の理由が壊れる
--   ・保存できる数で無料/プレミアムを切るので、数が端末ごとだと意味を持たない
--
-- 保存するのは**数字と選択肢だけ**。入力に使った言葉（作品名が入りうる）は保存しない。
-- 版権は使う人の側に置いたままにする。

create table if not exists user_themes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default '',
  spec jsonb not null,                     -- ThemeSpec（src/design/themeSpec.ts）
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table user_themes enable row level security;

-- 自分のものだけ。**他人のテーマは見えない・消せない**
-- （「みんなのテーマ」で誰でも他人のテーマを消せた問題を繰り返さない）
drop policy if exists "user_themes_select_own" on user_themes;
create policy "user_themes_select_own" on user_themes
  for select using (auth.uid() = user_id);

drop policy if exists "user_themes_insert_own" on user_themes;
create policy "user_themes_insert_own" on user_themes
  for insert with check (auth.uid() = user_id);

drop policy if exists "user_themes_update_own" on user_themes;
create policy "user_themes_update_own" on user_themes
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "user_themes_delete_own" on user_themes;
create policy "user_themes_delete_own" on user_themes
  for delete using (auth.uid() = user_id);

create index if not exists idx_user_themes_user on user_themes (user_id, updated_at desc);

-- 1人あたりの保存数の天井。
-- 無料/プレミアムの線引き（無料1つ）はアプリ側で見るが、**壊れた/悪意ある書き込みで
-- 無限に積まれること自体**はここで止める。プレミアムでも実際に作るのは数個なので、
-- 20 なら誰も引っかからない。
create or replace function user_themes_cap() returns trigger
language plpgsql security definer as $$
begin
  if (select count(*) from user_themes where user_id = new.user_id) >= 20 then
    raise exception 'too many themes';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_user_themes_cap on user_themes;
create trigger trg_user_themes_cap
  before insert on user_themes
  for each row execute function user_themes_cap();

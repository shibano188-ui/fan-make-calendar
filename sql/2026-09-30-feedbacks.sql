-- マイページの「バグ・改善の報告」（2026-09-30 柴野）。バグ・改善案・ほしい機能を自由に書いてもらう。
-- 足すだけ。書けるのは本人の分だけ、読めるのは運営（is_staff_admin）だけ。
-- platform / build / user_agent / page は調べるための情報（アプリが自動で入れる）。
create table if not exists public.feedbacks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  -- 種類は複数選べる（バグ・改善・ほしい機能・その他）
  kinds       text[] not null check (cardinality(kinds) >= 1 and kinds <@ array['bug', 'improve', 'feature', 'other']),
  body        text not null check (length(body) between 1 and 2000),
  platform    text,
  build       text,
  user_agent  text,
  page        text,
  created_at  timestamptz not null default now()
);
create index if not exists feedbacks_created_idx on public.feedbacks (created_at desc);

alter table public.feedbacks enable row level security;
drop policy if exists fb_insert_self on public.feedbacks;
drop policy if exists fb_select_staff on public.feedbacks;
create policy fb_insert_self on public.feedbacks for insert to authenticated with check (user_id = auth.uid());
create policy fb_select_staff on public.feedbacks for select to authenticated using (public.is_staff_admin());

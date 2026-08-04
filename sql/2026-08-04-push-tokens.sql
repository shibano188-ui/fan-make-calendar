-- FCMのプッシュ宛先。1ユーザーが複数端末を持てるので (user_id, token) 単位。
-- トークンは端末ごとにFirebaseが発行し、再インストール・データ削除・失効で変わる。
-- アプリは起動のたびに upsert し、サーバー(Cron)が送信時に使う。
--
-- 「誰に送るか」の判定はサーバー側でやる（プレミアム・ミュート・いいね）。ここは宛先だけ。

create table if not exists public.push_tokens (
  user_id    uuid not null references auth.users(id) on delete cascade,
  token      text not null,
  platform   text not null check (platform in ('android', 'ios')),
  updated_at timestamptz not null default now(),
  primary key (user_id, token)
);

-- 送信時は user_id で引く
create index if not exists push_tokens_user_idx on public.push_tokens (user_id);
-- 失効トークン(UNREGISTERED)の掃除はトークン一致で消す
create index if not exists push_tokens_token_idx on public.push_tokens (token);

alter table public.push_tokens enable row level security;

-- 名前不明の残存ポリシーを一掃してから貼り直す（2026-07-22のRLS監査で踏んだ罠の対策）
do $$
declare p record;
begin
  for p in select policyname from pg_policies
            where schemaname = 'public' and tablename = 'push_tokens'
  loop
    execute format('drop policy %I on public.push_tokens', p.policyname);
  end loop;
end $$;

-- 本人の宛先だけを読み書きできる。他人のトークンは見えない
-- （見えると、そのトークン宛に偽の通知を投げる材料になる）。
create policy push_tokens_select_own on public.push_tokens
  for select to authenticated using (user_id = auth.uid());
create policy push_tokens_insert_own on public.push_tokens
  for insert to authenticated with check (user_id = auth.uid());
create policy push_tokens_update_own on public.push_tokens
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
-- ログアウト時に自分の端末の宛先を消せるようにする（別アカウントに通知が飛ばないため）
create policy push_tokens_delete_own on public.push_tokens
  for delete to authenticated using (user_id = auth.uid());

-- 確認用:
--   select platform, count(*) from public.push_tokens group by platform;

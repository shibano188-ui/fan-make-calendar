-- カレンダー自動同期（プレミアム）の購読URL用トークン。
--
-- 仕組み: ユーザーごとに推測できないトークンを1つ持ち、
--   https://fanhive.jp/api/ics?t=<token>
-- をGoogle/Appleカレンダーに「URLで購読」してもらう。以後は向こうが定期的に取りに来るので、
-- こちらから何も送らなくても保存した予定が自動で反映される（アプリの再ビルドも不要）。
--
-- トークンはクライアントが crypto.randomUUID() で作って自分の行に入れる。
-- RLSで user_id = auth.uid() を強制するので、他人のトークンは作れない・読めない。
-- 配信側(api/ics)は service_role で token → user_id を引く（RLSを通らない）。

create table if not exists public.ics_tokens (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  token      text not null unique,
  created_at timestamptz not null default now()
);

create index if not exists ics_tokens_token_idx on public.ics_tokens (token);

alter table public.ics_tokens enable row level security;

-- 残存ポリシーを一掃（2026-07-22のRLS監査で踏んだ罠の対策）
do $$
declare p record;
begin
  for p in select policyname from pg_policies
            where schemaname = 'public' and tablename = 'ics_tokens'
  loop
    execute format('drop policy %I on public.ics_tokens', p.policyname);
  end loop;
end $$;

create policy ics_tokens_select_own on public.ics_tokens
  for select to authenticated using (user_id = auth.uid());
create policy ics_tokens_insert_own on public.ics_tokens
  for insert to authenticated with check (user_id = auth.uid());
-- 更新は「URLを作り直す（漏れたときの無効化）」用。削除は同期をやめるとき。
create policy ics_tokens_update_own on public.ics_tokens
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy ics_tokens_delete_own on public.ics_tokens
  for delete to authenticated using (user_id = auth.uid());

-- 確認用:
--   select user_id, left(token, 8) || '…', created_at from public.ics_tokens;

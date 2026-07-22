-- 作品の表記ゆれ辞書（データ資産化②の名寄せマスタ）
-- 「転スラ」→「転生したらスライムだった件」のような別名を貯め、検索ヒット率と重複防止に使う。
-- 収集源: ユーザーが「検索語と違う名前の作品を選んだ」瞬間（search_pick）＋手動登録の余地（manual）

create table if not exists work_aliases (
  id uuid primary key default gen_random_uuid(),
  work_id uuid not null references works(id) on delete cascade,
  alias text not null,          -- 表示用の元表記
  alias_norm text not null,     -- 正規化済み（NFKC・小文字・空白/記号除去）。照合はこちら
  source text not null default 'manual', -- 'manual' | 'search_pick'
  created_at timestamptz not null default now()
);

-- 同じ別名は1作品にのみ紐づく（先勝ち）
create unique index if not exists idx_work_aliases_norm on work_aliases (alias_norm);
create index if not exists idx_work_aliases_work on work_aliases (work_id);

alter table work_aliases enable row level security;

-- 検索で使うため誰でも読める
drop policy if exists "work_aliases_select" on work_aliases;
create policy "work_aliases_select" on work_aliases
  for select to anon, authenticated using (true);

-- 収集は認証ユーザー（匿名認証含む）。削除・更新はservice_roleのみ（誤登録の掃除は運用で）
drop policy if exists "work_aliases_insert" on work_aliases;
create policy "work_aliases_insert" on work_aliases
  for insert to authenticated with check (true);

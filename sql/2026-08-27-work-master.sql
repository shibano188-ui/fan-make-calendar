-- 作品名の表記ゆれ辞書（作品マスタ）。
-- 「ガッシュ」「ドラクエ」「ハイキュー（!!なし）」「呪術回戦（誤字）」を正式表記に直すための参照表。
-- 作り方 → scripts/works-master/README.md ／ 方針 → Obsidian: Decisions/2026-08-27-work-master-source.md
--
-- 正規化はすべてこのファイルの関数に寄せてある。アプリ側・サーバー側は生の文字列を渡すだけでよく、
-- 同じ正規化を JS と TS に二重実装しなくて済む。

create extension if not exists fuzzystrmatch;

-- ── 正規化 ────────────────────────────────────────────────────────
-- 照合キー: NFKC → 小文字 → カタカナをひらがなへ → ヴの揺れを吸収 → 長音とダッシュを削除 → 記号と空白を削除
create or replace function work_name_norm(s text) returns text
language sql immutable strict as $$
  select regexp_replace(
           translate(
             replace(replace(replace(replace(replace(
               translate(lower(normalize(s, NFKC)), 'ァアィイゥウェエォオカガキギクグケゲコゴサザシジスズセゼソゾタダチヂッツヅテデトドナニヌネノハバパヒビピフブプヘベペホボポマミムメモャヤュユョヨラリルレロヮワヰヱヲンヴヵヶ', 'ぁあぃいぅうぇえぉおかがきぎくぐけげこごさざしじすずせぜそぞただちぢっつづてでとどなにぬねのはばぱひびぴふぶぷへべぺほぼぽまみむめもゃやゅゆょよらりるれろゎわゐゑをんゔゕゖ'),
             'ゔぁ', 'ば'), 'ゔぃ', 'び'), 'ゔぇ', 'べ'), 'ゔぉ', 'ぼ'), 'ゔ', 'ぶ'),
             'ー〜~‐‑–—―-', ''),
           '[^[:alnum:]]', '', 'g')
$$;

-- 長音「ー」を直前の文字の母音に開く。Wikipediaのかな読みが「すはいふあみりい」のように
-- 長音を母音で書く決まりなので、入力側も同じ形に揃える必要がある
create or replace function work_kana_vowel(c text) returns text
language sql immutable strict as $$
  select case
    when position(c in 'あかさたなはまやらわ') > 0 then 'あ'
    when position(c in 'いきしちにひみり')     > 0 then 'い'
    when position(c in 'うくすつぬふむゆる')   > 0 then 'う'
    when position(c in 'えけせてねへめれ')     > 0 then 'え'
    when position(c in 'おこそとのほもよろを') > 0 then 'お'
    else '' end
$$;

-- かな照合キー: 濁点・半濁点を落とし、小書きを大書きにし、長音を母音に開いて、ひらがな以外を捨てる
create or replace function work_kana_key(s text) returns text
language plpgsql immutable strict as $$
declare
  t text; res text := ''; c text; prev text := null; i int;
begin
  t := translate(lower(normalize(s, NFKC)), 'ァアィイゥウェエォオカガキギクグケゲコゴサザシジスズセゼソゾタダチヂッツヅテデトドナニヌネノハバパヒビピフブプヘベペホボポマミムメモャヤュユョヨラリルレロヮワヰヱヲンヴヵヶ', 'ぁあぃいぅうぇえぉおかがきぎくぐけげこごさざしじすずせぜそぞただちぢっつづてでとどなにぬねのはばぱひびぴふぶぷへべぺほぼぽまみむめもゃやゅゆょよらりるれろゎわゐゑをんゔゕゖ');
  t := normalize(regexp_replace(normalize(t, NFD), '[' || chr(12441) || chr(12442) || ']', '', 'g'), NFC);
  t := translate(t, 'ぁぃぅぇぉっゃゅょゎ', 'あいうえおつやゆよわ');
  for i in 1..length(t) loop
    c := substr(t, i, 1);
    if c in ('ー', '〜', '~') then
      if prev is not null then
        c := work_kana_vowel(prev);
        res := res || c;
        if c <> '' then prev := c; end if;
      end if;
    else
      res := res || c;
      prev := c;
    end if;
  end loop;
  return regexp_replace(res, '[^ぁ-ゖ]', '', 'g');
end $$;

-- ── マスタ本体 ────────────────────────────────────────────────────
create table if not exists work_master (
  id bigint primary key generated always as identity,
  qid text unique,                                  -- Wikidata の項目ID（取り直しのときの突き合わせ用）
  name text not null,                               -- 正式表記
  name_norm text generated always as (work_name_norm(name)) stored,
  reading text,                                     -- かな読み
  reading_norm text generated always as (work_kana_key(coalesce(reading, ''))) stored,
  kinds text[] not null default '{}',               -- anime / manga / game / franchise / group / vtuber / voice / agency
  popularity int not null default 0,                -- 何言語版のWikipediaに記事があるか＝知名度の目安
  created_at timestamptz not null default now()
);
-- 同じ照合キーは1件だけ。知名度の高い順に入れるので、有名な方が鍵を取る
create unique index if not exists idx_work_master_norm on work_master (name_norm);
create index if not exists idx_work_master_reading on work_master (reading_norm) where reading_norm <> '';

create table if not exists work_master_alias (
  id bigint primary key generated always as identity,
  master_id bigint not null references work_master(id) on delete cascade,
  alias text not null,
  alias_norm text generated always as (work_name_norm(alias)) stored
);
create unique index if not exists idx_wma_norm on work_master_alias (alias_norm);
create index if not exists idx_wma_master on work_master_alias (master_id);

alter table work_master enable row level security;
alter table work_master_alias enable row level security;

-- 検索に使うので誰でも読める。書き込みは service_role だけ（マスタは取り込みスクリプトが作る）
drop policy if exists "work_master_select" on work_master;
create policy "work_master_select" on work_master for select to anon, authenticated using (true);
drop policy if exists "work_master_alias_select" on work_master_alias;
create policy "work_master_alias_select" on work_master_alias for select to anon, authenticated using (true);

-- ── 引くための関数 ────────────────────────────────────────────────
-- 上の段ほど確信度が高い。呼ぶ側は match_kind を見て、自動で直すか確認するかを決める。
--   exact/alias/kana … 自動で正式名に直してよい
--   partial/typo     … 候補として見せて選ばせる
create or replace function resolve_work_name(q text)
returns table (name text, reading text, popularity int, match_kind text)
language sql stable as $$
  with q_keys as (select work_name_norm(q) as qn, work_kana_key(q) as qk)
  select t.name, t.reading, t.popularity, t.match_kind
  from (
    select distinct on (h.name) h.name, h.reading, h.popularity, h.match_kind, h.rnk
    from (
      select m.name, m.reading, m.popularity, 'exact'::text as match_kind, 1 as rnk
        from work_master m, q_keys where q_keys.qn <> '' and m.name_norm = q_keys.qn
      union all
      select m.name, m.reading, m.popularity, 'alias', 2
        from work_master_alias a join work_master m on m.id = a.master_id, q_keys
        where q_keys.qn <> '' and a.alias_norm = q_keys.qn
      union all
      select m.name, m.reading, m.popularity, 'kana', 3
        from work_master m, q_keys where q_keys.qk <> '' and m.reading_norm = q_keys.qk
      union all
      select * from (
        select m.name, m.reading, m.popularity, 'partial'::text, 4
          from work_master m, q_keys
          where length(q_keys.qn) >= 2 and m.name_norm like ('%' || q_keys.qn || '%')
          order by m.popularity desc limit 8
      ) p
      union all
      select * from (
        select m.name, m.reading, m.popularity, 'typo'::text, 5
          from work_master m, q_keys
          where length(q_keys.qn) between 3 and 24
            and abs(length(m.name_norm) - length(q_keys.qn)) <= 1
            and levenshtein_less_equal(m.name_norm, q_keys.qn, 1) <= 1
          order by m.popularity desc limit 5
      ) t2
    ) h
    order by h.name, h.rnk, h.popularity desc
  ) t
  order by t.rnk, t.popularity desc
$$;

grant execute on function resolve_work_name(text) to anon, authenticated;

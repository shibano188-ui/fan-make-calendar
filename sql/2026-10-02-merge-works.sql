-- =========================================================
-- 同じ作品なのに分かれている作品をまとめ、雑誌名の作品をやめる（柴野の判断・2026-10-02）
--
-- ① まとめる（予定・フォロー・自分用の予定を残す側へ付け替え、元の名前は別名にする）
--     呪術廻戦≡ / 呪術廻戦 ファントムパレード → 呪術廻戦
--     NARUTO-ナルト- 疾風伝                    → NARUTO-ナルト-
--     遊戯王                                    → 遊☆戯☆王
--     劇場版『チェンソーマン レゼ篇』            → チェンソーマン
-- ② 雑誌名の作品（少年ジャンプ＋ / 週刊少年ジャンプ / ジャンプＳＱ． / すすめ!ジャンプへっぽこ探検隊!）
--     ・『作品名』の付いたアートボードは、その作品へ付け替える（ヒカルの碁は作品が無いので作る）
--     ・雑誌全体のグッズ（ステッカー・ペン・カード・バッジなど）は予定ごと消す
--   ジャンプショップの巡回が雑誌名を作品として作り直さないよう、api/_crawl.ts で雑誌名を外している
--
-- 別名は、ボット（api/_crawl.ts workKey）とアプリ（src/lib/workAliases.ts）で正規化が違うので両方入れる。
-- ランキング（work_month_scores / work_nushi）の元の作品の行は消す。今月分は毎日の集計で作り直される。
-- 利用者の端末設定（非表示・通知しない・色・並び順の jsonb）に残る古い作品IDはそのまま（使われなくなるだけ）。
--
-- 適用：
--   本番……
-- =========================================================

-- 0. 作品を参照している表（ここに無い表が出たら、下に足してから流す）
-- select conrelid::regclass, conname, confdeltype from pg_constraint where confrelid = 'public.works'::regclass;

begin;

create temp table merge_map (old_name text, new_name text) on commit drop;
insert into merge_map values
  ('呪術廻戦≡', '呪術廻戦'),
  ('呪術廻戦 ファントムパレード', '呪術廻戦'),
  ('NARUTO-ナルト- 疾風伝', 'NARUTO-ナルト-'),
  ('遊戯王', '遊☆戯☆王'),
  ('劇場版『チェンソーマン レゼ篇』', 'チェンソーマン');

create temp table magazines (name text) on commit drop;
insert into magazines values ('少年ジャンプ＋'), ('週刊少年ジャンプ'), ('ジャンプＳＱ．'), ('すすめ!ジャンプへっぽこ探検隊!');

insert into works (name) values ('ヒカルの碁') on conflict do nothing;

-- ② 雑誌名の作品の中の、『作品名』の付いた予定 → その作品へ
create temp table moves on commit drop as
select e.id as event_id, w.id as new_id
from events e
join works mw on mw.id = e.work_id and mw.name in (select name from magazines)
join works w on e.title like '『' || w.name || '』%'
             or (w.name = 'ひまてん！' and e.title like '『ひまてん!』%')
             or (w.name = '呪術廻戦'  and e.title like '『呪術廻戦≡』%');
update events e set work_id = m.new_id from moves m where e.id = m.event_id;

-- ② 残り（雑誌全体のグッズ）は消す。likes 以外の子は外部キーの設定に任せる（delete_event と同じ）
create temp table drops on commit drop as
select e.id from events e join works w on w.id = e.work_id where w.name in (select name from magazines);
delete from likes  where event_id in (select id from drops);
delete from events where id in (select id from drops);

-- ① まとめる
create temp table pairs on commit drop as
select o.id as old_id, n.id as new_id, m.old_name
from merge_map m join works o on o.name = m.old_name join works n on n.name = m.new_name;

update events e set work_id = p.new_id from pairs p where e.work_id = p.old_id;
update personal_events e set work_id = p.new_id from pairs p where e.work_id = p.old_id;
-- フォロー: 両方フォローしていた人は、元の作品の行を消すだけ
delete from participations a using pairs p
 where a.work_id = p.old_id and exists (select 1 from participations b where b.user_id = a.user_id and b.work_id = p.new_id);
update participations a set work_id = p.new_id from pairs p where a.work_id = p.old_id;
update work_aliases a set work_id = p.new_id from pairs p where a.work_id = p.old_id;

-- 元の名前を別名に（ボット用・アプリ用）
insert into work_aliases (work_id, alias, alias_norm, source)
select p.new_id, p.old_name, v.norm, 'manual'
from pairs p
join (values
  ('呪術廻戦≡', '呪術廻戦≡'),
  ('呪術廻戦 ファントムパレード', '呪術廻戦ファントムパレド'),
  ('呪術廻戦 ファントムパレード', '呪術廻戦ファントムパレード'),
  ('NARUTO-ナルト- 疾風伝', 'narutoナルト疾風伝'),
  ('NARUTO-ナルト- 疾風伝', 'naruto-ナルト-疾風伝'),
  ('遊戯王', '遊戯王'),
  ('劇場版『チェンソーマン レゼ篇』', '劇場版チェンソマンレゼ篇'),
  ('劇場版『チェンソーマン レゼ篇』', '劇場版チェンソーマンレゼ篇')
) as v(old_name, norm) on v.old_name = p.old_name
on conflict (alias_norm) do update set work_id = excluded.work_id;

-- 消す作品（まとめた元 ＋ 雑誌名）
create temp table gone on commit drop as
select old_id as id from pairs
union select id from works where name in (select name from magazines);

delete from work_month_scores where work_id in (select id from gone);
delete from work_nushi        where work_id in (select id from gone);
delete from works             where id in (select id from gone);

-- 確かめ: 0 行・0 件になるはず
select name from works where name in (select old_name from merge_map) or name in (select name from magazines);
select (select count(*) from moves) as moved, (select count(*) from drops) as dropped, (select count(*) from pairs) as merged;

commit;
-- 件数がおかしければ commit の代わりに rollback;

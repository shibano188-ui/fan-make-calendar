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
--   本番……2026-10-02 柴野（SQL Editor。2回目の実行は件数0で自動で取り消された＝1回目で済んでいる）
-- =========================================================

-- 0. 作品を参照している表（ここに無い表が出たら、下に足してから流す）
-- select conrelid::regclass, conname, confdeltype from pg_constraint where confrelid = 'public.works'::regclass;

-- SQL Editor で全体を1回で実行する。1つの do ブロックなので、途中で失敗したら全部取り消される。
-- 件数が想定（移す11・消す16・まとめる5）と違えば、自分でエラーにして取り消す
do $$
declare
  v_moved int; v_dropped int; v_merged int;
begin
  create temp table merge_map (old_name text, new_name text);
  insert into merge_map values
    ('呪術廻戦≡', '呪術廻戦'),
    ('呪術廻戦 ファントムパレード', '呪術廻戦'),
    ('NARUTO-ナルト- 疾風伝', 'NARUTO-ナルト-'),
    ('遊戯王', '遊☆戯☆王'),
    ('劇場版『チェンソーマン レゼ篇』', 'チェンソーマン');

  create temp table magazines (name text);
  insert into magazines values ('少年ジャンプ＋'), ('週刊少年ジャンプ'), ('ジャンプＳＱ．'), ('すすめ!ジャンプへっぽこ探検隊!');

  insert into works (name) values ('ヒカルの碁') on conflict do nothing;

  -- ② 雑誌名の作品の中の、『作品名』の付いた予定 → その作品へ
  create temp table moves as
  select e.id as event_id, w.id as new_id
  from events e
  join works mw on mw.id = e.work_id and mw.name in (select name from magazines)
  join works w on w.name not in (select name from magazines) and w.name not in (select old_name from merge_map) and (e.title like '『' || w.name || '』%'
               or (w.name = 'ひまてん！' and e.title like '『ひまてん!』%')
               or (w.name = '呪術廻戦'  and e.title like '『呪術廻戦≡』%'));
  update events e set work_id = m.new_id from moves m where e.id = m.event_id;
  select count(*) into v_moved from moves;

  -- ② 残り（雑誌全体のグッズ）は消す。likes 以外の子は外部キーの設定に任せる（delete_event と同じ）
  create temp table drops as
  select e.id from events e join works w on w.id = e.work_id where w.name in (select name from magazines);
  delete from likes  where event_id in (select id from drops);
  delete from events where id in (select id from drops);
  select count(*) into v_dropped from drops;

  -- ① まとめる
  create temp table pairs as
  select o.id as old_id, n.id as new_id, m.old_name
  from merge_map m join works o on o.name = m.old_name join works n on n.name = m.new_name;
  select count(*) into v_merged from pairs;

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
  delete from work_month_scores where work_id in (select old_id from pairs) or work_id in (select id from works where name in (select name from magazines));
  delete from work_nushi        where work_id in (select old_id from pairs) or work_id in (select id from works where name in (select name from magazines));
  delete from works where id in (select old_id from pairs) or name in (select name from magazines);

  if v_moved <> 11 or v_dropped <> 16 or v_merged <> 5 then
    raise exception '件数が想定と違うので取り消しました（移す %・消す %・まとめる %）', v_moved, v_dropped, v_merged;
  end if;

  drop table merge_map, magazines, moves, drops, pairs;
end $$;

-- 確かめ: 0 行になるはず
select name from works
where name in ('呪術廻戦≡', '呪術廻戦 ファントムパレード', 'NARUTO-ナルト- 疾風伝', '遊戯王', '劇場版『チェンソーマン レゼ篇』',
               '少年ジャンプ＋', '週刊少年ジャンプ', 'ジャンプＳＱ．', 'すすめ!ジャンプへっぽこ探検隊!');

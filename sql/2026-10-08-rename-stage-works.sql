-- =========================================================
-- 映画・舞台1本の名前で作られた作品を、作品の名前に直す（柴野の判断・2026-10-08）
--
--   劇場版『ゾンビランドサガ ゆめぎんがパラダイス』 → ゾンビランドサガ（予定30件・フォロー0）
--   劇団「忍たま乱太郎」長屋物語 再演　同時通販     → 忍たま乱太郎（予定11件・フォロー3）
--
-- どちらもムービック等の巡回（ボット）が店の作品一覧の名前で作ったもの。元の作品はまだ無いので、
-- まとめるのではなく名前を変えるだけ（予定・フォロー・ランキングは作品IDのままなので触らない）。
-- 元の名前は別名にする（ボットの workKey とアプリの normalizeWorkName はこの2つでは同じ値になる）。
-- 作り直さないよう、api/_crawl.ts の resolveWork で「劇場版」「劇団」などとかっこを外して作品を探すようにした。
--
-- 適用：
--   本番……（未適用）
-- =========================================================

do $$
declare
  n int;
begin
  create temp table rename_map (old_name text, new_name text, alias_norm text);
  insert into rename_map values
    ('劇場版『ゾンビランドサガ ゆめぎんがパラダイス』', 'ゾンビランドサガ', '劇場版ゾンビランドサガゆめぎんがパラダイス'),
    ('劇団「忍たま乱太郎」長屋物語 再演　同時通販', '忍たま乱太郎', '劇団忍たま乱太郎長屋物語再演同時通販');

  if exists (select 1 from works w join rename_map m on w.name = m.new_name) then
    raise exception '新しい名前の作品がもうあるので取り消しました（まとめる SQL にする）';
  end if;

  insert into work_aliases (work_id, alias, alias_norm, source)
  select w.id, m.old_name, m.alias_norm, 'manual'
  from rename_map m join works w on w.name = m.old_name
  on conflict (alias_norm) do update set work_id = excluded.work_id;

  update works w set name = m.new_name from rename_map m where w.name = m.old_name;
  get diagnostics n = row_count;

  if n <> 2 then
    raise exception '件数が想定と違うので取り消しました（名前を変えた作品 %）', n;
  end if;

  drop table rename_map;
end $$;

-- 確かめ: 2行（予定 30・11）
select w.name, (select count(*) from events e where e.work_id = w.id) as events, w.participant_count
from works w where w.name in ('ゾンビランドサガ', '忍たま乱太郎');

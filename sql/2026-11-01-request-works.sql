-- =========================================================
-- 作品の追加依頼が来た3作品を作り、サンリオ・ペルソナに入っていたプロセカの予定を移す（柴野の判断・2026-11-01）
--
-- ① 作品を作る
--     プロジェクトセカイ カラフルステージ! feat. 初音ミク（別名: プロセカ・プロジェクトセカイ）
--     あんさんぶるスターズ!!（別名: あんスタ）
--     ブラックスター -Theater Starless-（別名: ブラスタ）
-- ② 商品名にプロジェクトセカイが入る予定を、サンリオ（32件）・ペルソナ（1件）からプロセカへ移す
--     いいねは0件。サンリオ・ペルソナをフォローしている人には、この33件が出なくなる
--
-- 別名の alias_norm は、ボット（api/_crawl.ts workKey）とアプリ（src/lib/workAliases.ts）で同じ値になるものだけ。
-- 長音を含まないので両方入れる必要はない。
--
-- 適用：
--   開発……2026-11-01 柴野
--   本番……2026-11-01 柴野（SQL Editor。プロセカ33件・別名2、あんスタ・ブラスタは別名1を確認）
-- =========================================================

-- SQL Editor で全体を1回で実行する。1つの do ブロックなので、途中で失敗したら全部取り消される。
-- 移す件数が想定より少なければ、自分でエラーにして取り消す（巡回で増えることはあるので下限だけ見る）
do $$
declare
  v_moved int;
  v_proseka uuid;
begin
  insert into works (name) values
    ('プロジェクトセカイ カラフルステージ! feat. 初音ミク'),
    ('あんさんぶるスターズ!!'),
    ('ブラックスター -Theater Starless-')
  on conflict do nothing;

  insert into work_aliases (work_id, alias, alias_norm, source)
  select w.id, v.alias, v.norm, 'manual'
  from (values
    ('プロジェクトセカイ カラフルステージ! feat. 初音ミク', 'プロセカ', 'プロセカ'),
    ('プロジェクトセカイ カラフルステージ! feat. 初音ミク', 'プロジェクトセカイ', 'プロジェクトセカイ'),
    ('あんさんぶるスターズ!!', 'あんスタ', 'あんスタ'),
    ('ブラックスター -Theater Starless-', 'ブラスタ', 'ブラスタ')
  ) as v(work_name, alias, norm)
  join works w on w.name = v.work_name
  on conflict (alias_norm) do update set work_id = excluded.work_id;

  select id into v_proseka from works where name = 'プロジェクトセカイ カラフルステージ! feat. 初音ミク';

  update events e set work_id = v_proseka
  from works w
  where w.id = e.work_id and w.name in ('サンリオ', 'ペルソナ') and e.title like '%プロジェクトセカイ%';
  get diagnostics v_moved = row_count;

  if v_moved < 33 then
    raise exception '移す件数が想定より少ないので取り消しました（%件）', v_moved;
  end if;
end $$;

-- 確かめ: 予定の件数・別名の数。プロセカが33件以上、別名が2・1・1になるはず
select w.name, count(distinct e.id) as events, count(distinct a.alias_norm) as aliases
from works w
left join events e on e.work_id = w.id
left join work_aliases a on a.work_id = w.id
where w.name in ('プロジェクトセカイ カラフルステージ! feat. 初音ミク', 'あんさんぶるスターズ!!', 'ブラックスター -Theater Starless-')
group by w.name;

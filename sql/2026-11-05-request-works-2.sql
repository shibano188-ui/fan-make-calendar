-- =========================================================
-- 作品の追加依頼（2回目）の3作品を作り、カナヘイの小動物に入っていたとんがり帽子のアトリエの予定を移す（柴野の判断・2026-11-05）
--
-- ① 作品を作る
--     TRIGUN（別名: トライガン）……ムービック・AMNIBUS に商品あり。api/_crawl.ts の FIXED_WORKS で検索する
--     とんがり帽子のアトリエ……ムービック・AMNIBUS に商品あり。同上
--     嘘喰い（別名: うそくい）……巡回先に商品が無いので作品だけ。予定は投稿頼み
--     M!LK は依頼があるがアイドルグループで対象外（柴野・2026-11-05）
-- ② 商品名にとんがり帽子のアトリエが入る予定を、カナヘイの小動物（10件・すべてコラボ商品）からとんがり帽子のアトリエへ移す
--     カナヘイの小動物をフォローしている人には、この10件が出なくなる（プロセカ×サンリオのときと同じ扱い）
--
-- 別名の alias_norm は、ボット（api/_crawl.ts workKey）とアプリ（src/lib/workAliases.ts）で同じ値になるものだけ。
--
-- 適用：
--   開発……2026-11-05 柴野
--   本番……2026-11-05 柴野（SQL Editor。とんがり帽子10件・別名 TRIGUN 1・嘘喰い 1 を確認）
-- =========================================================

-- SQL Editor で全体を1回で実行する。1つの do ブロックなので、途中で失敗したら全部取り消される
do $$
declare
  v_tongari uuid;
begin
  insert into works (name) values
    ('TRIGUN'),
    ('とんがり帽子のアトリエ'),
    ('嘘喰い')
  on conflict do nothing;

  insert into work_aliases (work_id, alias, alias_norm, source)
  select w.id, v.alias, v.norm, 'manual'
  from (values
    ('TRIGUN', 'トライガン', 'トライガン'),
    ('嘘喰い', 'うそくい', 'うそくい')
  ) as v(work_name, alias, norm)
  join works w on w.name = v.work_name
  on conflict (alias_norm) do update set work_id = excluded.work_id;

  select id into v_tongari from works where name = 'とんがり帽子のアトリエ';

  update events e set work_id = v_tongari
  from works w
  where w.id = e.work_id and w.name = 'カナヘイの小動物' and e.title like '%とんがり帽子のアトリエ%';
end $$;

-- 確かめ: 予定の件数・別名の数。本番ではとんがり帽子が10件以上、別名が TRIGUN 1・嘘喰い 1 になるはず
select w.name, count(distinct e.id) as events, count(distinct a.alias_norm) as aliases
from works w
left join events e on e.work_id = w.id
left join work_aliases a on a.work_id = w.id
where w.name in ('TRIGUN', 'とんがり帽子のアトリエ', '嘘喰い')
group by w.name;

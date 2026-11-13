-- =========================================================
-- 作品の追加依頼（3回目）の4作品を作る（2026-11-14）
--
-- 依頼は feedbacks の page='/onboarding/works'（11-06〜11-09 の分）
--   魔入りました！入間くん（別名: 入間くん）……ムービックに商品あり。api/_crawl.ts の FIXED_WORKS で巡回する
--   Re:ゼロから始める異世界生活（別名: リゼロ）……ムービックに商品あり。同上
--   メルクストーリア（別名: メルスト）……ムービックに商品が無いので作品だけ。予定は投稿頼み（嘘喰いと同じ扱い）
--   終末なにしてますか？忙しいですか？救ってもらっていいですか？（別名: すかすか）……同上
--   桃源暗鬼は依頼の日（11-07）に作品ができていて予定もある（41件）ので、ここでは作らない。巡回にだけ足す
--
-- 別名の alias_norm は、ボット（api/_crawl.ts workKey）とアプリ（src/lib/workAliases.ts）で同じ値になるものだけ。
--
-- 適用：
--   開発……
--   本番……
-- =========================================================

-- SQL Editor で全体を1回で実行する。1つの do ブロックなので、途中で失敗したら全部取り消される
do $$
begin
  insert into works (name) values
    ('魔入りました！入間くん'),
    ('Re:ゼロから始める異世界生活'),
    ('メルクストーリア'),
    ('終末なにしてますか？忙しいですか？救ってもらっていいですか？')
  on conflict do nothing;

  insert into work_aliases (work_id, alias, alias_norm, source)
  select w.id, v.alias, v.norm, 'manual'
  from (values
    ('魔入りました！入間くん', '入間くん', '入間くん'),
    ('Re:ゼロから始める異世界生活', 'リゼロ', 'リゼロ'),
    ('メルクストーリア', 'メルスト', 'メルスト'),
    ('終末なにしてますか？忙しいですか？救ってもらっていいですか？', 'すかすか', 'すかすか')
  ) as v(work_name, alias, norm)
  join works w on w.name = v.work_name
  on conflict (alias_norm) do update set work_id = excluded.work_id;
end $$;

-- 確かめ: 4作品が1行ずつ、別名が1つずつ出るはず
select w.name, count(distinct a.alias_norm) as aliases
from works w
left join work_aliases a on a.work_id = w.id
where w.name in ('魔入りました！入間くん', 'Re:ゼロから始める異世界生活', 'メルクストーリア', '終末なにしてますか？忙しいですか？救ってもらっていいですか？')
group by w.name;

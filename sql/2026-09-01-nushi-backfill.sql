-- 過去の月を遡って集計・確定する。**1回だけ流せばよい**（何度流しても結果は同じ）。
--
-- finalize_nushi は中で refresh_work_month_scores を呼ぶので、確定だけ並べればよい。
-- 古い月から順に流す（work_nushi は既に入っている月を触らないので順序は結果に影響しないが、
-- ログを読むときに時系列で並んでいたほうが分かる）。
--
-- 実データで見込まれる結果（2026-09-01 時点の読み取りで確認済み）:
--   5月 … 載る1人 / 15点以上 0人 → ヌシなし
--   6月 … 載る18人 / 15点以上 7人 → ヌシが決まる（履歴に残るが、9月時点では窓の外）
--   7月 … 載る14人 / 15点以上 3人 → **これが今の現ヌシになる**
--   8月 … 載る8人 / 15点以上 0人 → ヌシなし（最高7点）
--
-- 「現ヌシ」の窓は暦から決まる（今月の2ヶ月前以降）。9月に流すと 7月・8月 が窓の中。

select m::text as month, public.finalize_nushi(m) as nushi_seated
  from (values ('2026-05-01'::date), ('2026-06-01'), ('2026-07-01'), ('2026-08-01')) v(m)
 order by m;

-- 確認（流したあとに見る）:
--   select month, count(*) from public.work_nushi group by month order by month;
--   select * from public.work_nushi_current;

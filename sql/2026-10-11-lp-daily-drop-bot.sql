-- =========================================================
-- LP の計測（lp_daily）から、2026-10-11 の自動操作の分を消す
--
-- 何があったか：10/11 の朝（6:30〜8:00 ごろ）、iPhone（iOS 15.0）と Mac（Chrome 130）のふりをした
--   自動操作のブラウザが fanhive.jp/lp.html を繰り返し開き、ボタンを押し続けた。
--   閲覧 357・上のボタン（Google Play 609 / App Store 66）。チームの誰も開いていない
-- 消すもの：10/11 の direct の閲覧と、上のボタン（hero）の押下の3行だけ。
--   同じ日に人が開いた数件も一緒に消える（見分けられないため）。共有ページ（share）と get.html の分は残す
-- これからの分：lp.html・get.html・共有ページは navigator.webdriver のときは送らないようにした（同じ日のコミット）
--
-- 適用：
--   本番……2026-10-11 柴野の指示で Claude（消す前に同じ条件の select で3行だけなのを確かめた）
-- =========================================================

delete from public.lp_daily
where day = '2026-10-11'
  and src = 'direct'
  and (
    (metric = 'page_views' and placement = '')
    or (metric = 'download_clicks' and placement = 'hero')
  )
returning day, src, placement, store, metric, value;

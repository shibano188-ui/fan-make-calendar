// テーマを当てた状態で、**iOSと同じ描画エンジン(WebKit)**でも崩れないかを見る。
//
// なぜ要るか: 入力欄の既定の幅は「文字20個ぶん」で、テーマで書体が変わると広がる。
// WebKit ではそれが flex の親を押し広げ、隣のボタンを画面外へ追い出した。
// **Chromium では再現しない**ので、普段のsmokeだけでは取りこぼす。
//
// 使い方: node scripts/theme-webkit-check.mjs [URL]
import { webkit } from 'playwright';

const BASE = process.argv[2] ?? 'http://localhost:5173';
const SKINS = ['classic', 'panel', 'surge'];
const PAGES = [['/', 'ホーム'], ['/explore', '探す'], ['/saved', 'カレンダー'], ['/mypage', 'マイページ'], ['/customize', 'カスタマイズ']];
let failed = 0;
const log = (ok, msg) => { if (!ok) failed++; console.log(`  ${ok ? 'ok  ' : 'NG  '} ${msg}`); };

const b = await webkit.launch();
for (const skin of SKINS) {
  console.log(`\n━━ ${skin} （画面幅375 = iPhone SE 相当）━━`);
  const page = await b.newPage({ viewport: { width: 375, height: 667 } });
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(s => {
    localStorage.setItem('fan_skin', s);
    localStorage.setItem('fan_onboarding_done_v2', '1');
  }, skin);
  for (const [path, name] of PAGES) {
    await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    const r = await page.evaluate(() => {
      const d = document.documentElement;
      // 画面から右へはみ出している要素を探す（横スクロールが生まれる＝何かが押し出されている）
      const over = [...document.querySelectorAll('header,nav,input,button')]
        .filter(el => el.getBoundingClientRect().right > window.innerWidth + 1)
        .map(el => (el.getAttribute('aria-label') || el.tagName).slice(0, 20));
      return { 横はみ出し: d.scrollWidth - d.clientWidth, 画面外: [...new Set(over)].slice(0, 4) };
    });
    log(r.横はみ出し <= 0 && r.画面外.length === 0,
      `${name}: 横にはみ出していない（${r.横はみ出し}px${r.画面外.length ? ' / ' + r.画面外.join(',') : ''}）`);
  }
  await page.close();
}
await b.close();
console.log(failed === 0 ? '\n✔ すべて通過' : `\n✘ ${failed}件 失敗`);
process.exit(failed === 0 ? 0 : 1);

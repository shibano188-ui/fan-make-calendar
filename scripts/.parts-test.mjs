// 新しく足した部品を、AIを呼ばずに直接当てて確かめる。
// 「検品するのは部品であって組み合わせではない」ので、部品ごとに1枚ずつ見る。
import { chromium } from 'playwright';
const BASE = process.argv[2];
const CASES = [
  ['shape-notch',  { shape: 'notch' }],
  ['shape-frame',  { shape: 'frame' }],
  ['bars-knockout',{ bars: 'knockout' }],
  ['bars-clear',   { bars: 'clear' }],
  ['orn-rays',     { ornament: 'rays' }],
  ['cap-square',   { 'icon-cap': 'square' }],
];
const b = await chromium.launch();
for (const [tag, attrs] of CASES) {
  const page = await b.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(`${BASE}/explore`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2200);
  await page.evaluate(a => {
    const r = document.documentElement;
    r.setAttribute('data-themed', '');
    r.style.setProperty('--skin-radius', '4px');
    r.style.setProperty('--skin-radius-sm', '4px');
    r.style.setProperty('--skin-radius-lg', '6px');
    r.style.setProperty('--skin-radius-pill', '6px');
    r.style.setProperty('--skin-border', '1px');
    r.style.setProperty('--skin-orn-size', '16px');
    r.style.setProperty('--skin-orn-weight', '3px');
    r.style.setProperty('--skin-icon-stroke', '2');
    for (const [k, v] of Object.entries(a)) r.setAttribute('data-' + k, v);
  }, attrs);
  await page.waitForTimeout(700);
  await page.screenshot({ path: `scripts/.smoke/part-${tag}.png` });
  await page.close();
}
await b.close();
console.log('撮りました');

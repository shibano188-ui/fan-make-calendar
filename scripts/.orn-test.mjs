import { chromium } from 'playwright';
const [BASE, WISH, TAG] = process.argv.slice(2);
const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 390, height: 844 } });
await page.goto(`${BASE}/customize/theme`, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.locator('textarea').first().fill(WISH);
await page.getByRole('button', { name: '作る', exact: true }).click();
await page.waitForTimeout(28000);
console.log(TAG, await page.evaluate(() => {
  const r = document.documentElement, cs = getComputedStyle(r);
  return `orn=${r.getAttribute('data-ornament')} size=${cs.getPropertyValue('--skin-orn-size').trim()} w=${cs.getPropertyValue('--skin-orn-weight').trim()} cap=${r.getAttribute('data-icon-cap')} icon=${cs.getPropertyValue('--skin-icon-stroke').trim()} shape=${r.getAttribute('data-shape')}`;
}));
await page.getByRole('button', { name: '実際の画面で見てみる' }).click();
await page.waitForTimeout(2500);
await page.screenshot({ path: `scripts/.smoke/orn-${TAG}.png` });
await b.close();

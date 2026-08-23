import { webkit } from 'playwright';
const BASE = 'https://fanhive.jp';
const OUT = '/private/tmp/claude-501/-Users-shisoh-Desktop-LLP-fan-make-calender/c194d816-4a7b-4044-bd80-89d9357d5a08/scratchpad/shots';
const b = await webkit.launch();
const ctx = await b.newContext({ viewport: { width: 440, height: 956 }, deviceScaleFactor: 3 });
await ctx.addInitScript(() => {
  localStorage.setItem('fan_onboarding_done_v2', '1');
  localStorage.setItem('user_settings', JSON.stringify({ theme: 'simple' }));
});
const page = await ctx.newPage();
let api = 0;
page.on('response', r => { if (r.url().includes('/api/generate-theme')) api = r.status(); });
const sat = () => page.addStyleTag({ content: ':root{--sat:63px !important}' });

await page.goto(`${BASE}/customize/theme`, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await sat();
await page.locator('textarea').first().fill('推しのイメージカラーの水色で、やさしくてまるい感じにして');
await page.evaluate(() => document.activeElement && document.activeElement.blur());
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/raw-create.png` });          // ①

await page.getByRole('button', { name: '作る', exact: true }).click();
await page.waitForTimeout(30000);
console.log('生成 API', api);
await page.getByLabel('テーマの名前').fill('推しテーマ');
await page.waitForTimeout(300);
await page.getByRole('button', { name: '保存する' }).click();
await page.waitForTimeout(4500);

await page.goto(`${BASE}/customize`, { waitUntil: 'networkidle' });
await page.waitForTimeout(2000); await sat(); await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/raw-customize.png` });        // ②

await page.goto(`${BASE}/explore`, { waitUntil: 'networkidle' });
await page.waitForTimeout(3000); await sat(); await page.waitForTimeout(300);
console.log('地の色', await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--bg-primary').trim()));
await page.screenshot({ path: `${OUT}/raw-applied.png` });          // ④
await b.close();

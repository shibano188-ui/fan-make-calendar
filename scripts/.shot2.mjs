import { webkit } from 'playwright';
const BASE = 'https://fanhive.jp';
const OUT = '/private/tmp/claude-501/-Users-shisoh-Desktop-LLP-fan-make-calender/c194d816-4a7b-4044-bd80-89d9357d5a08/scratchpad/shots';
const P1 = '推しのイメージカラーの水色で、やさしくてまるい感じにして';
const P2 = 'ライブTシャツみたいな黒と蛍光イエロー';

const b = await webkit.launch();
const ctx = await b.newContext({ viewport: { width: 440, height: 956 }, deviceScaleFactor: 3 });
const page = await ctx.newPage();
let api = 0;
page.on('response', r => { if (r.url().includes('/api/generate-theme')) api = r.status(); });
const sat = () => page.addStyleTag({ content: ':root{--sat:63px !important}' });

await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
await page.evaluate(() => {
  localStorage.setItem('fan_onboarding_done_v2', '1');
  const s = JSON.parse(localStorage.getItem('user_settings') || '{}');
  localStorage.setItem('user_settings', JSON.stringify({ ...s, theme: 'simple' }));
});

// ① 書き終えて「作る」を押す直前
await page.goto(`${BASE}/customize/theme`, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await sat();
await page.locator('textarea').first().fill(P1);
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/raw-create.png` });
console.log('① 入力中を撮影');

// ② 生成 → 名前を「推しテーマ」に → 保存 → カスタマイズ
await page.getByRole('button', { name: '作る', exact: true }).click();
await page.waitForTimeout(30000);
console.log('  生成 API', api);
await page.getByLabel('テーマの名前').fill('推しテーマ');
await page.waitForTimeout(400);
await page.getByRole('button', { name: '保存する' }).click();
await page.waitForTimeout(4000);
await page.goto(`${BASE}/customize`, { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
await sat();
await page.screenshot({ path: `${OUT}/raw-customize.png` });
console.log('② カスタマイズを撮影');

// ③ 別のテーマを当てた「探す」（見本用）
await page.evaluate(() => localStorage.setItem('fan_premium_v1', '1'));
await page.goto(`${BASE}/customize/theme`, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.locator('textarea').first().fill(P2);
await page.getByRole('button', { name: '作る', exact: true }).click();
await page.waitForTimeout(30000);
console.log('  生成 API', api);
await page.getByRole('button', { name: '実際の画面で見てみる' }).click();
await page.waitForTimeout(3000);
await sat();
await page.screenshot({ path: `${OUT}/raw-applied.png` });
console.log('③ 適用例を撮影');
await b.close();

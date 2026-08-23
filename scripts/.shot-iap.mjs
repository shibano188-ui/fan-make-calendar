import { webkit } from 'playwright';
const BASE = process.argv[2];
const OUT = '/private/tmp/claude-501/-Users-shisoh-Desktop-LLP-fan-make-calender/c194d816-4a7b-4044-bd80-89d9357d5a08/scratchpad/shots';
const b = await webkit.launch();
const ctx = await b.newContext({ viewport: { width: 440, height: 956 }, deviceScaleFactor: 3 });
const page = await ctx.newPage();
await page.route('**/*vercel.live*', r => r.abort());
await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
await page.evaluate(() => {
  localStorage.setItem('fan_onboarding_done_v2', '1');
  const s = JSON.parse(localStorage.getItem('user_settings') || '{}');
  localStorage.setItem('user_settings', JSON.stringify({ ...s, theme: 'simple' }));
});
await page.goto(`${BASE}/premium`, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.addStyleTag({ content: ':root{--sat:63px !important}' });
// 両方のプランを出す
await page.getByRole('button', { name: 'すべてのプランを見る' }).click().catch(() => {});
await page.waitForTimeout(600);

const clean = () => page.evaluate(() => {
  document.querySelectorAll('p').forEach(p => {
    if (p.textContent?.includes('購入はアプリ版から')) {
      p.textContent = p.textContent.replace(/\s*購入はアプリ版からお願いします。/, '');
    }
  });
});

for (const [label, file] of [['月払い', 'iap-monthly'], ['年払い', 'iap-yearly']]) {
  await page.getByRole('button', { name: new RegExp(label) }).first().click();
  await page.waitForTimeout(700);
  await clean();
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${OUT}/raw-${file}.png` });
  console.log(label, '撮影');
}
await b.close();

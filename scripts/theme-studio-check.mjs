// テーマ生成画面の通し確認（AIを呼ばない範囲）。
//
// 見るのは3つ:
//   1. 作る画面が開くこと
//   2. **ボタンでの手直しが即座にアプリ全体へ効くこと**（html の属性とCSS変数が動く）
//   3. 「元に戻す」で前の版に戻ること
//
// 使い方: npm run dev を別で起こしてから  node scripts/theme-studio-check.mjs [URL]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.argv[2] ?? 'http://localhost:5173';
const OUT = 'scripts/.smoke';
let failed = 0;
const log = (ok, msg) => { if (!ok) failed++; console.log(`  ${ok ? 'ok  ' : 'NG  '} ${msg}`); };

const readRoot = page => page.evaluate(() => {
  const r = document.documentElement;
  const cs = getComputedStyle(r);
  return {
    shape: r.getAttribute('data-shape'),
    bars: r.getAttribute('data-bars'),
    texture: r.getAttribute('data-texture'),
    themed: r.hasAttribute('data-themed'),
    radius: cs.getPropertyValue('--skin-radius').trim(),
    bg: cs.getPropertyValue('--bg-primary').trim(),
  };
});

const run = async () => {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));

  await page.goto(`${BASE}/customize`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);

  log(await page.getByText('自分のテーマ').isVisible(), '「自分のテーマ」の欄がある');
  await page.getByText('AIで作る').click();
  await page.waitForTimeout(300);
  log(await page.getByPlaceholder(/.+/).first().isVisible(), '作る画面が開く');

  const before = await readRoot(page);
  log(before.themed, '下書きを始めた時点でテーマが当たっている（data-themed）');

  // ボタンでの手直し（APIを呼ばない）
  await page.getByRole('button', { name: '角ばらせる' }).click();
  await page.waitForTimeout(200);
  const squared = await readRoot(page);
  log(squared.radius !== before.radius, `角丸が変わる（${before.radius} → ${squared.radius}）`);

  await page.getByRole('button', { name: '上を帯にする' }).click();
  await page.waitForTimeout(200);
  const banded = await readRoot(page);
  log(banded.bars === 'band', `上部バーが帯になる（${banded.bars}）`);

  await page.getByRole('button', { name: '質感をつける' }).click();
  await page.waitForTimeout(200);
  log((await readRoot(page)).texture === 'dots', '地に質感が付く');

  await page.getByRole('button', { name: '暗く' }).click();
  await page.waitForTimeout(200);
  const darker = await readRoot(page);
  log(darker.bg !== banded.bg, `地の色が動く（${banded.bg} → ${darker.bg}）`);

  await page.screenshot({ path: `${OUT}/studio-tweaked.png` });

  // 元に戻す（版を積んでいるので1つずつ戻る）
  await page.getByRole('button', { name: '元に戻す' }).click();
  await page.waitForTimeout(200);
  log((await readRoot(page)).bg === banded.bg, '「元に戻す」で1つ前の版に戻る');

  // やめると素の見た目へ
  await page.getByRole('button', { name: 'やめる', exact: true }).click();
  await page.waitForTimeout(300);
  const closed = await readRoot(page);
  log(!closed.themed, 'やめるとテーマが外れる（属性が残らない）');

  log(errors.length === 0, `JSの例外が出ていない（${errors.length}件）`);
  await browser.close();

  console.log(failed === 0 ? '\n✔ すべて通過' : `\n✘ ${failed}件 失敗`);
  process.exit(failed === 0 ? 0 : 1);
};

run();

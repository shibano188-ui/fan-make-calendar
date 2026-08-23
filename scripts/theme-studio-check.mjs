// テーマを作る画面の通し確認。
//
// 見るのは:
//   1. カスタマイズから専用ページへ移れること・入力欄が折り返す形であること
//   2. **作る前に軸の操作を出していないこと**（プリセットを改造する画面ではない）
//   3. 生成が通れば、アプリ全体に当たり・微調整が出て・元に戻せること
//
// 生成はAPIが要る。ローカルの `npm run dev` にはAPIが無いので、
// **APIが使えないときは後半を飛ばす**（前半だけでも作りの崩れは拾える）。
//
// 使い方: node scripts/theme-studio-check.mjs [URL]
//         プレビューのURLを渡すと生成まで通しで確認する
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.argv[2] ?? 'http://localhost:5173';
const OUT = 'scripts/.smoke';
let failed = 0;
const log = (ok, msg) => { if (!ok) failed++; console.log(`  ${ok ? 'ok  ' : 'NG  '} ${msg}`); };
const skip = msg => console.log(`  --   ${msg}`);

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
  let apiStatus = 0;
  page.on('pageerror', e => errors.push(e.message));
  page.on('response', r => { if (r.url().includes('/api/generate-theme')) apiStatus = r.status(); });

  await page.goto(`${BASE}/customize`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  log(await page.getByText('自分のテーマ').isVisible(), '「自分のテーマ」の欄がある');
  log(await page.getByText('無料で保存できるのは1つまで。').isVisible(), '保存数の案内が出ている');

  await page.getByRole('button', { name: '作る', exact: true }).click();
  await page.waitForTimeout(800);
  log(page.url().includes('/customize/theme'), '専用ページへ移る');
  log(await page.locator('textarea').first().isVisible(), '折り返す入力欄がある');
  log(await page.getByText(/参考画像は無くてもかまいません/).isVisible(), '参考画像が任意だと書いてある');
  log(await page.getByRole('button', { name: '明るく' }).count() === 0, '作る前に微調整を出していない');
  log(await page.getByRole('button', { name: '保存する' }).count() === 0, '作る前に保存を出していない');
  log((await readRoot(page)).themed, '下書きが当たっている（data-themed）');
  await page.screenshot({ path: `${OUT}/theme-create.png` });

  // ── ここから先はAPIが要る ──────────────────────────────
  await page.locator('textarea').first().fill('夜の海みたいに静かな青。角は丸めで、やわらかい書体。');
  await page.getByRole('button', { name: '作る', exact: true }).click();
  await page.waitForTimeout(25000);

  if (apiStatus !== 200) {
    skip(`生成は飛ばした（API ${apiStatus || 'なし'}）。ローカルではAPIが動かないので、プレビューのURLを渡して確認すること`);
  } else {
    const made = await readRoot(page);
    log(await page.getByRole('button', { name: '保存する' }).isVisible(), '作ったあとに保存が出る');
    log(await page.getByRole('button', { name: '明るく' }).isVisible(), '作ったあとに微調整が出る');
    await page.screenshot({ path: `${OUT}/theme-made.png` });

    await page.getByRole('button', { name: '角ばらせる' }).click();
    await page.waitForTimeout(400);
    const squared = await readRoot(page);
    log(squared.radius !== made.radius, `微調整で角丸が動く（${made.radius} → ${squared.radius}）`);

    await page.getByRole('button', { name: '元に戻す' }).click();
    await page.waitForTimeout(400);
    log((await readRoot(page)).radius === made.radius, '「元に戻す」で1つ前の版に戻る');

    // 他の画面で見てみる → 帯から戻る（下書きは画面でなくコンテキストが持つ）
    await page.getByRole('button', { name: '他の画面で見てみる' }).click();
    await page.waitForTimeout(1800);
    log((await readRoot(page)).themed, '他の画面へ移ってもテーマが当たったまま');
    log(await page.getByText('を試しています').isVisible(), '作成中の帯が出ている');
    await page.screenshot({ path: `${OUT}/theme-other-tab.png` });
    await page.getByRole('button', { name: /編集に戻る/ }).click();
    await page.waitForTimeout(1200);
    log(await page.getByRole('button', { name: '保存する' }).isVisible(), '帯から戻ると続きから直せる');
  }

  log(errors.length === 0, `JSの例外が出ていない（${errors.length}件）`);
  await browser.close();

  console.log(failed === 0 ? '\n✔ すべて通過' : `\n✘ ${failed}件 失敗`);
  process.exit(failed === 0 ? 0 : 1);
};

run();

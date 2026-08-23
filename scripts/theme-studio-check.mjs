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
    accent: cs.getPropertyValue('--accent-color').trim(),
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

  // 自分でアクセント色を選んでいる人を作る。**使う人が選んだ色はテーマより強い**
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('user_settings') || '{}');
    localStorage.setItem('user_settings', JSON.stringify({ ...s, accentColor: '#ff00ff' }));
  });

  await page.goto(`${BASE}/customize`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  log(await page.getByText('自分のテーマ').isVisible(), '「自分のテーマ」の欄がある');
  log(await page.getByText('無料で保存できるのは1つまで。').isVisible(), '保存数の案内が出ている');

  await page.getByRole('button', { name: '作る', exact: true }).click();
  await page.waitForTimeout(800);
  log(page.url().includes('/customize/theme'), '専用ページへ移る');
  log(await page.locator('textarea').first().isVisible(), '折り返す入力欄がある');
  log(await page.getByRole('button', { name: '参考画像' }).isVisible(), '参考画像の入口がある');
  log(await page.locator('input[type=range]').count() === 0, '作る前につまみを出していない');
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
    log(made.accent.toLowerCase() === '#ff00ff',
      `自分で選んだアクセント色をテーマが奪わない（${made.accent}）`);
    log(await page.locator('input[type=range]').count() === 2, '作ったあとにつまみが2本出る');
    log(await page.getByLabel('テーマの名前').isVisible(), '名前を書き換えられる');
    await page.screenshot({ path: `${OUT}/theme-made.png` });

    // 名前を自分で付ける
    await page.getByLabel('テーマの名前').fill('わたしのテーマ');
    await page.waitForTimeout(200);
    log(await page.getByLabel('テーマの名前').inputValue() === 'わたしのテーマ', '付けた名前が残る');

    // つまみ: 角の丸み（2本目）。動かして戻すと**元の値にきっちり戻る**こと
    const radiusBar = page.locator('input[type=range]').nth(1);
    const start = await radiusBar.inputValue();
    await radiusBar.fill('0');
    await page.waitForTimeout(300);
    const flat = await readRoot(page);
    log(flat.radius === '0px', `つまみで角丸が動く（${made.radius} → ${flat.radius}）`);
    await radiusBar.fill(start);
    await page.waitForTimeout(300);
    log((await readRoot(page)).radius === made.radius, `つまみを戻すと元の値に戻る（${made.radius}）`);

    // 明るさのつまみ（1本目）
    const brightBar = page.locator('input[type=range]').first();
    await brightBar.fill('-3');
    await page.waitForTimeout(300);
    const dimmed = await readRoot(page);
    log(dimmed.bg !== made.bg, `つまみで明るさが動く（${made.bg} → ${dimmed.bg}）`);
    await brightBar.fill('0');
    await page.waitForTimeout(300);
    log((await readRoot(page)).bg === made.bg, 'つまみを戻すと色も元に戻る（じりじりずれない）');

    await page.getByRole('button', { name: '元に戻す' }).click();
    await page.waitForTimeout(400);
    log(await page.getByRole('button', { name: '保存する' }).count() === 0, '「元に戻す」で作る前に戻る');
    // 続きの確認のためもう一度作る
    await page.locator('textarea').first().fill('夜の海みたいに静かな青。');
    await page.getByRole('button', { name: '作る', exact: true }).click();
    await page.waitForTimeout(25000);

    // 他の画面で見てみる → 帯から戻る（下書きは画面でなくコンテキストが持つ）
    await page.getByRole('button', { name: '実際の画面で見てみる' }).click();
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

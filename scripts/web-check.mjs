// web版（/web）の幅ごとの通し確認。
//
// 見るのは3つ:
//   1. ページ全体がスクロールしないこと（列ごとに独立してスクロールする作りが効いているか）
//   2. どの幅でも「押したのに無反応」が無いこと（カードを押したら必ず詳細が見える）
//   3. どの幅でもナビと絞り込みに手が届くこと
//
// 使い方: npm run dev を別で起こしてから  node scripts/web-check.mjs
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.argv[2] ?? 'http://localhost:5173';
const OUT = 'scripts/.smoke';
const SKIN = process.argv[3] ?? 'panel';

// xl=1280 / lg=1024 / md=768 が境目
const SIZES = [
  { w: 1440, h: 900, name: '広い', side: true, filters: true, detailInline: true },
  { w: 1200, h: 860, name: 'xl未満', side: true, filters: true, detailInline: false },
  { w: 1000, h: 820, name: 'lg未満', side: true, filters: false, detailInline: false },
  { w: 800, h: 800, name: 'md以上ぎりぎり', side: true, filters: false, detailInline: false },
  { w: 700, h: 800, name: 'md未満', side: false, filters: false, detailInline: false },
  { w: 390, h: 780, name: 'スマホ', side: false, filters: false, detailInline: false },
];

let ng = 0;
const log = (ok, msg) => { if (!ok) ng++; console.log(`${ok ? '  ok  ' : '  NG  '} ${msg}`); };

async function run() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: SIZES[0].w, height: SIZES[0].h }, locale: 'ja-JP' });
  const errors = [];
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.evaluate((s) => localStorage.setItem('fan_skin', s), SKIN);

  for (const sz of SIZES) {
    console.log(`\n━━ ${sz.w}px（${sz.name}）━━`);
    await page.setViewportSize({ width: sz.w, height: sz.h });
    await page.goto(`${BASE}/web`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1400);

    // 1. ページ全体がスクロールしない
    const m = await page.evaluate(() => {
      const root = document.querySelector('.web-demo');
      const main = document.querySelector('.web-demo main');
      const side = document.querySelector('.wd-side');
      const filt = document.querySelector('.wd-filters');
      return {
        pageScrolls: document.documentElement.scrollHeight > document.documentElement.clientHeight + 2,
        rootH: Math.round(root.getBoundingClientRect().height),
        winH: window.innerHeight,
        mainScrolls: main ? main.scrollHeight > main.clientHeight + 2 : false,
        sideVisible: side ? side.getBoundingClientRect().width > 0 : false,
        filtVisible: filt ? filt.getBoundingClientRect().width > 0 : false,
        cards: document.querySelectorAll('.wd-card').length,
      };
    });
    log(!m.pageScrolls, `ページ全体がスクロールしない（ルート ${m.rootH}px / 画面 ${m.winH}px）`);
    log(m.mainScrolls, '一覧が自分の中でスクロールする');
    log(m.cards > 0, `カードが出ている（${m.cards}枚）`);
    log(m.sideVisible === sz.side, `サイドバーの常時表示 = ${sz.side}（実際: ${m.sideVisible}）`);
    log(m.filtVisible === sz.filters, `絞り込みの常時表示 = ${sz.filters}（実際: ${m.filtVisible}）`);

    // 2. 幅が足りないときの逃げが用意されているか
    if (!sz.side) {
      const hasMenu = await page.getByLabel('メニュー').isVisible().catch(() => false);
      log(hasMenu, 'サイドバーが隠れている幅では ≡ が出る');
      if (hasMenu) {
        await page.getByLabel('メニュー').click();
        await page.waitForTimeout(400);
        log(await page.getByRole('button', { name: '投稿する' }).isVisible(), '  ≡ からサイドバーが開く');
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);
      }
    }
    if (!sz.filters) {
      const hasF = await page.getByLabel('絞り込み').isVisible().catch(() => false);
      log(hasF, '絞り込みが隠れている幅では開く口がある');
      if (hasF) {
        await page.getByLabel('絞り込み').click();
        await page.waitForTimeout(400);
        // 同じ文字が「隠れている常時表示の側」にも居るので、見えているものだけを見る
        log(await page.locator('.wd-filters-panel :text-is("状態")').first().isVisible().catch(() => false)
          || await page.locator('[aria-modal="true"] :text-is("状態")').first().isVisible().catch(() => false),
          '  そこから絞り込みが開く');
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);
      }
    }

    // 3. カードを押したら必ず詳細が見える（押したのに無反応を作らない）
    if (m.cards > 0) {
      await page.locator('.wd-card button').first().click();
      await page.waitForTimeout(500);
      const d = await page.evaluate(() => {
        const els = [...document.querySelectorAll('.wd-detail')];
        const vis = els.find((e) => e.getBoundingClientRect().width > 0);
        if (!vis) return { visible: false };
        const r = vis.getBoundingClientRect();
        return {
          visible: true,
          inViewport: r.left < window.innerWidth && r.right > 0 && r.top < window.innerHeight,
          scrolls: vis.scrollHeight > vis.clientHeight + 2,
          width: Math.round(r.width),
        };
      });
      log(d.visible && d.inViewport, `カードを押すと詳細が見える（幅 ${d.width ?? 0}px）`);
      // 詳細は「3列目」と「かぶせる版」の両方が DOM に居るので、見えている方だけを数える
      log((await page.locator('[aria-label="閉じる"]:visible').count()) > 0, '  閉じるボタンがある');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
      log((await page.evaluate(() =>
        [...document.querySelectorAll('.wd-detail')].filter((e) => e.getBoundingClientRect().width > 0).length)) === 0,
        '  Esc で閉じる');
    }

    // 4. いいねが実際に効く
    const likeBtn = page.locator('.wd-card [aria-label="いいね"]').first();
    if (await likeBtn.isVisible().catch(() => false)) {
      const before = (await likeBtn.textContent()) ?? '';
      await likeBtn.click();
      await page.waitForTimeout(400);
      const after = (await likeBtn.textContent()) ?? '';
      log(before !== after, `いいねを押すと数が変わる（${before.trim()} → ${after.trim()}）`);
      await likeBtn.click(); // 戻す
      await page.waitForTimeout(250);
    }

    // 4.5 いいねタブにカレンダーが在る（アプリ版の 月/週/日/リスト を落としていないか）
    if (await likeBtn.isVisible().catch(() => false)) {
      await likeBtn.click(); // 1件いいねしてから
      await page.waitForTimeout(300);
      if (sz.side) await page.getByRole('button', { name: 'いいね' }).first().click();
      else {
        await page.getByLabel('メニュー').click(); await page.waitForTimeout(350);
        await page.getByRole('button', { name: 'いいね' }).first().click();
      }
      await page.waitForTimeout(600);
      const seg = await page.evaluate(() =>
        ['月', '週', '日', 'リスト'].every((l) =>
          [...document.querySelectorAll('.wd-seg')].some((b) => (b.textContent || '').trim() === l)));
      log(seg, 'いいねタブに 月/週/日/リスト がある');
      const cells = await page.locator('.wd-day').count();
      log(cells > 0, `  カレンダーのマス目が出ている（${cells}）`);
      // 探すに戻す
      if (sz.side) await page.getByRole('button', { name: '探す' }).first().click();
      else {
        await page.getByLabel('メニュー').click(); await page.waitForTimeout(350);
        await page.getByRole('button', { name: '探す' }).first().click();
      }
      await page.waitForTimeout(500);
      await likeBtn.click(); // 戻す
      await page.waitForTimeout(250);
    }

    // 4.6 投稿とお知らせがスマホの画面へ飛ばない
    await page.getByLabel(sz.side ? '' : 'メニュー').click().catch(() => {});
    if (!sz.side) await page.waitForTimeout(350);
    await page.getByRole('button', { name: '投稿する' }).first().click().catch(() => {});
    await page.waitForTimeout(500);
    log(page.url().endsWith('/web'), '投稿を押しても web の画面から出ない');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    // 5. 文字がはみ出していない（横スクロールが出ない）
    const overflowX = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    log(overflowX <= 0, `横にはみ出していない（${overflowX}px）`);

    // 6. 切れている文字が無いか（要素の中身が枠から溢れていないか）を粗く見る
    const clipped = await page.evaluate(() => {
      const out = [];
      document.querySelectorAll('.wd-card, .wd-detail, .wd-side, .wd-top').forEach((el) => {
        if (el.scrollWidth > el.clientWidth + 2) {
          out.push((el.className || '').toString().split(' ')[0] + ' +' + (el.scrollWidth - el.clientWidth));
        }
      });
      return out.slice(0, 6);
    });
    log(clipped.length === 0, `枠から溢れている箱が無い${clipped.length ? '（' + clipped.join(' / ') + '）' : ''}`);

    await page.screenshot({ path: `${OUT}/web-${sz.w}.png` });
  }

  const real = errors.filter((e) =>
    !/favicon|net::ERR|Failed to load resource|the server responded|Failed to fetch|ensureDefaultJoined|row-level security/i.test(e));
  console.log('');
  log(real.length === 0, `JSの例外が出ていない（${real.length}件）`);
  real.slice(0, 5).forEach((e) => console.log(`        ${e.slice(0, 180)}`));

  await browser.close();
  console.log(`\n${ng === 0 ? '✔ すべて通過' : `✘ ${ng}件 失敗`}`);
  console.log(`スクリーンショット: ${OUT}/web-*.png`);
  process.exit(ng === 0 ? 0 : 1);
}

run().catch((e) => { console.error(e); process.exit(1); });

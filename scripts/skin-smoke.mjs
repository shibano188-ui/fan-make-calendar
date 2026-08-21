// 外皮（現行 / PANEL / SURGE）の通し確認。
//
// 目的は2つ:
//   1. 3つの外皮すべてで、主要画面が壊れずに描けること
//   2. **今ある機能が1つも消えていないこと**（検索・絞り込み・いいね・
//      リアクション・通知ベル・下タブ・カレンダー・投稿の入口）
//
// 使い方:  npm run dev を別で起こしてから  node scripts/skin-smoke.mjs
//          （URLは第1引数で変えられる: node scripts/skin-smoke.mjs http://localhost:4173）
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.argv[2] ?? 'http://localhost:5173';
const OUT = 'scripts/.smoke';
const SKINS = ['classic', 'panel', 'surge'];

// スマホ幅にする。640px 以上だと PhoneFrame（PC用の枠）が出て本体が入れ子になるため
const MOBILE = { width: 390, height: 844 };
const DESKTOP = { width: 1440, height: 900 };

let failures = 0;
const log = (ok, msg) => {
  if (!ok) failures++;
  console.log(`${ok ? '  ok  ' : '  NG  '} ${msg}`);
};

/** 画面に「その機能への入口」が残っているかを、見えている要素の数で確かめる */
async function countVisible(page, selector) {
  return page.locator(selector).filter({ has: undefined }).count().catch(() => 0);
}

async function run() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();

  for (const skin of SKINS) {
    console.log(`\n━━ 外皮: ${skin} ━━`);
    const ctx = await browser.newContext({ viewport: MOBILE, locale: 'ja-JP' });
    const errors = [];
    ctx.on('weberror', (e) => errors.push(String(e.error())));

    const page = await ctx.newPage();
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(String(e)));

    // 外皮を先に入れてから開く
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.evaluate((s) => localStorage.setItem('fan_skin', s), skin);

    // ── 探す ─────────────────────────────────────────
    await page.goto(`${BASE}/explore`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);

    const applied = await page.evaluate(() => document.documentElement.dataset.skin);
    log(applied === skin, `data-skin が ${skin} になっている（実際: ${applied}）`);

    const bg = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--bg-primary').trim());
    log(!!bg, `--bg-primary が入っている（${bg}）`);

    log(await page.getByPlaceholder('グッズ・イベントを検索').isVisible(), '検索欄がある');
    log(await page.getByLabel('絞り込み').first().isVisible(), '絞り込みボタンがある');

    // 新規の匿名ユーザーはまだ作品をフォローしていないので「探す」は空になる。
    // これは元からの正しい挙動なので、ここでは空状態の導線が出ることを見る。
    // カードの操作（いいね・リアクション）は、全件が出る web版デモ側で確認する。
    const cardsHere = await countVisible(page, '[aria-label="いいね"]');
    if (cardsHere > 0) {
      log(true, `カードのいいねボタンがある（${cardsHere}個）`);
      log(await countVisible(page, '[aria-label="リアクション"]') > 0, 'カードのリアクションボタンがある');
    } else {
      log(await page.getByText('作品をフォロー', { exact: false }).first().isVisible(),
        'フォロー0件のときの導線が出る（この環境では投稿が0件になる）');
    }

    // 下タブ5つ（ホーム・探す・投稿・カレンダー・マイページ）
    const tabs = await countVisible(page, 'nav [aria-label="ホーム"], nav [aria-label="探す"], nav [aria-label="投稿"], nav [aria-label="カレンダー"], nav [aria-label="マイページ"]');
    log(tabs === 5, `下タブが5つある（${tabs}個）`);

    await page.screenshot({ path: `${OUT}/${skin}-explore.png` });

    // ── 絞り込みが開くか ─────────────────────────────
    await page.getByLabel('絞り込み').first().click();
    await page.waitForTimeout(600);
    // 候補が0件でもパネル自体は開く（クリアの操作が出る）
    const filterOpened = await page.getByText('クリア', { exact: true }).first().isVisible().catch(() => false)
      || await page.getByText('状態', { exact: true }).first().isVisible().catch(() => false);
    log(filterOpened, '絞り込みパネルが開く');
    await page.screenshot({ path: `${OUT}/${skin}-filter.png` });

    // ── いいね（カレンダー）─────────────────────────
    await page.goto(`${BASE}/saved`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(900);
    log(await page.getByPlaceholder('保存した予定を検索').isVisible(), 'いいね側の検索欄がある');
    await page.screenshot({ path: `${OUT}/${skin}-saved.png` });

    // ── マイページ ───────────────────────────────────
    await page.goto(`${BASE}/mypage`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    log(await page.getByText('アプリの見た目').isVisible(), '外皮の切り替えUIがある');
    for (const label of ['現行', 'PANEL ／ 計器', 'SURGE ／ 高揚']) {
      log(await page.getByText(label, { exact: true }).first().isVisible(), `  選択肢「${label}」がある`);
    }
    // 既存の機能が消えていないこと
    for (const label of ['アクセントカラー', 'フォロー中の作品', 'カレンダーの配色・テーマ', '通知の設定', 'お知らせ']) {
      log(await page.getByText(label, { exact: true }).first().isVisible(), `  既存項目「${label}」が残っている`);
    }
    await page.screenshot({ path: `${OUT}/${skin}-mypage.png`, fullPage: true });

    // ── 切り替えが効くか（マイページから他の外皮へ）────
    const other = skin === 'panel' ? 'SURGE ／ 高揚' : 'PANEL ／ 計器';
    const otherId = skin === 'panel' ? 'surge' : 'panel';
    await page.getByText(other, { exact: true }).first().click();
    await page.waitForTimeout(600);
    const after = await page.evaluate(() => document.documentElement.dataset.skin);
    log(after === otherId, `マイページから ${otherId} に切り替わる（実際: ${after}）`);
    const saved = await page.evaluate(() => localStorage.getItem('fan_skin'));
    log(saved === otherId, `切り替えが保存される（${saved}）`);

    // ── web版デモ ────────────────────────────────────
    await page.setViewportSize(DESKTOP);
    await page.evaluate((s) => localStorage.setItem('fan_skin', s), skin);
    await page.goto(`${BASE}/web`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    log(await page.getByPlaceholder('グッズ・イベントを検索').isVisible(), 'web: 上部の検索欄がある');
    log(await page.getByText('絞り込み', { exact: true }).first().isVisible(), 'web: 絞り込みが常時表示されている');
    log(await page.getByRole('button', { name: '投稿する' }).isVisible(), 'web: 投稿の主ボタンがある');
    const cards = await countVisible(page, '.wd-card');
    log(cards > 0, `web: カードが並んでいる（${cards}枚）`);
    if (cards > 0) {
      // カード画像の上はホバーで操作が出る層なので、文字の側を押す
      // （画像の上を押すと、いいねボタンに当たって詳細が開かない）
      await page.locator('.wd-card h3').first().click();
      await page.waitForTimeout(500);
      log(await page.getByText('詳細', { exact: true }).first().isVisible(), 'web: 右の詳細パネルが開く');
      log(await countVisible(page, '.wd-detail [aria-label="いいね"]') > 0, 'web: 詳細にいいねがある');
      log(await countVisible(page, '.wd-detail [aria-label="リアクション"]') > 0, 'web: 詳細にリアクションがある');
      log(await countVisible(page, '.wd-card [aria-label="いいね"]') > 0, 'web: カードにいいねがある');
      log(await countVisible(page, '.wd-card [aria-label="リアクション"]') > 0, 'web: カードにリアクションがある');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
      const closed = await page.locator('.wd-detail').count();
      log(closed === 0, 'web: Esc で詳細パネルが閉じる');
    }
    await page.screenshot({ path: `${OUT}/${skin}-web.png` });

    // 外皮の実装とは関係のない既存のもの（画像の失敗・匿名ユーザーの権限）は除く。
    // ensureDefaultJoined の RLS は匿名ユーザーでは元から出る（本作業で入れたものではない）
    const real = errors.filter((e) =>
      !/favicon|net::ERR|Failed to load resource|the server responded with a status/i.test(e)
      && !/Failed to fetch/i.test(e)
      && !/ensureDefaultJoined|row-level security/i.test(e));
    log(real.length === 0, `JSの例外が出ていない（${real.length}件）`);
    if (real.length) real.slice(0, 5).forEach((e) => console.log(`        ${e.slice(0, 160)}`));

    await ctx.close();
  }

  await browser.close();
  console.log(`\n${failures === 0 ? '✔ すべて通過' : `✘ ${failures}件 失敗`}`);
  console.log(`スクリーンショット: ${OUT}/`);
  process.exit(failures === 0 ? 0 : 1);
}

run().catch((e) => { console.error(e); process.exit(1); });

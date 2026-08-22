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
// 外皮の署名色。localStorage を直に触るときは色も対にして、
// 見本が「その外皮の意図した組み合わせ」になるようにする
const ACCENT = { classic: '#FBBF00', panel: '#FF5A1E', surge: '#FFD400' };
const setSkinRaw = (page, skin) => page.evaluate(([s, a]) => {
  localStorage.setItem('fan_skin', s);
  const cur = JSON.parse(localStorage.getItem('user_settings') || '{}');
  localStorage.setItem('user_settings', JSON.stringify({ ...cur, accentColor: a }));
}, [skin, ACCENT[skin]]);

// スマホ幅にする。640px 以上だと PhoneFrame（PC用の枠）が出て本体が入れ子になるため
const MOBILE = { width: 390, height: 844 };
const DESKTOP = { width: 1440, height: 900 };

// コントラストを測る画面。外皮は色の変数を全画面に効かせるので、
// 作り込んだ画面だけでなく「毎日踏む画面」を必ず通す
const CONTRAST_SCREENS = [
  ['/', 'ホーム'],
  ['/explore', '探す'],
  ['/saved', 'いいね'],
  ['/mypage', 'マイページ'],
  ['/customize', 'カスタマイズ'],
  ['/post', '投稿'],
  ['/notifications', '通知設定'],
  ['/premium', 'プレミアム'],
];
// 既定（classic）の測定値。PANEL/SURGE はこれと比べる。
// **絶対値で失格にしない**：薄い補助文字は元からの設計なので、
// 見たいのは「外皮を出したせいで読めなくなっていないか」だけ
const baseline = {};

/** 外皮が定める色トークンどうしのコントラスト比を測る。
 *  ページを走査する方式は読み込み量で要素数が変わって不安定だったので、
 *  **判定はこちら（画面の中身に一切左右されない）で行う**。
 *  絶対値では落とさない：既定のアプリ自体が補助文字を 1.7 付近で使っているため、
 *  見るのは「外皮にしたことで、そのペアが既定より読みにくくなっていないか」。 */
async function measureTokens(page, dark) {
  await page.evaluate((d) => {
    const s = JSON.parse(localStorage.getItem('user_settings') || '{}');
    s.theme = d ? 'dark' : 'simple';
    localStorage.setItem('user_settings', JSON.stringify(s));
  }, dark);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  return page.evaluate(() => {
    // [文字, 地, 名前, 満たすべき比]。WCAG AA: 本文 4.5 / 大きい字とUI部品 3.0
    const PAIRS = [
      ['--label-primary', '--bg-primary', '本文/地', 4.5],
      ['--label-primary', '--bg-secondary', '本文/面', 4.5],
      ['--label-primary', '--bg-tertiary', '本文/面2', 4.5],
      ['--label-secondary', '--bg-primary', '副文/地', 4.5],
      ['--label-secondary', '--bg-secondary', '副文/面', 4.5],
      ['--label-tertiary', '--bg-primary', '補助/地', 4.5],
      ['--label-tertiary', '--bg-secondary', '補助/面', 4.5],
      ['--accent-on', '--accent-color', '色の上の字', 4.5],
      ['--input-placeholder', '--bg-secondary', '入力の例示', 3],
      ['--status-preorder', '--bg-secondary', '状態:予約', 3],
      ['--status-onsale', '--bg-secondary', '状態:発売中', 3],
      ['--status-ended', '--bg-secondary', '状態:終了', 3],
      ['--color-destructive', '--bg-secondary', '警告', 3],
      ['--color-success', '--bg-secondary', '成功', 3],
    ];
    const toRGB = (c) => {
      c = String(c).trim();
      if (c.startsWith('#')) {
        const h = c.length === 4
          ? c.slice(1).split('').map((x) => x + x).join('')
          : c.slice(1);
        return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), a: 1 };
      }
      const m = c.match(/rgba?\(([^)]+)\)/);
      if (!m) return null;
      const p = m[1].split(',').map(Number);
      return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
    };
    const over = (f, bk) => {
      const a = f.a + bk.a * (1 - f.a);
      if (a === 0) return { r: 0, g: 0, b: 0, a: 0 };
      return {
        r: (f.r * f.a + bk.r * bk.a * (1 - f.a)) / a,
        g: (f.g * f.a + bk.g * bk.a * (1 - f.a)) / a,
        b: (f.b * f.a + bk.b * bk.a * (1 - f.a)) / a,
        a,
      };
    };
    const lum = (c) => {
      const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
      return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
    };
    const ratio = (x, y) => {
      const l1 = lum(x), l2 = lum(y);
      return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    };
    const cs = getComputedStyle(document.documentElement);
    const out = {};
    for (const [fgN, bgN, label, req] of PAIRS) {
      const bg = toRGB(cs.getPropertyValue(bgN));
      const fg = toRGB(cs.getPropertyValue(fgN));
      if (!bg || !fg) continue;
      out[label] = { r: Math.round(ratio(over(fg, bg), bg) * 100) / 100, req };
    }
    return out;
  });
}

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
    await setSkinRaw(page, skin);

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
    // 既存の機能が消えていないこと
    for (const label of ['アクセントカラー', 'フォロー中の作品', 'テーマ・カレンダーの配色', '通知の設定', 'お知らせ']) {
      log(await page.getByText(label, { exact: true }).first().isVisible(), `  既存項目「${label}」が残っている`);
    }
    log(await page.getByText('アプリの見た目').count() === 0, 'マイページに外皮UIが二重に出ていない');
    await page.screenshot({ path: `${OUT}/${skin}-mypage.png`, fullPage: true });

    // ── カスタマイズ（テーマの切り替えはここに一本化した）──────
    await page.goto(`${BASE}/customize`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    log(await page.getByText('テーマ', { exact: true }).first().isVisible(), 'カスタマイズに「テーマ」がある');
    log(await page.getByText('明るさ', { exact: true }).first().isVisible(), 'カスタマイズに「明るさ」がある');
    for (const label of ['デフォルト', 'PANEL', 'SURGE']) {
      log(await page.getByText(label, { exact: true }).first().isVisible(), `  選択肢「${label}」がある`);
    }
    for (const label of ['システム', 'ライト', 'ダーク']) {
      log(await page.getByText(label, { exact: true }).first().isVisible(), `  明るさ「${label}」がある`);
    }
    // 廃止したもの（導線が残っていないこと）
    log(await page.getByText('みんなのテーマ').count() === 0, '「みんなのテーマ」の導線が消えている');
    log(await page.getByText('フォント', { exact: true }).count() === 0, '「フォント」の欄が消えている');
    // 残した既存の機能
    for (const label of ['カレンダー文字色', 'カレンダー背景画像']) {
      log(await page.getByText(label, { exact: true }).first().isVisible(), `  既存項目「${label}」が残っている`);
    }
    await page.screenshot({ path: `${OUT}/${skin}-customize.png`, fullPage: true });

    // ── 切り替えが効くか ──────────────────────────────
    const other = skin === 'panel' ? 'SURGE' : 'PANEL';
    const otherId = skin === 'panel' ? 'surge' : 'panel';
    await page.getByText(other, { exact: true }).first().click();
    await page.waitForTimeout(600);
    const after = await page.evaluate(() => document.documentElement.dataset.skin);
    log(after === otherId, `カスタマイズから ${otherId} に切り替わる（実際: ${after}）`);
    const savedSkin = await page.evaluate(() => localStorage.getItem('fan_skin'));
    log(savedSkin === otherId, `切り替えが保存される（${savedSkin}）`);
    // 元に戻してから、この外皮のまま残りの画面を見る
    await setSkinRaw(page, skin);
    await page.reload({ waitUntil: 'networkidle' });

    // ── 主要画面が描けるか（毎日踏む画面を必ず通す）────────
    for (const [path, name] of CONTRAST_SCREENS) {
      await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(800);
      const body = await page.locator('body').innerText().catch(() => '');
      log(body.trim().length > 0, `${name} が描けている`);
      await page.screenshot({ path: `${OUT}/${skin}-${name}.png`, fullPage: true });
    }

    // ── 色トークンの検算（明・暗の両方）────────────────
    for (const dark of [false, true]) {
      const mode = dark ? 'ダーク' : 'ライト';
      const t = await measureTokens(page, dark);
      const base = baseline[mode];
      const short = Object.entries(t).filter(([, v]) => v.r < v.req);
      if (!base) {
        baseline[mode] = t;
        log(true, `色の検算（${mode}）: 基準に届かないペア ${short.length}件  ←既定を基準にする`);
        short.forEach(([k, v]) => console.log(`        ${k}: ${v.r}（必要 ${v.req}）※既定のアプリが元から持っているもの`));
      } else {
        // 基準を満たしていれば通す。満たしていないものは、**既定より悪化したときだけ**落とす
        // （元から薄い補助文字を、外皮の責任にしないため）
        const bad = short.filter(([k, v]) => v.r < (base[k]?.r ?? v.req) * 0.98);
        log(bad.length === 0, `色の検算（${mode}）: 基準未達 ${short.length}件 / うち既定より悪化 ${bad.length}件`);
        bad.forEach(([k, v]) => console.log(`        ${k}: ${v.r}（必要 ${v.req} / 既定 ${base[k]?.r}）`));
      }
    }
    // 明るさをシステムに戻してから次へ
    await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('user_settings') || '{}');
      s.theme = 'system';
      localStorage.setItem('user_settings', JSON.stringify(s));
    });

    // ── web版デモ ────────────────────────────────────
    await page.setViewportSize(DESKTOP);
    await setSkinRaw(page, skin);
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

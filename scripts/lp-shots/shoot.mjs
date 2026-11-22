// LP（public/lp.html）の画面の画像を撮る（2026-11-23）。
// 手元のアプリを開発用 DB（fanhive-dev）につないで開き、予定・フォロー・いいねの返事だけ架空の作品（ハチノコ・ウサノコ）に差し替える。
// 本番の Supabase と fanhive.jp へのアクセスは全部止める（何も設定しないと手元の vite は本番につながるため）。
//
// 1. 開発用につないで起動（キーは LP にも載っている公開の値）:
//    VITE_SUPABASE_URL=https://srlxgpodxdvfunyqejav.supabase.co VITE_SUPABASE_ANON_KEY=<開発用の anon key> VITE_API_BASE=http://localhost:5199/blocked npx vite --port 5199 --strictPort
// 2. 撮る（出来たら cwebp -q 85 -resize 660 0 で public/lp/ へ）:
//    node scripts/lp-shots/shoot.mjs / home.png --click='text=ホーム' --h=820        → hero-home.webp
//    node scripts/lp-shots/shoot.mjs /saved cal.png --h=775                         → calendar-oct.webp
//    node scripts/lp-shots/shoot.mjs /saved card.png --scroll=640 --row='アクリルスタンド 全8種' → deadline-card.webp
// 商品画像は goods.html（SVG）を描き出したもの。SNS 用の画像は og.html を 1200x630 で撮る（cal.png を同じ場所に置く）
import { webkit } from 'playwright';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
const [path, out, ...rest] = process.argv.slice(2);
const opt = Object.fromEntries(rest.map((a) => { const t = a.replace(/^--/, ''); const i = t.indexOf('='); return [t.slice(0, i), t.slice(i + 1)]; }));
const IMG = fileURLToPath(new URL('./img', import.meta.url));
const W1 = '11111111-1111-4111-8111-111111111111', W2 = '22222222-2222-4222-8222-222222222222';
const works = { [W1]: 'ハチノコ', [W2]: 'ウサノコ' };
// LP の文（10/9 締切・10/17 発売）に合わせて、アプリの今日を 2026-10-01 にする（10/9 締切が「あと8日」。SNS 用の画像の「今日から8日後」とも合う）
const FAKE_NOW = '2026-10-01T12:00:00+09:00';
const now = Date.parse(FAKE_NOW);
const ago = (h) => new Date(now - h * 3600_000).toISOString();
const img = (n) => `https://mock.fanhive.test/img/${n}.png`;
let seq = 0;
const ev = (w, o) => ({
  id: `aaaaaaaa-0000-4000-8000-${String(++seq).padStart(12, '0')}`, work_id: w, works: { name: works[w] },
  title: '', event_date: null, event_time: null, category: '["グッズ"]', link_url: null, memo: null, author_id: 'bbbbbbbb-0000-4000-8000-000000000001',
  like_count: 3, pool: 0, created_at: ago(30), prefecture: null, location_detail: null, location_map_link: null, end_date: null, end_time: null,
  image_url: null, source_url: null, date_label: null, is_order_made: false, reservation_start_date: null, reservation_end_date: null,
  preorder_start_date: null, preorder_end_date: null, preorder_start_time: null, preorder_end_time: null, type: 'goods', price: null,
  stock_note: null, retailer: 'ハチノコ公式ショップ', affiliate_url: null, has_affiliate: false, offers: null, related_event_id: null, updated_at: ago(1), ...o,
});
const offer = (price, label) => ({ url: 'https://mock.fanhive.test/shop/' + (++seq), price, inStock: true, official: true, retailer: '公式ショップ', stockLabel: '予約受付中', ...(label ? { label } : {}) });
const EVENTS = [
  ev(W1, { title: 'ハチノコ アクリルスタンド 全8種', event_date: '2026-10-17', end_date: '2026-10-17', is_order_made: true, preorder_start_date: '2026-09-29', preorder_end_date: '2026-10-09', preorder_end_time: '23:59', price: 1320, category: '["グッズ","アクスタ"]', image_url: JSON.stringify([img('hachi-acst')]), offers: [offer(1320)], created_at: ago(20) }),
  ev(W1, { title: 'ハチノコ 缶バッジ 全6種', event_date: '2026-10-03', end_date: '2026-10-03', price: 550, category: '["グッズ","缶バッジ"]', image_url: JSON.stringify([img('hachi-badge')]), offers: [offer(550)], created_at: ago(50) }),
  ev(W1, { title: 'ハチノコ ぬいぐるみS', event_date: '2026-10-24', end_date: '2026-10-24', price: 2970, category: '["グッズ","ぬい"]', image_url: JSON.stringify([img('hachi-nui')]), offers: [offer(2970)], created_at: ago(70) }),
  ev(W1, { title: 'ハチノコ ハニカムキーホルダー', event_date: '2026-11-14', end_date: '2026-11-14', is_order_made: true, preorder_start_date: '2026-09-29', preorder_end_date: '2026-10-23', price: 880, category: '["グッズ","キーホルダー"]', image_url: JSON.stringify([img('hachi-kh')]), offers: [offer(880)], created_at: ago(8) }),
  ev(W1, { title: 'ハチノコ POP UP SHOP', type: 'event', event_date: '2026-10-10', end_date: '2026-10-25', category: '["イベント"]', prefecture: '東京都', image_url: JSON.stringify([img('hachi-popup')]), retailer: null, created_at: ago(40) }),
  ev(W2, { title: 'ウサノコ 缶バッジ 第2弾', event_date: '2026-10-02', end_date: '2026-10-02', price: 550, category: '["グッズ","缶バッジ"]', image_url: JSON.stringify([img('usa-badge')]), offers: [offer(550)], retailer: 'ウサノコ公式ショップ', created_at: ago(90) }),
  ev(W2, { title: 'ウサノコ アクリルスタンド', event_date: '2026-11-20', end_date: '2026-11-20', is_order_made: true, preorder_start_date: '2026-10-01', preorder_end_date: '2026-10-14', price: 1650, category: '["グッズ","アクスタ"]', image_url: JSON.stringify([img('usa-acst')]), offers: [offer(1650)], retailer: 'ウサノコ公式ショップ', created_at: ago(14) }),
  ev(W2, { title: 'ウサノコ ポーチ', event_date: '2026-10-21', end_date: '2026-10-21', price: 2200, category: '["グッズ","ポーチ"]', image_url: JSON.stringify([img('usa-pouch')]), offers: [offer(2200)], retailer: 'ウサノコ公式ショップ', created_at: ago(26) }),
  ev(W2, { title: 'ウサノコ 原画展', type: 'event', event_date: '2026-10-05', end_date: '2026-10-18', category: '["イベント"]', prefecture: '大阪府', image_url: JSON.stringify([img('usa-ten')]), retailer: null, created_at: ago(60) }),
];
const json = (route, body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

const b = await webkit.launch();
const ctx = await b.newContext({ viewport: { width: 440, height: Number(opt.h ?? 893) }, deviceScaleFactor: 3 });
await ctx.route(/jsgidtwxhueqgtvshdku|fanhive\.jp/, (r) => { console.log('BLOCKED', r.request().url().slice(0, 100)); return r.abort(); });
await ctx.route(/mock\.fanhive\.test\/img\//, (r) => r.fulfill({ status: 200, contentType: 'image/png', body: readFileSync(`${IMG}/${r.request().url().split('/img/')[1].replace('.png', '')}.png`) }));
await ctx.route(/srlxgpodxdvfunyqejav\.supabase\.co\/rest\/v1\//, (route) => {
  const req = route.request();
  if (req.method() !== 'GET') return route.continue();
  const u = decodeURIComponent(req.url());
  const t = u.split('/rest/v1/')[1].split('?')[0];
  if (t === 'events') {
    if (u.includes('select=updated_at')) return json(route, [{ updated_at: ago(1) }]);
    if (/event_date=lt\./.test(u)) return json(route, []);
    return json(route, EVENTS);
  }
  if (t === 'likes') return json(route, EVENTS.map((e) => ({ event_id: e.id, events: e })));
  if (t === 'participations') return json(route, [W1, W2].map((w, i) => ({ work_id: w, last_visited_at: ago(i + 1), works: { id: w, name: works[w], participant_count: 120 } })));
  if (t === 'event_edits' || t === 'event_visits' || t === 'personal_events' || t === 'notifications') return json(route, []);
  return route.continue();
});
await ctx.addInitScript(() => { localStorage.setItem('fan_onboarding_done_v2', '1'); localStorage.setItem('fan_hints_seen', JSON.stringify(['cal-overview','cal-swipe','cal-visit','cal-fold','cal-undated','cal-icons','cal-custom','home-icon','ex-swipe','ex-stamp','ex-follow','item-share','my-fanstar','my-sync'])); });
await ctx.clock.setFixedTime(new Date(FAKE_NOW));
const page = await ctx.newPage();
await page.goto('http://localhost:5199' + path);
await page.waitForTimeout(Number(opt.wait ?? 6000));
if (opt.click) { await page.click(opt.click); await page.waitForTimeout(2500); }
if (opt.scroll) { await page.mouse.wheel(0, Number(opt.scroll)); await page.waitForTimeout(1500); }
if (opt.row) {
  // その文字を含む行（画面の幅いっぱいの要素）だけを切り出す
  const box = await page.evaluate((t) => {
    const el = [...document.querySelectorAll('body *')].find((e) => e.childElementCount === 0 && e.textContent?.includes(t) && e.getBoundingClientRect().top > 150);
    let n = el;
    while (n && n.parentElement && n.getBoundingClientRect().width < 400) n = n.parentElement;
    const r = n.getBoundingClientRect();
    return { y: r.top, h: r.height };
  }, opt.row);
  console.log('row', JSON.stringify(box));
  await page.screenshot({ path: out, clip: { x: 0, y: box.y - 6, width: 440, height: box.h + 12 } });
} else await page.screenshot({ path: out });
await b.close();

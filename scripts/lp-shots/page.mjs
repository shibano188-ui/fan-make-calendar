// LP（public/lp.html）そのものを、画面1枚ずつのスクリーンショットにする（2026-11-28）。
// shoot.mjs は「LP に載せるアプリの画面」を撮るもの。こちらは LP のページ自体を撮る（デザインの変更前後の見比べ用）。
//
// 使い方:
//   node scripts/lp-shots/page.mjs --out=<保存先フォルダ> [--width=390,1280] [--reduce] [--wait=5000] [--file=<lp.html>]
//   --file   … 撮る lp.html（省略時は public/lp.html）。変更前を撮るときは git show main:public/lp.html > 一時ファイル して渡す
//   --reduce … 「動きを減らす」設定（prefers-reduced-motion: reduce）で開く
//   --wait   … 開いてから撮り始めるまでの待ち時間（ミリ秒）。最初の画面の動きが終わるのを待つ
//
// public/ を手元の簡易サーバーで配信して開く（/lp/... の画像は絶対パスなので、ファイルを直接開くと出ない）。
// ブラウザは PC に入っている Chrome を使う（Playwright 用のブラウザを落とさなくてよい）。無ければ Playwright の chromium。
// 計測は送られない（LP の sendEvent は自動操作のブラウザ＝navigator.webdriver では送らない）。念のため Supabase へのアクセスも止める。
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const opt = Object.fromEntries(process.argv.slice(2).map((a) => {
  const t = a.replace(/^--/, '');
  const i = t.indexOf('=');
  return i < 0 ? [t, 'true'] : [t.slice(0, i), t.slice(i + 1)];
}));
if (!opt.out) throw new Error('--out=<保存先フォルダ> を付けてください');

const ROOT = fileURLToPath(new URL('../../public', import.meta.url));
const LP = path.resolve(opt.file ?? path.join(ROOT, 'lp.html'));
const widths = (opt.width ?? '390,1280').split(',').map(Number);
const reduce = opt.reduce === 'true';
const wait = Number(opt.wait ?? 5000);
const TYPES = { '.html': 'text/html; charset=utf-8', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.ico': 'image/x-icon' };

const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  const p = u === '/lp.html' ? LP : path.join(ROOT, path.normalize(u));
  if (p !== LP && !p.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  fs.readFile(p, (e, d) => {
    if (e) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] ?? 'application/octet-stream' });
    res.end(d);
  });
});
await new Promise((r) => server.listen(0, r));
const base = `http://localhost:${server.address().port}`;

let browser;
try { browser = await chromium.launch({ channel: 'chrome' }); } catch { browser = await chromium.launch(); }
fs.mkdirSync(opt.out, { recursive: true });
for (const w of widths) {
  const mobile = w < 600;
  const h = mobile ? 844 : 800;
  const ctx = await browser.newContext({
    viewport: { width: w, height: h }, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile,
    reducedMotion: reduce ? 'reduce' : 'no-preference',
  });
  await ctx.route(/supabase\.co/, (r) => r.abort());
  const page = await ctx.newPage();
  await page.goto(`${base}/lp.html`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(wait);
  const total = await page.evaluate(() => document.documentElement.scrollHeight);
  let i = 0;
  for (let y = 0; y < total; y += h) {
    await page.evaluate((v) => window.scrollTo(0, v), y);
    await page.waitForTimeout(700);
    i++;
    await page.screenshot({ path: path.join(opt.out, `${w}-${String(i).padStart(2, '0')}.png`) });
  }
  console.log(`${w}px: 高さ ${total}px・${i}枚`);
  await ctx.close();
}
await browser.close();
server.close();

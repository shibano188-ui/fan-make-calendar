// バナー広告の「取り直し」を、実機もAdMobも使わずに確かめる。
//
// 広告が取れなかったときの挙動はタイミングで決まるので、目で見て確かめるのが難しい。
// 時計とプラグインを偽物に差し替えて、src/lib/admob.ts の中身をそのまま動かす。
//
// 使い方: npm run check:admob
//
// ⚠️ バンドル（--bundle）してはいけない。偽プラグインが複製されて別物になり、
//    テスト側から発火させたイベントが中に届かない。import 先だけ差し替える。
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const dir = mkdtempSync(join(tmpdir(), 'admob-check-'));
mkdirSync(join(dir, 'stub'));

writeFileSync(join(dir, 'stub/core.js'),
  `export const Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android' };\n`);
writeFileSync(join(dir, 'stub/att.js'), `export const waitForTrackingDecision = async () => {};\n`);
writeFileSync(join(dir, 'stub/admob.js'), `
export const calls = [];
const listeners = {};
export const AdMob = {
  initialize: async () => {},
  showBanner: async (o) => { calls.push('show:' + o.margin); },
  hideBanner: async () => { calls.push('hide'); },
  addListener: async (name, cb) => { (listeners[name] ??= []).push(cb); return { remove() {} }; },
};
export function fire(name, arg) { (listeners[name] ?? []).forEach((cb) => cb(arg)); }
export const BannerAdSize = { ADAPTIVE_BANNER: 'ADAPTIVE_BANNER' };
export const BannerAdPosition = { TOP_CENTER: 'TOP_CENTER' };
export const BannerAdPluginEvents = { SizeChanged: 'bannerAdSizeChanged', FailedToLoad: 'bannerAdFailedToLoad' };
export const MaxAdContentRating = { Teen: 'T' };
`);

execFileSync('npx', ['esbuild', 'src/lib/admob.ts', '--format=esm', `--outfile=${join(dir, 'admob.mjs')}`, '--log-level=error']);
const src = readFileSync(join(dir, 'admob.mjs'), 'utf8')
  .replaceAll('"@capacitor/core"', '"./stub/core.js"')
  .replaceAll('"@capacitor-community/admob"', '"./stub/admob.js"')
  .replaceAll('"./att"', '"./stub/att.js"');
writeFileSync(join(dir, 'admob.mjs'), src);

// ── 偽の時計と偽の画面 ──────────────────────────────────────────
let now = 0;
const timers = [];
globalThis.setTimeout = (fn, ms) => { const t = { at: now + (ms || 0), fn }; timers.push(t); return t; };
globalThis.clearTimeout = (t) => { const i = timers.indexOf(t); if (i >= 0) timers.splice(i, 1); };
const docListeners = [];
globalThis.document = {
  visibilityState: 'visible',
  addEventListener: (n, cb) => { if (n === 'visibilitychange') docListeners.push(cb); },
};
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
// 時計は「次に切れるタイマーの時刻」まで進めながら回す。
// 一気に now を進めてから発火させると、その中で仕込まれた 250ms のまとめ待ちが
// 常に未来行きになって同じ tick で実行されない
const tick = async (ms) => {
  const target = now + ms;
  for (;;) {
    const due = timers.filter((t) => t.at <= target).sort((a, b) => a.at - b.at)[0];
    if (!due) break;
    now = Math.max(now, due.at);
    globalThis.clearTimeout(due);
    due.fn();
    await flush();
  }
  now = target;
  await flush();
};
const setVisible = async (v) => { document.visibilityState = v; for (const cb of docListeners) cb(); await tick(300); };

const { showBanner, hideBanner } = await import(pathToFileURL(join(dir, 'admob.mjs')).href);
const { calls, fire } = await import(pathToFileURL(join(dir, 'stub/admob.js')).href);
const FAIL = 'bannerAdFailedToLoad';
const SIZE = 'bannerAdSizeChanged';

let pass = 0, fail = 0;
const take = () => { const c = [...calls]; calls.length = 0; return c; };
const check = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log(`OK   ${label}`); }
  else { fail++; console.log(`NG   ${label}\n       期待 ${JSON.stringify(want)}\n       実際 ${JSON.stringify(got)}`); }
};

showBanner(0);
await tick(300);
check('広告のある画面に入ると1回だけ要求する', take(), ['show:0']);

fire(FAIL, {});
await tick(59_000);
check('失敗しても59秒では叩かない', take(), []);
await tick(2_000);
check('60秒で取り直す', take(), ['show:0']);

fire(FAIL, {});
await tick(61_000);
check('2回目の待ちは60秒より長い（後退している）', take(), []);
await tick(60_000);
check('120秒で取り直す', take(), ['show:0']);

fire(SIZE, { width: 320, height: 50 });
await tick(600_000);
check('出せたあとは叩かない', take(), []);
fire(FAIL, {});
await tick(61_000);
check('出せたあとの失敗はまた60秒から', take(), ['show:0']);

fire(FAIL, {});
await setVisible('hidden');
await tick(600_000);
check('裏に回っているあいだは叩かない', take(), []);
await setVisible('visible');
check('前面に戻ったら待たずに取り直す', take(), ['show:0']);

fire(FAIL, {});
hideBanner();
await flush();
take();
await tick(600_000);
check('広告のない画面へ移ったら二度と叩かない', take(), []);

showBanner(0);
await tick(300);
check('戻ってくれば普通に1回要求する', take(), ['show:0']);

console.log(`\n${pass} 件OK / ${fail} 件NG`);
process.exit(fail ? 1 : 0);

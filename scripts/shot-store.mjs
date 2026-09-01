// App Store 用のスクリーンショットを本番から撮る。
//
//   node scripts/shot-store.mjs <出力先.png> <URL> [ステータスバーの元画像]
//
// 1320x2868（6.9インチの必須サイズ）＝ 440x956 の 3x。
// ステータスバー(上189px)はブラウザでは描けないので、既存のスクショから切り出して重ねる。
// そのぶんビューポートを 956-63=893 にして撮り、上に貼り合わせる。
//
// WebKit を使うのは iOS と同じ描画エンジンだから（Chromium とは幅の計算が違う）。
// 手順の由来 → Obsidian: Knowledge/ios-simulator-screenshot-automation.md
//              Desktop/FanHive-screenshots-build9/README.txt
//
// ImageMagick が要る（magick）。
import { webkit } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [out, url, statusSrc] = process.argv.slice(2);
if (!out || !url) {
  console.error('usage: node scripts/shot-store.mjs <out.png> <url> [statusbar-source.png]');
  process.exit(1);
}

const tmp = mkdtempSync(join(tmpdir(), 'shot-'));
const body = join(tmp, 'body.png');

const b = await webkit.launch();
const ctx = await b.newContext({
  viewport: { width: 440, height: 893 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
});
const p = await ctx.newPage();
await p.goto(url, { waitUntil: 'networkidle' });
await p.waitForTimeout(2500);
await p.screenshot({ path: body });
await b.close();

if (!statusSrc) {
  execFileSync('cp', [body, out]);
  console.log('saved (ステータスバーなし)', out);
  process.exit(0);
}

const mg = (...a) => execFileSync('magick', a, { encoding: 'utf8' });
const strip = join(tmp, 'strip.png');
const fixed = join(tmp, 'fixed.png');

// ページの背景色を左上から拾い、ステータスバーの背景をその色に塗り替える
// （時計・電波・電池・ダイナミックアイランドはそのまま残る）
const pageBg = mg(body, '-format', '%[pixel:p{10,10}]', 'info:').trim();
mg(statusSrc, '-crop', '1320x189+0+0', '+repage', strip);
const barBg = mg(strip, '-format', '%[pixel:p{10,180}]', 'info:').trim();
mg(strip, '-fuzz', '6%', '-fill', pageBg, '-opaque', barBg, fixed);
mg(fixed, body, '-append', out);

console.log(`saved ${out}（背景 ${barBg} → ${pageBg}）`);

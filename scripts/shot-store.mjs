// App Store 用のスクリーンショットを本番から撮る。
//
//   node scripts/shot-store.mjs <出力先.png> <URL> [ステータスバーの元画像] [オプション]
//
// オプション:
//   --headed          ブラウザを見える状態で開く。**ログインが要る画面を撮るときに使う**。
//                     この台本のブラウザには本人のログインが入っていないので、
//                     開いた窓の中で自分でログインしてもらい、絵が出たところで撮る。
//   --wait-for=<CSS>  その要素が出るまで待ってから撮る（既定は 2.5 秒待つだけ）。
//                     例: 月カレンダーに予定が並ぶまで待つ → '.grid-cols-7 button[title]'
//   --wait-file=<path> そのファイルが出来るまで待ってから撮る。**合図を人が出すとき**に使う。
//                     --wait-for が「絵が整ったら勝手に撮る」のに対し、こちらは
//                     画面を好きに整えてから `touch <path>` で撮らせる。
//   --timeout=<秒>    --wait-for / --wait-file の待ち時間。既定 300 秒
//   --state=<path>    ログインした状態をこのファイルに保存し、次からは読み込む。
//                     これが無いと撮り直しのたびに8桁コードでログインし直しになる。
//   --light           明るいテーマで撮る。**アカウントの設定は書き換えない**。
//                     サーバーから降りてくる user_settings の theme だけを
//                     手元で 'simple'（＝明るい）に読み替える。
//                     ストアの8枚は明るいテーマで揃えてあるので、
//                     暗いテーマを使っている人の端末から撮るときに要る。
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

const args = process.argv.slice(2);
const opts = args.filter((a) => a.startsWith('--'));
const [out, url, statusSrc] = args.filter((a) => !a.startsWith('--'));
const headed = opts.includes('--headed');
const waitFor = opts.find((a) => a.startsWith('--wait-for='))?.slice('--wait-for='.length);
const waitSec = Number(opts.find((a) => a.startsWith('--timeout='))?.slice('--timeout='.length) ?? 300);
const forceLight = opts.includes('--light');
const waitFile = opts.find((a) => a.startsWith('--wait-file='))?.slice('--wait-file='.length);
const statePath = opts.find((a) => a.startsWith('--state='))?.slice('--state='.length);
// 撮る直前に少しだけ動かす。一覧は貼りつく見出しの裏に前のカードが透けるので、
// カードの切れ目が見出しの裏に来るように寄せるのに使う（+で下へ、-で上へ）
const scrollBy = Number(opts.find((a) => a.startsWith('--scroll-by='))?.slice('--scroll-by='.length) ?? 0);
// 撮る前に押すもの（下タブやページ内のタブ）。
// 起動時は START_PATH（カレンダー）に飛ぶので、ホームを撮るにはタブを押す必要がある
const clickSel = opts.find((a) => a.startsWith('--click='))?.slice('--click='.length);
if (!out || !url) {
  console.error('usage: node scripts/shot-store.mjs <out.png> <url> [statusbar-source.png] [--headed] [--wait-for=<CSS>] [--timeout=<秒>]');
  process.exit(1);
}

const tmp = mkdtempSync(join(tmpdir(), 'shot-'));
const body = join(tmp, 'body.png');

const b = await webkit.launch({ headless: !headed });
// --headed のときは**低い窓で開く**。893px はノートPCの画面に収まらず、
// 下のタブが切れてログインしに行けない（実際にそれで撮れなかった）。
// 撮る直前に規定のサイズへ戻すので、出来上がりの絵は同じ。
const SHOT_H = 893;
const { existsSync } = await import('node:fs');
const hasState = !!(statePath && existsSync(statePath));
if (statePath) console.log(hasState ? `前回のログインを読み込みます（${statePath}）` : 'ログインの保存が無いので、窓の中でログインしてください');
const ctx = await b.newContext({
  viewport: { width: 440, height: headed ? 640 : SHOT_H },
  ...(hasState ? { storageState: statePath } : {}),
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  // 日付の入力欄は端末の言語で書式が変わる。日本語にしておかないと 09/20/2026 で写る
  locale: 'ja-JP',
  timezoneId: 'Asia/Tokyo',
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  // ⚠️ --light の横取りに要る。このアプリはPWAなので、Service Worker を通った
  //    通信は route() の対象外になり、細工が**黙って素通りする**
  serviceWorkers: 'block',
});

if (forceLight) {
  // サーバーの設定は触らない。降りてきた応答の theme だけ読み替える。
  // 明るいテーマの値は 'light' ではなく **'simple'**（ThemeMode の定義）
  await ctx.route(/\/rest\/v1\/user_settings\?.*theme/, async (route) => {
    const res = await route.fetch();
    let text = await res.text();
    try {
      text = JSON.stringify(JSON.parse(text).map((r) => ({ ...r, theme: 'simple' })));
    } catch { /* 解せない応答はそのまま通す */ }
    await route.fulfill({ response: res, body: text });
  });
}

const p = await ctx.newPage();
// ストア用の絵に、初回の案内と一度きりのヒントを写さない
await p.addInitScript((light) => {
  try {
    localStorage.setItem('fan_onboarding_done_v2', '1');
    localStorage.setItem('fan_tip_notify_banner', '1');
    // 探すは前に見ていた位置を覚えている。覚えたままだと中途半端な位置で撮れて、
    // 貼りつく見出しの裏にカードが透ける。消しておくと「今日」から始まる
    sessionStorage.removeItem('explore_scroll');
    // サーバーから設定が降りてくる前の最初の一瞬も明るくしておく
    if (light) {
      const raw = localStorage.getItem('user_settings');
      const cur = raw ? JSON.parse(raw) : {};
      localStorage.setItem('user_settings', JSON.stringify({ ...cur, theme: 'simple' }));
    }
  } catch { /* 保存できなくても撮影は続く */ }
}, forceLight);
await p.goto(url, { waitUntil: 'networkidle' });
if (waitFile || waitFor) {
  if (waitFile) {
    console.log(`合図のファイル（${waitFile}）を待っています（最長 ${waitSec} 秒）…`);
    console.log('窓の中で画面を整えてから、そのファイルを作ってください。');
    const until = Date.now() + waitSec * 1000;
    while (!existsSync(waitFile)) {
      if (Date.now() > until) throw new Error(`合図が来なかった（${waitSec}秒）`);
      await p.waitForTimeout(1000);
    }
    console.log('合図を受け取りました。撮ります。');
  } else {
    console.log(`「${waitFor}」が出るまで待っています（最長 ${waitSec} 秒）…`);
    if (headed) console.log('開いた窓の中でログインしてください。絵が出たら自動で撮ります。');
    await p.waitForSelector(waitFor, { timeout: waitSec * 1000 });
  }
  if (headed) {
    // ログインが済んだので、ここで規定の高さに戻して撮る
    await p.setViewportSize({ width: 440, height: SHOT_H });
    await p.waitForTimeout(800);
  }
  // 画像の読み込みが終わるまでもう少し待つ（撮った絵に灰色の枠が残らないように）
  await p.waitForTimeout(2500);
} else {
  await p.waitForTimeout(2500);
}
if (clickSel) {
  await p.click(clickSel);
  await p.waitForTimeout(2500);
}
if (scrollBy) {
  await p.evaluate((dy) => {
    const scroller = [...document.querySelectorAll('*')].find((el) => {
      const oy = getComputedStyle(el).overflowY;
      return (oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight + 40;
    });
    if (scroller && scroller.scrollTop > 0) scroller.scrollTop += dy;
    else window.scrollBy(0, dy);
  }, scrollBy);
  await p.waitForTimeout(800);
}
await p.screenshot({ path: body });
// 次の撮り直しでログインし直さずに済むよう、ログインした状態を残す
if (statePath) {
  await ctx.storageState({ path: statePath });
  console.log(`ログインを保存しました（${statePath}）`);
}
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
// App Store は透過を受け付けない（「アルファチャネルや透過を含めることはできません」）。
// ステータスバーの塗り替えで半透明の色が入ることがあるので、必ず不透明にしてから書き出す
mg(fixed, body, '-append', '-background', 'white', '-alpha', 'remove', '-alpha', 'off', out);

console.log(`saved ${out}（背景 ${barBg} → ${pageBg}）`);

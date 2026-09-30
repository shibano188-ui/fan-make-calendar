// SNS 用の「作品ごとの予定表」（1か月1枚・1080x1350 の PNG）を作る。
//
//   node scripts/sns-schedule/run.mjs                 手元の sns-out/ に8作品ぶん書き出す（変化の有無は見ない）
//   node scripts/sns-schedule/run.mjs --drive         中身が前回と変わった作品だけ作り直し、Google ドライブに同期する
//   node scripts/sns-schedule/run.mjs ちいかわ        作品を絞る（名前は works.name と同じ）
//
// 毎朝 GitHub Actions（.github/workflows/sns-schedule.yml）が --drive で動かす。
// 読むのは本番の Supabase を anon key で（公開前提の値・読み取りだけ）。
//
// 決めごと（柴野 2026-09-29・Obsidian Decisions/2026-09-29-fanhive-sns-post-plan）
// - 商品の画像は使わない（引用の範囲を超える）。自前の組版だけ
// - 在庫（在庫あり・売り切れ）は出さない（まだ正確さを担保できない）
// - 同じ日・同じ節目・同じシリーズの商品は「◯種」で1行にまとめる
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { chromium } from 'playwright';
import QRCode from 'qrcode';
import { WORKS } from './works.mjs';
import { connect } from './drive.mjs';

const args = process.argv.slice(2);
const TO_DRIVE = args.includes('--drive');
const only = args.filter((a) => !a.startsWith('--'));
const targets = only.length ? WORKS.filter((w) => only.includes(w.name)) : WORKS;

const GET_URL = 'https://fanhive.jp/get.html';
const ICON = 'data:image/png;base64,' + fs.readFileSync('public/icon-512.png').toString('base64');
const QR = await QRCode.toString(GET_URL, { type: 'svg', margin: 0, color: { dark: '#1d1d1f', light: '#00000000' } });

const SUPABASE = 'https://jsgidtwxhueqgtvshdku.supabase.co/rest/v1';
const ANON = fs.readFileSync('src/lib/supabase.ts', 'utf8').match(/eyJ[^']+/)[0];
const get = async (q) => {
  const r = await fetch(`${SUPABASE}/${q}`, { headers: { apikey: ANON, Authorization: `Bearer ${ANON}` } });
  if (!r.ok) throw new Error(`Supabase ${r.status} ${await r.text()}`);
  return r.json();
};

const TODAY = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
const WD = ['日', '月', '火', '水', '木', '金', '土'];
const md = (d) => `${+d.slice(5, 7)}/${+d.slice(8)}`;

// ── 1作品ぶんの行を作る ─────────────────────────────────────
async function buildLines(work) {
  const [w] = await get(`works?select=id,name&name=eq.${encodeURIComponent(work.name)}`);
  if (!w) throw new Error(`作品が見つからない: ${work.name}`);
  const events = await get(`events?select=id,title,type,event_date,date_label,end_date,preorder_start_date,preorder_end_date,is_order_made,price,offers&work_id=eq.${w.id}&pool=eq.0&or=(event_date.gte.${TODAY},preorder_end_date.gte.${TODAY},end_date.gte.${TODAY})&order=id&limit=1000`);
  const strip = (t) => t.replace(new RegExp(`^${work.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*`), '').replace(/\s+/g, ' ').trim();

  // 1つの予定から、これから来る節目（開始・締切・発売/開催）を1行ずつ
  const rows = [];
  for (const e of events) {
    const goods = e.type === 'goods';
    const push = (date, kind, label = null, extra = '') => rows.push({ date, label, kind, e, extra });
    if (e.preorder_start_date >= TODAY) push(e.preorder_start_date, !goods ? '申込開始' : e.is_order_made ? '受注開始' : '予約開始');
    if (e.preorder_end_date >= TODAY) push(e.preorder_end_date, !goods ? '申込締切' : e.is_order_made ? '受注締切' : '予約締切');
    if (e.event_date >= TODAY) push(e.event_date, goods ? '発売' : '開催', e.date_label, !goods && e.end_date && e.end_date !== e.event_date ? `〜${md(e.end_date)}` : '');
    else if (!goods && e.end_date >= TODAY) push(TODAY, '開催中', null, `〜${md(e.end_date)}`);
  }

  // シリーズ名: 【…】 → 「〜ver.」 → 「/」の後ろ → 先頭の言葉
  const seriesOf = (title) => {
    const t = strip(title);
    return t.match(/【([^】]+)】/)?.[1]
      ?? t.match(/(\S*(?:ver\.|Ver\.|VER\.))/)?.[1]
      ?? t.match(/\/([^()（\s]+(?:\s[^()（\s]+)?)/)?.[1]
      ?? (t.split(/[\s/／]/)[0].length >= 3 ? t.split(/[\s/／]/)[0] : null);
  };
  const tidy = (t) => t.replace(/\s+/g, ' ').trim();
  // 元の商品名の、頭からシリーズ名の終わりまで（【】で囲まれていれば閉じ括弧まで）
  const headOf = (title, series) => {
    const t = tidy(title);
    const i = t.indexOf(series);
    if (i < 0) return series;
    const end = i + series.length + (t[i + series.length] === '】' ? 1 : 0);
    return t.slice(0, end).replace(/[\s/／]+$/, '');
  };
  const typeOf = (title, series) => strip(title).replace(`【${series}】`, '').replace(series, '').replace(/^[\s/]+/, '').split(/[\s/]/)[0];
  // 同じ日・同じ節目で先頭の言葉が同じ商品が2つ以上あれば、それをシリーズ名にする（「ぱしゃこれ/烏野高校」「ぱしゃこれ/音駒高校」）
  const lead = (title) => { const x = strip(title).split(/[\s/／]/)[0]; return x.length >= 3 ? x : null; };
  const leadCount = new Map();
  for (const r of rows) {
    const x = r.e.type === 'goods' ? lead(r.e.title) : null;
    if (x) { const k = `${r.date}|${r.kind}|${x}`; leadCount.set(k, (leadCount.get(k) ?? 0) + 1); }
  }
  const groups = new Map();
  for (const r of rows) {
    const x = r.e.type === 'goods' ? lead(r.e.title) : null;
    const s = r.e.type !== 'goods' ? null
      : (x && leadCount.get(`${r.date}|${r.kind}|${x}`) >= 2 && !/【|ver\.|Ver\./.test(r.e.title)) ? x : seriesOf(r.e.title);
    const key = s ? `${r.date}|${r.label}|${r.kind}|${s}` : `${r.date}|${r.kind}|${r.e.id}`;
    const g = groups.get(key) ?? { ...r, series: s, items: [] };
    g.items.push(r.e);
    groups.set(key, g);
  }

  return [...groups.values()].map((g) => {
    const prices = g.items.map((x) => x.price).filter(Boolean);
    const lo = Math.min(...prices), hi = Math.max(...prices);
    const price = !prices.length ? '' : lo === hi ? `${lo.toLocaleString()}円` : `${lo.toLocaleString()}〜${hi.toLocaleString()}円`;
    const shops = g.e.type === 'goods' ? shopsText(g.items) : '';
    const base = { date: g.date, label: g.label, kind: g.kind, extra: g.extra, price, shops, count: g.items.length };
    // 商品名は登録されている名前を削らずに出す（作品名を削ると「ちいかわ あいうえお」が「あいうえお」になり、誤植に見える・柴野 2026-09-30）。
    // まとめた行は、商品名の頭からシリーズ名までをそのまま使う（「ちいかわ ぱしゃこれ 3種」）
    if (g.items.length === 1) return { ...base, name: tidy(g.items[0].title), sub: '' };
    const types = [...new Set(g.items.map((x) => typeOf(x.title, g.series)).filter(Boolean))];
    return { ...base, name: `${headOf(g.items[0].title, g.series)} ${g.items.length}種`, sub: types.slice(0, 4).join('・') + (types.length > 4 ? ' ほか' : '') };
  }).sort((a, b) => a.date.localeCompare(b.date) || (a.label ? 1 : 0) - (b.label ? 1 : 0) || a.name.localeCompare(b.name));
}

// 購入リンクのある店。大きい店から2つまで名前を出し、残りは「ほか◯店」。URLの形の名前は数だけ
const SHOP_ORDER = ['アニメイト', 'ムービック', 'KADOKAWAストア', 'コトブキヤ', 'プレミアムバンダイ', 'ジャンプショップ', '楽天', 'Yahoo!', 'Amazon'];
function shopsText(items) {
  const set = new Set();
  for (const e of items) for (const o of e.offers ?? []) if (o.retailer) set.add(o.retailer);
  if (!set.size) return '';
  const named = [...set].filter((r) => !r.includes('.')).sort((a, b) => ((SHOP_ORDER.indexOf(a) + 1) || 99) - ((SHOP_ORDER.indexOf(b) + 1) || 99));
  if (!named.length) return '購入リンクあり';
  const others = set.size - Math.min(named.length, 2);
  return '販売：' + named.slice(0, 2).join('・') + (others > 0 ? ` ほか${others}店` : '');
}

// ── 1枚の HTML ──────────────────────────────────────────────
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const KIND_COLOR = { '予約開始': '#1f7a4d', '受注開始': '#1f7a4d', '申込開始': '#1f7a4d', '予約締切': '#c0392b', '受注締切': '#c0392b', '申込締切': '#c0392b', '発売': '#1d1d1f', '開催': '#2456a6', '開催中': '#2456a6' };
const dayText = (l) => {
  const m = +l.date.slice(5, 7);
  if (l.label) return { big: `${m}月`, small: l.label };
  const d = new Date(l.date + 'T00:00:00');
  return { big: `${m}/${d.getDate()}`, small: `(${WD[d.getDay()]})` };
};

function pageHtml(work, month, items, idx, total) {
  const [y, m] = month.split('-').map(Number);
  let prevDay = '';
  const rowsHtml = items.map((l) => {
    const d = dayText(l);
    const showDay = d.big + d.small !== prevDay; prevDay = d.big + d.small;
    return `<div class="row${showDay ? ' first' : ''}">
      <div class="day">${showDay ? `<span class="big">${d.big}</span><span class="wd">${d.small}</span>` : ''}</div>
      <div class="kind" style="color:${KIND_COLOR[l.kind]}">${l.kind}${l.extra ? `<div class="extra">${esc(l.extra)}</div>` : ''}</div>
      <div class="body">
        <div class="name">${esc(l.name)}</div>
        ${l.sub ? `<div class="sub">${esc(l.sub)}</div>` : ''}
        ${l.shops ? `<div class="shops">${esc(l.shops)}</div>` : ''}
      </div>
      <div class="price">${esc(l.price)}</div>
    </div>`;
  }).join('');
  return `<!doctype html><html><head><meta charset="utf-8">
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;600;700;800;900&display=block">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    :root { --work: ${work.color}; }
    body { width: 1080px; height: 1350px; background: #fffdf7; color: #1d1d1f; border-top: 18px solid var(--work);
      font-family: "Noto Sans JP", sans-serif; padding: 44px 64px 40px; display: flex; flex-direction: column; }
    .head { border-bottom: 5px solid var(--work); padding-bottom: 18px; display: flex; align-items: flex-end; justify-content: space-between; }
    .work { font-size: 66px; font-weight: 900; line-height: 1.2; display: inline-block; padding: 4px 6px 4px 0; ${work.title} }
    .title { font-size: 44px; font-weight: 800; line-height: 1.1; margin-top: 8px; }
    .title small { font-size: 30px; font-weight: 700; margin-left: 10px; color: #6b6b70; }
    .meta { text-align: right; font-size: 26px; color: #6b6b70; line-height: 1.5; }
    .list { flex: 1; margin-top: 8px; overflow: hidden; }
    .row { display: grid; grid-template-columns: 196px 100px minmax(0, 1fr) auto; column-gap: 18px; align-items: baseline; padding: 13px 0; border-top: 1px solid #e6e2d6; }
    .row.first { border-top: 2px solid #cfc9b8; }
    .row:first-child { border-top: none; }
    .day { white-space: nowrap; }
    .day .big { font-size: 34px; font-weight: 800; color: var(--work); }
    .day .wd { font-size: 24px; color: #6b6b70; margin-left: 4px; }
    .kind { font-size: 23px; font-weight: 800; }
    .kind .extra { color: #6b6b70; font-weight: 600; font-size: 19px; }
    .name { font-size: 27px; font-weight: 700; line-height: 1.3; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .sub { font-size: 22px; color: #6b6b70; margin-top: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .shops { font-size: 20px; color: #6b6b70; margin-top: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .price { align-self: center; font-size: 26px; font-weight: 600; color: #3a3a3c; white-space: nowrap; }
    .foot { border-top: 2px solid #1d1d1f; padding-top: 12px; display: grid; grid-template-columns: 1fr auto; column-gap: 28px; align-items: center; }
    .brand { display: flex; align-items: center; gap: 12px; }
    .brand img { width: 52px; height: 52px; border-radius: 12px; }
    .brand .name { font-size: 28px; font-weight: 800; line-height: 1; }
    .brand .tag { font-size: 17px; color: #6b6b70; margin-top: 4px; }
    .points { margin-top: 8px; font-size: 18px; font-weight: 700; line-height: 1.55; }
    .points span { color: #b88a00; margin-right: 6px; }
    .dl { font-size: 17px; color: #3a3a3c; margin-top: 4px; }
    .dl b { font-weight: 800; }
    .qr { width: 130px; text-align: center; }
    .qr svg { width: 112px; height: 112px; }
    .qr div { font-size: 14px; color: #6b6b70; margin-top: 6px; white-space: nowrap; }
    .note { font-size: 14px; color: #8e8e93; margin-top: 6px; }
  </style></head><body>
    <div class="head">
      <div><div class="work">${esc(work.name)}</div>
        <div class="title">${m}月の予定<small>${y !== +TODAY.slice(0, 4) ? `${y}年` : ''}${total > 1 ? ` ${idx}/${total}` : ''}</small></div></div>
      <div class="meta">${md(TODAY)} 更新<br>${items.reduce((n, l) => n + l.count, 0)}件</div>
    </div>
    <div class="list">${rowsHtml}</div>
    <div class="foot">
      <div>
        <div class="brand"><img src="${ICON}"><div><div class="name">FanHive</div><div class="tag">推しのグッズとイベントをまとめるアプリ</div></div></div>
        <div class="points"><span>●</span>この予定がぜんぶ見られる　<span>●</span>各通販サイトの購入リンクも<br><span>●</span>商品の画像を見ながら気になるグッズを探せる　<span>●</span>ワンタップでカレンダーに<br><span>●</span>締切・発売の前に通知　<span>●</span>値下げ・再入荷もお知らせ</div>
        <div class="dl">App Store・Google Play で <b>「FanHive」</b> と検索</div>
      </div>
      <div class="qr">${QR}<div>ダウンロードはこちら</div></div>
    </div>
    <div class="note">発売日・価格は変わることがあります。購入前に公式の情報をご確認ください</div>
  </body></html>`;
}

// ── 描いて PNG にする ─────────────────────────────────────────
async function render(tab, work, lines) {
  const byMonth = new Map();
  for (const l of lines) { const m = l.date.slice(0, 7); byMonth.set(m, [...(byMonth.get(m) ?? []), l]); }
  const show = async (html) => { await tab.setContent(html, { waitUntil: 'networkidle' }); await tab.evaluate(() => document.fonts.ready); };
  // 1枚に実際に入る行数だけ入れる（行の高さは名前の長さで変わるので、描いて測る）
  const fit = () => tab.evaluate(() => {
    const list = document.querySelector('.list');
    const bottom = list.getBoundingClientRect().bottom;
    return [...list.querySelectorAll('.row')].filter((r) => r.getBoundingClientRect().bottom <= bottom + 1).length;
  });
  const files = {};
  for (const [month, items] of [...byMonth].sort()) {
    const pages = [];
    for (let rest = items; rest.length;) {
      await show(pageHtml(work, month, rest, 1, 1));
      const n = Math.max(1, await fit());
      pages.push(rest.slice(0, n)); rest = rest.slice(n);
    }
    for (let i = 0; i < pages.length; i++) {
      await show(pageHtml(work, month, pages[i], i + 1, pages.length));
      files[`${month}${pages.length > 1 ? `-${i + 1}` : ''}.png`] = await tab.screenshot();
    }
  }
  return files;
}

// ── 本体 ─────────────────────────────────────────────────────
if (TO_DRIVE && !process.env.GDRIVE_REFRESH_TOKEN) {
  console.log('GDRIVE_* が未設定なので何もしない（scripts/sns-schedule/drive-auth.mjs で入れる）');
  process.exit(0);
}
const drive = TO_DRIVE ? await connect({
  clientId: process.env.GDRIVE_CLIENT_ID, clientSecret: process.env.GDRIVE_CLIENT_SECRET, refreshToken: process.env.GDRIVE_REFRESH_TOKEN,
}) : null;
const manifest = drive ? await drive.readManifest() : {};

const browser = await chromium.launch();
const tab = await browser.newPage({ viewport: { width: 1080, height: 1350 } });
let changed = 0;
for (const work of targets) {
  const lines = await buildLines(work);
  // 中身の指紋（見出しの色・飾りも含める。変えたら作り直す）。更新日は含めない＝中身が同じなら作り直さない
  const hash = crypto.createHash('sha256').update(JSON.stringify({ lines, color: work.color, title: work.title, v: 3 })).digest('hex').slice(0, 16);
  if (drive && manifest[work.name]?.hash === hash) { console.log(`${work.name}: 変化なし`); continue; }
  const files = await render(tab, work, lines);
  if (drive) {
    await drive.syncWork(work.name, files);
    manifest[work.name] = { hash, updated: TODAY, pages: Object.keys(files) };
  } else {
    const dir = path.join('sns-out', work.name);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    for (const [name, buf] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), buf);
  }
  changed++;
  console.log(`${work.name}: ${Object.keys(files).length}枚を作り直した（${lines.length}行）`);
}
await browser.close();
if (drive && changed) await drive.writeManifest(manifest);
console.log(`作り直した作品: ${changed}/${targets.length}`);

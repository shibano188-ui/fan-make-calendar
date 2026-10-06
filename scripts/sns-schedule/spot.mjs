// SNS 用の「直前の個別ポスト」の画像（1予定1枚・1080x1350 の PNG）を作る。
//
//   node scripts/sns-schedule/spot.mjs                     きょう（日本時間）に節目がある予定を sns-out/直前/<日付>/ に書き出す
//   node scripts/sns-schedule/spot.mjs 2026-10-09          日付を指定
//   node scripts/sns-schedule/spot.mjs --days 3            きょうから3日ぶん
//   node scripts/sns-schedule/spot.mjs ちいかわ            作品を絞る（名前は works.name と同じ）
//   node scripts/sns-schedule/spot.mjs --image             商品の画像を入れる（ふだんは入れない）
//   node scripts/sns-schedule/spot.mjs --drive             Google ドライブの「FanHive 予定表/直前 <日付>」に同期する
//
// 日付のフォルダには、画像と一緒に「00_購入リンク.txt」を入れる（投稿に販売先のリンクを付けたいとき用・柴野 2026-10-04）。
// --drive のときは、日付が過ぎた「直前 <日付>」のフォルダを中身ごと消す（ドライブの容量を使い続けないように）
//
// 節目＝発売・予約開始・予約締切（受注は受注開始・受注締切、イベントは申込開始・申込締切・開催）。
// 同じ日に節目が2つある予定（予約締切と発売が同じ日など）は1枚にまとめ、見出しに両方を出す。
// 下の段に、その予定の節目をぜんぶ並べる（いつ予約できて、いつ届くかが1枚で分かるように）。
//
// 決めごと（Obsidian Decisions/2026-09-29-fanhive-sns-post-plan の「2. 直前の個別ポスト」）
// - 商品の画像は入れない（柴野 2026-10-06。公式の画像をそのまま載せるのは避ける）。--image で入れられる
// - 在庫（在庫あり・売り切れ）は出さない（まだ正確さを担保できない）
// - 商品名は登録されている名前を削らずに出す
// - 時期だけ決まっている発売（「10月下旬」など）は日付が無いので出さない
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import QRCode from 'qrcode';
import { WORKS } from './works.mjs';
import { connect } from './drive.mjs';

const args = process.argv.slice(2);
const TO_DRIVE = args.includes('--drive');
const WITH_IMAGE = args.includes('--image');
const daysArg = args.indexOf('--days');
const DAYS = daysArg >= 0 ? Math.max(1, +args[daysArg + 1] || 1) : 1;
const plain = args.filter((a, i) => !a.startsWith('--') && !(daysArg >= 0 && i === daysArg + 1));
const dateArg = plain.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a));
const only = plain.filter((a) => a !== dateArg);
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
const addDays = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 86400_000).toISOString().slice(0, 10);
const START = dateArg ?? TODAY;
const DATES = Array.from({ length: DAYS }, (_, i) => addDays(START, i));
const WD = ['日', '月', '火', '水', '木', '金', '土'];
const md = (d) => `${+d.slice(5, 7)}/${+d.slice(8)}`;
const mdw = (d) => `${md(d)}(${WD[new Date(d + 'T00:00:00Z').getUTCDay()]})`;

// ── 予定の節目 ───────────────────────────────────────────────
/** 予定の節目を日付順に。時期だけの発売（date_label あり）は日付が無いので入れない */
function milestones(e) {
  const goods = e.type === 'goods';
  const out = [];
  const hm = (t) => (t ? t.slice(0, 5) : null);
  if (e.preorder_start_date) out.push({ date: e.preorder_start_date, kind: !goods ? '申込開始' : e.is_order_made ? '受注開始' : '予約開始', time: hm(e.preorder_start_time) && `${hm(e.preorder_start_time)}〜` });
  if (e.preorder_end_date) out.push({ date: e.preorder_end_date, kind: !goods ? '申込締切' : e.is_order_made ? '受注締切' : '予約締切', time: hm(e.preorder_end_time) && `${hm(e.preorder_end_time)}まで` });
  if (e.event_date && !e.date_label) out.push({ date: e.event_date, kind: goods ? '発売' : '開催', until: !goods && e.end_date && e.end_date !== e.event_date ? e.end_date : null });
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

// 購入リンクのある店。大きい店から2つまで名前を出し、残りは「ほか◯店」（予定表と同じ）
const SHOP_ORDER = ['アニメイト', 'ムービック', 'KADOKAWAストア', 'コトブキヤ', 'プレミアムバンダイ', 'ジャンプショップ', '楽天', 'Yahoo!', 'Amazon'];
function shopsText(e) {
  const set = new Set((e.offers ?? []).map((o) => o.retailer).filter(Boolean));
  if (!set.size) return '';
  const named = [...set].filter((r) => !r.includes('.')).sort((a, b) => ((SHOP_ORDER.indexOf(a) + 1) || 99) - ((SHOP_ORDER.indexOf(b) + 1) || 99));
  if (!named.length) return '購入リンクあり';
  const others = set.size - Math.min(named.length, 2);
  return '販売：' + named.slice(0, 2).join('・') + (others > 0 ? ` ほか${others}店` : '');
}

function priceText(e) {
  const prices = (e.offers ?? []).map((o) => o.price).filter((p) => typeof p === 'number' && p > 0);
  if (e.price) prices.push(e.price);
  if (!prices.length) return '';
  const lo = Math.min(...prices);
  return `${lo.toLocaleString()}円${prices.some((p) => p !== lo) ? '〜' : ''}`;
}

const firstImage = (v) => {
  if (!v) return null;
  try { const a = JSON.parse(v); if (Array.isArray(a)) return a.find((s) => /^https?:/.test(s)) ?? null; } catch { /* 1枚だけの文字列 */ }
  return /^https?:/.test(v) ? v : null;
};

// ── 1枚の HTML ──────────────────────────────────────────────
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const KIND_COLOR = { '予約開始': '#1f7a4d', '受注開始': '#1f7a4d', '申込開始': '#1f7a4d', '予約締切': '#c0392b', '受注締切': '#c0392b', '申込締切': '#c0392b', '発売': '#1d1d1f', '開催': '#2456a6' };

function cardHtml(work, e, date) {
  const all = milestones(e);
  const today = all.filter((m) => m.date === date);
  const img = WITH_IMAGE ? firstImage(e.image_url) : null;
  const price = priceText(e);
  const shops = e.type === 'goods' ? shopsText(e) : '';
  const steps = all.map((m) => `<div class="step${m.date === date ? ' now' : m.date < date ? ' past' : ''}">
      <div class="k" style="color:${KIND_COLOR[m.kind]}">${m.kind}</div>
      <div class="d">${mdw(m.date)}${m.until ? `〜${md(m.until)}` : ''}${m.time ? `<small> ${m.time}</small>` : ''}</div>
    </div>`).join('<div class="arrow">›</div>');
  return `<!doctype html><html><head><meta charset="utf-8">
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;600;700;800;900&display=block">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    :root { --work: ${work.color}; }
    body { width: 1080px; height: 1350px; background: #fffdf7; color: #1d1d1f; border-top: 18px solid var(--work);
      font-family: "Noto Sans JP", sans-serif; padding: 40px 64px 36px; display: flex; flex-direction: column; }
    .work { font-size: 58px; font-weight: 900; line-height: 1.2; display: inline-block; padding: 2px 6px 2px 0; ${work.title} }
    .when { margin-top: 10px; display: flex; align-items: baseline; gap: 22px; border-bottom: 5px solid var(--work); padding-bottom: 18px; }
    .when .date { font-size: 92px; font-weight: 900; line-height: 1; color: var(--work); letter-spacing: -1px; }
    .when .date small { font-size: 46px; font-weight: 800; margin-left: 2px; }
    .when .kinds { font-size: 64px; font-weight: 900; line-height: 1; }
    .when .kinds small { font-size: 34px; font-weight: 800; margin-left: 8px; }
    .pic { margin-top: 26px; flex: 1; min-height: 0; border-radius: 24px; background: #fff; border: 2px solid #ece7da;
      display: flex; align-items: center; justify-content: center; overflow: hidden; }
    .pic img { max-width: 100%; max-height: 100%; object-fit: contain; }
    .name { margin-top: 24px; font-size: 40px; font-weight: 800; line-height: 1.35; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
    .noimg .name { margin-top: 40px; font-size: 52px; -webkit-line-clamp: 5; }
    .info { margin-top: 12px; display: flex; align-items: baseline; gap: 24px; }
    .info .price { font-size: 38px; font-weight: 800; color: #3a3a3c; }
    .info .shops { font-size: 26px; color: #6b6b70; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .steps { margin-top: 22px; display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
    .noimg .steps { margin-top: auto; }
    .step { border: 2px solid #e2dccd; border-radius: 16px; padding: 10px 18px; background: #fff; }
    .step .k { font-size: 22px; font-weight: 800; }
    .step .d { font-size: 28px; font-weight: 700; margin-top: 2px; }
    .step .d small { font-size: 20px; font-weight: 700; color: #6b6b70; }
    .step.now { border: 4px solid var(--work); padding: 8px 16px; }
    .step.past { opacity: 0.5; }
    .arrow { font-size: 40px; color: #b5ae9c; }
    .foot { margin-top: 26px; border-top: 2px solid #1d1d1f; padding-top: 14px; display: grid; grid-template-columns: 1fr auto; column-gap: 28px; align-items: center; }
    .brand { display: flex; align-items: center; gap: 12px; }
    .brand img { width: 52px; height: 52px; border-radius: 12px; }
    .brand .bn { font-size: 28px; font-weight: 800; line-height: 1; }
    .brand .tag { font-size: 17px; color: #6b6b70; margin-top: 4px; }
    .points { margin-top: 8px; font-size: 18px; font-weight: 700; line-height: 1.55; }
    .points span { color: #b88a00; margin-right: 6px; }
    .dl { font-size: 17px; color: #3a3a3c; margin-top: 4px; }
    .dl b { font-weight: 800; }
    .qr { width: 120px; text-align: center; }
    .qr svg { width: 100px; height: 100px; }
    .qr div { font-size: 13px; color: #6b6b70; margin-top: 4px; white-space: nowrap; }
    .note { font-size: 14px; color: #8e8e93; margin-top: 6px; }
  </style></head><body class="${img ? '' : 'noimg'}">
    <div class="work">${esc(work.name)}</div>
    <div class="when">
      <div class="date">${md(date)}<small>(${WD[new Date(date + 'T00:00:00Z').getUTCDay()]})</small></div>
      <div class="kinds">${today.map((m) => `<span style="color:${KIND_COLOR[m.kind]}">${m.kind}${m.time ? `<small>${m.time}</small>` : ''}${m.until ? `<small>〜${mdw(m.until)}</small>` : ''}</span>`).join('<span style="color:#b5ae9c">・</span>')}</div>
    </div>
    ${img ? `<div class="pic"><img src="${esc(img)}" referrerpolicy="no-referrer"></div>` : ''}
    <div class="name">${esc(e.title.replace(/\s+/g, ' ').trim())}</div>
    ${price || shops ? `<div class="info">${price ? `<div class="price">${esc(price)}</div>` : ''}${shops ? `<div class="shops">${esc(shops)}</div>` : ''}</div>` : ''}
    ${all.length > 1 ? `<div class="steps">${steps}</div>` : ''}
    <div class="foot">
      <div>
        <div class="brand"><img src="${ICON}"><div><div class="bn">FanHive</div><div class="tag">推しのグッズとイベントをまとめるアプリ</div></div></div>
        <div class="points"><span>●</span>締切・発売の前に通知　<span>●</span>各通販サイトの購入リンクも　<span>●</span>ワンタップでカレンダーに</div>
        <div class="dl">App Store・Google Play で <b>「FanHive」</b> と検索</div>
      </div>
      <div class="qr">${QR}<div>ダウンロードはこちら</div></div>
    </div>
    <div class="note">発売日・価格は変わることがあります。購入前に公式の情報をご確認ください${img ? '　画像：販売元のページより' : ''}</div>
  </body></html>`;
}

// ── 購入リンクのまとめ（00_購入リンク.txt）────────────────────────
// 検索結果のページは商品が決まらないので、商品ページがあるときは出さない
const isSearchPage = (u) => /list\.php|\/search|[?&](kw|keyword|q|smt|search_word)=/i.test(u);
function linksText(date, items) {
  const now = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 16).replace('T', ' ');
  const out = [
    `FanHive 直前ポスト ${mdw(date)} の購入リンク`,
    '・アフィリエイト（広告）のリンクを含みます。投稿に載せるときは「PR」「広告」などと書いてください',
    `・${now} 時点の情報です。売り切れ・受付終了になっていることがあります。載せる前に開いて確かめてください`,
    '',
  ];
  for (const { file, work, e } of items) {
    const kinds = milestones(e).filter((m) => m.date === date).map((m) => `${m.kind}${m.time ? ` ${m.time}` : ''}`).join('・');
    const price = priceText(e);
    const offers = (e.offers ?? []).filter((o) => o.url);
    const products = offers.filter((o) => !isSearchPage(o.url));
    const shown = products.length ? products : offers;
    out.push('━━━━━━━━━━━━━━━━━━━━');
    out.push(`[画像] ${file}`);
    out.push(`${work}｜${e.title.replace(/\s+/g, ' ').trim()}`);
    out.push(`${mdw(date)} ${kinds}${price ? ` ／ ${price}` : ''}`);
    out.push(`FanHive: https://fanhive.jp/item/${e.id}`);
    if (shown.length) {
      out.push('販売先:');
      for (const o of shown) out.push(`  ${o.retailer || 'お店'}${o.label ? `（${o.label}）` : ''} ${o.affiliateUrl || o.url}`);
    } else if (e.link_url) {
      out.push(`公式: ${e.link_url}`);
    } else {
      out.push('販売先: まだ登録されていません');
    }
    out.push('');
  }
  return Buffer.from(out.join('\n'), 'utf8');
}

// ── 本体 ─────────────────────────────────────────────────────
if (TO_DRIVE && !process.env.GDRIVE_REFRESH_TOKEN) {
  console.log('GDRIVE_* が未設定なので何もしない（scripts/sns-schedule/drive-auth.mjs で入れる）');
  process.exit(0);
}
const drive = TO_DRIVE ? await connect({
  clientId: process.env.GDRIVE_CLIENT_ID, clientSecret: process.env.GDRIVE_CLIENT_SECRET, refreshToken: process.env.GDRIVE_REFRESH_TOKEN,
}) : null;

const first = DATES[0], last = DATES[DATES.length - 1];
const inRange = (c) => `and(${c}.gte.${first},${c}.lte.${last})`;
const byDate = new Map(DATES.map((d) => [d, {}]));
for (const work of targets) {
  const [w] = await get(`works?select=id,name&name=eq.${encodeURIComponent(work.name)}`);
  if (!w) throw new Error(`作品が見つからない: ${work.name}`);
  const events = await get(`events?select=id,title,type,event_date,date_label,end_date,preorder_start_date,preorder_start_time,preorder_end_date,preorder_end_time,is_order_made,price,offers,image_url&work_id=eq.${w.id}&pool=eq.0&or=(${inRange('event_date')},${inRange('preorder_start_date')},${inRange('preorder_end_date')})&order=id&limit=1000`);
  for (const e of events) {
    for (const d of new Set(milestones(e).map((m) => m.date))) if (byDate.has(d)) (byDate.get(d)[work.name] ??= []).push(e);
  }
}

const browser = await chromium.launch();
const tab = await browser.newPage({ viewport: { width: 1080, height: 1350 } });
// 名前が長すぎるとファイル名に使えないので、先頭だけ。同じ名前は id の頭で分ける
const fileName = (work, e, date) => `${work}_${milestones(e).filter((m) => m.date === date).map((m) => m.kind).join('・')}_${e.title.replace(/[\\/:*?"<>|\s]+/g, ' ').trim().slice(0, 40)}_${e.id.slice(0, 6)}.png`;
let total = 0;
for (const [date, perWork] of byDate) {
  const files = {};
  const listed = [];
  for (const work of targets) {
    for (const e of (perWork[work.name] ?? []).sort((a, b) => a.title.localeCompare(b.title))) {
      await tab.setContent(cardHtml(work, e, date), { waitUntil: 'networkidle' });
      await tab.evaluate(() => document.fonts.ready);
      // 画像が読めなかった予定は、画像なしの組み方に切り替える（壊れた画像の枠を出さない）
      const broken = await tab.evaluate(() => { const i = document.querySelector('.pic img'); return !!i && !(i.complete && i.naturalWidth > 0); });
      if (broken) {
        await tab.setContent(cardHtml(work, { ...e, image_url: null }, date), { waitUntil: 'networkidle' });
        await tab.evaluate(() => document.fonts.ready);
      }
      const file = fileName(work.name, e, date);
      files[file] = await tab.screenshot();
      listed.push({ file, work: work.name, e });
    }
  }
  const n = Object.keys(files).length;
  total += n;
  if (n) files['00_購入リンク.txt'] = linksText(date, listed);
  if (drive) {
    if (n) await drive.syncWork(`直前 ${date}`, files);
  } else {
    const dir = path.join('sns-out', '直前', date);
    fs.rmSync(dir, { recursive: true, force: true });
    if (n) fs.mkdirSync(dir, { recursive: true });
    for (const [name, buf] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), buf);
  }
  console.log(`${date}: ${n}枚${n && !drive ? `（sns-out/直前/${date}/）` : ''}`);
}
await browser.close();
console.log(`合計 ${total}枚`);
// 日付が過ぎたフォルダを消す（きょうのフォルダは残す）
if (drive) {
  const gone = await drive.pruneDated('直前 ', TODAY);
  if (gone.length) console.log(`消したフォルダ: ${gone.join('・')}`);
}

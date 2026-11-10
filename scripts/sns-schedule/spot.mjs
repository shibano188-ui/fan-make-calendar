// SNS 用の「直前の個別ポスト」の画像（1予定1枚・幅1080 の PNG）を作る。
// 画像なしは 1080x810 の横長にして、引用されたときに縦に長くなりすぎないようにする（柴野 2026-10-06）。
// 商品名は見切れさせない。長くて入らないときだけ縦に伸ばす。
// 商品画像のある予定は、画像ありの版（1080x1350・前からの形）も「…_画像あり.png」として一緒に作る（柴野 2026-10-06。投稿するときに選べるように）
// リンク先（公式サイト）の今の画像（og:image）が登録の画像と違えば、「…_公式サイトの画像.png」も作る（柴野 2026-11-07）。
// イベントは開催に向けて公式の画像が新しくなるのに、登録の画像は最初の告知のままになるため。
// 公式サイトの画像はサイト共通の絵のこともあるので、DB は書き換えず、投稿する人が見て選ぶ
//
//   node scripts/sns-schedule/spot.mjs                     きょう（日本時間）に節目がある予定を sns-out/直前/<日付>/ に書き出す
//   node scripts/sns-schedule/spot.mjs 2026-10-09          日付を指定
//   node scripts/sns-schedule/spot.mjs --days 3            きょうから3日ぶん
//   node scripts/sns-schedule/spot.mjs ちいかわ            作品を絞る（名前は works.name と同じ）
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
// - 画像なしをふつうにする（柴野 2026-10-06。公式の画像をそのまま載せるのは避ける）。画像ありの版は選べるように並べて置くだけ
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
  v = v.replace(/&square=1(?=&|"|$)/g, ''); // アニメイトの正方形への引き伸ばしを外す（src/lib/image.ts の unstretchImage と同じ）
  try { const a = JSON.parse(v); if (Array.isArray(a)) return a.find((s) => /^https?:/.test(s)) ?? null; } catch { /* 1枚だけの文字列 */ }
  return /^https?:/.test(v) ? v : null;
};

// ── 1枚の HTML ──────────────────────────────────────────────
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const KIND_COLOR = { '予約開始': '#1f7a4d', '受注開始': '#1f7a4d', '申込開始': '#1f7a4d', '予約締切': '#c0392b', '受注締切': '#c0392b', '申込締切': '#c0392b', '発売': '#1d1d1f', '開催': '#2456a6' };

/** リンク先のページの og:image（無ければ null）。X などの SNS のリンクは見ない */
const firstLink = (v) => {
  if (!v) return null;
  try { const a = JSON.parse(v); if (Array.isArray(a)) return a.find((s) => /^https?:/.test(s)) ?? null; } catch { /* 1つだけの文字列 */ }
  return /^https?:/.test(v) ? v : null;
};
// ボットを断るサイト（haikyu.jp など）は読めないので、その予定は公式サイトの版を作らない（回避はしない）
async function officialImage(e) {
  const link = firstLink(e.link_url);
  if (!link) return null;
  try {
    // 形の崩れたリンク（https: だけ等）で new URL が投げても、ほかの予定の書き出しは続ける
    if (/(^|\.)(x|twitter|instagram|tiktok|youtube)\.com$|(^|\.)youtu\.be$/.test(new URL(link).hostname)) return null;
    const r = await fetch(link, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FanHiveSnsImage/1.0; +https://fanhive.jp)' }, signal: AbortSignal.timeout(10_000) });
    if (!r.ok) return null;
    const html = (await r.text()).slice(0, 400_000);
    const tag = html.match(/<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image)["'][^>]*>/i)?.[0];
    const src = tag?.match(/content=["']([^"']+)["']/i)?.[1];
    return src ? new URL(src.replace(/&amp;/g, '&'), r.url || link).href : null;
  } catch { return null; }
}

/** img: 載せる画像の URL（null なら画像なしの版）。credit: 画像の出どころの書き方 */
function cardHtml(work, e, date, img, credit = '販売元のページ') {
  const all = milestones(e);
  const today = all.filter((m) => m.date === date);
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
    body.noimg { height: auto; min-height: 810px; }
    .noimg .name { margin-top: 26px; font-size: 46px; display: block; overflow: visible; }
    .info { margin-top: 12px; display: flex; align-items: baseline; gap: 24px; }
    .info .price { font-size: 38px; font-weight: 800; color: #3a3a3c; }
    .info .shops { font-size: 26px; color: #6b6b70; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .steps { margin-top: 22px; display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
    .noimg .gap { flex: 1 0 26px; }
    .noimg .foot { margin-top: 0; }
    .step { border: 2px solid #e2dccd; border-radius: 16px; padding: 10px 18px; background: #fff; }
    .step .k { font-size: 22px; font-weight: 800; }
    .step .d { font-size: 28px; font-weight: 700; margin-top: 2px; }
    .step .d small { font-size: 20px; font-weight: 700; color: #6b6b70; }
    .step.now { border: 4px solid var(--work); padding: 8px 16px; }
    .step.past { opacity: 0.5; }
    .arrow { font-size: 40px; color: #b5ae9c; }
    ${FOOT_CSS}
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
    <div class="gap"></div>
    ${footHtml(img ? credit : null)}
  </body></html>`;
}

// 下のアプリ案内（1予定の画像とまとめの画像で同じもの）
const FOOT_CSS = `
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
    .note { font-size: 14px; color: #8e8e93; margin-top: 6px; }`;
/** credit: 画像の出どころ（画像なしの版は null） */
const footHtml = (credit) => `<div class="foot">
      <div>
        <div class="brand"><img src="${ICON}"><div><div class="bn">FanHive</div><div class="tag">推しのグッズとイベントをまとめるアプリ</div></div></div>
        <div class="points"><span>●</span>締切・発売の前に通知　<span>●</span>各通販サイトの購入リンクも　<span>●</span>ワンタップでカレンダーに</div>
        <div class="dl">App Store・Google Play で <b>「FanHive」</b> と検索</div>
      </div>
      <div class="qr">${QR}<div>ダウンロードはこちら</div></div>
    </div>
    <div class="note">発売日・価格は変わることがあります。購入前に公式の情報をご確認ください${credit ? `　画像：${credit}より` : ''}</div>`;

// ── まとめの画像（同じ日に同じ作品のグッズがたくさんあるとき・柴野 2026-11-10）────────
// 1つずつの画像に加えて、その日のぶんを1枚に並べた画像も作る（ちいかわは同じ日に十数点出ることがある）。
// 画像なし（名前と値段の一覧）と、商品画像のある予定がそろっていれば画像あり（並べた形）の2つ。
// キャラ違いの商品は1行（1マス）に「◯種」でまとめ、それでも長いときは2枚以上に分ける（柴野 2026-11-10）
const SUMMARY_MIN = 3;
const PAGE_ROWS = 15;  // 一覧の1枚の行数
const PAGE_TILES = 16; // 画像ありの1枚のマス数（4列×4段）
const KIND_ORDER = Object.keys(KIND_COLOR);
const todayKinds = (e, date) => milestones(e).filter((m) => m.date === date);
const tidy = (t) => t.replace(/\s+/g, ' ').trim();

/** 名前を「共通の部分」と「種類の名前」に分ける。最後の括弧（「(糸師 凛)」）か、最後の短い言葉（「… 凪誠士郎」） */
function variantSplit(title) {
  const t = tidy(title);
  const m = t.match(/^(.*\S)\s*[(（]([^()（）]+)[)）]$/);
  if (m) return [m[1], m[2]];
  const i = t.lastIndexOf(' ');
  if (i > 0 && t.length - i - 1 <= 10) return [t.slice(0, i), t.slice(i + 1)];
  return [t, ''];
}
/** 同じ節目で、種類の名前だけが違う商品を1つにまとめる。共通の部分が作品名＋「アニメ」程度しかないもの
 *  （「ちいかわ アニメ『ちいかわ』 定規」「… 下敷き」）は別の商品なのでまとめない */
function groupVariants(work, list, date) {
  const sig = (e) => todayKinds(e, date).map((m) => `${m.kind}${m.time ?? ''}`).join('・');
  const core = (k) => k.split(work.name).join('').replace(/[\s『』「」【】()（）・!！?？]/g, '');
  // 名前そのものが、ほかの商品の共通の部分になっているもの（「アクリルキーホルダー」と「アクリルキーホルダー (糸師 凛)」）も同じまとまり
  const split = new Map(list.map((e) => [e, variantSplit(e.title)]));
  const heads = new Set([...split.values()].filter(([, l]) => l).map(([h]) => h));
  const groups = new Map();
  for (const e of list) {
    const [head, label] = heads.has(tidy(e.title)) ? [tidy(e.title), ''] : split.get(e);
    const key = core(head).length >= 6 ? `${sig(e)}|${head}` : `${sig(e)}|${e.id}`;
    const g = groups.get(key) ?? { head, items: [], labels: [] };
    g.items.push(e);
    g.labels.push(label);
    groups.set(key, g);
  }
  return [...groups.values()].map((g) => {
    const items = g.items;
    if (items.length === 1) return { items, name: tidy(items[0].title), sub: '', price: priceText(items[0]) };
    // 名前の無いもの（「アクリルキーホルダー」だけ＝中に何種類かある）が混ざっていたら数は出さない
    const named = g.labels.filter(Boolean);
    const sub = named.slice(0, 5).join('・') + (named.length > 5 || named.length < items.length ? ' ほか' : '');
    const prices = items.flatMap((e) => (e.offers ?? []).map((o) => o.price).concat(e.price)).filter((p) => typeof p === 'number' && p > 0);
    const lo = prices.length ? Math.min(...prices) : null;
    return { items, name: named.length === items.length ? `${g.head} ${items.length}種` : g.head, sub, price: lo ? `${lo.toLocaleString()}円${prices.some((p) => p !== lo) ? '〜' : ''}` : '' };
  });
}
/** n 個を1枚 per 個までで、なるべく同じ数ずつに分ける */
function pages(arr, per) {
  const k = Math.ceil(arr.length / per);
  const size = Math.ceil(arr.length / k);
  return Array.from({ length: k }, (_, i) => arr.slice(i * size, (i + 1) * size));
}

/** groups: groupVariants の1枚ぶん。count: その日の全部の点数。page: 「1/2」（1枚なら空） */
function summaryHtml(work, groups, date, withImage, count, page) {
  const all = groups.flatMap((g) => g.items);
  const kinds = KIND_ORDER.filter((k) => all.some((e) => todayKinds(e, date).some((m) => m.kind === k)));
  // 節目と時刻がみんな同じなら見出しにだけ出す。混ざっていたら行ごとに出す
  const sig = (e) => todayKinds(e, date).map((m) => `${m.kind}${m.time ?? ''}`).join('・');
  const same = new Set(all.map(sig)).size === 1;
  const head = same
    ? todayKinds(all[0], date).map((m) => `<span style="color:${KIND_COLOR[m.kind]}">${m.kind}${m.time ? `<small>${m.time}</small>` : ''}</span>`).join('<span style="color:#b5ae9c">・</span>')
    : kinds.map((k) => `<span style="color:${KIND_COLOR[k]}">${k}</span>`).join('<span style="color:#b5ae9c">・</span>');
  const kindTag = (g) => same ? '' : `<div class="rk">${todayKinds(g.items[0], date).map((m) => `<span style="color:${KIND_COLOR[m.kind]}">${m.kind}${m.time ? ` ${m.time}` : ''}</span>`).join(' ')}</div>`;
  const sub = (g) => g.sub ? `<div class="sub">${esc(g.sub)}</div>` : '';
  const cols = groups.length <= 4 ? 2 : groups.length <= 9 ? 3 : 4;
  const body = withImage
    ? `<div class="grid" style="grid-template-columns:repeat(${cols},1fr)">${groups.map((g) => {
        const img = g.items.map((e) => firstImage(e.image_url)).find(Boolean);
        return `<div class="tile"><div class="ti">${img ? `<img src="${esc(img)}" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}</div>${kindTag(g)}<div class="tn">${esc(g.name)}</div>${sub(g)}${g.price ? `<div class="tp">${esc(g.price)}</div>` : ''}</div>`;
      }).join('')}</div>`
    : `<div class="rows">${groups.map((g) => `<div class="row">${kindTag(g)}<div class="rn">${esc(g.name)}${sub(g)}</div><div class="rp">${esc(g.price)}</div></div>`).join('')}</div>`;
  return `<!doctype html><html><head><meta charset="utf-8">
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;600;700;800;900&display=block">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    :root { --work: ${work.color}; }
    body { width: 1080px; min-height: 1080px; background: #fffdf7; color: #1d1d1f; border-top: 18px solid var(--work);
      font-family: "Noto Sans JP", sans-serif; padding: 40px 64px 36px; display: flex; flex-direction: column; }
    .work { font-size: 58px; font-weight: 900; line-height: 1.2; display: inline-block; padding: 2px 6px 2px 0; ${work.title} }
    .when { margin-top: 10px; display: flex; align-items: baseline; flex-wrap: wrap; gap: 8px 22px; border-bottom: 5px solid var(--work); padding-bottom: 18px; }
    .when .date { font-size: 92px; font-weight: 900; line-height: 1; color: var(--work); letter-spacing: -1px; }
    .when .date small { font-size: 46px; font-weight: 800; margin-left: 2px; }
    .when .kinds { font-size: 64px; font-weight: 900; line-height: 1; }
    .when .kinds small { font-size: 34px; font-weight: 800; margin-left: 8px; }
    .when .count { font-size: 40px; font-weight: 800; color: #3a3a3c; margin-left: auto; }
    .rows { margin-top: 10px; }
    .row { display: grid; grid-template-columns: 1fr auto; column-gap: 24px; align-items: baseline; padding: 16px 0; border-bottom: 2px solid #ece7da; }
    .row .rk { grid-column: 1 / -1; font-size: 22px; font-weight: 800; margin-bottom: 2px; }
    .row .rn { font-size: 32px; font-weight: 800; line-height: 1.35; }
    .row .rp { font-size: 30px; font-weight: 800; color: #3a3a3c; white-space: nowrap; }
    .sub { font-size: 22px; font-weight: 700; color: #6b6b70; line-height: 1.4; margin-top: 2px; }
    .tile .sub { font-size: ${cols === 4 ? 16 : cols === 3 ? 18 : 22}px; }
    .when .count small { font-size: 28px; margin-left: 10px; color: #8e8e93; }
    .grid { margin-top: 26px; display: grid; gap: 22px 18px; }
    .tile { min-width: 0; }
    .ti { aspect-ratio: 1; border-radius: 18px; background: #fff; border: 2px solid #ece7da; display: flex; align-items: center; justify-content: center; overflow: hidden; }
    .ti img { max-width: 100%; max-height: 100%; object-fit: contain; }
    .tile .rk { margin-top: 8px; font-size: 18px; font-weight: 800; }
    .tn { margin-top: 8px; font-size: ${cols === 4 ? 19 : cols === 3 ? 22 : 26}px; font-weight: 800; line-height: 1.35; }
    .tp { margin-top: 2px; font-size: ${cols === 4 ? 19 : cols === 3 ? 22 : 26}px; font-weight: 700; color: #3a3a3c; }
    .gap { flex: 1 0 26px; }
    ${FOOT_CSS}
  </style></head><body>
    <div class="work">${esc(work.name)}</div>
    <div class="when">
      <div class="date">${md(date)}<small>(${WD[new Date(date + 'T00:00:00Z').getUTCDay()]})</small></div>
      <div class="kinds">${head}</div>
      <div class="count">${count}点${page ? `<small>${page}</small>` : ''}</div>
    </div>
    ${body}
    <div class="gap"></div>
    ${footHtml(withImage ? '販売元のページ' : null)}
  </body></html>`;
}

// ── 購入リンクのまとめ（00_購入リンク.txt）────────────────────────
// 検索結果のページは商品が決まらないので、商品ページがあるときは出さない
const isSearchPage = (u) => /list\.php|\/search|[?&](kw|keyword|q|smt|search_word)=/i.test(u);
// 楽天・Yahoo! は保存されている URL そのものがアフィのリンクなので、中の商品ページの URL を取り出す
function plainUrl(url) {
  try {
    const u = new URL(url);
    if (u.hostname === 'hb.afl.rakuten.co.jp') return u.searchParams.get('pc') || url;
    if (u.hostname.endsWith('valuecommerce.com')) return u.searchParams.get('vc_url') || url;
  } catch { /* そのまま */ }
  return url;
}
function linksText(date, items, summaries = []) {
  const now = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 16).replace('T', ' ');
  const out = [
    `FanHive 直前ポスト ${mdw(date)} の購入リンク`,
    `・${now} 時点の情報です。売り切れ・受付終了になっていることがあります。載せる前に開いて確かめてください`,
    '',
  ];
  // X に載せるリンクはアフィリエイトを通さない元の URL にする（2026-10-24）。
  // A8 のリンク（px.a8.net）は X が投稿・リプで弾くため、アニメイトのリンクが載せられなくなっていた。
  // X から直接買ってもらうより、アプリに来てもらって買ってもらうのが目的なので、アフィは全部外す
  // まとめの画像は、下の1つずつのリンクをそのまま使う
  for (const { file, work, count } of summaries) {
    out.push('━━━━━━━━━━━━━━━━━━━━');
    out.push(`[まとめ画像] ${file}`);
    out.push(`${work}｜${mdw(date)} の ${count}点（購入リンクは下の各商品のところ）`);
    out.push('');
  }
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
      for (const o of shown) out.push(`  ${o.retailer || 'お店'}${o.label ? `（${o.label}）` : ''} ${plainUrl(o.url)}`);
    } else if (e.link_url) {
      out.push(`公式: ${plainUrl(e.link_url)}`);
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
  const events = await get(`events?select=id,title,type,event_date,date_label,end_date,preorder_start_date,preorder_start_time,preorder_end_date,preorder_end_time,is_order_made,price,offers,image_url,link_url&work_id=eq.${w.id}&pool=eq.0&or=(${inRange('event_date')},${inRange('preorder_start_date')},${inRange('preorder_end_date')})&order=id&limit=1000`);
  for (const e of events) {
    for (const d of new Set(milestones(e).map((m) => m.date))) if (byDate.has(d)) (byDate.get(d)[work.name] ??= []).push(e);
  }
}

const browser = await chromium.launch();
const tab = await browser.newPage({ viewport: { width: 1080, height: 810 } });
// 名前が長すぎるとファイル名に使えないので、先頭だけ。同じ名前は id の頭で分ける
const fileName = (work, e, date) => `${work}_${milestones(e).filter((m) => m.date === date).map((m) => m.kind).join('・')}_${e.title.replace(/[\\/:*?"<>|\s]+/g, ' ').trim().slice(0, 40)}_${e.id.slice(0, 6)}.png`;
let total = 0;
for (const [date, perWork] of byDate) {
  const files = {};
  const listed = [];
  const summaries = [];
  for (const work of targets) {
    const list = (perWork[work.name] ?? []).sort((a, b) => a.title.localeCompare(b.title));
    if (list.length >= SUMMARY_MIN) {
      // まとめの画像。並びは節目ごと（予約開始→締切→発売…）、その中は名前順
      const ordered = [...list].sort((a, b) => KIND_ORDER.indexOf(todayKinds(a, date)[0].kind) - KIND_ORDER.indexOf(todayKinds(b, date)[0].kind));
      const groups = groupVariants(work, ordered, date);
      const kinds = KIND_ORDER.filter((k) => list.some((e) => todayKinds(e, date).some((m) => m.kind === k)));
      const base = `${work.name}_まとめ_${kinds.join('・')}_${list.length}点`;
      const shot = [];
      const render = async (withImage, per, suffix) => {
        const ps = pages(groups, per);
        const out = [];
        for (const [i, g] of ps.entries()) {
          await tab.setContent(summaryHtml(work, g, date, withImage, list.length, ps.length > 1 ? `${i + 1}/${ps.length}` : ''), { waitUntil: 'networkidle' });
          await tab.evaluate(() => document.fonts.ready);
          // 画像ありは、半分以上のマスに画像が出せるときだけ（空の枠ばかりにならないように）
          if (withImage && (await tab.evaluate(() => [...document.querySelectorAll('.ti img')].filter((x) => x.complete && x.naturalWidth > 0).length)) * 2 < g.length) return;
          out.push([`${base}${ps.length > 1 ? `_${i + 1}枚目` : ''}${suffix}.png`, await tab.screenshot({ fullPage: true })]);
        }
        for (const [f, buf] of out) { files[f] = buf; shot.push(f); }
      };
      await render(false, PAGE_ROWS, '');
      if (groups.filter((g) => g.items.some((e) => firstImage(e.image_url))).length * 2 >= groups.length) await render(true, PAGE_TILES, '_画像あり');
      summaries.push({ file: shot.join('／'), work: work.name, count: list.length });
    }
    for (const e of list) {
      const file = fileName(work.name, e, date);
      await tab.setContent(cardHtml(work, e, date, null), { waitUntil: 'networkidle' });
      await tab.evaluate(() => document.fonts.ready);
      files[file] = await tab.screenshot({ fullPage: true });
      const shot = [file];
      // 画像ありの版。商品画像が無い・読めなかった予定は作らない（画像なしと同じになる・壊れた画像の枠を出さない）
      const withImage = async (img, credit, suffix) => {
        await tab.setContent(cardHtml(work, e, date, img, credit), { waitUntil: 'networkidle' });
        await tab.evaluate(() => document.fonts.ready);
        const ok = await tab.evaluate(() => { const i = document.querySelector('.pic img'); return !!i && i.complete && i.naturalWidth > 0; });
        if (ok) { const f = file.replace(/\.png$/, `_${suffix}.png`); files[f] = await tab.screenshot({ fullPage: true }); shot.push(f); }
      };
      const own = firstImage(e.image_url);
      if (own) await withImage(own, '販売元のページ', '画像あり');
      // 公式サイトの今の画像。登録の画像と同じなら作らない
      const site = await officialImage(e);
      if (site && site !== own) await withImage(site, '公式サイト', '公式サイトの画像');
      listed.push({ file: shot.join('／'), work: work.name, e });
    }
  }
  const n = listed.length;
  total += n;
  if (n) files['00_購入リンク.txt'] = linksText(date, listed, summaries);
  if (drive) {
    if (n) await drive.syncWork(`直前 ${date}`, files);
  } else {
    const dir = path.join('sns-out', '直前', date);
    fs.rmSync(dir, { recursive: true, force: true });
    if (n) fs.mkdirSync(dir, { recursive: true });
    for (const [name, buf] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), buf);
  }
  console.log(`${date}: ${n}件（${Object.keys(files).length}枚）${n && !drive ? `（sns-out/直前/${date}/）` : ''}`);
}
await browser.close();
console.log(`合計 ${total}件`);
// 日付が過ぎたフォルダを消す（きょうのフォルダは残す）
if (drive) {
  const gone = await drive.pruneDated('直前 ', TODAY);
  if (gone.length) console.log(`消したフォルダ: ${gone.join('・')}`);
}

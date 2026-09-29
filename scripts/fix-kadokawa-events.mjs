// KADOKAWAストアから登録した予定の掃除（一度きり・2026-09-29）。
// 取り込みの不具合（fade882 で修正）で、画像が「NEW」や分類のアイコンになり、販売終了の商品も在庫ありで入っていた。
//   - KADOKAWAストアしか付いていない予定で、商品ページが販売終了 → 予定ごと消す（いいねも消す。delete_event と同じ）
//   - それ以外 → 商品ページから画像を全部取り直して image_url を差し替える
// 実行: node scripts/fix-kadokawa-events.mjs        （下見だけ・書き込まない）
//       node scripts/fix-kadokawa-events.mjs --apply（更新する。前に backups/ へ元データを保存）
import fs from 'node:fs';
import path from 'node:path';

const APPLY = process.argv.includes('--apply');
const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split('\n')
    .map((l) => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^"|"$/g, '')]),
);
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const ref = JSON.parse(Buffer.from(KEY.split('.')[1], 'base64url')).ref;
const URL_BASE = `https://${ref}.supabase.co/rest/v1`;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
const KADOKAWA = 'https://store.kadokawa.co.jp';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36';
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
console.log(`接続先: ${ref}`);

const get = async (q) => {
  const r = await fetch(`${URL_BASE}/${q}`, { headers: H });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json();
};

// api/_listgroup.ts の imagesJson と同じ形（1枚なら文字列、複数なら JSON の配列）
const imagesJson = (urls) => {
  const u = [...new Set(urls.filter(Boolean))];
  return u.length === 0 ? null : u.length === 1 ? u[0] : JSON.stringify(u);
};

// api/_catalog.ts の kadokawaDetail と同じ読み方
async function detail(url) {
  await delay(1500); // 店に続けざまにアクセスしない
  const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'ja' }, signal: AbortSignal.timeout(30000) }).catch(() => null);
  if (!r?.ok) return null;
  const html = await r.text();
  const images = [...new Set([...html.matchAll(/block-goods-main-img-item[^>]*>\s*<img[^>]+src="([^"]+)"/g)]
    .map((m) => new URL(m[1], KADOKAWA).toString()))];
  const ended = /販売.{0,3}終了している商品です/.test(html);
  return { images, ended };
}

// KADOKAWAが付いている予定（店の欄に入っているもの＋画像がKADOKAWAのもの）
const byOffer = await get(`events?select=*&offers=cs.${encodeURIComponent('[{"retailer":"KADOKAWAストア"}]')}&limit=1000`);
const byImage = await get(`events?select=*&image_url=like.${encodeURIComponent('*store.kadokawa.co.jp/img/*')}&limit=1000`);
const events = [...new Map([...byOffer, ...byImage].map((e) => [e.id, e])).values()];
console.log(`KADOKAWAが付いている予定: ${events.length}件\n`);

const toDelete = [];
const toUpdate = [];
for (const e of events) {
  const offers = e.offers ?? [];
  const kd = offers.find((o) => String(o.url ?? '').includes('store.kadokawa.co.jp'));
  const onlyKadokawa = offers.every((o) => String(o.url ?? '').includes('store.kadokawa.co.jp'));
  const d = kd ? await detail(kd.url) : null;
  if (!d) { console.log(`?? 読めない  ${e.title}`); continue; }
  if (d.ended && onlyKadokawa) {
    toDelete.push(e);
    console.log(`消す        ${e.title}`);
  } else if (d.images.length) {
    const image_url = imagesJson(d.images);
    // 販売終了だが他の店も付いている → 予定は残し、KADOKAWAの店だけ在庫なしにする
    const nextOffers = d.ended
      ? offers.map((o) => (o === kd ? { ...o, inStock: false, stockLabel: '販売が終了している商品です' } : o))
      : offers;
    toUpdate.push({ e, image_url, offers: nextOffers });
    console.log(`画像${String(d.images.length).padStart(2)}枚    ${e.title}${d.ended ? '（KADOKAWAだけ販売終了に）' : ''}`);
  } else {
    console.log(`?? 画像なし  ${e.title}`);
  }
}
console.log(`\n消す ${toDelete.length}件 / 画像を差し替える ${toUpdate.length}件`);

if (!APPLY) { console.log('\n下見だけです。書き込むには --apply を付けてください'); process.exit(0); }

fs.mkdirSync('backups', { recursive: true });
const backup = path.join('backups', `kadokawa-events-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
fs.writeFileSync(backup, JSON.stringify(events, null, 2));
console.log(`\n元データを保存しました: ${backup}`);

for (const { e, image_url, offers } of toUpdate) {
  const r = await fetch(`${URL_BASE}/events?id=eq.${e.id}`, { method: 'PATCH', headers: H, body: JSON.stringify({ image_url, offers }) });
  console.log(r.ok ? `更新 ${e.title}` : `!! 更新失敗 ${e.title}: ${r.status} ${await r.text()}`);
}
for (const e of toDelete) {
  await fetch(`${URL_BASE}/likes?event_id=eq.${e.id}`, { method: 'DELETE', headers: H });
  const r = await fetch(`${URL_BASE}/events?id=eq.${e.id}`, { method: 'DELETE', headers: H });
  console.log(r.ok ? `削除 ${e.title}` : `!! 削除失敗 ${e.title}: ${r.status} ${await r.text()}`);
}
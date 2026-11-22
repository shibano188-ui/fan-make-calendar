// 試運転（マージ前に消す）: 依頼作品を Yahoo! で引いて、登録する候補を出すだけ。DB には触らない
import { releaseFromShopTitle, janTitle } from '../../api/_catalog.js';
import { searchYahooPage, isUsedTitle } from '../../api/_product-search.js';
import { listEvents } from '../../api/_listgroup.js';
for (const k of Object.keys(process.env)) if (process.env[k] === '[SENSITIVE]') delete process.env[k];
const today = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
const byJan = new Map();
for (let i = 0; i < 3; i++) {
  await new Promise((r) => setTimeout(r, 1100));
  const hits = await searchYahooPage('モブサイコ100 予約', 1 + i * 50);
  console.log('page', i, hits.length);
  for (const h of hits) {
    if (!h.official || !h.jan || h.stockLabel === '中古' || isUsedTitle(h.title)) continue;
    if (!h.title.normalize('NFKC').includes('モブサイコ')) continue;
    if (!byJan.has(h.jan)) byJan.set(h.jan, h);
  }
  if (hits.length < 50) break;
}
const products = [];
for (const [jan, h] of byJan) {
  const rel = releaseFromShopTitle(h.title, today);
  console.log(rel ? 'OK ' : 'NG ', jan, h.shop, h.price, h.title.slice(0, 70), JSON.stringify(rel));
  if (rel && rel.date >= today) products.push({ title: janTitle([h]), url: h.url, price: h.price, inStock: true, stockLabel: '予約受付中', jan, image: h.image, images: [h.image], release: rel });
}
const evs = await listEvents({ title: 'モブサイコ', shop: 'あみあみ Yahoo!店', retailer: 'Yahoo!', products, nextPage: null }, 'モブサイコ');
for (const e of evs) console.log('EVENT', e.title, e.date, e.dateLabel, e.price, e.offers.length, e.offers.map((o) => o.label ?? '').join('/'));

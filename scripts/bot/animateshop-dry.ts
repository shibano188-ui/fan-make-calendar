// 試運転（マージ前に消す）: animate.shop の新着を JANコードで楽天・Yahoo! に引いて、付くリンク・名前を出すだけ。DB には触らない
import { animateShopItems, janTitle, pickJanHit } from '../../api/_catalog.js';
import { searchByJan } from '../../api/_product-search.js';
for (const k of Object.keys(process.env)) if (process.env[k] === '[SENSITIVE]') delete process.env[k];
console.log('keys', { yahoo: !!process.env.YAHOO_APP_ID, rakuten: !!process.env.RAKUTEN_APP_ID });
const r = await fetch('https://www.animate.shop/products.json?limit=250&page=1', { headers: { 'User-Agent': 'Mozilla/5.0' } });
console.log('animate.shop', r.status);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ps = ((await r.json()) as { products: any[] }).products;
const items = animateShopItems(ps, new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10));
console.log('items', items.length, 'of', ps.length);
let hit = 0;
for (const it of items.slice(0, 25)) {
  await new Promise((res) => setTimeout(res, 1100));
  const hits = await searchByJan(it.j);
  if (hits.length) hit++;
  const best = hits.length ? pickJanHit(hits) : null;
  console.log(it.j, it.d, it.l, 'hits', hits.length, best ? `| ${janTitle(hits)} | ${best.retailer} ${best.shop} ${best.price} official=${best.official} | ${best.image} | ${best.url.slice(0, 90)}` : '');
}
console.log('hit', hit, '/', Math.min(25, items.length));

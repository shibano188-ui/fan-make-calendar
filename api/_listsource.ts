// 商品の一覧ページ（公式通販のコレクション・アニメイトの検索結果・ムービックの検索結果など）から、
// 商品の一覧を読む。parse-event がこれをシリーズごとの予定にまとめる。
// 店ごとにページの作りが違うので、ここで同じ形（ProductList）にそろえる。
// 接続するのは決まった店（アニメイト・ムービック）と、Shopify の店（_shopify.ts の safePublicUrl を通す）だけ。
import { fetchShopifyCollection } from './_shopify.js';
import { parseAnimateList, parseMovicList, lookupByUrl } from './_product-search.js';

export interface ListProduct {
  title: string; url: string; price: number; inStock?: boolean;
  image: string; images: string[];
  release?: { date: string; dateLabel: string | null };
}
export interface ProductList { title: string; shop: string; retailer: string; products: ListProduct[] }

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36';

async function getHtml(url: string): Promise<string | null> {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'ja' }, signal: AbortSignal.timeout(15000) });
    return r.ok ? await r.text() : null;
  } catch { return null; } // 時間切れ・接続できない ＝ 読めなかった
}

/** <title> から店名の部分（「| アニメイト」「｜ムービック（movic）」）を落とす */
function pageTitle(html: string): string {
  const t = html.match(/<title>([^<]*)<\/title>/)?.[1] ?? '';
  return t.split(/\s*[|｜]\s*/)[0].replace(/&amp;/g, '&').trim();
}

/** アニメイトの一覧（検索結果・作品ページ）。スマホ版の /sphone/ は PC 版にそろえ、1ページ100件で読む */
async function animateList(u: URL): Promise<ProductList | null> {
  if (/\/pd\/\d+/.test(u.pathname) || /products\/detail\.php$/.test(u.pathname)) return null; // 1商品のページ
  const pc = new URL(u.toString().replace('/sphone/', '/'));
  if (/products\/list\.php$/.test(pc.pathname)) pc.searchParams.set('sl', '100');
  const html = await getHtml(pc.toString());
  if (!html) return null;
  const items = parseAnimateList(html);
  if (!items.length) return null;
  return {
    title: pageTitle(html), shop: 'アニメイトオンラインショップ', retailer: 'アニメイト',
    products: items.map((c) => ({ title: c.title, url: c.url, price: c.price, inStock: c.inStock, image: c.image, images: c.image ? [c.image] : [], release: c.release })),
  };
}

/** ムービックの一覧（検索結果・カテゴリ・特集）。発売日は一覧に無いので、商品ページを5件ずつ並べて読む */
async function movicList(u: URL): Promise<ProductList | null> {
  if (/^\/shop\/g\//.test(u.pathname)) return null; // 1商品のページ
  const html = await getHtml(u.toString());
  if (!html) return null;
  const items = parseMovicList(html);
  if (!items.length) return null;
  const products: ListProduct[] = items.map((c) => ({ title: c.title, url: c.url, price: c.price, inStock: c.inStock, image: c.image, images: c.image ? [c.image] : [] }));
  for (let i = 0; i < products.length; i += 5) {
    await Promise.all(products.slice(i, i + 5).map(async (p) => {
      const hit = await lookupByUrl(p.url).catch(() => null);
      if (hit?.release) p.release = hit.release;
      if (hit?.inStock !== undefined) p.inStock = hit.inStock;
    }));
  }
  return { title: pageTitle(html), shop: 'ムービック', retailer: 'ムービック', products };
}

/** 一覧ページのURLなら商品の一覧を返す。対応外・一覧でない・読めないときは null */
export async function fetchProductList(raw: string): Promise<ProductList | null> {
  let u: URL;
  try { u = new URL(raw); } catch { return null; }
  if (u.protocol !== 'https:') return null;
  const host = u.host.toLowerCase();
  if (host === 'www.animate-onlineshop.jp') return animateList(u);
  if (/(^|\.)movic\.jp$/.test(host)) return movicList(u);
  const col = await fetchShopifyCollection(raw);
  if (!col) return null;
  return { title: col.title, shop: col.shop, retailer: col.shop, products: col.products };
}

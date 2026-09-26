// 商品の一覧ページ（公式通販のコレクション・アニメイトの検索結果・ムービックの検索結果など）から、
// 商品の一覧を読む。parse-event がこれをシリーズごとの予定にまとめる。
// 店ごとにページの作りが違うので、ここで同じ形（ProductList）にそろえる。
// 接続するのは決まった店（アニメイト・ムービック）と、Shopify の店（_shopify.ts の safePublicUrl を通す）だけ。
import { createClient } from '@supabase/supabase-js';
import { fetchShopifyCollection } from './_shopify.js';
import { parseAnimateList, parseMovicList, lookupByUrl, unwrapProductUrl } from './_product-search.js';

export interface ListProduct {
  title: string; url: string; price: number; inStock?: boolean;
  image: string; images: string[];
  release?: { date: string; dateLabel: string | null };
}
export interface ProductList { title: string; shop: string; retailer: string; products: ListProduct[]; nextPage: number | null }

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

/** アニメイトの一覧（検索結果・作品ページ）。スマホ版の /sphone/ は PC 版にそろえ、1ページ100件で読む。
 *  2ページ目以降は pageno=N */
async function animateList(u: URL, page: number): Promise<ProductList | null> {
  if (/\/pd\/\d+/.test(u.pathname) || /products\/detail\.php$/.test(u.pathname)) return null; // 1商品のページ
  const pc = new URL(u.toString().replace('/sphone/', '/'));
  if (/products\/list\.php$/.test(pc.pathname)) pc.searchParams.set('sl', '100');
  if (page > 1) pc.searchParams.set('pageno', String(page)); else pc.searchParams.delete('pageno');
  const html = await getHtml(pc.toString());
  if (!html) return null;
  const items = parseAnimateList(html);
  if (!items.length) return null;
  return {
    title: pageTitle(html), shop: 'アニメイトオンラインショップ', retailer: 'アニメイト',
    nextPage: html.includes(`pageno=${page + 1}`) ? page + 1 : null,
    products: items.map((c) => ({ title: c.title, url: c.url, price: c.price, inStock: c.inStock, image: c.image, images: c.image ? [c.image] : [], release: c.release })),
  };
}

/** ムービックの一覧（検索結果・カテゴリ・特集）。発売日は一覧に無いので、商品ページを5件ずつ並べて読む。
 *  2ページ目以降は p=N（1ページ50件） */
async function movicList(u: URL, page: number): Promise<ProductList | null> {
  if (/^\/shop\/g\//.test(u.pathname)) return null; // 1商品のページ
  const pu = new URL(u.toString());
  if (page > 1) pu.searchParams.set('p', String(page)); else pu.searchParams.delete('p');
  const html = await getHtml(pu.toString());
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
  return { title: pageTitle(html), shop: 'ムービック', retailer: 'ムービック', products, nextPage: new RegExp(`[?&;]p=${page + 1}&`).test(html) ? page + 1 : null };
}

/** 一覧ページのURLなら商品の一覧を返す（page は2ページ目以降を読むとき）。対応外・一覧でない・読めないときは null */
export async function fetchProductList(raw: string, page = 1): Promise<ProductList | null> {
  let u: URL;
  try { u = new URL(raw); } catch { return null; }
  if (u.protocol !== 'https:') return null;
  const host = u.host.toLowerCase();
  if (host === 'www.animate-onlineshop.jp') return animateList(u, page);
  if (/(^|\.)movic\.jp$/.test(host)) return movicList(u, page);
  const col = await fetchShopifyCollection(raw, page);
  if (!col) return null;
  return { title: col.title, shop: col.shop, retailer: col.shop, products: col.products, nextPage: col.hasMore ? page + 1 : null };
}

/** 同じ商品かを見分けるキー。URLの形が違っても（アフィリエイトの包み・スマホ版・クエリ付き）同じ商品なら同じになる */
export function productKey(raw: string): string {
  let u: URL;
  try { u = new URL(unwrapProductUrl(raw)); } catch { return raw; }
  const host = u.host.toLowerCase().replace(/^www\./, '');
  const animate = u.pathname.match(/\/pd\/(\d+)/)?.[1] ?? (host === 'animate-onlineshop.jp' ? u.searchParams.get('product_id') : null);
  if (animate) return `animate:${animate}`;
  const movic = u.pathname.match(/^\/shop\/g\/g([^/]+)/)?.[1];
  if (movic) return `movic:${movic}`;
  const handle = u.pathname.match(/\/products\/([^/?#]+)/)?.[1];
  if (handle) return `${host}:products:${decodeURIComponent(handle)}`;
  return `${host}${u.pathname.replace(/\/$/, '')}`;
}

/** 一覧の商品のうち、すでにどこかの予定の購入リンク（投稿者以外が足して反映待ちのものも）に入っているものを外す。
 *  同じ一覧をもう一度解析したとき、登録済みの商品が「新しいまとまり」として出てきて紛らわしいのを防ぐ。
 *  DBに入っている販路名は店名（アニメイト・ムービック・Shopifyの店名）かホスト名なので、その販路のリンクだけを引く */
export async function excludeRegistered(list: ProductList): Promise<{ list: ProductList; excluded: number }> {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || !list.products.length) return { list, excluded: 0 };
  const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  let host = '';
  try { host = new URL(list.products[0].url).host; } catch { /* ignore */ }
  const names = [...new Set([list.retailer, list.shop, host, host.replace(/^www\./, '')].filter(Boolean))];
  const registered = new Set<string>();
  await Promise.all(names.flatMap((name) => [
    // contains() に配列を渡すと Postgres の配列の書き方（{…}）で送られて jsonb に当たらない。JSON の文字列で渡す
    db.from('events').select('offers').eq('pool', 0).filter('offers', 'cs', JSON.stringify([{ retailer: name }])).then(({ data }) => {
      for (const e of data ?? []) for (const o of (e.offers as { url?: string }[] | null) ?? []) if (o?.url) registered.add(productKey(o.url));
    }),
    db.from('event_offer_contribs').select('offer').filter('offer', 'cs', JSON.stringify({ retailer: name })).then(({ data }) => {
      for (const c of data ?? []) { const u = (c.offer as { url?: string } | null)?.url; if (u) registered.add(productKey(u)); }
    }),
  ]));
  const products = list.products.filter((p) => !registered.has(productKey(p.url)));
  return { list: { ...list, products }, excluded: list.products.length - products.length };
}

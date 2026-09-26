// Shopify の店（ちいかわマーケットなど作品の公式通販に多い）から、商品一覧・価格・在庫を読む。
// Shopify はどの店も同じ形の JSON を公開している:
//   /meta.json                              … 店名
//   /collections/{handle}.json              … コレクション名（「10月9日発売商品」）
//   /collections/{handle}/products.json     … コレクションの商品一覧
//   /products/{handle}.js                   … 1商品の価格（1/100円単位）・在庫
// parse-event（コレクションURLをシリーズごとの予定にする）と _product-search の lookupByUrl
// （貼られた商品URLの価格を取る・毎日の更新）から使う。_ で始まるので Vercel の関数には数えられない。
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36';

/** 内部アドレス（ループバック・プライベート・リンクローカル）か */
function isPrivateAddress(ip: string): boolean {
  if (ip.includes(':')) {
    const v6 = ip.toLowerCase();
    return v6 === '::1' || v6.startsWith('fc') || v6.startsWith('fd') || v6.startsWith('fe80') || v6.startsWith('::ffff:');
  }
  const [a, b] = ip.split('.').map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
}

/** 利用者が貼ったURLにサーバーから接続してよいか。parse-event を「Xのポストだけ」にした理由の一つが
 *  「任意のホストへ接続する口になる（内部アドレスも弾いていなかった）」だったので、ここで塞ぐ。
 *  https・ドメイン名（IPの直書きは不可）・名前解決の結果が全部公開アドレスのときだけ通す。 */
export async function safePublicUrl(raw: string): Promise<URL | null> {
  let u: URL;
  try { u = new URL(raw); } catch { return null; }
  if (u.protocol !== 'https:' || u.port || u.username || isIP(u.hostname) || !u.hostname.includes('.')) return null;
  try {
    const addrs = await lookup(u.hostname, { all: true });
    if (!addrs.length || addrs.some((a) => isPrivateAddress(a.address))) return null;
  } catch { return null; }
  return u;
}

// Shopify は接続元の国で売り場（Markets）を切り替える。Vercel のサーバーは米国なので、そのままだと
// 海外向けの売り場になり、値段も品ぞろえも違う（2026-09-26 実測: ちいかわマーケットで 1870円→4900円・49件→43件）。
// Accept-Language では変わらず、localization=JP の cookie で日本の売り場になる。
const JP_MARKET = 'localization=JP; cart_currency=JPY';

async function getJson<T>(url: string): Promise<T | null> {
  const r = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'application/json', 'Accept-Language': 'ja', Cookie: JP_MARKET },
    redirect: 'error', signal: AbortSignal.timeout(8000),
  });
  // /products/{handle}.js は中身がJSONでも text/javascript で返る
  if (!r.ok || !/json|javascript/.test(r.headers.get('content-type') ?? '')) return null;
  try { return (await r.json()) as T; } catch { return null; }
}

/** 店名（/meta.json の name）。取れなければホスト名 */
export async function shopifyShopName(origin: string): Promise<string> {
  const meta = await getJson<{ name?: string }>(`${origin}/meta.json`).catch(() => null);
  return meta?.name?.trim() || new URL(origin).host;
}

export interface ShopifyProduct { title: string; url: string; price: number; inStock: boolean; image: string; images: string[] }

/** コレクションのURL（/collections/{handle}）なら、コレクション名・店名・商品一覧を返す。Shopifyでなければ null */
export async function fetchShopifyCollection(raw: string, page = 1): Promise<{ title: string; shop: string; products: ShopifyProduct[]; hasMore: boolean } | null> {
  const u = await safePublicUrl(raw);
  const handle = u?.pathname.match(/^\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?collections\/([^/?#]+)\/?$/i)?.[1];
  if (!u || !handle || handle === 'all') return null;
  const [col, list] = await Promise.all([
    getJson<{ collection?: { title?: string } }>(`${u.origin}/collections/${handle}.json`).catch(() => null),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getJson<{ products?: any[] }>(`${u.origin}/collections/${handle}/products.json?limit=250&page=${page}`).catch(() => null),
  ]);
  if (!list?.products?.length) return null;
  const shop = await shopifyShopName(u.origin);
  const products: ShopifyProduct[] = list.products.map((p) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const vs = (p.variants ?? []) as any[];
    const prices = vs.map((v) => Number(v.price)).filter((n) => n > 0);
    return {
      title: String(p.title ?? '').trim(),
      url: `${u.origin}/products/${p.handle}`,
      price: prices.length ? Math.min(...prices) : 0,
      inStock: vs.some((v) => v.available),
      image: String(p.images?.[0]?.src ?? ''),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      images: ((p.images ?? []) as any[]).map((im) => String(im?.src ?? '')).filter(Boolean),
    };
  }).filter((p: ShopifyProduct) => p.title && p.price > 0);
  // 1ページ250件。ちょうど250件なら続きがあるかもしれない
  return { title: col?.collection?.title?.trim() || '', shop, products, hasMore: list.products.length >= 250 };
}

/** 商品のURL（/products/{handle}、/collections/…/products/{handle}）なら価格・在庫を返す。Shopifyでなければ null */
export async function lookupShopifyProduct(raw: string): Promise<{ title: string; price: number; inStock: boolean; shop: string } | null> {
  const u = await safePublicUrl(raw);
  const handle = u?.pathname.match(/\/products\/([^/?#]+)/)?.[1];
  if (!u || !handle) return null;
  const p = await getJson<{ title?: string; price?: number; available?: boolean }>(`${u.origin}/products/${handle}.js`).catch(() => null);
  if (!p || typeof p.price !== 'number') return null;
  return { title: String(p.title ?? ''), price: Math.round(p.price / 100), inStock: !!p.available, shop: await shopifyShopName(u.origin) };
}

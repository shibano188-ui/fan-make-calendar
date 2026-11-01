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
const shopNames = new Map<string, string>(); // 同じ呼び出しの中で何度も取りに行かない（全件登録で商品ごとに呼ばれる）
export async function shopifyShopName(origin: string): Promise<string> {
  const cached = shopNames.get(origin);
  if (cached) return cached;
  const meta = await getJson<{ name?: string }>(`${origin}/meta.json`).catch(() => null);
  const name = meta?.name?.trim() || new URL(origin).host;
  shopNames.set(origin, name);
  return name;
}

export interface ShopifyProduct {
  title: string; url: string; price: number; image: string; images: string[];
  /** false=売り切れ。まだ売り出していない（受付前）ときは undefined にして stockLabel で伝える */
  inStock?: boolean; stockLabel?: string;
  release?: { date: string; dateLabel: string | null };
  /** 商品の説明文（タグを除いた文字）。受付期間などを読むのに使う */
  body?: string;
  /** 店に出した日（products.json の published_at）。YYYY-MM-DD */
  publishedAt?: string;
}

/** 説明文から、受付の締切と発売日を読む（今日より前の締切は、書き換え忘れの古い文なので無かったことにする）。YYYY-MM-DD
 *  締切の書き方は「受付期間：2026年11月29日(日)23:59まで」「受注期間：10/23(金)12:00～11/8(日)23:59まで」。範囲なら最後の日付
 *  発売日の書き方は「発売日：2026年7月21日(火)」「【発売日】2021年12月21日(火)」。無ければ「発送時期：2026年11月下旬」を時期として読む。
 *  発送時期に年が無いときは、店に出した日（published）の年。出した月より前の月なら翌年 */
export function parseBodyDates(body: string, today: string, published?: string): { preorderEnd?: string; release?: string; releaseLabel?: string } {
  const pad = (n: string) => n.padStart(2, '0');
  const period = body.match(/(?:受付|受注)期間[\s\S]{0,60}?まで/)?.[0] ?? '';
  const last = [...period.matchAll(/(?:(\d{4})年\s*)?(\d{1,2})(?:月|\/)\s*(\d{1,2})/g)].pop();
  let end: string | undefined;
  if (last) {
    const md = `${pad(last[2])}-${pad(last[3])}`;
    const y = Number(today.slice(0, 4));
    // 年が無いときは今年。2か月以上前になるなら来年（年末に年明けの締切を書いているとき）
    end = last[1] ? `${last[1]}-${md}` : `${y}-${md}` < new Date(Date.parse(today) - 60 * 86400_000).toISOString().slice(0, 10) ? `${y + 1}-${md}` : `${y}-${md}`;
  }
  const r = body.match(/発売日[】：:\s]*(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
  const release = r ? `${r[1]}-${pad(r[2])}-${pad(r[3])}` : undefined;
  const dates = { ...(end && end >= today ? { preorderEnd: end } : {}) };
  if (release) return { ...dates, release };
  const ship = body.match(/発送時期[：:]\s*(?:(\d{4})\s*年\s*)?(\d{1,2})\s*月\s*(上旬|中旬|下旬)/);
  const base = published ?? today;
  if (ship) {
    const year = ship[1] ? Number(ship[1]) : Number(base.slice(0, 4)) + (Number(ship[2]) < Number(base.slice(5, 7)) ? 1 : 0);
    return { ...dates, release: `${year}-${pad(ship[2])}-${{ 上旬: '05', 中旬: '15', 下旬: '25' }[ship[3]]}`, releaseLabel: ship[3] };
  }
  return dates;
}

// Shopify は「売り切れ」と「まだ売り出していない」を区別しない（どちらも available=false）。
// そのままだと「11時予約開始」の商品が売り切れに見えるので、店が付ける印で見分ける（本人指摘・2026-09-27）。
//   ちいかわマーケット: タグ「販売開始前」と、発売日のタグ「20261009」
const PRE_SALE_RE = /販売開始前|予約開始前|受付開始前|発売前|coming\s*soon/i;
const todayJst = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);

/** 発売日のタグ（「20261009」）。1つだけのときに使う */
function releaseFromTags(tags: string[]): { date: string; dateLabel: null } | null {
  const ds = [...new Set(tags.map((t) => t.trim()).filter((t) => /^20\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])$/.test(t)))];
  if (ds.length !== 1) return null;
  return { date: `${ds[0].slice(0, 4)}-${ds[0].slice(4, 6)}-${ds[0].slice(6)}`, dateLabel: null };
}

/** 在庫。買えないとき、受付前の印があるか、発売日のタグが今日より先なら受付前 */
// 予約販売の印（ホロライブの「予約販売」「予約商品」など）。予約で売る商品は、予定も「予約あり」にする
// 発売日のタグが先なのに買える商品も予約（ジャンプショップは予約品に印を付けず、発売日のタグだけが未来になっている）
const PREORDER_TAG_RE = /予約|受注|pre-?order/i;

function stockOf(available: boolean, tags: string[], text: string, release: { date: string } | null): Pick<ShopifyProduct, 'inStock' | 'stockLabel'> {
  const preorder = tags.some((t) => PREORDER_TAG_RE.test(t)) || /予約|受注/.test(text) || (available && !!release && release.date > todayJst());
  // 買えて予約でなければ「在庫あり」（発売済みの在庫）。画面の状態を決めるのに使う（src/lib/affiliate.ts の stockHint）
  if (available) return { inStock: true, stockLabel: preorder ? '予約受付中' : '在庫あり' };
  if (tags.some((t) => PRE_SALE_RE.test(t)) || PRE_SALE_RE.test(text) || (release && release.date > todayJst())) return { stockLabel: preorder ? '予約受付前' : '受付前' };
  return { inStock: false };
}

/** tags は products.json では配列、/products/{handle}.js でも配列（古い店は「a, b」の文字列のことがある） */
const tagList = (t: unknown): string[] => (Array.isArray(t) ? t.map(String) : typeof t === 'string' ? t.split(',') : []);

/** products.json の商品を ShopifyProduct にする。値段の無いものは落とす */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toProducts(origin: string, raw: any[]): ShopifyProduct[] {
  return raw.map((p) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const vs = (p.variants ?? []) as any[];
    const prices = vs.map((v) => Number(v.price)).filter((n) => n > 0);
    const tags = tagList(p.tags);
    const release = releaseFromTags(tags);
    return {
      title: String(p.title ?? '').trim(),
      url: `${origin}/products/${p.handle}`,
      price: prices.length ? Math.min(...prices) : 0,
      ...stockOf(vs.some((v) => v.available), tags, String(p.title ?? ''), release),
      ...(release ? { release } : {}),
      body: String(p.body_html ?? '').replace(/<[^>]+>/g, '\n').replace(/&nbsp;/g, ' '),
      ...(p.published_at ? { publishedAt: new Date(new Date(p.published_at).getTime() + 9 * 3600_000).toISOString().slice(0, 10) } : {}),
      image: String(p.images?.[0]?.src ?? ''),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      images: ((p.images ?? []) as any[]).map((im) => String(im?.src ?? '')).filter(Boolean),
    };
  }).filter((p: ShopifyProduct) => p.title && p.price > 0);
}

/** 店の全商品（/products.json を250件ずつ最後まで。多くても30ページ）。巡回ボットがジャンプショップの最初の全件登録で使う */
export async function fetchShopifyAll(origin: string): Promise<{ shop: string; products: ShopifyProduct[] } | null> {
  const u = await safePublicUrl(origin);
  if (!u) return null;
  const products: ShopifyProduct[] = [];
  for (let page = 1; page <= 30; page++) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const list = await getJson<{ products?: any[] }>(`${u.origin}/products.json?limit=250&page=${page}`).catch(() => null);
    if (!list?.products?.length) break;
    products.push(...toProducts(u.origin, list.products));
    if (list.products.length < 250) break;
  }
  return products.length ? { shop: await shopifyShopName(u.origin), products } : null;
}

/** 店の新着（/products.json は公開の新しい順）。巡回ボットがジャンプショップなど作品ごとのコレクションが大きい店で使う */
export async function fetchShopifyNewest(origin: string): Promise<{ shop: string; products: ShopifyProduct[] } | null> {
  const u = await safePublicUrl(origin);
  if (!u) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const list = await getJson<{ products?: any[] }>(`${u.origin}/products.json?limit=250`).catch(() => null);
  if (!list?.products?.length) return null;
  return { shop: await shopifyShopName(u.origin), products: toProducts(u.origin, list.products) };
}

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
  const products = toProducts(u.origin, list.products);
  // 1ページ250件。ちょうど250件なら続きがあるかもしれない
  return { title: col?.collection?.title?.trim() || '', shop, products, hasMore: list.products.length >= 250 };
}

/** 商品のURL（/products/{handle}、/collections/…/products/{handle}）なら価格・在庫を返す。Shopifyでなければ null */
export async function lookupShopifyProduct(raw: string): Promise<{ title: string; price: number; inStock?: boolean; stockLabel?: string; shop: string; release?: { date: string; dateLabel: null }; image?: string; jan?: string } | null> {
  const u = await safePublicUrl(raw);
  const handle = u?.pathname.match(/\/products\/([^/?#]+)/)?.[1];
  if (!u || !handle) return null;
  const p = await getJson<{ title?: string; price?: number; available?: boolean; tags?: unknown; featured_image?: string; variants?: { barcode?: string }[] }>(`${u.origin}/products/${handle}.js`).catch(() => null);
  if (!p || typeof p.price !== 'number') return null;
  const tags = tagList(p.tags);
  const release = releaseFromTags(tags);
  return {
    title: String(p.title ?? ''), price: Math.round(p.price / 100),
    ...stockOf(!!p.available, tags, String(p.title ?? ''), release),
    ...(release ? { release } : {}),
    // JANコード（店が違っても同じ商品かを見分ける）
    ...(/^\d{13}$/.test(String(p.variants?.[0]?.barcode ?? '')) ? { jan: String(p.variants![0].barcode) } : {}),
    // featured_image は「//cdn.shopify.com/…」のようにスキームが無いことがある
    ...(p.featured_image ? { image: p.featured_image.startsWith('//') ? `https:${p.featured_image}` : p.featured_image } : {}),
    shop: await shopifyShopName(u.origin),
  };
}

// 決まった店の一覧を運営側で巡回して、新しいグッズを予定として登録する（本人要望・2026-09-27）。
// 投稿画面で一覧を貼ったときと同じ処理（_listsource.ts → _listgroup.ts）を通し、運営アカウント
// （staff.role = 'bot'）の投稿として入れる。普通の投稿と同じ扱い（新着の通知にも入る）。
// 直すのは運営の各自（staff.role = 'admin'）が詳細ページから行う。
//
// 巡回先 = ちいかわマーケット ＋ 決まった9作品 × アニメイト・ムービックの検索 ＋ ジャンプショップの全作品（_jumpshop.ts）。
// ゆくゆくはフォローされている作品を全部にしたいが、巡回が重くなるので今は9作品だけ（柴野の判断・2026-09-27）。
// まだ一度も見ていない場所を先に見て、あとは前回見たのが古い順。
// 1回に2か所、同じ場所は1日1回まで。前回見た時刻は bot_state（key='crawl'）に持つ。
import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchProductList, excludeRegistered, type ProductList } from './_listsource.js';
import { fetchShopifyAll, fetchShopifyCollection, type ShopifyProduct } from './_shopify.js';
import { listEvents, type ListEvent } from './_listgroup.js';
import { representativePrice, type OfferRow } from './_offers.js';
import { lookupByUrl } from './_product-search.js';
import { botCanFetch } from './_pace.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any>;

// 巡回する作品（works.name と同じ表記）。ヒカルの碁は盛り上がっているので足した（柴野・2026-10-02）
const FIXED_WORKS = ['葬送のフリーレン', '呪術廻戦', 'ハイキュー!!', '進撃の巨人', '鬼滅の刃', '僕のヒーローアカデミア', 'ちいかわ', 'ブルーロック', '名探偵コナン', 'ヒカルの碁'];

interface Source {
  key: string; work: string;
  /** 読む一覧のURL（投稿画面と同じ fetchProductList で読む） */
  urls?: () => Promise<string[]>;
  /** URLでは読めない一覧（ジャンプショップの新着など）を直接返す */
  lists?: () => Promise<ProductList[]>;
}

const todayJst = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);

// ちいかわマーケットは発売日ごとのコレクション（「20261009」「pre20261003」＝10月3日予約商品）。今日以降のものを全部
const CHIIKAWA_MARKET: Source = {
  key: 'chiikawamarket', work: 'ちいかわ',
  urls: async () => {
    const r = await fetch('https://chiikawamarket.jp/collections.json?limit=250', { headers: { Cookie: 'localization=JP; cart_currency=JPY' }, signal: AbortSignal.timeout(10000) }).catch(() => null);
    const cols = ((await r?.json().catch(() => null)) as { collections?: { handle: string }[] } | null)?.collections ?? [];
    const today = todayJst().replace(/-/g, '');
    return cols.map((c) => c.handle).filter((h) => { const d = h.match(/^(?:pre)?(\d{8})$/)?.[1]; return !!d && d >= today; })
      .map((h) => `https://chiikawamarket.jp/collections/${h}`);
  },
};

// ジャンプショップは作品を問わず全部（柴野の判断・2026-09-28）。1つの巡回先として扱い、中は crawlJumpShop が回す
const JUMP_SHOP_SOURCE: Source = { key: 'jumpshop', work: '' };

const searchSources = (w: string): Source[] => [
  // アニメイトは登録の新しい順（sort=5）、ムービックは新着順（seq=nd）
  { key: `animate:${w}`, work: w, urls: async () => [`https://www.animate-onlineshop.jp/products/list.php?smt=${encodeURIComponent(w)}&sort=5`] },
  { key: `movic:${w}`, work: w, urls: async () => [`https://www.movic.jp/shop/goods/search.aspx?search=x&keyword=${encodeURIComponent(w)}&seq=nd`] },
];

/** 巡回先の一覧 */
function listSources(): Source[] {
  return [CHIIKAWA_MARKET, ...FIXED_WORKS.flatMap(searchSources), JUMP_SHOP_SOURCE];
}

const norm = (s: string) => s.normalize('NFKC').toLowerCase().replace(/[\s!?・/\\\-ー~〜、。,.:;'"「」『』【】[\]()（）《》<>＜＞#＆&+*★☆♪]/g, '');

/** 検索結果のうち、商品名に作品名（か別名）が入っているものだけ残す。
 *  作品名で検索しても、名前が一般的な作品（「神の雫」など）だと関係ない商品が混ざるため */
async function onlyThisWork(db: Db, list: ProductList, workId: string, work: string): Promise<ProductList> {
  const { data } = await db.from('work_aliases').select('alias_norm').eq('work_id', workId);
  const keys = [norm(work), ...(data ?? []).map((a) => String(a.alias_norm ?? ''))].filter((k) => k.length >= 2);
  return { ...list, products: list.products.filter((p) => keys.some((k) => norm(p.title).includes(k))) };
}

/** これから買えるものだけ残す。売り切れは入れない。発売日が分かるものは発売から3日以内まで。
 *  発売日が分からないものは予約受付中・受付前のときだけ（検索結果には何年も前の商品が混ざる） */
export function upcoming(list: ProductList): ProductList {
  const since = new Date(Date.now() + 9 * 3600_000 - 3 * 86400_000).toISOString().slice(0, 10);
  const products = list.products.filter((p) => {
    if (p.inStock === false) return false;
    if (p.release) return p.release.date >= since;
    return /予約|受付前/.test(p.stockLabel ?? '');
  });
  return { ...list, products };
}

/** ちいかわマーケットの「10月3日予約商品」は予約開始日 */
function preorderFromTitle(title: string): string | null {
  const m = title.match(/(\d{1,2})月(\d{1,2})日予約/);
  if (!m) return null;
  const now = new Date(Date.now() + 9 * 3600_000);
  let y = now.getUTCFullYear();
  const md = `${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  if (`${y}-${md}` < new Date(now.getTime() - 60 * 86400_000).toISOString().slice(0, 10)) y++;
  return `${y}-${md}`;
}

async function workId(db: Db, name: string): Promise<string | null> {
  const { data } = await db.from('works').select('id').eq('name', name).maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

/** 同じ商品かを見るための名前。店の囲み（【アニメイト先行販売】など）・記号・空白を落とす */
const sameKey = (t: string) => t.normalize('NFKC').toLowerCase().replace(/【[^】]*】|\[[^\]]*\]/g, '').replace(/[\s!?・/\\\-ー~〜、。,.:;'"「」『』()（）《》<>＜＞#＆&+*★☆♪]/g, '');

/** 別の店で同じ商品がもう登録されていれば（アニメイトとムービックの両方にある等）、その予定を返す。
 *  同じ作品・同じ発売日・同じ値段・別の店で、名前が（囲みと記号を除いて）同じもの。
 *  前は名前の近さ（0.8以上）で見ていて、「名探偵コナン アクリルスタンド」に別のシリーズのアクスタが
 *  14種まとまってしまった（2026-09-27 初回の巡回）。混ぜるより別の予定にする */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function findSame(existing: any[], e: ListEvent): any | null {
  const k = sameKey(e.title);
  // コミック・書籍は別の店の予定にもまとめない（巻・版の違いを取り違えないように）
  if (k.length < 10 || e.categories.includes('書籍')) return null;
  const shops = new Set(e.offers.map((o) => o.retailer));
  for (const row of existing) {
    // 発売日と値段も同じで、別の店のものだけ（同じ店の同じ名前は、別の時期・別のシリーズの商品）
    if ((e.date ?? null) !== (row.event_date ?? null) || e.price !== row.price) continue;
    const offers = (Array.isArray(row.offers) ? row.offers : []) as OfferRow[];
    if (offers.some((o) => shops.has(o.retailer ?? ''))) continue;
    if (sameKey(String(row.title ?? '')) === k) return row;
  }
  return null;
}

/** 巡回を1か所ぶん進める。登録した件数・別の店のリンクとして足した件数を返す */
export async function crawlNext(db: Db): Promise<{ sources: string[]; added: number; merged: number; read: number; skipped?: string }> {
  const { data: bot } = await db.from('staff').select('user_id').eq('role', 'bot').limit(1).maybeSingle();
  if (!bot?.user_id) return { sources: [], added: 0, merged: 0, read: 0, skipped: '運営アカウント（staff.role=bot）が無い' };
  const authorId = bot.user_id as string;

  // ジャンプショップの最初の全件登録が済むまでは、毎回それだけを進める（1回では終わらない量なので）
  const { data: js } = await db.from('bot_state').select('value').eq('key', 'jumpshop').maybeSingle();
  if (((js?.value ?? {}) as { phase?: string }).phase !== 'daily') {
    const r = await crawlJumpShop(db, authorId, 'initial');
    return { sources: ['jumpshop（最初の全件登録）'], added: r.added, merged: r.merged, read: r.read };
  }

  const { data: st } = await db.from('bot_state').select('value').eq('key', 'crawl').maybeSingle();
  const seen = { ...(((st?.value ?? {}) as { seen?: Record<string, string> }).seen ?? {}) };
  const sources = listSources();
  // まだ見ていないもの（新しくフォローされた作品）→ 前回見たのが古いもの の順に2か所
  // 同じ場所は1日1回まで（相手のサイトに負担をかけない。柴野の判断・2026-09-28）。全部見終わったら次の日まで何もしない
  const dayAgo = new Date(Date.now() - 24 * 3600_000).toISOString();
  const picks = [...sources].filter((x) => (seen[x.key] ?? '') < dayAgo)
    .filter((x) => !x.key.startsWith('animate:') || botCanFetch('www.animate-onlineshop.jp', 40 * 60_000))
    .sort((a, b) => (seen[a.key] ?? '').localeCompare(seen[b.key] ?? '')).slice(0, 2);
  if (!picks.length) return { sources: [], added: 0, merged: 0, read: 0, skipped: '今日の巡回は済んでいる' };
  const now = new Date().toISOString();
  for (const p of picks) seen[p.key] = now;
  // 巡回先から外れた作品の記録は残さない
  const keys = new Set(sources.map((x) => x.key));
  for (const k of Object.keys(seen)) if (!keys.has(k)) delete seen[k];
  await db.from('bot_state').upsert({ key: 'crawl', value: { seen }, updated_at: now });

  const results = [];
  for (const src of picks) results.push(src === JUMP_SHOP_SOURCE ? await crawlJumpShop(db, authorId, 'daily') : await crawlSource(db, src, authorId));
  return { sources: picks.map((p) => p.key), added: results.reduce((n, r) => n + r.added, 0), merged: results.reduce((n, r) => n + r.merged, 0), read: results.reduce((n, r) => n + r.read, 0) };
}

async function crawlSource(db: Db, src: Source, authorId: string): Promise<{ added: number; merged: number; read: number }> {
  const wid = await workId(db, src.work);
  if (!wid) return { added: 0, merged: 0, read: 0 };
  const { data: existing } = await db.from('events').select('id, title, event_date, offers, price')
    .eq('work_id', wid).eq('type', 'goods').eq('pool', 0).gte('event_date', new Date(Date.now() - 90 * 86400_000).toISOString().slice(0, 10));
  const rows = existing ?? [];

  let added = 0, merged = 0, read = 0;
  const lists: ProductList[] = [];
  for (const url of (await src.urls?.()) ?? []) {
    const got = await fetchProductList(url).catch(() => null);
    if (got) lists.push(got);
  }
  lists.push(...((await src.lists?.().catch(() => [])) ?? []));
  for (const got of lists) {
    read += got.products.length;
    const mine = src.key === CHIIKAWA_MARKET.key ? got : await onlyThisWork(db, got, wid, src.work);
    const { list } = await excludeRegistered(upcoming(mine)).catch(() => ({ list: upcoming(mine) }));
    if (!list.products.length) continue;
    const preStart = preorderFromTitle(got.title);
    // ちいかわマーケットの新商品は発売日の11時に販売開始。データのどこにも時刻が無い（告知にだけ出る）ので決め打ちする
    const saleTime = src.key === CHIIKAWA_MARKET.key && !preStart ? '11:00' : null;
    const r = await registerEvents(db, wid, await listEvents(list, src.work), rows, authorId, preStart, saleTime);
    added += r.added; merged += r.merged;
  }
  return { added, merged, read };
}

/** 購入リンクに JANコードが無ければ、商品ページから取って入れる（5件ずつ） */
async function fillJans(offers: OfferRow[]): Promise<void> {
  const need = offers.filter((o) => !o.jan);
  for (let i = 0; i < need.length; i += 5) {
    await Promise.all(need.slice(i, i + 5).map(async (o) => {
      const hit = await lookupByUrl(o.url).catch(() => null);
      if (hit?.jan) o.jan = hit.jan;
    }));
  }
}

/** JANコードが同じ購入リンクを持つ予定（作品を問わない）。店が違っても同じ商品なら同じ予定にする */
async function findByJan(db: Db, jan: string): Promise<{ id: string; offers: OfferRow[]; price: number | null } | null> {
  const { data } = await db.from('events').select('id, offers, price').eq('pool', 0).filter('offers', 'cs', JSON.stringify([{ jan }])).limit(1);
  const row = data?.[0];
  return row ? { id: row.id as string, offers: (row.offers ?? []) as OfferRow[], price: (row.price as number | null) ?? null } : null;
}

/** 予定を入れる。**同じ商品が別の予定として二重に入らないようにする**（柴野の要望・2026-09-28）:
 *  1. 購入リンクごとに JANコードを取り、同じ JANコードの予定がもうあれば、そこに購入リンクを足す（店・作品を問わない）
 *  2. JANコードが取れないときは、名前・発売日・値段が同じ別の店の予定（findSame）に足す
 *  createdAt を返す関数を渡すと、その日時を登録日にする（古い在庫品を新着に出さないため） */
export async function registerEvents(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Db, wid: string, events: ListEvent[], rows: any[], authorId: string, preStart: string | null, saleTime: string | null,
  createdAt?: (e: ListEvent) => string | null,
): Promise<{ added: number; merged: number }> {
  let added = 0, merged = 0;
  const addTo = async (target: { id: string; offers: OfferRow[]; price: number | null }, more: OfferRow[]) => {
    const urls = new Set(target.offers.map((o) => o.url));
    const add = more.filter((o) => !urls.has(o.url));
    if (!add.length) return;
    const next = [...target.offers, ...add];
    const { error } = await db.from('events').update({ offers: next, price: representativePrice(next, target.price, false) }).eq('id', target.id);
    if (!error) { target.offers = next; merged++; }
  };
  for (const e of events) {
    const offers = e.offers as OfferRow[];
    await fillJans(offers);
    // 1. JANコードで同じ商品の予定を探す。見つかったリンクはそこへ足し、残りだけで新しい予定にする
    const rest: OfferRow[] = [];
    for (const o of offers) {
      const hit = o.jan ? await findByJan(db, o.jan) : null;
      if (hit) await addTo(hit, [o]); else rest.push(o);
    }
    if (!rest.length) continue;
    if (rest.length !== offers.length) {
      // 一部だけ既存の予定と同じだった（まとめた中の1キャラだけ登録済みなど）。残りで予定を作る
      e.offers = rest as ListEvent['offers'];
      e.price = Math.min(...rest.map((o) => o.price ?? Infinity));
      if (rest.length === 1) delete (e.offers[0] as { label?: string }).label;
    }
    const same = findSame(rows, e);
    if (same) {
      // 別の店の同じ商品。新しい予定にせず、購入リンクを足す
      const offers = (Array.isArray(same.offers) ? same.offers : []) as OfferRow[];
      const urls = new Set(offers.map((o) => o.url));
      const more = e.offers.filter((o) => !urls.has(o.url));
      if (!more.length) continue;
      const nextOffers = [...offers, ...more] as OfferRow[];
      const { error } = await db.from('events').update({ offers: nextOffers, price: representativePrice(nextOffers, same.price ?? null, false) }).eq('id', same.id);
      if (!error) { same.offers = nextOffers; merged++; }
      continue;
    }
    const isOrderMade = e.isOrderMade || !!preStart;
    const first = e.offers[0];
    const row = {
      work_id: wid, title: e.title, type: 'goods',
      event_date: e.date, date_label: e.dateLabel, end_date: e.dateLabel ? null : e.date,
      event_time: e.dateLabel ? null : saleTime,
      category: e.categories.length > 1 ? JSON.stringify(e.categories) : e.categories[0] ?? null,
      image_url: e.imageUrl, offers: e.offers, price: e.price,
      link_url: first?.url ?? null, retailer: first?.retailer ?? null, has_affiliate: false,
      is_order_made: isOrderMade,
      preorder_start_date: isOrderMade ? (e.preorderStart ?? preStart) : null,
      preorder_end_date: isOrderMade ? (e.preorderEnd ?? null) : null,
      author_id: authorId, pool: 0,
      ...(createdAt?.(e) ? { created_at: createdAt(e) } : {}),
    };
    const { data, error } = await db.from('events').insert(row).select('id, title, event_date, offers, price').single();
    if (!error && data) { rows.push(data); added++; }
  }
  return { added, merged };
}

// ── ジャンプショップ ─────────────────────────
// 作品の見分けは、店の「作品から探す」（/pages/works・約180作品）の作品名を辞書にして、商品名に入っているかで決める
// （作品ごとの絞り込みは店のページでしかできず products.json では使えないため）。一番長く一致した作品にする。
// 最初は店の全商品（約4,500件）から売り切れ以外を全部登録し、そのあとは「新商品」「再入荷」だけを見る。
// DBに無い作品は作る（誰もフォローしていないので通知は飛ばない。フォローされたとき予定がそろっている）。
const JUMP_SHOP = 'https://jumpshop-benelic.com';
const JUMP_SHOP_BUDGET_MS = 50_000;

/** 比べるための作品名・商品名（記号・空白・長音符号を落とす。「ēlDLIVE」と「elDLIVE」を同じにする） */
export const workKey = (s: string) => norm(s.normalize('NFKD').replace(/[\u0300-\u036f]/g, ''));

// 店の「作品から探す」に並ぶが作品ではないもの（雑誌名）。作品として作らない（柴野の判断・2026-10-02。
// sql/2026-10-02-merge-works.sql で消した）。外すと、『作品名』の付いた商品はその作品に入り、雑誌全体のグッズは入らない
const NOT_WORKS = new Set(['少年ジャンプ＋', '週刊少年ジャンプ', 'ジャンプＳＱ．', 'すすめ!ジャンプへっぽこ探検隊!', 'ジャンプＳＱ', '少年ジャンプ+', 'ジャンプSQ.'].map((n) => workKey(n)));

async function jumpShopWorks(): Promise<string[]> {
  const r = await fetch(`${JUMP_SHOP}/pages/works`, { headers: { 'User-Agent': 'Mozilla/5.0', Cookie: 'localization=JP' }, signal: AbortSignal.timeout(15000) }).catch(() => null);
  const html = r?.ok ? await r.text() : '';
  const names = new Set<string>();
  for (const m of html.matchAll(/<a[^>]+href="[^"]*filter\.p\.m\.custom\.works=[^"]+"[^>]*>([\s\S]{0,400}?)<\/a>/g)) {
    const t = m[1].replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
    if (t && workKey(t).length >= 2 && !NOT_WORKS.has(workKey(t))) names.add(t);
  }
  return [...names].sort((a, b) => workKey(b).length - workKey(a).length);
}

/** 作品のIDを返す。名前か別名が同じ作品があればそれ、無ければ作る */
export async function resolveWork(db: Db, name: string): Promise<string | null> {
  const k = workKey(name);
  const { data: works } = await db.from('works').select('id, name').ilike('name', `%${name.slice(0, 2)}%`).limit(200);
  const hit = (works ?? []).find((w) => workKey(String(w.name)) === k);
  if (hit) return hit.id as string;
  const { data: al } = await db.from('work_aliases').select('work_id').eq('alias_norm', k).limit(1).maybeSingle();
  if (al?.work_id) return al.work_id as string;
  const { data: made, error } = await db.from('works').insert({ name }).select('id').single();
  if (made) return made.id as string;
  if (error?.code === '23505') {
    const { data: again } = await db.from('works').select('id').eq('name', name).maybeSingle();
    return (again?.id as string | undefined) ?? null;
  }
  return null;
}

async function crawlJumpShop(db: Db, authorId: string, mode: 'initial' | 'daily'): Promise<{ added: number; merged: number; read: number }> {
  const started = Date.now();
  const { data: st } = await db.from('bot_state').select('value').eq('key', 'jumpshop').maybeSingle();
  const done = new Set(((st?.value ?? {}) as { done?: string[] }).done ?? []);
  const names = await jumpShopWorks();
  if (!names.length) return { added: 0, merged: 0, read: 0 };

  let products: ShopifyProduct[] = [];
  let shop = 'JUMP SHOP';
  if (mode === 'initial') {
    const all = await fetchShopifyAll(JUMP_SHOP).catch(() => null);
    if (!all) return { added: 0, merged: 0, read: 0 };
    products = all.products; shop = all.shop;
  } else {
    for (const h of ['new', 'restock']) {
      const col = await fetchShopifyCollection(`${JUMP_SHOP}/collections/${h}`).catch(() => null);
      if (col) { products.push(...col.products); shop = col.shop; }
    }
  }
  const read = products.length;

  // 作品ごとに分ける（売り切れは入れない。発売済みでも今買えるものは入れる）
  const byWork = new Map<string, ShopifyProduct[]>();
  for (const p of products) {
    if (p.inStock === false) continue;
    const t = workKey(p.title);
    const w = names.find((n) => t.includes(workKey(n)));
    if (!w) continue;
    byWork.set(w, [...(byWork.get(w) ?? []), p]);
  }

  let added = 0, merged = 0;
  for (const [w, ps] of byWork) {
    if (mode === 'initial' && done.has(w)) continue;
    if (Date.now() - started > JUMP_SHOP_BUDGET_MS) break;
    const wid = await resolveWork(db, w);
    if (!wid) continue;
    const { data: existing } = await db.from('events').select('id, title, event_date, offers, price').eq('work_id', wid).eq('type', 'goods').eq('pool', 0);
    const list: ProductList = { title: `${shop} ${w}`, shop, retailer: shop, products: ps, nextPage: null };
    const { list: fresh } = await excludeRegistered(list).catch(() => ({ list }));
    if (fresh.products.length) {
      // 最初の全件登録では、発売から1か月より前・日付の無い在庫品は、登録日を発売日（無ければ60日前）にそろえる。
      // ホームの新着と翌朝の新着の通知に、何年も前の商品が大量に出ないように（柴野の判断・2026-09-28）
      const monthAgo = new Date(Date.now() + 9 * 3600_000 - 30 * 86400_000).toISOString().slice(0, 10);
      const backdate = mode === 'initial'
        ? (e: ListEvent) => (!e.date ? new Date(Date.now() - 60 * 86400_000).toISOString() : e.date < monthAgo ? `${e.date}T00:00:00+09:00` : null)
        : undefined;
      const r = await registerEvents(db, wid, await listEvents(fresh, w), existing ?? [], authorId, null, null, backdate);
      added += r.added; merged += r.merged;
    }
    if (mode === 'initial') done.add(w);
  }
  const finished = mode === 'daily' || [...byWork.keys()].every((w) => done.has(w));
  await db.from('bot_state').upsert({ key: 'jumpshop', value: { phase: finished ? 'daily' : 'initial', done: finished ? [] : [...done] }, updated_at: new Date().toISOString() });
  return { added, merged, read };
}

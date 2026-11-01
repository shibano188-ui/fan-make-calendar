// 決まった店の一覧を運営側で巡回して、新しいグッズを予定として登録する（本人要望・2026-09-27）。
// 投稿画面で一覧を貼ったときと同じ処理（_listsource.ts → _listgroup.ts）を通し、運営アカウント
// （staff.role = 'bot'）の投稿として入れる。普通の投稿と同じ扱い（新着の通知にも入る）。
// 直すのは運営の各自（staff.role = 'admin'）が詳細ページから行う。
//
// 巡回先 = ちいかわマーケット ＋ 決まった作品 × アニメイト・ムービックの検索 ＋ ジャンプショップの全作品（_jumpshop.ts）＋ 作品の公式ストア。
// ゆくゆくはフォローされている作品を全部にしたいが、巡回が重くなるので今は9作品だけ（柴野の判断・2026-09-27）。
// まだ一度も見ていない場所を先に見て、あとは前回見たのが古い順。
// 1回に2か所、同じ場所は1日1回まで。前回見た時刻は bot_state（key='crawl'）に持つ。
import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchProductList, excludeRegistered, productKey, type ProductList } from './_listsource.js';
import { fetchShopifyAll, fetchShopifyCollection, parseBodyDates, type ShopifyProduct } from './_shopify.js';
import { listEvents, type ListEvent } from './_listgroup.js';
import { representativePrice, type OfferRow } from './_offers.js';
import { lookupByUrl } from './_product-search.js';
import { botCanFetch } from './_pace.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any>;

// 巡回する作品（works.name と同じ表記）。ヒカルの碁は盛り上がっているので足した（柴野・2026-10-02）
const FIXED_WORKS = ['葬送のフリーレン', '呪術廻戦', 'ハイキュー!!', '進撃の巨人', '鬼滅の刃', '僕のヒーローアカデミア', 'ちいかわ', 'ブルーロック', '名探偵コナン', 'ヒカルの碁',
  // 作品の追加依頼が来たので足した（柴野・2026-11-01）
  'プロジェクトセカイ カラフルステージ! feat. 初音ミク', 'あんさんぶるスターズ!!'];
// 店の検索に使う語が作品名と違うもの。正式名のままだと長すぎて、商品名の短い表記に当たらない
const SEARCH_WORDS: Record<string, string> = {
  'プロジェクトセカイ カラフルステージ! feat. 初音ミク': 'プロジェクトセカイ',
  'あんさんぶるスターズ!!': 'あんさんぶるスターズ',
};

interface Source {
  key: string; work: string;
  /** 読む一覧のURL（投稿画面と同じ fetchProductList で読む） */
  urls?: () => Promise<string[]>;
  /** URLでは読めない一覧（ジャンプショップの新着など）を直接返す。first=この場所を初めて見る回 */
  lists?: (first: boolean) => Promise<ProductList[]>;
  /** 店全体が1作品の公式ストア。商品名で絞らず、買えるものを入れる（古さの下限は OLDEST_RELEASE） */
  wholeShop?: boolean;
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

// ブラスタの公式ストア（Shopify）。受付期間・発売日は商品の説明文にしか無いので、そこから読む（作品の追加依頼から・2026-11-01）
// 説明文に発売日も発送時期も無い在庫品は、店に出した日を発売日にする
const BLACKSTAR_ORIGIN = 'https://bsofficialstore.com';
const BLACKSTAR_STORE: Source = {
  key: 'bsofficialstore', work: 'ブラックスター -Theater Starless-', wholeShop: true,
  lists: async () => {
    // 登録済みの商品の在庫も見るので、毎回全商品を読む（syncShopStock）
    const got = await fetchShopifyAll(BLACKSTAR_ORIGIN);
    if (!got) return [];
    return [{ title: '', shop: got.shop, retailer: got.shop, nextPage: null, products: got.products.map(withBodyDates) }];
  },
};

/** 説明文の日付を商品に入れる。受付中なら「予約受付中」にして、予定の締切に出す */
function withBodyDates(p: ShopifyProduct): ShopifyProduct & { preorderEnd?: string } {
  const { preorderEnd, release, releaseLabel } = parseBodyDates(p.body ?? '', todayJst(), p.publishedAt);
  const date = release ?? (preorderEnd ? undefined : p.publishedAt);
  return {
    ...p,
    // 【通常版Blu-ray】【ZAKURO Ver.】のような版の違いは、頭の【】だと予定の名前から落ちて同じ名前が並ぶので、後ろに回す
    title: p.title.replace(/^【([^】]*(?:版|盤|Blu-ray|DVD|Ver\.)[^】]*)】\s*(.+)$/, '$2（$1）'),
    ...(date ? { release: { date, dateLabel: releaseLabel ?? null } } : {}),
    ...(preorderEnd ? { preorderEnd, ...(p.inStock ? { stockLabel: '予約受付中' } : {}) } : {}),
  };
}

const searchSources = (w: string): Source[] => [
  // アニメイトは登録の新しい順（sort=5）、ムービックは新着順（seq=nd）
  { key: `animate:${w}`, work: w, urls: async () => [`https://www.animate-onlineshop.jp/products/list.php?smt=${encodeURIComponent(SEARCH_WORDS[w] ?? w)}&sort=5`] },
  { key: `movic:${w}`, work: w, urls: async () => [`https://www.movic.jp/shop/goods/search.aspx?search=x&keyword=${encodeURIComponent(SEARCH_WORDS[w] ?? w)}&seq=nd`] },
];

/** 巡回先の一覧 */
function listSources(): Source[] {
  return [CHIIKAWA_MARKET, ...FIXED_WORKS.flatMap(searchSources), JUMP_SHOP_SOURCE, BLACKSTAR_STORE];
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

// 巡回で予定にする発売日の下限（柴野・2026-11-01）。店に在庫が残っていても、これより前の商品は入れない
const OLDEST_RELEASE = '2025-01-01';

/** 公式ストアの全商品から、買えるもののうち下限より新しいか受付中のものだけ残す。何年も前の在庫品を予定にしない */
function recentInStore(list: ProductList): ProductList {
  return { ...list, products: list.products.filter((p) => p.inStock !== false && (p.release ? p.release.date >= OLDEST_RELEASE : /予約|受付前/.test(p.stockLabel ?? ''))) };
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
  const firstTime = new Set(picks.filter((p) => !seen[p.key]).map((p) => p.key));
  for (const p of picks) seen[p.key] = now;
  // 巡回先から外れた作品の記録は残さない
  const keys = new Set(sources.map((x) => x.key));
  for (const k of Object.keys(seen)) if (!keys.has(k)) delete seen[k];
  await db.from('bot_state').upsert({ key: 'crawl', value: { seen }, updated_at: now });

  const results = [];
  for (const src of picks) results.push(src === JUMP_SHOP_SOURCE ? await crawlJumpShop(db, authorId, 'daily') : await crawlSource(db, src, authorId, firstTime.has(src.key)));
  return { sources: picks.map((p) => p.key), added: results.reduce((n, r) => n + r.added, 0), merged: results.reduce((n, r) => n + r.merged, 0), read: results.reduce((n, r) => n + r.read, 0) };
}

/** 公式ストアの全商品を読んだ回に、登録済みの予定の在庫を店に合わせる。店から消えた商品は売り切れにする */
async function syncShopStock(db: Db, wid: string, products: ProductList['products']): Promise<void> {
  if (!products.length) return;
  const host = new URL(products[0].url).host;
  const stock = new Map(products.map((p) => [productKey(p.url), p]));
  const { data } = await db.from('events').select('id, offers').eq('work_id', wid).eq('pool', 0).limit(1000);
  for (const row of data ?? []) {
    let changed = false;
    const offers = ((Array.isArray(row.offers) ? row.offers : []) as OfferRow[]).map((o) => {
      if (!o.url.includes(host)) return o;
      const inStock = stock.get(productKey(o.url))?.inStock !== false && stock.has(productKey(o.url));
      if (o.inStock === inStock) return o;
      changed = true;
      return { ...o, inStock };
    });
    if (changed) await db.from('events').update({ offers }).eq('id', row.id);
  }
}

async function crawlSource(db: Db, src: Source, authorId: string, first = false): Promise<{ added: number; merged: number; read: number }> {
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
  lists.push(...((await src.lists?.(first).catch(() => [])) ?? []));
  for (const got of lists) {
    read += got.products.length;
    if (src.wholeShop) await syncShopStock(db, wid, got.products);
    const mine = src.key === CHIIKAWA_MARKET.key || src.wholeShop ? got : await onlyThisWork(db, got, wid, src.work);
    const buyable = src.wholeShop ? recentInStore(mine) : upcoming(mine);
    const { list } = await excludeRegistered(buyable).catch(() => ({ list: buyable }));
    if (!list.products.length) continue;
    const preStart = preorderFromTitle(got.title);
    // ちいかわマーケットの新商品は発売日の11時に販売開始。データのどこにも時刻が無い（告知にだけ出る）ので決め打ちする
    const saleTime = src.key === CHIIKAWA_MARKET.key && !preStart ? '11:00' : null;
    // 公式ストアを初めて読む回は、昔からある在庫品が新着に並ばないよう登録日を60日前にする（ジャンプショップと同じ）
    const backdate = src.wholeShop && first
      ? (e: ListEvent) => {
        if (e.isOrderMade) return null;
        const monthAgo = new Date(Date.now() + 9 * 3600_000 - 30 * 86400_000).toISOString().slice(0, 10);
        return !e.date ? new Date(Date.now() - 60 * 86400_000).toISOString() : e.date < monthAgo ? `${e.date}T00:00:00+09:00` : null;
      }
      : undefined;
    const r = await registerEvents(db, wid, await listEvents(list, src.work), rows, authorId, preStart, saleTime, backdate);
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

/** 同じシリーズの予定（2026-10-04 柴野「重複は絶対に避けたい」）。新しい予定にせず、購入リンクを足す先。
 *  - 同じ店: 名前・発売日・値段が同じで、どちらかがキャラ別のリンク（label）を持つもの。キャラ違いがお店に後から追加されるたびに
 *    同じ名前の予定が増えていた（ブルーロック withCAT ステッカーセットが5件など）。一覧のまとめ（_listgroup.ts）が
 *    全キャラでは成り立たずに分けたまとまりも、名前が同じになって区別できないので1つにする（18TRIP 硬質カードホルダーが6件）
 *  - 別の店: 名前が同じで、発売日が7日以内・値段が同じ（片方が無いのも可）。店によって発売日が数日ずれる
 *    （アニメイト 12/15・ムービック 12/18）と findSame（発売日まで同じ）をすり抜けていた。
 *    「名探偵コナン アクリルスタンド」のような短い名前は別のシリーズのことがあるので、作品名を除いて10文字以上のときだけ
 *  名前が同じでも、同じ店でキャラ名の無い商品どうし（ジャンプショップのキャラ別商品など）は別の予定のまま。書籍は巻・版を取り違えないよう見ない */
async function findSameLine(db: Db, wid: string, workName: string | null, e: ListEvent): Promise<{ id: string; offers: OfferRow[]; price: number | null } | null> {
  if (!e.date || e.categories.includes('書籍')) return null;
  const k = sameKey(e.title);
  const core = workName ? k.split(sameKey(workName)).join('') : k;
  if (k.length < 6) return null;
  const day = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);
  const { data } = await db.from('events').select('id, title, event_date, offers, price')
    .eq('work_id', wid).eq('pool', 0).gte('event_date', day(e.date, -7)).lte('event_date', day(e.date, 7)).limit(500);
  const mine = e.offers as OfferRow[];
  const shops = new Set(mine.map((o) => o.retailer ?? ''));
  const labeled = (offers: OfferRow[]) => offers.some((o) => !!(o as { label?: string }).label);
  for (const row of data ?? []) {
    if (sameKey(String(row.title ?? '')) !== k) continue;
    const offers = (Array.isArray(row.offers) ? row.offers : []) as OfferRow[];
    const target = { id: row.id as string, offers, price: (row.price as number | null) ?? null };
    if (offers.some((o) => shops.has(o.retailer ?? ''))) {
      if (row.event_date === e.date && (labeled(offers) || labeled(mine)) && (e.price == null || target.price == null || e.price === target.price)) return target;
      continue;
    }
    if (core.length >= 10 && (e.price == null || target.price == null || e.price === target.price)) return target;
  }
  return null;
}

/** 同じ作品・同じ名前・同じ発売日の予定のうち、同じ商品ページ（productKey）を持つもの */
async function findTwin(db: Db, wid: string, e: ListEvent): Promise<{ id: string; title: string; event_date: string | null; offers: OfferRow[]; price: number | null } | null> {
  const keys = new Set((e.offers as OfferRow[]).map((o) => productKey(o.url)));
  if (!keys.size) return null;
  let q = db.from('events').select('id, title, event_date, offers, price').eq('work_id', wid).eq('pool', 0).eq('title', e.title);
  q = e.date ? q.eq('event_date', e.date) : q.is('event_date', null);
  const { data } = await q.limit(20);
  for (const row of data ?? []) {
    const offers = (Array.isArray(row.offers) ? row.offers : []) as OfferRow[];
    if (offers.some((o) => keys.has(productKey(o.url)))) {
      return { id: row.id as string, title: row.title as string, event_date: (row.event_date as string | null) ?? null, offers, price: (row.price as number | null) ?? null };
    }
  }
  return null;
}

/** 予定を入れる。**同じ商品が別の予定として二重に入らないようにする**（柴野の要望・2026-09-28）:
 *  1. 購入リンクごとに JANコードを取り、同じ JANコードの予定がもうあれば、そこに購入リンクを足す（店・作品を問わない）
 *  2. JANコードが取れないときは、名前・発売日・値段が同じ別の店の予定（findSame）に足す
 *  createdAt を返す関数を渡すと、その日時を登録日にする（古い在庫品を新着に出さないため） */
export async function registerEvents(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Db, wid: string, events: ListEvent[], rows: any[], authorId: string, preStart: string | null, saleTime: string | null,
  createdAt?: (e: ListEvent) => string | null, keepOld = false,
): Promise<{ added: number; merged: number }> {
  let added = 0, merged = 0;
  // 同じシリーズの予定を探すとき、名前から作品名を除いた長さを見る（findSameLine）
  const { data: work } = await db.from('works').select('name').eq('id', wid).maybeSingle();
  const workName = (work?.name as string | undefined) ?? null;
  const addTo = async (target: { id: string; offers: OfferRow[]; price: number | null }, more: OfferRow[]) => {
    const urls = new Set(target.offers.map((o) => o.url));
    const add = more.filter((o) => !urls.has(o.url));
    if (!add.length) return;
    const next = [...target.offers, ...add];
    const { error } = await db.from('events').update({ offers: next, price: representativePrice(next, target.price, false) }).eq('id', target.id);
    if (!error) { target.offers = next; merged++; }
  };
  for (const e of events) {
    // 巡回では古い商品を予定にしない
    if (!keepOld && e.date && e.date < OLDEST_RELEASE && !e.isOrderMade && !preStart) continue;
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
    // 最後の歯止め: 同じ作品・同じ名前・同じ発売日で、同じ商品ページを持つ予定がもう DB にあれば作らない（購入リンクだけ足す）。
    // 上の判定は渡された rows（1000件で切れることがある）と、登録済みリンクの一覧に頼っていて、どちらかが漏れると二重に入っていた
    // （2026-10-04 ちいかわ9巻の特装版が5件）。名前が同じでも商品ページが違うもの（キャラ別の商品など）は別の予定のまま
    const twin = await findTwin(db, wid, e) ?? await findSameLine(db, wid, workName, e);
    if (twin) { await addTo(twin, e.offers as OfferRow[]); rows.push(twin); continue; }
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

// 店の作品一覧には「劇場版『ゾンビランドサガ ゆめぎんがパラダイス』」「劇団「忍たま乱太郎」長屋物語」のような、
// 作品ではなく映画・舞台1本の名前が並ぶ。そのまま作ると元の作品と別の作品になる（10-02 のチェンソーマン、10-08 のゾンビランドサガ・忍たま乱太郎）
const STAGE_PREFIX = /^(?:劇場版|映画|劇団|舞台|ミュージカル)\s*/;
const ANIME_PREFIX = /^(?:TVアニメ|テレビアニメ|アニメ)\s*/;

/** 作品を探す名前の候補（長い順）と、どれも無いときに作る名前。
 *  かっこの中を作品名とみなし、末尾の語（副題）を1つずつ外して既存の作品に当てる。
 *  映画・舞台の名前で既存の作品が無いときは、最初の語（「ゾンビランドサガ」）で作る。
 *  英字だけの語（「劇場版 ONE PIECE FILM RED」の ONE）は作品名の一部のことが多いので、そのときは丸ごと */
export function workNameCandidates(name: string): { tries: string[]; create: string } {
  const t = name.trim();
  const stage = STAGE_PREFIX.test(t);
  const inner = t.match(/[『「]([^』」]+)[』」]/)?.[1]?.trim();
  if (!stage && !ANIME_PREFIX.test(t) && !inner) return { tries: [t], create: t };
  const core = inner || t.replace(STAGE_PREFIX, '').replace(ANIME_PREFIX, '').trim();
  const words = core.split(/\s+/);
  const tries = [t, ...words.map((_, i) => words.slice(0, words.length - i).join(' '))];
  return { tries: [...new Set(tries)], create: stage && /[^\x00-\x7f]/.test(words[0]) ? words[0] : core };
}

async function findWorkId(db: Db, name: string): Promise<string | null> {
  const k = workKey(name);
  if (k.length < 2) return null;
  const { data: works } = await db.from('works').select('id, name').ilike('name', `%${name.slice(0, 2)}%`).limit(200);
  const hit = (works ?? []).find((w) => workKey(String(w.name)) === k);
  if (hit) return hit.id as string;
  const { data: al } = await db.from('work_aliases').select('work_id').eq('alias_norm', k).limit(1).maybeSingle();
  return (al?.work_id as string | undefined) ?? null;
}

/** 作品のIDを返す。名前か別名が同じ作品があればそれ、無ければ作る */
export async function resolveWork(db: Db, rawName: string): Promise<string | null> {
  const { tries, create: name } = workNameCandidates(rawName);
  for (const n of tries) {
    const id = await findWorkId(db, n);
    if (id) return id;
  }
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

// 決まった店の一覧を運営側で巡回して、新しいグッズを予定として登録する（本人要望・2026-09-27）。
// 投稿画面で一覧を貼ったときと同じ処理（_listsource.ts → _listgroup.ts）を通し、運営アカウント
// （staff.role = 'bot'）の投稿として入れる。普通の投稿と同じ扱い（新着の通知にも入る）。
// 直すのは運営の各自（staff.role = 'admin'）が詳細ページから行う。
//
// 1回に1つの巡回先だけ読む（前回の続きを bot_state に持つ）。10分おきに呼ばれるので、17か所を3時間弱で一周する。
import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchProductList, excludeRegistered, type ProductList } from './_listsource.js';
import { listEvents, type ListEvent } from './_listgroup.js';
import { scoreTitle } from './_product-search.js';
import { representativePrice, type OfferRow } from './_offers.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any>;

// 巡回する作品（works.name と同じ表記）。アニメイトは登録の新しい順（sort=5）、ムービックは新着順（seq=nd）
const WORKS = ['葬送のフリーレン', '呪術廻戦', 'ハイキュー!!', '進撃の巨人', '鬼滅の刃', '僕のヒーローアカデミア', 'ちいかわ', 'ブルーロック'];

interface Source { key: string; work: string; urls: () => Promise<string[]> }

const todayJst = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);

const SOURCES: Source[] = [
  // ちいかわマーケットは発売日ごとのコレクション（「20261009」「pre20261003」＝10月3日予約商品）。今日以降のものを全部
  {
    key: 'chiikawamarket', work: 'ちいかわ',
    urls: async () => {
      const r = await fetch('https://chiikawamarket.jp/collections.json?limit=250', { headers: { Cookie: 'localization=JP; cart_currency=JPY' }, signal: AbortSignal.timeout(10000) }).catch(() => null);
      const cols = ((await r?.json().catch(() => null)) as { collections?: { handle: string }[] } | null)?.collections ?? [];
      const today = todayJst().replace(/-/g, '');
      return cols.map((c) => c.handle).filter((h) => { const d = h.match(/^(?:pre)?(\d{8})$/)?.[1]; return !!d && d >= today; })
        .map((h) => `https://chiikawamarket.jp/collections/${h}`);
    },
  },
  ...WORKS.map((w): Source => ({ key: `animate:${w}`, work: w, urls: async () => [`https://www.animate-onlineshop.jp/products/list.php?smt=${encodeURIComponent(w)}&sort=5`] })),
  ...WORKS.map((w): Source => ({ key: `movic:${w}`, work: w, urls: async () => [`https://www.movic.jp/shop/goods/search.aspx?search=x&keyword=${encodeURIComponent(w)}&seq=nd`] })),
];

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

/** 別の店で同じ商品がもう登録されていれば（アニメイトとムービックの両方にある等）、その予定を返す。
 *  同じ作品・発売日が31日以内・名前がほぼ同じ（0.8以上）のもの */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function findSame(existing: any[], e: ListEvent): any | null {
  for (const row of existing) {
    if (e.date && row.event_date && Math.abs(Date.parse(e.date) - Date.parse(row.event_date)) > 31 * 86400_000) continue;
    if (scoreTitle(e.title, row.title) >= 0.8 && scoreTitle(row.title, e.title) >= 0.8) return row;
  }
  return null;
}

/** 巡回を1か所ぶん進める。登録した件数・別の店のリンクとして足した件数を返す */
export async function crawlNext(db: Db): Promise<{ source: string | null; added: number; merged: number; read: number; skipped?: string }> {
  const { data: bot } = await db.from('staff').select('user_id').eq('role', 'bot').limit(1).maybeSingle();
  if (!bot?.user_id) return { source: null, added: 0, merged: 0, read: 0, skipped: '運営アカウント（staff.role=bot）が無い' };
  const authorId = bot.user_id as string;

  const { data: st } = await db.from('bot_state').select('value').eq('key', 'crawl').maybeSingle();
  const next = (((st?.value ?? {}) as { next?: number }).next ?? 0) % SOURCES.length;
  const src = SOURCES[next];
  await db.from('bot_state').upsert({ key: 'crawl', value: { next: next + 1, last: src.key }, updated_at: new Date().toISOString() });

  const wid = await workId(db, src.work);
  if (!wid) return { source: src.key, added: 0, merged: 0, read: 0, skipped: `作品「${src.work}」が無い` };
  const { data: existing } = await db.from('events').select('id, title, event_date, offers, price')
    .eq('work_id', wid).eq('type', 'goods').eq('pool', 0).gte('event_date', new Date(Date.now() - 90 * 86400_000).toISOString().slice(0, 10));
  const rows = existing ?? [];

  let added = 0, merged = 0, read = 0;
  for (const url of await src.urls()) {
    const got = await fetchProductList(url).catch(() => null);
    if (!got) continue;
    read += got.products.length;
    const { list } = await excludeRegistered(upcoming(got)).catch(() => ({ list: upcoming(got) }));
    if (!list.products.length) continue;
    const preStart = preorderFromTitle(got.title);
    for (const e of await listEvents(list, src.work)) {
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
        category: e.categories.length > 1 ? JSON.stringify(e.categories) : e.categories[0] ?? null,
        image_url: e.imageUrl, offers: e.offers, price: e.price,
        link_url: first?.url ?? null, retailer: first?.retailer ?? null, has_affiliate: false,
        is_order_made: isOrderMade,
        preorder_start_date: isOrderMade ? (e.preorderStart ?? preStart) : null,
        preorder_end_date: isOrderMade ? (e.preorderEnd ?? null) : null,
        author_id: authorId, pool: 0,
      };
      const { data, error } = await db.from('events').insert(row).select('id, title, event_date, offers, price').single();
      if (!error && data) { rows.push(data); added++; }
    }
  }
  return { source: src.key, added, merged, read };
}

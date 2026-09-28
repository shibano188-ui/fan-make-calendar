// 店の全作品を回って、今売っている商品を全部登録する（柴野の要望・2026-09-28）。
// 店ごとに「作品一覧 → 作品ページ → 商品」を、店に負担をかけないペースで何日もかけて回る。
// 回り終えたら、その店の新着だけを1日1回見る。
//
// 1回の実行（10分おきの task=bot）で進めるのは budgetMs まで。途中の作品・ページは bot_state（key='catalog:<店>'）に持つ。
// 同じページを読み直しても、登録済みの商品（URL）は外すので二重にならない。店をまたいだ二重登録は
// registerEvents（_crawl.ts）が JANコードで防ぐ。
//
// 最初の全件登録で入れる何年も前の在庫品は、登録日を発売日にそろえて新着・新着の通知に出さない（ジャンプショップと同じ）。
import type { SupabaseClient } from '@supabase/supabase-js';
import { excludeRegistered, type ListProduct, type ProductList } from './_listsource.js';
import { listEvents, detectWork, type ListEvent } from './_listgroup.js';
import { parseMovicList, lookupByUrl } from './_product-search.js';
import { registerEvents, resolveWork } from './_crawl.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any>;

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36';
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** 同じ店へのアクセスどうしの間隔。制限の書かれていない店でも、続けざまに読まない */
const GAP_MS = 1500;

async function getHtml(url: string): Promise<string | null> {
  await delay(GAP_MS);
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'ja' }, signal: AbortSignal.timeout(30000) });
    return r.ok ? await r.text() : null;
  } catch { return null; }
}

interface CatalogState {
  phase: 'initial' | 'daily';
  works?: { url: string; name: string }[];
  i?: number;          // 今の作品
  page?: number;       // 今の作品のページ
  wid?: string | null; // 今の作品の works.id（作品ページの見出しから決めたもの）
  workName?: string;   // 今の作品の名前
  dailyAt?: string;    // 新着を最後に見た時刻
}

const monthAgo = () => new Date(Date.now() + 9 * 3600_000 - 30 * 86400_000).toISOString().slice(0, 10);
/** 最初の全件登録での登録日。発売から1か月より前・日付の無い在庫品は過去にする */
const backdate = (e: ListEvent) => (!e.date ? new Date(Date.now() - 60 * 86400_000).toISOString() : e.date < monthAgo() ? `${e.date}T00:00:00+09:00` : null);

// ── ムービック ─────────────────────────
// 作品一覧: /shop/pages/search_title.aspx（約440作品。名前は略称のことがある）
// 作品ページ: /shop/r/r705005_snd/ → 2ページ目 /shop/r/r705005_snd_p2/（新着順・50件ずつ）。見出しに正式な作品名
// 新着: /shop/e/enew_snd/
const MOVIC = 'https://www.movic.jp';

async function movicWorks(): Promise<{ url: string; name: string }[]> {
  const html = await getHtml(`${MOVIC}/shop/pages/search_title.aspx`);
  if (!html) return [];
  const seen = new Map<string, string>();
  for (const m of html.matchAll(/<a[^>]+href="(?:https:\/\/www\.movic\.jp)?(\/shop\/r\/r[^"/]+\/)"[^>]*>([^<]{1,60})<\/a>/g)) {
    if (!seen.has(m[1])) seen.set(m[1], m[2].trim());
  }
  return [...seen].map(([url, name]) => ({ url, name }));
}

/** 作品ページの見出しから正式な作品名（「アイドリッシュセブン グッズ ｜ムービック」「…/モノノ怪(並び順：新着順)｜…」） */
function movicWorkName(html: string, fallback: string): string {
  const t = (html.match(/<title>([^<]*)<\/title>/)?.[1] ?? '').split('｜')[0].replace(/\(並び順[^)]*\)/, '');
  const last = t.split('/').pop()?.replace(/\s*グッズ\s*$/, '').trim();
  return last || fallback;
}

/** 商品ページで発売日・在庫・JANコードを取る（一覧には無い）。time が尽きたら残りは次の回 */
async function lookupMovicItems(items: ListProduct[], until: number): Promise<{ done: ListProduct[]; left: number }> {
  const done: ListProduct[] = [];
  for (const p of items) {
    if (Date.now() > until) break;
    await delay(GAP_MS);
    const hit = await lookupByUrl(p.url).catch(() => null);
    if (hit?.release) p.release = hit.release;
    if (hit?.inStock !== undefined) p.inStock = hit.inStock;
    if (hit?.stockLabel) p.stockLabel = hit.stockLabel;
    if (hit?.jan) p.jan = hit.jan;
    done.push(p);
  }
  return { done, left: items.length - done.length };
}

const toList = (items: ReturnType<typeof parseMovicList>): ListProduct[] =>
  items.map((c) => ({ title: c.title, url: c.url, price: c.price, inStock: c.inStock, image: c.image, images: c.image ? [c.image] : [] }));

async function crawlMovic(db: Db, authorId: string, budgetMs: number): Promise<{ added: number; merged: number; read: number; note: string }> {
  const until = Date.now() + budgetMs;
  const { data: st } = await db.from('bot_state').select('value').eq('key', 'catalog:movic').maybeSingle();
  const s: CatalogState = { phase: 'initial', ...((st?.value ?? {}) as Partial<CatalogState>) };
  const save = () => db.from('bot_state').upsert({ key: 'catalog:movic', value: s, updated_at: new Date().toISOString() });
  let added = 0, merged = 0, read = 0;

  if (s.phase === 'daily') {
    // 新着は1日1回。作品は、登録済みの作品名で商品名から見分ける（見分けられない商品は入れない）
    if (s.dailyAt && Date.now() - Date.parse(s.dailyAt) < 24 * 3600_000) return { added, merged, read, note: '今日の新着は済んでいる' };
    const html = await getHtml(`${MOVIC}/shop/e/enew_snd/`);
    const items = html ? toList(parseMovicList(html)).filter((p) => p.inStock !== false) : [];
    read = items.length;
    const { list } = await excludeRegistered({ title: 'ムービック 新着', shop: 'ムービック', retailer: 'ムービック', products: items, nextPage: null });
    const { done } = await lookupMovicItems(list.products, until);
    const byWork = new Map<string, ListProduct[]>();
    for (const p of done) {
      const w = await detectWork([p.title], '').catch(() => null);
      if (w) byWork.set(w, [...(byWork.get(w) ?? []), p]);
    }
    for (const [w, ps] of byWork) {
      const wid = await resolveWork(db, w);
      if (!wid) continue;
      const r = await registerEvents(db, wid, await listEvents({ title: w, shop: 'ムービック', retailer: 'ムービック', products: ps, nextPage: null }, w), [], authorId, null, null);
      added += r.added; merged += r.merged;
    }
    s.dailyAt = new Date().toISOString();
    await save();
    return { added, merged, read, note: '新着' };
  }

  if (!s.works?.length) { s.works = await movicWorks(); s.i = 0; s.page = 1; s.wid = null; }
  if (!s.works.length) return { added, merged, read, note: '作品一覧が読めない' };

  while (Date.now() < until && (s.i ?? 0) < s.works.length) {
    const w = s.works[s.i ?? 0];
    const page = s.page ?? 1;
    const html = await getHtml(page > 1 ? `${MOVIC}${w.url.replace(/\/$/, `_p${page}/`)}` : `${MOVIC}${w.url}`);
    if (!html) { s.i = (s.i ?? 0) + 1; s.page = 1; s.wid = null; s.workName = undefined; continue; } // 読めない作品は飛ばす
    const items = toList(parseMovicList(html)).filter((p) => p.inStock !== false);
    read += items.length;
    if (!s.wid) {
      // 作品名: 登録済みの作品名が商品名に入っていればそれ、無ければ作品ページの見出しの名前で作る
      const name = (await detectWork(items.map((p) => p.title), '').catch(() => null)) ?? movicWorkName(html, w.name);
      s.wid = await resolveWork(db, name);
      s.workName = name;
    }
    const workName = s.workName ?? w.name;
    const { list } = await excludeRegistered({ title: workName, shop: 'ムービック', retailer: 'ムービック', products: items, nextPage: null });
    const { done, left } = await lookupMovicItems(list.products, until);
    if (s.wid && done.length) {
      // JANコードが取れなかった商品は、名前・発売日・値段が同じ別の店の予定で見分ける（その作品の既存の予定を渡す）
      const { data: existing } = await db.from('events').select('id, title, event_date, offers, price').eq('work_id', s.wid).eq('type', 'goods').eq('pool', 0);
      const r = await registerEvents(db, s.wid, await listEvents({ title: workName, shop: 'ムービック', retailer: 'ムービック', products: done, nextPage: null }, workName), existing ?? [], authorId, null, null, backdate);
      added += r.added; merged += r.merged;
    }
    if (left) break; // このページの残りは次の回（読み直しても登録済みは外れる）
    if (html.includes(`${w.url.replace(/\/$/, '')}_p${page + 1}/`)) s.page = page + 1;
    else { s.i = (s.i ?? 0) + 1; s.page = 1; s.wid = null; s.workName = undefined; }
  }
  if ((s.i ?? 0) >= s.works.length) { s.phase = 'daily'; s.works = []; }
  await save();
  return { added, merged, read, note: `作品 ${s.i ?? 0}/${s.works?.length || '済'}` };
}

/** 店の全作品の巡回を、1回ぶん進める。今はムービック。KADOKAWA・コトブキヤ・ホロライブ・アニメイトはここに足す */
export async function crawlCatalogs(db: Db, budgetMs: number): Promise<Record<string, unknown>> {
  const { data: bot } = await db.from('staff').select('user_id').eq('role', 'bot').limit(1).maybeSingle();
  if (!bot?.user_id || budgetMs < 5000) return { skipped: true };
  const movic = await crawlMovic(db, bot.user_id as string, budgetMs).catch((e) => ({ error: String(e) }));
  return { movic };
}

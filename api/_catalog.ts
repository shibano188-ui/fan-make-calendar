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
import { parseMovicList, lookupByUrl, parseReleaseText } from './_product-search.js';
import { registerEvents, resolveWork, workKey } from './_crawl.js';

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

// ── 作品名の辞書（作品の分類が無い店・新着で、商品名から作品を見分ける） ──
// 登録済みの作品名と別名。1回の実行で1度だけ作る（detectWork は呼ぶたびに全作品を読むので、商品ごとには使わない）。
// 3文字未満の名前は外す（「A3!」などが関係ない商品名に当たらないように）。一番長く一致したものにする
type WorkDict = { key: string; name: string }[];
let dictCache: { at: number; dict: WorkDict } | null = null;
async function workDict(db: Db): Promise<WorkDict> {
  if (dictCache && Date.now() - dictCache.at < 5 * 60_000) return dictCache.dict;
  const out: WorkDict = [];
  for (let from = 0; from < 20000; from += 1000) {
    const { data } = await db.from('works').select('name').range(from, from + 999);
    for (const w of data ?? []) out.push({ key: workKey(String(w.name)), name: String(w.name) });
    if ((data ?? []).length < 1000) break;
  }
  const { data: al } = await db.from('work_aliases').select('alias_norm, works(name)').limit(10000);
  for (const a of al ?? []) {
    const name = (a.works as { name?: string } | null)?.name;
    if (name) out.push({ key: workKey(String(a.alias_norm)), name });
  }
  const dict = out.filter((d) => d.key.length >= 3).sort((a, b) => b.key.length - a.key.length);
  dictCache = { at: Date.now(), dict };
  return dict;
}
const matchWork = (title: string, dict: WorkDict) => { const k = workKey(title); return dict.find((d) => k.includes(d.key))?.name ?? null; };

/** 作品ごとに分けて登録する（作品の分類が無い店・新着用）。見分けられない商品は入れない */
async function registerByTitle(
  db: Db, authorId: string, shop: string, items: ListProduct[], created?: (e: ListEvent) => string | null,
): Promise<{ added: number; merged: number }> {
  const dict = await workDict(db);
  const byWork = new Map<string, ListProduct[]>();
  for (const p of items) {
    const w = matchWork(p.title, dict);
    if (w) byWork.set(w, [...(byWork.get(w) ?? []), p]);
  }
  let added = 0, merged = 0;
  for (const [w, ps] of byWork) {
    const wid = await resolveWork(db, w);
    if (!wid) continue;
    const { list } = await excludeRegistered({ title: w, shop, retailer: shop, products: ps, nextPage: null });
    if (!list.products.length) continue;
    const { data: existing } = await db.from('events').select('id, title, event_date, offers, price').eq('work_id', wid).eq('type', 'goods').eq('pool', 0);
    const r = await registerEvents(db, wid, await listEvents(list, w), existing ?? [], authorId, null, null, created);
    added += r.added; merged += r.merged;
  }
  return { added, merged };
}

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
    const r = await registerByTitle(db, authorId, 'ムービック', done);
    added += r.added; merged += r.merged;
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

// ── KADOKAWAストア ─────────────────────────
// 作品一覧は無い（代表的なシリーズだけ）ので、グッズの分類ごとの一覧（新しい順・12件ずつ）を全部読み、作品は商品名で見分ける。
// 一覧に値段・在庫・発売日があり、商品URLにJANコードが入っている（/shop/g/g4984995910659/）ので、商品ページは読まない。
// 分類: c22 フィギュア・プラモデル / c23 グッズ・文具 / c24 ファッション / c25 その他グッズ（本・映像・ゲームは読まない）
const KADOKAWA = 'https://store.kadokawa.co.jp';
const KADOKAWA_CATS = ['c22', 'c23', 'c24', 'c25'];

export function parseKadokawaList(html: string): ListProduct[] {
  const out: ListProduct[] = [];
  for (const b of html.split('<dl class="block-thumbnail-t--goods').slice(1)) {
    const href = b.match(/href="(\/shop\/g\/g[^"/]+\/)"/)?.[1];
    const title = b.match(/title="([^"]+)"/)?.[1]?.replace(/&amp;/g, '&');
    const price = b.match(/goods-price">\s*([\d,]+)\s*</)?.[1];
    if (!href || !title || !price) continue;
    const stock = b.match(/class="stock">([^<]+)</)?.[1]?.trim() ?? '';
    const dateText = b.match(/goods-date">\s*([^<]+?)\s*</)?.[1] ?? '';
    const release = parseReleaseText(dateText);
    const img = b.match(/<img[^>]+src="([^"]+)"/)?.[1];
    const jan = href.match(/^\/shop\/g\/g(\d{13})\/$/)?.[1];
    const soldOut = /在庫無し|在庫なし|販売終了|品切|売切/.test(stock);
    out.push({
      title, url: `${KADOKAWA}${href}`, price: Number(price.replace(/,/g, '')),
      inStock: !soldOut,
      // 画面の状態を決める表記にそろえる（「在庫有り」→「在庫あり」。src/lib/affiliate.ts の stockHint）
      ...(stock ? { stockLabel: /在庫有/.test(stock) ? '在庫あり' : stock } : {}),
      ...(release ? { release } : {}),
      ...(jan ? { jan } : {}),
      image: img && !/sorry/i.test(img) ? new URL(img, KADOKAWA).toString() : '',
      images: img && !/sorry/i.test(img) ? [new URL(img, KADOKAWA).toString()] : [],
    });
  }
  return out;
}

interface KadokawaState { phase: 'initial' | 'daily'; ci?: number; page?: number; dailyAt?: string }

async function crawlKadokawa(db: Db, authorId: string, budgetMs: number): Promise<{ added: number; merged: number; read: number; note: string }> {
  const until = Date.now() + budgetMs;
  const { data: st } = await db.from('bot_state').select('value').eq('key', 'catalog:kadokawa').maybeSingle();
  const s: KadokawaState = { phase: 'initial', ci: 0, page: 1, ...((st?.value ?? {}) as Partial<KadokawaState>) };
  const save = () => db.from('bot_state').upsert({ key: 'catalog:kadokawa', value: s, updated_at: new Date().toISOString() });
  let added = 0, merged = 0, read = 0;
  const shop = 'KADOKAWAストア';
  const page = async (cat: string, p: number) => getHtml(p > 1 ? `${KADOKAWA}/shop/c/${cat}_p${p}/` : `${KADOKAWA}/shop/c/${cat}/`);

  if (s.phase === 'daily') {
    if (s.dailyAt && Date.now() - Date.parse(s.dailyAt) < 24 * 3600_000) return { added, merged, read, note: '今日の新着は済んでいる' };
    for (const cat of KADOKAWA_CATS) {
      for (const p of [1, 2]) {
        if (Date.now() > until) break;
        const html = await page(cat, p);
        const items = html ? parseKadokawaList(html).filter((x) => x.inStock !== false) : [];
        read += items.length;
        const r = await registerByTitle(db, authorId, shop, items);
        added += r.added; merged += r.merged;
      }
    }
    s.dailyAt = new Date().toISOString();
    await save();
    return { added, merged, read, note: '新着' };
  }

  while (Date.now() < until && (s.ci ?? 0) < KADOKAWA_CATS.length) {
    const cat = KADOKAWA_CATS[s.ci ?? 0];
    const p = s.page ?? 1;
    const html = await page(cat, p);
    if (!html) break; // 読めなければ次の回にやり直す
    const items = parseKadokawaList(html).filter((x) => x.inStock !== false);
    read += items.length;
    const r = await registerByTitle(db, authorId, shop, items, backdate);
    added += r.added; merged += r.merged;
    if (html.includes(`/shop/c/${cat}_p${p + 1}/`)) s.page = p + 1;
    else { s.ci = (s.ci ?? 0) + 1; s.page = 1; }
  }
  if ((s.ci ?? 0) >= KADOKAWA_CATS.length) { s.phase = 'daily'; s.ci = 0; s.page = 1; }
  await save();
  return { added, merged, read, note: `分類 ${s.ci}/${KADOKAWA_CATS.length} の ${s.page}ページ目` };
}

// ── コトブキヤ ─────────────────────────
// ページは Shift_JIS。分類の一覧（新しい順・30件ずつ）に商品名・値段・売り切れ（goods_nostock_）があり、商品URLにJANコード。
// 発売月と予約の締切（「2026/10/15までのご予約で確実にご用意！」）は商品ページにしか無いので、
// 売り切れ・登録済み・DBに無い作品の商品を先に外し、残りだけ商品ページを読む。
// 分類: c10 フィギュア / c20 プラモデル / c30 グッズ・雑貨
const KOTOBUKIYA = 'https://shop.kotobukiya.co.jp';
const KOTOBUKIYA_CATS = ['c10', 'c20', 'c30'];

async function getSjis(url: string): Promise<string | null> {
  await delay(GAP_MS);
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'ja' }, signal: AbortSignal.timeout(30000) });
    return r.ok ? new TextDecoder('shift_jis').decode(await r.arrayBuffer()) : null;
  } catch { return null; }
}

export function parseKotobukiyaList(html: string): ListProduct[] {
  const out: ListProduct[] = [];
  const seen = new Set<string>(); // ページの中に同じ一覧が3つある（表示の切り替え用）ので、同じ商品は1回だけ
  for (const b of html.split('<li class="tile_item').slice(1)) {
    const href = b.match(/href="(\/shop\/g\/g[^"/]+\/)"/)?.[1];
    const title = b.match(/title="([^"]+)"/)?.[1]?.replace(/&amp;/g, '&');
    const price = b.match(/amount_of_money">([\d,]+)</)?.[1];
    if (!href || !title || !price || seen.has(href)) continue;
    seen.add(href);
    const img = b.match(/data-original="([^"]+)"/)?.[1];
    const jan = href.match(/^\/shop\/g\/g(\d{13})\/$/)?.[1];
    out.push({
      title, url: `${KOTOBUKIYA}${href}`, price: Number(price.replace(/,/g, '')),
      inStock: !/goods_nostock/.test(b.slice(0, 80)),
      ...(jan ? { jan } : {}),
      image: img ? new URL(img, KOTOBUKIYA).toString() : '', images: img ? [new URL(img, KOTOBUKIYA).toString()] : [],
    });
  }
  return out;
}

/** 商品ページから発売月と予約の締切 */
async function kotobukiyaDetail(p: ListProduct): Promise<void> {
  const html = await getSjis(p.url);
  if (!html) return;
  const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  const rel = text.match(/発売月[：:]?\s*(\d{4}年\s*\d{1,2}月(?:\s*\d{1,2}日|上旬|中旬|下旬)?)/)?.[1];
  const r = rel ? parseReleaseText(rel) : null;
  if (r) p.release = r;
  const dl = text.match(/(\d{4})\/(\d{1,2})\/(\d{1,2})までのご予約/);
  if (dl) {
    const end = `${dl[1]}-${dl[2].padStart(2, '0')}-${dl[3].padStart(2, '0')}`;
    if (end >= new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10)) { p.preorderEnd = end; p.stockLabel = '予約受付中'; }
  }
}

interface KotobukiyaState { phase: 'initial' | 'daily'; ci?: number; page?: number; dailyAt?: string }

async function crawlKotobukiya(db: Db, authorId: string, budgetMs: number): Promise<{ added: number; merged: number; read: number; note: string }> {
  const until = Date.now() + budgetMs;
  const { data: st } = await db.from('bot_state').select('value').eq('key', 'catalog:kotobukiya').maybeSingle();
  const s: KotobukiyaState = { phase: 'initial', ci: 0, page: 1, ...((st?.value ?? {}) as Partial<KotobukiyaState>) };
  const save = () => db.from('bot_state').upsert({ key: 'catalog:kotobukiya', value: s, updated_at: new Date().toISOString() });
  const shop = 'コトブキヤ';
  const dict = await workDict(db);
  let added = 0, merged = 0, read = 0;

  // 1ページぶん: 売り切れ・DBに無い作品・登録済みを外してから、残りの商品ページを読んで登録。時間切れなら false
  const doPage = async (html: string, created?: (e: ListEvent) => string | null): Promise<boolean> => {
    const items = parseKotobukiyaList(html).filter((x) => x.inStock !== false && matchWork(x.title, dict));
    read += items.length;
    const { list } = await excludeRegistered({ title: shop, shop, retailer: shop, products: items, nextPage: null });
    const done: ListProduct[] = [];
    for (const p of list.products) {
      if (Date.now() > until) break;
      await kotobukiyaDetail(p);
      done.push(p);
    }
    const r = await registerByTitle(db, authorId, shop, done, created);
    added += r.added; merged += r.merged;
    return done.length === list.products.length;
  };

  if (s.phase === 'daily') {
    if (s.dailyAt && Date.now() - Date.parse(s.dailyAt) < 24 * 3600_000) return { added, merged, read, note: '今日の新着は済んでいる' };
    for (const cat of KOTOBUKIYA_CATS) {
      if (Date.now() > until) break;
      const html = await getSjis(`${KOTOBUKIYA}/shop/c/${cat}/`);
      if (html) await doPage(html);
    }
    s.dailyAt = new Date().toISOString();
    await save();
    return { added, merged, read, note: '新着' };
  }

  while (Date.now() < until && (s.ci ?? 0) < KOTOBUKIYA_CATS.length) {
    const cat = KOTOBUKIYA_CATS[s.ci ?? 0];
    const p = s.page ?? 1;
    const html = await getSjis(p > 1 ? `${KOTOBUKIYA}/shop/c/${cat}_p${p}/` : `${KOTOBUKIYA}/shop/c/${cat}/`);
    if (!html) break;
    const complete = await doPage(html, backdate);
    if (!complete) break; // このページの残りは次の回（登録済みは外れる）
    if (html.includes(`/shop/c/${cat}_p${p + 1}/`)) s.page = p + 1;
    else { s.ci = (s.ci ?? 0) + 1; s.page = 1; }
  }
  if ((s.ci ?? 0) >= KOTOBUKIYA_CATS.length) { s.phase = 'daily'; s.ci = 0; s.page = 1; }
  await save();
  return { added, merged, read, note: `分類 ${s.ci}/${KOTOBUKIYA_CATS.length} の ${s.page}ページ目` };
}

/** 店の全作品の巡回を、1回ぶん進める。今はムービック・KADOKAWAストア・コトブキヤ。アニメイトはここに足す */
export async function crawlCatalogs(db: Db, budgetMs: number): Promise<Record<string, unknown>> {
  const { data: bot } = await db.from('staff').select('user_id').eq('role', 'bot').limit(1).maybeSingle();
  if (!bot?.user_id || budgetMs < 5000) return { skipped: true };
  // 持ち時間は店どうしで等分
  const share = Math.floor(budgetMs / 3);
  const movic = await crawlMovic(db, bot.user_id as string, share).catch((e) => ({ error: String(e) }));
  const kadokawa = await crawlKadokawa(db, bot.user_id as string, share).catch((e) => ({ error: String(e) }));
  const kotobukiya = await crawlKotobukiya(db, bot.user_id as string, share).catch((e) => ({ error: String(e) }));
  return { movic, kadokawa, kotobukiya };
}

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
import { excludeRegistered, fetchProductList, type ListProduct, type ProductList } from './_listsource.js';
import { botCanFetch } from './_pace.js';
import { listEvents, detectWork, type ListEvent } from './_listgroup.js';
import { parseMovicList, lookupByUrl, parseReleaseText, searchByJan, stripShopNoise, type Candidate } from './_product-search.js';
import { registerEvents, resolveWork, followedWorkId, workKey } from './_crawl.js';

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
  dailyPage?: number;  // 新着の今のページ（止まっていた日数ぶん多めに読むとき、次の回に続きを読む）
  firstDone?: string[]; // 先に読む作品（MOVIC_FIRST）のうち、順番を前に移したもの
}

const monthAgo = () => new Date(Date.now() + 9 * 3600_000 - 30 * 86400_000).toISOString().slice(0, 10);
/** 最初の全件登録での登録日。発売から1か月より前・日付の無い在庫品は過去にする */
/** 前に新着を見てから何日ぶんたったか（1〜7）。毎日なら1。ボットが止まっていた日数ぶん新着を多めに読んで、
 *  そのあいだに一覧の後ろへ流れた商品を取りこぼさない（2026-11-22 柴野）。新着を見るのは24時間おきなので floor で数える */
const catchUpDays = (dailyAt?: string) => (!dailyAt ? 1 : Math.min(7, Math.max(1, Math.floor((Date.now() - Date.parse(dailyAt)) / 86400_000))));
const backdate = (e: ListEvent) => (!e.date ? new Date(Date.now() - 60 * 86400_000).toISOString() : e.date < monthAgo() ? `${e.date}T00:00:00+09:00` : null);

// ── 作品名の辞書（作品の分類が無い店・新着で、商品名から作品を見分ける） ──
// 登録済みの作品名と別名。1回の実行で1度だけ作る（detectWork は呼ぶたびに全作品を読むので、商品ごとには使わない）。
// 3文字未満の名前は外す（「A3!」などが関係ない商品名に当たらないように）。一番長く一致したものにする
// フォロワーが0の作品は入れない＝その作品の商品は商品ページを読まず、登録もしない（Vercel の無料枠の CPU を使い切ったため・2026-11-21）
type WorkDict = { key: string; name: string }[];
// 検索には使うが、商品名の見分けには使わない別名。長音を落として比べるので「ブラスタ」は「ブラスター」にも当たる
const LOOSE_ALIASES = new Set([workKey('ブラスタ')]);
let dictCache: { at: number; dict: WorkDict } | null = null;
async function workDict(db: Db): Promise<WorkDict> {
  if (dictCache && Date.now() - dictCache.at < 5 * 60_000) return dictCache.dict;
  const out: WorkDict = [];
  for (let from = 0; from < 20000; from += 1000) {
    const { data } = await db.from('works').select('name').gte('participant_count', 1).range(from, from + 999);
    for (const w of data ?? []) out.push({ key: workKey(String(w.name)), name: String(w.name) });
    if ((data ?? []).length < 1000) break;
  }
  // フォロワーのいる作品の別名だけ取る（!inner で絞る。全部取ると転送量が増える。Supabase の転送量の無料枠を超えたため・2026-11-22）
  const { data: al } = await db.from('work_aliases').select('alias_norm, works!inner(name, participant_count)').gte('works.participant_count', 1).limit(10000);
  for (const a of al ?? []) {
    const w = a.works as { name?: string; participant_count?: number } | null;
    const name = Number(w?.participant_count ?? 0) >= 1 ? w?.name : undefined;
    if (name && !LOOSE_ALIASES.has(workKey(String(a.alias_norm)))) out.push({ key: workKey(String(a.alias_norm)), name });
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
    const w = matchWork(p.workText ?? p.title, dict);
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

/** 商品ページで発売日・在庫・JANコードを取る（一覧には無い）。time が尽きたら残りは次の回。
 *  since を渡すと、発売日がそれより前の商品に当たったところでやめて old=true を返す（発売日の新しい順に読んでいるとき用） */
async function lookupMovicItems(items: ListProduct[], until: number, since?: string): Promise<{ done: ListProduct[]; left: number; old: boolean }> {
  const done: ListProduct[] = [];
  let i = 0;
  for (; i < items.length; i++) {
    const p = items[i];
    if (Date.now() > until) break;
    await delay(GAP_MS);
    const hit = await lookupByUrl(p.url).catch(() => null);
    if (!hit) {
      // 混雑の 503 などで読めないときは、この商品から次の回に回す（読めないまま進むと発売日が分からず、
      // 1年より前で打ち切れないうえ、この商品は予定にならずに読み落とす）。サイトは読めてこの商品だけ壊れているなら飛ばす
      if (!(await getHtml(`${MOVIC}/shop/pages/search_title.aspx`))) break;
      continue;
    }
    if (since && hit.release && hit.release.date < since) return { done, left: 0, old: true };
    if (hit.release) p.release = hit.release;
    if (hit.inStock !== undefined) p.inStock = hit.inStock;
    if (hit.stockLabel) p.stockLabel = hit.stockLabel;
    if (hit.jan) p.jan = hit.jan;
    done.push(p);
  }
  return { done, left: items.length - i, old: false };
}

/** 全作品の巡回で読む下限。1年より前に発売された商品は見ない（柴野・2026-11-05） */
const yearAgo = () => new Date(Date.now() + 9 * 3600_000 - 365 * 86400_000).toISOString().slice(0, 10);

// 作品の追加依頼があった作品。全作品の巡回の順番を待たずに、今の作品の次に読む（一度読んだら firstDone に入る）
const MOVIC_FIRST = ['TRIGUN', 'とんがり帽子のアトリエ'];

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
    const pages = catchUpDays(s.dailyAt);
    // フォローされている作品の商品だけ商品ページを読む（読むのが一番重い）
    const dict = await workDict(db);
    for (;;) {
      const pg = s.dailyPage ?? 1;
      const html = await getHtml(pg > 1 ? `${MOVIC}/shop/e/enew_snd_p${pg}/` : `${MOVIC}/shop/e/enew_snd/`);
      // 読めないとき（混雑の 503 など）は見たことにしない。次の回にもう一度見る
      if (!html) { await save(); return { added, merged, read, note: `新着 ${pg}ページ目が読めない` }; }
      const items = toList(parseMovicList(html)).filter((p) => p.inStock !== false && matchWork(p.title, dict));
      read += items.length;
      const { list } = await excludeRegistered({ title: 'ムービック 新着', shop: 'ムービック', retailer: 'ムービック', products: items, nextPage: null });
      const { done, left } = await lookupMovicItems(list.products, until);
      const r = await registerByTitle(db, authorId, 'ムービック', done);
      added += r.added; merged += r.merged;
      // 時間切れ・混雑で読み残したら、見たことにしない（次の回に残りを読む。登録済みは外れる）
      if (left) { await save(); return { added, merged, read, note: `新着 ${pg}ページ目の残り ${left}件は次の回` }; }
      if (pg >= pages) break;
      s.dailyPage = pg + 1;
      if (Date.now() > until) { await save(); return { added, merged, read, note: `新着 ${pg}/${pages}ページまで` }; }
    }
    s.dailyPage = undefined;
    s.dailyAt = new Date().toISOString();
    await save();
    return { added, merged, read, note: pages > 1 ? `新着（${pages}日ぶん）` : '新着' };
  }

  if (!s.works?.length) { s.works = await movicWorks(); s.i = 0; s.page = 1; s.wid = null; }
  if (!s.works.length) return { added, merged, read, note: '作品一覧が読めない' };

  // 依頼のあった作品を、今の作品のすぐ後ろへ移す（もう読み終えた作品は移さない）
  for (const name of MOVIC_FIRST) {
    if (s.firstDone?.includes(name)) continue;
    const cur = s.i ?? 0;
    const j = s.works.findIndex((w, k) => k > cur && workKey(w.name).includes(workKey(name)));
    if (j > cur + 1) s.works.splice(cur + 1, 0, ...s.works.splice(j, 1));
    s.firstDone = [...(s.firstDone ?? []), name];
  }

  const since = yearAgo();
  while (Date.now() < until && (s.i ?? 0) < s.works.length) {
    const w = s.works[s.i ?? 0];
    const page = s.page ?? 1;
    // 発売日の新しい順（_srd）で読み、1年より前の商品に当たったら次の作品へ。
    // 前は既定の並びで全ページ・全商品を開いていて、呪術廻戦（31ページ）だけで何日もかかっていた
    const base = w.url.replace(/\/$/, '_srd');
    const html = await getHtml(`${MOVIC}${base}${page > 1 ? `_p${page}` : ''}/`);
    if (!html) {
      // サイトごと読めない（混雑の 503・アクセス制限など）ときは進めない。2026-10-11〜12 に飛ばし続けて作品をほぼ全部読み落とした。
      // 作品一覧のページが読めれば、その作品のページだけが無いので飛ばす
      if (!(await getHtml(`${MOVIC}/shop/pages/search_title.aspx`))) { await save(); return { added, merged, read, note: `サイトが読めない（作品 ${s.i ?? 0}/${s.works.length}）` }; }
      s.i = (s.i ?? 0) + 1; s.page = 1; s.wid = null; s.workName = undefined; continue;
    }
    const items = toList(parseMovicList(html)).filter((p) => p.inStock !== false);
    read += items.length;
    if (!s.wid) {
      // 作品名: 登録済みの作品名が商品名に入っていればそれ、無ければ作品ページの見出しの名前で作る
      const name = (await detectWork(items.map((p) => p.title), '').catch(() => null)) ?? movicWorkName(html, w.name);
      s.wid = await followedWorkId(db, name);
      s.workName = name;
      // フォロワーが0（まだ無い作品も）なら読まずに次の作品へ（2026-11-21）
      if (!s.wid) { s.i = (s.i ?? 0) + 1; s.page = 1; s.workName = undefined; continue; }
    }
    const workName = s.workName ?? w.name;
    const { list } = await excludeRegistered({ title: workName, shop: 'ムービック', retailer: 'ムービック', products: items, nextPage: null });
    const { done, left, old } = await lookupMovicItems(list.products, until, since);
    if (s.wid && done.length) {
      // JANコードが取れなかった商品は、名前・発売日・値段が同じ別の店の予定で見分ける（その作品の既存の予定を渡す）
      const { data: existing } = await db.from('events').select('id, title, event_date, offers, price').eq('work_id', s.wid).eq('type', 'goods').eq('pool', 0);
      const r = await registerEvents(db, s.wid, await listEvents({ title: workName, shop: 'ムービック', retailer: 'ムービック', products: done, nextPage: null }, workName), existing ?? [], authorId, null, null, backdate);
      added += r.added; merged += r.merged;
    }
    if (left) break; // このページの残りは次の回（読み直しても登録済みは外れる）
    if (!old && html.includes(`${base}_p${page + 1}/`)) s.page = page + 1;
    else { s.i = (s.i ?? 0) + 1; s.page = 1; s.wid = null; s.workName = undefined; }
  }
  if ((s.i ?? 0) >= s.works.length) { s.phase = 'daily'; s.works = []; }
  await save();
  return { added, merged, read, note: `作品 ${s.i ?? 0}/${s.works?.length || '済'}` };
}

// ── KADOKAWAストア ─────────────────────────
// 作品一覧は無い（代表的なシリーズだけ）ので、グッズの分類ごとの一覧（新しい順・12件ずつ）を全部読み、作品は商品名で見分ける。
// 一覧に値段・在庫・発売日があり、商品URLにJANコードが入っている（/shop/g/g4984995910659/）。
// 画像は一覧だと小さい1枚だけなので、登録前の商品だけ商品ページを読んで全部取る（コトブキヤと同じ）。
// 分類: c22 フィギュア・プラモデル / c23 グッズ・文具 / c24 ファッション / c25 その他グッズ（本・映像・ゲームは読まない）
const KADOKAWA = 'https://store.kadokawa.co.jp';
const KADOKAWA_CATS = ['c22', 'c23', 'c24', 'c25'];
// 店の表記は「在庫無し」「販売が終了している商品です」など。「販売終了」だけだと後者を在庫ありと読んでいた
const KADOKAWA_SOLD_OUT = /在庫無|在庫な|販売.{0,3}終了|品切|売切/;

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
    // ⚠️ ブロックの最初の <img> は「NEW」や分類のアイコン。商品の写真は <figure> の中。小さい版(S)を大きい版(L)にする
    const img = b.match(/<figure[\s\S]*?<img[^>]+src="(\/img\/goods\/[^"]+)"/)?.[1]?.replace('/img/goods/S/', '/img/goods/L/');
    const jan = href.match(/^\/shop\/g\/g(\d{13})\/$/)?.[1];
    const soldOut = KADOKAWA_SOLD_OUT.test(stock);
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

/** 商品ページから、画像を全部（大きい写真の並び）と、販売終了かどうか */
async function kadokawaDetail(p: ListProduct): Promise<void> {
  const html = await getHtml(p.url);
  if (!html) return;
  const imgs = [...html.matchAll(/block-goods-main-img-item[^>]*>\s*<img[^>]+src="([^"]+)"/g)]
    .map((m) => new URL(m[1], KADOKAWA).toString());
  const uniq = [...new Set(imgs)];
  if (uniq.length) { p.images = uniq; p.image = uniq[0]; }
  const ended = html.match(/販売.{0,3}終了している商品です/)?.[0];
  if (ended) { p.inStock = false; p.stockLabel = ended; }
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
  const dict = await workDict(db);

  // 1ページぶん: 売り切れ・DBに無い作品・登録済みを外してから、残りの商品ページを読んで登録。時間切れなら false
  const doPage = async (html: string, created?: (e: ListEvent) => string | null): Promise<boolean> => {
    const items = parseKadokawaList(html).filter((x) => x.inStock !== false && matchWork(x.title, dict));
    read += items.length;
    const { list } = await excludeRegistered({ title: shop, shop, retailer: shop, products: items, nextPage: null });
    const done: ListProduct[] = [];
    for (const p of list.products) {
      if (Date.now() > until) break;
      await kadokawaDetail(p);
      done.push(p);
    }
    const r = await registerByTitle(db, authorId, shop, done.filter((x) => x.inStock !== false), created);
    added += r.added; merged += r.merged;
    return done.length === list.products.length;
  };

  if (s.phase === 'daily') {
    if (s.dailyAt && Date.now() - Date.parse(s.dailyAt) < 24 * 3600_000) return { added, merged, read, note: '今日の新着は済んでいる' };
    // ふだんは分類ごとに2ページ。止まっていた日数ぶん多めに読む。
    // 時間切れなら読んだ位置（ci・page）を覚えて、次の回に続きから（このページの残りも登録済みは外れる）
    const pages = 2 * catchUpDays(s.dailyAt);
    while ((s.ci ?? 0) < KADOKAWA_CATS.length) {
      if (Date.now() > until) { await save(); return { added, merged, read, note: `新着 分類${(s.ci ?? 0) + 1}の${s.page ?? 1}/${pages}ページから次の回` }; }
      const html = await page(KADOKAWA_CATS[s.ci ?? 0], s.page ?? 1);
      if (html && !(await doPage(html))) { await save(); return { added, merged, read, note: '新着の残りは次の回' }; }
      if ((s.page ?? 1) < pages) s.page = (s.page ?? 1) + 1;
      else { s.ci = (s.ci ?? 0) + 1; s.page = 1; }
    }
    s.ci = 0; s.page = 1;
    s.dailyAt = new Date().toISOString();
    await save();
    return { added, merged, read, note: pages > 2 ? `新着（${pages / 2}日ぶん）` : '新着' };
  }

  while (Date.now() < until && (s.ci ?? 0) < KADOKAWA_CATS.length) {
    const cat = KADOKAWA_CATS[s.ci ?? 0];
    const p = s.page ?? 1;
    const html = await page(cat, p);
    if (!html) break; // 読めなければ次の回にやり直す
    const complete = await doPage(html, backdate);
    if (!complete) break; // このページの残りは次の回（登録済みは外れる）
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
    // ふだんは分類ごとに1ページ。止まっていた日数ぶん多めに読む。
    // 時間切れなら読んだ位置（ci・page）を覚えて、次の回に続きから（このページの残りも登録済みは外れる）
    const pages = catchUpDays(s.dailyAt);
    while ((s.ci ?? 0) < KOTOBUKIYA_CATS.length) {
      if (Date.now() > until) { await save(); return { added, merged, read, note: `新着 分類${(s.ci ?? 0) + 1}の${s.page ?? 1}/${pages}ページから次の回` }; }
      const cat = KOTOBUKIYA_CATS[s.ci ?? 0];
      const p = s.page ?? 1;
      const html = await getSjis(p > 1 ? `${KOTOBUKIYA}/shop/c/${cat}_p${p}/` : `${KOTOBUKIYA}/shop/c/${cat}/`);
      if (html && !(await doPage(html))) { await save(); return { added, merged, read, note: '新着の残りは次の回' }; }
      if (p < pages) s.page = p + 1;
      else { s.ci = (s.ci ?? 0) + 1; s.page = 1; }
    }
    s.ci = 0; s.page = 1;
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

// ── アニメイト ─────────────────────────
// robots.txt が「Crawl-delay: 1180」（約20分に1回）なので、全作品（約8,000）を回るのは無理（1周3〜4か月）。
// 1回の実行でアニメイトは1ページだけ読む（_pace.ts が20分に1回に絞る）。
//   1. その日の新着（作品を指定しない登録の新しい順・1ページ約70〜100件）を5ページまで
//   2. 読み終えたら、フォローされている作品を1つずつ検索して、今売っている商品を登録していく
// アニメイトの商品ページは読まない（JANコードは取れないので、二重登録は名前・発売日・値段で見分ける）
const ANIMATE = 'https://www.animate-onlineshop.jp';
const ANIMATE_NEW_PAGES = 5;
interface AnimateState { day?: string; newPages?: number; followIdx?: number }

async function crawlAnimate(db: Db, authorId: string): Promise<{ added: number; merged: number; read: number; note: string }> {
  // 巡回は40分に1回まで（20分の枠の半分は、プレミアムの人がいいねしたグッズの取り直しに残す。_boundary.ts）
  if (!botCanFetch('www.animate-onlineshop.jp', 40 * 60_000)) return { added: 0, merged: 0, read: 0, note: '間隔待ち' };
  const { data: st } = await db.from('bot_state').select('value').eq('key', 'catalog:animate').maybeSingle();
  const s: AnimateState = { ...((st?.value ?? {}) as AnimateState) };
  const today = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
  if (s.day !== today) { s.day = today; s.newPages = 0; }
  const shop = 'アニメイト';
  let read = 0, r = { added: 0, merged: 0 }, note = '';

  if ((s.newPages ?? 0) < ANIMATE_NEW_PAGES) {
    const page = (s.newPages ?? 0) + 1;
    const list = await fetchProductList(`${ANIMATE}/products/list.php?sort=5`, page).catch(() => null);
    // 読めないとき（アクセス制限の 403 など）は進めない。次の回に同じページを読む
    if (!list) return { added: 0, merged: 0, read: 0, note: `新着 ${page}ページ目が読めない` };
    const items = (list?.products ?? []).filter((p) => p.inStock !== false);
    read = items.length;
    r = await registerByTitle(db, authorId, shop, items);
    s.newPages = page;
    note = `新着 ${page}/${ANIMATE_NEW_PAGES}ページ`;
  } else {
    // フォローされている作品を、フォローの多い順に1つずつ
    const { data: works } = await db.from('works').select('id, name').gte('participant_count', 1).order('participant_count', { ascending: false }).limit(500);
    const ws = works ?? [];
    if (ws.length) {
      const i = (s.followIdx ?? 0) % ws.length;
      const w = ws[i];
      const list = await fetchProductList(`${ANIMATE}/products/list.php?smt=${encodeURIComponent(String(w.name))}&sort=5`).catch(() => null);
      const k = workKey(String(w.name));
      const items = (list?.products ?? []).filter((p) => p.inStock !== false && workKey(p.title).includes(k));
      read = items.length;
      const { list: fresh } = await excludeRegistered({ title: String(w.name), shop, retailer: shop, products: items, nextPage: null });
      if (fresh.products.length) {
        const { data: existing } = await db.from('events').select('id, title, event_date, offers, price').eq('work_id', w.id).eq('type', 'goods').eq('pool', 0);
        r = await registerEvents(db, String(w.id), await listEvents(fresh, String(w.name)), existing ?? [], authorId, null, null, backdate);
      }
      s.followIdx = i + 1;
      note = `フォロー中の作品 ${i + 1}/${ws.length}（${w.name}）`;
    }
  }
  await db.from('bot_state').upsert({ key: 'catalog:animate', value: s, updated_at: new Date().toISOString() });
  return { ...r, read, note };
}

// ── eeo Store ─────────────────────────
// 新着順の一覧（1ページ40件・約840ページ）に、名前・値段・売り切れ・通販期間・お届け時期がある。規約・robots.txt に禁止は無い（2026-11-01 確認）。
// 作品の分類は無いので、登録済みの作品名で商品名から見分ける（知らない作品の商品は入れない）。
const EEO = 'https://eeo.today/store/101';
const EEO_PAGES_PER_RUN = 3;
const EEO_DAILY_PAGES = 5;

/** 「12月中旬予定」のように年の無いお届け時期。今月より前の月なら来年 */
function deliveryFromText(t: string, today: string): { date: string; dateLabel: string | null } | null {
  const m = t.match(/(?:(\d{4})年\s*)?(\d{1,2})月\s*(上旬|中旬|下旬)/);
  if (!m) return parseReleaseText(t);
  const mon = Number(m[2]);
  const y = m[1] ? Number(m[1]) : Number(today.slice(0, 4)) + (mon < Number(today.slice(5, 7)) ? 1 : 0);
  return { date: `${y}-${String(mon).padStart(2, '0')}-${{ 上旬: '05', 中旬: '15', 下旬: '25' }[m[3]]}`, dateLabel: m[3] };
}

export function parseEeoList(html: string, today: string): ListProduct[] {
  const out: ListProduct[] = [];
  // 最後の商品の後ろにはページ全体の JSON が続くので、商品の </li> までに切る
  for (const b of html.split('<li class="ec-shelfGrid__item">').slice(1).map((x) => x.split('</li>')[0])) {
    const url = b.match(/href="(https:\/\/eeo\.today\/store\/101\/products\/detail\/\d+)"/)?.[1];
    const title = b.match(/ec-shelfGrid__item-title">([^<]+)</)?.[1]?.replace(/&amp;/g, '&').trim();
    const price = b.match(/[￥¥]\s*([\d,]+)/)?.[1];
    if (!url || !title || !price) continue;
    const img = b.match(/data-src="([^"]+)"/)?.[1];
    const image = img ? new URL(img, 'https://eeo.today').toString() : '';
    const end = b.match(/通販期間[：:]\s*(\d{4})年(\d{1,2})月(\d{1,2})日/);
    const preorderEnd = end ? `${end[1]}-${end[2].padStart(2, '0')}-${end[3].padStart(2, '0')}` : undefined;
    const open = !!preorderEnd && preorderEnd >= today;
    const delivery = b.match(/お届け[：:]\s*([^<]+)/)?.[1] ?? '';
    const release = deliveryFromText(delivery, today);
    // 通販期間が過ぎたものは、もう買えない
    const soldOut = /sold_text|売り切れ|在庫なし|受付終了|販売終了/i.test(b) || (!!preorderEnd && !open);
    // 通販期間が書かれていなくても、お届けが先なら予約で売っている
    const preorder = open || (!soldOut && !!release && release.date > today);
    out.push({
      title, url, price: Number(price.replace(/,/g, '')), inStock: !soldOut,
      // 商品名の「」の中が作品名
      ...(title.match(/「([^」]+)」/)?.[1] ? { workText: title.match(/「([^」]+)」/)![1] } : {}),
      ...(preorder ? { stockLabel: '予約受付中', ...(open ? { preorderEnd } : {}) } : soldOut ? {} : { stockLabel: '在庫あり' }),
      ...(release ? { release } : {}),
      image, images: image ? [image] : [],
    });
  }
  return out;
}

interface EeoState { phase: 'initial' | 'daily'; page?: number; dailyAt?: string }

async function crawlEeo(db: Db, authorId: string): Promise<{ added: number; merged: number; read: number; note: string }> {
  const { data: st } = await db.from('bot_state').select('value').eq('key', 'catalog:eeo').maybeSingle();
  const s: EeoState = { phase: 'initial', page: 1, ...((st?.value ?? {}) as Partial<EeoState>) };
  if (s.phase === 'daily' && s.dailyAt && Date.now() - Date.parse(s.dailyAt) < 24 * 3600_000) return { added: 0, merged: 0, read: 0, note: '今日の新着は済んでいる' };
  const today = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
  let added = 0, merged = 0, read = 0;
  for (let n = 0; n < EEO_PAGES_PER_RUN; n++) {
    const html = await getHtml(`${EEO}/products/list?pageno=${s.page ?? 1}`);
    // 読めないときは進めない。次の回に同じページを読む。
    // ただし1ページ目は読める＝最後のページの先（eeo は空の一覧でなく 404 を返す）なので、読み終えたことにする。
    // 2026-11-22 まで 844ページ目の 404 で止まり続けていた
    if (!html) {
      if ((s.page ?? 1) > 1 && await getHtml(`${EEO}/products/list?pageno=1`)) {
        s.phase = 'daily'; s.page = 1; s.dailyAt = new Date().toISOString();
      }
      break;
    }
    const items = parseEeoList(html, today);
    read += items.length;
    const r = await registerByTitle(db, authorId, 'eeo Store', items.filter((p) => p.inStock !== false), s.phase === 'initial' ? backdate : undefined);
    added += r.added; merged += r.merged;
    const last = !items.length || (s.phase === 'daily' && (s.page ?? 1) >= EEO_DAILY_PAGES * catchUpDays(s.dailyAt));
    if (last) {
      s.phase = 'daily'; s.page = 1; s.dailyAt = new Date().toISOString();
      break;
    }
    s.page = (s.page ?? 1) + 1;
  }
  await db.from('bot_state').upsert({ key: 'catalog:eeo', value: s, updated_at: new Date().toISOString() });
  return { added, merged, read, note: `${s.page}ページ目まで` };
}

// ── AMNIBUS ─────────────────────────
// /products/list?pageno=N に Accept: application/json を付けると、作品名・値段・在庫・予約締切・発送時期の入った JSON が50件ずつ返る
// （サイト自身の無限スクロールと同じ）。robots.txt が Crawl-delay: 15 なので、1回の実行で1ページだけ（実行は10分おき）。
const AMNIBUS = 'https://amnibus.com';
const AMNIBUS_DAILY_PAGES = 3;
interface AmnibusState { phase: 'initial' | 'daily'; page?: number; dailyAt?: string }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseAmnibusRows(rows: any[], today: string): ListProduct[] {
  return rows.flatMap((p) => {
    const name = String(p.fullName ?? p.name ?? '').trim();
    const price = Number(p.getPriceIncTaxMin ?? 0);
    if (!p.id || !name || !price) return [];
    // 商品名に作品名が入っていないので、作品の見分けと一覧での表示のために頭に付ける
    const artwork = String(p.artworkTitle ?? '').trim();
    if (!artwork) return [];
    const title = `${artwork} ${name}`;
    const pc = p.productClasses?.[0];
    const type = pc?.productType;
    const period = type?.reservationPeriod ? new Date(Date.parse(type.reservationPeriod) + 9 * 3600_000).toISOString().slice(0, 10) : undefined;
    const open = !!period && period >= today;
    const canBuy = !p.isDiscontinued && p.stockFind !== false && pc?.canSale !== false && (open || !!type?.isStockSale);
    const release = deliveryFromText(String(type?.deliverySchedule ?? ''), today);
    const image = String(p.mainListImage?.filename ?? '');
    return [{
      title, workText: artwork, url: `${AMNIBUS}/products/detail/${p.id}`, price, inStock: canBuy,
      ...(open ? { stockLabel: '予約受付中', preorderEnd: period } : canBuy ? { stockLabel: '在庫あり' } : {}),
      ...(release ? { release } : {}),
      image, images: image ? [image] : [],
    } as ListProduct];
  });
}

async function crawlAmnibus(db: Db, authorId: string): Promise<{ added: number; merged: number; read: number; note: string }> {
  const { data: st } = await db.from('bot_state').select('value').eq('key', 'catalog:amnibus').maybeSingle();
  const s: AmnibusState = { phase: 'initial', page: 1, ...((st?.value ?? {}) as Partial<AmnibusState>) };
  if (s.phase === 'daily' && s.dailyAt && Date.now() - Date.parse(s.dailyAt) < 24 * 3600_000) return { added: 0, merged: 0, read: 0, note: '今日の新着は済んでいる' };
  const page = s.page ?? 1;
  const res = await fetch(`${AMNIBUS}/products/list?pageno=${page}`, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(30000) }).catch(() => null);
  const body = res?.ok ? await res.json().catch(() => null) as { data?: unknown[] } | null : null;
  // 読めないときは進めない。次の回に同じページを読む
  if (!Array.isArray(body?.data)) return { added: 0, merged: 0, read: 0, note: `${page}ページ目が読めない` };
  const items = parseAmnibusRows(body.data, new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10));
  const r = await registerByTitle(db, authorId, 'AMNIBUS', items.filter((p) => p.inStock !== false), s.phase === 'initial' ? backdate : undefined);
  const done = !items.length || (s.phase === 'daily' && page >= AMNIBUS_DAILY_PAGES * catchUpDays(s.dailyAt));
  if (done) { s.phase = 'daily'; s.page = 1; s.dailyAt = new Date().toISOString(); } else s.page = page + 1;
  await db.from('bot_state').upsert({ key: 'catalog:amnibus', value: s, updated_at: new Date().toISOString() });
  return { ...r, read: items.length, note: `${page}ページ目` };
}

// ── アニメイトの海外版（animate.shop） ─────────────────────────
// 日本のアニメイト通販は 403（アクセス制限）でボットから読めない（2026-11-21）。海外版の animate.shop は Shopify で、
// /products.json（店に出した日時 published_at の新しい順・250件ずつ。1日に60件ほど）に JANコード（sku）と発売時期（説明文の Release Date）がある。
// created_at は順に並んでいない（1年前に作った商品が1ページ目にある）ので、区切りには published_at を使う。
// 日本には送らない店なのでリンクには使わず、JANコードで楽天・Yahoo!を引いて、日本語名と日本の店のリンクにする。
// 日本の店で見つからない商品は登録しない（アニメイト限定品・AGF の事後通販は日本の店に無いことが多い。
// 新しい商品は日本の店に後から並ぶので、2・6・13日後に引き直す）。
// 海外版の予約締切は日本の店の締切と違うので使わない。作品は日本語名で見分け、フォローされている作品の商品だけ入れる。
const ANIMATE_SHOP = 'https://www.animate.shop';
const ASHOP_PER_RUN = 12;            // 1回に JANコードで引く数（楽天・Yahoo! は1秒に1回ほどまで。1回20秒ほど。後ろの手直しの持ち時間を削りすぎない）
const ASHOP_FIRST_DAYS = 14;         // 最初の回は、店に出て14日以内の商品まで（1日に50件ほど出る）
const ASHOP_RETRY_AFTER = [2, 6, 13]; // 見つからなかった商品を引き直す日（店に出てからの日数）
/** j=JANコード c=店に出た日時 d=発売日 l=発売日のあいまいさ（上旬・中など） n=引いた回数 */
interface AShopItem { j: string; c: string; d: string; l: string | null; n?: number }
/** since=前に読んだ一番新しい商品の published_at（前の版の newest は created_at だったので使わない） */
interface AShopState { since?: string; dailyAt?: string; queue?: AShopItem[] }

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
/** 説明文の「Release Date: Mid January 2027」「January 2027 (TBA)」「01/27/2027」「Late Decmeber 2026」（つづり違いがある）を、
 *  アプリの日付の持ち方にする（parseReleaseText と同じ。上中下旬=5/15/25日、月のみ=末日） */
export function parseAnimateShopRelease(body: string): { date: string; dateLabel: string | null } | null {
  const t = body.replace(/<[^>]+>/g, '\n').match(/Release Date\s*:?\s*([^\n※]+)/i)?.[1]?.trim();
  if (!t) return null;
  const mon = (s: string) => MONTHS.indexOf(s.slice(0, 3).toLowerCase()) + 1;
  let m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return parseReleaseText(`${m[3]}年${m[1]}月${m[2]}日`);
  m = t.match(/^(Early|Mid|Late)\s+([A-Za-z]+)\.?\s+(\d{4})/i);
  if (m && mon(m[2])) return parseReleaseText(`${m[3]}年${mon(m[2])}月${{ early: '上旬', mid: '中旬', late: '下旬' }[m[1].toLowerCase()]}`);
  m = t.match(/^([A-Za-z]+)\.?\s+(\d{1,2}),?\s+(\d{4})/);
  if (m && mon(m[1])) return parseReleaseText(`${m[3]}年${mon(m[1])}月${m[2]}日`);
  m = t.match(/^([A-Za-z]+)\.?\s+(\d{4})/);
  if (m && mon(m[1])) return parseReleaseText(`${m[2]}年${mon(m[1])}月`);
  return null;
}

/** products.json の商品から、JANコードで引く商品を選ぶ。特典（Bonus）・売り切れ・JANコードの無いもの・発売から3日より前のものは外す */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function animateShopItems(products: any[], today: string): AShopItem[] {
  const since = new Date(Date.parse(`${today}T00:00:00Z`) - 3 * 86400_000).toISOString().slice(0, 10);
  return products.flatMap((p) => {
    if (p.product_type === 'Bonus' || p.vendor === 'Bonus') return [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const v = (p.variants ?? []).find((x: any) => x.available);
    if (!v) return [];
    const jan = [v.sku, p.handle].map((s) => String(s ?? '')).find((s) => /^\d{13}$/.test(s));
    const rel = parseAnimateShopRelease(String(p.body_html ?? ''));
    if (!jan || !rel || rel.date < since) return [];
    return [{ j: jan, c: String(p.published_at ?? p.created_at), d: rel.date, l: rel.dateLabel }];
  });
}

/** 付けるリンク。あみあみ → 公式店（楽天ブックスなど）→ 在庫ありで安いもの */
export function pickJanHit(hits: Candidate[]): Candidate {
  const rank = (c: Candidate) => (/あみあみ/.test(c.shop) ? 0 : c.official ? 1 : 2);
  return [...hits].sort((a, b) => rank(a) - rank(b) || Number(b.inStock !== false) - Number(a.inStock !== false) || a.price - b.price)[0];
}

/** 予定の名前。店の飾り（[メーカー]《01月予約》【送料無料】「2027/02発売 [グッズ]/」など）を落とす。
 *  あみあみ・楽天ブックスの商品名が一番整っているので、あればそれを使う */
export function janTitle(hits: Candidate[]): string {
  const src = hits.find((c) => /あみあみ/.test(c.shop)) ?? hits.find((c) => /楽天ブックス/.test(c.shop)) ?? pickJanHit(hits);
  const t = src.title.normalize('NFKC')
    .replace(/■[^■]*■/g, ' ')
    .replace(/^(?:【[^】]*】\s*)*\d{4}\/\d{1,2}発売\s*(?:\[[^\]]*\]\s*\/?)?/, '');
  // 末尾の【】はメーカー名・返品の種別（【有限会社 キューズQ】【返品種別A】）。頭の【】はキャラ名のことがあるので残す
  return stripShopNoise(t).replace(/(?:\s*【[^】]*】)+$/, '').replace(/^[\s/]+/, '').trim();
}

async function animateShopPage(page: number): Promise<{ published_at: string }[] | null> {
  await delay(GAP_MS);
  const r = await fetch(`${ANIMATE_SHOP}/products.json?limit=250&page=${page}`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(30000) }).catch(() => null);
  const body = r?.ok ? await r.json().catch(() => null) as { products?: { published_at: string }[] } | null : null;
  return Array.isArray(body?.products) ? body.products : null;
}

async function crawlAnimateShop(db: Db, authorId: string): Promise<{ added: number; merged: number; read: number; note: string }> {
  const { data: st } = await db.from('bot_state').select('value').eq('key', 'catalog:animateshop').maybeSingle();
  const s: AShopState = { ...((st?.value ?? {}) as AShopState) };
  const today = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
  const save = (v: AShopState) => db.from('bot_state').upsert({ key: 'catalog:animateshop', value: v, updated_at: new Date().toISOString() });
  const retryKey = 'catalog:animateshop:retry';
  const age = (c: string) => (Date.now() - Date.parse(c)) / 86400_000;
  let read = 0;

  // 1日1回、前に見たところまでの新着と、引き直す日が来た商品を並べる
  if (!s.queue?.length) {
    if (s.since && s.dailyAt && Date.now() - Date.parse(s.dailyAt) < 24 * 3600_000) return { added: 0, merged: 0, read: 0, note: '今日の新着は済んでいる' };
    const cutoff = Date.parse(s.since ?? new Date(Date.now() - ASHOP_FIRST_DAYS * 86400_000).toISOString());
    const fresh: AShopItem[] = [];
    let newest = s.since ?? '';
    for (let page = 1; page <= 10; page++) {
      const ps = await animateShopPage(page);
      // 読めないときは進めない。次の回に読み直す
      if (!ps) return { added: 0, merged: 0, read, note: `${page}ページ目が読めない` };
      read += ps.length;
      fresh.push(...animateShopItems(ps.filter((p) => Date.parse(p.published_at) > cutoff), today));
      for (const p of ps) if (!newest || Date.parse(p.published_at) > Date.parse(newest)) newest = p.published_at;
      if (ps.length < 250 || ps.some((p) => Date.parse(p.published_at) <= cutoff)) break;
    }
    const { data: rt } = await db.from('bot_state').select('value').eq('key', retryKey).maybeSingle();
    const retry = (((rt?.value ?? {}) as { items?: AShopItem[] }).items ?? []);
    const due = retry.filter((x) => age(x.c) >= ASHOP_RETRY_AFTER[(x.n ?? 1) - 1]);
    const seen = new Set(fresh.map((x) => x.j));
    s.queue = [...fresh, ...due.filter((x) => !seen.has(x.j))];
    s.since = newest || s.since;
    s.dailyAt = new Date().toISOString();
    await db.from('bot_state').upsert({ key: retryKey, value: { items: retry.filter((x) => !due.includes(x)) }, updated_at: new Date().toISOString() });
    // 引き直しの一覧から外した分は、すぐ並びに入れて残す（途中で落ちても消えないように）
    await save(s);
  }

  const batch = s.queue.splice(0, ASHOP_PER_RUN);
  const dict = await workDict(db);
  const found: { work: string; hit: Candidate; p: ListProduct; c: string }[] = [];
  const miss: AShopItem[] = [];
  for (const it of batch) {
    // もう登録してある商品（別の店の巡回で同じ JANコードが入っている）は引かない
    const { data: had } = await db.from('events').select('id').eq('pool', 0).filter('offers', 'cs', JSON.stringify([{ jan: it.j }])).limit(1);
    if (had?.length) continue;
    await delay(1100);
    const hits = await searchByJan(it.j).catch(() => [] as Candidate[]);
    if (!hits.length) { miss.push(it); continue; }
    const title = janTitle(hits);
    const work = matchWork(title, dict);
    if (!work) continue;
    const hit = pickJanHit(hits);
    const future = it.d > today;
    found.push({
      work, hit, c: it.c,
      p: {
        title, url: hit.url, price: hit.price, inStock: future || hit.inStock !== false, ...(future ? { stockLabel: '予約受付中' } : {}),
        jan: it.j, image: hit.image, images: hit.image ? [hit.image] : [], release: { date: it.d, dateLabel: it.l },
      },
    });
  }
  if (miss.length) {
    const { data: rt } = await db.from('bot_state').select('value').eq('key', retryKey).maybeSingle();
    const retry = (((rt?.value ?? {}) as { items?: AShopItem[] }).items ?? []);
    const more = miss.map((x) => ({ ...x, n: (x.n ?? 0) + 1 })).filter((x) => x.n <= ASHOP_RETRY_AFTER.length && x.d >= today);
    const again = new Set(more.map((x) => x.j));
    await db.from('bot_state').upsert({ key: retryKey, value: { items: [...retry.filter((x) => !again.has(x.j)), ...more].slice(-2000) }, updated_at: new Date().toISOString() });
  }

  // 作品と店ごとにまとめて登録する（同じ店のキャラ違いは1つの予定にまとまる）
  const groups = new Map<string, typeof found>();
  for (const f of found) {
    const k = `${f.work}\n${f.hit.retailer}\n${f.hit.shop}`;
    groups.set(k, [...(groups.get(k) ?? []), f]);
  }
  let added = 0, merged = 0;
  for (const g of groups.values()) {
    const wid = await resolveWork(db, g[0].work);
    if (!wid) continue;
    const list: ProductList = { title: g[0].work, shop: g[0].hit.shop, retailer: g[0].hit.retailer, products: g.map((f) => f.p), nextPage: null };
    const byUrl = new Map(g.map((f) => [f.p.url, f]));
    const events = (await listEvents(list, g[0].work)).map((e) => ({
      ...e, offers: e.offers.map((o) => ({ ...o, official: !!byUrl.get(o.url)?.hit.official })),
    }));
    // 店に出て1週間より前の商品（最初の回・引き直しで見つかったもの）は、店に出た日を登録日にして新着に並べない
    const created = (e: ListEvent) => {
      const c = e.offers.map((o) => byUrl.get(o.url)?.c).filter((x): x is string => !!x).sort()[0];
      return c && age(c) > 7 ? new Date(c).toISOString() : null;
    };
    // 同じ商品は registerEvents が JANコードで見分ける。作品の予定を全部読む（rows）と転送量が増えるので渡さない
    const r = await registerEvents(db, wid, events, [], authorId, null, null, created);
    added += r.added; merged += r.merged;
  }
  await save(s);
  return { added, merged, read, note: `JANコードで ${batch.length}件引いた（見つからない ${miss.length}・登録 ${found.length}）・残り ${s.queue.length}件` };
}

/** 店の全作品の巡回を、1回ぶん進める。ムービック・KADOKAWAストア・コトブキヤ・アニメイト・eeo Store・AMNIBUS・アニメイトの海外版 */
export async function crawlCatalogs(db: Db, budgetMs: number): Promise<Record<string, unknown>> {
  const { data: bot } = await db.from('staff').select('user_id').eq('role', 'bot').limit(1).maybeSingle();
  if (!bot?.user_id || budgetMs < 5000) return { skipped: true };
  // 持ち時間は店どうしで等分
  const share = Math.floor(budgetMs / 3);
  const movic = await crawlMovic(db, bot.user_id as string, share).catch((e) => ({ error: String(e) }));
  const kadokawa = await crawlKadokawa(db, bot.user_id as string, share).catch((e) => ({ error: String(e) }));
  const kotobukiya = await crawlKotobukiya(db, bot.user_id as string, share).catch((e) => ({ error: String(e) }));
  // アニメイトは時間ではなく「20分に1回・1ページ」で進むので、持ち時間の外
  const animate = await crawlAnimate(db, bot.user_id as string).catch((e) => ({ error: String(e) }));
  // eeo Store と AMNIBUS も「1回に読むページ数」で進むので、持ち時間の外
  const eeo = await crawlEeo(db, bot.user_id as string).catch((e) => ({ error: String(e) }));
  const amnibus = await crawlAmnibus(db, bot.user_id as string).catch((e) => ({ error: String(e) }));
  // アニメイトの海外版も「1回に JANコードで引く数」で進むので、持ち時間の外
  const animateShop = await crawlAnimateShop(db, bot.user_id as string).catch((e) => ({ error: String(e) }));
  return { movic, kadokawa, kotobukiya, animate, eeo, amnibus, animateShop };
}

// 投稿済みのグッズの手直し（下見 → 人が確かめて → 書き込み）。本人要望・2026-09-26。
//  1. 今あるリンクから、URLの商品の値段・在庫を取り直す（取れたリンクは pinned にする）
//  2. 同じ店のリンクが並ぶときは種類の名前（キャラ名など）を付ける
//  3. 値段の取れる店のリンクが無ければ、販売先を探して付ける（種類違いは名前付きで全部）。
//     アニメイトに取りこぼしがありそうなら、アニメイトの検索結果のリンクも付ける
//  4. アニメイトの商品ページから、発売日（あいまい・空のときだけ）と予約期間（空のときだけ）を足す
//  5. 代表価格を取り直す
// 本番のデータをまとめて書き換えるので、いきなり書かない。下見（planEnrich）で変更案を作り、
// 管理画面（/api/metrics?enrich=1）で人が選んだものだけ applyEnrich で書く。
// 下見から書き込みまでの間に予定が変わっていたら（hash が違えば）書かずに飛ばす。
import type { SupabaseClient } from '@supabase/supabase-js';
import { lookupByUrl, unwrapProductUrl, searchCandidatesWithMeta, highConfidence, searchKeyword, isSetTitle, labelVariants, type Candidate, type UrlLookup } from './_product-search.js';
import { isSearchPage, representativePrice, type OfferRow } from './_offers.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any>;
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 書き込んでよい列（管理画面から送られてくる変更は、これ以外を受け付けない） */
const WRITABLE = ['offers', 'price', 'event_date', 'date_label', 'end_date', 'is_order_made', 'preorder_start_date', 'preorder_end_date'] as const;
type Writable = typeof WRITABLE[number];
export type EnrichSet = Partial<Record<Writable, unknown>>;

export interface EnrichProposal {
  id: string; title: string; work: string;
  hash: string;          // 下見を作った時点の予定の中身。書き込み時に変わっていないか確かめる
  set: EnrichSet;        // 書き込む列と値
  notes: string[];       // 何をどう変えるか（人が読む用）
  dateChange: boolean;   // 日付に触るか（間違えると通知の日がずれるので、画面で分けて見せる）
}

const FIELDS = 'id, title, price, offers, event_date, date_label, end_date, is_order_made, preorder_start_date, preorder_end_date, works(name)';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowHash(row: any): string {
  const s = JSON.stringify(WRITABLE.map((k) => row[k] ?? null));
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16);
}

const animateSearchUrl = (kw: string) => `https://www.animate-onlineshop.jp/products/list.php?smt=${encodeURIComponent(kw)}`;
const offerName = (o: OfferRow) => o.label || o.shop || o.retailer || 'リンク';
const yen = (n: number | null | undefined) => (n == null ? 'なし' : `¥${n.toLocaleString()}`);
const DAY = 86400_000;

/** 取り消されたリンク・日付が手で直された予定（共同編集）。日付を直された予定の日付には触らない */
async function loadEdits(db: Db): Promise<{ removed: Map<string, Set<string>>; dateEdited: Set<string> }> {
  const removed = new Map<string, Set<string>>();
  const dateEdited = new Set<string>();
  const { data } = await db.from('event_edits').select('event_id, patch');
  for (const e of data ?? []) {
    const id = e.event_id as string;
    const p = (e.patch ?? {}) as Record<string, unknown>;
    for (const u of (p.removedOfferUrls as string[] | undefined) ?? []) {
      const set = removed.get(id) ?? new Set<string>();
      set.add(u); removed.set(id, set);
    }
    if (['date', 'dateLabel', 'endDate', 'isOrderMade', 'preorderStart', 'preorderEnd'].some((k) => k in p)) dateEdited.add(id);
  }
  return { removed, dateEdited };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function planOne(row: any, removed: Set<string>, dateEdited: boolean): Promise<EnrichProposal | null> {
  const title = String(row.title ?? '').trim();
  const workName = (row.works as { name?: string } | null)?.name ?? '';
  const offers: OfferRow[] = (Array.isArray(row.offers) ? row.offers as OfferRow[] : []).map((o) => ({ ...o }));
  const live = () => offers.filter((o) => !removed.has(o.url));
  const notes: string[] = [];
  const now = new Date().toISOString();
  const hits = new Map<OfferRow, UrlLookup>();

  // 1. URLから値段・在庫
  for (const o of live()) {
    if (isSearchPage(o.url)) continue;
    const hit = await lookupByUrl(o.url);
    // 楽天は1秒1回。ほかは相手に負担をかけない程度に空ける
    await delay(/rakuten/.test(unwrapProductUrl(o.url)) ? 1100 : 300);
    if (!hit) continue;
    hits.set(o, hit);
    if (o.price !== hit.price) notes.push(`値段 ${yen(o.price)} → ${yen(hit.price)}（${offerName(o)}）`);
    if (hit.inStock !== undefined && o.inStock !== hit.inStock) notes.push(`在庫 ${o.inStock === undefined ? '不明' : o.inStock ? 'あり' : 'なし'} → ${hit.inStock ? 'あり' : 'なし'}（${offerName(o)}）`);
    o.price = hit.price;
    if (hit.shop) o.shop = hit.shop;
    o.official = hit.official;
    if (hit.title) o.isSet = isSetTitle(hit.title);
    o.inStock = hit.inStock;
    o.stockLabel = hit.stockLabel;
    o.fetchedAt = now;
    o.pinned = true; // 以後は毎日の更新でもこのURLの値段を取る（商品名検索で別の商品に付け替えない）
  }

  // 2. 同じ店のリンクに種類の名前を付ける（商品名が取れたものだけ）
  const named = [...hits].filter(([o, h]) => !o.label && h.title);
  const asCand = new Map<Candidate, OfferRow>(named.map(([o, h]) => [{
    title: h.title!, price: h.price, url: o.url, image: '', shop: o.shop ?? '', retailer: o.retailer ?? '', hasAffiliate: false,
  }, o]));
  const labels = labelVariants([...asCand.keys()]);
  if (labels.size >= 2) {
    for (const [c, label] of labels) asCand.get(c)!.label = label;
    notes.push(`リンクに名前: ${[...labels.values()].join(' / ')}`);
  }

  // 3. 値段の取れる店のリンクが無ければ、販売先を探す
  if (!hits.size && title) {
    const kw = searchKeyword(workName, title);
    const { items, animateTotal } = await searchCandidatesWithMeta(kw).catch(() => ({ items: [] as Candidate[], animateTotal: null }));
    const picks = highConfidence(title, items, workName);
    const existing = new Set(offers.map((o) => o.url)); // 取り消し済みも含める（取り消したリンクを復活させない）
    const added: string[] = [];
    for (const c of picks) {
      if (existing.has(c.url)) continue;
      offers.push({
        retailer: c.retailer || '楽天', shop: c.shop || undefined, url: c.url, affiliateUrl: c.url, hasAffiliate: c.hasAffiliate,
        price: c.price, fetchedAt: now, official: c.official, isSet: isSetTitle(c.title), inStock: c.inStock, stockLabel: c.stockLabel,
        ...(c.label ? { label: c.label } : {}), pinned: true,
      });
      existing.add(c.url);
      added.push(`${c.label ? `${c.label}・` : ''}${c.retailer}${c.shop ? `（${c.shop}）` : ''} ${yen(c.price)}`);
    }
    if (added.length) notes.push(`販売先を追加: ${added.join(' / ')}`);
    // アニメイトに、付けた数より多く商品がある（種類違いの取りこぼし）か、アニメイトのリンクが無いのに
    // 検索では見つかるなら、検索結果のリンクを付ける。30件を超える検索は商品が絞れていないので付けない
    const fromAnimate = picks.filter((c) => c.retailer === 'アニメイト').length;
    const hasAnimate = offers.some((o) => /animate-onlineshop\.jp/.test(o.url));
    const url = animateSearchUrl(kw);
    if (animateTotal && animateTotal <= 30 && animateTotal > fromAnimate && !existing.has(url) && (!hasAnimate || picks.some((c) => c.label))) {
      offers.push({ retailer: 'アニメイト', url, affiliateUrl: url, hasAffiliate: false, label: '検索結果' });
      notes.push(`アニメイトの検索結果を追加（${animateTotal}件）`);
    }
    await delay(900);
  }

  // 4. 日付（アニメイトの商品ページから）。あいまい・空のときだけ足す。人が日付を直した予定には触らない
  const set: EnrichSet = {};
  let dateChange = false;
  if (!dateEdited) {
    const rel = [...hits.values()].find((h) => h.release)?.release;
    const cur = row.event_date as string | null;
    // 今の日付と2か月以上離れていたら、再販や別の商品のページの可能性があるので使わない
    const near = (d: string) => !cur || Math.abs(new Date(d).getTime() - new Date(cur).getTime()) <= 62 * DAY;
    if (rel && near(rel.date)) {
      const moreSpecific = !cur || (row.date_label && (rel.dateLabel === null || (row.date_label === '中' && rel.dateLabel !== '中')));
      if (moreSpecific && (rel.date !== cur || rel.dateLabel !== (row.date_label ?? null))) {
        set.event_date = rel.date;
        set.date_label = rel.dateLabel;
        set.end_date = rel.dateLabel ? null : rel.date;
        notes.push(`発売日 ${cur ? `${cur}${row.date_label ? `（${row.date_label}）` : ''}` : 'なし'} → ${rel.date}${rel.dateLabel ? `（${rel.dateLabel}）` : ''}`);
        dateChange = true;
      }
    }
    const pre = [...hits.values()].find((h) => h.preorderEnd);
    const today = new Date().toISOString().slice(0, 10);
    if (pre?.preorderEnd) {
      if (row.is_order_made) {
        if (!row.preorder_end_date) { set.preorder_end_date = pre.preorderEnd; notes.push(`予約締切を追加: ${pre.preorderEnd}`); dateChange = true; }
        if (!row.preorder_start_date && pre.preorderStart) { set.preorder_start_date = pre.preorderStart; notes.push(`予約開始を追加: ${pre.preorderStart}`); dateChange = true; }
      } else if (pre.preorderEnd >= today) {
        // 予約受付中なのに「予約あり」になっていない。締切の通知が届くように予約ありにする
        set.is_order_made = true;
        set.preorder_end_date = pre.preorderEnd;
        set.preorder_start_date = pre.preorderStart ?? null;
        notes.push(`予約ありにする（${pre.preorderStart ?? ''}〜${pre.preorderEnd}）`);
        dateChange = true;
      }
    }
  }

  // 5. 代表価格
  // 取得日時と pinned の印だけが変わるもの（画面に見える違いが無い）は変更案にしない。
  // 値段・在庫はどのみち毎日の更新が取り直すので、下見の一覧を読む手間を増やさない
  const visible = (list: OfferRow[]) => JSON.stringify(list.map(({ fetchedAt: _f, pinned: _p, ...rest }) => rest));
  const offersChanged = visible(offers) !== visible((row.offers ?? []) as OfferRow[]);
  if (offersChanged) set.offers = offers;
  const price = representativePrice(live(), (row.price as number | null) ?? null, removed.size > 0);
  if (price !== (row.price ?? null)) { set.price = price; notes.push(`代表の値段 ${yen(row.price)} → ${yen(price)}`); }

  if (!Object.keys(set).length || !notes.length) return null;
  return { id: row.id as string, title, work: workName, hash: rowHash(row), set, notes, dateChange };
}

/** 下見。グッズを作成順に offset から limit 件見て、変更案を返す（書き込まない） */
export async function planEnrich(db: Db, offset: number, limit: number): Promise<{ proposals: EnrichProposal[]; total: number; next: number | null }> {
  const { removed, dateEdited } = await loadEdits(db);
  const { data, count } = await db.from('events').select(FIELDS, { count: 'exact' })
    .eq('type', 'goods').eq('pool', 0).order('created_at', { ascending: true }).range(offset, offset + limit - 1);
  const proposals: EnrichProposal[] = [];
  for (const row of data ?? []) {
    try {
      const p = await planOne(row, removed.get(row.id as string) ?? new Set(), dateEdited.has(row.id as string));
      if (p) proposals.push(p);
    } catch { /* 1件の失敗で全体を止めない */ }
  }
  const total = count ?? 0;
  const next = offset + limit < total ? offset + limit : null;
  return { proposals, total, next };
}

/** 書き込み。下見から予定が変わっていないものだけ書き、書く前の値を返す（戻すとき用） */
export async function applyEnrich(db: Db, changes: { id: string; hash: string; set: EnrichSet }[]): Promise<{
  applied: number; skipped: { id: string; reason: string }[]; backup: { id: string; before: EnrichSet }[];
}> {
  const skipped: { id: string; reason: string }[] = [];
  const backup: { id: string; before: EnrichSet }[] = [];
  let applied = 0;
  for (const c of changes) {
    const keys = Object.keys(c.set ?? {}).filter((k): k is Writable => (WRITABLE as readonly string[]).includes(k));
    if (!c.id || !keys.length) { skipped.push({ id: c.id, reason: '変更が空' }); continue; }
    const { data: row } = await db.from('events').select(FIELDS).eq('id', c.id).maybeSingle();
    if (!row) { skipped.push({ id: c.id, reason: '予定が見つからない' }); continue; }
    if (rowHash(row) !== c.hash) { skipped.push({ id: c.id, reason: '下見のあとに予定が変わった（下見を作り直してください）' }); continue; }
    const update = Object.fromEntries(keys.map((k) => [k, c.set[k]]));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const before = Object.fromEntries(keys.map((k) => [k, (row as any)[k] ?? null])) as EnrichSet;
    const { error } = await db.from('events').update(update).eq('id', c.id);
    if (error) { skipped.push({ id: c.id, reason: error.message }); continue; }
    backup.push({ id: c.id, before });
    applied++;
  }
  return { applied, skipped, backup };
}

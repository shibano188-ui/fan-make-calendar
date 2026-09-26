// 予約開始・予約終了・発売の「節目」の前後だけ、購入リンクの値段・在庫をこまめに取り直す。
// 毎日の更新（refresh-offers）は1日1回なので、節目をまたぐと「予約受付中なのに在庫なし」
// 「販売終了なのに在庫あり」のような古い表示が次の日まで残り、ユーザーが混乱する（本人要望・2026-09-26）。
// Vercel の無料プランは定期実行が1日1回までなので、5分おきに pg_cron から呼ばれている
// notify-preorder-starts に相乗りする（関数も定期実行も増やさない）。
//
// いつ取り直すか（JST）:
//   予約開始  開始時刻（無ければ 9:00）から3時間、20分おき
//   予約終了  終了時刻（無ければ 23:59）から3時間、30分おき
//   発売日    発売時刻があればそこから3時間・30分おき。無ければその日いっぱい・60分おき
// 節目を過ぎてから一度も取っていなければ、間隔に関係なくすぐ取る。
import type { SupabaseClient } from '@supabase/supabase-js';
import { lookupByUrl, unwrapProductUrl, isSetTitle } from './_product-search.js';
import { isSearchPage, representativePrice, type OfferRow } from './_offers.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any>;
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
const MIN = 60_000;

function jstDate(offsetDays = 0): string {
  return new Date(Date.now() + 9 * 3600_000 + offsetDays * 86400_000).toISOString().slice(0, 10);
}
const at = (date: string, time: string | null | undefined, fallback: string) =>
  Date.parse(`${date}T${(time ?? fallback).slice(0, 5)}:00+09:00`);

interface Window { from: number; to: number; every: number }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function windows(r: any): Window[] {
  const w: Window[] = [];
  if (r.preorder_start_date) { const b = at(r.preorder_start_date, r.preorder_start_time, '09:00'); w.push({ from: b, to: b + 180 * MIN, every: 20 * MIN }); }
  if (r.preorder_end_date) { const b = at(r.preorder_end_date, r.preorder_end_time, '23:59'); w.push({ from: b, to: b + 180 * MIN, every: 30 * MIN }); }
  if (r.event_date && !r.date_label) {
    if (r.event_time) { const b = at(r.event_date, r.event_time, '00:00'); w.push({ from: b, to: b + 180 * MIN, every: 30 * MIN }); }
    else { const b = at(r.event_date, null, '00:00'); w.push({ from: b, to: b + 1440 * MIN, every: 60 * MIN }); }
  }
  return w.filter((x) => !Number.isNaN(x.from));
}

/** 今が節目の窓の中で、前に取ってから間隔が空いていれば、取り直すべき（節目より前に取ったきりなら必ず） */
function due(ws: Window[], lastFetch: number, now: number): number | null {
  let urgent: number | null = null;
  for (const w of ws) {
    if (now < w.from || now > w.to) continue;
    if (lastFetch < w.from || now - lastFetch >= w.every) urgent = Math.min(urgent ?? Infinity, now - w.from);
  }
  return urgent;
}

export async function refreshAroundBoundaries(db: Db, budgetMs: number): Promise<{ checked: number; refreshed: number; changed: number }> {
  const started = Date.now();
  const days = [jstDate(-1), jstDate()];
  const cols = 'id, price, offers, event_date, event_time, date_label, preorder_start_date, preorder_start_time, preorder_end_date, preorder_end_time';
  const list = days.join(',');
  const { data } = await db.from('events').select(cols).eq('type', 'goods').eq('pool', 0)
    .or(`preorder_start_date.in.(${list}),preorder_end_date.in.(${list}),event_date.in.(${list})`);
  const now = Date.now();
  // 取り直す順: 節目を過ぎた直後のものから
  const targets = (data ?? []).map((r) => {
    const offers = (Array.isArray(r.offers) ? r.offers : []) as OfferRow[];
    const fetched = offers.filter((o) => !isSearchPage(o.url)).map((o) => (o.fetchedAt ? Date.parse(o.fetchedAt) : 0));
    const last = fetched.length ? Math.min(...fetched) : now; // 取れるリンクが無ければ対象外
    return { r, offers, urgent: fetched.length ? due(windows(r), last, now) : null };
  }).filter((x) => x.urgent !== null).sort((a, b) => a.urgent! - b.urgent!);
  if (!targets.length) return { checked: (data ?? []).length, refreshed: 0, changed: 0 };

  // 共同編集で取り消されたリンクは取り直さない・代表にしない
  const { data: edits } = await db.from('event_edits').select('event_id, patch')
    .in('event_id', targets.map((t) => t.r.id)).not('patch->removedOfferUrls', 'is', null);
  const removedBy = new Map<string, Set<string>>();
  for (const e of edits ?? []) {
    const set = removedBy.get(e.event_id as string) ?? new Set<string>();
    for (const u of ((e.patch as { removedOfferUrls?: string[] })?.removedOfferUrls ?? [])) set.add(u);
    removedBy.set(e.event_id as string, set);
  }

  let refreshed = 0, changed = 0;
  for (const { r, offers } of targets) {
    if (Date.now() - started > budgetMs) break;
    const removed = removedBy.get(r.id as string) ?? new Set<string>();
    const before = JSON.stringify(offers.map((o) => [o.price, o.inStock, o.stockLabel]));
    const stamp = new Date().toISOString();
    for (const o of offers) {
      if (removed.has(o.url) || isSearchPage(o.url)) continue;
      const hit = await lookupByUrl(o.url).catch(() => null);
      await delay(/rakuten/.test(unwrapProductUrl(o.url)) ? 1100 : 200);
      o.fetchedAt = stamp; // 取れなくても「見に行った」印は付ける（同じ窓で何度も叩かない）
      if (!hit) continue;
      o.price = hit.price;
      o.inStock = hit.inStock;
      o.stockLabel = hit.stockLabel;
      if (hit.shop) o.shop = hit.shop;
      if (hit.title) o.isSet = isSetTitle(hit.title);
    }
    const live = offers.filter((o) => !removed.has(o.url));
    const price = representativePrice(live, (r.price as number | null) ?? null, removed.size > 0);
    const { error } = await db.from('events').update({ offers, price }).eq('id', r.id);
    if (!error) {
      refreshed++;
      if (before !== JSON.stringify(offers.map((o) => [o.price, o.inStock, o.stockLabel]))) changed++;
    }
  }
  return { checked: (data ?? []).length, refreshed, changed };
}

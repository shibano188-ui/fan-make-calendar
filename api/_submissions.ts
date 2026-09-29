import type { SupabaseClient } from '@supabase/supabase-js';
import { readEvidence, judgeClaim, isReadableStore } from './_factcheck.js';
import { isXPostUrl, fetchTweetContent, extractWithRetry, forceOrderMade, EXTRACT_PROMPT_TWEET } from './parse-event.js';
import { fetchProductList, excludeRegistered } from './_listsource.js';
import { listEvents } from './_listgroup.js';
import { registerEvents, workKey } from './_crawl.js';
import { botCanFetch } from './_pace.js';

// ボットが最優先でやる2つ（2026-09-29 投稿の方法の作り直し）。10分おきの巡回の最初に呼ぶ（api/metrics.ts）。
//
// ① ＋αの提案（edit_proposals）を確かめて反映する。Google マップの「情報の修正を提案」と Waze の確認にならう:
//   - 別の人が同じ提案をしている（2人以上）→ 反映
//   - リンク（提案と一緒に貼られたURL・予定の購入リンク・ソース）を読み、AI が照らし合わせる
//       裏付けあり → 反映 ／ 食い違い → 却下 ／ 分からない → そのまま待つ（ほかの人の「合っている」を待つ）
//   - 14日たっても決まらなければ取り下げ
//   反映は event_edits（日付・状況・値段）と event_offer_contribs（購入リンク）に、提案した人の名前で書く
//
// ② 情報を送る（info_submissions）を読んで予定にする:
//   - Xのポスト … AI で読み、日付とタイトルが読めたら、同じ予定が無ければ送った人を投稿者にして公開。あればソースに足す
//   - 決まった店の一覧 … 巡回と同じ登録（JANコード等で二重登録を防ぐ）
//   - それ以外のURL・作品が見つからない … 運営の確認待ち（needs_review）
// 送った人には結果を出さない（「しばらくすると反映されます」とだけ伝える。柴野）。

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any>;
type Patch = Record<string, unknown> & { addedOfferUrl?: string };

const EXPIRE_MS = 14 * 24 * 60 * 60 * 1000;
const same = (a: Patch, b: Patch) => JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort());

const STATUS_WORD: Record<string, string> = {
  preorder_soon: '予約開始前', preorder: '予約受付中', preorder_ended: '予約終了',
  sale_soon: '発売前', onsale: '発売中（在庫あり・販売中）', ended: '発売済み・販売終了',
};

/** 提案を「確かめたいこと」の文にする */
function claimsOf(p: Patch): string[] {
  const out: string[] = [];
  if ('date' in p) out.push(`発売日・開催日が ${p.date ?? 'なし'}`);
  if ('endDate' in p) out.push(`終了日が ${p.endDate ?? 'なし'}`);
  if ('time' in p) out.push(`時刻が ${p.time ?? 'なし'}`);
  if ('preorderStart' in p) out.push(`予約・受付の開始が ${p.preorderStart ?? 'なし'}`);
  if ('preorderEnd' in p) out.push(`予約・受付の締切が ${p.preorderEnd ?? 'なし'}`);
  if ('isOrderMade' in p) out.push(p.isOrderMade ? '予約・受注販売がある' : '予約・受注販売ではない');
  if (typeof p.saleStatus === 'string') out.push(`今の状態が「${STATUS_WORD[p.saleStatus] ?? p.saleStatus}」`);
  if (typeof p.price === 'number') out.push(`値段が ${p.price}円（税込）`);
  if (p.addedOfferUrl) out.push(`${p.addedOfferUrl} はこの予定の商品の販売ページ`);
  return out;
}

function retailerOf(url: string): string {
  try { return new URL(url).host.replace(/^www\./, ''); } catch { return url; }
}

/** 提案を反映する（提案した人の名前で書く） */
async function applyProposal(db: Db, eventId: string, patch: Patch, by: string): Promise<boolean> {
  const { addedOfferUrl, ...rest } = patch;
  if (addedOfferUrl) {
    const { error } = await db.from('event_offer_contribs').insert({
      event_id: eventId, created_by: by,
      offer: { url: addedOfferUrl, retailer: retailerOf(addedOfferUrl), pinned: true },
    });
    if (error) return false;
  }
  if (Object.keys(rest).length) {
    const { error } = await db.from('event_edits').insert({ event_id: eventId, patch: rest, created_by: by });
    if (error) return false;
  }
  return true;
}

export async function processProposals(db: Db, budgetMs: number): Promise<Record<string, number>> {
  const started = Date.now();
  const out = { applied: 0, rejected: 0, waiting: 0, expired: 0 };
  const { data: pending } = await db.from('edit_proposals')
    .select('id, event_id, patch, evidence_urls, created_by, created_at, checked_at')
    .eq('status', 'pending').order('created_at', { ascending: true }).limit(200);
  if (!pending?.length) return out;

  const done = new Set<string>();
  const mark = async (ids: string[], status: 'applied' | 'rejected', reason: string | null) => {
    await db.from('edit_proposals').update({ status, reason, checked_at: new Date().toISOString() }).in('id', ids);
    ids.forEach((id) => done.add(id));
  };

  // 1. 別の人が同じ提案をしていれば反映（Waze 式）。期限切れは取り下げ
  for (const p of pending) {
    if (done.has(p.id)) continue;
    const group = pending.filter((q) => q.event_id === p.event_id && !done.has(q.id) && same(q.patch as Patch, p.patch as Patch));
    const people = new Set(group.map((q) => q.created_by));
    if (people.size >= 2) {
      if (await applyProposal(db, p.event_id, p.patch as Patch, p.created_by)) { await mark(group.map((q) => q.id), 'applied', `${people.size}人が同じ内容`); out.applied++; }
    } else if (Date.now() - Date.parse(p.created_at) > EXPIRE_MS) {
      await mark([p.id], 'rejected', '確かめられませんでした'); out.expired++;
    }
  }

  // 2. まだ確かめていないものを、リンクで確かめる（1件ずつ・時間の許す限り）
  for (const p of pending) {
    if (done.has(p.id) || p.checked_at) continue;
    if (Date.now() - started > budgetMs) break;
    const { data: ev } = await db.from('events').select('id, title, link_url, source_url, offers').eq('id', p.event_id).maybeSingle();
    if (!ev) { await mark([p.id], 'rejected', '予定が見つかりません'); continue; }
    const patch = p.patch as Patch;
    const offerUrls = (Array.isArray(ev.offers) ? ev.offers : []).map((o: { url?: string }) => o.url).filter(Boolean) as string[];
    const urls = [...new Set([...(p.evidence_urls ?? []), patch.addedOfferUrl, ev.source_url, ev.link_url, ...offerUrls].filter(Boolean) as string[])].slice(0, 4);
    const evidence = (await Promise.all(urls.map((u) => readEvidence(u)))).filter((t): t is string => !!t);
    const r = await judgeClaim({ eventTitle: String(ev.title), claims: claimsOf(patch), evidence });
    if (r.verdict === 'supported') {
      const group = pending.filter((q) => q.event_id === p.event_id && !done.has(q.id) && same(q.patch as Patch, patch));
      if (await applyProposal(db, p.event_id, patch, p.created_by)) { await mark(group.map((q) => q.id), 'applied', r.reason || 'リンクで確認'); out.applied++; }
    } else if (r.verdict === 'contradicted') {
      await mark([p.id], 'rejected', r.reason || 'リンクの内容と合いません'); out.rejected++;
    } else {
      // 分からない。ほかの人の「合っている」を待つ（同じものを毎回読み直さないよう、確かめた印だけ付ける）
      await db.from('edit_proposals').update({ checked_at: new Date().toISOString() }).eq('id', p.id);
      out.waiting++;
    }
  }
  return out;
}

// ── 情報を送る ─────────────────────────────────────────────

const normTitle = (s: string) => s.normalize('NFKC').toLowerCase().replace(/[\s!?・/\\\-ー~〜、。,.:;'"「」『』【】[\]()（）《》<>＜＞#＆&+*★☆♪]/g, '');
const GOODS_WORDS = ['グッズ', 'グルメ', '書籍', 'くじ', 'ガチャ', 'プライズ', '食玩', 'ぬい', 'アクスタ', '缶バッジ', 'キーホルダー', 'フィギュア', 'ステッカー', 'アパレル', '文房具', 'カード', '円盤', 'コスメ', 'ガジェット', '雑貨'];
const EVENT_WORDS = ['イベント', 'アニメ・映画', '誕生日', 'キャンペーン'];

/** 作品を名前・別名で探す（無ければ作らない＝運営の確認待ちにする） */
async function findWork(db: Db, name: string): Promise<string | null> {
  const { data: exact } = await db.from('works').select('id').eq('name', name.trim()).limit(1).maybeSingle();
  if (exact?.id) return exact.id as string;
  const k = workKey(name);
  const { data: al } = await db.from('work_aliases').select('work_id').eq('alias_norm', k).limit(1).maybeSingle();
  if (al?.work_id) return al.work_id as string;
  const { data: works } = await db.from('works').select('id, name').ilike('name', `%${name.trim().slice(0, 2)}%`).limit(200);
  return ((works ?? []).find((w) => workKey(String(w.name)) === k)?.id as string | undefined) ?? null;
}

type Raw = Record<string, unknown>;
const str = (v: unknown) => (typeof v === 'string' && v && v !== 'null' ? v : null);

function categoriesOf(r: Raw): string[] {
  const list = Array.isArray(r.categories) ? r.categories : r.category ? [r.category] : [];
  return list.map(String).filter(Boolean);
}

/** Xのポスト1件を予定にする。作った予定・足した予定の id を返す */
async function fromXPost(db: Db, url: string, workId: string, userId: string, comment: string | null): Promise<{ created: string[]; merged: string[] }> {
  const { text } = await fetchTweetContent(url);
  if (text.startsWith('URL: ')) return { created: [], merged: [] };
  const context = comment ? `${text}\n\n送った人のひとこと: ${comment}` : text;
  const parsed = (await extractWithRetry(EXTRACT_PROMPT_TWEET, context, 800).catch(() => [])) as Raw[];
  forceOrderMade(parsed, context);
  const { data: rows } = await db.from('events').select('id, title, event_date').eq('work_id', workId).eq('pool', 0);
  const created: string[] = [];
  const merged: string[] = [];
  for (const r of parsed) {
    const title = str(r.title);
    const date = str(r.date);
    // 日付とタイトルが読めたものだけ（予約の締切だけ分かるものも入れる）
    if (!title || !(date || str(r.preorderEnd))) continue;
    const key = normTitle(title);
    const dup = (rows ?? []).find((x) => {
      const k = normTitle(String(x.title ?? ''));
      return (x.event_date ?? null) === date && (k === key || (key.length >= 6 && (k.includes(key) || key.includes(k))));
    });
    if (dup) {
      // 同じ予定がある。新しく作らず、ソースとして足す
      await db.from('event_edits').insert({ event_id: dup.id, patch: { addedSourceUrls: [url] }, created_by: userId });
      merged.push(dup.id as string);
      continue;
    }
    const cats = categoriesOf(r);
    const type = cats.some((c) => EVENT_WORDS.includes(c)) ? 'event' : cats.some((c) => GOODS_WORDS.includes(c)) ? 'goods' : 'event';
    const dateLabel = str(r.dateLabel);
    const isOrder = r.isOrderMade === true;
    const { data, error } = await db.from('events').insert({
      work_id: workId, title, type,
      event_date: date, date_label: dateLabel,
      end_date: dateLabel ? null : str(r.endDate), event_time: dateLabel ? null : str(r.time), end_time: dateLabel ? null : str(r.endTime),
      category: cats.length > 1 ? JSON.stringify(cats) : cats[0] ?? null,
      link_url: str(r.link), image_url: str(r.imageUrl), memo: str(r.memo),
      prefecture: str(r.prefecture)?.replace(/[都府県]$/, '') ?? null, location_detail: str(r.locationDetail),
      is_order_made: isOrder,
      preorder_start_date: isOrder ? str(r.preorderStart) : null, preorder_end_date: isOrder ? str(r.preorderEnd) : null,
      source_url: url, author_id: userId, pool: 0, offers: [],
    }).select('id, title, event_date').single();
    if (!error && data) { created.push(data.id as string); rows?.push(data); }
  }
  return { created, merged };
}

export async function processSubmissions(db: Db, budgetMs: number): Promise<Record<string, number>> {
  const started = Date.now();
  const out = { published: 0, merged: 0, review: 0, rejected: 0 };
  const { data: subs } = await db.from('info_submissions')
    .select('id, user_id, work_name, urls, comment').eq('status', 'pending').order('created_at', { ascending: true }).limit(5);
  for (const s of subs ?? []) {
    if (Date.now() - started > budgetMs) break;
    const finish = (status: string, reason: string | null, ids: string[] = []) =>
      db.from('info_submissions').update({ status, reason, result_event_ids: ids, processed_at: new Date().toISOString() }).eq('id', s.id);
    // アニメイトの一覧は間隔（約20分に1回）が空くまで待つ（次の回に回す）
    const urlsOf = (s.urls as string[]) ?? [];
    if (urlsOf.some((u) => /animate-onlineshop\.jp/.test(u)) && !botCanFetch('www.animate-onlineshop.jp')) continue;
    const workId = await findWork(db, String(s.work_name));
    if (!workId) { await finish('needs_review', '作品が見つかりません'); out.review++; continue; }
    const created: string[] = [];
    const merged: string[] = [];
    let unreadable = 0;
    for (const url of (s.urls as string[]) ?? []) {
      try {
        if (isXPostUrl(url)) {
          const r = await fromXPost(db, url, workId, s.user_id as string, (s.comment as string | null) ?? null);
          created.push(...r.created); merged.push(...r.merged);
        } else if (isReadableStore(url)) {
          // 決まった店の一覧ページ。巡回と同じ登録（登録済みの商品は外す・JANコード等で二重登録を防ぐ）
          const read = await fetchProductList(url).catch(() => null);
          if (!read) { unreadable++; continue; }
          const { list, excluded } = await excludeRegistered(read).catch(() => ({ list: read, excluded: 0 }));
          if (!list.products.length) { if (excluded) merged.push('store'); continue; }
          const events = await listEvents(list, String(s.work_name));
          const { data: rows } = await db.from('events').select('id, title, event_date, offers, price').eq('work_id', workId).eq('pool', 0);
          const before = new Set((rows ?? []).map((x) => x.id as string));
          const res = await registerEvents(db, workId, events, rows ?? [], s.user_id as string, null, null);
          for (const x of rows ?? []) if (!before.has(x.id as string)) created.push(x.id as string);
          if (res.merged) merged.push('store');
        } else {
          unreadable++;
        }
      } catch { unreadable++; }
    }
    const ids = [...new Set([...created, ...merged.filter((m) => m !== 'store')])];
    if (created.length) { await finish('published', null, ids); out.published++; }
    else if (merged.length) { await finish('merged', 'すでに登録されている予定でした', ids); out.merged++; }
    else if (unreadable) { await finish('needs_review', 'ボットでは読めないURL'); out.review++; }
    else { await finish('rejected', '日付とタイトルが読めませんでした'); out.rejected++; }
  }
  return out;
}

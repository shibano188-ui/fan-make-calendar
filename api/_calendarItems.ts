import type { SupabaseClient } from '@supabase/supabase-js';
import { loadEventPatches, applyPatchesToRows } from './_edits.js';

// 外部カレンダーに出す予定の一覧（購読URL api/ics と Googleで連携 api/_gcal の共通部品）。
// どちらも「その人のアプリのカレンダーと同じ範囲」を出す: いいねした予定・ここ行く!・受付開始/締切・自分用の予定。

export type CalendarItem = {
  uid: string;           // 予定ごとに変わらないキー（ics の UID・Google の予定ID の元）
  summary: string;
  start: string;         // YYYY-MM-DD
  end: string | null;    // 全日の最終日（含む）。null なら1日だけ
  time: string | null;   // HH:MM（日本時間）。null なら全日
  desc: string;
  url: string;           // 無ければ空
  workId: string | null; // 作品カラー用
};

type EventRow = {
  id: string; title: string; event_date: string | null; end_date: string | null; date_label: string | null;
  event_time: string | null; preorder_start_date: string | null; preorder_start_time: string | null;
  preorder_end_date: string | null; memo: string | null; link_url: string | null;
  work_id: string | null; works: { name: string } | null;
};

// メモ欄。Google は URL 欄を画面に出さないので、リンクはメモ欄にも書く（端末カレンダー版と同じ並び）。
function describe(e: EventRow, url: string): string {
  return [e.memo?.trim(), e.works?.name ? `作品: ${e.works.name}` : '', url].filter(Boolean).join('\n');
}

/** プレミアム（active / grace で期限内）か。切れていたら外部カレンダーには何も出さない */
export async function isPremium(db: SupabaseClient, userId: string): Promise<boolean> {
  const { data: sub } = await db
    .from('user_private').select('subscription_status, subscription_expires_at').eq('user_id', userId).maybeSingle();
  const status = (sub?.subscription_status as string | null) ?? 'free';
  const expires = sub?.subscription_expires_at as string | null;
  return (status === 'active' || status === 'grace') && (!expires || Date.parse(expires) > Date.now());
}

export async function loadCalendarItems(db: SupabaseClient, userId: string): Promise<CalendarItem[]> {
  // 保存した予定＝自分がカレンダーに入れたもの（アプリのカレンダーと同じ範囲）。
  // 自分の投稿でも、保存していなければ入れない（投稿時に入れるかはフォームのトグルで決める）
  const { data: likeRows } = await db.from('likes').select('event_id').eq('user_id', userId);
  const likedIds = (likeRows ?? []).map((r) => r.event_id as string);
  const cols = 'id, title, event_date, end_date, date_label, event_time, preorder_start_date, preorder_start_time, preorder_end_date, memo, link_url, work_id, works(name)';
  const results = likedIds.length
    ? [await db.from('events').select(cols).eq('pool', 0).in('id', likedIds)]
    : [];
  // 共同編集で直した日付を重ねる（アプリ内と同じ実効値にする）
  const patches = await loadEventPatches(db, likedIds);

  // 「ここ行く!」を登録した予定は、**その日だけ**を出す。
  // 長期のコラボカフェ等を全期間で出すとカレンダーが何週間も埋まる
  // （アプリ内の表示・ローカル通知は既に行く日基準。ここと端末カレンダーだけ全期間だった）。
  const { data: visitRows } = await db
    .from('event_visits').select('id, event_id, start_date, end_date').eq('user_id', userId);
  const visitsByEvent = new Map<string, { id: string; start: string; end: string }[]>();
  for (const v of visitRows ?? []) {
    const list = visitsByEvent.get(v.event_id as string) ?? [];
    list.push({ id: String(v.id), start: v.start_date as string, end: v.end_date as string });
    visitsByEvent.set(v.event_id as string, list);
  }

  const seen = new Set<string>();
  const items: CalendarItem[] = [];
  for (const { data } of results) {
    for (const e of applyPatchesToRows((data ?? []) as unknown as EventRow[], patches)) {
      if (seen.has(e.id)) continue;
      seen.add(e.id);
      const url = e.link_url ?? ''; // リンクが無い予定は出さない（FanHive のページで代わりにしない。柴野）
      const desc = describe(e, url);
      const base = { desc, url, workId: e.work_id ?? null };
      const visits = visitsByEvent.get(e.id) ?? [];
      if (visits.length) {
        for (const v of visits) {
          // 1日だけの来店で時刻があるなら時刻を活かす（開催時間のあるイベント用）
          const single = v.start === v.end;
          items.push({ ...base, uid: `${e.id}-visit-${v.id}`, summary: e.title, start: v.start,
            end: single ? null : v.end, time: single ? e.event_time?.slice(0, 5) ?? null : null });
        }
      } else if (e.event_date) {
        // 曖昧日付（「7月上旬」など）は date が代表日でしかなく、期間・時刻は意味を持たない
        // （rowToEvent と同じ不変条件）。カレンダーには代表日の全日予定として置き、
        // 見た人が誤解しないようタイトルにラベルを添える。
        const vague = !!e.date_label;
        items.push({ ...base, uid: e.id, summary: vague ? `${e.title}（${e.date_label}）` : e.title, start: e.event_date,
          end: vague ? null : e.end_date, time: vague ? null : e.event_time?.slice(0, 5) ?? null });
      }
      // 受付開始も、日付が別なら独立した予定として出す。時刻が分かればその時刻に置く
      // （人気のグッズは開始から数分で売り切れる。通知と同じく一番大事な日なのに入っていなかった。2026-10-05 柴野）
      if (e.preorder_start_date && e.preorder_start_date !== e.event_date) {
        items.push({ ...base, uid: `${e.id}-start`, summary: `【受付開始】${e.title}`, start: e.preorder_start_date,
          end: null, time: e.preorder_start_time?.slice(0, 5) ?? null });
      }
      // 受付の締切は見逃すと取り返しがつかないので、日付が別なら独立した予定として出す
      if (e.preorder_end_date && e.preorder_end_date !== e.event_date) {
        items.push({ ...base, uid: `${e.id}-deadline`, summary: `【締切】${e.title}`, start: e.preorder_end_date, end: null, time: null });
      }
    }
  }

  // 自分用の予定（personal_events・2026-09-29）も同じカレンダーに出す。アプリのカレンダーと同じ範囲にそろえる。
  // テーブルがまだ無い環境では error が返るだけなので、黙って飛ばす
  const { data: personal } = await db.from('personal_events')
    .select('id, title, event_date, end_date, event_time, memo, link_url, work_id').eq('user_id', userId);
  for (const p of personal ?? []) {
    if (!p.event_date) continue;
    const url = (p.link_url as string | null) ?? '';
    items.push({
      uid: `personal-${p.id}`, summary: String(p.title), start: p.event_date as string,
      end: (p.end_date as string | null) ?? null, time: ((p.event_time as string | null) ?? null)?.slice(0, 5) ?? null,
      desc: [((p.memo as string | null) ?? '').trim(), url].filter(Boolean).join('\n'), url,
      workId: (p.work_id as string | null) ?? null,
    });
  }
  return items;
}

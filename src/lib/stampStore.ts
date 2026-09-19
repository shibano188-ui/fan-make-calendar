import { useEffect, useSyncExternalStore } from 'react';
import { supabase } from './supabase';

// 予定ごとのスタンプ（リアクション）。1人が複数押せる（sql/2026-09-20-event-stamps.sql）。
// カード・詳細ページで同じ状態を共有し、一覧に並んだ分はまとめて1回で取りに行く。

export type StampState = { counts: Record<string, number>; mine: string[] };

const EMPTY: StampState = { counts: {}, mine: [] };
const map = new Map<string, StampState>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

let userId: string | null = null;
const pending = new Set<string>();
const requested = new Set<string>();
let timer: ReturnType<typeof setTimeout> | null = null;

/** 自分のIDを伝える（どれが自分の押したものかの判定用）。変わったら取り直す */
export function setStampUser(id: string | null): void {
  if (userId === id) return;
  userId = id;
  // 「自分の分」が変わるので、画面に出ている予定を取り直す
  const shown = [...requested];
  requested.clear();
  shown.forEach(request);
}

function request(eventId: string): void {
  if (requested.has(eventId)) return;
  requested.add(eventId);
  pending.add(eventId);
  // 同じ描画で並んだカードの分を1回にまとめる
  if (!timer) timer = setTimeout(flush, 30);
}

async function flush(): Promise<void> {
  timer = null;
  const ids = [...pending];
  pending.clear();
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const { data, error } = await supabase.from('event_stamps').select('event_id, user_id, stamp').in('event_id', chunk);
    if (error) { chunk.forEach((id) => requested.delete(id)); continue; }
    const next = new Map<string, StampState>(chunk.map((id) => [id, { counts: {}, mine: [] }]));
    for (const r of data ?? []) {
      const s = next.get(r.event_id as string)!;
      s.counts[r.stamp as string] = (s.counts[r.stamp as string] ?? 0) + 1;
      if (userId && r.user_id === userId) s.mine.push(r.stamp as string);
    }
    next.forEach((s, id) => map.set(id, s));
  }
  emit();
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

export function useStamps(eventId: string): StampState {
  useEffect(() => { request(eventId); }, [eventId]);
  return useSyncExternalStore(subscribe, () => map.get(eventId) ?? EMPTY, () => map.get(eventId) ?? EMPTY);
}

/** 押す／取り消す。先に画面を変え、失敗したら戻す */
export async function toggleStamp(eventId: string, stamp: string): Promise<void> {
  if (!userId) return;
  const prev = map.get(eventId) ?? EMPTY;
  const on = !prev.mine.includes(stamp);
  const counts = { ...prev.counts, [stamp]: Math.max(0, (prev.counts[stamp] ?? 0) + (on ? 1 : -1)) };
  if (counts[stamp] === 0) delete counts[stamp];
  map.set(eventId, { counts, mine: on ? [...prev.mine, stamp] : prev.mine.filter((s) => s !== stamp) });
  emit();
  const { error } = on
    ? await supabase.from('event_stamps').insert({ event_id: eventId, user_id: userId, stamp })
    : await supabase.from('event_stamps').delete().eq('event_id', eventId).eq('user_id', userId).eq('stamp', stamp);
  if (error && error.code !== '23505') { map.set(eventId, prev); emit(); }
}

/** カードに出す1つ：一番多く押されたスタンプ（同数なら並び順が先のもの） */
export function topStamp(s: StampState, order: readonly string[]): string | null {
  let best: string | null = null;
  for (const t of order) if ((s.counts[t] ?? 0) > (best ? s.counts[best] : 0)) best = t;
  return best;
}

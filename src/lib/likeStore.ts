import { useSyncExternalStore } from 'react';

// タイル・詳細ページ間でいいね状態(自分の押下＋総数)を共有し、
// 片方で操作した結果を全ビューへ即時反映してカウントのズレを防ぐ。
export type LikeState = { liked: boolean; count: number };

const map = new Map<string, LikeState>();
const listeners = new Set<() => void>();

export function setLike(eventId: string, s: LikeState): void {
  map.set(eventId, s);
  listeners.forEach((l) => l());
}

export function getLike(eventId: string): LikeState | undefined {
  return map.get(eventId);
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

// ストアに登録があればそれを、無ければ fallback(初期表示値)を返す。
export function useLike(eventId: string, fallback: LikeState): LikeState {
  const snap = useSyncExternalStore(
    subscribe,
    () => map.get(eventId),
    () => map.get(eventId),
  );
  return snap ?? fallback;
}

import { pushAppState } from './appState';

// 作品の並び順。カスタマイズの「作品の色と画像」で入れ替えたものを、
// 上の作品チップ（カレンダー・探す・ホーム）にも効かせる。
// 並びはアカウントにも同期する（user_app_state.work_order）。
// ここに無い作品（新しくフォローしたもの）は後ろに、元の順のまま並ぶ。

const KEY = 'fan_work_order';

export function loadWorkOrder(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    const v = raw ? JSON.parse(raw) as string[] : null;
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  } catch { return []; }
}

export function saveWorkOrder(ids: string[]): void {
  try { localStorage.setItem(KEY, JSON.stringify(ids)); } catch { /* 保存できなくても並びは効く */ }
  pushAppState('work_order', ids);
}

/** 保存した並びの順に並べ替える（知らない作品は後ろ） */
export function sortByWorkOrder<T extends { id: string }>(works: T[]): T[] {
  const order = loadWorkOrder();
  if (order.length === 0) return works;
  const rank = new Map(order.map((id, i) => [id, i]));
  return [...works].sort((a, b) => (rank.get(a.id) ?? Infinity) - (rank.get(b.id) ?? Infinity));
}

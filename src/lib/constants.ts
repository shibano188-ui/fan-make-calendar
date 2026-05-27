export const POST_CATEGORIES = ['単行本', 'グッズ', 'イベント', '誕生日', '配信'] as const;
export type PostCategory = (typeof POST_CATEGORIES)[number];

const CATEGORY_FILTERS_KEY = 'fan_category_filters';
export function loadCategoryFilters(): Record<string, string[]> {
  try { return JSON.parse(localStorage.getItem(CATEGORY_FILTERS_KEY) ?? '{}'); }
  catch { return {}; }
}
export function saveCategoryFilters(filters: Record<string, string[]>): void {
  localStorage.setItem(CATEGORY_FILTERS_KEY, JSON.stringify(filters));
}

// ─── 発見タブ: マイカレンダーに追加済みのイベントID ─────────────────
const LIKED_EVENTS_KEY = 'fan_liked_event_ids';
export function loadLikedEventIds(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(LIKED_EVENTS_KEY) ?? '[]') as string[]); }
  catch { return new Set(); }
}
export function saveLikedEventIds(ids: Set<string>): void {
  localStorage.setItem(LIKED_EVENTS_KEY, JSON.stringify([...ids]));
}
export function toggleLikedEventId(id: string): Set<string> {
  const set = loadLikedEventIds();
  if (set.has(id)) set.delete(id); else set.add(id);
  saveLikedEventIds(set);
  return new Set(set);
}
export function addLikedEventId(id: string): Set<string> {
  const set = loadLikedEventIds();
  set.add(id);
  saveLikedEventIds(set);
  return new Set(set);
}
export function removeLikedEventId(id: string): Set<string> {
  const set = loadLikedEventIds();
  set.delete(id);
  saveLikedEventIds(set);
  return new Set(set);
}

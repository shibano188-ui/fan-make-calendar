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

// ─── 発見タブ: ❤️いいね（ソーシャルいいね、削除しても残る） ─────────
const LIKED_EVENTS_KEY = 'fan_liked_event_ids';
export function loadLikedEventIds(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(LIKED_EVENTS_KEY) ?? '[]') as string[]); }
  catch { return new Set(); }
}
export function saveLikedEventIds(ids: Set<string>): void {
  localStorage.setItem(LIKED_EVENTS_KEY, JSON.stringify([...ids]));
}
export function addLikedEventId(id: string): Set<string> {
  const set = loadLikedEventIds();
  set.add(id);
  saveLikedEventIds(set);
  return new Set(set);
}

// ─── マイカレンダー管理: カレンダーに追加済みのイベントID ──────────
// likedEventIdsとは独立。削除するとここから除かれる。
const CALENDAR_EVENTS_KEY = 'fan_calendar_event_ids';
export function loadCalendarEventIds(): Set<string> {
  try {
    const raw = localStorage.getItem(CALENDAR_EVENTS_KEY);
    if (raw !== null) return new Set(JSON.parse(raw) as string[]);
    // 初回起動: likedEventIdsから移行
    const liked = loadLikedEventIds();
    if (liked.size > 0) saveCalendarEventIds(liked);
    return new Set(liked);
  } catch { return new Set(); }
}
export function saveCalendarEventIds(ids: Set<string>): void {
  localStorage.setItem(CALENDAR_EVENTS_KEY, JSON.stringify([...ids]));
}
export function addCalendarEventId(id: string): Set<string> {
  const set = loadCalendarEventIds();
  set.add(id);
  saveCalendarEventIds(set);
  return new Set(set);
}
export function removeCalendarEventId(id: string): Set<string> {
  const set = loadCalendarEventIds();
  set.delete(id);
  saveCalendarEventIds(set);
  return new Set(set);
}

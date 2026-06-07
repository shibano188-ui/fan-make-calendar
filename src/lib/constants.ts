export const POST_CATEGORIES = ['単行本', 'グッズ', 'イベント', '誕生日', '映画', 'アニメ', 'グルメ', 'コラボ'] as const;

// ─── カテゴリカラー ───────────────────────────────────────────────────
// 既知カテゴリの固定色
export const CATEGORY_COLOR_MAP: Record<string, string> = {
  '単行本': '#4a9eff',
  'グッズ': '#a855f7',
  'イベント': '#f97316',
  '誕生日': '#ec4899',
  '映画': '#22c55e',
  'アニメ': '#06b6d4',
  'グルメ': '#f59e0b',
  'コラボ': '#ef4444',
};
// 未知・カスタムカテゴリへのフォールバックカラーパレット
const CATEGORY_FALLBACK_PALETTE = [
  '#4a9eff', '#a855f7', '#f97316', '#ec4899', '#22c55e',
  '#f59e0b', '#06b6d4', '#84cc16', '#ef4444', '#8b5cf6',
];
/** カテゴリ文字列から左ボーダー用カラーを返す。カテゴリ未設定は null */
export function getCategoryColor(category?: string): string | null {
  if (!category) return null;
  if (CATEGORY_COLOR_MAP[category]) return CATEGORY_COLOR_MAP[category];
  // 未知カテゴリ: 文字列ハッシュで決定論的に色を割り当て（何が来ても同じ色が返る）
  let hash = 0;
  for (let i = 0; i < category.length; i++) {
    hash = ((hash << 5) - hash) + category.charCodeAt(i);
    hash |= 0;
  }
  return CATEGORY_FALLBACK_PALETTE[Math.abs(hash) % CATEGORY_FALLBACK_PALETTE.length];
}

// ─── 複数リンク: linkフィールドのパース/シリアライズ ─────────────────
// 単一URLはそのまま文字列、複数URLはJSON配列文字列で保存
export function parseLinks(link?: string): string[] {
  if (!link) return [];
  try {
    const parsed = JSON.parse(link);
    if (Array.isArray(parsed)) return (parsed as unknown[]).filter(s => typeof s === 'string' && s) as string[];
    return [link];
  } catch { return [link]; }
}
export function serializeLinks(links: string[]): string | undefined {
  const filtered = links.map(s => s.trim()).filter(Boolean);
  if (filtered.length === 0) return undefined;
  if (filtered.length === 1) return filtered[0];
  return JSON.stringify(filtered);
}
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

// ─── いいねタップ総数カウンター ────────────────────────────────────
const TOTAL_LIKES_GIVEN_KEY = 'fan_total_likes_given';
export function loadTotalLikesGiven(): number {
  try { return parseInt(localStorage.getItem(TOTAL_LIKES_GIVEN_KEY) ?? '0', 10) || 0; }
  catch { return 0; }
}
export function incrementTotalLikesGiven(): void {
  localStorage.setItem(TOTAL_LIKES_GIVEN_KEY, String(loadTotalLikesGiven() + 1));
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

// ─── 重要フラグ: 自分だけに見える優先度マーク ──────────────────────
// ─── 通知ベル ──────────────────────────────────────────────────────────
const BELL_EVENTS_KEY = 'fan_bell_event_ids';
export function loadBellEventIds(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(BELL_EVENTS_KEY) ?? '[]') as string[]); }
  catch { return new Set(); }
}
export function saveBellEventIds(ids: Set<string>): void {
  localStorage.setItem(BELL_EVENTS_KEY, JSON.stringify([...ids]));
}
export function toggleBellEventId(id: string): Set<string> {
  const set = loadBellEventIds();
  if (set.has(id)) set.delete(id); else set.add(id);
  saveBellEventIds(set);
  return new Set(set);
}

const IMPORTANT_EVENTS_KEY = 'fan_important_event_ids';
export function loadImportantEventIds(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(IMPORTANT_EVENTS_KEY) ?? '[]') as string[]); }
  catch { return new Set(); }
}
export function saveImportantEventIds(ids: Set<string>): void {
  localStorage.setItem(IMPORTANT_EVENTS_KEY, JSON.stringify([...ids]));
}
export function toggleImportantEventId(id: string): Set<string> {
  const set = loadImportantEventIds();
  if (set.has(id)) set.delete(id); else set.add(id);
  saveImportantEventIds(set);
  return new Set(set);
}

// ─── 地域フィルター: Calendar ↔ Discover 間で共有 ─────────────────────
const REGION_FILTER_KEY = 'fan_region_filter';
export type FilterMode = 'none' | 'pref' | 'region';
export interface RegionFilter {
  filterMode: FilterMode;
  filterValue: string | null;
  includeAdjacent: boolean;
}
export function loadRegionFilter(): RegionFilter {
  try {
    const raw = localStorage.getItem(REGION_FILTER_KEY);
    if (!raw) return { filterMode: 'none', filterValue: null, includeAdjacent: false };
    return JSON.parse(raw) as RegionFilter;
  } catch { return { filterMode: 'none', filterValue: null, includeAdjacent: false }; }
}
export function saveRegionFilter(filter: RegionFilter): void {
  localStorage.setItem(REGION_FILTER_KEY, JSON.stringify(filter));
}

// ─── イベントキュー（Xから共有してストックする機能）──────────────────────
export type ShareMode = 'stock' | 'immediate';
const SHARE_MODE_KEY = 'fan_share_mode';
const EVENT_QUEUE_KEY = 'fan_event_queue';

export interface QueuedEvent {
  title: string | null;
  date: string | null;
  time: string | null;
  endDate: string | null;
  endTime: string | null;
  category: string | null;
  prefecture: string | null;
  locationDetail: string | null;
  link: string | null;
  memo: string | null;
  queuedAt: string;
}

export function loadShareMode(): ShareMode {
  return (localStorage.getItem(SHARE_MODE_KEY) as ShareMode) ?? 'stock';
}
export function saveShareMode(mode: ShareMode): void {
  localStorage.setItem(SHARE_MODE_KEY, mode);
}
export function loadEventQueue(): QueuedEvent[] {
  try { return JSON.parse(localStorage.getItem(EVENT_QUEUE_KEY) ?? '[]'); } catch { return []; }
}
export function addToEventQueue(event: Omit<QueuedEvent, 'queuedAt'>): void {
  const queue = loadEventQueue();
  queue.push({ ...event, queuedAt: new Date().toISOString() });
  localStorage.setItem(EVENT_QUEUE_KEY, JSON.stringify(queue));
}
export function removeFromEventQueue(indices: number[]): void {
  const queue = loadEventQueue();
  const next = queue.filter((_, i) => !indices.includes(i));
  localStorage.setItem(EVENT_QUEUE_KEY, JSON.stringify(next));
}
export function clearEventQueue(): void {
  localStorage.removeItem(EVENT_QUEUE_KEY);
}

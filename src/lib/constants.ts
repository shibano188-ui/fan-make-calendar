export const POST_CATEGORIES = ['書籍', 'グッズ', 'イベント', '誕生日', 'アニメ・映画', 'グルメ', 'キャンペーン'] as const;

// ─── クローズドテスト中の暫定フラグ（作品2つフェーズ）─────────────────────
// 初回起動した人を自動参加させるデフォルト作品（名前で照合）
export const DEFAULT_WORK_NAMES = ['ちいかわ', 'ハイキュー!!'];
// 作品タブの「人気のカレンダー」表示。作品が増えたら true に戻す
export const SHOW_POPULAR_CALENDARS = false;
// 初回起動時のオンボーディング案内。再度出すなら true に戻す
export const SHOW_ONBOARDING = false;

// イベントで物販あり＝このカテゴリを付ける。探す→グッズ一覧にもそのイベントを出す。
export const GOODS_TAG = 'グッズあり';

// ─── グッズのサブ種別（入れ子。グッズ選択時のみ表示・任意） ─────────────
export const GOODS_PARENT = 'グッズ';
export const GOODS_SUBCATEGORIES = ['くじ', 'ガチャ', 'プライズ', '食玩', 'ぬい', 'アクスタ', '缶バッジ', 'キーホルダー', 'フィギュア', 'ステッカー', 'アパレル', '文房具', 'カード', '雑貨'] as const;
export function isGoodsSubcategory(c: string): boolean {
  return (GOODS_SUBCATEGORIES as readonly string[]).includes(c);
}
/** 種別が含まれていれば親「グッズ」を補完（先頭に）。重複は作らない。 */
export function normalizeGoodsCategories(cats: string[]): string[] {
  const hasSub = cats.some(isGoodsSubcategory);
  if (hasSub && !cats.includes(GOODS_PARENT)) return [GOODS_PARENT, ...cats];
  return cats;
}

// ─── カテゴリカラー ───────────────────────────────────────────────────
// 既知カテゴリの固定色
export const CATEGORY_COLOR_MAP: Record<string, string> = {
  '書籍': '#4a9eff',
  'グッズ': '#a855f7',
  'イベント': '#f97316',
  '誕生日': '#ec4899',
  'アニメ・映画': '#06b6d4',
  'グルメ': '#f59e0b',
  'キャンペーン': '#8b5cf6',
  // ↓ 旧カテゴリ（既存データの表示色を保つため残す）
  '単行本': '#4a9eff',
  '映画': '#22c55e',
  'アニメ': '#06b6d4',
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

// ─── 複数カテゴリ: categoryフィールドのパース/シリアライズ ───────────
// linkと同じ流儀: 単一はプレーン文字列、複数はJSON配列文字列で保存。
// 既存の単一カテゴリデータ（プレーン文字列）はそのまま [文字列] として読める。
export function parseCategories(category?: string | null): string[] {
  if (!category) return [];
  try {
    const parsed = JSON.parse(category);
    if (Array.isArray(parsed)) return (parsed as unknown[]).filter(s => typeof s === 'string' && s) as string[];
    return [category];
  } catch { return [category]; }
}
export function serializeCategories(cats: string[]): string | undefined {
  const filtered = cats.map(s => s.trim()).filter(Boolean);
  if (filtered.length === 0) return undefined;
  if (filtered.length === 1) return filtered[0];
  return JSON.stringify(filtered);
}
/** 複数カテゴリのうち先頭の色を返す（左ボーダー/ドット色用）。未設定は null */
export function getPrimaryCategoryColor(category?: string | null): string | null {
  return getCategoryColor(parseCategories(category)[0]);
}

/** チップ表示用カテゴリ: グッズの種別がある時は冗長な親「グッズ」を省く（枠色はgetPrimaryで紫が残る） */
export function displayCategories(category?: string | null): string[] {
  const cats = parseCategories(category);
  if (cats.includes(GOODS_PARENT) && cats.some(isGoodsSubcategory)) {
    return cats.filter(c => c !== GOODS_PARENT);
  }
  return cats;
}

// AI応答のカテゴリ候補（トップ＋グッズ種別）。未知の文字列は捨てる
const KNOWN_CATEGORIES = new Set<string>([...POST_CATEGORIES, ...GOODS_SUBCATEGORIES]);
/** AI応答の raw.categories(配列) or raw.category(旧・単一) を、既知カテゴリに絞り込み、
 *  親グッズを補完して、シリアライズ済み文字列（単一=文字列 / 複数=JSON配列文字列）にする */
export function categoriesFromRaw(raw: { categories?: unknown; category?: unknown }): string | null {
  let cats: string[] = [];
  if (Array.isArray(raw.categories)) {
    cats = (raw.categories as unknown[]).filter(c => typeof c === 'string') as string[];
  } else if (typeof raw.category === 'string') {
    cats = [raw.category];
  }
  cats = [...new Set(cats.map(c => c.trim()).filter(c => KNOWN_CATEGORIES.has(c)))];
  return serializeCategories(normalizeGoodsCategories(cats)) ?? null;
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

export function parseImageUrls(raw?: string): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return (parsed as unknown[]).filter(s => typeof s === 'string' && s) as string[];
    return [raw];
  } catch { return [raw]; }
}
export function serializeImageUrls(urls: string[]): string | undefined {
  const filtered = urls.filter(Boolean);
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

// ─── like_session キーの掃除 ──────────────────────────────────────
// クールダウンが完全に終わったキー（resetAt 経過済み）のみ削除する。
// 進行中の連打カウント（resetAt=0 で tapsUsed<上限）は残す＝挙動は不変。
export function cleanupLikeSessions(): void {
  try {
    const now = Date.now();
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith('like_session:')) continue;
      try {
        const s = JSON.parse(localStorage.getItem(key) ?? '{}') as { resetAt?: number };
        if (s.resetAt && s.resetAt > 0 && now >= s.resetAt) toRemove.push(key);
      } catch { toRemove.push(key); }
    }
    toRemove.forEach(k => localStorage.removeItem(k));
  } catch { /* noop */ }
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
// ─── 発見タブ: 閲覧済み（スクロールで画面に入った）イベントID ──────
// 端末ごと。新着＝未閲覧の判定に使う。
const SEEN_EVENTS_KEY = 'fan_seen_event_ids';
export function loadSeenEventIds(): Set<string> {
  try {
    const raw = localStorage.getItem(SEEN_EVENTS_KEY);
    return raw !== null ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch { return new Set(); }
}
// 通知リードタイム（何日前に通知するか）。一括設定。
const NOTIFY_LEAD_KEY = 'fan_notify_lead_days';
export function loadNotifyLeadDays(): number {
  const v = Number(localStorage.getItem(NOTIFY_LEAD_KEY));
  return Number.isFinite(v) && v > 0 ? v : 3;
}
export function saveNotifyLeadDays(days: number): void {
  try { localStorage.setItem(NOTIFY_LEAD_KEY, String(days)); } catch { /* noop */ }
}

export function addSeenEventId(id: string): void {
  const s = loadSeenEventIds();
  if (s.has(id)) return;
  s.add(id);
  saveSeenEventIds(s);
}
/** 未閲覧かつ直近7日以内に作成された＝新着。 */
export function isNewItem(id: string, createdAt: string | undefined, seen: Set<string>): boolean {
  if (!createdAt || seen.has(id)) return false;
  const t = new Date(createdAt).getTime();
  return Number.isFinite(t) && Date.now() - t < 7 * 86400000;
}
export function saveSeenEventIds(ids: Set<string>): void {
  try {
    // 肥大化防止に直近5000件だけ保持
    const arr = [...ids];
    localStorage.setItem(SEEN_EVENTS_KEY, JSON.stringify(arr.slice(-5000)));
  } catch { /* 容量超過等は無視 */ }
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

// ─── 作品表示ON/OFF（hiddenWorkIds）永続化 ─────────────────────────────
const HIDDEN_WORK_IDS_KEY = 'fan_hidden_work_ids';
export function loadHiddenWorkIds(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(HIDDEN_WORK_IDS_KEY) ?? '[]') as string[]); }
  catch { return new Set(); }
}
export function saveHiddenWorkIds(ids: Set<string>): void {
  localStorage.setItem(HIDDEN_WORK_IDS_KEY, JSON.stringify([...ids]));
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
  dateLabel: string | null;
  time: string | null;
  endDate: string | null;
  endTime: string | null;
  category: string | null;
  prefecture: string | null;
  locationDetail: string | null;
  link: string | null;
  memo: string | null;
  imageUrl: string | null;
  sourceUrl: string | null;
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

// ─── 画像表示設定 ──────────────────────────────────────────────────────
const IMAGE_VISIBILITY_KEY = 'image_visibility';
export interface ImageVisibility { discover: boolean; list: boolean; }
export function loadImageVisibility(): ImageVisibility {
  try {
    const raw = localStorage.getItem(IMAGE_VISIBILITY_KEY);
    if (!raw) return { discover: true, list: true };
    return { discover: true, list: true, ...JSON.parse(raw) as Partial<ImageVisibility> };
  } catch { return { discover: true, list: true }; }
}
export function saveImageVisibility(v: ImageVisibility): void {
  localStorage.setItem(IMAGE_VISIBILITY_KEY, JSON.stringify(v));
}

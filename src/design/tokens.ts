// ピボット後デザインシステムの中核トークン。
// 調査（メルカリ=清潔/高密度・四角画像、Airbnb=しぼり込み、Duolingo=達成演出、Fantastical=日時）を反映。
import type { CalendarEvent } from '../types';
import { parseCategories, isGoodsSubcategory } from '../lib/constants';

export type ItemType = 'event' | 'goods';

// カテゴリ→種別の親分類（既存データの判定に使う）
const GOODS_PARENT = ['グッズ', 'グルメ', '書籍'];
const EVENT_PARENT = ['イベント', 'アニメ・映画', '誕生日', 'キャンペーン'];

/** グッズ/イベントの判定。既存データは type 列が無い/既定なのでカテゴリから導出。
 *  イベント系カテゴリを優先（POP UP等はグッズ種別が付いていてもイベント扱いで混ざりを防ぐ）。 */
export function deriveItemType(e: Pick<CalendarEvent, 'type' | 'category'>): ItemType {
  const cats = parseCategories(e.category);
  if (cats.some((c) => EVENT_PARENT.includes(c))) return 'event';
  if (cats.some((c) => GOODS_PARENT.includes(c) || isGoodsSubcategory(c))) return 'goods';
  return e.type === 'goods' ? 'goods' : 'event';
}

export type ItemStatus =
  | 'preorder_soon'  // もうすぐ予約・受注開始 🔵
  | 'preorder'       // 予約・受注中 🟠
  | 'preorder_ended' // 受付終了 ⚪
  | 'sale_soon'      // 発売予定 🟣
  | 'onsale'         // 発売中・開催中 🟢
  | 'ended';         // 終了（イベント期間後）⚪

type StatusMeta = { color: string; goodsLabel: string; eventLabel: string };

export const STATUS: Record<ItemStatus, StatusMeta> = {
  preorder_soon:  { color: 'var(--status-info)',     goodsLabel: 'もうすぐ予約開始', eventLabel: 'もうすぐ受付開始' },
  preorder:       { color: 'var(--status-preorder)', goodsLabel: '予約・受注中',     eventLabel: '受付中' },
  preorder_ended: { color: 'var(--status-ended)',    goodsLabel: '受付終了',         eventLabel: '受付終了' },
  sale_soon:      { color: 'var(--status-upcoming)', goodsLabel: '発売予定',         eventLabel: '開催予定' },
  onsale:         { color: 'var(--status-onsale)',   goodsLabel: '発売中',           eventLabel: '開催中' },
  ended:          { color: 'var(--status-ended)',    goodsLabel: '終了',             eventLabel: '終了' },
};

export function statusLabel(status: ItemStatus, type: ItemType = 'event'): string {
  const m = STATUS[status];
  return type === 'goods' ? m.goodsLabel : m.eventLabel;
}

export function todayStr(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 現在の状態を導出。種別対応：グッズは発売日を過ぎても「発売中」（"販売終了"を出さない）、
 *  イベントは期間後「終了」、受注は受付後「受付終了」。YYYY-MM-DD の文字列比較。 */
export function deriveStatus(
  e: Pick<CalendarEvent, 'date' | 'endDate' | 'preorderStart' | 'preorderEnd' | 'type' | 'category'>,
  today = todayStr(),
): ItemStatus {
  const type = deriveItemType(e);
  const { date, endDate, preorderStart, preorderEnd } = e;

  // 受注・予約の受付ウィンドウ
  if (preorderStart || preorderEnd) {
    if (preorderStart && today < preorderStart) return 'preorder_soon';
    const inWindow = (!preorderStart || preorderStart <= today) && (!preorderEnd || today <= preorderEnd);
    if (inWindow) return 'preorder';
    // 受付終了後: 発売日があればそちらの状態へ、無ければ受付終了
    if (preorderEnd && today > preorderEnd && !date) return 'preorder_ended';
  }

  if (date) {
    const end = endDate || date;
    if (today < date) return 'sale_soon';
    if (today <= end) return 'onsale';
    return type === 'event' ? 'ended' : 'onsale'; // グッズは発売日を過ぎても発売中扱い
  }

  if (preorderEnd && today > preorderEnd) return 'preorder_ended';
  return 'sale_soon'; // 日付未定は予定扱い
}

function md(d?: string): string {
  if (!d) return '';
  const parts = d.split('-');
  return parts.length === 3 ? `${Number(parts[1])}/${Number(parts[2])}` : d;
}

const SEASON_LABELS = ['春頃', '夏頃', '秋頃', '冬頃'];
/** 曖昧日付(dateLabel)を表示用に整形。上旬→"4月上旬" / 中(月のみ)→"4月" / 春頃→"春頃" */
function formatDateLabel(date: string | undefined | null, dateLabel: string): string {
  if (SEASON_LABELS.includes(dateLabel)) return dateLabel;
  const m = date ? Number(date.slice(5, 7)) : 0;
  if (dateLabel === '中') return m ? `${m}月` : '月内';
  return m ? `${m}月${dateLabel}` : dateLabel;
}

/** タイル/詳細に出す日付ラベルを状態に応じて出し分ける。 */
export function formatItemDate(
  e: Pick<CalendarEvent, 'date' | 'endDate' | 'time' | 'preorderStart' | 'preorderEnd' | 'type' | 'dateLabel'>,
  status: ItemStatus,
): string {
  if (status === 'preorder' || status === 'preorder_soon') {
    if (e.preorderStart && e.preorderEnd) return `受付 ${md(e.preorderStart)}〜${md(e.preorderEnd)}`;
    if (e.preorderEnd) return `受付〜${md(e.preorderEnd)}`;
    if (e.preorderStart) return `受付 ${md(e.preorderStart)}〜`;
  }
  // 曖昧日付は具体日(並び替え用)より dateLabel を優先表示
  if (e.dateLabel) {
    const prefix = e.type === 'goods' ? '発売 ' : '';
    return `${prefix}${formatDateLabel(e.date, e.dateLabel)}`;
  }
  if (e.date) {
    const period = e.endDate && e.endDate !== e.date ? `${md(e.date)}〜${md(e.endDate)}` : md(e.date);
    const prefix = e.type === 'goods' ? '発売 ' : '';
    const time = e.time ? ` ${e.time}` : '';
    return `${prefix}${period}${time}`;
  }
  return '日付未定';
}

/** 日付/時間を最大2行で返す（予約・受注＋発売・開催が両方あれば両方）。
 *  予約・受注＝「予約・受注 …」、イベント＝「開催 …」、グッズの発売＝ラベルなしで日付のみ。 */
export function itemDateLines(
  e: Pick<CalendarEvent, 'date' | 'endDate' | 'time' | 'endTime' | 'preorderStart' | 'preorderEnd' | 'preorderStartTime' | 'preorderEndTime' | 'type' | 'category' | 'dateLabel' | 'isOrderMade'>,
): string[] {
  const type = deriveItemType(e);
  const lines: string[] = [];
  // 予約・受注
  if (e.preorderStart || e.preorderEnd) {
    if (e.preorderStart && e.preorderEnd) lines.push(`予約・受注 ${md(e.preorderStart)}〜${md(e.preorderEnd)}`);
    else if (e.preorderEnd) lines.push(`予約・受注 〜${md(e.preorderEnd)}`);
    else if (e.preorderStart) lines.push(`予約・受注 ${md(e.preorderStart)}〜`);
  }
  // 発売（グッズ）・開催（イベント）。曖昧日付は dateLabel を優先表示
  if (e.dateLabel) {
    const label = formatDateLabel(e.date, e.dateLabel);
    lines.push(type === 'goods' ? `発売 ${label}` : `開催 ${label}`);
  } else if (e.date) {
    const period = e.endDate && e.endDate !== e.date ? `${md(e.date)}〜${md(e.endDate)}` : md(e.date);
    const time = e.time ? ` ${e.time}` : '';
    lines.push(type === 'goods' ? `発売 ${period}${time}` : `開催 ${period}${time}`);
  }
  if (lines.length === 0) lines.push('日付未定');
  return lines;
}

// レイアウト規約（メルカリ流: 詰め・画像は四角・角丸はボタンのみ）
export const RADIUS = {
  none: '0px', // 画像は四角
  button: '10px',
  chip: '999px',
  sheet: '20px',
} as const;

export const SPACE = {
  gridGap: 8, // カード間（詰め気味）
  pagePad: 12,
} as const;

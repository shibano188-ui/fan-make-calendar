// ピボット後デザインシステムの中核トークン。
// 調査（メルカリ=清潔/高密度・四角画像、Airbnb=しぼり込み、Duolingo=達成演出、Fantastical=日時）を反映。
import type { CalendarEvent } from '../types';

export type ItemType = 'event' | 'goods';

export type ItemStatus =
  | 'preorder_soon' // もうすぐ予約・受注開始 🔵
  | 'preorder'      // 予約・受注中 🟠
  | 'sale_soon'     // 発売予定 🟣
  | 'onsale'        // 発売中・開催中 🟢
  | 'ended';        // 発売済み・終了 ⚪

type StatusMeta = { color: string; goodsLabel: string; eventLabel: string };

export const STATUS: Record<ItemStatus, StatusMeta> = {
  preorder_soon: { color: 'var(--status-info)',     goodsLabel: 'もうすぐ予約開始', eventLabel: 'もうすぐ受付開始' },
  preorder:      { color: 'var(--status-preorder)', goodsLabel: '予約・受注中',     eventLabel: '受付中' },
  sale_soon:     { color: 'var(--status-upcoming)', goodsLabel: '発売予定',         eventLabel: '開催予定' },
  onsale:        { color: 'var(--status-onsale)',   goodsLabel: '発売中',           eventLabel: '開催中' },
  ended:         { color: 'var(--status-ended)',    goodsLabel: '販売終了',         eventLabel: '終了' },
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

/** 日付情報から現在の状態を導出（5段階）。YYYY-MM-DD の文字列比較で判定。 */
export function deriveStatus(
  e: Pick<CalendarEvent, 'date' | 'endDate' | 'preorderStart' | 'preorderEnd'>,
  today = todayStr(),
): ItemStatus {
  const { date, endDate, preorderStart, preorderEnd } = e;
  if (preorderStart && today < preorderStart) return 'preorder_soon';
  if (preorderStart && preorderEnd && preorderStart <= today && today <= preorderEnd) return 'preorder';
  if (!preorderStart && preorderEnd && today <= preorderEnd) return 'preorder';
  if (date) {
    const end = endDate || date;
    if (today < date) return 'sale_soon';
    if (today <= end) return 'onsale';
    return 'ended';
  }
  if (preorderEnd && today > preorderEnd) return 'ended';
  return 'sale_soon'; // 日付未定は予定扱い
}

function md(d?: string): string {
  if (!d) return '';
  const parts = d.split('-');
  return parts.length === 3 ? `${Number(parts[1])}/${Number(parts[2])}` : d;
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
  if (e.date) {
    const period = e.endDate && e.endDate !== e.date ? `${md(e.date)}〜${md(e.endDate)}` : md(e.date);
    const prefix = e.type === 'goods' ? '発売 ' : '';
    const time = e.time ? ` ${e.time}` : '';
    return `${prefix}${period}${time}`;
  }
  if (e.dateLabel) return e.dateLabel;
  return '日付未定';
}

/** 日付/時間を最大2行で返す（予約・受注＋発売・開催が両方あれば両方）。タイル上部の日付欄用。 */
export function itemDateLines(
  e: Pick<CalendarEvent, 'date' | 'endDate' | 'time' | 'endTime' | 'preorderStart' | 'preorderEnd' | 'preorderStartTime' | 'preorderEndTime' | 'type' | 'dateLabel' | 'isOrderMade'>,
): string[] {
  const lines: string[] = [];
  // 予約・受注
  if (e.preorderStart || e.preorderEnd) {
    const head = e.isOrderMade ? '受注' : '予約';
    if (e.preorderStart && e.preorderEnd) lines.push(`${head} ${md(e.preorderStart)}〜${md(e.preorderEnd)}`);
    else if (e.preorderEnd) lines.push(`${head} 〜${md(e.preorderEnd)}`);
    else if (e.preorderStart) lines.push(`${head} ${md(e.preorderStart)}〜`);
  }
  // 発売・開催
  if (e.date) {
    const period = e.endDate && e.endDate !== e.date ? `${md(e.date)}〜${md(e.endDate)}` : md(e.date);
    const head = e.type === 'goods' ? '発売' : '開催';
    const time = e.time ? ` ${e.time}` : '';
    lines.push(`${head} ${period}${time}`);
  } else if (e.dateLabel) {
    lines.push(e.dateLabel);
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

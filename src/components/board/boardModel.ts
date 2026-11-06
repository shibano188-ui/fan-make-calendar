import type { CalendarEvent } from '../../types';
import { deriveItemType } from '../../design/tokens';

// カレンダーの「ボード」表示（2026-11-06 柴野）で使う、予定を「その日に何が起きるか」に分ける計算。
// 月表示の rangesOf（SavedCalendar.tsx）と同じ材料（日付・受付・締切・日程・ピンした日）から作る。

/** その日に起きること。頭の1文字で見分ける */
export type Mark = '〆' | '受' | '発' | 'イ' | '行' | '自';

export const MARKS: Record<Mark, { color: string; ink: string; short: string; long: string }> = {
  '〆': { color: '#e0483e', ink: '#ffffff', short: '締切', long: '予約締切' },
  '受': { color: '#2a9d68', ink: '#ffffff', short: '受付', long: '受付開始' },
  '発': { color: '#3a62d8', ink: '#ffffff', short: '発売', long: '発売' },
  'イ': { color: '#9b4fd0', ink: '#ffffff', short: 'イベント', long: 'イベント' },
  '行': { color: '#f5b800', ink: '#1c1d21', short: '行く日', long: '行く日' },
  '自': { color: '#8e8e93', ink: '#ffffff', short: '自分', long: '自分の予定' },
};

/** 同じ日に並べる順。行く日・締切を先に */
const ORDER: Mark[] = ['行', '〆', '受', 'イ', '自', '発'];

export type Moment = {
  day: string;
  mark: Mark;
  e: CalendarEvent;
  /** 日程の名前（昼の部・二次受付など） */
  label?: string;
  /** 行く日・イベントが何日か続くときの最終日 */
  end?: string;
};

const isGoods = (e: CalendarEvent) => deriveItemType(e) === 'goods';

/** 予定1件を、起きることごとに分ける */
export function momentsOf(e: CalendarEvent): Moment[] {
  const out: Moment[] = [];
  const push = (day: string | null | undefined, mark: Mark, extra: Partial<Moment> = {}) => {
    if (day) out.push({ day, mark, e, ...extra });
  };
  if (e.personal) {
    push(e.date, '自', { end: e.endDate && e.endDate !== e.date ? e.endDate : undefined });
    return out;
  }
  const goods = isGoods(e);
  const visits = e.visits ?? [];
  for (const v of visits) push(v.start, '行', { end: v.end !== v.start ? v.end : undefined });

  const hasSession = e.schedules?.some((s) => s.kind === 'session') ?? false;
  const hasPreorder = e.schedules?.some((s) => s.kind === 'preorder') ?? false;
  for (const s of e.schedules ?? []) {
    if (s.kind === 'session') {
      // ピンした日があるイベントは、ピンした日だけを出す（月表示と同じ「行く日だけ見たい」）
      if (!goods && visits.length) continue;
      push(s.start, goods ? '発' : 'イ', { label: s.label, end: s.end && s.end !== s.start ? s.end : undefined });
    } else {
      push(s.start, '受', { label: s.label });
      push(s.end, '〆', { label: s.label });
    }
  }
  if (!hasPreorder) {
    push(e.preorderStart, '受');
    push(e.preorderEnd, '〆');
  }
  if (e.date && !hasSession) {
    if (goods) {
      // 受付開始と発売が同じ日なら「受付」だけにする（同じ日に2つ並ぶと紛らわしい）
      if (!(e.preorderStart && e.preorderStart === e.date && !hasPreorder)) push(e.date, '発');
    } else if (!visits.length) {
      push(e.date, 'イ', { end: e.endDate && e.endDate !== e.date ? e.endDate : undefined });
    }
  }
  return out;
}

/** 日ごとの「起きること」。同じ日の中は 行く日 → 締切 → 受付 → イベント → 発売、同じ種類なら値段の高い順 */
export function buildDays(events: CalendarEvent[]): Map<string, Moment[]> {
  const days = new Map<string, Moment[]>();
  for (const e of events) {
    for (const m of momentsOf(e)) {
      const list = days.get(m.day);
      if (list) list.push(m); else days.set(m.day, [m]);
    }
  }
  for (const list of days.values()) {
    list.sort((a, b) => ORDER.indexOf(a.mark) - ORDER.indexOf(b.mark) || (b.e.price ?? 0) - (a.e.price ?? 0));
  }
  return days;
}

/** 会期の帯に並べるイベント（2日以上続き、今日以降も続くもの）。行く日を選んだものが上 */
export function longEvents(events: CalendarEvent[], today: string): CalendarEvent[] {
  const upcomingVisit = (e: CalendarEvent) => (e.visits ?? []).some((v) => v.end >= today);
  return events
    .filter((e) => !e.personal && !isGoods(e) && e.date && e.endDate && e.endDate > e.date && e.endDate >= today)
    .sort((a, b) => Number(upcomingVisit(b)) - Number(upcomingVisit(a)) || a.date!.localeCompare(b.date!) || a.endDate!.localeCompare(b.endDate!));
}

/** 日付が決まっていない予定（どの日にも乗らないもの） */
export function undatedEvents(events: CalendarEvent[]): CalendarEvent[] {
  return events.filter((e) => momentsOf(e).length === 0);
}

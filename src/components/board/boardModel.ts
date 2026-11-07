import type { CalendarEvent } from '../../types';
import { deriveItemType, todayStr } from '../../design/tokens';
import { parseCategories } from '../../lib/constants';

// カレンダーの「ボード」表示（2026-11-06 柴野）で使う、予定を「その日に何が起きるか」に分ける計算。
// 月表示の rangesOf（SavedCalendar.tsx）と同じ材料（日付・受付・締切・日程・ピンした日）から作る。

/** その日に起きること。頭の1文字で見分ける */
export type Mark = '〆' | '受' | '発' | 'イ' | '行' | '自' | '終';

export const MARKS: Record<Mark, { color: string; ink: string; short: string; long: string }> = {
  '〆': { color: '#e0483e', ink: '#ffffff', short: '締切', long: '予約締切' },
  '受': { color: '#2a9d68', ink: '#ffffff', short: '受付', long: '受付開始' },
  '発': { color: '#3a62d8', ink: '#ffffff', short: '発売', long: '発売' },
  'イ': { color: '#9b4fd0', ink: '#ffffff', short: 'イベント', long: 'イベント' },
  '行': { color: '#f5b800', ink: '#1c1d21', short: '行く日', long: '行く日' },
  '自': { color: '#8e8e93', ink: '#ffffff', short: '自分', long: '自分の予定' },
  // 期間のある予定の終わり（グッズは販売終了、イベントは最終日）。2026-11-07
  '終': { color: '#5f6368', ink: '#ffffff', short: '終了', long: '終了' },
};

/** 同じ日に並べる順。行く日・締切を先に */
const ORDER: Mark[] = ['行', '〆', '終', '受', 'イ', '自', '発'];

export type Moment = {
  day: string;
  mark: Mark;
  e: CalendarEvent;
  /** 日程の名前（昼の部・二次受付など） */
  label?: string;
  /** 行く日・イベントが何日か続くときの最終日 */
  end?: string;
  /** 日付未定の予定を、自分で仮に置いた日（tentative.ts）。label に「発売 11月下旬」などが入る */
  tentative?: boolean;
};

const isGoods = (e: CalendarEvent) => deriveItemType(e) === 'goods';
/** 期間の終わりの呼び方。グッズは販売終了、グルメ（コラボカフェなど）は終了、イベントは最終日 */
const endLabel = (e: CalendarEvent) => (!isGoods(e) ? '最終日' : parseCategories(e.category).includes('グルメ') ? '終了' : '販売終了');

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
      // 何日か続く日程は、終わりの日にも出す（行く日を選んでいても出す。2026-11-07 柴野「行く日を選ぶと終了が消える」）
      if (s.end && s.end > s.start) push(s.end, '終', { label: `${s.label ? `${s.label} ` : ''}${endLabel(e)}` });
      // ピンした日があるイベントは、始まりの日は出さず行く日を出す（月表示と同じ「行く日だけ見たい」）
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
  // 「12月下旬」「春頃」など時期だけの日付は、仮の日（25日など）が入っているだけなので、その日には置かない（日付未定の欄へ）
  if (e.date && !hasSession && !e.dateLabel) {
    if (goods) {
      // 受付開始と発売が同じ日なら「受付」だけにする（同じ日に2つ並ぶと紛らわしい）
      if (!(e.preorderStart && e.preorderStart === e.date && !hasPreorder)) push(e.date, '発');
    } else if (!visits.length) {
      push(e.date, 'イ', { end: e.endDate && e.endDate !== e.date ? e.endDate : undefined });
    }
    // 期間のある予定は、終わりの日にも出す（グッズ・グルメ・キャンペーンの販売期間、イベントの会期）。
    // 2026-11-07 柴野「始まっているものがカレンダーに出ない」。始まる日しか出していなかったので、始まる日が過ぎると
    // 今月のカレンダーにもボードの日ごとの並びにも出なかった。行く日を選んでいても出す（選ぶと消えていた）
    if (e.endDate && e.endDate > e.date) push(e.endDate, '終', { label: endLabel(e) });
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

const SEASONS = ['春頃', '夏頃', '秋頃', '冬頃'];

/** 時期だけの日付を「12月下旬」「2027年春頃」の形に */
export function vagueLabel(date: string | undefined, label: string, today = todayStr()): string {
  const y = date && date.slice(0, 4) !== today.slice(0, 4) ? `${date.slice(0, 4)}年` : '';
  if (SEASONS.includes(label)) return `${y}${label}`;
  const m = date ? Number(date.slice(5, 7)) : 0;
  if (label === '中') return m ? `${y}${m}月` : '時期未定';
  return m ? `${y}${m}月${label}` : label;
}

/** 日付未定の欄に出す予定（2026-11-07）。日付が無いものと、時期だけ決まっているもの（下旬・春頃…）。
 *  label に「12月下旬」などを入れる。時期がもう過ぎたものは出さない。時期の早い順、日付が無いものは最後 */
export function undatedMoments(events: CalendarEvent[], today = todayStr()): Moment[] {
  const out: (Moment & { sort: string })[] = [];
  for (const e of events) {
    if (e.personal) continue;
    const goods = isGoods(e);
    const hasSession = e.schedules?.some((s) => s.kind === 'session') ?? false;
    const mark: Mark = goods ? '発' : 'イ';
    if (e.date && e.dateLabel && !hasSession) {
      // 時期の終わり（月の末・季節は代表の月から2か月後の末）が過ぎていたら出さない
      const d = new Date(e.date + 'T00:00:00');
      const end = new Date(d.getFullYear(), d.getMonth() + (SEASONS.includes(e.dateLabel) ? 3 : 1), 0);
      if (todayStr(end) < today) continue;
      out.push({ day: '', mark, e, label: `${goods ? '発売' : '開催'} ${vagueLabel(e.date, e.dateLabel, today)}`, sort: e.date });
    } else if (momentsOf(e).length === 0) {
      out.push({ day: '', mark, e, label: '日付未定', sort: '9999' });
    }
  }
  return out.sort((a, b) => a.sort.localeCompare(b.sort)).map(({ sort: _s, ...m }) => m);
}

/** 日付未定の予定を、仮に置いた日（tentative）と置いていないものに分ける。過ぎた日に置いたものは置いていない扱い */
export function splitTentative(undated: Moment[], tentative: Record<string, string>, today = todayStr()): { placed: Moment[]; rest: Moment[] } {
  const placed: Moment[] = [], rest: Moment[] = [];
  for (const m of undated) {
    const d = tentative[m.e.id];
    if (d && d >= today) placed.push({ ...m, day: d, tentative: true });
    else rest.push(m);
  }
  return { placed, rest };
}

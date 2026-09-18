import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, Plus } from 'lucide-react';
import type { CalendarEvent } from '../types';
import ItemCard from './item/ItemCard';
import DaySheet from './DaySheet';
import { todayStr, deriveStatus } from '../design/tokens';
import { relativeDayLabel } from '../lib/relativeDay';
import { haptic } from '../lib/haptics';
import { buildWorkColorMap } from '../lib/workColors';
import { useTheme } from '../contexts/ThemeContext';

export type Scope = 'month' | 'week' | 'day';

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

/** 月カレンダーの予定チップ1枚ぶんの高さ（文字13px + 下の隙間2px）。何枚入るかの計算に使う */
const CHIP_H = 15;
/** マスの中でチップに使えない高さ（日付の丸20px + 上下の余白6px） */
const CHIP_RESERVE = 26;

/** 作品色の上に乗せる文字の色。WORK_COLORS は淡い色が多いので、たいていは黒が乗る */
function textOn(bg: string): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(bg)) return 'var(--accent-on)';
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(bg.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.42 ? '#141414' : '#ffffff';
}

function parse(s: string): Date {
  return new Date(s + 'T00:00:00');
}
function addDays(s: string, n: number): string {
  const d = parse(s);
  d.setDate(d.getDate() + n);
  return todayStr(d);
}
function addMonths(s: string, n: number): string {
  const d = parse(s);
  d.setMonth(d.getMonth() + n);
  return todayStr(d);
}
function startOfWeek(s: string): string {
  const d = parse(s);
  return addDays(s, -d.getDay());
}

/** 上の行に出す見出し。月＝「2026年9月」、週＝「9/13〜9/19」、日＝「9月18日（金）」 */
export function periodLabel(scope: Scope, anchor: string): string {
  const d = parse(anchor);
  if (scope === 'month') return `${d.getFullYear()}年${d.getMonth() + 1}月`;
  if (scope === 'day') return `${d.getMonth() + 1}月${d.getDate()}日（${WEEKDAYS[d.getDay()]}）`;
  const s0 = parse(startOfWeek(anchor));
  const e0 = parse(addDays(startOfWeek(anchor), 6));
  return `${s0.getMonth() + 1}/${s0.getDate()}〜${e0.getMonth() + 1}/${e0.getDate()}`;
}

/** 今見ている期間に今日が入っているか（入っていなければ「今日」ボタンを出す） */
export function includesToday(scope: Scope, anchor: string, today: string): boolean {
  if (scope === 'month') return anchor.slice(0, 7) === today.slice(0, 7);
  if (scope === 'day') return anchor === today;
  return startOfWeek(anchor) === startOfWeek(today);
}

/** 横スワイプで前後ナビ。左→次・右→前。縦スクロールは阻害しない。 */
function useSwipe(onPrev: () => void, onNext: () => void) {
  const start = useRef<{ x: number; y: number } | null>(null);
  return {
    onTouchStart: (e: React.TouchEvent) => {
      const t = e.touches[0];
      start.current = { x: t.clientX, y: t.clientY };
    },
    onTouchEnd: (e: React.TouchEvent) => {
      if (!start.current) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - start.current.x;
      const dy = t.clientY - start.current.y;
      start.current = null;
      if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      haptic.select();
      if (dx < 0) onNext(); else onPrev();
    },
  };
}

/** その日に掛かる予定。
 *  個人の来店予定(visits)があればその日/期間だけに絞る。無ければ date〜endDate。 */
function eventsOnDay(events: CalendarEvent[], day: string): CalendarEvent[] {
  return events.filter((e) => {
    if (e.visits && e.visits.length > 0) {
      return e.visits.some((v) => v.start <= day && day <= v.end);
    }
    if (!e.date) return false;
    const end = e.endDate || e.date;
    return e.date <= day && day <= end;
  });
}

type Props = {
  events: CalendarEvent[];
  scope: Scope;
  /** 基準日（表示中の月・週・日を決める）。上の行の見出しと「今日」ボタンのために親が持つ */
  anchor: string;
  setAnchor: (s: string) => void;
  onOpen: (e: CalendarEvent) => void;
  onLike: (e: CalendarEvent) => void;
  onCalendar: (e: CalendarEvent) => void;
  /** 日付のパネルの「＋」。その日付で投稿を始める */
  onAdd: (day: string) => void;
};

export default function SavedCalendar({ events, scope, anchor, setAnchor, onOpen, onLike, onCalendar, onAdd }: Props) {
  const today = todayStr();
  // 月表示で押した日。null ならパネルは閉じている
  const [picked, setPicked] = useState<string | null>(null);

  // 日付未定の保存分（カレンダーに乗らないので別枠で件数表示）。
  // 受付終了したものは消さずに残す（本人のいいね記録）が、後ろに回して薄く表示する
  const undated = useMemo(() => {
    const list = events.filter((e) => !e.date);
    const isDone = (e: CalendarEvent) => deriveStatus(e) === 'preorder_ended';
    return list.sort((a, b) => Number(isDone(a)) - Number(isDone(b)));
  }, [events]);

  // 作品色マップ（未割当はパレットから付与して永続化）→ ドット・タイルの色に使う
  const workColorMap = useMemo(() => {
    const works = Array.from(
      new Map(events.filter((e) => e.workId).map((e) => [e.workId!, { id: e.workId! }])).values(),
    );
    return buildWorkColorMap(works);
  }, [events]);
  const colorOf = (e: CalendarEvent): string =>
    e.workId ? (workColorMap.get(e.workId) ?? 'var(--accent-color)') : 'var(--accent-color)';

  const pickedEvents = useMemo(() => (picked ? eventsOnDay(events, picked) : []), [events, picked]);

  return (
    // 月表示は親が画面ぴったりの高さにしているので、残りを全部カレンダーに使う
    <div className={scope === 'month' ? 'flex-1 min-h-0 flex flex-col pb-1' : 'pb-4'}>
      {scope === 'month' && (
        <MonthView events={events} anchor={anchor} setAnchor={setAnchor} today={today} colorOf={colorOf}
          picked={picked} onPick={setPicked} />
      )}
      {scope === 'week' && (
        <WeekView events={events} anchor={anchor} setAnchor={setAnchor} today={today} colorOf={colorOf}
          onOpen={onOpen} onLike={onLike} onCalendar={onCalendar} />
      )}
      {scope === 'day' && (
        <DayView events={events} anchor={anchor} setAnchor={setAnchor} today={today} colorOf={colorOf}
          onOpen={onOpen} onLike={onLike} onCalendar={onCalendar} />
      )}

      {/* 日付未定はカレンダーに乗らない。月表示はスクロールさせないので出さない（リスト表示で見られる） */}
      {scope !== 'month' && undated.length > 0 && (
        <div className="mt-5">
          <div className="px-1 text-[12px] text-label-secondary mb-2">日付未定 {undated.length}件</div>
          <div className="flex flex-col gap-2">
            {undated.map((e) => (
              <div key={e.id} className={deriveStatus(e) === 'preorder_ended' ? 'opacity-55' : undefined}>
                <ItemCard event={e} layout="list" likedInit={e.likedByMe} workColor={colorOf(e)}
                  onOpen={() => onOpen(e)} onLike={() => onLike(e)} onCalendar={() => onCalendar(e)} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 日付を押すと下から出る、その日の予定。予定の詳細へは月表示ではここからだけ行ける */}
      <DaySheet open={scope === 'month' && picked !== null} onClose={() => setPicked(null)}
        header={picked && (
          <div className="flex items-center gap-2 px-4 pt-1 pb-2">
            <DayHeading day={picked} count={pickedEvents.length} today={today} />
            <button onClick={() => { haptic.select(); onAdd(picked); }}
              onPointerDown={(e) => e.stopPropagation()}
              aria-label="この日に予定を追加"
              className="pressable tap-44 ml-auto w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: 'var(--accent-color)', color: 'var(--accent-on)' }}>
              <Plus size={18} />
            </button>
          </div>
        )}>
        {picked && <DayList events={pickedEvents} colorOf={colorOf} onOpen={onOpen} onLike={onLike} onCalendar={onCalendar} />}
      </DaySheet>
    </div>
  );
}

type ViewProps = {
  events: CalendarEvent[];
  anchor: string;
  setAnchor: (s: string) => void;
  today: string;
  colorOf: (e: CalendarEvent) => string;
  onOpen: (e: CalendarEvent) => void;
  onLike: (e: CalendarEvent) => void;
  onCalendar: (e: CalendarEvent) => void;
};

type MonthProps = Pick<ViewProps, 'events' | 'anchor' | 'setAnchor' | 'today' | 'colorOf'> & {
  picked: string | null;
  onPick: (day: string) => void;
};

function MonthView({ events, anchor, setAnchor, today, colorOf, picked, onPick }: MonthProps) {
  const cur = parse(anchor);
  const year = cur.getFullYear();
  const month = cur.getMonth();
  const firstStr = todayStr(new Date(year, month, 1));
  const gridStart = startOfWeek(firstStr);
  const days = useMemo(() => Array.from({ length: 42 }, (_, i) => addDays(gridStart, i)), [gridStart]);
  const goPrev = () => setAnchor(addMonths(anchor, -1));
  const goNext = () => setAnchor(addMonths(anchor, 1));
  const swipe = useSwipe(goPrev, goNext);

  // 1マスに予定チップを何枚出せるか。マスの高さは画面の高さで変わるので、実物の高さを測って決める。
  // ⚠ 行の高さは minmax(0, 1fr) で固定してある。auto を許すと
  //    「チップが増える→マスが伸びる→もっと入る」で測り直しが止まらなくなる。
  const gridRef = useRef<HTMLDivElement>(null);
  const [maxChips, setMaxChips] = useState(3);
  useLayoutEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const measure = () => {
      const cell = grid.firstElementChild as HTMLElement | null;
      if (!cell) return;
      const room = cell.clientHeight - CHIP_RESERVE;
      setMaxChips(Math.max(1, Math.min(6, Math.floor(room / CHIP_H))));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(grid);
    return () => ro.disconnect();
  }, []);

  // カレンダーの背景画像。画像の上でも日付が読めるように、マスの地は透かして残す（＝そのまま暗幕になる）。
  const { settings } = useTheme();
  const bgImage = settings.backgroundImageUrl;
  const cellBg = (sel: boolean) => {
    if (!bgImage) return sel ? 'var(--fill-tertiary)' : 'var(--bg-primary)';
    // 選んでいるマスは濃く（＝画像が引っ込む）、それ以外は薄く
    return sel
      ? 'color-mix(in srgb, var(--bg-primary) 90%, transparent)'
      : 'color-mix(in srgb, var(--bg-primary) 58%, transparent)';
  };

  return (
    <div {...swipe} className="flex-1 min-h-0 flex flex-col">
      {/* 曜日見出し */}
      <div className="grid grid-cols-7 mb-1">
        {WEEKDAYS.map((w, i) => (
          <div key={w} className="text-center text-[11px] font-semibold py-1"
            style={{ color: i === 0 ? 'var(--cal-sunday-color)' : i === 6 ? 'var(--cal-saturday-color)' : 'var(--label-secondary)' }}>
            {w}
          </div>
        ))}
      </div>

      {/* 日グリッド。残りの高さを6行で等分する。背景画像があるときは、その上にマスを半透明で重ねる */}
      <div
        className="flex-1 min-h-0 rounded-[12px] overflow-hidden"
        style={bgImage ? {
          backgroundImage: `url(${bgImage})`,
          backgroundSize: 'cover',
          backgroundPosition: `${settings.bgImageOffsetX ?? 50}% ${settings.bgImageOffsetY ?? 50}%`,
        } : undefined}
      >
      <div ref={gridRef} className="grid grid-cols-7 gap-px h-full"
        style={{ gridTemplateRows: 'repeat(6, minmax(0, 1fr))', backgroundColor: bgImage ? 'transparent' : 'var(--separator)' }}>
        {days.map((day) => {
          const d = parse(day);
          const inMonth = d.getMonth() === month;
          const dow = d.getDay();
          const isToday = day === today;
          const isSel = day === picked;
          const dayEvents = eventsOnDay(events, day);
          const dayColor = !inMonth ? 'var(--cal-other-month-color)' : dow === 0 ? 'var(--cal-sunday-color)' : dow === 6 ? 'var(--cal-saturday-color)' : 'var(--label-primary)';
          const over = dayEvents.length - maxChips;
          return (
            // マスのどこを押しても「その日を開く」。予定の帯を押して詳細へ飛ぶのは誤タップが多かったのでやめた
            <button key={day} type="button"
              aria-label={`${d.getMonth() + 1}月${d.getDate()}日`}
              onClick={() => { haptic.select(); onPick(day); }}
              className="relative h-full min-h-0 overflow-hidden flex flex-col items-stretch pt-1 px-[1px] pressable text-left cursor-pointer"
              style={{ backgroundColor: cellBg(isSel) }}>
              <span className="self-center flex-shrink-0 text-[12px] leading-none flex items-center justify-center w-5 h-5 rounded-full"
                style={isToday
                  ? { backgroundColor: 'var(--accent-color)', color: 'var(--accent-on)', fontWeight: 700 }
                  : { color: dayColor }}>
                {d.getDate()}
              </span>
              {/* 入りきらなかった件数は日付の横に出す。チップと同じ列に置くと、
                  マスが低い機種（--cal-cell-h が縮む）でこれ自体がはみ出して切れる */}
              {over > 0 && (
                <span className="absolute top-[3px] right-[3px] text-[9px] leading-none font-semibold text-label-secondary">
                  +{over}
                </span>
              )}
              {/* 予定は作品色の帯にタイトルを載せて出す（Googleカレンダーと同じ見せ方） */}
              <div className="mt-[3px] flex flex-col gap-[2px]" style={{ opacity: inMonth ? 1 : 0.45 }}>
                {dayEvents.slice(0, maxChips).map((e) => {
                  const c = colorOf(e);
                  const solid = !c.startsWith('var(');
                  return (
                    // 帯は見せるだけ。タイトルは5文字ほどしか出ないので、全文は日付のパネルで読んでもらう
                    <span key={e.id}
                      className="block w-full rounded-[3px] px-[3px] text-[9px] leading-[13px] font-medium truncate text-left"
                      style={solid
                        ? { backgroundColor: c, color: textOn(c) }
                        : { backgroundColor: 'var(--accent-color)', color: 'var(--accent-on)' }}>
                      {e.title}
                    </span>
                  );
                })}
              </div>
            </button>
          );
        })}
      </div>
      </div>
    </div>
  );
}

function WeekView({ events, anchor, setAnchor, today, colorOf, onOpen, onLike, onCalendar }: ViewProps) {
  const weekStart = startOfWeek(anchor);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const goPrev = () => setAnchor(addDays(weekStart, -7));
  const goNext = () => setAnchor(addDays(weekStart, 7));
  const swipe = useSwipe(goPrev, goNext);
  return (
    <div {...swipe} className="flex flex-col gap-4">
      {days.map((day) => (
        <div key={day}>
          <div className="mb-2"><DayHeading day={day} count={eventsOnDay(events, day).length} today={today} /></div>
          <DayList events={eventsOnDay(events, day)} colorOf={colorOf} onOpen={onOpen} onLike={onLike} onCalendar={onCalendar} />
        </div>
      ))}
    </div>
  );
}

function DayView({ events, anchor, setAnchor, today, colorOf, onOpen, onLike, onCalendar }: ViewProps) {
  const dayEvents = eventsOnDay(events, anchor);
  const goPrev = () => setAnchor(addDays(anchor, -1));
  const goNext = () => setAnchor(addDays(anchor, 1));
  const swipe = useSwipe(goPrev, goNext);
  return (
    // 予定が少ない日でも左右スワイプを受けられるよう、面を確保しておく
    <div {...swipe} className="min-h-[60dvh]">
      <div className="flex justify-center mb-2"><RelativeBadge day={anchor} today={today} /></div>
      <DayList events={dayEvents} colorOf={colorOf} onOpen={onOpen} onLike={onLike} onCalendar={onCalendar} />
    </div>
  );
}

function DayHeading({ day, count, today }: { day: string; count: number; today: string }) {
  const d = parse(day);
  const dow = d.getDay();
  const color = dow === 0 ? 'var(--cal-sunday-color)' : dow === 6 ? 'var(--cal-saturday-color)' : 'var(--label-primary)';
  return (
    <div className="flex items-baseline gap-2 px-1 flex-1 min-w-0">
      <span className="text-[14px] font-bold" style={{ color }}>
        {d.getMonth() + 1}月{d.getDate()}日（{WEEKDAYS[dow]}）
      </span>
      <RelativeBadge day={day} today={today} />
      <span className="text-[12px] text-label-tertiary ml-auto">{count > 0 ? `${count}件` : ''}</span>
    </div>
  );
}

/** 選んだ日が今日から何日後か。今日なら「今日」、それ以外は「あと4日」「6日前」。 */
function RelativeBadge({ day, today }: { day: string; today: string }) {
  if (day === today) {
    return <span className="text-[10px] font-bold rounded-full px-1.5 py-0.5" style={{ backgroundColor: 'var(--accent-color)', color: 'var(--accent-on)' }}>今日</span>;
  }
  const label = relativeDayLabel(day, today);
  const past = day < today;
  return (
    <span className="text-[10px] font-bold rounded-full px-1.5 py-0.5"
      style={{ backgroundColor: 'var(--fill-tertiary)', color: past ? 'var(--label-tertiary)' : 'var(--accent-text)' }}>
      {label}
    </span>
  );
}

function DayList({ events, colorOf, onOpen, onLike, onCalendar }: { events: CalendarEvent[] } & Pick<ViewProps, 'colorOf' | 'onOpen' | 'onLike' | 'onCalendar'>) {
  if (events.length === 0) {
    return (
      <div className="flex items-center gap-2 text-[12px] text-label-tertiary py-3 px-1">
        <CalendarDays size={14} /> 予定なし
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {events.map((e) => (
        <ItemCard key={e.id} event={e} layout="list" likedInit={e.likedByMe} workColor={colorOf(e)}
          onOpen={() => onOpen(e)} onLike={() => onLike(e)} onCalendar={() => onCalendar(e)} />
      ))}
    </div>
  );
}

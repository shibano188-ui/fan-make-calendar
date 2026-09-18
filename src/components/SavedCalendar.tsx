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

/** 月カレンダーの予定の帯1段ぶんの高さ（帯14px + 下の隙間2px）。何段入るかの計算に使う */
const CHIP_H = 16;
/** 帯を置き始める高さ（マスの上の余白4px + 日付の丸20px + 隙間2px） */
const BAR_TOP = 26;

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
  // 月表示で選んでいる日（色が付く）と、パネルで開いている日（null なら閉じている）。
  // パネルが閉じているときは「1回目で選ぶ → 同じ日をもう1回で開く」。
  // 開いているときは別の日を1回押すだけで中身が切り替わる
  const [selected, setSelected] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const onTapDay = (day: string) => {
    if (picked !== null || selected === day) setPicked(day);
    setSelected(day);
  };

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
          selected={selected} onTapDay={onTapDay} />
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

/** 予定が掛かる期間。来店予定（visits）があればその期間ごと、無ければ date〜endDate の1本 */
function rangesOf(e: CalendarEvent): { start: string; end: string }[] {
  if (e.visits && e.visits.length > 0) return e.visits.map((v) => ({ start: v.start, end: v.end }));
  if (!e.date) return [];
  return [{ start: e.date, end: e.endDate || e.date }];
}

/** 週の中での1本の帯。start/end はその週の何日目か（0=日曜） */
type Seg = { e: CalendarEvent; start: number; end: number; lane: number; contL: boolean; contR: boolean };

function dayIndex(weekStart: string, day: string): number {
  return Math.round((parse(day).getTime() - parse(weekStart).getTime()) / 86400000);
}

/** 1週間ぶんの帯を、重ならないように段（lane）へ積む。
 *  長い予定を先に置くと、日をまたぐ帯がまっすぐ1段に並ぶ（Googleカレンダーと同じ積み方） */
function layoutWeek(events: CalendarEvent[], weekStart: string): Seg[] {
  const weekEnd = addDays(weekStart, 6);
  const segs: Omit<Seg, 'lane'>[] = [];
  for (const e of events) {
    for (const r of rangesOf(e)) {
      if (r.end < weekStart || r.start > weekEnd) continue;
      segs.push({
        e,
        start: dayIndex(weekStart, r.start < weekStart ? weekStart : r.start),
        end: dayIndex(weekStart, r.end > weekEnd ? weekEnd : r.end),
        contL: r.start < weekStart,
        contR: r.end > weekEnd,
      });
    }
  }
  segs.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));
  const laneEnds: number[] = [];
  return segs.map((s) => {
    let lane = laneEnds.findIndex((end) => end < s.start);
    if (lane === -1) { lane = laneEnds.length; laneEnds.push(s.end); } else laneEnds[lane] = s.end;
    return { ...s, lane };
  });
}

type MonthProps = Pick<ViewProps, 'events' | 'anchor' | 'setAnchor' | 'today' | 'colorOf'> & {
  selected: string | null;
  onTapDay: (day: string) => void;
};

function MonthView({ events, anchor, setAnchor, today, colorOf, selected, onTapDay }: MonthProps) {
  const cur = parse(anchor);
  const year = cur.getFullYear();
  const month = cur.getMonth();
  const firstStr = todayStr(new Date(year, month, 1));
  const gridStart = startOfWeek(firstStr);
  // 行数はその月に必要なぶんだけ（4〜6行）。いつも6行にすると、ほとんどの月で最後の行が翌月だけになる
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const weekCount = Math.ceil((parse(firstStr).getDay() + daysInMonth) / 7);
  const weeks = useMemo(() => Array.from({ length: weekCount }, (_, i) => addDays(gridStart, i * 7)), [gridStart, weekCount]);
  const layouts = useMemo(() => weeks.map((w) => layoutWeek(events, w)), [weeks, events]);
  const goPrev = () => setAnchor(addMonths(anchor, -1));
  const goNext = () => setAnchor(addMonths(anchor, 1));
  const swipe = useSwipe(goPrev, goNext);

  // 1週の行に帯を何段出せるか。行の高さは画面と行数で変わるので、実物を測って決める。
  // ⚠ 行の高さは flex で等分して固定してある。中身で伸びる作りにすると
  //    「帯が増える→行が伸びる→もっと入る」で測り直しが止まらなくなる。
  const gridRef = useRef<HTMLDivElement>(null);
  const [maxLanes, setMaxLanes] = useState(3);
  useLayoutEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const measure = () => {
      const row = grid.firstElementChild as HTMLElement | null;
      if (!row) return;
      setMaxLanes(Math.max(1, Math.floor((row.clientHeight - BAR_TOP - 2) / CHIP_H)));
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
    // 選んだ日は「もう1回押すと開く」の合図なので、グレーではなくアクセント色を薄く敷いて目立たせる
    if (!bgImage) return sel ? 'color-mix(in srgb, var(--accent-color) 22%, var(--bg-primary))' : 'var(--bg-primary)';
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

      {/* 週の行を縦に等分する。背景画像があるときは、その上にマスを半透明で重ねる */}
      <div
        className="flex-1 min-h-0 rounded-[12px] overflow-hidden"
        style={bgImage ? {
          backgroundImage: `url(${bgImage})`,
          backgroundSize: 'cover',
          backgroundPosition: `${settings.bgImageOffsetX ?? 50}% ${settings.bgImageOffsetY ?? 50}%`,
        } : undefined}
      >
      <div ref={gridRef} className="h-full flex flex-col gap-px" style={{ backgroundColor: bgImage ? 'transparent' : 'var(--separator)' }}>
        {weeks.map((weekStart, wi) => {
          const segs = layouts[wi];
          return (
            <div key={weekStart} className="relative flex-1 min-h-0 grid grid-cols-7 gap-px">
              {Array.from({ length: 7 }, (_, di) => {
                const day = addDays(weekStart, di);
                const d = parse(day);
                const inMonth = d.getMonth() === month;
                const dow = d.getDay();
                const isToday = day === today;
                const isSel = day === selected;
                const dayColor = !inMonth ? 'var(--cal-other-month-color)' : dow === 0 ? 'var(--cal-sunday-color)' : dow === 6 ? 'var(--cal-saturday-color)' : 'var(--label-primary)';
                // 出しきれなかった段の予定の数
                const over = segs.filter((s) => s.lane >= maxLanes && s.start <= di && di <= s.end).length;
                return (
                  // マスのどこを押しても「その日」を押した扱い。予定の帯を押して詳細へ飛ぶのは誤タップが多かったのでやめた
                  <button key={day} type="button"
                    aria-label={`${d.getMonth() + 1}月${d.getDate()}日`}
                    aria-pressed={isSel}
                    onClick={() => { haptic.select(); onTapDay(day); }}
                    className="relative h-full min-h-0 overflow-hidden flex flex-col items-center pt-1 pressable cursor-pointer"
                    style={{ backgroundColor: cellBg(isSel) }}>
                    <span className="flex-shrink-0 text-[12px] leading-none flex items-center justify-center w-5 h-5 rounded-full"
                      style={isToday
                        ? { backgroundColor: 'var(--accent-color)', color: 'var(--accent-on)', fontWeight: 700 }
                        : { color: dayColor }}>
                      {d.getDate()}
                    </span>
                    {over > 0 && (
                      <span className="absolute top-[3px] right-[3px] text-[9px] leading-none font-semibold text-label-secondary">
                        +{over}
                      </span>
                    )}
                  </button>
                );
              })}

              {/* 予定の帯。日をまたぐ予定は1本の帯にして、名前は1回だけ出す（TimeTree / Googleカレンダーと同じ）。
                  帯は見せるだけで、押すと下のマス（その日）に届く */}
              <div className="absolute inset-0 pointer-events-none">
                {segs.filter((s) => s.lane < maxLanes).map((s) => {
                  const c = colorOf(s.e);
                  const solid = !c.startsWith('var(');
                  const span = s.end - s.start + 1;
                  return (
                    <div key={`${s.e.id}-${s.start}`}
                      className="absolute h-[14px] px-[3px] text-[10px] leading-[14px] font-medium whitespace-nowrap overflow-hidden"
                      style={{
                        top: BAR_TOP + s.lane * CHIP_H,
                        left: `calc(${(s.start / 7) * 100}% + ${s.contL ? 0 : 1}px)`,
                        width: `calc(${(span / 7) * 100}% - ${(s.contL ? 0 : 1) + (s.contR ? 0 : 1)}px)`,
                        // 前の週・次の週へ続く側は角を落とさない（続いていることが分かるように）
                        borderRadius: `${s.contL ? 0 : 3}px ${s.contR ? 0 : 3}px ${s.contR ? 0 : 3}px ${s.contL ? 0 : 3}px`,
                        letterSpacing: '-0.02em',
                        ...(solid
                          ? { backgroundColor: c, color: textOn(c) }
                          : { backgroundColor: 'var(--accent-color)', color: 'var(--accent-on)' }),
                      }}>
                      {s.e.title}
                    </div>
                  );
                })}
              </div>
            </div>
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

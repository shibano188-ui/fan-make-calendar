import { useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, CalendarDays, CalendarCheck } from 'lucide-react';
import type { CalendarEvent } from '../types';
import ItemCard from './item/ItemCard';
import { todayStr, deriveStatus } from '../design/tokens';
import { haptic } from '../lib/haptics';
import { buildWorkColorMap } from '../lib/workColors';
import { useTheme } from '../contexts/ThemeContext';

type Scope = 'month' | 'week' | 'day';

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

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
  onOpen: (e: CalendarEvent) => void;
  onLike: (e: CalendarEvent) => void;
  onCalendar: (e: CalendarEvent) => void;
};

export default function SavedCalendar({ events, scope, onOpen, onLike, onCalendar }: Props) {
  const today = todayStr();
  const [anchor, setAnchor] = useState(today); // 基準日（選択日 / 表示中の日）

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

  return (
    <div className="pb-4">
      {scope === 'month' && (
        <MonthView events={events} anchor={anchor} setAnchor={setAnchor} today={today} colorOf={colorOf}
          onOpen={onOpen} onLike={onLike} onCalendar={onCalendar} />
      )}
      {scope === 'week' && (
        <WeekView events={events} anchor={anchor} setAnchor={setAnchor} today={today} colorOf={colorOf}
          onOpen={onOpen} onLike={onLike} onCalendar={onCalendar} />
      )}
      {scope === 'day' && (
        <DayView events={events} anchor={anchor} setAnchor={setAnchor} today={today} colorOf={colorOf}
          onOpen={onOpen} onLike={onLike} onCalendar={onCalendar} />
      )}

      {undated.length > 0 && (
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
    </div>
  );
}

/** 前後ナビ＋「今日」ボタンの共通ヘッダー。 */
function NavHeader({ label, onPrev, onNext, onToday }: { label: string; onPrev: () => void; onNext: () => void; onToday: () => void }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <button onClick={() => { haptic.select(); onPrev(); }} aria-label="前へ" className="pressable p-2 -ml-2 rounded-full">
        <ChevronLeft size={20} />
      </button>
      <div className="flex-1 text-center text-[15px] font-bold">{label}</div>
      <button onClick={() => { haptic.select(); onNext(); }} aria-label="次へ" className="pressable p-2 rounded-full">
        <ChevronRight size={20} />
      </button>
      <button onClick={() => { haptic.select(); onToday(); }} aria-label="今日へ" title="今日へ"
        className="pressable rounded-full p-2"
        style={{ backgroundColor: 'var(--fill-tertiary)', color: 'var(--label-primary)' }}>
        <CalendarCheck size={18} />
      </button>
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

function MonthView({ events, anchor, setAnchor, today, colorOf, onOpen, onLike, onCalendar }: ViewProps) {
  const cur = parse(anchor);
  const year = cur.getFullYear();
  const month = cur.getMonth();
  const firstStr = todayStr(new Date(year, month, 1));
  const gridStart = startOfWeek(firstStr);
  const days = useMemo(() => Array.from({ length: 42 }, (_, i) => addDays(gridStart, i)), [gridStart]);
  const selected = anchor;
  const selectedEvents = useMemo(() => eventsOnDay(events, selected), [events, selected]);
  const goPrev = () => setAnchor(addMonths(anchor, -1));
  const goNext = () => setAnchor(addMonths(anchor, 1));
  const swipe = useSwipe(goPrev, goNext);

  // カレンダーの背景画像。設定はずっと前からあるのに、実際に描いていたのは
  // ルートから外れた Calendar.tsx（死にコード）とウィジェットだけで、
  // **本物のカレンダーに出ていなかった**。ここで出す。
  // 画像の上でも日付が読めるように、マスの地は透かして残す（＝そのまま暗幕になる）。
  // 濃さの調整と明るさの自動判定はテーマ生成のときに足す。
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
    <div {...swipe}>
      <NavHeader label={`${year}年${month + 1}月`}
        onPrev={goPrev} onNext={goNext}
        onToday={() => setAnchor(today)} />

      {/* 曜日見出し */}
      <div className="grid grid-cols-7 mb-1">
        {WEEKDAYS.map((w, i) => (
          <div key={w} className="text-center text-[11px] font-semibold py-1"
            style={{ color: i === 0 ? 'var(--cal-sunday-color)' : i === 6 ? 'var(--cal-saturday-color)' : 'var(--label-secondary)' }}>
            {w}
          </div>
        ))}
      </div>

      {/* 日グリッド。背景画像があるときは、その上にマスを半透明で重ねる
          （マスを不透明のままにすると 1px の隙間からしか画像が見えない） */}
      <div
        className="rounded-[12px] overflow-hidden"
        style={bgImage ? {
          backgroundImage: `url(${bgImage})`,
          backgroundSize: 'cover',
          backgroundPosition: `${settings.bgImageOffsetX ?? 50}% ${settings.bgImageOffsetY ?? 50}%`,
        } : undefined}
      >
      <div className="grid grid-cols-7 gap-px" style={{ backgroundColor: bgImage ? 'transparent' : 'var(--separator)' }}>
        {days.map((day) => {
          const d = parse(day);
          const inMonth = d.getMonth() === month;
          const dow = d.getDay();
          const isToday = day === today;
          const isSel = day === selected;
          const dayEvents = eventsOnDay(events, day);
          const dayColor = !inMonth ? 'var(--cal-other-month-color)' : dow === 0 ? 'var(--cal-sunday-color)' : dow === 6 ? 'var(--cal-saturday-color)' : 'var(--label-primary)';
          return (
            <button key={day} onClick={() => { haptic.select(); setAnchor(day); }}
              className="relative min-h-[var(--cal-cell-h)] flex flex-col items-center pt-1.5 pressable"
              style={{ backgroundColor: cellBg(isSel) }}>
              <span className="text-[12px] leading-none flex items-center justify-center w-5 h-5 rounded-full"
                style={isToday
                  ? { backgroundColor: 'var(--accent-color)', color: 'var(--accent-on)', fontWeight: 700 }
                  : { color: dayColor }}>
                {d.getDate()}
              </span>
              <div className="flex flex-wrap justify-center gap-[2px] mt-1 px-0.5">
                {dayEvents.slice(0, 4).map((e) => (
                  <span key={e.id} className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: colorOf(e) }} />
                ))}
              </div>
            </button>
          );
        })}
      </div>
      </div>

      {/* 選択日の予定 */}
      <div className="mt-4">
        <DayHeading day={selected} count={selectedEvents.length} />
        <DayList events={selectedEvents} colorOf={colorOf} onOpen={onOpen} onLike={onLike} onCalendar={onCalendar} />
      </div>
    </div>
  );
}

function WeekView({ events, anchor, setAnchor, today, colorOf, onOpen, onLike, onCalendar }: ViewProps) {
  const weekStart = startOfWeek(anchor);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const end = days[6];
  const label = `${parse(weekStart).getMonth() + 1}/${parse(weekStart).getDate()}〜${parse(end).getMonth() + 1}/${parse(end).getDate()}`;
  const goPrev = () => setAnchor(addDays(weekStart, -7));
  const goNext = () => setAnchor(addDays(weekStart, 7));
  const swipe = useSwipe(goPrev, goNext);
  return (
    <div {...swipe}>
      <NavHeader label={label}
        onPrev={goPrev} onNext={goNext}
        onToday={() => setAnchor(today)} />
      <div className="flex flex-col gap-4">
        {days.map((day) => (
          <div key={day}>
            <DayHeading day={day} count={eventsOnDay(events, day).length} isToday={day === today} />
            <DayList events={eventsOnDay(events, day)} colorOf={colorOf} onOpen={onOpen} onLike={onLike} onCalendar={onCalendar} />
          </div>
        ))}
      </div>
    </div>
  );
}

function DayView({ events, anchor, setAnchor, today, colorOf, onOpen, onLike, onCalendar }: ViewProps) {
  const d = parse(anchor);
  const label = `${d.getMonth() + 1}月${d.getDate()}日（${WEEKDAYS[d.getDay()]}）`;
  const dayEvents = eventsOnDay(events, anchor);
  const goPrev = () => setAnchor(addDays(anchor, -1));
  const goNext = () => setAnchor(addDays(anchor, 1));
  const swipe = useSwipe(goPrev, goNext);
  return (
    <div {...swipe}>
      <NavHeader label={label}
        onPrev={goPrev} onNext={goNext}
        onToday={() => setAnchor(today)} />
      <DayList events={dayEvents} colorOf={colorOf} onOpen={onOpen} onLike={onLike} onCalendar={onCalendar} />
    </div>
  );
}

function DayHeading({ day, count, isToday }: { day: string; count: number; isToday?: boolean }) {
  const d = parse(day);
  const dow = d.getDay();
  const color = dow === 0 ? 'var(--cal-sunday-color)' : dow === 6 ? 'var(--cal-saturday-color)' : 'var(--label-primary)';
  return (
    <div className="flex items-baseline gap-2 mb-2 px-1">
      <span className="text-[14px] font-bold" style={{ color }}>
        {d.getMonth() + 1}月{d.getDate()}日（{WEEKDAYS[dow]}）
      </span>
      {isToday && <span className="text-[10px] font-bold rounded-full px-1.5 py-0.5" style={{ backgroundColor: 'var(--accent-color)', color: 'var(--accent-on)' }}>今日</span>}
      <span className="text-[12px] text-label-tertiary ml-auto">{count > 0 ? `${count}件` : ''}</span>
    </div>
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

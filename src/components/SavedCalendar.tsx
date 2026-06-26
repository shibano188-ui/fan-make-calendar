import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import type { CalendarEvent } from '../types';
import ItemCard from './item/ItemCard';
import { deriveStatus, todayStr, STATUS } from '../design/tokens';
import { haptic } from '../lib/haptics';

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
function dotColor(e: CalendarEvent): string {
  return STATUS[deriveStatus(e)].color;
}

/** その日に掛かる予定（date〜endDate の範囲に含まれるもの）。 */
function eventsOnDay(events: CalendarEvent[], day: string): CalendarEvent[] {
  return events.filter((e) => {
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
  onBuy: (e: CalendarEvent) => void;
};

export default function SavedCalendar({ events, scope, onOpen, onLike, onCalendar, onBuy }: Props) {
  const today = todayStr();
  const [anchor, setAnchor] = useState(today); // 基準日（選択日 / 表示中の日）

  // 日付未定の保存分（カレンダーに乗らないので別枠で件数表示）
  const undated = useMemo(() => events.filter((e) => !e.date), [events]);

  return (
    <div className="pb-4">
      {scope === 'month' && (
        <MonthView events={events} anchor={anchor} setAnchor={setAnchor} today={today}
          onOpen={onOpen} onLike={onLike} onCalendar={onCalendar} onBuy={onBuy} />
      )}
      {scope === 'week' && (
        <WeekView events={events} anchor={anchor} setAnchor={setAnchor} today={today}
          onOpen={onOpen} onLike={onLike} onCalendar={onCalendar} onBuy={onBuy} />
      )}
      {scope === 'day' && (
        <DayView events={events} anchor={anchor} setAnchor={setAnchor} today={today}
          onOpen={onOpen} onLike={onLike} onCalendar={onCalendar} onBuy={onBuy} />
      )}

      {undated.length > 0 && (
        <div className="mt-5">
          <div className="px-1 text-[12px] text-label-secondary mb-2">日付未定 {undated.length}件</div>
          <div className="flex flex-col gap-2">
            {undated.map((e) => (
              <ItemCard key={e.id} event={e} layout="list" likedInit={e.likedByMe}
                onOpen={() => onOpen(e)} onLike={() => onLike(e)} onCalendar={() => onCalendar(e)} onBuy={() => onBuy(e)} />
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
      <button onClick={() => { haptic.select(); onToday(); }}
        className="pressable text-[12px] font-semibold rounded-full px-3 py-1.5"
        style={{ backgroundColor: 'var(--fill-tertiary)', color: 'var(--label-primary)' }}>
        今日
      </button>
    </div>
  );
}

type ViewProps = {
  events: CalendarEvent[];
  anchor: string;
  setAnchor: (s: string) => void;
  today: string;
  onOpen: (e: CalendarEvent) => void;
  onLike: (e: CalendarEvent) => void;
  onCalendar: (e: CalendarEvent) => void;
  onBuy: (e: CalendarEvent) => void;
};

function MonthView({ events, anchor, setAnchor, today, onOpen, onLike, onCalendar, onBuy }: ViewProps) {
  const cur = parse(anchor);
  const year = cur.getFullYear();
  const month = cur.getMonth();
  const firstStr = todayStr(new Date(year, month, 1));
  const gridStart = startOfWeek(firstStr);
  const days = useMemo(() => Array.from({ length: 42 }, (_, i) => addDays(gridStart, i)), [gridStart]);
  const selected = anchor;
  const selectedEvents = useMemo(() => eventsOnDay(events, selected), [events, selected]);

  return (
    <div>
      <NavHeader label={`${year}年${month + 1}月`}
        onPrev={() => setAnchor(addMonths(anchor, -1))}
        onNext={() => setAnchor(addMonths(anchor, 1))}
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

      {/* 日グリッド */}
      <div className="grid grid-cols-7 gap-px rounded-[12px] overflow-hidden" style={{ backgroundColor: 'var(--separator)' }}>
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
              className="relative min-h-[58px] flex flex-col items-center pt-1.5 pressable"
              style={{ backgroundColor: isSel ? 'var(--fill-tertiary)' : 'var(--bg-primary)' }}>
              <span className="text-[12px] leading-none flex items-center justify-center w-5 h-5 rounded-full"
                style={isToday
                  ? { backgroundColor: 'var(--accent-color)', color: 'var(--accent-on)', fontWeight: 700 }
                  : { color: dayColor }}>
                {d.getDate()}
              </span>
              <div className="flex flex-wrap justify-center gap-[2px] mt-1 px-0.5">
                {dayEvents.slice(0, 4).map((e) => (
                  <span key={e.id} className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: dotColor(e) }} />
                ))}
              </div>
            </button>
          );
        })}
      </div>

      {/* 選択日の予定 */}
      <div className="mt-4">
        <DayHeading day={selected} count={selectedEvents.length} />
        <DayList events={selectedEvents} onOpen={onOpen} onLike={onLike} onCalendar={onCalendar} onBuy={onBuy} />
      </div>
    </div>
  );
}

function WeekView({ events, anchor, setAnchor, today, onOpen, onLike, onCalendar, onBuy }: ViewProps) {
  const weekStart = startOfWeek(anchor);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const end = days[6];
  const label = `${parse(weekStart).getMonth() + 1}/${parse(weekStart).getDate()}〜${parse(end).getMonth() + 1}/${parse(end).getDate()}`;
  return (
    <div>
      <NavHeader label={label}
        onPrev={() => setAnchor(addDays(weekStart, -7))}
        onNext={() => setAnchor(addDays(weekStart, 7))}
        onToday={() => setAnchor(today)} />
      <div className="flex flex-col gap-4">
        {days.map((day) => (
          <div key={day}>
            <DayHeading day={day} count={eventsOnDay(events, day).length} isToday={day === today} />
            <DayList events={eventsOnDay(events, day)} onOpen={onOpen} onLike={onLike} onCalendar={onCalendar} onBuy={onBuy} />
          </div>
        ))}
      </div>
    </div>
  );
}

function DayView({ events, anchor, setAnchor, today, onOpen, onLike, onCalendar, onBuy }: ViewProps) {
  const d = parse(anchor);
  const label = `${d.getMonth() + 1}月${d.getDate()}日（${WEEKDAYS[d.getDay()]}）`;
  const dayEvents = eventsOnDay(events, anchor);
  return (
    <div>
      <NavHeader label={label}
        onPrev={() => setAnchor(addDays(anchor, -1))}
        onNext={() => setAnchor(addDays(anchor, 1))}
        onToday={() => setAnchor(today)} />
      <DayList events={dayEvents} onOpen={onOpen} onLike={onLike} onCalendar={onCalendar} onBuy={onBuy} />
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

function DayList({ events, onOpen, onLike, onCalendar, onBuy }: { events: CalendarEvent[] } & Pick<ViewProps, 'onOpen' | 'onLike' | 'onCalendar' | 'onBuy'>) {
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
        <ItemCard key={e.id} event={e} layout="list" likedInit={e.likedByMe}
          onOpen={() => onOpen(e)} onLike={() => onLike(e)} onCalendar={() => onCalendar(e)} onBuy={() => onBuy(e)} />
      ))}
    </div>
  );
}

import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, X, Calendar, Music, Camera, Mail, Globe, Settings, Star, Heart } from 'lucide-react';
import { listUpcomingEvents, listEventsByDate, listEvents, getWorkById } from '../lib/api';
import type { CalendarEvent } from '../types';

// ─── 定数 ────────────────────────────────────────────────────────

const APP_ICONS = [
  { label: 'ファンカレ', Icon: Calendar, bg: '#1c2a4a' },
  { label: 'ミュージック', Icon: Music,    bg: '#2d1b3d' },
  { label: 'カメラ',       Icon: Camera,   bg: '#2a2a2a' },
  { label: 'メール',       Icon: Mail,     bg: '#1a2a4a' },
  { label: 'Safari',       Icon: Globe,    bg: '#0a3a5a' },
  { label: '設定',         Icon: Settings, bg: '#3a3a3c' },
  { label: 'お気に入り',   Icon: Star,     bg: '#3a2a1a' },
  { label: 'いいね',       Icon: Heart,    bg: '#3a1a1a' },
];

// ─── ユーティリティ ───────────────────────────────────────────────

function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getCalendarDays(year: number, month: number) {
  const firstDay = new Date(year, month, 1);
  const start = new Date(firstDay);
  start.setDate(1 - firstDay.getDay());
  const days: { date: Date; isCurrentMonth: boolean }[] = [];
  const cur = new Date(start);
  for (let i = 0; i < 42; i++) {
    days.push({ date: new Date(cur), isCurrentMonth: cur.getMonth() === month });
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

// ─── アプリアイコン行 ─────────────────────────────────────────────

function IconRow({ icons }: { icons: typeof APP_ICONS }) {
  return (
    <div className="flex justify-around">
      {icons.map(({ label, Icon, bg }) => (
        <div key={label} className="flex flex-col items-center gap-[5px]" style={{ width: 56 }}>
          <div
            className="w-[46px] h-[46px] rounded-[12px] flex items-center justify-center"
            style={{ backgroundColor: bg, boxShadow: '0 2px 8px rgba(0,0,0,0.4)' }}
          >
            <Icon size={22} color="white" />
          </div>
          <span className="text-white/80 text-[8px] truncate w-full text-center" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>
            {label}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── ミニウィジェット ─────────────────────────────────────────────

function CountdownWidget({ event, workName }: { event: CalendarEvent | null; workName: string }) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const days = event
    ? Math.ceil((new Date(event.date + 'T00:00:00').getTime() - today.getTime()) / 86_400_000)
    : null;

  return (
    <div
      className="w-full h-full rounded-[20px] p-4 flex flex-col justify-between"
      style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(16px)', border: '0.5px solid rgba(255,255,255,0.12)' }}
    >
      <p className="text-white/50 text-[9px] font-medium tracking-wide">{workName || 'カレンダー'}</p>
      <div className="flex flex-col items-center justify-center flex-1">
        <span className="text-white/50 text-xs">あと</span>
        <span
          className="text-white font-bold leading-none"
          style={{ fontSize: days === 0 ? '2.8rem' : '3.8rem' }}
        >
          {days === null ? '–' : days === 0 ? '今日' : days < 0 ? '終了' : days}
        </span>
        {days !== null && days > 0 && (
          <span className="text-white/60 text-base mt-0.5">日</span>
        )}
      </div>
      <p className="text-white text-[11px] font-medium truncate">
        {event?.title ?? '予定なし'}
      </p>
    </div>
  );
}

function TodayWidget({ events, dateStr }: { events: CalendarEvent[]; dateStr: string }) {
  const [, m, d] = dateStr.split('-').map(Number);
  const DAY = ['日','月','火','水','木','金','土'][new Date(dateStr + 'T00:00:00').getDay()];
  return (
    <div
      className="w-full h-full rounded-[20px] p-4 flex flex-col gap-2.5"
      style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(16px)', border: '0.5px solid rgba(255,255,255,0.12)' }}
    >
      <div className="flex items-end gap-2">
        <span className="text-white font-bold leading-none" style={{ fontSize: '2.2rem' }}>{d}</span>
        <div className="pb-1 flex flex-col">
          <span className="text-white/50 text-[9px]">{m}月</span>
          <span className="text-white/70 text-sm font-medium">{DAY}</span>
        </div>
      </div>
      <div className="flex flex-col gap-1.5 overflow-hidden flex-1">
        {events.length === 0 ? (
          <p className="text-white/30 text-[10px]">今日の予定はありません</p>
        ) : events.slice(0, 3).map(e => (
          <div key={e.id} className="flex items-center gap-2">
            <div className="w-1 h-1 rounded-full bg-blue-400 flex-shrink-0" />
            <p className="text-white/85 text-[11px] truncate">{e.title}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function CalendarWidget({ events, year, month, todayStr }: { events: CalendarEvent[]; year: number; month: number; todayStr: string }) {
  const eventDates = new Set(events.map(e => e.date));
  const days = getCalendarDays(year, month);
  const DAY_LABELS = ['日','月','火','水','木','金','土'];
  const todayEvents = events.filter(e => e.date === todayStr);

  return (
    <div
      className="w-full h-full rounded-[20px] p-3 flex flex-col gap-2"
      style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(16px)', border: '0.5px solid rgba(255,255,255,0.12)' }}
    >
      {/* カレンダーグリッド（コンパクト） */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <p className="text-white font-semibold text-xs">{month + 1}月</p>
          <p className="text-white/40 text-[9px]">{year}</p>
        </div>
        <div className="grid grid-cols-7 mb-0.5">
          {DAY_LABELS.map((l, i) => (
            <div key={l} className="text-center text-[7px]"
              style={{ color: i === 0 ? 'rgba(248,113,113,0.7)' : i === 6 ? 'rgba(96,165,250,0.7)' : 'rgba(255,255,255,0.35)' }}>
              {l}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map(({ date, isCurrentMonth }, idx) => {
            const ds = toDateStr(date);
            const isToday = ds === todayStr;
            const hasEvent = eventDates.has(ds) && isCurrentMonth;
            return (
              <div key={ds + idx} className="flex flex-col items-center py-px">
                <div
                  className="w-[17px] h-[17px] flex items-center justify-center rounded-full text-[7px] font-medium"
                  style={{
                    backgroundColor: isToday ? 'white' : 'transparent',
                    color: isToday ? '#000' : !isCurrentMonth ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.85)',
                    fontWeight: isToday ? 700 : 400,
                  }}
                >
                  {date.getDate()}
                </div>
                {hasEvent && <div className="w-[3px] h-[3px] rounded-full bg-blue-400 mt-px" />}
              </div>
            );
          })}
        </div>
      </div>

      {/* 区切り線 */}
      <div className="h-px flex-shrink-0" style={{ background: 'rgba(255,255,255,0.1)' }} />

      {/* 今日の予定 */}
      <div className="flex flex-col gap-1.5 flex-1 overflow-hidden">
        <p className="text-white/40 text-[8px]">今日の予定</p>
        {todayEvents.length === 0 ? (
          <p className="text-white/25 text-[10px]">予定なし</p>
        ) : todayEvents.slice(0, 3).map(e => (
          <div key={e.id} className="flex items-center gap-1.5">
            <div className="w-[3px] h-[3px] rounded-full bg-blue-400 flex-shrink-0" />
            <p className="text-white/80 text-[10px] truncate">{e.title}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function WeekWidget({ events, todayStr }: { events: CalendarEvent[]; todayStr: string }) {
  const today = new Date(todayStr + 'T00:00:00');
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - today.getDay());
  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(startOfWeek);
    d.setDate(startOfWeek.getDate() + i);
    return toDateStr(d);
  });

  const eventDateSet = new Set(events.map(e => e.date));
  const todayEvents = events.filter(e => e.date === todayStr);
  const DAY_LABELS = ['日','月','火','水','木','金','土'];

  return (
    <div
      className="w-full h-full rounded-[20px] p-4 flex flex-col gap-3"
      style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(16px)', border: '0.5px solid rgba(255,255,255,0.12)' }}
    >
      {/* 週ストリップ */}
      <div className="flex justify-between">
        {weekDates.map((ds, i) => {
          const d = new Date(ds + 'T00:00:00');
          const isToday = ds === todayStr;
          const hasEvent = eventDateSet.has(ds);
          return (
            <div key={ds} className="flex flex-col items-center gap-1">
              <span className="text-[8px]" style={{ color: isToday ? 'rgba(255,255,255,0.9)' : i === 0 ? 'rgba(248,113,113,0.6)' : i === 6 ? 'rgba(96,165,250,0.6)' : 'rgba(255,255,255,0.35)' }}>
                {DAY_LABELS[i]}
              </span>
              <div
                className="w-7 h-7 flex items-center justify-center rounded-full text-[11px] font-medium"
                style={{
                  backgroundColor: isToday ? 'white' : 'transparent',
                  color: isToday ? '#000' : 'rgba(255,255,255,0.75)',
                  fontWeight: isToday ? 700 : 400,
                }}
              >
                {d.getDate()}
              </div>
              <div className="w-[4px] h-[4px] rounded-full" style={{ backgroundColor: hasEvent ? 'rgba(96,165,250,0.9)' : 'transparent' }} />
            </div>
          );
        })}
      </div>

      {/* 区切り線 */}
      <div className="h-px flex-shrink-0" style={{ background: 'rgba(255,255,255,0.1)' }} />

      {/* 今日の予定 */}
      <div className="flex flex-col gap-1.5 flex-1 overflow-hidden">
        <p className="text-white/40 text-[8px]">今日の予定</p>
        {todayEvents.length === 0 ? (
          <p className="text-white/25 text-[10px]">予定なし</p>
        ) : todayEvents.slice(0, 3).map(e => (
          <div key={e.id} className="flex items-center gap-2">
            <div className="w-1 h-1 rounded-full bg-blue-400 flex-shrink-0" />
            <p className="text-white/85 text-[11px] truncate">{e.title}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── ページ定義 ───────────────────────────────────────────────────

interface PageData {
  event: CalendarEvent | null;
  todayEvents: CalendarEvent[];
  monthEvents: CalendarEvent[];
  workName: string;
  todayStr: string;
  year: number;
  month: number;
}

function PageCountdown({ event, workName }: PageData) {
  return (
    <div className="flex flex-col gap-3 h-full">
      <IconRow icons={APP_ICONS.slice(0, 4)} />
      <IconRow icons={APP_ICONS.slice(4, 8)} />
      <div className="flex-shrink-0" style={{ height: 148 }}>
        <CountdownWidget event={event} workName={workName} />
      </div>
      <IconRow icons={[APP_ICONS[0], APP_ICONS[2], APP_ICONS[5], APP_ICONS[7]]} />
    </div>
  );
}

function PageToday({ todayEvents, todayStr }: PageData) {
  return (
    <div className="flex flex-col gap-3 h-full">
      <IconRow icons={APP_ICONS.slice(0, 4)} />
      <div className="flex-shrink-0" style={{ height: 148 }}>
        <TodayWidget events={todayEvents} dateStr={todayStr} />
      </div>
      <IconRow icons={APP_ICONS.slice(4, 8)} />
      <IconRow icons={[APP_ICONS[1], APP_ICONS[3], APP_ICONS[6], APP_ICONS[0]]} />
    </div>
  );
}

function PageCalendar({ monthEvents, year, month, todayStr }: PageData) {
  return (
    <div className="flex flex-col gap-3 h-full">
      <IconRow icons={APP_ICONS.slice(0, 4)} />
      <div className="flex-1 min-h-0">
        <CalendarWidget events={monthEvents} year={year} month={month} todayStr={todayStr} />
      </div>
    </div>
  );
}

function PageWeek({ monthEvents, todayStr }: PageData) {
  return (
    <div className="flex flex-col gap-3 h-full">
      <IconRow icons={APP_ICONS.slice(0, 4)} />
      <div className="flex-shrink-0" style={{ height: 172 }}>
        <WeekWidget events={monthEvents} todayStr={todayStr} />
      </div>
      <IconRow icons={APP_ICONS.slice(4, 8)} />
      <IconRow icons={[APP_ICONS[0], APP_ICONS[2], APP_ICONS[5], APP_ICONS[7]]} />
    </div>
  );
}

const PAGES = [
  { Component: PageCountdown, label: 'カウントダウン' },
  { Component: PageToday,     label: '今日の予定' },
  { Component: PageCalendar,  label: '月カレンダー' },
  { Component: PageWeek,      label: '1週間' },
];

// ─── メインモーダル ────────────────────────────────────────────────

export default function WidgetPreviewModal({ onClose }: { onClose: () => void }) {
  const [page, setPage] = useState(0);
  const [data, setData] = useState<PageData>({
    event: null, todayEvents: [], monthEvents: [], workName: '',
    todayStr: '', year: new Date().getFullYear(), month: new Date().getMonth(),
  });

  useEffect(() => {
    const workId = localStorage.getItem('last_calendar_workId') ?? '';
    const today = new Date();
    const todayStr = toDateStr(today);
    const year = today.getFullYear();
    const month = today.getMonth();

    setData(d => ({ ...d, todayStr, year, month }));

    if (!workId) return;
    Promise.all([
      getWorkById(workId),
      listUpcomingEvents(workId, todayStr, 1),
      listEventsByDate(workId, todayStr),
      listEvents(workId, year, month),
    ]).then(([work, upcoming, todayEvs, monthEvs]) => {
      setData({
        event: upcoming[0] ?? null,
        todayEvents: todayEvs,
        monthEvents: monthEvs,
        workName: work?.name ?? '',
        todayStr, year, month,
      });
    });
  }, []);

  const prev = () => setPage(p => (p - 1 + PAGES.length) % PAGES.length);
  const next = () => setPage(p => (p + 1) % PAGES.length);
  const { Component, label } = PAGES[page];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)' }}>
      {/* 閉じるボタン */}
      <button
        onClick={onClose}
        className="absolute top-6 right-6 w-9 h-9 rounded-full flex items-center justify-center transition-colors"
        style={{ background: 'rgba(255,255,255,0.1)' }}
      >
        <X size={16} color="white" />
      </button>

      {/* 上部ラベル */}
      <div className="absolute top-8 left-0 right-0 flex flex-col items-center gap-1 pointer-events-none">
        <p className="text-white/40 text-[11px] tracking-widest uppercase">Widget Preview</p>
        <p className="text-white/80 text-sm font-medium">{label}</p>
      </div>

      {/* 左矢印 */}
      <button
        onClick={prev}
        className="absolute left-6 w-11 h-11 rounded-full flex items-center justify-center transition-colors"
        style={{ background: 'rgba(255,255,255,0.1)' }}
      >
        <ChevronLeft size={22} color="white" />
      </button>

      {/* 右矢印 */}
      <button
        onClick={next}
        className="absolute right-6 w-11 h-11 rounded-full flex items-center justify-center transition-colors"
        style={{ background: 'rgba(255,255,255,0.1)' }}
      >
        <ChevronRight size={22} color="white" />
      </button>

      {/* スマホ型フレーム */}
      <div className="relative flex-shrink-0" style={{ width: 310, height: 660 }}>
        {/* 物理フレーム */}
        <div
          className="absolute inset-0 rounded-[44px] border-[8px] border-[#3c3c3e]"
          style={{ boxShadow: '0 40px 100px rgba(0,0,0,0.9), 0 0 0 0.5px rgba(255,255,255,0.06) inset' }}
        />
        {/* スクリーン */}
        <div
          className="absolute inset-[8px] rounded-[36px] overflow-hidden flex flex-col"
          style={{ background: 'linear-gradient(155deg, #1c2340 0%, #0f1a30 45%, #0a0f20 100%)' }}
        >
          {/* ステータスバー */}
          <div className="flex items-center justify-between px-6 h-10 flex-shrink-0 pt-1">
            <span className="text-white text-[13px] font-semibold">9:41</span>
            <div className="flex items-center gap-[5px]">
              <svg width="13" height="9" viewBox="0 0 13 9" fill="white">
                <rect x="0"   y="5.5" width="2.2" height="3.5" rx="0.4" />
                <rect x="3.5" y="3.5" width="2.2" height="5.5" rx="0.4" />
                <rect x="7"   y="1.5" width="2.2" height="7.5" rx="0.4" />
                <rect x="10.5" y="0"  width="2.2" height="9"   rx="0.4" opacity="0.3" />
              </svg>
              <div className="flex items-center gap-[1px]">
                <div className="w-[17px] h-[8px] border border-white/60 rounded-[2px] p-[1.5px]">
                  <div className="bg-white w-[8px] h-full rounded-[1px]" />
                </div>
                <div className="w-[1.5px] h-[3.5px] bg-white/50 rounded-r" />
              </div>
            </div>
          </div>

          {/* Dynamic Island */}
          <div className="absolute top-2.5 left-1/2 -translate-x-1/2 w-[80px] h-[24px] bg-black rounded-full z-10 pointer-events-none" />

          {/* コンテンツ */}
          <div className="flex-1 min-h-0 px-4 pt-3 pb-14 overflow-hidden">
            <Component {...data} />
          </div>

          {/* ページドット */}
          <div className="absolute bottom-8 left-0 right-0 flex justify-center gap-1.5">
            {PAGES.map((_, i) => (
              <button key={i} onClick={() => setPage(i)}>
                <div
                  className="rounded-full transition-all duration-200"
                  style={{
                    width: i === page ? 14 : 5,
                    height: 5,
                    backgroundColor: i === page ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.3)',
                  }}
                />
              </button>
            ))}
          </div>

          {/* ホームインジケーター */}
          <div className="absolute bottom-2.5 left-1/2 -translate-x-1/2 w-20 h-[4px] bg-white/25 rounded-full pointer-events-none" />
        </div>
      </div>

      {/* 下部ページインジケーター（外側） */}
      <div className="absolute bottom-8 flex gap-2">
        {PAGES.map(({ label: l }, i) => (
          <button
            key={i}
            onClick={() => setPage(i)}
            className="flex flex-col items-center gap-1"
          >
            <div
              className="rounded-full transition-all duration-200"
              style={{
                width: i === page ? 24 : 8,
                height: 8,
                backgroundColor: i === page ? 'white' : 'rgba(255,255,255,0.25)',
              }}
            />
            <span
              className="text-[9px] transition-colors"
              style={{ color: i === page ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.25)' }}
            >
              {l}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

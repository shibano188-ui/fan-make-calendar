import { useState, useMemo, useEffect } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { listEvents, getWorkById } from '../lib/api';
import type { CalendarEvent } from '../types';

const THEMES: Record<string, Record<string, string>> = {
  dark: { '--bg-primary': '#1a1a1a', '--bg-secondary': '#2a2a2a', '--label-primary': '#ffffff', '--label-secondary': '#aaaaaa', '--label-tertiary': '#666666' },
  light: { '--bg-primary': '#f5f5f5', '--bg-secondary': '#e8e8e8', '--label-primary': '#111111', '--label-secondary': '#555555', '--label-tertiary': '#888888' },
};

function applyTheme(theme: string) {
  const vars = THEMES[theme] ?? THEMES.dark;
  Object.entries(vars).forEach(([k, v]) => document.documentElement.style.setProperty(k, v));
}

const DAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'];

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

function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function WidgetMonth() {
  const { workId = '' } = useParams<{ workId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const theme = searchParams.get('theme') ?? 'dark';

  const today = new Date();
  const todayStr = toDateStr(today);

  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [workName, setWorkName] = useState('');
  const [events, setEvents] = useState<CalendarEvent[]>([]);

  useEffect(() => { applyTheme(theme); }, [theme]);

  useEffect(() => {
    getWorkById(workId).then(w => { if (w) setWorkName(w.name); });
  }, [workId]);

  useEffect(() => {
    listEvents(workId, year, month).then(setEvents).catch(() => {});
  }, [workId, year, month]);

  const calendarDays = useMemo(() => getCalendarDays(year, month), [year, month]);
  const eventDates = useMemo(() => new Set(events.map(e => e.date)), [events]);

  const prevMonth = () => {
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else setMonth(m => m + 1);
  };

  return (
    <div className="min-h-screen flex flex-col px-3 pt-4 pb-4" style={{ backgroundColor: 'var(--bg-primary)' }}>
      {/* ヘッダー */}
      <div className="flex items-center justify-between px-2 mb-4">
        <p className="text-sm font-semibold" style={{ color: 'var(--label-primary)' }}>
          {workName || '…'}
        </p>
        <div className="flex items-center gap-2">
          <button onClick={prevMonth} className="text-xl px-1 active:opacity-50" style={{ color: 'var(--label-tertiary)' }}>‹</button>
          <span className="text-xs" style={{ color: 'var(--label-secondary)' }}>{year}年 {month + 1}月</span>
          <button onClick={nextMonth} className="text-xl px-1 active:opacity-50" style={{ color: 'var(--label-tertiary)' }}>›</button>
        </div>
      </div>

      {/* 曜日ラベル */}
      <div className="grid grid-cols-7 mb-1">
        {DAY_LABELS.map((label, i) => (
          <div
            key={label}
            className="text-center text-[11px] py-1 font-medium select-none"
            style={{
              color: i === 0 ? 'rgba(239,68,68,0.8)' : i === 6 ? 'rgba(96,165,250,0.8)' : 'var(--label-tertiary)',
            }}
          >
            {label}
          </div>
        ))}
      </div>

      {/* カレンダーグリッド */}
      <div className="grid grid-cols-7 flex-1">
        {calendarDays.map(({ date, isCurrentMonth }, idx) => {
          const dateStr = toDateStr(date);
          const isToday = dateStr === todayStr;
          const hasEvent = eventDates.has(dateStr) && isCurrentMonth;
          const col = idx % 7;

          return (
            <button
              key={dateStr + idx}
              onClick={() => navigate(`/calendar/${workId}/date/${dateStr}`)}
              className="flex flex-col items-center py-1 active:opacity-50"
            >
              <div
                className="w-8 h-8 flex items-center justify-center rounded-full text-[13px] font-medium select-none"
                style={{
                  backgroundColor: isToday ? 'var(--label-primary)' : 'transparent',
                  color: isToday
                    ? 'var(--bg-primary)'
                    : !isCurrentMonth
                    ? 'var(--label-tertiary)'
                    : col === 0
                    ? 'rgba(239,68,68,0.8)'
                    : col === 6
                    ? 'rgba(96,165,250,0.8)'
                    : 'var(--label-primary)',
                  opacity: !isCurrentMonth ? 0.3 : 1,
                  fontWeight: isToday ? 700 : 500,
                }}
              >
                {date.getDate()}
              </div>
              <div className="h-[6px] flex items-center justify-center">
                {hasEvent && (
                  <div
                    className="w-[4px] h-[4px] rounded-full"
                    style={{ backgroundColor: isToday ? 'var(--bg-secondary)' : 'var(--label-secondary)' }}
                  />
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

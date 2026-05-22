import { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { listEventsByDate, listUpcomingEvents, getWorkById } from '../lib/api';
import type { CalendarEvent } from '../types';

const THEMES: Record<string, Record<string, string>> = {
  dark: { '--bg-primary': '#1a1a1a', '--bg-secondary': '#2a2a2a', '--label-primary': '#ffffff', '--label-secondary': '#aaaaaa', '--label-tertiary': '#666666', '--border-subtle': 'rgba(255,255,255,0.08)' },
  light: { '--bg-primary': '#f5f5f5', '--bg-secondary': '#e8e8e8', '--label-primary': '#111111', '--label-secondary': '#555555', '--label-tertiary': '#888888', '--border-subtle': 'rgba(0,0,0,0.08)' },
};

function applyTheme(theme: string) {
  const vars = THEMES[theme] ?? THEMES.dark;
  Object.entries(vars).forEach(([k, v]) => document.documentElement.style.setProperty(k, v));
}

function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const DAY_NAMES = ['日', '月', '火', '水', '木', '金', '土'];

export default function WidgetToday() {
  const { workId = '' } = useParams<{ workId: string }>();
  const [searchParams] = useSearchParams();
  const theme = searchParams.get('theme') ?? 'dark';

  const [todayEvents, setTodayEvents] = useState<CalendarEvent[]>([]);
  const [nextEvent, setNextEvent] = useState<CalendarEvent | null>(null);
  const [workName, setWorkName] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => { applyTheme(theme); }, [theme]);

  const today = new Date();
  const todayStr = toDateStr(today);

  useEffect(() => {
    getWorkById(workId).then(w => { if (w) setWorkName(w.name); });
  }, [workId]);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      listEventsByDate(workId, todayStr),
      listUpcomingEvents(workId, todayStr, 3),
    ]).then(([todayEvs, upcoming]) => {
      setTodayEvents(todayEvs);
      const next = upcoming.find(e => e.date > todayStr) ?? null;
      setNextEvent(next);
    }).finally(() => setLoading(false));
  }, [workId, todayStr]);

  const formatNextDate = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00');
    const diff = Math.ceil((d.getTime() - today.setHours(0,0,0,0)) / 86_400_000);
    if (diff === 1) return '明日';
    if (diff <= 7) return `${diff}日後`;
    return `${d.getMonth() + 1}月${d.getDate()}日`;
  };

  return (
    <div className="min-h-screen flex flex-col px-6 pt-10 pb-8 gap-8" style={{ backgroundColor: 'var(--bg-primary)' }}>
      {/* 今日の日付 */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs mb-1" style={{ color: 'var(--label-tertiary)' }}>
            {today.getFullYear()}年{today.getMonth() + 1}月
          </p>
          <div className="flex items-end gap-2">
            <span className="text-7xl font-bold leading-none" style={{ color: 'var(--label-primary)' }}>
              {today.getDate()}
            </span>
            <span className="text-2xl pb-1" style={{ color: 'var(--label-secondary)' }}>
              {DAY_NAMES[today.getDay()]}
            </span>
          </div>
        </div>
        {workName && (
          <p className="text-xs pt-1" style={{ color: 'var(--label-tertiary)' }}>{workName}</p>
        )}
      </div>

      {/* 今日の予定 */}
      <div className="flex flex-col gap-3 flex-1">
        {loading ? (
          <>
            <div className="h-16 rounded-xl animate-pulse" style={{ backgroundColor: 'var(--bg-secondary)' }} />
            <div className="h-16 rounded-xl animate-pulse" style={{ backgroundColor: 'var(--bg-secondary)' }} />
          </>
        ) : todayEvents.length > 0 ? (
          todayEvents.map(e => (
            <div key={e.id} className="rounded-xl px-4 py-3" style={{ backgroundColor: 'var(--bg-secondary)' }}>
              <p className="font-semibold text-sm" style={{ color: 'var(--label-primary)' }}>{e.title}</p>
              <div className="flex items-center gap-2 mt-1">
                {e.time && <span className="text-xs" style={{ color: 'var(--label-secondary)' }}>{e.time}</span>}
                {e.category && <span className="text-xs" style={{ color: 'var(--label-tertiary)' }}>{e.category}</span>}
              </div>
            </div>
          ))
        ) : (
          <div className="flex flex-col items-center justify-center flex-1 gap-3 text-center py-8">
            <p className="text-sm" style={{ color: 'var(--label-tertiary)' }}>今日の予定はありません</p>
            {nextEvent && (
              <div className="rounded-xl px-4 py-3 w-full" style={{ backgroundColor: 'var(--bg-secondary)' }}>
                <p className="text-xs mb-1" style={{ color: 'var(--label-tertiary)' }}>
                  次の予定（{formatNextDate(nextEvent.date)}）
                </p>
                <p className="font-semibold text-sm" style={{ color: 'var(--label-primary)' }}>{nextEvent.title}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

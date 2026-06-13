import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { listEventsByDate, listUpcomingEvents, getWorkById } from '../lib/api';
import { loadCalendarSettings, applySettingsToCSS } from '../contexts/ThemeContext';
import { parseCategories } from '../lib/constants';
import type { CalendarEvent } from '../types';

function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const DAY_NAMES = ['日', '月', '火', '水', '木', '金', '土'];

export default function WidgetToday() {
  const { workId = '' } = useParams<{ workId: string }>();

  const [todayEvents, setTodayEvents] = useState<CalendarEvent[]>([]);
  const [nextEvent, setNextEvent] = useState<CalendarEvent | null>(null);
  const [workName, setWorkName] = useState('');
  const [loading, setLoading] = useState(true);

  // カレンダーごとの設定を適用
  useEffect(() => {
    const settings = loadCalendarSettings(workId);
    applySettingsToCSS(settings);
  }, [workId]);

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
      const next = upcoming.find(e => !!e.date && e.date > todayStr) ?? null;
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
    <div
      className="min-h-screen flex flex-col px-6 pt-10 pb-8 gap-8"
      style={{
        backgroundColor: 'var(--bg-primary)',
        backgroundImage: 'var(--bg-image, none)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
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
                {e.category && <span className="text-xs" style={{ color: 'var(--label-tertiary)' }}>{parseCategories(e.category).join('・')}</span>}
              </div>
            </div>
          ))
        ) : (
          <div className="flex flex-col items-center justify-center flex-1 gap-3 text-center py-8">
            <p className="text-sm" style={{ color: 'var(--label-tertiary)' }}>今日の予定はありません</p>
            {nextEvent && (
              <div className="rounded-xl px-4 py-3 w-full" style={{ backgroundColor: 'var(--bg-secondary)' }}>
                <p className="text-xs mb-1" style={{ color: 'var(--label-tertiary)' }}>
                  次の予定（{nextEvent.dateLabel ?? (nextEvent.date ? formatNextDate(nextEvent.date) : '日付未定')}）
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

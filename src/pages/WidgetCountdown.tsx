import { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { getEventById, listUpcomingEvents, getWorkById } from '../lib/api';
import { loadCalendarSettings, applySettingsToCSS } from '../contexts/ThemeContext';
import type { CalendarEvent } from '../types';

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function WidgetCountdown() {
  const { workId = '' } = useParams<{ workId: string }>();
  const [searchParams] = useSearchParams();
  const eventId = searchParams.get('eventId');

  const [event, setEvent] = useState<CalendarEvent | null>(null);
  const [workName, setWorkName] = useState('');
  const [loading, setLoading] = useState(true);

  // カレンダーごとの設定を適用
  useEffect(() => {
    const settings = loadCalendarSettings(workId);
    applySettingsToCSS(settings);
  }, [workId]);

  useEffect(() => {
    getWorkById(workId).then(w => { if (w) setWorkName(w.name); });
  }, [workId]);

  useEffect(() => {
    setLoading(true);
    const today = toDateStr(new Date());
    const fetch = eventId
      ? getEventById(eventId)
      : listUpcomingEvents(workId, today, 1).then(list => list[0] ?? null);
    fetch.then(setEvent).finally(() => setLoading(false));
  }, [workId, eventId]);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = event
    ? Math.ceil((new Date(event.date + 'T00:00:00').getTime() - today.getTime()) / 86_400_000)
    : null;

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00');
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
  };

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center gap-6 px-8"
      style={{
        backgroundColor: 'var(--bg-primary)',
        backgroundImage: 'var(--bg-image, none)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      {loading ? (
        <div className="w-24 h-24 rounded-full bg-white/5 animate-pulse" />
      ) : !event ? (
        <p style={{ color: 'var(--label-secondary)' }} className="text-sm">予定がありません</p>
      ) : (
        <>
          {workName && (
            <p className="text-xs tracking-widest uppercase" style={{ color: 'var(--label-tertiary)' }}>
              {workName}
            </p>
          )}

          <div className="flex flex-col items-center gap-1">
            <span className="text-sm" style={{ color: 'var(--label-secondary)' }}>あと</span>
            <span
              className="font-bold leading-none"
              style={{
                color: 'var(--label-primary)',
                fontSize: days === 0 ? '5rem' : '7rem',
              }}
            >
              {days === 0 ? '今日' : days !== null && days < 0 ? '終了' : days}
            </span>
            {days !== null && days > 0 && (
              <span className="text-2xl" style={{ color: 'var(--label-secondary)' }}>日</span>
            )}
          </div>

          <div className="flex flex-col items-center gap-1 text-center">
            <p className="text-lg font-semibold" style={{ color: 'var(--label-primary)' }}>
              {event.title}
            </p>
            {event.category && (
              <p className="text-xs px-2 py-0.5 rounded-full border" style={{ color: 'var(--label-tertiary)', borderColor: 'rgba(255,255,255,0.15)' }}>
                {event.category}
              </p>
            )}
            <p className="text-sm mt-1" style={{ color: 'var(--label-secondary)' }}>
              {formatDate(event.date)}
              {event.time && ` ${event.time}`}
            </p>
          </div>
        </>
      )}
    </div>
  );
}

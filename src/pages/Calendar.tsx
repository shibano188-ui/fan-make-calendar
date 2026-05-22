import { useState, useMemo, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Palette, Plus, Heart, MoreVertical, Link2, LogOut } from 'lucide-react';
import Layout from '../components/Layout';
import Header from '../components/Header';
import { listEvents, getWorkById, leaveCalendar } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import type { CalendarEvent } from '../types';

export type { CalendarEvent };

// ─── カレンダーグリッドのユーティリティ ───────────────────────────

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

export function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ─── メイン画面 ────────────────────────────────────────────────────

export default function Calendar() {
  const { workId = '' } = useParams<{ workId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  if (!workId) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center px-8 py-24 gap-5 text-center">
          <p className="text-label-primary font-semibold text-base">カレンダーがまだありません</p>
          <p className="text-label-secondary text-sm">参加したい作品を検索して、みんなのカレンダーに参加しましょう。</p>
          <button
            onClick={() => navigate('/')}
            className="px-5 py-2.5 bg-label-primary text-bg-primary rounded-xl text-sm font-medium active:opacity-70"
          >
            作品を追加してみましょう
          </button>
        </div>
      </Layout>
    );
  }
  const location = useLocation();

  const today = new Date();
  const todayStr = toDateStr(today);

  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [workName, setWorkName] = useState('');
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showMenu, setShowMenu] = useState(false);
  const [copyDone, setCopyDone] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const handleCopyUrl = async () => {
    const url = `${window.location.origin}/calendar/${workId}`;
    await navigator.clipboard.writeText(url);
    setCopyDone(true);
    setTimeout(() => setCopyDone(false), 2000);
    setShowMenu(false);
  };

  const handleLeave = async () => {
    if (!user) return;
    if (!window.confirm(`「${workName}」のカレンダーから抜けますか？`)) return;
    await leaveCalendar(workId, user.id);
    localStorage.removeItem('last_calendar_workId');
    navigate('/');
  };

  // 作品名を取得 & last_workId を保存
  useEffect(() => {
    if (!workId) return;
    localStorage.setItem('last_calendar_workId', workId);
    getWorkById(workId).then(w => { if (w) setWorkName(w.name); });
  }, [workId]);

  // イベントをSupabaseから取得
  useEffect(() => {
    setLoading(true);
    setError('');
    listEvents(workId, year, month)
      .then(setEvents)
      .catch(() => setError('イベントの読み込みに失敗しました'))
      .finally(() => setLoading(false));
  }, [workId, year, month, location.key]);

  const calendarDays = useMemo(() => getCalendarDays(year, month), [year, month]);
  const eventDates = useMemo(() => new Set(events.map(e => e.date)), [events]);
  const monthEvents = useMemo(
    () => [...events].sort((a, b) => a.date.localeCompare(b.date)),
    [events],
  );

  const prevMonth = () => {
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else setMonth(m => m - 1);
  };

  const nextMonth = () => {
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else setMonth(m => m + 1);
  };

  return (
    <Layout>
      <Header
        title={workName || '…'}
        subtitleNode={
          <div className="flex items-center justify-center gap-2">
            <button onClick={prevMonth} className="text-label-tertiary text-lg leading-none px-1 active:text-label-primary">‹</button>
            <span className="text-xs text-label-secondary">{year}年 {month + 1}月</span>
            <button onClick={nextMonth} className="text-label-tertiary text-lg leading-none px-1 active:text-label-primary">›</button>
          </div>
        }
        rightAction={
          <div className="flex items-center gap-1">
            <button
              onClick={() => navigate('/customize')}
              className="w-8 h-8 flex items-center justify-center rounded-lg bg-bg-secondary text-label-secondary"
            >
              <Palette size={16} />
            </button>
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setShowMenu(v => !v)}
                className="w-8 h-8 flex items-center justify-center rounded-lg bg-bg-secondary text-label-secondary"
              >
                <MoreVertical size={16} />
              </button>
              {showMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
                  <div className="absolute right-0 top-9 z-50 bg-bg-secondary border border-subtle rounded-xl overflow-hidden shadow-lg w-48">
                    <button
                      onClick={handleCopyUrl}
                      className="w-full flex items-center gap-3 px-4 py-3 text-sm text-label-primary active:opacity-60"
                    >
                      <Link2 size={15} className="text-label-secondary" />
                      {copyDone ? 'コピーしました！' : '招待リンクをコピー'}
                    </button>
                    <div className="h-px bg-subtle mx-3" />
                    <button
                      onClick={handleLeave}
                      className="w-full flex items-center gap-3 px-4 py-3 text-sm text-red-400 active:opacity-60"
                    >
                      <LogOut size={15} />
                      カレンダーから抜ける
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        }
      />

      {/* カレンダーグリッド */}
      <div className="px-3 pt-3 pb-1">
        <div className="grid grid-cols-7 mb-1">
          {DAY_LABELS.map((label, i) => (
            <div
              key={label}
              className={`text-center text-[11px] py-1 font-medium select-none ${
                i === 0 ? 'text-red-400/80' : i === 6 ? 'text-blue-400/80' : 'text-label-tertiary'
              }`}
            >
              {label}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {calendarDays.map(({ date, isCurrentMonth }, idx) => {
            const dateStr = toDateStr(date);
            const isToday = dateStr === todayStr;
            const hasEvent = eventDates.has(dateStr) && isCurrentMonth;
            const col = idx % 7;

            return (
              <button
                key={dateStr + idx}
                onClick={() => navigate(`/calendar/${workId}/date/${dateStr}`)}
                className="flex flex-col items-center py-[3px] active:opacity-50 transition-opacity"
              >
                <div
                  className={`w-8 h-8 flex items-center justify-center rounded-full text-[13px] font-medium select-none ${
                    isToday
                      ? 'bg-label-primary text-bg-primary font-bold'
                      : !isCurrentMonth
                      ? 'text-label-tertiary opacity-30'
                      : col === 0
                      ? 'text-red-400/80'
                      : col === 6
                      ? 'text-blue-400/80'
                      : 'text-label-primary'
                  }`}
                >
                  {date.getDate()}
                </div>
                <div className="h-[6px] flex items-center justify-center">
                  {hasEvent && (
                    <div className={`w-[4px] h-[4px] rounded-full ${isToday ? 'bg-bg-secondary' : 'bg-label-secondary'}`} />
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 今月の予定 */}
      <div className="px-4 pt-3 pb-24">
        <p className="text-label-secondary text-xs mb-3 px-1">今月の予定</p>

        {loading ? (
          <div className="flex flex-col gap-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-16 bg-bg-secondary rounded-xl animate-pulse" />
            ))}
          </div>
        ) : error ? (
          <p className="text-center text-red-400 text-sm py-10">{error}</p>
        ) : monthEvents.length === 0 ? (
          <p className="text-center text-label-tertiary text-sm py-10">この月の予定はまだありません</p>
        ) : (
          <div className="flex flex-col gap-2">
            {monthEvents.map(event => {
              const [, m, d] = event.date.split('-').map(Number);
              return (
                <button
                  key={event.id}
                  onClick={() => navigate(`/calendar/${workId}/date/${event.date}`)}
                  className="w-full flex items-center gap-3 bg-bg-secondary rounded-xl px-3 py-3 text-left active:opacity-70 transition-opacity"
                >
                  <div className="flex-shrink-0 w-10 flex flex-col items-center">
                    <span className="text-[10px] text-label-tertiary leading-none">{m}月</span>
                    <span className="text-xl font-bold text-label-primary leading-snug">{d}</span>
                  </div>
                  <div className="w-px h-8 bg-white/10 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-label-primary text-sm font-medium truncate">{event.title}</p>
                    <div className="flex items-center gap-1 mt-1">
                      <Heart size={11} className={event.likedByMe ? 'text-red-400 fill-red-400' : 'text-label-tertiary'} />
                      <span className="text-label-tertiary text-xs">{event.likes.toLocaleString('ja-JP')}</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* FAB */}
      <button
        onClick={() => navigate(`/calendar/${workId}/post`)}
        className="fixed bottom-[76px] right-4 w-[52px] h-[52px] bg-label-primary text-bg-primary rounded-full flex items-center justify-center shadow-xl z-40 active:opacity-80 transition-opacity"
        aria-label="予定を追加"
      >
        <Plus size={22} strokeWidth={2.5} />
      </button>
    </Layout>
  );
}

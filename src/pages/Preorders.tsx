import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ExternalLink } from 'lucide-react';
import BottomTab from '../components/BottomTab';
import Header from '../components/Header';
import MemoText from '../components/MemoText';
import { listPreorderEvents, listRecentWorks, type Work } from '../lib/api';
import { parseLinks, getCategoryColor } from '../lib/constants';
import { useAuth } from '../contexts/AuthContext';
import type { CalendarEvent } from '../types';
import { WORK_COLORS } from './Calendar';

const BOTTOM_TAB_H = 56;

function daysLeft(dateStr: string): number {
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000);
}

export default function Preorders() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [works, setWorks] = useState<Work[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    listRecentWorks(user.id).then(ws => {
      setWorks(ws);
      return listPreorderEvents(ws.map(w => w.id));
    }).then(evts => {
      setEvents(evts);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const workColorMap = useMemo(() => {
    const saved: Record<string, string> = (() => {
      try { return JSON.parse(localStorage.getItem('fan_work_colors') ?? '{}'); } catch { return {}; }
    })();
    const m = new Map<string, string>();
    const usedColors = new Set(Object.values(saved));
    works.forEach(w => {
      if (saved[w.id]) { m.set(w.id, saved[w.id]); return; }
      const color = WORK_COLORS.find(c => !usedColors.has(c)) ?? WORK_COLORS[0];
      m.set(w.id, color);
      usedColors.add(color);
    });
    return m;
  }, [works]);

  const today = new Date().toISOString().slice(0, 10);
  const active = events.filter(e => !e.date || e.date <= today);
  const upcoming = events.filter(e => e.date && e.date > today);

  const renderTile = (event: CalendarEvent) => {
    const workColor = event.workId ? (workColorMap.get(event.workId) ?? 'var(--accent-color)') : 'var(--accent-color)';
    const catColor = getCategoryColor(event.category);
    const borderColor = catColor ?? workColor;
    const days = event.endDate ? daysLeft(event.endDate) : null;
    const links = parseLinks(event.link);
    const workName = works.find(w => w.id === event.workId)?.name;

    const [, sm, sd] = event.date ? event.date.split('-').map(Number) : [0, 0, 0];
    const [, em, ed] = event.endDate ? event.endDate.split('-').map(Number) : [0, 0, 0];

    return (
      <div
        key={event.id}
        className="bg-bg-secondary rounded-xl overflow-hidden shadow-card"
        style={{ borderLeft: catColor ? `3px solid ${catColor}` : undefined }}
      >
        {/* コンテンツ部分（左に受付期間列） */}
        <div className="flex items-stretch px-4 pt-4 gap-3">
          {/* 受付期間（左列） */}
          <div className="flex-shrink-0 w-10 flex flex-col items-center pt-0.5">
            {event.date ? (
              <>
                <span className="text-[13px] font-bold text-label-primary leading-snug">{sm}/{sd}</span>
                {event.endDate && (
                  <span className="text-[12px] font-bold text-label-secondary leading-snug">〜{em}/{ed}</span>
                )}
              </>
            ) : (
              <span className="text-sm text-label-tertiary">—</span>
            )}
          </div>

          <div className="w-px self-stretch bg-white/10 flex-shrink-0" />

          {/* 右側コンテンツ */}
          <div className="flex-1 min-w-0 flex flex-col gap-2 pb-3">
            {/* バッジ行 */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {event.isOrderMade && (
                <span
                  className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                  style={{ background: workColor, color: '#fff' }}
                >
                  受注
                </span>
              )}
              {workName && (
                <span
                  className="text-[10px] font-medium px-2 py-0.5 rounded-full"
                  style={{ background: `${workColor}22`, color: workColor }}
                >
                  {workName}
                </span>
              )}
              {event.category && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-bg-primary text-label-secondary">
                  {event.category}
                </span>
              )}
            </div>

            {/* タイトル */}
            <span className="text-sm font-bold text-label-primary leading-snug">{event.title}</span>

            {/* メモ */}
            {event.memo && (
              <MemoText text={event.memo} className="text-xs text-label-tertiary" />
            )}
          </div>
        </div>

        {/* 下段：締切・購入ボタン */}
        <div
          className="flex items-center justify-between px-4 py-2 border-t gap-2"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <span
            className="text-xs font-bold"
            style={{
              color: days === null ? 'var(--label-tertiary)'
                : days <= 0 ? '#ef4444'
                : days <= 3 ? '#ef4444'
                : days <= 7 ? '#f97316'
                : 'var(--label-secondary)',
            }}
          >
            {days === null ? '締切未定' : days <= 0 ? '⚠️ 本日締切' : `締切まで${days}日`}
          </span>

          {links.length > 0 && (
            <a
              href={links[0]}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-full font-bold active:opacity-60"
              style={{ background: workColor, color: '#fff' }}
            >
              <ExternalLink size={11} />
              購入・予約する
            </a>
          )}
        </div>
      </div>
    );
  };

  return (
    <>
      <div
        className="fixed inset-0 max-w-app mx-auto flex flex-col overflow-hidden"
        style={{ backgroundColor: 'var(--bg-primary)', paddingTop: 36, paddingBottom: BOTTOM_TAB_H }}
      >
        <Header
          compact
          leftNode={
            <div className="flex items-center gap-1">
              <button onClick={() => navigate(-1)} className="w-8 h-8 flex items-center justify-center rounded-lg active:opacity-60">
                <ChevronLeft size={20} className="text-label-primary" />
              </button>
              <span className="text-base font-bold text-label-primary">予約受付中</span>
            </div>
          }
        />

        <div className="flex-1 overflow-y-auto px-4 pt-3 pb-6">
          {loading ? (
            <div className="flex flex-col gap-3">
              {[1, 2, 3].map(i => <div key={i} className="h-24 bg-bg-secondary rounded-xl animate-pulse" />)}
            </div>
          ) : events.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-16">
              <p className="text-label-tertiary text-sm">受付中の受注・予約商品はありません</p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {active.length > 0 && (
                <div className="flex flex-col gap-3">
                  <p className="text-xs font-bold" style={{ color: 'var(--accent-color)' }}>⚠️ 受付中</p>
                  {active.map(renderTile)}
                </div>
              )}
              {upcoming.length > 0 && (
                <div className="flex flex-col gap-3">
                  <p className="text-xs font-bold text-label-secondary">📅 もうすぐ予約開始</p>
                  {upcoming.map(renderTile)}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      <BottomTab />
    </>
  );
}

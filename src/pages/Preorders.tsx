import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ExternalLink } from 'lucide-react';
import BottomTab from '../components/BottomTab';
import Header from '../components/Header';
import { listPreorderEvents, listRecentWorks, type Work } from '../lib/api';
import { parseLinks } from '../lib/constants';
import { useAuth } from '../contexts/AuthContext';
import type { CalendarEvent } from '../types';
import { WORK_COLORS } from './Calendar';

const BOTTOM_TAB_H = 56;

function daysLeft(dateStr: string): number {
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000);
}

function formatDateRange(date: string | null, endDate?: string): string {
  if (!date) return '';
  const fmt = (d: string) => {
    const [, m, day] = d.split('-');
    return `${parseInt(m)}/${parseInt(day)}`;
  };
  return endDate ? `${fmt(date)}〜${fmt(endDate)}` : fmt(date);
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
    const color = event.workId ? (workColorMap.get(event.workId) ?? 'var(--accent-color)') : 'var(--accent-color)';
    const days = event.endDate ? daysLeft(event.endDate) : null;
    const links = parseLinks(event.link);
    const workName = works.find(w => w.id === event.workId)?.name;

    return (
      <div
        key={event.id}
        className="rounded-xl p-4 flex flex-col gap-2"
        style={{ background: 'var(--bg-secondary)', borderLeft: `3px solid ${color}` }}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-col gap-1 min-w-0">
            {workName && (
              <span className="text-[11px] font-bold" style={{ color }}>{workName}</span>
            )}
            <span className="text-sm font-bold text-label-primary leading-snug">{event.title}</span>
          </div>
          {event.isOrderMade && (
            <span className="flex-shrink-0 text-[10px] px-2 py-0.5 rounded-full font-bold" style={{ background: color, color: '#fff' }}>
              受注
            </span>
          )}
        </div>

        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-label-secondary">
            受付: {formatDateRange(event.date, event.endDate)}
          </span>
          {days !== null && (
            <span
              className="text-xs font-bold"
              style={{ color: days <= 3 ? '#ef4444' : days <= 7 ? '#f97316' : 'var(--label-secondary)' }}
            >
              {days <= 0 ? '本日締切' : `締切まで${days}日`}
            </span>
          )}
          {days === null && (
            <span className="text-xs text-label-tertiary">締切未定</span>
          )}
        </div>

        {event.memo && (
          <span className="text-xs text-label-tertiary">{event.memo}</span>
        )}

        {links.length > 0 && (
          <a
            href={links[0]}
            target="_blank"
            rel="noopener noreferrer"
            className="self-start flex items-center gap-1 text-xs px-3 py-1.5 rounded-full font-bold active:opacity-60"
            style={{ background: color, color: '#fff' }}
          >
            <ExternalLink size={12} />
            購入・予約する
          </a>
        )}
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
      <BottomTab active="discover" />
    </>
  );
}

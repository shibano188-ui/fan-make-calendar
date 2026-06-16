import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ChevronLeft, ExternalLink, SlidersHorizontal } from 'lucide-react';
import BottomTab from '../components/BottomTab';
import Header from '../components/Header';
import PreorderEditSheet from '../components/PreorderEditSheet';
import EventTile from '../components/EventTile';
import { useLikeAnimation } from '../hooks/useLikeAnimation';
import { useReportedEventIds } from '../hooks/useReportedEventIds';
import {
  listPreorderEvents, listRecentWorks, addLikeTap, setReaction, type Work,
} from '../lib/api';
import { getCached, setCached } from '../lib/swrCache';
import {
  POST_CATEGORIES,
  parseLinks, parseCategories, GOODS_SUBCATEGORIES,
  loadLikedEventIds, addLikedEventId,
  loadCalendarEventIds, addCalendarEventId,
  incrementTotalLikesGiven,
  loadImageVisibility,
  loadCategoryFilters, saveCategoryFilters,
  loadHiddenWorkIds, saveHiddenWorkIds,
} from '../lib/constants';
import { REACTIONS, type ReactionType } from '../lib/reactions';
import { useAuth } from '../contexts/AuthContext';
import type { CalendarEvent } from '../types';
import { WORK_COLORS } from './Calendar';
import { getContrastText } from '../lib/color';
import { safeHref } from '../lib/url';
import { haptic } from '../lib/haptics';
import EmptyState from '../components/ui/EmptyState';
import { SkeletonList } from '../components/ui/Skeleton';

const BOTTOM_TAB_H = 56;
const LIKE_MAX_TAPS = 10;
const LIKE_COOLDOWN_MS = 60_000;

interface LikeSession { tapsUsed: number; resetAt: number; }
function loadLikeSession(id: string): LikeSession {
  try {
    const raw = localStorage.getItem(`like_session:${id}`);
    if (!raw) return { tapsUsed: 0, resetAt: 0 };
    const s = JSON.parse(raw) as LikeSession;
    if (s.resetAt > 0 && Date.now() >= s.resetAt) return { tapsUsed: 0, resetAt: 0 };
    return s;
  } catch { return { tapsUsed: 0, resetAt: 0 }; }
}
function saveLikeSession(id: string, s: LikeSession) {
  localStorage.setItem(`like_session:${id}`, JSON.stringify(s));
}

const REACTIONS_KEY = 'fan_reactions';
function loadMyReactions(): Record<string, ReactionType> {
  try { return JSON.parse(localStorage.getItem(REACTIONS_KEY) ?? '{}'); } catch { return {}; }
}


function daysLeft(dateStr: string): number {
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000);
}

export default function Preorders() {
  const navigate = useNavigate();
  const { key: locationKey } = useLocation();
  const { user } = useAuth();
  const { reportedEventIds } = useReportedEventIds(user?.id);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [works, setWorks] = useState<Work[]>([]);
  const [loading, setLoading] = useState(true);
  const [showImages] = useState(() => loadImageVisibility().discover);
  const [hiddenWorkIds, setHiddenWorkIds] = useState<Set<string>>(loadHiddenWorkIds);
  const [categoryFilters, setCategoryFilters] = useState<Record<string, string[]>>(loadCategoryFilters);
  const [filterPickerWorkId, setFilterPickerWorkId] = useState<string | null>(null);
  const [filterGoodsOpen, setFilterGoodsOpen] = useState(false);

  const [likedEventIds, setLikedEventIds] = useState<Set<string>>(loadLikedEventIds);
  const [calendarEventIds, setCalendarEventIds] = useState<Set<string>>(loadCalendarEventIds);
  const initialCalendarIds = useRef(loadCalendarEventIds());
  const [lockedLikeIds, setLockedLikeIds] = useState<Set<string>>(() => {
    const set = new Set<string>();
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith('like_session:')) {
        const s = JSON.parse(localStorage.getItem(key) ?? '{}') as LikeSession;
        if (s.tapsUsed >= LIKE_MAX_TAPS && (s.resetAt === 0 || Date.now() < s.resetAt)) {
          set.add(key.slice('like_session:'.length));
        }
      }
    }
    return set;
  });
  const [myReactions, setMyReactions] = useState<Record<string, ReactionType>>(loadMyReactions);
  const [openReactionPickerId, setOpenReactionPickerId] = useState<string | null>(null);
  const [preorderEditEvent, setPreorderEditEvent] = useState<CalendarEvent | null>(null);

  const { trigger: triggerLike, renderOverlay: renderLikeOverlay } = useLikeAnimation();

  useEffect(() => {
    if (!user) return;
    const cached = getCached<{ works: Work[]; evts: CalendarEvent[] }>(`preorders:${user.id}`);
    if (cached) {
      // キャッシュを即表示し、裏で再取得して最新化
      setWorks(cached.works);
      setEvents(cached.evts);
      setLoading(false);
    }
    listRecentWorks(user.id).then(ws => {
      setWorks(ws);
      return listPreorderEvents(ws.map(w => w.id)).then(evts => {
        setEvents(evts);
        setCached(`preorders:${user.id}`, { works: ws, evts });
      });
    }).catch(() => {}).finally(() => setLoading(false));
  }, [user?.id, locationKey]); // eslint-disable-line react-hooks/exhaustive-deps

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
  const getPreorderStart = (e: CalendarEvent) => e.preorderStart ?? e.date;

  const toggleWork = (wId: string) =>
    setHiddenWorkIds(prev => {
      const next = new Set(prev);
      if (next.has(wId)) next.delete(wId); else next.add(wId);
      saveHiddenWorkIds(next);
      return next;
    });

  const visibleEvents = useMemo(() =>
    events.filter(e => {
      if (reportedEventIds.has(e.id)) return false;
      if (e.workId && hiddenWorkIds.has(e.workId)) return false;
      const wId = e.workId ?? '';
      if (wId) {
        const cats = categoryFilters[wId];
        if (cats && cats.length > 0 && parseCategories(e.category).some(c => cats.includes(c))) return false;
      }
      return true;
    }),
  [events, hiddenWorkIds, categoryFilters, reportedEventIds]);

  const active = visibleEvents.filter(e => { const s = getPreorderStart(e); return !s || s <= today; });
  const upcoming = visibleEvents.filter(e => { const s = getPreorderStart(e); return !!s && s > today; });

  const handleHeartPress = async (event: CalendarEvent, el: HTMLElement) => {
    if (!user) return;
    const session = loadLikeSession(event.id);
    if (session.tapsUsed >= LIKE_MAX_TAPS) return;
    const newTaps = session.tapsUsed + 1;
    const resetAt = newTaps >= LIKE_MAX_TAPS ? Date.now() + LIKE_COOLDOWN_MS : 0;
    saveLikeSession(event.id, { tapsUsed: newTaps, resetAt });
    incrementTotalLikesGiven();
    if (newTaps >= LIKE_MAX_TAPS) {
      setLockedLikeIds(prev => { const next = new Set(prev); next.add(event.id); return next; });
      setTimeout(() => {
        setLockedLikeIds(prev => { const next = new Set(prev); next.delete(event.id); return next; });
      }, LIKE_COOLDOWN_MS);
    }
    triggerLike(el);
    try {
      const newCount = await addLikeTap(event.id, user.id);
      setEvents(prev => prev.map(e => e.id === event.id ? { ...e, likes: newCount } : e));
    } catch {}
    setLikedEventIds(addLikedEventId(event.id));
    if (!calendarEventIds.has(event.id)) {
      setCalendarEventIds(addCalendarEventId(event.id));
    }
  };

  const handleReAddToCalendar = (eventId: string) => {
    setCalendarEventIds(addCalendarEventId(eventId));
  };

  const handleReaction = (eventId: string, type: ReactionType) => {
    haptic.light();
    const isToggleOff = myReactions[eventId] === type;
    setMyReactions(prev => {
      const next: Record<string, ReactionType> = { ...prev };
      if (isToggleOff) delete next[eventId]; else next[eventId] = type;
      localStorage.setItem(REACTIONS_KEY, JSON.stringify(next));
      return next;
    });
    setOpenReactionPickerId(null);
    if (user) setReaction(eventId, user.id, isToggleOff ? null : type).catch(() => {});
  };

  const renderTile = (event: CalendarEvent) => {
    const workColor = event.workId ? (workColorMap.get(event.workId) ?? 'var(--accent-color)') : 'var(--accent-color)';
    const links = parseLinks(event.link);
    const workName = works.find(w => w.id === event.workId)?.name;
    const isLiked = likedEventIds.has(event.id);
    const isInCalendar = calendarEventIds.has(event.id);
    const showReAdd = isLiked && !isInCalendar && !initialCalendarIds.current.has(event.id);
    const isLocked = lockedLikeIds.has(event.id);
    const canEditInfo = !!event.workId && works.some(w => w.id === event.workId);

    // 締切（新 preorderEnd or 旧 endDate）からの残り日数
    const hasNewPreorderData = !!(event.preorderStart || event.preorderEnd);
    const isReleaseOnly = !hasNewPreorderData && !!event.date && !event.endDate;
    const deadlineDate = event.preorderEnd ?? (!hasNewPreorderData ? event.endDate : undefined);
    const days = deadlineDate ? daysLeft(deadlineDate) : null;
    const isDeadlineFromRelease = !deadlineDate && !!event.date && !event.dateLabel;
    const showDeadline = !isReleaseOnly && !isDeadlineFromRelease && days !== null;

    // 共通タイルの下に出す「締切まで／チェック!」行
    const footer = (showDeadline || links.length > 0) ? (
      <div className="flex items-center px-4 py-3 border-t gap-3" style={{ borderColor: 'var(--border-subtle)' }}>
        {showDeadline && (
          <span className="text-sm font-bold" style={{ color: days! <= 3 ? 'var(--color-destructive)' : days! <= 7 ? 'var(--color-warning)' : 'var(--label-secondary)' }}>
            {days! <= 0 ? '本日締切' : `締切まで${days}日`}
          </span>
        )}
        {links.length > 0 && (
          <div className="flex gap-2 ml-auto">
            {links.slice(0, 2).map((url, i) => (
              <a key={i} href={safeHref(url)} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-sm px-4 py-2 rounded-full font-bold active:opacity-60"
                style={{ background: workColor, color: getContrastText(workColor) }}>
                <ExternalLink size={13} />チェック!
              </a>
            ))}
          </div>
        )}
      </div>
    ) : null;

    return (
      <EventTile
        key={event.id}
        event={workName ? { ...event, workName } : event}
        workColor={workColor}
        showImages={showImages}
        liked={isLiked}
        likeLocked={isLocked || !user}
        onLike={el => handleHeartPress(event, el)}
        calendarStatus={isInCalendar ? 'in' : showReAdd ? 'readd' : null}
        onCalendarStatusClick={isInCalendar ? undefined : () => handleReAddToCalendar(event.id)}
        myReaction={myReactions[event.id] ?? null}
        onReact={() => setOpenReactionPickerId(prev => prev === event.id ? null : event.id)}
        onInfoEdit={canEditInfo ? () => setPreorderEditEvent(event) : undefined}
        footer={footer}
      />
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
            <div className="flex items-center gap-2.5">
              <button onClick={() => navigate(-1)} className="w-9 h-9 flex items-center justify-center rounded-lg pressable" style={{ color: 'var(--accent-color)', backgroundColor: 'var(--fill-tertiary)' }}>
                <ChevronLeft size={22} />
              </button>
              <span className="text-base font-semibold text-label-primary">予約受付中</span>
            </div>
          }
        />

        {/* 作品チップ */}
        {works.length > 0 && (
          <div
            className="flex-shrink-0 flex items-center gap-2 px-4 py-3 overflow-x-auto border-b"
            style={{ borderColor: 'var(--border-subtle)' }}
          >
            {works.map((w, i) => {
              const hidden = hiddenWorkIds.has(w.id);
              const color = workColorMap.get(w.id) ?? WORK_COLORS[i % WORK_COLORS.length];
              const hasCatFilter = (categoryFilters[w.id]?.length ?? 0) > 0;
              return (
                <div
                  key={w.id}
                  className="flex-shrink-0 flex items-center rounded-full border transition-all overflow-hidden"
                  style={{
                    borderColor: hidden ? 'var(--border-subtle)' : color,
                    color: hidden ? 'var(--label-tertiary)' : color,
                    opacity: hidden ? 0.5 : 1,
                  }}
                >
                  <button
                    onClick={() => toggleWork(w.id)}
                    className="flex items-center gap-1.5 text-xs pl-3 pr-2 py-1 active:opacity-70"
                  >
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: hidden ? 'var(--label-tertiary)' : color }} />
                    {w.name}
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); setFilterPickerWorkId(w.id); }}
                    className="pr-2.5 py-1 active:opacity-70"
                    style={{ color: hasCatFilter ? color : 'var(--label-tertiary)' }}
                  >
                    <SlidersHorizontal size={11} strokeWidth={hasCatFilter ? 2.5 : 1.5} />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-4 pt-3 pb-6">
          {loading ? (
            <SkeletonList count={3} tall />
          ) : visibleEvents.length === 0 ? (
            <EmptyState
              icon={<span role="img" aria-label="買い物">🛍</span>}
              title="受付中の予約はありません"
              description="予約・受注情報は投稿から自動で検出され、ここにまとまります"
            />

          ) : (
            <div className="flex flex-col gap-4">
              {active.length > 0 && (
                <div className="flex flex-col gap-3">
                  <p className="text-[13px] font-bold text-label-primary px-1">予約受付中</p>
                  {active.map(renderTile)}
                </div>
              )}
              {upcoming.length > 0 && (
                <div className="flex flex-col gap-3">
                  <p className="text-[13px] font-bold text-label-primary px-1">もうすぐ予約開始</p>
                  {upcoming.map(renderTile)}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* リアクションピッカー */}
      {openReactionPickerId && (
        <>
          <div className="fixed inset-0 z-[310]" onClick={() => setOpenReactionPickerId(null)} />
          <div className="fixed inset-x-0 max-w-app mx-auto z-[320]" style={{ bottom: BOTTOM_TAB_H + 8 }}>
            <div className="mx-4 bg-bg-secondary rounded-[18px] shadow-xl p-3 grid grid-cols-3 gap-1" style={{ animation: 'slideUpIn 0.25s cubic-bezier(0.32,0.72,0,1) both' }}>
              {REACTIONS.map(r => (
                <button
                  key={r.type}
                  onClick={() => handleReaction(openReactionPickerId, r.type)}
                  className="flex flex-col items-center gap-1 px-2 py-2 rounded-[10px] pressable"
                  style={{ background: myReactions[openReactionPickerId] === r.type ? 'var(--fill-tertiary)' : 'transparent' }}
                >
                  <img src={r.image} alt={r.label} className="h-8 w-auto" />
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {/* カテゴリフィルターピッカー */}
      {filterPickerWorkId !== null && (() => {
        const work = works.find(w => w.id === filterPickerWorkId);
        if (!work) return null;
        const current = categoryFilters[filterPickerWorkId] ?? [];
        const color = workColorMap.get(filterPickerWorkId) ?? 'var(--accent-color)';
        const toggle = (cat: string) => {
          const next = current.includes(cat) ? current.filter(c => c !== cat) : [...current, cat];
          const updated = { ...categoryFilters, [filterPickerWorkId]: next };
          setCategoryFilters(updated);
          saveCategoryFilters(updated);
        };
        return (
          <>
            <div className="fixed inset-0 z-[180]" onClick={() => setFilterPickerWorkId(null)} />
            <div className="fixed bottom-14 left-0 right-0 z-[190] max-w-app mx-auto px-4 pb-2">
              <div className="bg-bg-secondary rounded-xl shadow-card overflow-hidden">
                <div className="flex items-center justify-between px-4 pt-4 pb-2">
                  <span className="text-label-primary text-sm font-semibold">{work.name} の表示カテゴリ</span>
                  <button
                    onClick={() => { const u = { ...categoryFilters, [filterPickerWorkId]: [] }; setCategoryFilters(u); saveCategoryFilters(u); }}
                    className="text-xs text-label-tertiary underline active:opacity-60"
                  >すべて表示</button>
                </div>
                <p className="px-4 text-[11px] text-label-tertiary mb-3">色ありが表示中。タップしたカテゴリを非表示にします</p>
                <div className="flex flex-wrap gap-2 px-4 pb-2">
                  {POST_CATEGORIES.map(cat => {
                    const hidden = current.includes(cat);
                    return (
                      <button key={cat} onClick={() => toggle(cat)}
                        className="px-3 py-1.5 rounded-full text-xs border transition-colors active:opacity-70"
                        style={hidden
                          ? { borderColor: 'var(--border-default)', color: 'var(--label-tertiary)' }
                          : { borderColor: color, color, backgroundColor: `${color}18` }}>
                        {cat}
                      </button>
                    );
                  })}
                </div>
                {/* グッズの種類で絞る（▾展開） */}
                <div className="px-4 pb-4">
                  <button onClick={() => setFilterGoodsOpen(o => !o)} className="text-[11px] text-label-tertiary active:opacity-60">
                    グッズの種類で絞る {filterGoodsOpen ? '▴' : '▾'}
                  </button>
                  {filterGoodsOpen && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {GOODS_SUBCATEGORIES.map(sub => {
                        const hidden = current.includes(sub);
                        return (
                          <button key={sub} onClick={() => toggle(sub)}
                            className="px-3 py-1.5 rounded-full text-xs border transition-colors active:opacity-70"
                            style={hidden
                              ? { borderColor: 'var(--border-default)', color: 'var(--label-tertiary)' }
                              : { borderColor: color, color, backgroundColor: `${color}18` }}>
                            {sub}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        );
      })()}

      {preorderEditEvent && (
        <PreorderEditSheet
          event={preorderEditEvent}
          onClose={() => setPreorderEditEvent(null)}
          onSaved={updated => {
            setEvents(prev => prev.map(e => e.id === preorderEditEvent.id ? { ...e, ...updated } : e));
          }}
        />
      )}

      <BottomTab />
      {renderLikeOverlay()}
    </>
  );
}

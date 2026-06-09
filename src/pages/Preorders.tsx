import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ChevronLeft, Heart, Smile, ExternalLink } from 'lucide-react';
import BottomTab from '../components/BottomTab';
import Header from '../components/Header';
import MemoText from '../components/MemoText';
import PreorderEditSheet from '../components/PreorderEditSheet';
import { useLikeAnimation } from '../hooks/useLikeAnimation';
import {
  listPreorderEvents, listRecentWorks, addLikeTap, setReaction, type Work,
} from '../lib/api';
import {
  parseLinks, parseImageUrls, getCategoryColor,
  loadLikedEventIds, addLikedEventId,
  loadCalendarEventIds, addCalendarEventId,
  incrementTotalLikesGiven,
  loadImageVisibility,
} from '../lib/constants';
import { REACTIONS, type ReactionType } from '../lib/reactions';
import { useAuth } from '../contexts/AuthContext';
import type { CalendarEvent } from '../types';
import { WORK_COLORS } from './Calendar';

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
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [works, setWorks] = useState<Work[]>([]);
  const [loading, setLoading] = useState(true);
  const [showImages] = useState(() => loadImageVisibility().discover);

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
    listRecentWorks(user.id).then(ws => {
      setWorks(ws);
      return listPreorderEvents(ws.map(w => w.id));
    }).then(evts => {
      setEvents(evts);
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
  const active = events.filter(e => { const s = getPreorderStart(e); return !s || s <= today; });
  const upcoming = events.filter(e => { const s = getPreorderStart(e); return !!s && s > today; });

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
    const catColor = getCategoryColor(event.category);
    const links = parseLinks(event.link);
    const workName = works.find(w => w.id === event.workId)?.name;
    const isLiked = likedEventIds.has(event.id);
    const isInCalendar = calendarEventIds.has(event.id);
    const showReAdd = isLiked && !isInCalendar && !initialCalendarIds.current.has(event.id);
    const isLocked = lockedLikeIds.has(event.id);

    const [, relM, relD] = event.date ? event.date.split('-').map(Number) : [0, 0, 0];
    const [, psm, psd] = event.preorderStart ? event.preorderStart.split('-').map(Number) : [0, 0, 0];
    const [, pem, ped] = event.preorderEnd ? event.preorderEnd.split('-').map(Number) : [0, 0, 0];
    // 新データ: preorderStart/End フィールドあり
    const hasNewPreorderData = !!(event.preorderStart || event.preorderEnd);
    // 旧データ互換: event.date=開始, event.endDate=締切
    const legacyHasPeriod = !hasNewPreorderData && !!event.endDate && event.endDate !== event.date;
    const [, legacyEM, legacyED] = legacyHasPeriod ? event.endDate!.split('-').map(Number) : [0, 0, 0];
    const isReleaseOnly = !hasNewPreorderData && !!event.date && !event.endDate;
    // 締切日 (新 or 旧)
    const deadlineDate = event.preorderEnd ?? (!hasNewPreorderData ? event.endDate : undefined);
    const days = deadlineDate ? daysLeft(deadlineDate) : null;
    // 締切なし→発売日で自動期限
    const isDeadlineFromRelease = !deadlineDate && !!event.date && !event.dateLabel;

    return (
      <div
        key={event.id}
        className="bg-bg-secondary rounded-xl overflow-hidden shadow-card"
        style={{ borderLeft: catColor ? `3px solid ${catColor}` : undefined }}
      >
        {/* コンテンツ部分 */}
        <div className="flex items-stretch px-4 pt-4 gap-3">
          {/* 受付期間（左列） */}
          <div className="flex-shrink-0 w-10 flex flex-col items-center pt-0.5 gap-0">
            {hasNewPreorderData ? (
              <>
                <span className="text-[10px] text-label-tertiary leading-none">予約</span>
                {event.preorderStart && (
                  <span className="text-[12px] font-bold text-label-primary leading-snug mt-0.5">{psm}/{psd}</span>
                )}
                {event.preorderEnd ? (
                  <span className="text-[12px] font-bold text-label-secondary leading-snug">〜{pem}/{ped}</span>
                ) : (
                  <span className="text-[11px] text-label-tertiary leading-none">〜</span>
                )}
                {event.date && (
                  <>
                    <div className="w-full h-px my-1" style={{ backgroundColor: 'var(--border-subtle)' }} />
                    <span className="text-[10px] text-label-tertiary leading-none">発売</span>
                    {['春頃','夏頃','秋頃','冬頃'].includes(event.dateLabel ?? '') ? (
                      <span className="text-[10px] font-bold text-label-secondary leading-snug mt-0.5">{event.dateLabel}</span>
                    ) : event.dateLabel ? (
                      <>
                        <span className="text-[10px] text-label-tertiary leading-none mt-0.5">{relM}月</span>
                        <span className="text-[11px] font-bold text-label-secondary leading-snug">{event.dateLabel}</span>
                      </>
                    ) : (
                      <span className="text-[11px] font-bold text-label-secondary leading-snug mt-0.5">{relM}/{relD}</span>
                    )}
                  </>
                )}
              </>
            ) : event.date ? (
              <>
                <span className="text-[10px] text-label-tertiary leading-none">{isReleaseOnly ? '発売' : '予約'}</span>
                {['春頃','夏頃','秋頃','冬頃'].includes(event.dateLabel ?? '') ? (
                  <span className="text-[10px] font-bold text-label-primary leading-snug mt-0.5">{event.dateLabel}</span>
                ) : event.dateLabel ? (
                  <>
                    <span className="text-[10px] text-label-tertiary leading-none mt-0.5">{relM}月</span>
                    <span className="text-[11px] font-bold text-label-primary leading-snug">{event.dateLabel}</span>
                  </>
                ) : (
                  <span className="text-[13px] font-bold text-label-primary leading-snug mt-0.5">{relM}/{relD}</span>
                )}
                {legacyHasPeriod && (
                  <span className="text-[13px] font-bold text-label-secondary leading-snug">〜{legacyEM}/{legacyED}</span>
                )}
              </>
            ) : (
              <span className="text-sm text-label-tertiary">—</span>
            )}
          </div>

          <div className="w-px self-stretch bg-white/10 flex-shrink-0" />

          {/* 右側コンテンツ */}
          <div className="flex-1 min-w-0 flex flex-col gap-2 pb-3">
            {/* バッジ行 + 予約情報+ボタン */}
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-1.5 flex-wrap flex-1">
                {event.isOrderMade && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: '#ef4444', color: '#fff' }}>
                    予約
                  </span>
                )}
                {workName && (
                  <span className="text-[10px] font-medium px-2 py-0.5 rounded-full"
                    style={{ color: workColor, backgroundColor: `${workColor}20` }}>
                    {workName}
                  </span>
                )}
                {event.category && (
                  <span className="text-[10px] text-label-tertiary bg-bg-primary rounded-full px-2 py-0.5">
                    {event.category}
                  </span>
                )}
              </div>
              {event.workId && works.some(w => w.id === event.workId) && (
                <button
                  onClick={() => setPreorderEditEvent(event)}
                  className="flex-shrink-0 text-[10px] px-2 py-0.5 rounded-full border active:opacity-60"
                  style={{ borderColor: 'var(--accent-color)', color: 'var(--accent-color)' }}
                >
                  予約情報+
                </button>
              )}
            </div>

            {/* タイトル */}
            <p className="text-label-primary font-bold text-base leading-snug">{event.title}</p>

            {/* 画像 */}
            {showImages && (() => {
              const imgs = parseImageUrls(event.imageUrl);
              if (imgs.length === 0) return null;
              if (imgs.length === 1) return (
                <div className="flex justify-center">
                  <img src={imgs[0]} alt="" loading="lazy"
                    className="rounded-lg block"
                    style={{ maxHeight: 220, maxWidth: '100%', height: 'auto', width: 'auto' }} />
                </div>
              );
              return (
                <div className="flex gap-1.5 overflow-x-auto pb-1" style={{ scrollSnapType: 'x mandatory' }}>
                  {imgs.map((src, i) => (
                    <img key={i} src={src} alt="" loading="lazy"
                      className="rounded-lg flex-shrink-0 block"
                      style={{ height: 130, width: 'auto', scrollSnapAlign: 'start' }} />
                  ))}
                </div>
              );
            })()}

            {/* メモ */}
            {event.memo && <MemoText text={event.memo} className="text-label-secondary text-sm leading-relaxed" />}

            {/* リンク（外部サイト） */}
            {links.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {links.map((url, i) => (
                  <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1 px-3 py-1 rounded-full border border-default text-label-secondary text-xs w-fit active:opacity-60">
                    <ExternalLink size={10} />
                    {(() => {
                      try {
                        const { hostname } = new URL(url);
                        if (hostname.includes('amazon')) return 'Amazon';
                        if (hostname.includes('twitter.com') || hostname.includes('x.com')) return '公式X';
                        return hostname.replace(/^www\./, '');
                      } catch { return url; }
                    })()}
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 締切行 */}
        {(isReleaseOnly ? links.length > 0 : true) && (
          <div
            className="flex items-center justify-between px-4 py-3 border-t gap-3"
            style={{ borderColor: 'var(--border-subtle)' }}
          >
            {/* 締切テキスト */}
            {!isReleaseOnly && !isDeadlineFromRelease && (
              <span
                className="text-sm font-bold"
                style={{
                  color: days === null ? 'var(--label-tertiary)'
                    : days <= 0 ? '#ef4444'
                    : days <= 3 ? '#ef4444'
                    : days <= 7 ? '#f97316'
                    : 'var(--label-secondary)',
                }}
              >
                {days === null ? '締切未定' : days <= 0 ? '本日締切' : `締切まで${days}日`}
              </span>
            )}
            {/* リンクボタン（最大2本） */}
            {links.length > 0 && (
              <div className={`flex gap-2 ${isReleaseOnly ? 'ml-auto' : ''}`}>
                {links.slice(0, 2).map((url, i) => (
                  <a
                    key={i}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-sm px-4 py-2 rounded-full font-bold active:opacity-60"
                    style={{ background: workColor, color: '#fff' }}
                  >
                    <ExternalLink size={13} />
                    チェック!
                  </a>
                ))}
              </div>
            )}
          </div>
        )}

        {/* アクション行 */}
        <div className="flex items-center gap-2 pt-1 border-t px-4 pb-3" style={{ borderColor: 'var(--border-subtle)' }}>
          <button
            onClick={e => handleHeartPress(event, e.currentTarget)}
            disabled={!user || isLocked}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm disabled:opacity-40 active:opacity-70"
            style={{
              borderColor: isLiked ? 'rgb(248,113,113)' : 'var(--border-default)',
              color: isLiked ? 'rgb(248,113,113)' : 'var(--label-secondary)',
            }}
          >
            <Heart size={14} style={{ fill: isLiked ? 'rgb(248,113,113)' : 'none' }} />
            <span className="text-xs">{event.likes.toLocaleString('ja-JP')}</span>
          </button>

          {isInCalendar ? (
            <span
              className="flex items-center gap-1 px-3 py-1.5 rounded-full border text-xs text-label-tertiary"
              style={{ borderColor: 'var(--border-subtle)' }}
            >
              追加済み
            </span>
          ) : showReAdd ? (
            <button
              onClick={() => handleReAddToCalendar(event.id)}
              disabled={!user}
              className="flex items-center gap-1 px-3 py-1.5 rounded-full border text-xs font-semibold active:opacity-70 disabled:opacity-40"
              style={{
                borderColor: 'var(--accent-color)',
                color: 'var(--accent-color)',
                backgroundColor: 'color-mix(in srgb, var(--accent-color) 10%, transparent)',
              }}
            >
              ＋ 再追加
            </button>
          ) : null}

          <button
            onClick={() => setOpenReactionPickerId(prev => prev === event.id ? null : event.id)}
            className="ml-auto px-3 py-1.5 rounded-full border text-sm active:opacity-60 flex items-center justify-center"
            style={{
              borderColor: myReactions[event.id] ? 'var(--accent-color)' : 'var(--border-default)',
              color: myReactions[event.id] ? 'var(--accent-color)' : 'var(--label-secondary)',
              minWidth: '2.5rem',
            }}
          >
            {myReactions[event.id]
              ? <img src={REACTIONS.find(r => r.type === myReactions[event.id])?.image} alt="" className="h-4 w-auto" />
              : <Smile size={14} />
            }
          </button>
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
              {[1, 2, 3].map(i => <div key={i} className="h-40 bg-bg-secondary rounded-xl animate-pulse" />)}
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

      {/* リアクションピッカー */}
      {openReactionPickerId && (
        <>
          <div className="fixed inset-0 z-[310]" onClick={() => setOpenReactionPickerId(null)} />
          <div className="fixed inset-x-0 max-w-app mx-auto z-[320]" style={{ bottom: BOTTOM_TAB_H + 8 }}>
            <div className="mx-4 bg-bg-primary rounded-2xl border border-subtle shadow-xl p-3 grid grid-cols-3 gap-1">
              {REACTIONS.map(r => (
                <button
                  key={r.type}
                  onClick={() => handleReaction(openReactionPickerId, r.type)}
                  className="flex flex-col items-center gap-1 px-2 py-2 rounded-xl active:opacity-60"
                  style={{ background: myReactions[openReactionPickerId] === r.type ? 'var(--bg-secondary)' : 'transparent' }}
                >
                  <img src={r.image} alt={r.label} className="h-8 w-auto" />
                </button>
              ))}
            </div>
          </div>
        </>
      )}

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

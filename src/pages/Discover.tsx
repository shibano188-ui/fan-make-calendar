import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useLikeAnimation } from '../hooks/useLikeAnimation';
import UserProfileModal from '../components/UserProfileModal';
import {
  Heart, Smile, Pencil, SlidersHorizontal, ExternalLink, ChevronLeft, Plus, X,
  Map as MapIcon,
} from 'lucide-react';
import BottomTab from '../components/BottomTab';
import Header from '../components/Header';
import SettingsMenuButton from '../components/SettingsMenuButton';
import {
  listUpcomingParticipatedEvents, listRecentWorks,
  setReaction, getMyReactionsBatch, updateEvent, addLikeTap,
  getHomePrefecture, getDisplayName, saveHomePrefecture, saveDisplayName,
  deleteEvent,
} from '../lib/api';
import UserSettingsSheet from '../components/UserSettingsSheet';
import type { Work } from '../lib/api';
import type { CalendarEvent } from '../types';
import { REACTIONS, type ReactionType } from '../lib/reactions';
import {
  POST_CATEGORIES, type PostCategory,
  loadCategoryFilters, saveCategoryFilters,
  loadLikedEventIds, addLikedEventId,
  loadCalendarEventIds, addCalendarEventId, saveCalendarEventIds,
  parseLinks, serializeLinks, getCategoryColor,
  loadRegionFilter, saveRegionFilter, type FilterMode,
  incrementTotalLikesGiven,
} from '../lib/constants';
import { REGIONS, ADJACENT } from '../lib/prefectures';
import { PrefectureSearch } from '../components/UserSettingsSheet';
import { useAuth } from '../contexts/AuthContext';
import { WORK_COLORS } from './Calendar';

// ─── 定数 ──────────────────────────────────────────────────────────

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

const inputCls =
  'w-full bg-bg-primary rounded-lg px-3 py-2 text-sm text-label-primary caret-label-primary placeholder:text-label-tertiary outline-none border border-faint focus:border-strong';

function fmtDate(dateStr: string): string {
  const [, m, d] = dateStr.split('-');
  return `${parseInt(m)}月${parseInt(d)}日`;
}
function formatDateRange(startDate: string, endDate?: string): string {
  if (!endDate || endDate === startDate) return fmtDate(startDate);
  return `${fmtDate(startDate)}〜${fmtDate(endDate)}`;
}
function formatTimeRange(startTime?: string, endTime?: string): string | null {
  if (!startTime) return null;
  return endTime ? `${startTime}〜${endTime}` : startTime;
}
function getDomain(url: string): string {
  try {
    const { hostname } = new URL(url);
    if (hostname.includes('amazon')) return 'Amazon';
    if (hostname.includes('twitter.com') || hostname.includes('x.com')) return '公式X';
    return hostname.replace(/^www\./, '');
  } catch { return url; }
}

// ─── コンポーネント ────────────────────────────────────────────────

export default function Discover() {
  const { user } = useAuth();

  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [participatedWorks, setParticipatedWorks] = useState<Work[]>([]);
  const [hiddenWorkIds, setHiddenWorkIds] = useState<Set<string>>(new Set());
  const [categoryFilters, setCategoryFilters] = useState<Record<string, string[]>>(loadCategoryFilters);
  const [filterPickerWorkId, setFilterPickerWorkId] = useState<string | null>(null);

  // 地域フィルター（Calendarタブと共有）
  const [filterMode, setFilterMode] = useState<FilterMode>(() => loadRegionFilter().filterMode);
  const [filterValue, setFilterValue] = useState<string | null>(() => loadRegionFilter().filterValue);
  const [includeAdjacent, setIncludeAdjacent] = useState(() => loadRegionFilter().includeAdjacent);
  const [showRegionPanel, setShowRegionPanel] = useState(false);

  // ホーム県・ユーザー設定
  const [homePref, setHomePref] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [showUserSettings, setShowUserSettings] = useState(false);

  // ❤️ ソーシャルいいね（削除後も残る）
  const [likedEventIds, setLikedEventIds] = useState<Set<string>>(loadLikedEventIds);
  // カレンダー追加済み（マイカレンダーから削除すると除かれる）
  const [calendarEventIds, setCalendarEventIds] = useState<Set<string>>(loadCalendarEventIds);
  // セッション開始時点の追加済みID（タブ内で追加してもすぐ消えないよう初期値を固定）
  const initialCalendarIds = useRef(loadCalendarEventIds());

  // いいねクールダウン
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

  // リアクション
  const [myReactions, setMyReactions] = useState<Record<string, ReactionType>>(loadMyReactions);
  const [openReactionPickerId, setOpenReactionPickerId] = useState<string | null>(null);

  // 長押し削除
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { trigger: triggerLike, renderOverlay: renderLikeOverlay } = useLikeAnimation();
  const [viewingUserId, setViewingUserId] = useState<string | null>(null);
  const startLongPress = (callback: () => void) => {
    longPressTimer.current = setTimeout(callback, 700);
  };
  const cancelLongPress = () => {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
  };
  const handleFullDelete = async (id: string, title: string) => {
    if (!window.confirm(`「${title}」を完全に削除しますか？\nこの操作は元に戻せません。`)) return;
    try {
      await deleteEvent(id);
      setEvents(prev => prev.filter(e => e.id !== id));
    } catch { alert('削除に失敗しました'); }
  };

  // 編集パネル
  const [editEventId, setEditEventId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{
    title: string; date: string; time: string; endDate: string; endTime: string;
    category: PostCategory | ''; customCategory: string;
    prefecture: string; locationDetail: string; locationMapLink: string; links: string[]; memo: string;
  } | null>(null);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState('');

  // 作品カラーMap（CalendarタブのworkColorMapと同じロジック）
  const workColorMap = useMemo(() => {
    const saved: Record<string, string> = (() => {
      try { return JSON.parse(localStorage.getItem('fan_work_colors') ?? '{}'); } catch { return {}; }
    })();
    const usedColors = new Set<string>(
      participatedWorks.filter(w => saved[w.id]).map(w => saved[w.id]),
    );
    const updated = { ...saved };
    let hasNew = false;
    const m = new Map<string, string>();
    participatedWorks.forEach(w => {
      if (!updated[w.id]) {
        const color = WORK_COLORS.find(c => !usedColors.has(c)) ?? WORK_COLORS[0];
        updated[w.id] = color;
        usedColors.add(color);
        hasNew = true;
      }
      m.set(w.id, updated[w.id]);
    });
    if (hasNew) localStorage.setItem('fan_work_colors', JSON.stringify(updated));
    return m;
  }, [participatedWorks]);

  // データ取得
  useEffect(() => {
    if (!user) return;
    setLoading(true);
    Promise.all([
      listUpcomingParticipatedEvents(user.id),
      listRecentWorks(user.id),
    ]).then(([evts, works]) => {
      setEvents(evts);
      setParticipatedWorks(works);
    }).catch(() => setError('データの読み込みに失敗しました'))
      .finally(() => setLoading(false));
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // リアクション一括取得
  useEffect(() => {
    if (!user || events.length === 0) return;
    getMyReactionsBatch(events.map(e => e.id), user.id)
      .then(batch => {
        setMyReactions(prev => ({ ...prev, ...(batch as Record<string, ReactionType>) }));
      }).catch(() => {});
  }, [user?.id, events]); // eslint-disable-line react-hooks/exhaustive-deps

  // ホーム県・表示名を取得
  useEffect(() => {
    if (!user) return;
    Promise.all([getHomePrefecture(user.id), getDisplayName(user.id)])
      .then(([pref, name]) => { setHomePref(pref); setDisplayName(name); })
      .catch(() => {});
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ユーザー設定保存
  const handleSaveUserSettings = async (newPref: string | null, newName: string) => {
    if (!user) return;
    setHomePref(newPref);
    setDisplayName(newName || null);
    if (newPref && filterMode === 'none') {
      setFilterMode('pref'); setFilterValue(newPref); setIncludeAdjacent(false);
      saveRegionFilter({ filterMode: 'pref', filterValue: newPref, includeAdjacent: false });
    }
    await Promise.all([saveHomePrefecture(user.id, newPref), saveDisplayName(user.id, newName)]);
  };

  // 地域フィルターの適用対象都道府県Set
  const activeFilterPrefs = useMemo((): Set<string> | null => {
    if (filterMode === 'region') {
      const r = REGIONS.find(x => x.name === filterValue);
      return r ? new Set(r.prefectures) : null;
    }
    if (filterMode === 'pref' && filterValue) {
      const set = new Set<string>([filterValue]);
      if (includeAdjacent) ADJACENT[filterValue]?.forEach(p => set.add(p));
      return set;
    }
    return null;
  }, [filterMode, filterValue, includeAdjacent]);

  const filterActive = filterMode !== 'none';
  const filterLabel = filterMode === 'pref'
    ? `${filterValue}${includeAdjacent ? '＋隣接' : ''}`
    : filterMode === 'region' ? `${filterValue}地方` : '';

  // 表示イベント（作品・カテゴリフィルター・地域フィルター・自分の投稿除外・追加済み除外）
  const visibleEvents = useMemo(() => {
    let evts = events.filter(e => !e.workId || !hiddenWorkIds.has(e.workId));
    // 自分の投稿は発見タブに表示しない
    if (user) evts = evts.filter(e => e.authorId !== user.id);
    // カテゴリフィルター
    evts = evts.filter(e => {
      const wId = e.workId ?? '';
      if (!wId) return true;
      const cats = categoryFilters[wId];
      if (!cats || cats.length === 0) return true;
      return !cats.includes(e.category ?? '');
    });
    // 追加済みの予定は非表示（セッション開始前に追加済みのもののみ。タブ内で追加しても即消えない）
    evts = evts.filter(e => !initialCalendarIds.current.has(e.id));
    // 地域フィルター
    if (activeFilterPrefs) {
      evts = evts.filter(e => {
        if (!e.prefecture) return true;
        const pref = e.prefecture.replace(/[都府県]$/, '');
        return activeFilterPrefs.has(pref);
      });
    }
    return evts;
  }, [events, hiddenWorkIds, categoryFilters, user, activeFilterPrefs]);

  const toggleWork = (wId: string) =>
    setHiddenWorkIds(prev => {
      const next = new Set(prev);
      if (next.has(wId)) next.delete(wId); else next.add(wId);
      return next;
    });

  // ❤️ いいね（クールダウン付き）＋初回のみカレンダーに追加
  const handleHeartPress = async (event: CalendarEvent) => {
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
    try {
      const newCount = await addLikeTap(event.id, user.id);
      setEvents(prev => prev.map(e => e.id === event.id ? { ...e, likes: newCount } : e));
    } catch {}
    // ソーシャルいいね記録
    const nextLiked = addLikedEventId(event.id);
    setLikedEventIds(nextLiked);
    // カレンダーに未追加の場合のみ追加
    if (!calendarEventIds.has(event.id)) {
      const nextCal = addCalendarEventId(event.id);
      setCalendarEventIds(nextCal);
    }
  };

  // カレンダーに再追加（削除後の再追加ボタン用）
  const handleReAddToCalendar = (eventId: string) => {
    const nextCal = addCalendarEventId(eventId);
    setCalendarEventIds(nextCal);
  };

  // 指定作品の表示中カテゴリ・地域フィルター適用済みの予定を一括追加
  const handleBatchAdd = (workId: string) => {
    const toAdd = visibleEvents.filter(e => {
      if (e.workId !== workId) return false;
      return !calendarEventIds.has(e.id);
    });
    if (toAdd.length === 0) return;
    const cal = loadCalendarEventIds();
    toAdd.forEach(e => cal.add(e.id));
    saveCalendarEventIds(cal);
    setCalendarEventIds(new Set(cal));
    // ソーシャルいいねも記録
    toAdd.forEach(e => addLikedEventId(e.id));
    setLikedEventIds(loadLikedEventIds());
  };

  // リアクション
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

  // 編集パネルを開く
  const openEdit = (event: CalendarEvent) => {
    const VALID = POST_CATEGORIES as unknown as string[];
    setEditEventId(event.id);
    setEditError('');
    const existingLinks = parseLinks(event.link);
    setEditForm({
      title: event.title,
      date: event.date,
      time: event.time ?? '',
      endDate: event.endDate ?? '',
      endTime: event.endTime ?? '',
      category: VALID.includes(event.category ?? '') ? event.category as PostCategory : '',
      customCategory: !VALID.includes(event.category ?? '') && event.category ? event.category : '',
      prefecture: event.prefecture ?? '',
      locationDetail: event.locationDetail ?? '',
      locationMapLink: event.locationMapLink ?? '',
      links: existingLinks.length > 0 ? existingLinks : [''],
      memo: event.memo ?? '',
    });
  };

  const handleEditSubmit = async () => {
    if (!editEventId || !editForm) return;
    if (!editForm.title.trim() || !editForm.date) { setEditError('タイトルと日付は必須です'); return; }
    setEditSubmitting(true);
    setEditError('');
    try {
      const category = editForm.category || editForm.customCategory.trim() || undefined;
      const patch = {
        title: editForm.title.trim(), date: editForm.date,
        time: editForm.time || undefined, endDate: editForm.endDate || undefined,
        endTime: editForm.endTime || undefined, category,
        prefecture: editForm.prefecture || undefined,
        locationDetail: editForm.locationDetail || undefined,
        locationMapLink: editForm.locationMapLink || undefined,
        link: serializeLinks(editForm.links), memo: editForm.memo.trim() || undefined,
      };
      await updateEvent(editEventId, patch);
      setEvents(prev => prev.map(e => e.id === editEventId ? { ...e, ...patch } : e));
      setEditEventId(null); setEditForm(null);
    } catch { setEditError('更新に失敗しました'); }
    finally { setEditSubmitting(false); }
  };

  return (
    <>
      <div
        className="fixed inset-0 max-w-app mx-auto flex flex-col overflow-hidden"
        style={{ backgroundColor: 'var(--bg-primary)', paddingTop: 44, paddingBottom: BOTTOM_TAB_H }}
      >
        <Header
          leftNode={<span className="text-base font-bold text-label-primary">みんなの投稿した予定</span>}
          rightAction={
            <div className="flex items-center gap-1">
              <button
                onClick={() => setShowRegionPanel(true)}
                aria-label="地域で絞り込む"
                className="relative w-8 h-8 flex items-center justify-center rounded-lg bg-bg-secondary text-label-secondary active:opacity-60"
              >
                <MapIcon size={16} style={filterActive ? { color: 'var(--accent-color)' } : {}} />
                {filterActive && <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full" style={{ background: 'var(--accent-color)' }} />}
              </button>
              <SettingsMenuButton />
            </div>
          }
        />

        {/* 作品チップ */}
        {participatedWorks.length > 0 && (
          <div
            className="flex-shrink-0 flex items-center gap-2 px-4 py-2 overflow-x-auto border-b"
            style={{ borderColor: 'var(--border-subtle)' }}
          >
            {participatedWorks.map((w, i) => {
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

        {/* 地域フィルターインジケーター */}
        {filterActive && (
          <div className="flex-shrink-0 flex items-center gap-2 px-4 py-1.5 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
            <span className="text-[11px] text-label-tertiary">絞り込み：</span>
            <span className="text-[11px] px-2 py-0.5 rounded-full border" style={{ borderColor: 'var(--accent-color)', color: 'var(--accent-color)' }}>{filterLabel}</span>
            <button
              onClick={() => { setFilterMode('none'); setFilterValue(null); setIncludeAdjacent(false); saveRegionFilter({ filterMode: 'none', filterValue: null, includeAdjacent: false }); }}
              className="text-[11px] text-label-tertiary underline active:opacity-60"
            >解除</button>
          </div>
        )}

        {/* フィード */}
        <div className="flex-1 overflow-y-auto px-4 pt-3 pb-6">
          {loading ? (
            <div className="flex flex-col gap-3">
              {[1, 2, 3].map(i => <div key={i} className="h-24 bg-bg-secondary rounded-2xl animate-pulse" />)}
            </div>
          ) : error ? (
            <p className="text-center text-red-400 text-sm py-10">{error}</p>
          ) : !user ? (
            <p className="text-center text-label-tertiary text-sm py-10">ログインが必要です</p>
          ) : visibleEvents.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16">
              <p className="text-label-tertiary text-sm">
                {participatedWorks.length === 0
                  ? '作品タブから作品に参加するとイベントが表示されます'
                  : '今後の予定はありません'}
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {visibleEvents.map(event => {
                const color = event.workId ? (workColorMap.get(event.workId) ?? 'var(--accent-color)') : 'var(--accent-color)';
                const isLiked = likedEventIds.has(event.id);
                const isInCalendar = calendarEventIds.has(event.id);
                const showReAdd = isLiked && !isInCalendar;
                const isLocked = lockedLikeIds.has(event.id);
                const timeLabel = formatTimeRange(event.time, event.endTime);
                const [, em, ed] = event.date.split('-').map(Number);
                const todayStr = new Date().toISOString().slice(0, 10);
                const isOngoing = event.date < todayStr && !!event.endDate && event.endDate >= todayStr;
                const [, endM, endD] = isOngoing ? event.endDate!.split('-').map(Number) : [0, 0, 0];
                const catColor = getCategoryColor(event.category);
                return (
                  <div key={event.id} className="bg-bg-secondary rounded-xl overflow-hidden select-none shadow-card"
                    style={{ borderLeft: catColor ? `3px solid ${catColor}` : undefined }}
                    onTouchStart={() => startLongPress(() => handleFullDelete(event.id, event.title))}
                    onTouchEnd={cancelLongPress} onTouchCancel={cancelLongPress} onTouchMove={cancelLongPress}
                    onMouseDown={() => startLongPress(() => handleFullDelete(event.id, event.title))}
                    onMouseUp={cancelLongPress} onMouseLeave={cancelLongPress}
                  >
                    {/* コンテンツ部分（左に日付列） */}
                    <div className="flex items-stretch px-4 pt-4 gap-3">
                      {/* 日付（左） */}
                      <div className="flex-shrink-0 w-10 flex flex-col items-center pt-0.5">
                        {isOngoing ? (
                          <>
                            <span className="text-[9px] font-bold leading-none" style={{ color: 'var(--accent-color)' }}>開催中</span>
                            <span className="text-[11px] font-bold text-label-secondary leading-snug mt-1">〜{endM}/{endD}</span>
                          </>
                        ) : (
                          <>
                            <span className="text-[10px] text-label-tertiary leading-none">{em}月</span>
                            <span className="text-xl font-bold text-label-primary leading-snug">{ed}</span>
                          </>
                        )}
                      </div>
                      <div className="w-px self-stretch bg-white/10 flex-shrink-0" />
                      {/* 元のコンテンツ（右） */}
                      <div className="flex-1 min-w-0 flex flex-col gap-2 pb-3">
                        {/* バッジ行 */}
                        {(event.workName || event.category || event.prefecture) && (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {event.workName && (
                              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full"
                                style={{ color, backgroundColor: `${color}20` }}>
                                {event.workName}
                              </span>
                            )}
                            {event.category && (
                              <span className="text-[10px] text-label-tertiary bg-bg-primary rounded-full px-2 py-0.5">
                                {event.category}
                              </span>
                            )}
                            {event.prefecture && (
                              <span className="text-[10px] text-label-tertiary bg-bg-primary rounded-full px-2 py-0.5">
                                {event.prefecture}
                              </span>
                            )}
                          </div>
                        )}
                        {/* タイトル */}
                        <p className="text-label-primary font-bold text-base leading-snug">{event.title}</p>
                        {/* 日付・時間 */}
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-label-secondary text-sm">{formatDateRange(event.date, event.endDate)}</span>
                          {timeLabel && <span className="text-label-secondary text-sm">{timeLabel}</span>}
                        </div>
                        {/* メモ */}
                        {event.memo && <p className="text-label-secondary text-sm leading-relaxed">{event.memo}</p>}
                        {/* リンク */}
                        {event.link && (
                          <a href={event.link} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-1 px-3 py-1 rounded-full border border-default text-label-secondary text-xs w-fit active:opacity-60">
                            <ExternalLink size={10} />{getDomain(event.link)}
                          </a>
                        )}
                        {/* 投稿者 */}
                        {event.authorName && (
                          <p className="text-label-tertiary text-xs">
                            {event.authorId ? (
                              <button onClick={() => setViewingUserId(event.authorId!)} className="underline underline-offset-2 active:opacity-60">by {event.authorName}</button>
                            ) : `by ${event.authorName}`}
                          </p>
                        )}
                      </div>
                    </div>
                    {/* アクション行 */}
                    <div className="flex items-center gap-2 pt-1 border-t px-4 pb-3" style={{ borderColor: 'var(--border-subtle)' }}>
                      {/* ❤️ いいね（クールダウン付き） */}
                      <button
                        onClick={e => { handleHeartPress(event); triggerLike(e.currentTarget); }}
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

                      {/* カレンダー状態ボタン */}
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

                      {/* 😊 リアクション */}
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

                      {/* ✏️ 編集（自分の投稿のみ） */}
                      {event.authorId && user && event.authorId === user.id && (
                        <button
                          onClick={() => openEdit(event)}
                          className="px-3 py-1.5 rounded-full border border-default text-sm active:opacity-60 flex items-center justify-center"
                          style={{ color: 'var(--accent-color)', minWidth: '2.5rem' }}
                        >
                          <Pencil size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
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

      {/* カテゴリフィルターピッカー */}
      {filterPickerWorkId !== null && (() => {
        const work = participatedWorks.find(w => w.id === filterPickerWorkId);
        if (!work) return null;
        const current = categoryFilters[filterPickerWorkId] ?? [];
        const color = workColorMap.get(filterPickerWorkId) ?? 'var(--accent-color)';
        const toggle = (cat: string) => {
          const next = current.includes(cat) ? current.filter(c => c !== cat) : [...current, cat];
          const updated = { ...categoryFilters, [filterPickerWorkId]: next };
          setCategoryFilters(updated);
          saveCategoryFilters(updated);
        };
        const batchAddCount = visibleEvents.filter(e => {
          if (e.workId !== filterPickerWorkId) return false;
          return !calendarEventIds.has(e.id);
        }).length;
        return (
          <>
            <div className="fixed inset-0 z-[180]" onClick={() => setFilterPickerWorkId(null)} />
            <div className="fixed bottom-14 left-0 right-0 z-[190] max-w-app mx-auto px-4 pb-2">
              <div className="bg-bg-secondary rounded-xl shadow-card overflow-hidden">
                <div className="flex items-center justify-between px-4 pt-4 pb-2">
                  <span className="text-label-primary text-sm font-semibold">{work.name} の表示カテゴリ</span>
                  <button onClick={() => { const u = { ...categoryFilters, [filterPickerWorkId]: [] }; setCategoryFilters(u); saveCategoryFilters(u); }} className="text-xs text-label-tertiary underline active:opacity-60">すべて表示</button>
                </div>
                <p className="px-4 text-[11px] text-label-tertiary mb-3">色ありが表示中。タップしたカテゴリを非表示にします</p>
                <div className="flex flex-wrap gap-2 px-4 pb-3">
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
                {/* 一括追加ボタン */}
                <div className="px-4 pb-4 border-t pt-3" style={{ borderColor: 'var(--border-subtle)' }}>
                  <button
                    onClick={() => { handleBatchAdd(filterPickerWorkId); setFilterPickerWorkId(null); }}
                    disabled={batchAddCount === 0}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold active:opacity-70 disabled:opacity-40"
                    style={{ backgroundColor: `${color}20`, color }}
                  >
                    <Plus size={14} />
                    {batchAddCount > 0
                      ? `表示中の予定を一括追加（${batchAddCount}件）`
                      : 'すべて追加済み'}
                  </button>
                </div>
              </div>
            </div>
          </>
        );
      })()}

      {/* 編集パネル */}
      {editEventId && editForm && (
        <>
          <div className="fixed inset-0 z-[159] bg-black/40" onClick={() => { setEditEventId(null); setEditForm(null); }} />
          <div
            className="fixed inset-x-0 max-w-app mx-auto z-[160] rounded-t-2xl overflow-hidden"
            style={{ bottom: BOTTOM_TAB_H, height: '80vh', backgroundColor: 'var(--bg-primary)', animation: 'slideUpPanel 0.28s cubic-bezier(0.32, 0.72, 0, 1) both' }}
          >
            <div className="absolute inset-x-0 top-0 z-10 rounded-t-2xl" style={{ backgroundColor: 'var(--bg-primary)' }}>
              <div className="flex justify-center pt-3 pb-1">
                <div className="w-10 h-1 rounded-full" style={{ backgroundColor: 'var(--border-subtle)' }} />
              </div>
              <div className="px-4 pb-2 flex items-center justify-between">
                <button onClick={() => { setEditEventId(null); setEditForm(null); }} className="flex items-center gap-1 text-xs text-label-tertiary active:opacity-60">
                  <ChevronLeft size={14} />キャンセル
                </button>
                <p className="text-label-primary text-sm font-semibold">予定を編集</p>
                <button onClick={handleEditSubmit} disabled={editSubmitting} className="text-xs font-semibold px-3 py-1.5 rounded-lg active:opacity-70 disabled:opacity-40" style={{ color: 'var(--accent-color)' }}>
                  {editSubmitting ? '更新中…' : '保存'}
                </button>
              </div>
              {editError && <p className="text-red-400 text-xs px-4 pb-1">{editError}</p>}
            </div>
            <div className="absolute inset-x-0 bottom-0" style={{ top: 60, overflowY: 'scroll', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}>
              <div className="px-4 pt-2 pb-8 flex flex-col gap-4">
                <div>
                  <label className="text-label-tertiary text-xs mb-1.5 block">タイトル <span className="text-red-400">*</span></label>
                  <input type="text" value={editForm.title} onChange={e => setEditForm(f => f && ({ ...f, title: e.target.value }))} className={inputCls} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="text-label-tertiary text-xs mb-1.5 block">開始日 <span className="text-red-400">*</span></label>
                    <input type="date" value={editForm.date} onChange={e => setEditForm(f => f && ({ ...f, date: e.target.value }))} className={inputCls} /></div>
                  <div><label className="text-label-tertiary text-xs mb-1.5 block">開始時間</label>
                    <input type="time" value={editForm.time} onChange={e => setEditForm(f => f && ({ ...f, time: e.target.value }))} className={inputCls} /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="text-label-tertiary text-xs mb-1.5 block">終了日</label>
                    <input type="date" value={editForm.endDate} onChange={e => setEditForm(f => f && ({ ...f, endDate: e.target.value }))} className={inputCls} /></div>
                  <div><label className="text-label-tertiary text-xs mb-1.5 block">終了時間</label>
                    <input type="time" value={editForm.endTime} onChange={e => setEditForm(f => f && ({ ...f, endTime: e.target.value }))} className={inputCls} /></div>
                </div>
                <div>
                  <label className="text-label-tertiary text-xs mb-1.5 block">カテゴリ</label>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {POST_CATEGORIES.map(cat => (
                      <button key={cat} type="button"
                        onClick={() => setEditForm(f => f && ({ ...f, category: f.category === cat ? '' : cat, customCategory: '' }))}
                        className={`px-3 py-1 rounded-full text-xs border transition-colors ${editForm.category === cat ? 'border-selected text-label-primary bg-label-primary/10' : 'border-default text-label-secondary'}`}>
                        {cat}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-label-tertiary text-xs flex-shrink-0">その他：</span>
                    <input type="text" value={editForm.customCategory}
                      onChange={e => setEditForm(f => f && ({ ...f, customCategory: e.target.value, category: '' }))}
                      placeholder="自由に入力" className="flex-1 bg-bg-primary rounded-lg px-3 py-1.5 text-xs text-label-primary placeholder:text-label-tertiary outline-none border border-faint focus:border-strong" />
                  </div>
                </div>
                <div>
                  <label className="text-label-tertiary text-xs mb-1.5 block">メモ（任意）</label>
                  <textarea value={editForm.memo} onChange={e => setEditForm(f => f && ({ ...f, memo: e.target.value }))} rows={3} className={`${inputCls} resize-none`} />
                </div>
                <div>
                  <label className="text-label-tertiary text-xs mb-1.5 block">リンク（任意・複数可）</label>
                  <div className="flex flex-col gap-2">
                    {editForm.links.map((lnk, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <input type="url" value={lnk}
                          onChange={e => {
                            const next = [...editForm.links];
                            next[i] = e.target.value;
                            setEditForm(f => f && ({ ...f, links: next }));
                          }}
                          placeholder={i === 0 ? '購入先 / 公式ポストなど' : '追加リンク'}
                          className={`${inputCls} flex-1`} />
                        {editForm.links.length > 1 && (
                          <button type="button"
                            onClick={() => setEditForm(f => f && ({ ...f, links: f.links.filter((_, j) => j !== i) }))}
                            className="w-7 h-7 flex items-center justify-center text-label-tertiary active:opacity-60 flex-shrink-0">
                            <X size={14} />
                          </button>
                        )}
                      </div>
                    ))}
                    {editForm.links.length < 5 && (
                      <button type="button"
                        onClick={() => setEditForm(f => f && ({ ...f, links: [...f.links, ''] }))}
                        className="flex items-center gap-1 text-xs text-label-tertiary active:opacity-60 mt-0.5 w-fit">
                        <Plus size={12} />リンクを追加
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* 地域フィルターパネル */}
      {showRegionPanel && (
        <div className="fixed inset-0 z-[200] flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowRegionPanel(false)} />
          <div
            className="relative bg-bg-primary rounded-t-2xl"
            style={{ maxHeight: '85vh', display: 'flex', flexDirection: 'column', animation: 'slideUpPanel 0.28s cubic-bezier(0.32, 0.72, 0, 1) both' }}
          >
            <div style={{ flexShrink: 0 }} className="pt-3 px-4 pb-3 border-b border-faint">
              <div className="flex justify-center mb-2">
                <div className="w-10 h-1 rounded-full bg-label-tertiary/50" />
              </div>
              <div className="flex items-center justify-between">
                <p className="text-label-primary font-semibold text-sm">地域で絞り込む</p>
                <button onClick={() => setShowRegionPanel(false)} className="text-xs text-label-secondary active:opacity-60">閉じる</button>
              </div>
              {filterActive && (
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-xs rounded-full px-2.5 py-0.5 border" style={{ color: 'var(--accent-color)', borderColor: 'var(--accent-color)' }}>{filterLabel}</span>
                  <button onClick={() => { setFilterMode('none'); setFilterValue(null); setIncludeAdjacent(false); saveRegionFilter({ filterMode: 'none', filterValue: null, includeAdjacent: false }); }} className="text-xs text-label-tertiary underline active:opacity-60">解除</button>
                </div>
              )}
            </div>
            <div style={{ flex: 1, minHeight: 0, overflowY: 'scroll', WebkitOverflowScrolling: 'touch', padding: '16px 16px 40px' } as React.CSSProperties}>
              <div className="mb-5">
                <p className="text-label-tertiary text-xs mb-2">都道府県で選ぶ</p>
                <PrefectureSearch
                  value={filterMode === 'pref' ? filterValue ?? '' : ''}
                  onChange={pref => {
                    if (pref) { setFilterMode('pref'); setFilterValue(pref); setIncludeAdjacent(false); saveRegionFilter({ filterMode: 'pref', filterValue: pref, includeAdjacent: false }); setShowRegionPanel(false); }
                    else { setFilterMode('none'); setFilterValue(null); setIncludeAdjacent(false); saveRegionFilter({ filterMode: 'none', filterValue: null, includeAdjacent: false }); }
                  }}
                />
              </div>
              <div className="mb-5">
                <p className="text-label-tertiary text-xs mb-2">地域で選ぶ</p>
                <select
                  value={filterMode === 'region' ? filterValue ?? '' : ''}
                  onChange={e => {
                    if (e.target.value) { setFilterMode('region'); setFilterValue(e.target.value); setIncludeAdjacent(false); saveRegionFilter({ filterMode: 'region', filterValue: e.target.value, includeAdjacent: false }); setShowRegionPanel(false); }
                    else { setFilterMode('none'); setFilterValue(null); saveRegionFilter({ filterMode: 'none', filterValue: null, includeAdjacent: false }); }
                  }}
                  className="w-full bg-bg-secondary rounded-xl px-3 py-3 text-sm text-label-primary outline-none border border-subtle appearance-none"
                >
                  <option value="">地域を選ぶ</option>
                  {REGIONS.map(r => <option key={r.name} value={r.name}>{r.name}地方</option>)}
                </select>
              </div>
              {filterMode === 'pref' && filterValue && (ADJACENT[filterValue]?.length ?? 0) > 0 && (
                <button
                  onClick={() => { setIncludeAdjacent(v => !v); saveRegionFilter({ filterMode, filterValue, includeAdjacent: !includeAdjacent }); }}
                  className="w-full flex items-center justify-between px-4 py-3 bg-bg-secondary rounded-xl mb-5"
                >
                  <div>
                    <p className="text-sm text-label-primary text-left">隣接する県を含む</p>
                    {includeAdjacent && <p className="text-[10px] text-label-tertiary text-left mt-0.5">{ADJACENT[filterValue].join('・')}</p>}
                  </div>
                  <div className="flex-shrink-0 w-11 h-6 rounded-full relative transition-colors ml-3" style={{ background: includeAdjacent ? 'var(--accent-color)' : 'rgba(128,128,128,0.4)' }}>
                    <div className="absolute top-1 w-4 h-4 bg-white rounded-full transition-all shadow-sm" style={{ left: includeAdjacent ? 'calc(100% - 20px)' : '4px' }} />
                  </div>
                </button>
              )}
              {/* ホーム県設定を促すボックス（未設定のとき） */}
              {!homePref && (
                <div className="mb-5 px-4 py-3 bg-bg-secondary rounded-xl border border-faint">
                  <p className="text-label-primary text-sm font-medium mb-1">ホーム県を設定する</p>
                  <p className="text-label-tertiary text-xs mb-3 leading-relaxed">設定しておくと次回から自動で絞り込まれます。</p>
                  <button
                    onClick={() => { setShowRegionPanel(false); setShowUserSettings(true); }}
                    className="text-xs font-semibold active:opacity-60"
                    style={{ color: 'var(--accent-color)' }}
                  >ユーザー設定で登録する →</button>
                </div>
              )}
              {/* ホーム県に戻すボタン（設定済みかつ現在ホーム県でない場合） */}
              {homePref && !(filterMode === 'pref' && filterValue === homePref) && (
                <button
                  onClick={() => {
                    setFilterMode('pref'); setFilterValue(homePref); setIncludeAdjacent(false);
                    saveRegionFilter({ filterMode: 'pref', filterValue: homePref, includeAdjacent: false });
                    setShowRegionPanel(false);
                  }}
                  className="w-full text-center py-3 rounded-xl text-sm font-medium active:opacity-70 mb-3"
                  style={{ background: 'var(--accent-color)', color: 'var(--bg-primary)' }}
                >
                  ホーム県（{homePref}）に戻す
                </button>
              )}
              {filterActive ? (
                <button onClick={() => { setFilterMode('none'); setFilterValue(null); setIncludeAdjacent(false); saveRegionFilter({ filterMode: 'none', filterValue: null, includeAdjacent: false }); setShowRegionPanel(false); }} className="w-full text-center py-3 rounded-xl border border-subtle text-sm text-label-secondary active:opacity-60">全国表示（絞り込みなし）</button>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* ユーザー設定シート */}
      {showUserSettings && (
        <UserSettingsSheet
          homePref={homePref}
          displayName={displayName}
          onSave={handleSaveUserSettings}
          onClose={() => setShowUserSettings(false)}
        />
      )}

      <BottomTab />

      {renderLikeOverlay()}

      {viewingUserId && (
        <UserProfileModal userId={viewingUserId} onClose={() => setViewingUserId(null)} />
      )}
    </>
  );
}

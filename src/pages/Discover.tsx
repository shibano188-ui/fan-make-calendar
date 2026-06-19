import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { showBanner, hideBanner } from '../lib/admob';
import { useLikeAnimation } from '../hooks/useLikeAnimation';
import { useReportedEventIds } from '../hooks/useReportedEventIds';
import UserProfileModal from '../components/UserProfileModal';
import EventTile from '../components/EventTile';
import {
  SlidersHorizontal, Plus,
  Map as MapIcon, Palette, Clock, ChevronLeft, ChevronRight, Compass, CalendarDays,
} from 'lucide-react';
import BottomTab from '../components/BottomTab';
import Header from '../components/Header';
import SettingsMenuButton from '../components/SettingsMenuButton';
import {
  listAllParticipatedWorkEvents, listRecentWorks,
  setReaction, getMyReactionsBatch, addLikeTap,
  getHomePrefecture, getDisplayName, saveHomePrefecture, saveDisplayName,
  deleteEvent, listPreorderEvents, reportEvent,
} from '../lib/api';
import PreorderEditSheet from '../components/PreorderEditSheet';
import UserSettingsSheet from '../components/UserSettingsSheet';
import type { Work } from '../lib/api';
import type { CalendarEvent } from '../types';
import { REACTIONS, type ReactionType } from '../lib/reactions';
import {
  POST_CATEGORIES,
  loadCategoryFilters, saveCategoryFilters,
  loadLikedEventIds, addLikedEventId,
  loadCalendarEventIds, addCalendarEventId, saveCalendarEventIds,
  loadSeenEventIds, saveSeenEventIds,
  parseCategories,
  GOODS_SUBCATEGORIES,
  loadRegionFilter, saveRegionFilter, type FilterMode,
  incrementTotalLikesGiven,
  loadImageVisibility,
  loadHiddenWorkIds, saveHiddenWorkIds,
} from '../lib/constants';
import { REGIONS, ADJACENT } from '../lib/prefectures';
import { PrefectureSearch } from '../components/UserSettingsSheet';
import { useAuth } from '../contexts/AuthContext';
import { WORK_COLORS } from './Calendar';
import { useConfirm } from '../components/ui/ConfirmDialog';
import { useToast } from '../components/ui/Toast';
import { haptic } from '../lib/haptics';
import EmptyState from '../components/ui/EmptyState';
import { SkeletonList } from '../components/ui/Skeleton';
import { getCached, setCached } from '../lib/swrCache';

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





// ─── コンポーネント ────────────────────────────────────────────────

export default function Discover() {
  const navigate = useNavigate();
  const location = useLocation();
  const highlightEventId = (location.state as { highlightEventId?: string } | null)?.highlightEventId ?? null;
  const { user } = useAuth();
  const { reportedEventIds, addReportedEventId } = useReportedEventIds(user?.id);
  const confirmDialog = useConfirm();
  const showToast = useToast();

  const [showImagesDiscover] = useState(() => loadImageVisibility().discover);
  // 月送り（カレンダーと同じ year/month。month は0始まり）
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const prevMonth = () => { if (month === 0) { setYear(y => y - 1); setMonth(11); } else setMonth(m => m - 1); };
  const nextMonth = () => { if (month === 11) { setYear(y => y + 1); setMonth(0); } else setMonth(m => m + 1); };
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [participatedWorks, setParticipatedWorks] = useState<Work[]>([]);
  const [hiddenWorkIds, setHiddenWorkIds] = useState<Set<string>>(loadHiddenWorkIds);
  const [categoryFilters, setCategoryFilters] = useState<Record<string, string[]>>(loadCategoryFilters);
  const [filterPickerWorkId, setFilterPickerWorkId] = useState<string | null>(null);
  const [filterGoodsOpen, setFilterGoodsOpen] = useState(false);

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

  // 閲覧済み（スクロールで画面に入った）イベントID。
  // initialSeenIds = 開いた時点のスナップショット（新着/閲覧済みの区分はこれで固定し、
  // スクロール中に既読化しても“その場では”下に飛ばない）。seenIdsRef は随時更新して保存。
  const initialSeenIds = useRef(loadSeenEventIds());
  const seenIdsRef = useRef(loadSeenEventIds());
  // カードが画面に半分入ったら閲覧済みにする IntersectionObserver（描画前に生成）
  const seenObserverRef = useRef<IntersectionObserver | null>(null);
  if (!seenObserverRef.current && typeof window !== 'undefined' && 'IntersectionObserver' in window) {
    seenObserverRef.current = new IntersectionObserver(entries => {
      let changed = false;
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const id = (entry.target as HTMLElement).dataset.eventId;
        if (id && !seenIdsRef.current.has(id)) { seenIdsRef.current.add(id); changed = true; }
        seenObserverRef.current?.unobserve(entry.target);
      }
      if (changed) saveSeenEventIds(seenIdsRef.current);
    }, { threshold: 0.5 });
  }
  useEffect(() => () => seenObserverRef.current?.disconnect(), []);
  const observeSeen = useCallback((node: HTMLDivElement | null) => {
    if (node) seenObserverRef.current?.observe(node);
  }, []);

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

  const { trigger: triggerLike, renderOverlay: renderLikeOverlay } = useLikeAnimation();
  const [viewingUserId, setViewingUserId] = useState<string | null>(null);
  const [preorderEditEvent, setPreorderEditEvent] = useState<import('../types').CalendarEvent | null>(null);
  const handleDeleteEvent = async (id: string, title: string) => {
    if (!(await confirmDialog({ title: '予定を削除', message: `「${title}」を削除しますか？\nこの操作は元に戻せません。`, confirmLabel: '削除', destructive: true }))) return;
    try {
      await deleteEvent(id);
      setEvents(prev => prev.filter(e => e.id !== id));
    } catch { showToast('削除に失敗しました', 'error'); }
  };

  const handleReportEvent = async (id: string, title: string) => {
    if (!user) return;
    if (!(await confirmDialog({ title: '投稿を通報', message: `「${title}」を不適切な投稿として通報しますか？\n通報した投稿は表示されなくなります。`, confirmLabel: '通報する', destructive: true }))) return;
    try {
      await reportEvent(id, user.id, 'inappropriate');
      addReportedEventId(id);
      showToast('通報を受け付けました');
    } catch { showToast('通報に失敗しました', 'error'); }
  };

  // 編集パネル

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
    const raf = requestAnimationFrame(() => { showBanner(); });
    return () => { cancelAnimationFrame(raf); hideBanner(); };
  }, []);

  const reload = useCallback(async () => {
    if (!user) return;
    const key = `discover:${user.id}:${year}-${month}`;
    try {
      const [evts, works] = await Promise.all([
        listAllParticipatedWorkEvents(user.id, year, month),
        listRecentWorks(user.id),
      ]);
      setEvents(evts);
      setParticipatedWorks(works);
      setCached(key, { evts, works });
      setError('');
    } catch {
      // キャッシュ表示中はエラーバナーを出さない（裏の再取得失敗のみ）
      if (!getCached(key)) {
        setError('読み込めませんでした。下に引っぱって再読み込みできます');
      }
    }
  }, [user?.id, year, month]); // eslint-disable-line react-hooks/exhaustive-deps

  // いいね数・削除などのローカル変更をタブ離脱時に現在の月キーへ反映
  const eventsRef = useRef<CalendarEvent[]>([]);
  const worksRef = useRef<Work[]>([]);
  const cacheKeyRef = useRef('');
  eventsRef.current = events;
  worksRef.current = participatedWorks;
  cacheKeyRef.current = user ? `discover:${user.id}:${year}-${month}` : '';
  useEffect(() => {
    if (!user) return;
    return () => {
      if (cacheKeyRef.current && (eventsRef.current.length || worksRef.current.length)) {
        setCached(cacheKeyRef.current, { evts: eventsRef.current, works: worksRef.current });
      }
    };
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!user) return;
    const cached = getCached<{ evts: CalendarEvent[]; works: Work[] }>(`discover:${user.id}:${year}-${month}`);
    if (cached) {
      // キャッシュを即表示し、裏で再取得して最新化（スケルトンなし）
      setEvents(cached.evts);
      setParticipatedWorks(cached.works);
      setLoading(false);
      reload();
    } else {
      setLoading(true);
      reload().finally(() => setLoading(false));
    }
  }, [user?.id, year, month, reload]); // eslint-disable-line react-hooks/exhaustive-deps

  // プルトゥリフレッシュ（スクロール先頭で80px以上引っ張る・preventDefaultしない安全実装）
  const [refreshing, setRefreshing] = useState(false);
  const feedRef = useRef<HTMLDivElement>(null);
  const pullStartY = useRef<number | null>(null);
  const swipeStartX = useRef<number | null>(null);
  const swipeStartY = useRef<number | null>(null);
  const onFeedTouchStart = (e: React.TouchEvent) => {
    pullStartY.current = (feedRef.current?.scrollTop ?? 1) <= 0 ? e.touches[0].clientY : null;
    swipeStartX.current = e.touches[0].clientX;
    swipeStartY.current = e.touches[0].clientY;
  };
  const onFeedTouchEnd = async (e: React.TouchEvent) => {
    // 横スワイプで月移動（水平が支配的かつ60px以上・縦スクロール/プル更新と競合しない）
    if (swipeStartX.current !== null && swipeStartY.current !== null) {
      const sdx = e.changedTouches[0].clientX - swipeStartX.current;
      const sdy = e.changedTouches[0].clientY - swipeStartY.current;
      swipeStartX.current = null;
      swipeStartY.current = null;
      if (Math.abs(sdx) >= 60 && Math.abs(sdx) >= Math.abs(sdy) * 1.5) {
        pullStartY.current = null;
        if (sdx < 0) nextMonth(); else prevMonth();
        return;
      }
    }
    if (pullStartY.current === null || refreshing) return;
    const pulled = e.changedTouches[0].clientY - pullStartY.current;
    pullStartY.current = null;
    if (pulled < 80 || (feedRef.current?.scrollTop ?? 1) > 0) return;
    setRefreshing(true);
    await reload();
    setRefreshing(false);
  };

  // スクロール位置の保持（タブを離れて戻っても同じ場所から）
  useEffect(() => {
    if (loading) return;
    const saved = sessionStorage.getItem('discover_scroll');
    if (saved) feedRef.current?.scrollTo({ top: parseInt(saved, 10) });
  }, [loading]);
  const onFeedScroll = () => {
    sessionStorage.setItem('discover_scroll', String(feedRef.current?.scrollTop ?? 0));
  };

  // 予約受付中イベント
  const [preorderEvents, setPreorderEvents] = useState<CalendarEvent[]>(
    () => getCached<CalendarEvent[]>('preorder-banner') ?? []
  );
  useEffect(() => {
    if (participatedWorks.length === 0) { setPreorderEvents([]); return; }
    listPreorderEvents(participatedWorks.map(w => w.id)).then(evts => {
      setPreorderEvents(evts);
      setCached('preorder-banner', evts);
    }).catch(() => {});
  }, [participatedWorks]); // eslint-disable-line react-hooks/exhaustive-deps

  // ハイライト対象イベントにスクロール
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  useEffect(() => {
    if (!highlightEventId || loading || events.length === 0) return;
    setHighlightedId(highlightEventId);
    setTimeout(() => {
      document.getElementById(`discover-event-${highlightEventId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
    const timer = setTimeout(() => setHighlightedId(null), 2500);
    return () => clearTimeout(timer);
  }, [highlightEventId, loading, events.length]); // eslint-disable-line react-hooks/exhaustive-deps

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
    // 自分の投稿も表示する（追加済みフィルターで普段は出ず、×で外したものだけ現れて❤️で戻せる）
    // 通報済みイベントは通報者には表示しない
    evts = evts.filter(e => !reportedEventIds.has(e.id));
    // カテゴリフィルター
    evts = evts.filter(e => {
      const wId = e.workId ?? '';
      if (!wId) return true;
      const cats = categoryFilters[wId];
      if (!cats || cats.length === 0) return true;
      const evCats = parseCategories(e.category);
      return evCats.length === 0 ? true : !evCats.some(c => cats.includes(c));
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
    // 終了済みの予定は非表示。残すのは「日付なし」「発売日/終了日が未来」「受付中（受付終了日が未来）」のみ。
    // 受付終了日が無く発売日も過去のものは（予約受付中タブと同様）非表示にする。
    const todayStr = new Date().toISOString().slice(0, 10);
    evts = evts.filter(e =>
      !e.date || (e.endDate ?? e.date) >= todayStr
      || (e.isOrderMade && !!e.preorderEnd && e.preorderEnd >= todayStr),
    );
    // Calendar一覧と同じく日付昇順（nullは末尾）
    evts = [...evts].sort((a, b) => {
      if (!a.date && !b.date) return 0;
      if (!a.date) return 1;
      if (!b.date) return -1;
      return a.date.localeCompare(b.date);
    });
    return evts;
  }, [events, hiddenWorkIds, categoryFilters, user, activeFilterPrefs, reportedEventIds]);

  // 新着（未閲覧）/ 閲覧済み に分割。区分は「開いた時点のスナップショット」で固定する。
  const { unseenEvents, seenEvents } = useMemo(() => {
    const snap = initialSeenIds.current;
    const unseen: CalendarEvent[] = [];
    const seen: CalendarEvent[] = [];
    for (const e of visibleEvents) (snap.has(e.id) ? seen : unseen).push(e);
    return { unseenEvents: unseen, seenEvents: seen };
  }, [visibleEvents]);
  // 新着・閲覧済みの両方があるときだけ見出しで区切る
  const showSeenSections = unseenEvents.length > 0 && seenEvents.length > 0;

  const toggleWork = (wId: string) =>
    setHiddenWorkIds(prev => {
      const next = new Set(prev);
      if (next.has(wId)) next.delete(wId); else next.add(wId);
      saveHiddenWorkIds(next);
      return next;
    });

  // ❤️ いいね（クールダウン付き）＋初回のみカレンダーに追加
  const handleHeartPress = async (event: CalendarEvent) => {
    if (!user) return;
    // 自分の投稿: いいね加算なしでマイカレンダーに戻すだけ（自己いいねの水増し防止）
    if (event.authorId === user.id) {
      if (!calendarEventIds.has(event.id)) {
        const nextCal = addCalendarEventId(event.id);
        setCalendarEventIds(nextCal);
      }
      return;
    }
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

  // 新着 / 閲覧済み の区切り見出し
  const SectionLabel = ({ label }: { label: string }) => (
    <div className="flex items-center gap-2 px-1 pt-1 pb-0.5">
      <span className="text-[12px] font-bold text-label-tertiary whitespace-nowrap">{label}</span>
      <span className="flex-1 h-px" style={{ background: 'var(--fill-tertiary)' }} />
    </div>
  );

  // 1件のイベントカード（observeSeen で画面に入ったら閲覧済みにする）
  const renderEventCard = (event: CalendarEvent) => {
    const color = event.workId ? (workColorMap.get(event.workId) ?? 'var(--accent-color)') : 'var(--accent-color)';
    const isLiked = likedEventIds.has(event.id);
    const isInCalendar = calendarEventIds.has(event.id);
    const showReAdd = (isLiked || (!!user && event.authorId === user.id)) && !isInCalendar;
    const isLocked = lockedLikeIds.has(event.id);
    const isOwn = !!user && event.authorId === user.id;
    const canEditInfo = !!event.workId && participatedWorks.some(w => w.id === event.workId);
    return (
      <div key={event.id} id={`discover-event-${event.id}`} ref={observeSeen} data-event-id={event.id}>
        <EventTile
          event={event}
          workColor={color}
          showImages={showImagesDiscover}
          highlighted={highlightedId === event.id}
          liked={isLiked}
          likeLocked={isLocked || !user}
          onLike={el => { handleHeartPress(event); triggerLike(el); }}
          calendarStatus={isInCalendar ? 'in' : showReAdd ? 'readd' : null}
          onCalendarStatusClick={() => { if (isInCalendar) navigate('/calendar'); else handleReAddToCalendar(event.id); }}
          myReaction={myReactions[event.id] ?? null}
          onReact={() => setOpenReactionPickerId(prev => prev === event.id ? null : event.id)}
          isOwn={isOwn}
          onDelete={() => handleDeleteEvent(event.id, event.title)}
          onReport={user ? () => handleReportEvent(event.id, event.title) : undefined}
          onInfoEdit={canEditInfo ? () => setPreorderEditEvent(event) : undefined}
          onAuthorClick={event.authorId ? () => setViewingUserId(event.authorId!) : undefined}
        />
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
              <span className="text-base font-semibold text-label-primary mr-1">発見</span>
              <button onClick={prevMonth} aria-label="前の月" className="w-8 h-8 flex items-center justify-center rounded-lg pressable tap-44" style={{ color: 'var(--accent-color)' }}><ChevronLeft size={20} /></button>
              <button onClick={() => { const t = new Date(); setYear(t.getFullYear()); setMonth(t.getMonth()); }} aria-label="今月へ戻る" className="text-base font-bold text-label-primary pressable">{year}年{month + 1}月</button>
              <button onClick={nextMonth} aria-label="次の月" className="w-8 h-8 flex items-center justify-center rounded-lg pressable tap-44" style={{ color: 'var(--accent-color)' }}><ChevronRight size={20} /></button>
            </div>
          }
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
              <button
                onClick={() => navigate('/customize')}
                aria-label="カスタマイズ"
                className="w-8 h-8 flex items-center justify-center rounded-lg bg-bg-secondary text-label-secondary active:opacity-60"
              >
                <Palette size={16} />
              </button>
              <SettingsMenuButton />
            </div>
          }
        />

        {/* 広告バナースロット */}
        <div className="flex-shrink-0" style={{ height: 20 }} />
        <div id="ad-spacer" className="flex-shrink-0" style={{ height: 80 }} />

        {/* 予約受付中バナー */}
        {preorderEvents.length > 0 && (() => {
          const todayStr = new Date().toISOString().slice(0, 10);
          const activeCount = preorderEvents.filter(e => { const s = e.preorderStart ?? e.date; return !s || s <= todayStr; }).length;
          const upcomingCount = preorderEvents.length - activeCount;
          return (
            <button
              onClick={() => navigate('/preorders')}
              className="flex-shrink-0 flex items-center gap-2 px-4 py-2.5 border-b active:opacity-70"
              style={{ backgroundColor: 'color-mix(in srgb, var(--color-warning) 12%, transparent)', borderColor: 'var(--separator)' }}
            >
              <Clock size={14} style={{ color: 'var(--color-warning)', flexShrink: 0 }} />
              <div className="flex items-center gap-2 flex-1 min-w-0">
                {activeCount > 0 && (
                  <span className="text-xs font-semibold" style={{ color: 'var(--color-warning)' }}>
                    受付中 {activeCount}件
                  </span>
                )}
                {upcomingCount > 0 && (
                  <span className="text-xs text-label-secondary">
                    予約開始予定 {upcomingCount}件
                  </span>
                )}
              </div>
              <ChevronRight size={14} className="text-label-tertiary flex-shrink-0" />
            </button>
          );
        })()}

        {/* 作品チップ */}
        {participatedWorks.length > 0 && (
          <div className="flex-shrink-0 flex items-center gap-2 px-4 py-2 overflow-x-auto border-b" style={{ borderColor: 'var(--border-subtle)' }}>
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
                    className="flex items-center gap-1.5 text-[13px] pl-3 pr-2 py-1.5 pressable"
                  >
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: hidden ? 'var(--label-tertiary)' : color }} />
                    {w.name}
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); setFilterPickerWorkId(w.id); }}
                    aria-label={`${w.name} のカテゴリで絞り込む`}
                    className="pr-2.5 py-1.5 pressable tap-44"
                    style={{ color: hasCatFilter ? color : 'var(--label-tertiary)' }}
                  >
                    <SlidersHorizontal size={12} strokeWidth={hasCatFilter ? 2.5 : 1.5} />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* 地域フィルターインジケーター */}
        {filterActive && (
          <div className="flex-shrink-0 flex items-center gap-2 px-4 py-1.5">
            <span className="text-[11px] text-label-tertiary">絞り込み：</span>
            <span className="text-[11px] px-2 py-0.5 rounded-full" style={{ backgroundColor: 'color-mix(in srgb, var(--accent-color) 15%, transparent)', color: 'var(--accent-color)' }}>{filterLabel}</span>
            <button
              onClick={() => { setFilterMode('none'); setFilterValue(null); setIncludeAdjacent(false); saveRegionFilter({ filterMode: 'none', filterValue: null, includeAdjacent: false }); }}
              className="text-[11px] text-label-tertiary pressable"
            >解除</button>
          </div>
        )}


        {/* フィード */}
        <div ref={feedRef} onScroll={onFeedScroll} onTouchStart={onFeedTouchStart} onTouchEnd={onFeedTouchEnd} className="flex-1 overflow-y-auto px-4 pt-3 pb-6">
          {refreshing && (
            <div className="flex justify-center py-2">
              <div className="w-5 h-5 rounded-full border-2 animate-spin" style={{ borderColor: 'var(--fill-primary)', borderTopColor: 'var(--accent-text)' }} />
            </div>
          )}
          {loading ? (
            <SkeletonList count={3} tall />
          ) : error ? (
            <p className="text-center text-sm py-10" style={{ color: 'var(--color-destructive)' }}>{error}</p>
          ) : !user ? (
            <p className="text-center text-label-tertiary text-sm py-10">ログインが必要です</p>
          ) : visibleEvents.length === 0 ? (
            participatedWorks.length === 0 ? (
              <EmptyState
                icon={<Compass size={48} strokeWidth={1.2} />}
                title="まだ作品に参加していません"
                description="好きな作品に参加すると、みんなが投稿した予定がここに流れてきます"
                actionLabel="作品を探す"
                onAction={() => navigate('/select')}
              />
            ) : (
              <EmptyState
                icon={<CalendarDays size={48} strokeWidth={1.2} />}
                title={`${year}年${month + 1}月の予定はまだありません`}
                description="見つけた予定を投稿すると、同じ作品のファンに届きます"
                actionLabel="予定を投稿する"
                onAction={() => navigate('/calendar')}
                actionVariant="tinted"
              />
            )
          ) : (
            <div className="flex flex-col gap-3">
              {showSeenSections && <SectionLabel label="新着" />}
              {unseenEvents.map(renderEventCard)}
              {showSeenSections && <SectionLabel label="閲覧済み" />}
              {seenEvents.map(renderEventCard)}
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
                {/* グッズの種類で絞る（▾展開） */}
                <div className="px-4 pb-3">
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
                  <p className="text-label-tertiary text-xs mb-3 leading-relaxed">設定しておくと、ワンタップでホーム県に絞り込めます。</p>
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
                  style={{ background: 'var(--accent-color)', color: 'var(--accent-on)' }}
                >
                  ホーム県（{homePref}）で絞り込む
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

      {preorderEditEvent && (
        <PreorderEditSheet
          event={preorderEditEvent}
          onClose={() => setPreorderEditEvent(null)}
          onSaved={updated => {
            setEvents(prev => prev.map(e => e.id === preorderEditEvent.id ? { ...e, ...updated } : e));
          }}
        />
      )}
    </>
  );
}

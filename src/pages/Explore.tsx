import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useNavigate, useSearchParams, useNavigationType, useLocation } from 'react-router-dom';
import { ArrowDownToLine, Search, SlidersHorizontal, X } from 'lucide-react';
import type { CalendarEvent } from '../types';
import ItemCard from '../components/item/ItemCard';
import FilterPanel, { type Facet } from '../components/item/FilterPanel';
import Chip from '../components/ui/Chip';
import { SkeletonList } from '../components/ui/Skeleton';
import { deriveItemType, deriveStatus, todayStr, STATUS, type ItemStatus, type ItemType } from '../design/tokens';
import { listExploreEvents, getHomePrefecture, searchWorks, listAllParticipatedWorks, upsertParticipation, leaveCalendar, toggleLike, toggleCalendarAdd, listLikedEventIds, type Work } from '../lib/api';
import { parseCategories, loadSeenEventIds, saveSeenEventIds, isNewItem, GOODS_TAG } from '../lib/constants';
import { getCached, setCached } from '../lib/swrCache';
import { resolveBuy } from '../lib/affiliate';
import { addToCalendar } from '../lib/googleCalendar';
import { useToast } from '../components/ui/Toast';
import { REGIONS, ADJACENT } from '../lib/prefectures';
import { useAuth } from '../contexts/AuthContext';
import { haptic } from '../lib/haptics';
import { useAdBanner } from '../lib/useAdBanner';

const STATUS_ORDER: ItemStatus[] = ['preorder_soon', 'preorder', 'sale_soon', 'onsale', 'preorder_ended', 'ended'];

const PREF_TO_REGION: Record<string, string> = {};
for (const r of REGIONS) for (const p of r.prefectures) PREF_TO_REGION[p] = r.name;

function shiftMonths(base: string, n: number): string {
  const d = new Date(base + 'T00:00:00');
  d.setMonth(d.getMonth() + n);
  return todayStr(d);
}

function loadExploreSession() {
  try { return JSON.parse(sessionStorage.getItem('explore_filters') ?? '{}'); } catch { return {}; }
}

export default function Explore() {
  const navigate = useNavigate();
  const navType = useNavigationType(); // POP=戻る(復元) / PUSH=新規遷移(今日へ)
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const toast = useToast();
  const _ss = loadExploreSession();
  const [mode, setMode] = useState<ItemType>(_ss.mode ?? 'goods');
  const [items, setItems] = useState<CalendarEvent[] | null>(null);
  const [query, setQuery] = useState(searchParams.get('q') ?? _ss.query ?? '');
  const [selectedStatuses, setSelectedStatuses] = useState<Set<string>>(new Set(_ss.statuses ?? []));
  const [excludedWorks, setExcludedWorks] = useState<Set<string>>(new Set(_ss.excludedWorks ?? []));
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set(_ss.categories ?? []));
  const [selectedPrefs, setSelectedPrefs] = useState<Set<string>>(new Set(_ss.prefs ?? []));
  const [selectedRegions, setSelectedRegions] = useState<Set<string>>(new Set(_ss.regions ?? []));
  const [neighborActive, setNeighborActive] = useState<boolean>(_ss.neighborActive ?? false);
  const [homePref, setHomePref] = useState<string | null>(null);
  const [followed, setFollowed] = useState<Set<string>>(new Set());
  const [workMatches, setWorkMatches] = useState<Work[]>([]);
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [filterOpen, setFilterOpen] = useState<boolean>(_ss.filterOpen ?? false);

  // フィルター状態をsessionStorageに同期
  useEffect(() => {
    sessionStorage.setItem('explore_filters', JSON.stringify({
      mode, query,
      statuses: [...selectedStatuses],
      excludedWorks: [...excludedWorks],
      categories: [...selectedCategories],
      prefs: [...selectedPrefs],
      regions: [...selectedRegions],
      neighborActive, filterOpen,
    }));
  }, [mode, query, selectedStatuses, excludedWorks, selectedCategories, selectedPrefs, selectedRegions, neighborActive, filterOpen]);
  const todayRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);

  // スクロール対象を解決する。PhoneFrame(PC)は overflow-y-auto の独自コンテナ、
  // スマホ実機はフレームなし＝window。祖先を辿って最初のスクロールコンテナを返す。
  const resolveScroller = (): HTMLElement | Window => {
    let el: HTMLElement | null = pageRef.current;
    while (el) {
      const oy = getComputedStyle(el).overflowY;
      if (oy === 'auto' || oy === 'scroll') return el;
      el = el.parentElement;
    }
    return window;
  };
  const getScrollTop = (): number => {
    const s = resolveScroller();
    return s === window ? window.scrollY : (s as HTMLElement).scrollTop;
  };
  const setScrollTop = (top: number) => {
    const s = resolveScroller();
    if (s === window) window.scrollTo(0, top);
    else (s as HTMLElement).scrollTo(0, top);
  };

  // スティッキーヘッダーの高さぶんオフセットして「今日」を上端に合わせる
  const scrollToToday = (smooth = false) => {
    const el = todayRef.current;
    if (!el) return;
    el.style.scrollMarginTop = `${(headerRef.current?.offsetHeight ?? 0) + 6}px`;
    el.scrollIntoView({ block: 'start', behavior: smooth ? 'smooth' : 'auto' });
  };

  // ブラウザ標準のスクロール復元を無効化（自前の復元と競合させない・SPA全体で維持）
  useEffect(() => {
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  }, []);

  const today = todayStr();

  // ── 新着 / 閲覧済み（main の Discover 機構を移植）──
  // カードが画面に半分入ったら閲覧済みにして localStorage 保存。新着/閲覧済みの区分は
  // スナップショットで固定し（スクロール中に消えない）、タブに入り直すたびに取り直す。
  const [seenSnapshot, setSeenSnapshot] = useState<Set<string>>(loadSeenEventIds);
  const seenIdsRef = useRef(loadSeenEventIds());
  const seenObserverRef = useRef<IntersectionObserver | null>(null);
  if (!seenObserverRef.current && typeof window !== 'undefined' && 'IntersectionObserver' in window) {
    seenObserverRef.current = new IntersectionObserver((entries) => {
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
  useEffect(() => {
    const latest = loadSeenEventIds();
    seenIdsRef.current = latest;
    setSeenSnapshot(new Set(latest));
  }, [location.key]);
  const [showUnseenOnly, setShowUnseenOnly] = useState(() => sessionStorage.getItem('explore_unseen') === '1');
  useEffect(() => { sessionStorage.setItem('explore_unseen', showUnseenOnly ? '1' : '0'); }, [showUnseenOnly]);

  // 広告バナー: ステータスバー直下に表示。ヘッダーの paddingTop を
  // env(safe-area-inset-top)+バナー高さ分広げ、不透明な余白の上にバナーを重ねる。
  // sticky ヘッダーがスクロール時のコンテンツ被りを防ぐ。Web版は adH=0。
  const adH = useAdBanner();

  useEffect(() => {
    let alive = true;
    const from = shiftMonths(today, -12), to = shiftMonths(today, 18);
    const key = `explore-events:${from}_${to}`;
    // キャッシュを即表示し、裏で再取得して最新化（Homeタブと共有）
    const cached = getCached<CalendarEvent[]>(key);
    if (cached) setItems(cached);
    listExploreEvents(from, to)
      .then((data) => { if (!alive) return; setItems(data); setCached(key, data); })
      .catch(() => { if (alive) setItems((prev) => prev ?? []); });
    return () => { alive = false; };
  }, [today]);

  useEffect(() => { if (user) getHomePrefecture(user.id).then(setHomePref).catch(() => {}); }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!user) return;
    const fkey = `follows:${user.id}`;
    const cachedF = getCached<Work[]>(fkey);
    if (cachedF) setFollowed(new Set(cachedF.map((w) => w.id)));
    listAllParticipatedWorks(user.id).then((ws) => { setFollowed(new Set(ws.map((w) => w.id))); setCached(fkey, ws); }).catch(() => {});
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!user) return;
    const lkey = `liked:${user.id}`;
    const cachedL = getCached<string[]>(lkey);
    if (cachedL) setLikedIds(new Set(cachedL));
    listLikedEventIds(user.id).then((ids) => { setLikedIds(ids); setCached(lkey, [...ids]); }).catch(() => {});
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // 検索語が作品にヒットしたら、フォロー切替パネルを上部に出す
  useEffect(() => {
    const q = query.trim();
    if (!q) { setWorkMatches([]); return; }
    let alive = true;
    const t = setTimeout(() => { searchWorks(q).then((r) => alive && setWorkMatches(r.slice(0, 3))).catch(() => {}); }, 300);
    return () => { alive = false; clearTimeout(t); };
  }, [query]);

  const toggleFollowWork = async (w: Work) => {
    haptic.select();
    if (!user) return;
    const has = followed.has(w.id);
    setFollowed((prev) => { const n = new Set(prev); has ? n.delete(w.id) : n.add(w.id); return n; });
    try { if (has) await leaveCalendar(w.id, user.id); else await upsertParticipation(w.id, user.id); } catch { /* noop */ }
  };

  // フォロー中の作品の予定だけ表示（新作品は検索→作品パネルからフォロー）。
  // グッズ表示では「グッズあり」カテゴリのイベントも一緒に出す（物販あり＝グッズ一覧にも載せる）。
  const modeItems = useMemo(
    () => (items ?? []).filter((e) => {
      if (!e.workId || !followed.has(e.workId)) return false;
      if (mode === 'goods') return deriveItemType(e) === 'goods' || parseCategories(e.category).includes(GOODS_TAG);
      return deriveItemType(e) === 'event';
    }),
    [items, mode, followed],
  );

  const queryItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return modeItems;
    return modeItems.filter((e) => `${e.title} ${e.workName ?? ''} ${e.category ?? ''}`.toLowerCase().includes(q));
  }, [modeItems, query]);

  // ファセット件数
  const statusFacets: Facet[] = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of queryItems) { const s = deriveStatus(e); m.set(s, (m.get(s) ?? 0) + 1); }
    return STATUS_ORDER.filter((s) => m.has(s)).map((s) => ({
      key: s, label: mode === 'goods' ? STATUS[s].goodsLabel : STATUS[s].eventLabel, count: m.get(s)!,
    }));
  }, [queryItems, mode]);

  const workFacets: Facet[] = useMemo(() => {
    const m = new Map<string, Facet>();
    for (const e of queryItems) {
      if (!e.workId) continue;
      const f = m.get(e.workId);
      if (f) f.count++; else m.set(e.workId, { key: e.workId, label: e.workName || '作品', count: 1 });
    }
    return [...m.values()].sort((a, b) => (followed.has(b.key) ? 1 : 0) - (followed.has(a.key) ? 1 : 0) || b.count - a.count);
  }, [queryItems, followed]);

  const categoryFacets: Facet[] = useMemo(() => {
    const m = new Map<string, Facet>();
    for (const e of queryItems) {
      for (const c of parseCategories(e.category)) {
        if (c === 'グッズ') continue;
        const f = m.get(c);
        if (f) f.count++; else m.set(c, { key: c, label: c, count: 1 });
      }
    }
    return [...m.values()].sort((a, b) => b.count - a.count);
  }, [queryItems]);

  const prefFacets: Facet[] = useMemo(() => {
    const m = new Map<string, Facet>();
    for (const e of queryItems) {
      if (!e.prefecture) continue;
      const f = m.get(e.prefecture);
      if (f) f.count++; else m.set(e.prefecture, { key: e.prefecture, label: e.prefecture, count: 1 });
    }
    return [...m.values()].sort((a, b) => b.count - a.count);
  }, [queryItems]);

  const regionFacets: Facet[] = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of queryItems) {
      const reg = e.prefecture ? PREF_TO_REGION[e.prefecture] : undefined;
      if (reg) m.set(reg, (m.get(reg) ?? 0) + 1);
    }
    return REGIONS.filter((r) => m.has(r.name)).map((r) => ({ key: r.name, label: r.name, count: m.get(r.name)! }));
  }, [queryItems]);

  const allowedPrefs = useMemo(() => {
    const s = new Set<string>();
    for (const r of selectedRegions) REGIONS.find((x) => x.name === r)?.prefectures.forEach((p) => s.add(p));
    for (const p of selectedPrefs) s.add(p);
    if (neighborActive && homePref) { s.add(homePref); (ADJACENT[homePref] ?? []).forEach((p) => s.add(p)); }
    return s;
  }, [selectedRegions, selectedPrefs, neighborActive, homePref]);

  // 作品チップは「除外モデル」: 既定は全部ON(オレンジ)＝全表示、押すと除外(その作品を非表示)
  const includedWorks = useMemo(
    () => new Set(workFacets.filter((f) => !excludedWorks.has(f.key)).map((f) => f.key)),
    [workFacets, excludedWorks],
  );

  const visible = useMemo(() => {
    return queryItems.filter((e) => {
      if (selectedStatuses.size && !selectedStatuses.has(deriveStatus(e))) return false;
      if (e.workId && excludedWorks.has(e.workId)) return false;
      if (selectedCategories.size && !parseCategories(e.category).some((c) => selectedCategories.has(c))) return false;
      if (allowedPrefs.size && (!e.prefecture || !allowedPrefs.has(e.prefecture))) return false;
      return true;
    });
  }, [queryItems, selectedStatuses, excludedWorks, selectedCategories, allowedPrefs]);

  // 今日起点: 過去（上）／これから（下）に分割（並びは取得順=日付昇順のまま）。
  // 「新着のみ」ON のときは閲覧済み（スナップショット）を除外する。
  const { past, upcoming } = useMemo(() => {
    const p: CalendarEvent[] = [];
    const u: CalendarEvent[] = [];
    for (const e of visible) {
      if (showUnseenOnly && seenSnapshot.has(e.id)) continue; // 新着のみ＝未閲覧に絞る
      const ref = e.endDate || e.date || '';
      (ref && ref < today ? p : u).push(e);
    }
    return { past: p, upcoming: u };
  }, [visible, today, showUnseenOnly, seenSnapshot]);

  // 初回スクロール制御を1度だけ行うためのガード（フォロー作品の非同期ロードで
  // visible が後から埋まるため、内容が出揃ってから復元/今日への移動を実行する）
  // 初回スクロール制御。visible が出揃ってから1度だけ実行する。
  // 戻る(POP)なら保存位置へ復元、新規遷移(PUSH/REPLACE)なら今日へ。
  // 保存値は削除しない（再マウントしても navType=POP のまま復元できる）。
  const didInitScroll = useRef(false);
  useEffect(() => {
    if (!items || didInitScroll.current) return;
    if (visible.length === 0) return; // 内容が出るまで待機（次の再評価で実行）
    didInitScroll.current = true;
    const saved = sessionStorage.getItem('explore_scroll');
    if (navType === 'POP' && saved != null) {
      const top = parseInt(saved, 10);
      // 画像読み込み/レイアウト確定で高さが伸びるため、目標に届くまで最大2秒間再適用する。
      const start = performance.now();
      const tryScroll = () => {
        setScrollTop(top);
        if (Math.abs(getScrollTop() - top) > 2 && performance.now() - start < 2000) {
          requestAnimationFrame(tryScroll);
        }
      };
      requestAnimationFrame(tryScroll);
    } else {
      requestAnimationFrame(() => scrollToToday(false));
    }
  }, [items, visible.length, navType]); // eslint-disable-line react-hooks/exhaustive-deps

  // モード切り替え時は今日へ（初回マウントのガードとは別系統）
  const modeMountRef = useRef(true);
  useEffect(() => {
    if (modeMountRef.current) { modeMountRef.current = false; return; }
    if (items) requestAnimationFrame(() => scrollToToday(false));
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleIn = <T,>(setter: React.Dispatch<React.SetStateAction<Set<T>>>, v: T) => {
    haptic.select();
    setter((prev) => {
      const next = new Set(prev);
      next.has(v) ? next.delete(v) : next.add(v);
      return next;
    });
  };

  const clearFilters = () => {
    haptic.select();
    setSelectedStatuses(new Set()); setExcludedWorks(new Set()); setSelectedCategories(new Set());
    setSelectedPrefs(new Set()); setSelectedRegions(new Set()); setNeighborActive(false);
  };
  const activeCount = selectedStatuses.size + excludedWorks.size + selectedCategories.size + selectedPrefs.size + selectedRegions.size + (neighborActive ? 1 : 0);

  const onBuy = (e: CalendarEvent) => {
    haptic.select();
    const { url } = resolveBuy(e);
    if (url) window.open(url, '_blank', 'noopener');
  };

  const onLikeTile = async (e: CalendarEvent) => { haptic.select(); return user ? toggleLike(e.id, user.id) : undefined; };
  const onCalendarTile = async (e: CalendarEvent) => {
    haptic.select();
    const r = await addToCalendar(e);
    if (r !== 'fail' && user) toggleCalendarAdd(e.id, user.id).catch(() => {});
    toast(r === 'google' ? 'Googleカレンダーに追加しました' : r === 'ics' ? 'カレンダーに追加しました' : '日付未定のため追加できません');
  };

  const gridClass = mode === 'goods' ? 'grid grid-cols-2 gap-2 items-stretch' : 'flex flex-col gap-2';
  const renderCard = (e: CalendarEvent) => (
    <div key={e.id} ref={observeSeen} data-event-id={e.id}>
      <ItemCard event={e} layout={mode === 'goods' ? 'grid' : 'list'} isNew={isNewItem(e.id, e.createdAt, seenSnapshot)} likedInit={likedIds.has(e.id)}
        onOpen={() => { sessionStorage.setItem('explore_scroll', String(getScrollTop())); navigate(`/item/${e.id}`); }} onLike={() => onLikeTile(e)} onCalendar={() => onCalendarTile(e)} onBuy={() => onBuy(e)} />
    </div>
  );

  return (
    <div ref={pageRef} className="relative">
      <div ref={headerRef} className="px-3 pt-3 pb-2 sticky top-0 z-20" style={{ backgroundColor: 'var(--bg-primary)', paddingTop: `calc(env(safe-area-inset-top) + ${adH + 12}px)` }}>
        <div className="flex items-center gap-2">
          <div className="flex-1 flex items-center gap-2 px-3 rounded-[10px]" style={{ backgroundColor: 'var(--fill-tertiary)' }}>
            <Search size={16} className="text-label-tertiary flex-shrink-0" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="グッズ・イベントを検索"
              className="flex-1 bg-transparent py-2 text-[14px] outline-none"
              style={{ color: 'var(--input-text)' }}
            />
            {query && (
              <button onClick={() => setQuery('')} aria-label="クリア" className="pressable text-label-tertiary flex-shrink-0">
                <X size={16} />
              </button>
            )}
          </div>
          <button
            onClick={() => { haptic.select(); setFilterOpen((v) => !v); }}
            className="pressable flex items-center gap-1 px-3 py-2 rounded-[10px]"
            style={filterOpen || activeCount > 0
              ? { backgroundColor: 'var(--accent-color)', color: 'var(--accent-on)' }
              : { backgroundColor: 'var(--fill-tertiary)', color: 'var(--label-primary)' }}
            aria-label="絞り込み"
          >
            <SlidersHorizontal size={16} />
            {activeCount > 0 && <span className="text-[11px] font-bold">{activeCount}</span>}
          </button>
        </div>

        <div className="flex items-center gap-2 mt-2">
          <Chip active={mode === 'goods'} onClick={() => { haptic.select(); setMode('goods'); }}>グッズ</Chip>
          <Chip active={mode === 'event'} onClick={() => { haptic.select(); setMode('event'); }}>イベント</Chip>
          <Chip active={showUnseenOnly} onClick={() => { haptic.select(); setShowUnseenOnly((v) => !v); }}>新着のみ</Chip>
          {/* フィルターアクティブ時: パネルを開かずに確認・全クリアできるチップ */}
          {activeCount > 0 && !filterOpen && (
            <div className="ml-auto flex items-center gap-1 rounded-full border overflow-hidden flex-shrink-0"
              style={{ background: 'color-mix(in srgb, var(--accent-color) 12%, transparent)', borderColor: 'var(--accent-color)' }}>
              <button onClick={() => { haptic.select(); setFilterOpen(true); }}
                className="pl-2.5 pr-1 py-1 text-[11px] font-medium pressable"
                style={{ color: 'var(--accent-color)' }}>
                絞り込み中 {activeCount}件
              </button>
              <button onClick={() => { haptic.select(); clearFilters(); }}
                className="pr-2 py-1 text-[13px] font-medium pressable leading-none"
                style={{ color: 'var(--accent-color)' }}
                aria-label="絞り込みをクリア">×</button>
            </div>
          )}
        </div>

        {/* 検索が未フォロー作品にヒット → フォロー導線（検索バー直下で常に見える） */}
        {workMatches.some((w) => !followed.has(w.id)) && (
          <div className="mt-2 flex flex-col gap-1.5">
            {workMatches.filter((w) => !followed.has(w.id)).map((w) => (
              <div key={w.id} className="flex items-center justify-between gap-2 rounded-[10px] border border-subtle px-3 py-2" style={{ backgroundColor: 'var(--bg-secondary)' }}>
                <span className="text-[13px] font-semibold truncate">{w.name}<span className="text-[11px] text-label-tertiary"> ・未フォロー</span></span>
                <button onClick={() => toggleFollowWork(w)} className="pressable text-[12px] px-3 py-1 rounded-full font-medium flex-shrink-0"
                  style={{ backgroundColor: 'var(--accent-color)', color: 'var(--accent-on)' }}>＋フォロー</button>
              </div>
            ))}
          </div>
        )}

        {filterOpen && (
          <FilterPanel
            statuses={statusFacets} works={workFacets} categories={categoryFacets} prefectures={prefFacets} regions={regionFacets}
            selectedStatuses={selectedStatuses} selectedWorks={includedWorks} selectedCategories={selectedCategories} selectedPrefs={selectedPrefs} selectedRegions={selectedRegions}
            onToggleStatus={(k) => toggleIn(setSelectedStatuses, k)}
            onToggleWork={(k) => toggleIn(setExcludedWorks, k)}
            onToggleCategory={(k) => toggleIn(setSelectedCategories, k)}
            onTogglePref={(k) => toggleIn(setSelectedPrefs, k)}
            onToggleRegion={(k) => toggleIn(setSelectedRegions, k)}
            homePref={homePref} neighborActive={neighborActive} onToggleNeighbor={() => { haptic.select(); setNeighborActive((v) => !v); }}
            onClear={clearFilters} resultCount={visible.length}
          />
        )}
      </div>

      <div
        className="px-3 pb-4"
        onClickCapture={(e) => {
          // 絞り込みパネルを開いたまま下の予定をタップしたら、まずパネルを畳む（タップは詳細に伝播させない）
          if (filterOpen) { e.stopPropagation(); haptic.select(); setFilterOpen(false); }
        }}
      >
        {items === null ? (
          <SkeletonList count={4} />
        ) : visible.length === 0 ? (
          <p className="text-center text-label-secondary text-[13px] py-16">該当する{mode === 'goods' ? 'グッズ' : 'イベント'}がありません</p>
        ) : (
          <>
            {past.length > 0 && <div className={gridClass}>{past.map(renderCard)}</div>}
            <div ref={todayRef} className="flex items-center gap-2 py-3">
              <div className="flex-1 h-px" style={{ backgroundColor: 'var(--separator)' }} />
              <span className="text-[12px] font-semibold" style={{ color: 'var(--accent-text)' }}>今日 {today.slice(5).replace('-', '/')}</span>
              <div className="flex-1 h-px" style={{ backgroundColor: 'var(--separator)' }} />
            </div>
            {upcoming.length > 0
              ? <div className={gridClass}>{upcoming.map(renderCard)}</div>
              : <p className="text-center text-label-tertiary text-[12px] py-6">これからの{mode === 'goods' ? 'グッズ' : 'イベント'}はありません</p>}
          </>
        )}
      </div>

      {items && items.length > 0 && (
        <button
          onClick={() => { haptic.select(); scrollToToday(true); }}
          aria-label="今日へ"
          className="pressable fixed bottom-24 right-4 z-30 w-11 h-11 rounded-full flex items-center justify-center shadow-card"
          style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--label-primary)' }}
        >
          <ArrowDownToLine size={20} />
        </button>
      )}
    </div>
  );
}

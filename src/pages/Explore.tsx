import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useNavigate, useSearchParams, useNavigationType, useLocation } from 'react-router-dom';
import { ArrowDownToLine, ArrowLeftRight, Plus, SlidersHorizontal } from 'lucide-react';
import type { CalendarEvent } from '../types';
import ItemCard from '../components/item/ItemCard';
import FilterPanel, { type Facet } from '../components/item/FilterPanel';
import WorkFollowSheet from '../components/WorkFollowSheet';
import ExpandingSearch from '../components/ui/ExpandingSearch';
import WorkChipsRow from '../components/WorkChipsRow';
import { loadWorkImages } from '../lib/workImages';
import { SkeletonList } from '../components/ui/Skeleton';
import { deriveItemType, deriveStatus, todayStr, STATUS, type ItemStatus, type ItemType } from '../design/tokens';
import { listExploreEvents, getHomePrefecture, searchWorks, listAllParticipatedWorks, upsertParticipation, leaveCalendar, toggleLike, toggleCalendarAdd, listLikedEventIds, type Work } from '../lib/api';
import { parseCategories, loadSeenEventIds, saveSeenEventIds, isNewItem, GOODS_TAG } from '../lib/constants';
import { getCached, setCached } from '../lib/swrCache';
import { buildWorkColorMap } from '../lib/workColors';
import { logSearch } from '../lib/dataLogs';
import { addToCalendar } from '../lib/googleCalendar';
import { useToast } from '../components/ui/Toast';
import { REGIONS, ADJACENT } from '../lib/prefectures';
import { useAuth } from '../contexts/AuthContext';
import { useHiddenContent } from '../hooks/useHiddenContent';
import { haptic } from '../lib/haptics';
import { usePremium, canFollowMore, FREE_FOLLOW_LIMIT } from '../lib/premium';
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
  const { isHidden } = useHiddenContent(user?.id);
  const toast = useToast();
  const premium = usePremium();
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
  // 上部の作品の並びに出す、フォロー中の作品（名前つき）
  const [followedWorks, setFollowedWorks] = useState<Work[]>([]);
  const [workImages, setWorkImages] = useState<Record<string, string>>(loadWorkImages);
  useEffect(() => {
    const onChange = () => setWorkImages(loadWorkImages());
    window.addEventListener('fan-work-images', onChange);
    return () => window.removeEventListener('fan-work-images', onChange);
  }, []);
  const [followSheetOpen, setFollowSheetOpen] = useState(false);
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

  // 再適用ループの世代カウンタ。ユーザーが操作を始めたら／ページを離れたら
  // カウンタを進めて走行中のループを即座に打ち切り、スクロールの主導権を返す。
  // （中断しないと、最大2秒間ユーザーのスクロールと喧嘩する。さらにアンマウント後も
  //   rAFが生き残り、移動先ページ（カレンダー等）のスクロールを引っ張るバグになる）
  const scrollLoopGen = useRef(0);
  const cancelScrollLoops = useCallback(() => { scrollLoopGen.current += 1; }, []);
  useEffect(() => {
    const opts: AddEventListenerOptions = { passive: true, capture: true };
    const cancel = () => cancelScrollLoops();
    window.addEventListener('wheel', cancel, opts);
    window.addEventListener('touchstart', cancel, opts);
    window.addEventListener('keydown', cancel, opts);
    return () => {
      window.removeEventListener('wheel', cancel, opts);
      window.removeEventListener('touchstart', cancel, opts);
      window.removeEventListener('keydown', cancel, opts);
      cancelScrollLoops();
    };
  }, [cancelScrollLoops]);

  // 初回表示用: 画像読み込み等でレイアウトが伸びて「今日」がずれるため、
  // ヘッダー直下に揃うまで最大2秒間再適用する（保存位置の復元と同じ方式）。
  const scrollToTodayStable = () => {
    const start = performance.now();
    const gen = scrollLoopGen.current;
    const align = () => {
      if (gen !== scrollLoopGen.current) return; // ユーザー操作・離脱で中断
      const el = todayRef.current;
      const header = headerRef.current;
      if (!el || !header) return;
      const delta = el.getBoundingClientRect().top - (header.getBoundingClientRect().bottom + 6);
      if (Math.abs(delta) > 2) setScrollTop(getScrollTop() + delta);
      if (performance.now() - start < 2000) requestAnimationFrame(align);
    };
    requestAnimationFrame(align);
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
  // 見た予定が増えるたびに進める（未読の円を、スクロールに合わせて減らすため）
  const [seenTick, setSeenTick] = useState(0);
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
      if (changed) { saveSeenEventIds(seenIdsRef.current); setSeenTick((t) => t + 1); }
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

  // 広告バナー: ステータスバー直下に表示。ヘッダーの paddingTop を、ネイティブが実測した
  // バナー下端位置（env非依存）に合わせて広げ、不透明な余白の上にバナーを重ねる。
  // sticky ヘッダーがスクロール時のコンテンツ被りを防ぐ。Web版はバナー無しの余白のみ。
  const adPad = useAdBanner();

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

  const reloadFollows = () => {
    if (!user) return;
    const fkey = `follows:${user.id}`;
    const cachedF = getCached<Work[]>(fkey);
    if (cachedF) { setFollowed(new Set(cachedF.map((w) => w.id))); setFollowedWorks(cachedF); }
    listAllParticipatedWorks(user.id).then((ws) => { setFollowed(new Set(ws.map((w) => w.id))); setFollowedWorks(ws); setCached(fkey, ws); }).catch(() => {});
  };
  useEffect(() => { reloadFollows(); }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

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
    if (!user) return;
    const has = followed.has(w.id);
    // 解除は常に可。追加だけ無料プランの上限で止める（今フォロー中のものは取り上げない）
    if (!has && !canFollowMore(followed.size, premium)) {
      toast(`フォローは${FREE_FOLLOW_LIMIT}作品までです。今フォロー中の作品はそのまま使えます`);
      return;
    }
    haptic.select();
    setFollowed((prev) => { const n = new Set(prev); has ? n.delete(w.id) : n.add(w.id); return n; });
    setFollowedWorks((prev) => has ? prev.filter((x) => x.id !== w.id) : [...prev, w]);
    try { if (has) await leaveCalendar(w.id, user.id); else await upsertParticipation(w.id, user.id); } catch { /* noop */ }
  };

  // フォロー中の作品の予定だけ表示（新作品は検索→作品パネルからフォロー）。
  // グッズ表示では「グッズあり」カテゴリのイベントも一緒に出す（物販あり＝グッズ一覧にも載せる）。
  const modeItems = useMemo(
    () => (items ?? []).filter((e) => {
      if (!e.workId || !followed.has(e.workId)) return false;
      if (isHidden(e)) return false;
      if (mode === 'goods') return deriveItemType(e) === 'goods' || parseCategories(e.category).includes(GOODS_TAG);
      return deriveItemType(e) === 'event';
    }),
    [items, mode, followed, isHidden],
  );

  const queryItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return modeItems;
    return modeItems.filter((e) => `${e.title} ${e.workName ?? ''} ${e.category ?? ''}`.toLowerCase().includes(q));
  }, [modeItems, query]);

  // 検索クエリログ（データ資産化②の素材）: 入力が1秒落ち着いたらヒット件数つきで記録
  const queryCountRef = useRef(0);
  queryCountRef.current = queryItems.length;
  useEffect(() => {
    const q = query.trim();
    if (!q) return;
    const t = setTimeout(() => logSearch('explore', q, queryCountRef.current, user?.id), 1000);
    return () => clearTimeout(t);
  }, [query]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // 未読の円: 今の絞り込み（未読のみ 以外）をかけた一覧のうち、まだ見ていないものの割合
  const unread = useMemo(() => {
    const n = visible.filter((e) => !seenIdsRef.current.has(e.id)).length;
    return { n, total: visible.length };
  }, [visible, seenTick]); // eslint-disable-line react-hooks/exhaustive-deps

  // 今日起点: 過去（上）／これから（下）に分割（並びは取得順=日付昇順のまま）。
  // 「未読のみ」ON のときは閲覧済み（スナップショット）を除外する。
  const { past, upcoming } = useMemo(() => {
    const p: CalendarEvent[] = [];
    const u: CalendarEvent[] = [];
    for (const e of visible) {
      if (showUnseenOnly && seenSnapshot.has(e.id)) continue; // 未読のみ＝未閲覧に絞る
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
      // ユーザー操作・アンマウントで即中断（gen guard）。
      const start = performance.now();
      const gen = scrollLoopGen.current;
      const tryScroll = () => {
        if (gen !== scrollLoopGen.current) return;
        setScrollTop(top);
        if (Math.abs(getScrollTop() - top) > 2 && performance.now() - start < 2000) {
          requestAnimationFrame(tryScroll);
        }
      };
      requestAnimationFrame(tryScroll);
    } else {
      scrollToTodayStable();
    }
  }, [items, visible.length, navType]); // eslint-disable-line react-hooks/exhaustive-deps

  // モード切り替え時は今日へ（初回マウントのガードとは別系統）
  const modeMountRef = useRef(true);
  useEffect(() => {
    if (modeMountRef.current) { modeMountRef.current = false; return; }
    if (items) scrollToTodayStable();
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
  // 隠した作品は上の作品の並びで見えるので、絞り込みの数には入れない（カレンダーと同じ）
  const activeCount = selectedStatuses.size + selectedCategories.size + selectedPrefs.size + selectedRegions.size + (neighborActive ? 1 : 0);

  const onLikeTile = async (e: CalendarEvent) => { haptic.select(); return user ? toggleLike(e.id, user.id) : undefined; };
  const onCalendarTile = async (e: CalendarEvent) => {
    haptic.select();
    const r = await addToCalendar(e);
    if (r !== 'fail' && user) toggleCalendarAdd(e.id, user.id).catch(() => {});
    toast(r === 'google' ? 'Googleカレンダーに追加しました' : r === 'ics' ? 'カレンダーに追加しました' : '日付未定のため追加できません');
  };

  const gridClass = 'flex flex-col gap-2';
  const workColorMap = useMemo(() => buildWorkColorMap([...followed].map((id) => ({ id }))), [followed]);

  // content-visibility: 画面外カードの描画・レイアウト計算をスキップして長いリストを軽くする。
  // containIntrinsicSize は未描画時の高さの見積もり（スクロールバー・復元位置の安定用）。
  const renderCard = (e: CalendarEvent) => (
    <div key={e.id} ref={observeSeen} data-event-id={e.id}
      style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 196px' }}>
      <ItemCard event={e} layout={mode === 'goods' ? 'wide' : 'list'} isNew={isNewItem(e.id, e.createdAt, seenSnapshot)} likedInit={likedIds.has(e.id)}
        workColor={e.workId ? (workColorMap.get(e.workId) ?? 'var(--accent-color)') : 'var(--accent-color)'}
        onOpen={() => { sessionStorage.setItem('explore_scroll', String(getScrollTop())); navigate(`/item/${e.id}`); }} onLike={() => onLikeTile(e)} onCalendar={() => onCalendarTile(e)} />
    </div>
  );

  return (
    <div ref={pageRef} className="relative">
      <div ref={headerRef} className="px-3 pt-3 pb-3 sticky top-0 z-20 material-bar scroll-edge" data-skin-bar="main" style={{ paddingTop: adPad }}>
        {/* 上段: 見出し・検索（虫眼鏡から広がる）・グッズ⇄イベント・未読・絞り込み */}
        <div className="flex items-center gap-2">
          <ExpandingSearch value={query} onChange={setQuery} placeholder={mode === 'goods' ? 'グッズを検索' : 'イベントを検索'}
            title={<span className="text-[22px] font-bold tracking-tight">探す</span>} />
          <ModeToggle mode={mode} onToggle={() => { haptic.select(); setMode((m) => (m === 'goods' ? 'event' : 'goods')); }} />
          <UnreadButton unread={unread.n} total={unread.total} active={showUnseenOnly}
            onClick={() => { haptic.select(); setShowUnseenOnly((v) => !v); }} />
          <button onClick={() => { haptic.select(); setFilterOpen((v) => !v); }}
            aria-label="絞り込み" aria-pressed={filterOpen}
            className="pressable relative w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
            style={filterOpen || activeCount > 0
              ? { backgroundColor: 'var(--accent-color)', color: 'var(--accent-on)' }
              : { backgroundColor: 'var(--fill-tertiary)', color: 'var(--label-primary)' }}>
            <SlidersHorizontal size={17} />
            {activeCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full text-[10px] font-bold leading-4 text-center"
                style={{ backgroundColor: 'var(--label-primary)', color: 'var(--bg-primary)' }}>{activeCount}</span>
            )}
          </button>
        </div>

        {/* 下段: 作品の並び（カレンダーと同じ。押すとその作品を隠す）＋ 作品を足す */}
        <WorkChipsRow works={followedWorks} colors={workColorMap} images={workImages} excluded={excludedWorks}
          onToggle={(id) => toggleIn(setExcludedWorks, id)} onShowAll={() => setExcludedWorks(new Set())}
          trailing={
            <button onClick={() => { haptic.select(); setFollowSheetOpen(true); }}
              className="pressable flex-shrink-0 flex items-center gap-0.5 h-7 px-2.5 rounded-full text-[12px] font-medium whitespace-nowrap border border-dashed"
              style={{ borderColor: 'var(--accent-color)', color: 'var(--accent-text)' }}>
              <Plus size={13} /> 作品
            </button>
          } />

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
            statuses={statusFacets} works={[]} categories={categoryFacets} prefectures={prefFacets} regions={regionFacets}
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
          followed.size === 0 ? (
            <div className="text-center py-16">
              <p className="text-label-secondary text-[13px]">まずは好きな作品をフォローすると、<br />みんなの投稿した予定がここに表示されます</p>
              <button onClick={() => { haptic.select(); setFollowSheetOpen(true); }}
                className="pressable mt-4 inline-flex items-center gap-1 px-4 py-2 rounded-full text-[14px] font-semibold"
                style={{ backgroundColor: 'var(--accent-color)', color: 'var(--accent-on)' }}>
                <Plus size={16} /> 作品をフォロー
              </button>
            </div>
          ) : (
            <p className="text-center text-label-secondary text-[13px] py-16">該当する{mode === 'goods' ? 'グッズ' : 'イベント'}がありません</p>
          )
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
          className="pressable material-thick fixed right-4 z-30 w-11 h-11 rounded-full flex items-center justify-center shadow-float"
          style={{ color: 'var(--label-primary)', bottom: 'calc(env(safe-area-inset-bottom) + 92px)' }}
        >
          <ArrowDownToLine size={20} />
        </button>
      )}

      <WorkFollowSheet open={followSheetOpen} onClose={() => setFollowSheetOpen(false)} onChanged={reloadFollows} />
    </div>
  );
}

/** 「グッズ ⇄」。今見ている方だけを書き、押すともう片方に切り替わる。
 *  文字は下からふわっと入れ替え、⇄ は半回転させて「切り替わった」を見せる */
function ModeToggle({ mode, onToggle }: { mode: ItemType; onToggle: () => void }) {
  const [turns, setTurns] = useState(0);
  return (
    <button onClick={() => { setTurns((t) => t + 1); onToggle(); }} aria-label={`${mode === 'goods' ? 'グッズ' : 'イベント'}を表示中。押すと切り替え`}
      className="pressable flex-shrink-0 h-9 w-[92px] rounded-full flex items-center justify-center gap-1 overflow-hidden"
      style={{ backgroundColor: 'var(--fill-tertiary)', color: 'var(--label-primary)' }}>
      <span key={mode} className="text-[13px] font-semibold"
        style={{ animation: turns ? 'labelSwap 0.34s cubic-bezier(0.32,0.72,0,1) both' : undefined }}>
        {mode === 'goods' ? 'グッズ' : 'イベント'}
      </span>
      <ArrowLeftRight size={13} className="text-label-secondary"
        style={{ transform: `rotate(${turns * 180}deg)`, transition: 'transform 0.45s cubic-bezier(0.34,1.3,0.64,1)' }} />
    </button>
  );
}

/** 「未読」を囲む円。円の埋まり具合＝まだ見ていない予定の割合。読み終わると円は消える。
 *  押すと未読のみ表示（ON の間は地の色を付ける） */
function UnreadButton({ unread, total, active, onClick }: { unread: number; total: number; active: boolean; onClick: () => void }) {
  const R = 15.5;
  const C = 2 * Math.PI * R;
  const ratio = total > 0 ? unread / total : 0;
  return (
    <button onClick={onClick} aria-pressed={active}
      aria-label={unread > 0 ? `未読のみ表示（未読${unread}件）` : '未読のみ表示'}
      className="pressable relative flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center"
      style={{ backgroundColor: active ? 'color-mix(in srgb, var(--accent-color) 24%, transparent)' : 'var(--fill-tertiary)' }}>
      <svg className="absolute inset-0" viewBox="0 0 36 36" aria-hidden
        style={{ opacity: unread > 0 ? 1 : 0, transition: 'opacity 0.4s ease' }}>
        <circle cx="18" cy="18" r={R} fill="none" stroke="var(--fill-secondary, rgba(120,120,128,0.2))" strokeWidth="2.5" />
        <circle cx="18" cy="18" r={R} fill="none" stroke="var(--accent-color)" strokeWidth="2.5" strokeLinecap="round"
          strokeDasharray={C} strokeDashoffset={C * (1 - ratio)} transform="rotate(-90 18 18)"
          style={{ transition: 'stroke-dashoffset 0.6s cubic-bezier(0.32,0.72,0,1)' }} />
      </svg>
      <span className="relative text-[10px] font-bold"
        style={{ color: active ? 'var(--accent-text)' : unread > 0 ? 'var(--label-primary)' : 'var(--label-tertiary)' }}>未読</span>
    </button>
  );
}

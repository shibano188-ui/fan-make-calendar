import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { SlidersHorizontal, Crown, Palette, CalendarDays, CalendarRange, Calendar, List, Check, CalendarPlus } from 'lucide-react';
import type { CalendarEvent } from '../types';
import ItemCard from '../components/item/ItemCard';
import Chip from '../components/ui/Chip';
import WorkChipsRow from '../components/WorkChipsRow';
import { loadSharedFilters, saveSharedFilters } from '../lib/sharedFilters';
import ExpandingSearch, { SearchSideButtons } from '../components/ui/ExpandingSearch';
import { useTyping } from '../hooks/useTyping';
import SavedCalendar, { periodLabel, includesToday } from '../components/SavedCalendar';
import FilterPanel, { type Facet } from '../components/item/FilterPanel';
import { SkeletonList } from '../components/ui/Skeleton';
import { deriveStatus, todayStr, STATUS, type ItemStatus } from '../design/tokens';
import { getHomePrefecture, toggleLike, toggleCalendarAdd, listAllParticipatedWorks, type Work } from '../lib/api';
import { loadWorkImages } from '../lib/workImages';
import { useTheme } from '../contexts/ThemeContext';
import { peekSaved, loadSaved, updateSaved } from '../lib/savedStore';
import { parseCategories, isNotifyOn } from '../lib/constants';
import { buildWorkColorMap } from '../lib/workColors';
import { logSearch } from '../lib/dataLogs';
import { addToCalendar } from '../lib/googleCalendar';
import { useAuth } from '../contexts/AuthContext';
import { useHiddenContent } from '../hooks/useHiddenContent';
import { useToast } from '../components/ui/Toast';
import { REGIONS, ADJACENT } from '../lib/prefectures';
import { haptic } from '../lib/haptics';
import { usePremium } from '../lib/premium';
import { useTourStep, tourEventId, tourLikedEvent } from '../components/OnboardingTour';

// 「予約受付中」は状態の選択肢と重なるので外した（前に選んでいた人は「すべて」に戻る）
type Tab = 'all' | 'mine' | 'notify';
type View = 'list' | 'month' | 'week' | 'day';

const VIEWS: { key: View; label: string; icon: typeof Calendar }[] = [
  { key: 'month', label: '月', icon: CalendarDays },
  { key: 'week', label: '週', icon: CalendarRange },
  { key: 'day', label: '日', icon: Calendar },
  { key: 'list', label: 'リスト', icon: List },
];

const FOLLOWED_KEY = 'fan_followed_works_v1';

const STATUS_ORDER: ItemStatus[] = ['preorder_soon', 'preorder', 'sale_soon', 'onsale', 'preorder_ended', 'ended', 'soldout'];

const PREF_TO_REGION: Record<string, string> = {};
for (const r of REGIONS) for (const p of r.prefectures) PREF_TO_REGION[p] = r.name;

function loadSavedSession() {
  try { return JSON.parse(sessionStorage.getItem('saved_filters') ?? '{}'); } catch { return {}; }
}

export default function Saved() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isHidden } = useHiddenContent(user?.id);
  const toast = useToast();
  // 作品・状態・カテゴリ・地域・近くの は、ホーム・探す・カレンダーで共通（lib/sharedFilters.ts）
  const _sf = loadSharedFilters();
  const _ss = loadSavedSession();
  // 覚えている予定があれば最初の描画から出す（詳細から戻ったときに読み込み表示を挟まない）
  const [items, setItems] = useState<CalendarEvent[] | null>(() => (user ? peekSaved(user.id) : null));
  const [tab, setTab] = useState<Tab>(['all', 'mine', 'notify'].includes(_ss.tab) ? _ss.tab : 'all');
  const [view, setView] = useState<View>(_ss.view ?? 'month');
  // 表示切替のメニューの位置（開いているときだけ）。上部バーは下端をぼかす mask で
  // はみ出した部分が消えるので、メニューは body に出して画面の座標で置く
  const [viewMenuAt, setViewMenuAt] = useState<{ top: number; right: number } | null>(null);
  // 表示中の月・週・日。見出しと「今日」ボタンのためにここで持つ
  const [anchor, setAnchor] = useState<string>(todayStr());
  const premium = usePremium();
  // 月表示は1画面に収めて、下へスクロールできないようにする
  const monthFit = view === 'month';
  useEffect(() => {
    if (!monthFit) return;
    const html = document.documentElement, body = document.body;
    const prev = [html.style.overflow, body.style.overflow];
    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    window.scrollTo(0, 0);
    return () => { html.style.overflow = prev[0]; body.style.overflow = prev[1]; };
  }, [monthFit]);

  // 探すと同じ絞り込み
  const [query, setQuery] = useState<string>(_ss.query ?? '');
  const sideRef = useRef<HTMLDivElement>(null);
  const [filterOpen, setFilterOpen] = useState<boolean>(_ss.filterOpen ?? false);
  // 上部の作品の並び（TimeTree 風）。フォロー中の作品だけを出し、押すとその作品を隠す（もう一度で戻す）
  // 前回の並びを覚えておき、最初の描画から出す（後から出ると、カレンダーが1段下にずれて見える）
  const [followedWorks, setFollowedWorks] = useState<Work[]>(() => {
    try { return JSON.parse(localStorage.getItem(FOLLOWED_KEY) ?? '[]') as Work[]; } catch { return []; }
  });
  const [workImages, setWorkImages] = useState<Record<string, string>>(loadWorkImages);
  useEffect(() => {
    if (!user) return;
    listAllParticipatedWorks(user.id).then((ws) => {
      setFollowedWorks(ws);
      try { localStorage.setItem(FOLLOWED_KEY, JSON.stringify(ws)); } catch { /* 表示は続ける */ }
    }).catch(() => {});
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const onChange = () => setWorkImages(loadWorkImages());
    window.addEventListener('fan-work-images', onChange);
    return () => window.removeEventListener('fan-work-images', onChange);
  }, []);

  // 絞り込みはカレンダーの上に重ねて出す（開いてもカレンダーの大きさを変えない）。
  // 上部バーの下端から出すので、開いたときにバーの位置を測る
  const headerRef = useRef<HTMLDivElement>(null);
  const [filterTop, setFilterTop] = useState(0);
  useLayoutEffect(() => {
    if (filterOpen && headerRef.current) setFilterTop(headerRef.current.getBoundingClientRect().bottom);
  }, [filterOpen]);
  const [selectedStatuses, setSelectedStatuses] = useState<Set<string>>(new Set(_sf.statuses));
  const [excludedWorks, setExcludedWorks] = useState<Set<string>>(new Set(_sf.excludedWorks));
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set(_sf.categories));
  const [selectedPrefs, setSelectedPrefs] = useState<Set<string>>(new Set(_sf.prefs));
  const [selectedRegions, setSelectedRegions] = useState<Set<string>>(new Set(_sf.regions));
  const [neighborActive, setNeighborActive] = useState<boolean>(_sf.neighborActive);
  const [homePref, setHomePref] = useState<string | null>(null);

  const today = todayStr();

  // 見出し（2026年12月）が「今日」ボタンに押されて切れないよう、入りきる大きさまで文字を小さくする。
  // 幅390pxで今月以外を見ると「2026年1…」になり、何月か読めなかった（2026-10-01）
  const titleRef = useRef<HTMLHeadingElement>(null);
  const titleText = view === 'list' ? '保存した予定' : periodLabel(view, anchor);
  const showToday = view !== 'list' && !includesToday(view, anchor, today);
  useLayoutEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    // scrollWidth は整数に丸まるので、1px 未満のはみ出し（それでも「…」になる）を見逃す。文字そのものの幅で比べる
    const range = document.createRange();
    const overflows = () => {
      range.selectNodeContents(el);
      return range.getBoundingClientRect().width > el.getBoundingClientRect().width + 0.1;
    };
    const fit = () => {
      let size = 20;
      el.style.fontSize = '';
      while (overflows() && size > 13) { size -= 1; el.style.fontSize = `${size}px`; }
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [titleText, showToday, premium]);
  const rootRef = useRef<HTMLDivElement>(null);

  // フィルター状態を sessionStorage に同期（詳細から戻っても維持）
  useEffect(() => {
    sessionStorage.setItem('saved_filters', JSON.stringify({
      tab, view, query, filterOpen,
      statuses: [...selectedStatuses], excludedWorks: [...excludedWorks], categories: [...selectedCategories],
      prefs: [...selectedPrefs], regions: [...selectedRegions], neighborActive,
    }));
    saveSharedFilters({
      statuses: [...selectedStatuses], excludedWorks: [...excludedWorks], categories: [...selectedCategories],
      prefs: [...selectedPrefs], regions: [...selectedRegions], neighborActive,
    });
  }, [tab, view, query, filterOpen, selectedStatuses, excludedWorks, selectedCategories, selectedPrefs, selectedRegions, neighborActive]);

  // 開いたら最上部から表示
  useEffect(() => {
    let el = rootRef.current?.parentElement as HTMLElement | null;
    while (el) {
      const oy = getComputedStyle(el).overflowY;
      if (oy === 'auto' || oy === 'scroll') el.scrollTop = 0;
      el = el.parentElement;
    }
    window.scrollTo(0, 0);
  }, [items === null]);

  // カレンダーの画面にいる間だけ、作品ごとの見た目を効かせる（ほかの画面はデフォルト）
  const { setLookActive } = useTheme();
  useEffect(() => {
    setLookActive(true);
    return () => setLookActive(false);
  }, [setLookActive]);

  // 表示するのは保存した予定だけ（自分の投稿でも、保存していなければ出ない）
  useEffect(() => {
    if (!user) return;
    let alive = true;
    // 覚えている分を先に出し、裏で取り直して差し替える。地元の県は予定の表示を待たせない
    const cached = peekSaved(user.id);
    if (cached) setItems(cached);
    loadSaved(user.id)
      .then((d) => { if (alive) setItems(d); })
      .catch(() => { if (alive && !cached) setItems([]); });
    getHomePrefecture(user.id).then((hp) => { if (alive) setHomePref(hp); }).catch(() => {});
    return () => { alive = false; };
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // いいねトグル: 解除＝カレンダーから外す（自分の投稿も同じ）
  const onLike = async (e: CalendarEvent) => {
    haptic.select();
    if (!user) return;
    const r = await toggleLike(e.id, user.id);
    const apply = (list: CalendarEvent[]) => list.flatMap((it) => {
      if (it.id !== e.id) return [it];
      if (!r.liked) return [];
      return [{ ...it, likedByMe: r.liked, likes: r.count }];
    });
    setItems((prev) => (prev ? apply(prev) : prev));
    updateSaved(user.id, apply);
  };

  // 保存中の予定に出てくる作品の色マップ（未割当はパレットから付与して永続化）
  const workColorMap = useMemo(() => {
    const works = Array.from(
      new Map((items ?? []).filter((e) => e.workId).map((e) => [e.workId!, { id: e.workId! }])).values(),
    );
    return buildWorkColorMap(works);
  }, [items]);

  // 作品の並びの四角の色。カレンダーの帯と同じ保存先なので、同じ作品は同じ色になる
  const followedColor = useMemo(() => buildWorkColorMap(followedWorks), [followedWorks]);

  // スコープ（すべて / いいね / 自分の投稿）→ 検索語 で絞った集合
  const scopeItems = useMemo(() => {
    let list = (items ?? []).filter((e) => !isHidden(e));
    if (tab === 'mine') list = list.filter((e) => e.authorId === user?.id);
    if (tab === 'notify') list = list.filter((e) => isNotifyOn(e.id));
    const q = query.trim().toLowerCase();
    if (q) list = list.filter((e) => `${e.title} ${e.workName ?? ''} ${e.category ?? ''}`.toLowerCase().includes(q));
    return list;
  }, [items, tab, user?.id, query, isHidden]);

  // 検索クエリログ（データ資産化②の素材）
  const queryCountRef = useRef(0);
  queryCountRef.current = scopeItems.length;
  useEffect(() => {
    const q = query.trim();
    if (!q) return;
    const t = setTimeout(() => logSearch('saved', q, queryCountRef.current, user?.id), 1000);
    return () => clearTimeout(t);
  }, [query]); // eslint-disable-line react-hooks/exhaustive-deps

  // ファセット件数（探すと同じ算出）
  const statusFacets: Facet[] = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of scopeItems) { const s = deriveStatus(e); m.set(s, (m.get(s) ?? 0) + 1); }
    return STATUS_ORDER.filter((s) => m.has(s)).map((s) => ({ key: s, label: STATUS[s].goodsLabel, count: m.get(s)! }));
  }, [scopeItems]);

  const workFacets: Facet[] = useMemo(() => {
    const m = new Map<string, Facet>();
    for (const e of scopeItems) {
      if (!e.workId) continue;
      const f = m.get(e.workId);
      if (f) f.count++; else m.set(e.workId, { key: e.workId, label: e.workName || '作品', count: 1 });
    }
    return [...m.values()].sort((a, b) => b.count - a.count);
  }, [scopeItems]);

  const categoryFacets: Facet[] = useMemo(() => {
    const m = new Map<string, Facet>();
    for (const e of scopeItems) {
      for (const c of parseCategories(e.category)) {
        if (c === 'グッズ') continue;
        const f = m.get(c);
        if (f) f.count++; else m.set(c, { key: c, label: c, count: 1 });
      }
    }
    return [...m.values()].sort((a, b) => b.count - a.count);
  }, [scopeItems]);

  const prefFacets: Facet[] = useMemo(() => {
    const m = new Map<string, Facet>();
    for (const e of scopeItems) {
      if (!e.prefecture) continue;
      const f = m.get(e.prefecture);
      if (f) f.count++; else m.set(e.prefecture, { key: e.prefecture, label: e.prefecture, count: 1 });
    }
    return [...m.values()].sort((a, b) => b.count - a.count);
  }, [scopeItems]);

  const regionFacets: Facet[] = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of scopeItems) {
      const reg = e.prefecture ? PREF_TO_REGION[e.prefecture] : undefined;
      if (reg) m.set(reg, (m.get(reg) ?? 0) + 1);
    }
    return REGIONS.filter((r) => m.has(r.name)).map((r) => ({ key: r.name, label: r.name, count: m.get(r.name)! }));
  }, [scopeItems]);

  const allowedPrefs = useMemo(() => {
    const s = new Set<string>();
    for (const r of selectedRegions) REGIONS.find((x) => x.name === r)?.prefectures.forEach((p) => s.add(p));
    for (const p of selectedPrefs) s.add(p);
    if (neighborActive && homePref) { s.add(homePref); (ADJACENT[homePref] ?? []).forEach((p) => s.add(p)); }
    return s;
  }, [selectedRegions, selectedPrefs, neighborActive, homePref]);

  // 作品チップは「除外モデル」: 既定は全部ON＝全表示、押すと除外
  const includedWorks = useMemo(
    () => new Set(workFacets.filter((f) => !excludedWorks.has(f.key)).map((f) => f.key)),
    [workFacets, excludedWorks],
  );

  // 絞り込み適用後の最終集合（カレンダー/リスト共通）
  const filtered = useMemo(() => {
    return scopeItems.filter((e) => {
      if (selectedStatuses.size && !selectedStatuses.has(deriveStatus(e))) return false;
      if (e.workId && excludedWorks.has(e.workId)) return false;
      if (selectedCategories.size && !parseCategories(e.category).some((c) => selectedCategories.has(c))) return false;
      if (allowedPrefs.size && (!e.prefecture || !allowedPrefs.has(e.prefecture))) return false;
      return true;
    });
  }, [scopeItems, selectedStatuses, excludedWorks, selectedCategories, allowedPrefs]);

  // 自分用の予定は詳細ページが無いので、押したら編集を開く
  const openItem = (e: CalendarEvent) => navigate(e.personal ? `/personal/${e.id}` : `/item/${e.id}`);

  // オンボーディングの案内（OnboardingTour）で、いいねした予定を見せているところ。
  // 絞り込み・タブに関係なく必ず出し、その日のパネルを開いたままにする
  const tourStep = useTourStep();
  const tourId = tourStep === 'calendar' || tourStep === 'bell' || tourStep === 'done' ? tourEventId() : null;
  // いいねの保存が届く前に取り直すことがあるので、無ければ案内が持っている予定を使う
  const tourEvent = tourId ? (items?.find((e) => e.id === tourId) ?? (tourLikedEvent()?.id === tourId ? tourLikedEvent()! : undefined)) : undefined;
  const shown = useMemo(
    () => (tourEvent && !filtered.some((e) => e.id === tourEvent.id) ? [...filtered, tourEvent] : filtered),
    [filtered, tourEvent],
  );
  const tourDay = tourEvent ? focusDayOf(tourEvent, today) : null;
  useEffect(() => {
    if (!tourEvent) return;
    // 日付の無い予定はカレンダーに乗らないので、リスト表示で見せる
    if (tourDay) { setView('month'); setAnchor(tourDay); } else setView('list');
  }, [tourEvent?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // リスト表示: 近い順（これから昇順 → 過去降順）
  const listItems = useMemo(() => {
    const ref = (e: CalendarEvent) => e.endDate || e.date || '';
    const up = shown.filter((e) => !ref(e) || ref(e) >= today).sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999'));
    const past = shown.filter((e) => ref(e) && ref(e) < today).sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
    return [...up, ...past];
  }, [shown, today]);

  const toggleIn = <T,>(setter: React.Dispatch<React.SetStateAction<Set<T>>>, v: T) => {
    haptic.select();
    setter((prev) => { const n = new Set(prev); n.has(v) ? n.delete(v) : n.add(v); return n; });
  };
  const clearFilters = () => {
    haptic.select();
    setSelectedStatuses(new Set()); setSelectedCategories(new Set());
    setSelectedPrefs(new Set()); setSelectedRegions(new Set()); setNeighborActive(false);
  };
  // 作品は上の並びで切り替えるので、絞り込みの件数には数えない
  const facetCount = selectedStatuses.size + selectedCategories.size + selectedPrefs.size + selectedRegions.size + (neighborActive ? 1 : 0);

  const onCalendar = async (e: CalendarEvent) => {
    haptic.select();
    const r = await addToCalendar(e);
    if (r !== 'fail' && user) toggleCalendarAdd(e.id, user.id).catch(() => {});
    toast(r === 'google' ? 'Googleカレンダーに追加しました' : r === 'ics' ? 'カレンダーに追加しました' : '日付未定のため追加できません');
  };

  // 絞り込みボタンに出す件数。すべて/自分の投稿… も数える（検索は上の検索欄に文字が見えているので数えない）
  const activeCount = facetCount + (tab !== 'all' ? 1 : 0);
  const clearAll = () => { clearFilters(); setTab('all'); };

  const emptyMsg = tab === 'mine' ? 'まだ投稿がありません' : '保存した予定がありません';

  const typing = useTyping();
  const screenH = useRef(window.innerHeight);
  if (!typing) screenH.current = window.innerHeight;

  return (
    // ⚠️ ルートに上の余白を付けないこと。上部バーは自分で var(--sat) を持っているので、
    // ここに余白を足すと**帯の外側に地の色の帯**ができる（外皮で帯の色が変わると目立つ）
    // 月表示は画面ぴったり（下の浮遊ナビの上端まで）にして、ページごとスクロールさせない。
    // 76px = ナビの下の余白10px + ナビの高さ約56px + 隙間
    <div ref={rootRef} className={monthFit ? 'px-3 flex flex-col overflow-hidden' : 'px-3'}
      // 外枠（AppShell の main）が下に 7rem の逃げを持っているので、そのぶん下の余白を打ち消して
      // ページ全体の高さを画面ぴったりにする（はみ出すと、少しだけ下にスクロールできてしまう）
      style={monthFit ? {
        // 入力中は Android で画面がキーボードの分だけ縮むので、縮む前の高さのまま止める（カレンダーはキーボードに隠れてよい）
        height: typing ? `calc(${screenH.current}px - env(safe-area-inset-bottom) - 76px)` : 'calc(100dvh - env(safe-area-inset-bottom) - 76px)',
        marginBottom: 'calc(env(safe-area-inset-bottom) + 76px - 7rem)',
      } : undefined}>
      <div ref={headerRef} className="sticky top-0 z-20 flex-shrink-0 -mx-3 px-3 pt-1 pb-2 material-bar scroll-edge" data-skin-bar="main" style={{ paddingTop: 'calc(var(--sat) + 4px)' }}>
        {/* 1行だけ: 見出し（＋今日）／プレミアム／表示切替／カスタマイズ／絞り込み。文字は見出しだけで、ボタンはアイコンのみ */}
        <div className="flex items-center gap-1.5 h-10">
          {/* 見出し（＋今日）。右端の虫眼鏡を押すと、見出しと入れ替わって検索欄に広がる */}
          <ExpandingSearch value={query} onChange={setQuery} placeholder="保存した予定を検索" sideRef={sideRef}
            title={
              <div className="flex items-center gap-1.5 min-w-0">
                <h1 ref={titleRef} className="text-[20px] font-bold tracking-tight truncate">
                  {titleText}
                </h1>
                {/* 今日を含まない期間を見ているときだけ出す */}
                {showToday && (
                  <button onClick={() => { haptic.select(); setAnchor(today); }}
                    className="pressable flex-shrink-0 text-[12px] font-semibold px-2 py-1 rounded-full"
                    style={{ backgroundColor: 'var(--fill-tertiary)', color: 'var(--label-primary)' }}>
                    今日
                  </button>
                )}
              </div>
            } />

          <SearchSideButtons ref={sideRef} gap={6}>
          {!premium && (
            <IconButton label="プレミアム" onClick={() => navigate('/premium')}>
              <Crown size={18} />
            </IconButton>
          )}

          <IconButton label="表示を切り替える" pressed={!!viewMenuAt}
            onClick={(el) => {
              const r = el.getBoundingClientRect();
              setViewMenuAt((cur) => (cur ? null : { top: r.bottom + 6, right: window.innerWidth - r.right }));
            }}>
            {(() => { const I = VIEWS.find((v) => v.key === view)?.icon ?? CalendarDays; return <I size={18} />; })()}
          </IconButton>
          {viewMenuAt && createPortal(
            <>
              <div className="fixed inset-0" style={{ zIndex: 200 }} onClick={() => setViewMenuAt(null)} />
              <div className="fixed min-w-[132px] rounded-[12px] py-1 shadow-float border border-subtle" role="menu"
                style={{ zIndex: 201, top: viewMenuAt.top, right: viewMenuAt.right, backgroundColor: 'var(--bg-primary)' }}>
                {VIEWS.map((v) => (
                  <button key={v.key} role="menuitemradio" aria-checked={view === v.key}
                    onClick={() => { haptic.select(); setView(v.key); setViewMenuAt(null); }}
                    className="pressable w-full flex items-center gap-2.5 px-3 py-2 text-[14px] text-left">
                    <v.icon size={16} className="text-label-secondary" />
                    <span className="flex-1">{v.label}</span>
                    {view === v.key && <Check size={16} style={{ color: 'var(--accent-color)' }} />}
                  </button>
                ))}
              </div>
            </>,
            document.body,
          )}

          <IconButton label="カスタマイズ" onClick={() => navigate('/customize')}>
            <Palette size={18} />
          </IconButton>

          <IconButton label="絞り込み" pressed={filterOpen} active={activeCount > 0}
            onClick={() => setFilterOpen((v) => !v)}>
            <SlidersHorizontal size={18} />
            {activeCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full text-[10px] font-bold leading-4 text-center"
                style={{ backgroundColor: 'var(--accent-color)', color: 'var(--accent-on)' }}>{activeCount}</span>
            )}
          </IconButton>
          </SearchSideButtons>
        </div>

        {/* 作品の並び。入りきらない分は右端の︾で広げて選ぶ */}
        {followedWorks.length > 0 && (
          <WorkChipsRow works={followedWorks} colors={followedColor} images={workImages} excluded={excludedWorks}
            onToggle={(id) => toggleIn(setExcludedWorks, id)} onShowAll={() => setExcludedWorks(new Set())} />
        )}
      </div>


      {/* 絞り込み: 対象（すべて/自分の投稿/通知ON）・細かい条件をここにまとめる */}
      {filterOpen && createPortal(
        <>
          {/* 外を押したら閉じる。カレンダーが透けて見える程度に暗くする */}
          <div className="fixed inset-0" style={{ zIndex: 90, top: filterTop, backgroundColor: 'rgba(0,0,0,0.25)' }}
            onClick={() => setFilterOpen(false)} />
          {/* 上部バーは下端を mask でぼかしていて、はみ出した部分が消えるので body に出す */}
          <div className="fixed inset-x-0 max-w-app mx-auto px-3 pt-2 pb-3 rounded-b-[16px] shadow-float overflow-y-auto overscroll-contain"
            style={{ zIndex: 91, top: filterTop, maxHeight: `calc(100dvh - ${filterTop}px - 110px)`, backgroundColor: 'var(--bg-primary)' }}>
            <div className="flex items-center flex-wrap gap-2 mb-1">
              <Chip active={tab === 'all'} onClick={() => { haptic.select(); setTab('all'); }}>すべて</Chip>
              <Chip active={tab === 'mine'} onClick={() => { haptic.select(); setTab('mine'); }}>自分の投稿</Chip>
              <Chip active={tab === 'notify'} onClick={() => { haptic.select(); setTab('notify'); }}>通知ON</Chip>
              {activeCount > 0 && (
                <button onClick={() => { haptic.select(); clearAll(); }}
                  className="ml-auto text-[12px] font-medium pressable px-1" style={{ color: 'var(--accent-color)' }}>
                  すべて解除
                </button>
              )}
            </div>
            <FilterPanel
              statuses={statusFacets} works={[]} categories={categoryFacets} prefectures={prefFacets} regions={regionFacets}
              selectedStatuses={selectedStatuses} selectedWorks={includedWorks} selectedCategories={selectedCategories} selectedPrefs={selectedPrefs} selectedRegions={selectedRegions}
              onToggleStatus={(k) => toggleIn(setSelectedStatuses, k)}
              onToggleWork={(k) => toggleIn(setExcludedWorks, k)}
              onToggleCategory={(k) => toggleIn(setSelectedCategories, k)}
              onTogglePref={(k) => toggleIn(setSelectedPrefs, k)}
              onToggleRegion={(k) => toggleIn(setSelectedRegions, k)}
              homePref={homePref} neighborActive={neighborActive} onToggleNeighbor={() => { haptic.select(); setNeighborActive((v) => !v); }}
              onClear={clearFilters} resultCount={filtered.length}
            />
          </div>
        </>,
        document.body,
      )}

      {items === null && !tourEvent ? (
        <SkeletonList count={4} />
      ) : view !== 'list' ? (
        // カレンダー（月/週/日）は予定が0件でも枠を表示する
        <SavedCalendar events={shown} scope={view} anchor={anchor} setAnchor={setAnchor} focusDay={tourDay}
          onOpen={openItem} onLike={onLike} onCalendar={onCalendar}
          onAdd={(day) => navigate(`/personal/new?date=${day}`)} />
      ) : listItems.length === 0 ? (
        <p className="text-center text-label-secondary text-[13px] py-20">
          {emptyMsg}<br />
          気になるグッズ・イベントに ♡ を押すとここに溜まります
        </p>
      ) : (
        <div className="flex flex-col gap-2 pb-4">
          {listItems.map((e) => (
            <ItemCard key={e.id} event={e} layout="list" likedInit={e.likedByMe}
              workColor={e.workId ? (workColorMap.get(e.workId) ?? 'var(--accent-color)') : 'var(--accent-color)'}
              onOpen={() => openItem(e)} onLike={() => onLike(e)} onCalendar={() => onCalendar(e)} />
          ))}
        </div>
      )}

      {/* 自分用の予定を作る入口（2026-09-29）。みんなに公開する情報は下の真ん中の「＋」から。
          日付は表示中の日（月表示なら今日か、見ている月の1日）を入れておく */}
      {(!tourStep || tourStep === 'personal') && (
        <button data-tour="personal" onClick={() => { haptic.select(); navigate(`/personal/new?date=${view === 'list' || includesToday(view, anchor, today) ? today : anchor}`); }}
          aria-label="自分の予定を追加"
          // 下の真ん中の「＋」（みんなに公開する情報）と見分けるため、塗りではなく白地にカレンダーの印
          className="pressable material-thick fixed right-4 z-30 w-12 h-12 rounded-full flex items-center justify-center shadow-float"
          style={{ color: 'var(--accent-text)', bottom: 'calc(env(safe-area-inset-bottom) + 92px)' }}>
          <CalendarPlus size={22} />
        </button>
      )}
    </div>
  );
}

/** 案内でカレンダーのどの日を開くか。ピンした日があればその日、期間の途中なら今日、ほかは始まりの日。日付未定なら null */
function focusDayOf(e: CalendarEvent, today: string): string | null {
  if (e.visits && e.visits.length > 0) return e.visits[0].start;
  if (!e.date) return null;
  const end = e.endDate || e.date;
  return e.date < today && today <= end ? today : e.date;
}

/** 上の行のアイコンだけのボタン。色は白黒（塗りは薄いグレー）で、絞り込み中だけアクセント色 */
function IconButton({ label, onClick, pressed, active, children }: {
  label: string; onClick: (el: HTMLButtonElement) => void; pressed?: boolean; active?: boolean; children: React.ReactNode;
}) {
  return (
    <button onClick={(e) => { haptic.select(); onClick(e.currentTarget); }} aria-label={label} title={label}
      aria-pressed={pressed}
      className="pressable relative w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
      style={active
        ? { backgroundColor: 'var(--accent-color)', color: 'var(--accent-on)' }
        : { backgroundColor: 'var(--fill-tertiary)', color: 'var(--label-primary)' }}>
      {children}
    </button>
  );
}

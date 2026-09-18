import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Search, SlidersHorizontal, X, Crown, CalendarDays, CalendarRange, Calendar, List, Check } from 'lucide-react';
import type { CalendarEvent } from '../types';
import ItemCard from '../components/item/ItemCard';
import Chip from '../components/ui/Chip';
import SavedCalendar, { periodLabel, includesToday } from '../components/SavedCalendar';
import FilterPanel, { type Facet } from '../components/item/FilterPanel';
import { SkeletonList } from '../components/ui/Skeleton';
import { deriveStatus, todayStr, STATUS, type ItemStatus } from '../design/tokens';
import { listSavedEvents, getHomePrefecture, toggleLike, toggleCalendarAdd } from '../lib/api';
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

type Tab = 'all' | 'preorder' | 'mine' | 'notify';
type View = 'list' | 'month' | 'week' | 'day';

const VIEWS: { key: View; label: string; icon: typeof Calendar }[] = [
  { key: 'month', label: '月', icon: CalendarDays },
  { key: 'week', label: '週', icon: CalendarRange },
  { key: 'day', label: '日', icon: Calendar },
  { key: 'list', label: 'リスト', icon: List },
];

const STATUS_ORDER: ItemStatus[] = ['preorder_soon', 'preorder', 'sale_soon', 'onsale', 'preorder_ended', 'ended'];

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
  const _ss = loadSavedSession();
  const [items, setItems] = useState<CalendarEvent[] | null>(null);
  const [tab, setTab] = useState<Tab>(['all', 'preorder', 'mine', 'notify'].includes(_ss.tab) ? _ss.tab : 'all');
  const [view, setView] = useState<View>(_ss.view ?? 'month');
  // 表示切替のメニューの位置（開いているときだけ）。上部バーは下端をぼかす mask で
  // はみ出した部分が消えるので、メニューは body に出して画面の座標で置く
  const [viewMenuAt, setViewMenuAt] = useState<{ top: number; right: number } | null>(null);
  // 表示中の月・週・日。見出しと「今日」ボタンのためにここで持つ
  const [anchor, setAnchor] = useState<string>(todayStr());
  const premium = usePremium();

  // 探すと同じ絞り込み
  const [query, setQuery] = useState<string>(_ss.query ?? '');
  const [filterOpen, setFilterOpen] = useState<boolean>(_ss.filterOpen ?? false);
  const [selectedStatuses, setSelectedStatuses] = useState<Set<string>>(new Set(_ss.statuses ?? []));
  const [excludedWorks, setExcludedWorks] = useState<Set<string>>(new Set(_ss.excludedWorks ?? []));
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set(_ss.categories ?? []));
  const [selectedPrefs, setSelectedPrefs] = useState<Set<string>>(new Set(_ss.prefs ?? []));
  const [selectedRegions, setSelectedRegions] = useState<Set<string>>(new Set(_ss.regions ?? []));
  const [neighborActive, setNeighborActive] = useState<boolean>(_ss.neighborActive ?? false);
  const [homePref, setHomePref] = useState<string | null>(null);

  const today = todayStr();
  const rootRef = useRef<HTMLDivElement>(null);

  // フィルター状態を sessionStorage に同期（詳細から戻っても維持）
  useEffect(() => {
    sessionStorage.setItem('saved_filters', JSON.stringify({
      tab, view, query, filterOpen,
      statuses: [...selectedStatuses], excludedWorks: [...excludedWorks], categories: [...selectedCategories],
      prefs: [...selectedPrefs], regions: [...selectedRegions], neighborActive,
    }));
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

  // 表示するのは「いいね＋自分の投稿」のみ（カレンダーは保存した予定のカレンダー）
  useEffect(() => {
    if (!user) return;
    let alive = true;
    Promise.all([
      listSavedEvents(user.id),
      getHomePrefecture(user.id).catch(() => null),
    ]).then(([d, hp]) => {
      if (!alive) return;
      setItems(d);
      setHomePref(hp);
    }).catch(() => alive && setItems([]));
    return () => { alive = false; };
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // いいねトグル: 解除したら（自分の投稿でなければ）一覧から外す
  const onLike = async (e: CalendarEvent) => {
    haptic.select();
    if (!user) return;
    const r = await toggleLike(e.id, user.id);
    setItems((prev) => {
      if (!prev) return prev;
      return prev.flatMap((it) => {
        if (it.id !== e.id) return [it];
        if (!r.liked && it.authorId !== user.id) return [];
        return [{ ...it, likedByMe: r.liked, likes: r.count }];
      });
    });
  };

  // 保存中の予定に出てくる作品の色マップ（未割当はパレットから付与して永続化）
  const workColorMap = useMemo(() => {
    const works = Array.from(
      new Map((items ?? []).filter((e) => e.workId).map((e) => [e.workId!, { id: e.workId! }])).values(),
    );
    return buildWorkColorMap(works);
  }, [items]);

  // スコープ（すべて / いいね / 自分の投稿）→ 検索語 で絞った集合
  const scopeItems = useMemo(() => {
    let list = (items ?? []).filter((e) => !isHidden(e));
    if (tab === 'preorder') list = list.filter((e) => deriveStatus(e) === 'preorder');
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

  // リスト表示: 近い順（これから昇順 → 過去降順）
  const listItems = useMemo(() => {
    const ref = (e: CalendarEvent) => e.endDate || e.date || '';
    const up = filtered.filter((e) => !ref(e) || ref(e) >= today).sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999'));
    const past = filtered.filter((e) => ref(e) && ref(e) < today).sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
    return [...up, ...past];
  }, [filtered, today]);

  const toggleIn = <T,>(setter: React.Dispatch<React.SetStateAction<Set<T>>>, v: T) => {
    haptic.select();
    setter((prev) => { const n = new Set(prev); n.has(v) ? n.delete(v) : n.add(v); return n; });
  };
  const clearFilters = () => {
    haptic.select();
    setSelectedStatuses(new Set()); setExcludedWorks(new Set()); setSelectedCategories(new Set());
    setSelectedPrefs(new Set()); setSelectedRegions(new Set()); setNeighborActive(false);
  };
  const facetCount = selectedStatuses.size + excludedWorks.size + selectedCategories.size + selectedPrefs.size + selectedRegions.size + (neighborActive ? 1 : 0);

  const onCalendar = async (e: CalendarEvent) => {
    haptic.select();
    const r = await addToCalendar(e);
    if (r !== 'fail' && user) toggleCalendarAdd(e.id, user.id).catch(() => {});
    toast(r === 'google' ? 'Googleカレンダーに追加しました' : r === 'ics' ? 'カレンダーに追加しました' : '日付未定のため追加できません');
  };

  // 絞り込みボタンに出す件数。上に出ていた検索・すべて/予約受注中…もボタンの中に入ったので、それも数える
  const activeCount = facetCount + (tab !== 'all' ? 1 : 0) + (query.trim() ? 1 : 0);
  const clearAll = () => { clearFilters(); setTab('all'); setQuery(''); };

  const emptyMsg = tab === 'mine' ? 'まだ投稿がありません' : tab === 'preorder' ? '予約・受注中の予定はありません' : '保存した予定がありません';

  return (
    // ⚠️ ルートに上の余白を付けないこと。上部バーは自分で var(--sat) を持っているので、
    // ここに余白を足すと**帯の外側に地の色の帯**ができる（外皮で帯の色が変わると目立つ）
    // 月のマスを画面いっぱいに広げる。上の行・曜日・下の浮遊ナビのぶん（約170px）を引いて6行で割る
    <div ref={rootRef} className="px-3"
      style={{ '--cal-cell-h': 'clamp(56px, calc((100dvh - var(--sat) - env(safe-area-inset-bottom) - 170px) / 6), 150px)' } as React.CSSProperties}>
      <div className="sticky top-0 z-20 -mx-3 px-3 pt-1 pb-2 material-bar scroll-edge" data-skin-bar="main" style={{ paddingTop: 'calc(var(--sat) + 4px)' }}>
        {/* 1行だけ: 見出し（＋今日）／プレミアム／表示切替／絞り込み。文字は見出しだけで、ボタンはアイコンのみ */}
        <div className="flex items-center gap-1.5 h-10">
          <div className="flex-1 min-w-0 flex items-center gap-2">
            <h1 className="text-[20px] font-bold tracking-tight truncate">
              {view === 'list' ? '保存した予定' : periodLabel(view, anchor)}
            </h1>
            {/* 今日を含まない期間を見ているときだけ出す */}
            {view !== 'list' && !includesToday(view, anchor, today) && (
              <button onClick={() => { haptic.select(); setAnchor(today); }}
                className="pressable flex-shrink-0 text-[12px] font-semibold px-2.5 py-1 rounded-full"
                style={{ backgroundColor: 'var(--fill-tertiary)', color: 'var(--label-primary)' }}>
                今日
              </button>
            )}
          </div>

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

          <IconButton label="絞り込み" pressed={filterOpen} active={activeCount > 0}
            onClick={() => setFilterOpen((v) => !v)}>
            <SlidersHorizontal size={18} />
            {activeCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full text-[10px] font-bold leading-4 text-center"
                style={{ backgroundColor: 'var(--accent-color)', color: 'var(--accent-on)' }}>{activeCount}</span>
            )}
          </IconButton>
        </div>

        {/* 絞り込み: 検索・対象（すべて/予約受注中/自分の投稿/通知ON）・細かい条件をここにまとめる */}
        {filterOpen && (
          <div className="pt-2">
            <div className="flex items-center gap-2 px-3 rounded-[10px] mb-2" style={{ backgroundColor: 'var(--fill-tertiary)' }}>
              <Search size={16} className="text-label-tertiary flex-shrink-0" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="保存した予定を検索"
                className="flex-1 bg-transparent py-2 text-[14px] outline-none" style={{ color: 'var(--input-text)' }} />
              {query && (
                <button onClick={() => setQuery('')} aria-label="クリア" className="pressable text-label-tertiary flex-shrink-0"><X size={16} /></button>
              )}
            </div>
            <div className="flex items-center flex-wrap gap-2 mb-1">
              <Chip active={tab === 'all'} onClick={() => { haptic.select(); setTab('all'); }}>すべて</Chip>
              <Chip active={tab === 'preorder'} onClick={() => { haptic.select(); setTab('preorder'); }}>予約・受注中</Chip>
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
              statuses={statusFacets} works={workFacets} categories={categoryFacets} prefectures={prefFacets} regions={regionFacets}
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
        )}
      </div>

      {items === null ? (
        <SkeletonList count={4} />
      ) : view !== 'list' ? (
        // カレンダー（月/週/日）は予定が0件でも枠を表示する
        <SavedCalendar events={filtered} scope={view} anchor={anchor} setAnchor={setAnchor}
          onOpen={(e) => navigate(`/item/${e.id}`)} onLike={onLike} onCalendar={onCalendar}
          onAdd={(day) => navigate(`/post?date=${day}`)} />
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
              onOpen={() => navigate(`/item/${e.id}`)} onLike={() => onLike(e)} onCalendar={() => onCalendar(e)} />
          ))}
        </div>
      )}
    </div>
  );
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

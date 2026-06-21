import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowDownToLine, Search, SlidersHorizontal } from 'lucide-react';
import type { CalendarEvent } from '../types';
import ItemCard from '../components/item/ItemCard';
import FilterPanel, { type Facet } from '../components/item/FilterPanel';
import Chip from '../components/ui/Chip';
import { SkeletonList } from '../components/ui/Skeleton';
import { deriveItemType, deriveStatus, todayStr, STATUS, type ItemStatus, type ItemType } from '../design/tokens';
import { listExploreEvents, getHomePrefecture } from '../lib/api';
import { parseCategories } from '../lib/constants';
import { resolveBuy } from '../lib/affiliate';
import { REGIONS, ADJACENT } from '../lib/prefectures';
import { useAuth } from '../contexts/AuthContext';
import { haptic } from '../lib/haptics';

const STATUS_ORDER: ItemStatus[] = ['preorder_soon', 'preorder', 'sale_soon', 'onsale', 'preorder_ended', 'ended'];

const PREF_TO_REGION: Record<string, string> = {};
for (const r of REGIONS) for (const p of r.prefectures) PREF_TO_REGION[p] = r.name;

function shiftMonths(base: string, n: number): string {
  const d = new Date(base + 'T00:00:00');
  d.setMonth(d.getMonth() + n);
  return todayStr(d);
}

export default function Explore() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [mode, setMode] = useState<ItemType>('goods');
  const [items, setItems] = useState<CalendarEvent[] | null>(null);
  const [query, setQuery] = useState('');
  const [selectedStatuses, setSelectedStatuses] = useState<Set<string>>(new Set());
  const [selectedWorks, setSelectedWorks] = useState<Set<string>>(new Set());
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
  const [selectedPrefs, setSelectedPrefs] = useState<Set<string>>(new Set());
  const [selectedRegions, setSelectedRegions] = useState<Set<string>>(new Set());
  const [neighborActive, setNeighborActive] = useState(false);
  const [homePref, setHomePref] = useState<string | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const todayRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);

  // スティッキーヘッダーの高さぶんオフセットして「今日」を上端に合わせる
  const scrollToToday = (smooth = false) => {
    const el = todayRef.current;
    if (!el) return;
    el.style.scrollMarginTop = `${(headerRef.current?.offsetHeight ?? 0) + 6}px`;
    el.scrollIntoView({ block: 'start', behavior: smooth ? 'smooth' : 'auto' });
  };

  const today = todayStr();

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await listExploreEvents(shiftMonths(today, -12), shiftMonths(today, 18));
        if (alive) setItems(data);
      } catch {
        if (alive) setItems([]);
      }
    })();
    return () => { alive = false; };
  }, [today]);

  useEffect(() => { if (user) getHomePrefecture(user.id).then(setHomePref).catch(() => {}); }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const modeItems = useMemo(() => (items ?? []).filter((e) => deriveItemType(e) === mode), [items, mode]);

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
    return [...m.values()].sort((a, b) => b.count - a.count);
  }, [queryItems]);

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

  const visible = useMemo(() => {
    return queryItems.filter((e) => {
      if (selectedStatuses.size && !selectedStatuses.has(deriveStatus(e))) return false;
      if (selectedWorks.size && (!e.workId || !selectedWorks.has(e.workId))) return false;
      if (selectedCategories.size && !parseCategories(e.category).some((c) => selectedCategories.has(c))) return false;
      if (allowedPrefs.size && (!e.prefecture || !allowedPrefs.has(e.prefecture))) return false;
      return true;
    });
  }, [queryItems, selectedStatuses, selectedWorks, selectedCategories, allowedPrefs]);

  // 今日起点: 過去（上）／これから（下）に分割（並びは取得順=日付昇順のまま）
  const { past, upcoming } = useMemo(() => {
    const p: CalendarEvent[] = [];
    const u: CalendarEvent[] = [];
    for (const e of visible) {
      const ref = e.endDate || e.date || '';
      (ref && ref < today ? p : u).push(e);
    }
    return { past: p, upcoming: u };
  }, [visible, today]);

  useEffect(() => {
    if (items) requestAnimationFrame(() => scrollToToday(false));
  }, [items, mode]); // eslint-disable-line react-hooks/exhaustive-deps

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
    setSelectedStatuses(new Set()); setSelectedWorks(new Set()); setSelectedCategories(new Set());
    setSelectedPrefs(new Set()); setSelectedRegions(new Set()); setNeighborActive(false);
  };
  const activeCount = selectedStatuses.size + selectedWorks.size + selectedCategories.size + selectedPrefs.size + selectedRegions.size + (neighborActive ? 1 : 0);

  const onBuy = (e: CalendarEvent) => {
    haptic.select();
    const { url } = resolveBuy(e);
    if (url) window.open(url, '_blank', 'noopener');
  };

  const gridClass = mode === 'goods' ? 'grid grid-cols-2 gap-2 items-stretch' : 'flex flex-col gap-2';
  const renderCard = (e: CalendarEvent) => (
    <ItemCard key={e.id} event={e} layout={mode === 'goods' ? 'grid' : 'list'}
      onOpen={() => navigate(`/item/${e.id}`)} onLike={() => haptic.select()} onCalendar={() => haptic.select()} onBuy={() => onBuy(e)} />
  );

  return (
    <div className="relative">
      <div ref={headerRef} className="px-3 pt-3 pb-2 sticky top-0 z-20" style={{ backgroundColor: 'var(--bg-primary)' }}>
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

        <div className="flex gap-2 mt-2">
          <Chip active={mode === 'goods'} onClick={() => { haptic.select(); setMode('goods'); }}>グッズ</Chip>
          <Chip active={mode === 'event'} onClick={() => { haptic.select(); setMode('event'); }}>イベント</Chip>
        </div>

        {filterOpen && (
          <FilterPanel
            statuses={statusFacets} works={workFacets} categories={categoryFacets} prefectures={prefFacets} regions={regionFacets}
            selectedStatuses={selectedStatuses} selectedWorks={selectedWorks} selectedCategories={selectedCategories} selectedPrefs={selectedPrefs} selectedRegions={selectedRegions}
            onToggleStatus={(k) => toggleIn(setSelectedStatuses, k)}
            onToggleWork={(k) => toggleIn(setSelectedWorks, k)}
            onToggleCategory={(k) => toggleIn(setSelectedCategories, k)}
            onTogglePref={(k) => toggleIn(setSelectedPrefs, k)}
            onToggleRegion={(k) => toggleIn(setSelectedRegions, k)}
            homePref={homePref} neighborActive={neighborActive} onToggleNeighbor={() => { haptic.select(); setNeighborActive((v) => !v); }}
            onClear={clearFilters} resultCount={visible.length}
          />
        )}
      </div>

      <div className="px-3 pb-4">
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

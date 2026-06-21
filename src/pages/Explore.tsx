import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownToLine } from 'lucide-react';
import type { CalendarEvent } from '../types';
import ItemCard from '../components/item/ItemCard';
import Chip from '../components/ui/Chip';
import { SkeletonList } from '../components/ui/Skeleton';
import { deriveItemType, deriveStatus, todayStr, STATUS, type ItemStatus, type ItemType } from '../design/tokens';
import { listExploreEvents } from '../lib/api';
import { haptic } from '../lib/haptics';

const STATUS_ORDER: ItemStatus[] = ['preorder_soon', 'preorder', 'sale_soon', 'onsale', 'preorder_ended', 'ended'];

function shiftMonths(base: string, n: number): string {
  const d = new Date(base + 'T00:00:00');
  d.setMonth(d.getMonth() + n);
  return todayStr(d);
}

export default function Explore() {
  const [mode, setMode] = useState<ItemType>('goods');
  const [items, setItems] = useState<CalendarEvent[] | null>(null);
  const [workId, setWorkId] = useState<string | null>(null);
  const [statuses, setStatuses] = useState<Set<ItemStatus>>(new Set());
  const todayRef = useRef<HTMLDivElement>(null);

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

  // 現在のモード（グッズ/イベント）に属するアイテム
  const modeItems = useMemo(
    () => (items ?? []).filter((e) => deriveItemType(e) === mode),
    [items, mode],
  );

  // モード内の作品チップ（出現順・重複排除）
  const works = useMemo(() => {
    const seen = new Map<string, string>();
    for (const e of modeItems) if (e.workId && !seen.has(e.workId)) seen.set(e.workId, e.workName ?? '');
    return [...seen.entries()].map(([id, name]) => ({ id, name }));
  }, [modeItems]);

  // 絞り込み適用
  const visible = useMemo(() => {
    return modeItems.filter((e) => {
      if (workId && e.workId !== workId) return false;
      if (statuses.size > 0 && !statuses.has(deriveStatus(e))) return false;
      return true;
    });
  }, [modeItems, workId, statuses]);

  // 今日起点: 過去（上）／これから（下）に分割
  const { past, upcoming } = useMemo(() => {
    const p: CalendarEvent[] = [];
    const u: CalendarEvent[] = [];
    for (const e of visible) {
      const ref = e.endDate || e.date || '';
      (ref && ref < today ? p : u).push(e);
    }
    return { past: p, upcoming: u };
  }, [visible, today]);

  // 初回・モード切替時に「今日」を画面上部へ
  useEffect(() => {
    if (items) requestAnimationFrame(() => todayRef.current?.scrollIntoView({ block: 'start' }));
  }, [items, mode]);

  const toggleStatus = (s: ItemStatus) => {
    haptic.select();
    setStatuses((prev) => {
      const next = new Set(prev);
      next.has(s) ? next.delete(s) : next.add(s);
      return next;
    });
  };

  const onBuy = (e: CalendarEvent) => {
    haptic.select();
    const url = e.affiliateUrl || e.link;
    if (url) window.open(url, '_blank', 'noopener');
  };

  const gridClass = mode === 'goods' ? 'grid grid-cols-2 gap-2' : 'flex flex-col gap-2';

  const renderCard = (e: CalendarEvent) => (
    <ItemCard
      key={e.id}
      event={e}
      layout={mode === 'goods' ? 'grid' : 'list'}
      onOpen={() => haptic.select()}
      onLike={() => haptic.select()}
      onCalendar={() => haptic.select()}
      onBuy={() => onBuy(e)}
    />
  );

  return (
    <div className="relative">
      {/* しぼり込みバー */}
      <div className="px-3 pt-3 pb-2 sticky top-0 z-20" style={{ backgroundColor: 'var(--bg-primary)' }}>
        <div className="flex gap-2 mb-2">
          <Chip active={mode === 'goods'} onClick={() => { haptic.select(); setMode('goods'); setWorkId(null); }}>グッズ</Chip>
          <Chip active={mode === 'event'} onClick={() => { haptic.select(); setMode('event'); setWorkId(null); }}>イベント</Chip>
        </div>
        {works.length > 0 && (
          <div className="flex gap-2 overflow-x-auto no-scrollbar mb-2 -mx-3 px-3">
            <Chip active={workId === null} onClick={() => { haptic.select(); setWorkId(null); }}>すべて</Chip>
            {works.map((w) => (
              <Chip key={w.id} active={workId === w.id} onClick={() => { haptic.select(); setWorkId(w.id); }}>{w.name || '作品'}</Chip>
            ))}
          </div>
        )}
        <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-3 px-3">
          {STATUS_ORDER.map((s) => (
            <Chip key={s} active={statuses.has(s)} onClick={() => toggleStatus(s)}>
              {mode === 'goods' ? STATUS[s].goodsLabel : STATUS[s].eventLabel}
            </Chip>
          ))}
        </div>
      </div>

      {/* フィード */}
      <div className="px-3 pb-4">
        {items === null ? (
          <SkeletonList count={4} />
        ) : visible.length === 0 ? (
          <p className="text-center text-label-secondary text-[13px] py-16">該当する{mode === 'goods' ? 'グッズ' : 'イベント'}がありません</p>
        ) : (
          <>
            {past.length > 0 && <div className={gridClass}>{past.map(renderCard)}</div>}
            <div ref={todayRef} className="flex items-center gap-2 py-3 scroll-mt-2">
              <div className="flex-1 h-px" style={{ backgroundColor: 'var(--separator)' }} />
              <span className="text-[12px] font-semibold" style={{ color: 'var(--accent-text)' }}>今日 {today.slice(5).replace('-', '/')}</span>
              <div className="flex-1 h-px" style={{ backgroundColor: 'var(--separator)' }} />
            </div>
            {upcoming.length > 0
              ? <div className={gridClass}>{upcoming.map(renderCard)}</div>
              : <p className="text-center text-label-tertiary text-[12px] py-6">これからの予定はありません</p>}
          </>
        )}
      </div>

      {/* 今日へ戻る */}
      {items && items.length > 0 && (
        <button
          onClick={() => { haptic.select(); todayRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }); }}
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

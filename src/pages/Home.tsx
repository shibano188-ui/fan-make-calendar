import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import type { CalendarEvent } from '../types';
import ItemCard from '../components/item/ItemCard';
import { SkeletonList } from '../components/ui/Skeleton';
import { deriveStatus, deriveItemType, todayStr } from '../design/tokens';
import { listExploreEvents, getHomePrefecture, listAllParticipatedWorks } from '../lib/api';
import { resolveBuy } from '../lib/affiliate';
import { REGIONS, ADJACENT } from '../lib/prefectures';
import { useAuth } from '../contexts/AuthContext';
import { haptic } from '../lib/haptics';

function shiftMonths(base: string, n: number): string {
  const d = new Date(base + 'T00:00:00');
  d.setMonth(d.getMonth() + n);
  return todayStr(d);
}

function Section({ title, items, onOpen, onBuy }: {
  title: string; items: CalendarEvent[];
  onOpen: (e: CalendarEvent) => void; onBuy: (e: CalendarEvent) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="mt-5">
      <div className="px-3 text-[15px] font-bold mb-2">{title}</div>
      <div className="flex gap-2 overflow-x-auto no-scrollbar px-3">
        {items.map((e) => (
          <div key={e.id} className="w-36 flex-shrink-0">
            <ItemCard event={e} layout="grid" onOpen={() => onOpen(e)} onLike={() => haptic.select()} onCalendar={() => haptic.select()} onBuy={() => onBuy(e)} />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Home() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [items, setItems] = useState<CalendarEvent[] | null>(null);
  const [followIds, setFollowIds] = useState<Set<string>>(new Set());
  const [homePref, setHomePref] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const today = todayStr();

  useEffect(() => {
    let alive = true;
    listExploreEvents(shiftMonths(today, -12), shiftMonths(today, 18)).then((d) => alive && setItems(d)).catch(() => alive && setItems([]));
    return () => { alive = false; };
  }, [today]);

  useEffect(() => {
    if (!user) return;
    listAllParticipatedWorks(user.id).then((ws) => setFollowIds(new Set(ws.map((w) => w.id)))).catch(() => {});
    getHomePrefecture(user.id).then(setHomePref).catch(() => {});
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const nearPrefs = useMemo(() => {
    if (!homePref) return new Set<string>();
    const s = new Set<string>([homePref]);
    (ADJACENT[homePref] ?? []).forEach((p) => s.add(p));
    REGIONS.find((r) => r.prefectures.includes(homePref))?.prefectures.forEach((p) => s.add(p));
    return s;
  }, [homePref]);

  const sections = useMemo(() => {
    // フォロー中の作品の予定だけ
    const all = (items ?? []).filter((e) => e.workId && followIds.has(e.workId));
    const preorderSoon = all.filter((e) => deriveStatus(e) === 'preorder_soon')
      .sort((a, b) => (a.preorderStart ?? '9999').localeCompare(b.preorderStart ?? '9999')).slice(0, 12);
    const followNew = all.filter((e) => e.workId && followIds.has(e.workId))
      .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? '')).slice(0, 12);
    const nearby = nearPrefs.size
      ? all.filter((e) => deriveItemType(e) === 'event' && e.prefecture && nearPrefs.has(e.prefecture)).slice(0, 12)
      : [];
    const popular = [...all].sort((a, b) => (b.likes ?? 0) - (a.likes ?? 0)).filter((e) => (e.likes ?? 0) > 0).slice(0, 12);
    return { preorderSoon, followNew, nearby, popular };
  }, [items, followIds, nearPrefs]);

  const onOpen = (e: CalendarEvent) => navigate(`/item/${e.id}`);
  const onBuy = (e: CalendarEvent) => { haptic.select(); const { url } = resolveBuy(e); if (url) window.open(url, '_blank', 'noopener'); };
  const onSearch = () => { if (query.trim()) navigate(`/explore?q=${encodeURIComponent(query.trim())}`); };

  const empty = items && sections.preorderSoon.length === 0 && sections.followNew.length === 0 && sections.nearby.length === 0 && sections.popular.length === 0;

  return (
    <div>
      <div className="px-3 pt-3 pb-1 sticky top-0 z-20" style={{ backgroundColor: 'var(--bg-primary)' }}>
        <button onClick={() => navigate('/explore')} className="w-full flex items-center gap-2 px-3 py-2 rounded-[10px]" style={{ backgroundColor: 'var(--fill-tertiary)' }}>
          <Search size={16} className="text-label-tertiary" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onSearch()}
            onClick={(e) => e.stopPropagation()}
            placeholder="グッズ・イベントを検索"
            className="flex-1 bg-transparent text-[14px] outline-none"
            style={{ color: 'var(--input-text)' }}
          />
        </button>
      </div>

      {items === null ? (
        <div className="px-3 pt-3"><SkeletonList count={3} /></div>
      ) : empty ? (
        <p className="text-center text-label-secondary text-[13px] py-20">おすすめがまだありません。<br />「探す」から見てみてください。</p>
      ) : (
        <div className="pb-4">
          <Section title="もうすぐ受付開始" items={sections.preorderSoon} onOpen={onOpen} onBuy={onBuy} />
          <Section title="フォロー作品の新着" items={sections.followNew} onOpen={onOpen} onBuy={onBuy} />
          <Section title="近くのイベント" items={sections.nearby} onOpen={onOpen} onBuy={onBuy} />
          <Section title="人気" items={sections.popular} onOpen={onOpen} onBuy={onBuy} />
        </div>
      )}
    </div>
  );
}

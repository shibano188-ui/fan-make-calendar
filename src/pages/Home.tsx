import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import type { CalendarEvent } from '../types';
import ItemCard from '../components/item/ItemCard';
import { SkeletonList } from '../components/ui/Skeleton';
import { deriveStatus, deriveItemType, todayStr } from '../design/tokens';
import { loadSeenEventIds, isNewItem } from '../lib/constants';
import { listExploreEvents, getHomePrefecture, listAllParticipatedWorks, toggleLike, toggleCalendarAdd, listLikedEventIds, type Work } from '../lib/api';
import { getCached, setCached } from '../lib/swrCache';
import { buildWorkColorMap } from '../lib/workColors';
import { resolveBuy } from '../lib/affiliate';
import { addToCalendar } from '../lib/googleCalendar';
import { useToast } from '../components/ui/Toast';
import { REGIONS, ADJACENT } from '../lib/prefectures';
import { useAuth } from '../contexts/AuthContext';
import { haptic } from '../lib/haptics';
import { useAdBanner } from '../lib/useAdBanner';

function shiftMonths(base: string, n: number): string {
  const d = new Date(base + 'T00:00:00');
  d.setMonth(d.getMonth() + n);
  return todayStr(d);
}

function Section({ title, items, seen, likedIds, workColorMap, onOpen, onBuy, onLike, onCalendar }: {
  title: string; items: CalendarEvent[]; seen: Set<string>; likedIds: Set<string>; workColorMap: Map<string, string>;
  onOpen: (e: CalendarEvent) => void; onBuy: (e: CalendarEvent) => void;
  onLike: (e: CalendarEvent) => void | Promise<{ liked: boolean; count: number } | void>; onCalendar: (e: CalendarEvent) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="mt-5">
      <div className="px-3 text-[15px] font-bold mb-2">{title}</div>
      <div className="flex gap-2 overflow-x-auto no-scrollbar px-3">
        {items.map((e) => (
          <div key={e.id} className="w-36 flex-shrink-0">
            <ItemCard event={e} layout="grid" isNew={isNewItem(e.id, e.createdAt, seen)} likedInit={likedIds.has(e.id)} workColor={e.workId ? (workColorMap.get(e.workId) ?? 'var(--accent-color)') : 'var(--accent-color)'} onOpen={() => onOpen(e)} onLike={() => onLike(e)} onCalendar={() => onCalendar(e)} onBuy={() => onBuy(e)} />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Home() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const toast = useToast();
  const [items, setItems] = useState<CalendarEvent[] | null>(null);
  const [follows, setFollows] = useState<Work[]>([]);
  const [followIds, setFollowIds] = useState<Set<string>>(new Set());
  const [homePref, setHomePref] = useState<string | null>(null);
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const today = todayStr();
  const rootRef = useRef<HTMLDivElement>(null);

  // 開いたら最上部から表示（タブ移動でスクロール位置を引き継がない）
  useEffect(() => {
    let el = rootRef.current?.parentElement as HTMLElement | null;
    while (el) {
      const oy = getComputedStyle(el).overflowY;
      if (oy === 'auto' || oy === 'scroll') el.scrollTop = 0;
      el = el.parentElement;
    }
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    let alive = true;
    const from = shiftMonths(today, -12), to = shiftMonths(today, 18);
    const key = `explore-events:${from}_${to}`;
    // キャッシュを即表示し、裏で再取得して最新化（Exploreタブと共有）
    const cached = getCached<CalendarEvent[]>(key);
    if (cached) setItems(cached);
    listExploreEvents(from, to)
      .then((d) => { if (!alive) return; setItems(d); setCached(key, d); })
      .catch(() => { if (alive) setItems((prev) => prev ?? []); });
    return () => { alive = false; };
  }, [today]);

  useEffect(() => {
    if (!user) return;
    const fkey = `follows:${user.id}`, lkey = `liked:${user.id}`;
    const cachedF = getCached<Work[]>(fkey);
    if (cachedF) { setFollows(cachedF); setFollowIds(new Set(cachedF.map((w) => w.id))); }
    const cachedL = getCached<string[]>(lkey);
    if (cachedL) setLikedIds(new Set(cachedL));
    listAllParticipatedWorks(user.id).then((ws) => { setFollows(ws); setFollowIds(new Set(ws.map((w) => w.id))); setCached(fkey, ws); }).catch(() => {});
    getHomePrefecture(user.id).then(setHomePref).catch(() => {});
    listLikedEventIds(user.id).then((ids) => { setLikedIds(ids); setCached(lkey, [...ids]); }).catch(() => {});
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

  const workColorMap = useMemo(() => buildWorkColorMap(follows), [follows]);
  const seen = useMemo(() => loadSeenEventIds(), [items]);
  const onOpen = (e: CalendarEvent) => navigate(`/item/${e.id}`);
  const onBuy = (e: CalendarEvent) => { haptic.select(); const { url } = resolveBuy(e); if (url) window.open(url, '_blank', 'noopener'); };
  const onLike = async (e: CalendarEvent) => { haptic.select(); return user ? toggleLike(e.id, user.id) : undefined; };
  const onCalendar = async (e: CalendarEvent) => {
    haptic.select();
    const r = await addToCalendar(e);
    if (r !== 'fail' && user) toggleCalendarAdd(e.id, user.id).catch(() => {});
    toast(r === 'google' ? 'Googleカレンダーに追加しました' : r === 'ics' ? 'カレンダーに追加しました' : '日付未定のため追加できません');
  };
  const onSearch = () => { if (query.trim()) navigate(`/explore?q=${encodeURIComponent(query.trim())}`); };

  const empty = items && sections.preorderSoon.length === 0 && sections.followNew.length === 0 && sections.nearby.length === 0 && sections.popular.length === 0;

  // 広告バナー: ステータスバー直下に表示し、ヘッダー余白をバナー高さ分広げて被りを防ぐ。
  const adH = useAdBanner();

  return (
    <div ref={rootRef}>
      <div className="px-3 pt-3 pb-1 sticky top-0 z-20" style={{ backgroundColor: 'var(--bg-primary)', paddingTop: `calc(env(safe-area-inset-top) + ${adH + 12}px)` }}>
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

      {/* フォロー中の作品（確認用・常時表示）。タップでその作品の予定へ。 */}
      {follows.length > 0 && (
        <div className="pt-2">
          <div className="px-3 flex items-center justify-between mb-1.5">
            <span className="text-[12px] text-label-secondary">フォロー中（{follows.length}）</span>
            <button onClick={() => { haptic.select(); navigate('/mypage'); }} className="pressable text-[11px] font-medium" style={{ color: 'var(--accent-text)' }}>管理</button>
          </div>
          <div className="flex gap-2 overflow-x-auto no-scrollbar px-3">
            {follows.map((w) => (
              <button key={w.id} onClick={() => { haptic.select(); navigate(`/explore?q=${encodeURIComponent(w.name)}`); }}
                className="pressable flex-shrink-0 px-3 py-1.5 rounded-full text-[13px] font-medium whitespace-nowrap"
                style={{ backgroundColor: 'var(--fill-tertiary)', color: 'var(--label-primary)' }}>
                {w.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {items === null ? (
        <div className="px-3 pt-3"><SkeletonList count={3} /></div>
      ) : empty ? (
        <p className="text-center text-label-secondary text-[13px] py-20">おすすめがまだありません。<br />「探す」から見てみてください。</p>
      ) : (
        <div className="pb-4">
          <Section title="もうすぐ受付開始" items={sections.preorderSoon} seen={seen} likedIds={likedIds} workColorMap={workColorMap} onOpen={onOpen} onBuy={onBuy} onLike={onLike} onCalendar={onCalendar} />
          <Section title="フォロー作品の新着" items={sections.followNew} seen={seen} likedIds={likedIds} workColorMap={workColorMap} onOpen={onOpen} onBuy={onBuy} onLike={onLike} onCalendar={onCalendar} />
          <Section title="近くのイベント" items={sections.nearby} seen={seen} likedIds={likedIds} workColorMap={workColorMap} onOpen={onOpen} onBuy={onBuy} onLike={onLike} onCalendar={onCalendar} />
          <Section title="人気" items={sections.popular} seen={seen} likedIds={likedIds} workColorMap={workColorMap} onOpen={onOpen} onBuy={onBuy} onLike={onLike} onCalendar={onCalendar} />
        </div>
      )}
    </div>
  );
}

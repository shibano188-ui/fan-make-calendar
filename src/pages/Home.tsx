import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, TrendingDown, ChevronRight, ChevronDown } from 'lucide-react';
import type { CalendarEvent } from '../types';
import ItemCard from '../components/item/ItemCard';
import { SkeletonList } from '../components/ui/Skeleton';
import { deriveStatus, todayStr } from '../design/tokens';
import { loadSeenEventIds, isNewItem, FEATURE_PREMIUM } from '../lib/constants';
import { listExploreEvents, listAllParticipatedWorks, toggleLike, toggleCalendarAdd, listLikedEventIds, listMyPriceChanges, type Work } from '../lib/api';
import { useFeature } from '../lib/premium';
import { unseenChanges } from '../lib/priceAlerts';
import { getCached, setCached } from '../lib/swrCache';
import { buildWorkColorMap } from '../lib/workColors';
import { addToCalendar } from '../lib/googleCalendar';
import { useToast } from '../components/ui/Toast';
import { useAuth } from '../contexts/AuthContext';
import { useHiddenContent } from '../hooks/useHiddenContent';
import { haptic } from '../lib/haptics';
import { useAdBanner } from '../lib/useAdBanner';
import WorkFollowSheet from '../components/WorkFollowSheet';
import WorkChipsRow from '../components/WorkChipsRow';
import ExpandingSearch from '../components/ui/ExpandingSearch';
import { loadWorkImages } from '../lib/workImages';

function shiftMonths(base: string, n: number): string {
  const d = new Date(base + 'T00:00:00');
  d.setMonth(d.getMonth() + n);
  return todayStr(d);
}

type SectionKey = 'followNew' | 'preorderOpen' | 'popular';
/** 0件のときに見出しの下に出す一言 */
const EMPTY_TEXT: Record<SectionKey, string> = {
  followNew: '新着はすべて見ました',
  preorderOpen: '受付中の予定はありません',
  popular: 'まだいいねの付いた予定はありません',
};

/** ホームの1かたまり。見出しは上部バーの下に貼りついたまま残るので、どこまでスクロールしていても
 *  見出しを押せば畳める。貼りついた状態で畳んだときは、見出しが上に来るようにスクロールを戻す */
function Section({ title, empty, items, open, onToggle, stickyTop, seen, likedIds, workColorMap, onOpen, onLike, onCalendar }: {
  title: string; empty: string; items: CalendarEvent[]; open: boolean; onToggle: () => void; stickyTop: number;
  seen: Set<string>; likedIds: Set<string>; workColorMap: Map<string, string>;
  onOpen: (e: CalendarEvent) => void;
  onLike: (e: CalendarEvent) => void | Promise<{ liked: boolean; count: number } | void>; onCalendar: (e: CalendarEvent) => void;
}) {
  const ref = useRef<HTMLElement>(null);
  const toggle = () => {
    haptic.select();
    const el = ref.current;
    const stuck = !!el && el.getBoundingClientRect().top < stickyTop - 1;
    onToggle();
    if (open && stuck && el) requestAnimationFrame(() => el.scrollIntoView({ block: 'start' }));
  };
  return (
    <section ref={ref} className="mt-2" style={{ scrollMarginTop: stickyTop }}>
      <button onClick={toggle} aria-expanded={open}
        className="sticky z-10 w-full flex items-center gap-2 px-3 py-2.5 material-bar text-left"
        style={{ top: stickyTop }}>
        <span className="text-[15px] font-bold">{title}</span>
        <span className="text-[12px] text-label-tertiary">{items.length}</span>
        <ChevronDown size={18} className="ml-auto text-label-secondary"
          style={{ transform: open ? 'none' : 'rotate(-90deg)', transition: 'transform 0.3s cubic-bezier(0.32,0.72,0,1)' }} />
      </button>
      {open && items.length === 0 && (
        <p className="px-3 pt-1 pb-3 text-[13px] text-label-tertiary">{empty}</p>
      )}
      {open && items.length > 0 && (
        <div className="flex flex-col gap-2 px-3 pt-1">
          {items.map((e) => (
            <ItemCard key={e.id} event={e} layout="compact" isNew={isNewItem(e.id, e.createdAt, seen)} likedInit={likedIds.has(e.id)}
              workColor={e.workId ? (workColorMap.get(e.workId) ?? 'var(--accent-color)') : 'var(--accent-color)'}
              onOpen={() => onOpen(e)} onLike={() => onLike(e)} onCalendar={() => onCalendar(e)} />
          ))}
        </div>
      )}
    </section>
  );
}

export default function Home() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isHidden } = useHiddenContent(user?.id);
  const toast = useToast();
  const [items, setItems] = useState<CalendarEvent[] | null>(null);
  const [follows, setFollows] = useState<Work[]>([]);
  const [followIds, setFollowIds] = useState<Set<string>>(new Set());
  const [followSheetOpen, setFollowSheetOpen] = useState(false);
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  // 作品の並びで隠した作品（カレンダー・探すと同じ動き）。このタブを開いている間だけ覚える
  const [excluded, setExcluded] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(sessionStorage.getItem('home_excluded') ?? '[]') as string[]); } catch { return new Set(); }
  });
  useEffect(() => { try { sessionStorage.setItem('home_excluded', JSON.stringify([...excluded])); } catch { /* noop */ } }, [excluded]);
  const toggleWork = (id: string) => { haptic.select(); setExcluded((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; }); };
  const [workImages, setWorkImages] = useState<Record<string, string>>(loadWorkImages);
  useEffect(() => {
    const onChange = () => setWorkImages(loadWorkImages());
    window.addEventListener('fan-work-images', onChange);
    return () => window.removeEventListener('fan-work-images', onChange);
  }, []);
  // 畳んだ状態は覚えない。ホームを開くたびに全部開いた状態から始める
  const [collapsed, setCollapsed] = useState<Set<SectionKey>>(new Set());
  const toggleSection = (k: SectionKey) => setCollapsed((p) => {
    const n = new Set(p); n.has(k) ? n.delete(k) : n.add(k);
    return n;
  });
  // 見出しを貼りつける高さ＝上部バーの高さ
  const headerRef = useRef<HTMLDivElement>(null);
  const [headerH, setHeaderH] = useState(0);
  useLayoutEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setHeaderH(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
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

  const reloadFollows = () => {
    if (!user) return;
    const fkey = `follows:${user.id}`;
    const cachedF = getCached<Work[]>(fkey);
    if (cachedF) { setFollows(cachedF); setFollowIds(new Set(cachedF.map((w) => w.id))); }
    listAllParticipatedWorks(user.id).then((ws) => { setFollows(ws); setFollowIds(new Set(ws.map((w) => w.id))); setCached(fkey, ws); }).catch(() => {});
  };

  useEffect(() => {
    if (!user) return;
    const lkey = `liked:${user.id}`;
    reloadFollows();
    const cachedL = getCached<string[]>(lkey);
    if (cachedL) setLikedIds(new Set(cachedL));
    listLikedEventIds(user.id).then((ids) => { setLikedIds(ids); setCached(lkey, [...ids]); }).catch(() => {});
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // 値下がり・再入荷（プレミアム）。1件ずつ知らせると煩わしいので、ここでは**件数だけ**出して
  // 中身は専用ページ(/price-drops)に集める。未読は端末ローカルの既読時刻で判定する。
  const priceAlerts = useFeature('priceAlerts');
  const [alertCount, setAlertCount] = useState({ drop: 0, restock: 0 });
  useEffect(() => {
    if (!user || !priceAlerts) { setAlertCount({ drop: 0, restock: 0 }); return; }
    let alive = true;
    listMyPriceChanges(user.id)
      .then((cs) => {
        if (!alive) return;
        const unseen = unseenChanges(cs);
        setAlertCount({
          drop: unseen.filter((c) => c.kind === 'price_drop').length,
          restock: unseen.filter((c) => c.kind === 'restock').length,
        });
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [user?.id, priceAlerts]); // eslint-disable-line react-hooks/exhaustive-deps
  const alertTotal = alertCount.drop + alertCount.restock;
  const alertLabel = alertCount.drop && alertCount.restock ? '値下がり・再入荷したものがあります'
    : alertCount.restock ? '再入荷したものがあります' : '値下がりしたものがあります';

  const sections = useMemo(() => {
    // フォロー中の作品の予定だけ。終了済み（終了/発売済み/受付終了）はホームに出さない
    // （終わった予定を見せてもがっかりさせるだけ。過去分は探す・カレンダーで見られる）。
    const today = todayStr();
    const all = (items ?? []).filter((e) => {
      if (!e.workId || !followIds.has(e.workId) || excluded.has(e.workId)) return false;
      if (isHidden(e)) return false;
      const st = deriveStatus(e);
      if (st === 'ended') return false;
      // 受付終了でも発売・開催がこれからなら見せる（発売待ちはまだ「これからの予定」）
      if (st === 'preorder_ended') return !!e.date && e.date > today;
      return true;
    });
    const preorderOpen = all.filter((e) => deriveStatus(e) === 'preorder')
      .sort((a, b) => (a.preorderEnd ?? '9999').localeCompare(b.preorderEnd ?? '9999')).slice(0, 12);
    // 新着は、まだ見ていないものだけ（探すの一覧で見た・詳細を開いたものは外す。0件でも見出しは出す）
    const seenIds = loadSeenEventIds();
    const followNew = all.filter((e) => !seenIds.has(e.id))
      .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? '')).slice(0, 12);
    const popular = [...all].sort((a, b) => (b.likes ?? 0) - (a.likes ?? 0)).filter((e) => (e.likes ?? 0) > 0).slice(0, 12);
    return { preorderOpen, followNew, popular };
  }, [items, followIds, excluded, isHidden]);

  const workColorMap = useMemo(() => buildWorkColorMap(follows), [follows]);
  const seen = useMemo(() => loadSeenEventIds(), [items]);
  const onOpen = (e: CalendarEvent) => navigate(`/item/${e.id}`);
  const onLike = async (e: CalendarEvent) => { haptic.select(); return user ? toggleLike(e.id, user.id) : undefined; };
  const onCalendar = async (e: CalendarEvent) => {
    haptic.select();
    const r = await addToCalendar(e);
    if (r !== 'fail' && user) toggleCalendarAdd(e.id, user.id).catch(() => {});
    toast(r === 'google' ? 'Googleカレンダーに追加しました' : r === 'ics' ? 'カレンダーに追加しました' : '日付未定のため追加できません');
  };


  // 一番上の行。値下がり・再入荷があればその件数（中身は専用ページ）。
  // 無料の人には受け取れることの案内（決済が繋がるまでは出さない＝FEATURE_PREMIUM）。どちらも無ければ見出しだけ
  const topBar = alertTotal > 0 ? (
    <button onClick={() => { haptic.select(); navigate('/price-drops'); }}
      className="pressable w-full h-9 flex items-center gap-2 px-3 rounded-full border"
      style={{ borderColor: 'var(--color-success)', backgroundColor: 'var(--bg-secondary)' }}>
      <TrendingDown size={16} style={{ color: 'var(--color-success)' }} className="flex-shrink-0" />
      <span className="flex-1 min-w-0 truncate text-left text-[13px] font-semibold">{alertLabel}（{alertTotal}件）</span>
      <ChevronRight size={16} className="text-label-tertiary flex-shrink-0" />
    </button>
  ) : FEATURE_PREMIUM && !priceAlerts ? (
    <button onClick={() => { haptic.select(); navigate('/premium'); }}
      className="pressable w-full h-9 flex items-center gap-2 px-3 rounded-full"
      style={{ backgroundColor: 'var(--bg-secondary)' }}>
      <TrendingDown size={16} className="text-label-secondary flex-shrink-0" />
      <span className="flex-1 min-w-0 truncate text-left text-[12px] text-label-secondary">いいねしたグッズの値下がり・再入荷を受け取る</span>
      <ChevronRight size={16} className="text-label-tertiary flex-shrink-0" />
    </button>
  ) : (
    <span className="text-[22px] font-bold tracking-tight">ホーム</span>
  );

  // 広告バナー: ステータスバー直下に表示し、ヘッダー余白をバナー高さ分広げて被りを防ぐ。
  const adPad = useAdBanner();

  return (
    <div ref={rootRef}>
      {/* 上部: 値下がり・再入荷のバー（右端の虫眼鏡を押すとバーが削れて検索欄になる）／作品の並び */}
      {/* 下端を透かす scroll-edge は付けない。すぐ下に見出しが貼りつくので、透かすと間に隙間が見える */}
      <div ref={headerRef} className="px-3 pt-3 pb-2 sticky top-0 z-20 material-bar" data-skin-bar="main" style={{ paddingTop: adPad }}>
        <div className="flex items-center">
          <ExpandingSearch value={query} onChange={setQuery} placeholder="グッズ・イベントを検索"
            onSubmit={(q) => navigate(`/explore?q=${encodeURIComponent(q)}`)}
            title={topBar} />
        </div>
        <WorkChipsRow works={follows} colors={workColorMap} images={workImages} excluded={excluded}
          onToggle={toggleWork} onShowAll={() => setExcluded(new Set())}
          trailing={
            <button onClick={() => { haptic.select(); setFollowSheetOpen(true); }}
              className="pressable flex-shrink-0 flex items-center gap-0.5 h-7 px-2.5 rounded-full text-[12px] font-medium whitespace-nowrap border border-dashed"
              style={{ borderColor: 'var(--accent-color)', color: 'var(--accent-text)' }}>
              <Plus size={13} /> 作品
            </button>
          } />
      </div>
      <WorkFollowSheet open={followSheetOpen} onClose={() => setFollowSheetOpen(false)} onChanged={reloadFollows} />

      {items === null ? (
        <div className="px-3 pt-3"><SkeletonList count={3} /></div>
      ) : (
        <div className="pb-4">
          {([['followNew', 'フォロー作品の新着'], ['preorderOpen', '受付中'], ['popular', '人気']] as const).map(([k, title]) => (
            <Section key={k} title={title} empty={follows.length === 0 ? '作品をフォローすると、ここに予定が出ます' : EMPTY_TEXT[k]} items={sections[k]} open={!collapsed.has(k)} onToggle={() => toggleSection(k)} stickyTop={headerH}
              seen={seen} likedIds={likedIds} workColorMap={workColorMap} onOpen={onOpen} onLike={onLike} onCalendar={onCalendar} />
          ))}
        </div>
      )}
    </div>
  );
}

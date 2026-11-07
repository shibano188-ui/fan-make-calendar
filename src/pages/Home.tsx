import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useNavigationType, useSearchParams } from 'react-router-dom';
import { TrendingDown, ChevronRight } from 'lucide-react';
import type { CalendarEvent } from '../types';
import { deriveItemType, todayStr } from '../design/tokens';
import { loadSeenEventIds, addSeenEventId, FOLLOWS_EVENT } from '../lib/constants';
import { listExploreEvents, listAllParticipatedWorks, listFollowDates, toggleLike, listLikedEventIds, listMyPriceChanges, type Work } from '../lib/api';
import { useFeature, usePremium } from '../lib/premium';
import { unseenChanges } from '../lib/priceAlerts';
import { getCached, setCached, loadCachedLarge, setCachedLarge, EXPLORE_EVENTS_KEY } from '../lib/swrCache';
import { buildWorkColorMap } from '../lib/workColors';
import { useAuth } from '../contexts/AuthContext';
import { useHiddenContent } from '../hooks/useHiddenContent';
import { haptic } from '../lib/haptics';
import { useAdBanner } from '../lib/useAdBanner';
import { useToast } from '../components/ui/Toast';
import { SkeletonList } from '../components/ui/Skeleton';
import WorkFollowSheet from '../components/WorkFollowSheet';
import ExpandingSearch from '../components/ui/ExpandingSearch';
import { loadWorkImages } from '../lib/workImages';
import {
  storySince, freeCutoff, buildWorkGroups, buildWeekGroup, workNext, daysBetween,
  loadStreak, currentStreak, markStreakToday, WEEK_KEY, type StoryGroup,
} from '../lib/story';
import StoryViewer, { type StoryPosition } from '../components/story/StoryViewer';
import { WorkStoryCard, WeekStoryCard, AddWorkCard } from '../components/story/WorkStoryCard';
import { useWorkImagePicker } from '../components/story/useWorkImagePicker';
import { useSearchSuggest, SuggestList } from '../components/ui/SearchSuggest';

// ホーム（2026-10-04 作り直し・柴野）。仕様 → Obsidian: Decisions/2026-10-04-fanhive-home-story-premium.md
//   上: プロフィール（アイコン・名前・称号・ヌシ・連続記録・追加した予定）
//   中: 作品カードの横スクロール（1画面に2枚）。先頭は「今週のまとめ」、最後は「作品を追加」
//   丸を押すとストーリー。今週発売・受付中・人気の区画は「今週のまとめ」に移した

function shiftMonths(base: string, n: number): string {
  const d = new Date(base + 'T00:00:00');
  d.setMonth(d.getMonth() + n);
  return todayStr(d);
}


// 詳細を開いて「戻る」で帰ってきたら、ストーリーの続きから開き直す
let storyResume: { key: string; eventId: string } | null = null;


export default function Home() {
  const navigate = useNavigate();
  const navType = useNavigationType();
  const [searchParams] = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const { isHidden } = useHiddenContent(user?.id);
  const toast = useToast();
  const premium = usePremium();
  const [items, setItems] = useState<CalendarEvent[] | null>(null);
  const [follows, setFollows] = useState<Work[]>([]);
  // フォロー中の作品を読み終えたか。一覧はキャッシュから先に出るので、読み終える前に「0作品」として
  // フォローしていない人向けの案内が一瞬出ていた（2026-10-04 柴野「ヒヤヒヤする」）。読み終えるまでは読み込み中を出す
  const [followsReady, setFollowsReady] = useState(false);
  const [followIds, setFollowIds] = useState<Set<string>>(new Set());
  const [followDates, setFollowDates] = useState<Map<string, string>>(new Map());
  const [followSheetOpen, setFollowSheetOpen] = useState(false);
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [workImages, setWorkImages] = useState<Record<string, string>>(loadWorkImages);
  useEffect(() => {
    const onChange = () => setWorkImages(loadWorkImages());
    window.addEventListener('fan-work-images', onChange);
    return () => window.removeEventListener('fan-work-images', onChange);
  }, []);
  const iconPicker = useWorkImagePicker();
  const [seen, setSeen] = useState<Set<string>>(loadSeenEventIds);
  const [, setStreak] = useState(() => currentStreak(loadStreak()));
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
    // 期間は日付で変わるが、キーは固定（昨日の一覧でも、取り直すまでの間に出すには十分）
    const key = EXPLORE_EVENTS_KEY;
    // キャッシュを即表示し、裏で再取得して最新化（Exploreタブと共有）
    const cached = getCached<CalendarEvent[]>(key);
    if (cached) setItems(cached);
    else void loadCachedLarge<CalendarEvent[]>(key).then((v) => { if (alive && v) setItems((prev) => prev ?? v); });
    listExploreEvents(from, to)
      .then((d) => { if (!alive) return; setItems(d); setCachedLarge(key, d); })
      .catch(() => { if (alive) setItems((prev) => prev ?? []); });
    return () => { alive = false; };
  }, [today]);

  const reloadFollows = () => {
    if (!user) return;
    const fkey = `follows:${user.id}`;
    const cachedF = getCached<Work[]>(fkey);
    if (cachedF) { setFollows(cachedF); setFollowIds(new Set(cachedF.map((w) => w.id))); setFollowsReady(true); }
    listAllParticipatedWorks(user.id).then((ws) => { setFollows(ws); setFollowIds(new Set(ws.map((w) => w.id))); setCached(fkey, ws); })
      .catch(() => {}).finally(() => setFollowsReady(true));
    listFollowDates(user.id).then(setFollowDates).catch(() => {});
  };

  useEffect(() => {
    if (!user) return;
    const lkey = `liked:${user.id}`;
    reloadFollows();
    const cachedL = getCached<string[]>(lkey);
    if (cachedL) setLikedIds(new Set(cachedL));
    listLikedEventIds(user.id).then((ids) => { setLikedIds(ids); setCached(lkey, [...ids]); }).catch(() => {});
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // オンボーディングはこの画面の上に重なって作品を選ばせるので、閉じてもこの画面は開き直さない。
  // 知らせを受けて作品の並びを読み直す（読み直さないと、選んだ作品が上の並びに出ない）
  useEffect(() => {
    const onFollows = () => reloadFollows();
    window.addEventListener(FOLLOWS_EVENT, onFollows);
    return () => window.removeEventListener(FOLLOWS_EVENT, onFollows);
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

  // ─── ストーリー ───────────────────────────────────────────────
  const workColorMap = useMemo(() => buildWorkColorMap(follows), [follows]);
  // 無料の人は毎朝9時までの投稿だけ。課金の人は投稿された時点で入る
  const cutoff = useMemo(() => (premium ? null : freeCutoff()), [premium, today]);
  const since = useMemo(() => storySince(), []);
  const workGroups = useMemo(() => buildWorkGroups(items ?? [], follows, {
    seen, since, cutoff, colors: workColorMap, images: workImages, isHidden,
  }), [items, follows, seen, since, cutoff, workColorMap, workImages, isHidden]);
  const weekGroup = useMemo(() => buildWeekGroup(items ?? [], followIds, seen, isHidden), [items, followIds, seen, isHidden]);
  // 検索の候補（打っている途中から出す）。探すと同じく、フォロー中の作品の予定から
  const followedItems = useMemo(() => (items ?? []).filter((e) => e.workId && followIds.has(e.workId) && !isHidden(e)), [items, followIds, isHidden]);
  const suggest = useSearchSuggest(query, followedItems);
  const allGroups = useMemo(() => [weekGroup, ...workGroups], [weekGroup, workGroups]);
  const weekCounts = useMemo(() => ({
    deadline: weekGroup.pages.filter((p) => p.badge?.includes('締切')).length,
    release: weekGroup.pages.filter((p) => p.badge?.includes('発売')).length,
    popular: weekGroup.pages.filter((p) => p.badge === '人気').length,
  }), [weekGroup]);
  // まだ見ていない新着の合計（見るたびに減る）
  const unseenTotal = useMemo(() => workGroups.reduce((n, g) => n + g.unseen, 0), [workGroups]);
  // 作品ごとの「次の予定」
  const nexts = useMemo(() => {
    const byWork = new Map<string, CalendarEvent[]>();
    for (const e of items ?? []) if (e.workId) (byWork.get(e.workId) ?? byWork.set(e.workId, []).get(e.workId)!).push(e);
    return new Map(follows.map((w) => [w.id, workNext(byWork.get(w.id) ?? [], likedIds, isHidden)]));
  }, [items, follows, likedIds, isHidden]);

  // 開いている間は、開いた時点の並びを固定する（めくって「見た」が増えるたびに並びが変わらないように）
  const [story, setStory] = useState<{ groups: StoryGroup[]; initial: StoryPosition } | null>(null);
  const openStory = (key: string, eventId?: string) => {
    const groups = allGroups;
    const g = groups.findIndex((x) => x.key === key);
    if (g < 0) return;
    if (!groups[g].pages.length) { toast(key === WEEK_KEY ? '今週の予定はまだありません' : '新着はまだありません'); return; }
    const byId = eventId ? groups[g].pages.findIndex((p) => p.event.id === eventId) : -1;
    setStory({ groups, initial: { group: g, page: byId >= 0 ? byId : groups[g].start } });
  };
  const closeStory = () => { setStory(null); setSeen(loadSeenEventIds()); };
  const onSeen = (e: CalendarEvent) => {
    addSeenEventId(e.id);
    setStreak(currentStreak(markStreakToday()));
  };

  // 詳細から戻ってきた・通知から ?story=<作品> で開いた
  const resumed = useRef(false);
  useEffect(() => {
    if (resumed.current || !items || !followsReady) return;
    resumed.current = true;
    const param = searchParams.get('story');
    if (param) { navigate('/', { replace: true }); openStory(param); return; }
    if (navType === 'POP' && storyResume) { const r = storyResume; storyResume = null; openStory(r.key, r.eventId); }
  }, [items, followsReady]); // eslint-disable-line react-hooks/exhaustive-deps

  // 新着が1件も無い日は、ホームを開くだけで連続記録を伸ばす
  useEffect(() => {
    if (!items || !followsReady || !follows.length) return;
    if (workGroups.every((g) => g.unseen === 0)) setStreak(currentStreak(markStreakToday()));
  }, [items, followsReady]); // eslint-disable-line react-hooks/exhaustive-deps

  const openEvent = (e: CalendarEvent) => navigate(`/item/${e.id}`);
  const onLike = async (e: CalendarEvent, want: boolean) => (user ? toggleLike(e.id, user.id, want) : undefined);
  // 新着を見る＝その作品の新着だけ（?new=1。ホームの作品の丸と同じ範囲）。この作品を探す＝その作品の予定すべて。
  // グッズ／イベントは、その中で多いほうで開く（少ないほうで開くと何も出ないことがあった）
  const goExplore = (workId: string, onlyNew: boolean) => {
    const g = workGroups.find((x) => x.workId === workId);
    const pool = onlyNew
      ? (g?.pages ?? []).filter((p) => !seen.has(p.event.id)).map((p) => p.event)
      : (items ?? []).filter((e) => e.workId === workId && !isHidden(e));
    const goods = pool.filter((e) => deriveItemType(e) === 'goods').length;
    const mode = pool.length ? (goods * 2 >= pool.length ? 'goods' : 'event') : null;
    navigate(`/explore?work=${workId}${onlyNew ? '&new=1' : ''}${mode ? `&mode=${mode}` : ''}`);
  };

  // カードの高さは、下のタブの手前まで（画面を埋める）
  const cardsRef = useRef<HTMLDivElement>(null);
  const [cardH, setCardH] = useState(420);
  useLayoutEffect(() => {
    const measure = () => {
      const el = cardsRef.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top + window.scrollY;
      setCardH(Math.max(330, Math.round(window.innerHeight - top - 124)));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [followsReady, items === null, unseenTotal > 0, alertTotal > 0]);

  // 値下がり・再入荷があればその件数（中身は専用ページ）。2026-11-07 デザインの一新: 見出しの下に1行で出す。
  // 受け取れることの案内（プレミアム）はマイページへ移した
  const alertRow = alertTotal > 0 ? (
    <button onClick={() => { haptic.select(); navigate('/price-drops'); }}
      className="pressable mx-4 mt-3 w-[calc(100%-32px)] flex items-center gap-2 py-2.5 text-left"
      style={{ borderTop: '0.5px solid var(--separator)', borderBottom: '0.5px solid var(--separator)' }}>
      <TrendingDown size={18} aria-hidden style={{ color: 'var(--color-success)' }} className="flex-shrink-0" />
      <span className="flex-1 min-w-0 truncate text-[14px] font-semibold">{alertLabel}</span>
      <span className="num text-[15px] font-extrabold" style={{ color: 'var(--color-success)' }}>{alertTotal}</span>
      <ChevronRight size={16} aria-hidden className="text-label-tertiary flex-shrink-0" />
    </button>
  ) : null;

  // 広告バナー: ステータスバー直下に表示し、ヘッダー余白をバナー高さ分広げて被りを防ぐ。
  const adPad = useAdBanner();
  const loading = items === null || (!followsReady && (authLoading || !!user));
  // 無料の人の次の9時が今日か明日か（9時より前に開いたら今日）

  return (
    <div ref={rootRef}>
      <div className="px-4 pb-1 sticky top-0 z-20" data-skin-bar="main" style={{ paddingTop: adPad, backgroundColor: 'var(--bg-primary)' }}>
        <div className="flex items-center h-11">
          <ExpandingSearch value={query} onChange={setQuery} placeholder="グッズ・イベントを検索"
            onSubmit={(q) => navigate(`/explore?q=${encodeURIComponent(q)}`)}
            title={<h1 className="text-[24px] font-extrabold">ホーム</h1>}
            suggest={<SuggestList query={query} works={suggest.works} events={suggest.events}
              onWork={(w) => navigate(`/explore?q=${encodeURIComponent(w.name)}`)}
              onEvent={(e) => navigate(`/item/${e.id}`)}
              onAll={() => navigate(`/explore?q=${encodeURIComponent(query.trim())}`)} />} />
        </div>
      </div>
      <WorkFollowSheet open={followSheetOpen} onClose={() => setFollowSheetOpen(false)} onChanged={reloadFollows} />
      {iconPicker.input}

      {/* まだ見ていない新着の数を大きな数字で。見るたびに減る。押すと新着のある最初の作品から見られる。
          2026-11-07 デザインの一新: プロフィールの券と課金の入口はマイページへ移し、ここは新着だけにした */}
      {!loading && unseenTotal > 0 && (
        <button onClick={() => { haptic.select(); const g = workGroups.find((x) => x.unseen > 0); if (g) openStory(g.key); }}
          className="pressable mx-4 mt-1 w-[calc(100%-32px)] flex items-end gap-3 text-left">
          <span className="num text-[60px] font-extrabold leading-[0.82]" style={{ color: 'var(--color-destructive)' }}>{unseenTotal}</span>
          <span className="flex-1 min-w-0 pb-0.5">
            <span className="block text-[17px] font-extrabold leading-tight">件の新着</span>
            {/* 「ストーリー」は Instagram の呼び名なので出さず、何ができるかで書く（2026-10-04 柴野） */}
            <span className="block text-[12px] text-label-secondary">作品を押してチェック</span>
          </span>
          <ChevronRight size={20} aria-hidden className="text-label-tertiary flex-shrink-0 mb-1" />
        </button>
      )}
      {alertRow}
      {/* 作品のアイコンに推しの画像を入れられることの案内は、場面ごとのヒント（Hints.tsx の home-icon）にした（2026-11-07 柴野） */}
      {loading ? (
        <div className="px-3 pt-3"><SkeletonList count={2} /></div>
      ) : (
        <div ref={cardsRef} className="flex gap-3 overflow-x-auto snap-x snap-mandatory px-4 pt-4 pb-2 scroll-px-4" style={{ scrollbarWidth: 'none' }}>
          {follows.length > 0 && (
            <WeekStoryCard group={weekGroup} height={cardH} counts={weekCounts} onStory={() => openStory(WEEK_KEY)} />
          )}
          {workGroups.map((g) => {
            const at = followDates.get(g.key);
            return (
              <WorkStoryCard key={g.key} group={g} height={cardH}
                followDays={at ? Math.max(1, daysBetween(todayStr(new Date(at)), today) + 1) : null}
                next={nexts.get(g.key) ?? { mine: false, main: null, after: [] }}
                onStory={() => openStory(g.key)}
                onPickIcon={() => void iconPicker.pick(g.key)}
                onNew={() => goExplore(g.key, true)}
                onSearch={() => goExplore(g.key, false)}
                onOpenEvent={openEvent} />
            );
          })}
          <AddWorkCard height={cardH} onAdd={() => setFollowSheetOpen(true)} />
        </div>
      )}
      {!loading && follows.length === 0 && (
        <p className="px-4 pt-1 text-[13px] text-label-tertiary">作品をフォローすると、ここに作品ごとの新着と次の予定が出ます</p>
      )}

      {story && (
        <StoryViewer groups={story.groups} initial={story.initial} onClose={closeStory} onSeen={onSeen} onLike={onLike} likedIds={likedIds}
          onOpenDetail={(e, pos, tab) => {
            storyResume = { key: story.groups[pos.group].key, eventId: e.id };
            setStory(null);
            navigate(`/item/${e.id}${tab ? `?tab=${tab}` : ''}`);
          }} />
      )}
    </div>
  );
}

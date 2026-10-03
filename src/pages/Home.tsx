import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useNavigationType, useSearchParams } from 'react-router-dom';
import { TrendingDown, ChevronRight, Crown } from 'lucide-react';
import type { CalendarEvent } from '../types';
import { deriveItemType, todayStr } from '../design/tokens';
import { loadSeenEventIds, addSeenEventId, FEATURE_PREMIUM, FOLLOWS_EVENT, DEFAULT_AVATAR } from '../lib/constants';
import { listExploreEvents, listAllParticipatedWorks, listFollowDates, toggleLike, listLikedEventIds, listMyPriceChanges, getUserPublicProfile, type Work } from '../lib/api';
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
import { calcTitle } from '../lib/achievements';
import { listMyNushi, shortWorkName, type WorkNushi } from '../lib/ranking';
import {
  storySince, freeCutoff, buildWorkGroups, buildWeekGroup, workNext, daysBetween,
  loadStreak, currentStreak, markStreakToday, WEEK_KEY, type StoryGroup,
} from '../lib/story';
import StoryViewer, { type StoryPosition } from '../components/story/StoryViewer';
import { WorkStoryCard, WeekStoryCard, AddWorkCard } from '../components/story/WorkStoryCard';
import { useWorkImagePicker } from '../components/story/useWorkImagePicker';

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

type Profile = { name: string; avatar: string | null; title: string; nushi: WorkNushi[] };

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
  const [streak, setStreak] = useState(() => currentStreak(loadStreak()));
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

  // プロフィール（マイページと同じもの）。前回の分を先に出す
  const [profile, setProfile] = useState<Profile | null>(null);
  useEffect(() => {
    if (!user) return;
    const pkey = `home-profile:${user.id}`;
    const cachedP = getCached<Profile>(pkey);
    if (cachedP) setProfile(cachedP);
    let alive = true;
    Promise.all([getUserPublicProfile(user.id), listMyNushi(user.id).catch(() => [] as WorkNushi[])])
      .then(([p, nushi]) => {
        if (!alive) return;
        const next: Profile = {
          name: p.displayName ?? '', avatar: p.avatarEmoji, nushi,
          title: calcTitle({ posted: p.postedCount, received: p.receivedLikes, likesGiven: p.likesGiven, reactionsGiven: p.reactionsGiven, works: p.works, birthdayPosts: p.birthdayPosts }),
        };
        setProfile(next); setCached(pkey, next);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [user?.id]);

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
  const allGroups = useMemo(() => [weekGroup, ...workGroups], [weekGroup, workGroups]);
  const weekCounts = useMemo(() => ({
    deadline: weekGroup.pages.filter((p) => p.badge?.includes('締切')).length,
    release: weekGroup.pages.filter((p) => p.badge?.includes('発売')).length,
    popular: weekGroup.pages.filter((p) => p.badge === '人気').length,
  }), [weekGroup]);
  // 無料の人に、9時を待っている新着の件数を知らせる（課金の案内につなげる）
  const waiting = useMemo(() => {
    if (!cutoff || !items) return 0;
    return items.filter((e) => e.workId && followIds.has(e.workId) && (e.createdAt ?? '') > cutoff && !isHidden(e)).length;
  }, [items, followIds, cutoff, isHidden]);
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
  const onLike = async (e: CalendarEvent) => (user ? toggleLike(e.id, user.id) : undefined);
  const goExplore = (workId: string, unread: boolean) => {
    // 新着を見るときは、未読の多いほう（グッズ／イベント）で開く
    const g = workGroups.find((x) => x.workId === workId);
    const unseen = (g?.pages ?? []).filter((p) => !seen.has(p.event.id));
    const goods = unseen.filter((p) => deriveItemType(p.event) === 'goods').length;
    const mode = unread && unseen.length ? (goods * 2 >= unseen.length ? 'goods' : 'event') : null;
    navigate(`/explore?work=${workId}${unread ? '&unread=1' : ''}${mode ? `&mode=${mode}` : ''}`);
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
  }, [profile, followsReady, items === null, waiting > 0]);

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
      {/* 前の「いいねしたグッズの値下がり・再入荷を受け取る」は長くて見切れ、何が届くのか・有料なのかが伝わらなかった。
          何が届くかを短く書き、有料であることは札で示す。狭い iPhone SE でも見切れないよう、左のアイコンは付けない */}
      <span className="flex-1 min-w-0 truncate text-left text-[12px] font-semibold">値下げ・再入荷を通知</span>
      <span className="flex-shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full"
        style={{ backgroundColor: 'color-mix(in srgb, var(--accent-color) 20%, transparent)', color: 'var(--accent-text)' }}>プレミアム</span>
      <ChevronRight size={16} className="text-label-tertiary flex-shrink-0" />
    </button>
  ) : (
    <span className="text-[22px] font-bold tracking-tight">ホーム</span>
  );

  // 広告バナー: ステータスバー直下に表示し、ヘッダー余白をバナー高さ分広げて被りを防ぐ。
  const adPad = useAdBanner();
  const loading = items === null || (!followsReady && (authLoading || !!user));

  return (
    <div ref={rootRef}>
      <div className="px-3 pt-3 pb-2 sticky top-0 z-20 material-bar" data-skin-bar="main" style={{ paddingTop: adPad }}>
        <div className="flex items-center">
          <ExpandingSearch value={query} onChange={setQuery} placeholder="グッズ・イベントを検索"
            onSubmit={(q) => navigate(`/explore?q=${encodeURIComponent(q)}`)}
            title={topBar} />
        </div>
      </div>
      <WorkFollowSheet open={followSheetOpen} onClose={() => setFollowSheetOpen(false)} onChanged={reloadFollows} />
      {iconPicker.input}

      {/* プロフィール。押すとマイページ */}
      <button onClick={() => { haptic.select(); navigate('/mypage'); }} className="pressable w-full flex items-center gap-3 px-4 pt-2 pb-1 text-left">
        <span className="w-12 h-12 rounded-full flex items-center justify-center text-[26px] flex-shrink-0" style={{ backgroundColor: 'var(--fill-tertiary)' }}>
          {profile?.avatar ?? DEFAULT_AVATAR}
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-[16px] font-bold truncate">{profile?.name || '名無しのファン'}</span>
          <span className="flex items-center gap-1 mt-0.5 flex-wrap">
            {profile?.title && (
              <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[11px] font-bold"
                style={{ backgroundColor: 'color-mix(in srgb, var(--accent-color) 18%, transparent)', color: 'var(--accent-text)' }}>
                <Crown size={10} strokeWidth={2.5} />{profile.title}
              </span>
            )}
            {profile?.nushi.slice(0, 1).map((n) => (
              <span key={n.workId} className="text-[11px] text-label-secondary">{shortWorkName(n.workName)}のヌシ</span>
            ))}
          </span>
          <span className="block text-[11px] text-label-tertiary mt-0.5">追加した予定 {likedIds.size}件</span>
        </span>
        <span className="flex flex-col items-center flex-shrink-0" aria-label={`${streak}日連続`}>
          <span className="text-[22px] leading-none" style={{ filter: streak ? 'none' : 'grayscale(1)', opacity: streak ? 1 : 0.4 }}>🔥</span>
          <span className="text-[12px] font-bold tabular-nums mt-0.5">{streak}日</span>
        </span>
      </button>

      {!premium && FEATURE_PREMIUM && waiting > 0 && (
        <button onClick={() => { haptic.select(); navigate('/premium'); }}
          className="pressable mx-3 mt-1 w-[calc(100%-24px)] flex items-center gap-2 px-3 py-2 rounded-[10px] text-left" style={{ backgroundColor: 'var(--bg-secondary)' }}>
          <span className="flex-1 text-[12px] text-label-secondary leading-snug">
            新しい予定が{waiting}件届いています。明日の朝9時にストーリーに入ります（プレミアムならすぐ見られます）
          </span>
          <ChevronRight size={16} className="text-label-tertiary flex-shrink-0" />
        </button>
      )}

      {loading ? (
        <div className="px-3 pt-3"><SkeletonList count={2} /></div>
      ) : (
        <div ref={cardsRef} className="flex gap-3 overflow-x-auto snap-x snap-mandatory px-3 pt-3 pb-2 scroll-px-3" style={{ scrollbarWidth: 'none' }}>
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
        <StoryViewer groups={story.groups} initial={story.initial} onClose={closeStory} onSeen={onSeen} onLike={onLike}
          onOpenDetail={(e, pos, tab) => {
            storyResume = { key: story.groups[pos.group].key, eventId: e.id };
            setStory(null);
            navigate(`/item/${e.id}${tab ? `?tab=${tab}` : ''}`);
          }} />
      )}
    </div>
  );
}

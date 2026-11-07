import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { SlidersHorizontal, Crown, Palette, MoreHorizontal } from 'lucide-react';
import type { CalendarEvent, EventVisit } from '../types';
import Chip from '../components/ui/Chip';
import WorkChipsRow from '../components/WorkChipsRow';
import { loadSharedFilters, saveSharedFilters } from '../lib/sharedFilters';
import ExpandingSearch, { SearchSideButtons } from '../components/ui/ExpandingSearch';
import { useTyping } from '../hooks/useTyping';
import { includesToday } from '../components/SavedCalendar';
import SavedBoard, { useStickyTop } from '../components/board/SavedBoard';
import FilterPanel, { type Facet } from '../components/item/FilterPanel';
import { SkeletonList } from '../components/ui/Skeleton';
import { deriveStatus, todayStr, STATUS, type ItemStatus } from '../design/tokens';
import { getHomePrefecture, toggleLike, listAllParticipatedWorks, type Work } from '../lib/api';
import { loadWorkImages } from '../lib/workImages';
import { useTheme } from '../contexts/ThemeContext';
import { EventStyleSheet } from '../components/item/EventStylePicker';
import { peekSaved, loadSaved, updateSaved } from '../lib/savedStore';
import { parseCategories, isNotifyOn, setNotifyOn, FEATURE_PREMIUM } from '../lib/constants';

import { buildWorkColorMap } from '../lib/workColors';
import { logSearch } from '../lib/dataLogs';
import { syncNotifyWithLike, scheduleForEvent } from '../lib/notifications';
import { setLike } from '../lib/likeStore';
import { useAuth } from '../contexts/AuthContext';
import { useHiddenContent } from '../hooks/useHiddenContent';
import { useToast } from '../components/ui/Toast';
import { REGIONS, ADJACENT } from '../lib/prefectures';
import { haptic } from '../lib/haptics';
import { usePremium } from '../lib/premium';
import { useTourStep, tourEventId, tourLikedEvent } from '../components/OnboardingTour';
import { useBackToClose } from '../lib/backStack';
import { useSearchSuggest, SuggestList, normalizeSearch, namesByReading, matchesSearch } from '../components/ui/SearchSuggest';

// 「予約受付中」は状態の選択肢と重なるので外した（前に選んでいた人は「すべて」に戻る）
type Tab = 'all' | 'mine' | 'notify';

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
  // 最初に開く表示はボード（2026-11-07 からボードを主にする）。
  // 前に選んだ表示を戻すのは、詳細から戻ってきたとき（POP）だけ。タブから開いたときはいつもボード
  // （前は同じ起動の間ずっと前の表示を覚えていて、一度月にするとボードで開かなくなっていた・柴野）
  // 2026-11-07 デザインの一新: 表示はボードだけにした（月・週・日・リストの切り替えをなくした・柴野）。
  // 「その他」のメニュー（カスタマイズ・プレミアム）の位置。上部バーの外（body）に出して画面の座標で置く
  const [menuAt, setMenuAt] = useState<{ top: number; right: number } | null>(null);
  // 表示中の月・週・日。見出しと「今日」ボタンのためにここで持つ
  const [anchor, setAnchor] = useState<string>(todayStr());
  // ボードで見出しの「今日」を押した回数（押したらボードの一番上へ戻る）
  const [todayTick, setTodayTick] = useState(0);
  const premium = usePremium();

  // 探すと同じ絞り込み
  const [query, setQuery] = useState<string>(_ss.query ?? '');
  const sideRef = useRef<HTMLDivElement>(null);
  const [filterOpen, setFilterOpen] = useState<boolean>(_ss.filterOpen ?? false);
  // Android の戻るで閉じる（前は、ホーム・探す・カレンダー・マイページの上で開いているとアプリごと終わっていた）
  useBackToClose(filterOpen, () => setFilterOpen(false));
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
  // 見出しは「11月」。今年でない月だけ年を小さく添える。今月を見ていないときだけ「今日」を出す
  const showToday = !includesToday('month', anchor, today);
  const rootRef = useRef<HTMLDivElement>(null);

  // フィルター状態を sessionStorage に同期（詳細から戻っても維持）
  useEffect(() => {
    sessionStorage.setItem('saved_filters', JSON.stringify({
      tab, query, filterOpen,
      statuses: [...selectedStatuses], excludedWorks: [...excludedWorks], categories: [...selectedCategories],
      prefs: [...selectedPrefs], regions: [...selectedRegions], neighborActive,
    }));
    saveSharedFilters({
      statuses: [...selectedStatuses], excludedWorks: [...excludedWorks], categories: [...selectedCategories],
      prefs: [...selectedPrefs], regions: [...selectedRegions], neighborActive,
    });
  }, [tab, query, filterOpen, selectedStatuses, excludedWorks, selectedCategories, selectedPrefs, selectedRegions, neighborActive]);

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


  // 左へスワイプして外したとき（ボード）。いいねを外し、トーストの「元に戻す」で付け直してカレンダーに戻す。
  // 外した瞬間にトーストを出す（前は通信を待ってから出していて、行が消えてから1秒ほど何も出なかった）。通信は裏で行い、
  // 失敗したら行を戻す
  const onRemove = (e: CalendarEvent) => {
    if (!user) return;
    // 元に戻したとき、通知も外す前の状態に戻す（♡で通知ONは既定OFFなので、付け直すだけでは戻らない）
    const notifyWas = isNotifyOn(e.id);
    const putBack = (likes?: number) => {
      const restored = { ...e, likedByMe: true, ...(likes != null ? { likes } : {}) };
      const add = (list: CalendarEvent[]) => (list.some((it) => it.id === e.id) ? list : [...list, restored]);
      setItems((prev) => (prev ? add(prev) : prev));
      updateSaved(user.id, add);
      if (notifyWas) { setNotifyOn(e.id, true); void scheduleForEvent(e).catch(() => {}); }
    };
    setItems((prev) => (prev ? prev.filter((it) => it.id !== e.id) : prev));
    updateSaved(user.id, (list) => list.filter((it) => it.id !== e.id));
    void syncNotifyWithLike(e, false);
    // 「外す」と決めて送る（切り替えにすると、ほかの端末で外してあった予定に ♡ が付き直す）。
    // 探す・詳細の ♡ にも映す（共有のいいねの状態を書き換えないと、探すに戻ったとき ♡ が付いたまま見える）
    const removing = toggleLike(e.id, user.id, false)
      .then((r) => { setLike(e.id, { liked: false, count: r.count }); return true; })
      .catch(() => { putBack(); toast('外せませんでした。通信を確かめてください', 'error'); return false; });
    toast('カレンダーから外しました', 'success', {
      label: '元に戻す',
      onClick: async () => {
        if (!(await removing)) return;
        const back = await toggleLike(e.id, user.id, true).catch(() => null);
        if (!back?.liked) { toast('戻せませんでした。通信を確かめてください', 'error'); return; }
        setLike(e.id, { liked: true, count: back.count });
        putBack(back.count);
        toast('カレンダーに戻しました');
      },
    });
  };

  // ボードで行く日を選び直したとき。選んだ日がカレンダーにすぐ出るよう、覚えている予定にも映す
  const onVisits = (e: CalendarEvent, visits: EventVisit[]) => {
    if (!user) return;
    const apply = (list: CalendarEvent[]) => list.map((it) => (it.id === e.id ? { ...it, visits } : it));
    setItems((prev) => (prev ? apply(prev) : prev));
    updateSaved(user.id, apply);
  };

  // リスト表示のカードから色とアイコンを選ぶ。選んだらカードの色へすぐ映す
  const [styling, setStyling] = useState<CalendarEvent | null>(null);
  const [styleTick, setStyleTick] = useState(0);
  // ボードの「アイコンを変える」で作品の色を変えたら、作品の並び・カードの色にもすぐ映す
  useEffect(() => {
    const on = () => setStyleTick((t) => t + 1);
    window.addEventListener('fan-work-colors', on);
    return () => window.removeEventListener('fan-work-colors', on);
  }, []);


  // 作品の並びの四角の色。カレンダーの帯と同じ保存先なので、同じ作品は同じ色になる
  const followedColor = useMemo(() => buildWorkColorMap(followedWorks), [followedWorks, styleTick]); // eslint-disable-line react-hooks/exhaustive-deps

  // スコープ（すべて / いいね / 自分の投稿）→ 検索語 で絞った集合
  const scopeItems = useMemo(() => {
    let list = (items ?? []).filter((e) => !isHidden(e));
    if (tab === 'mine') list = list.filter((e) => e.authorId === user?.id);
    if (tab === 'notify') list = list.filter((e) => isNotifyOn(e.id));
    // かなのまま（変換の前）でも当たるように、ひらがな・カタカナをそろえ、作品の読みも見る（2026-11-07）
    const q = normalizeSearch(query);
    if (q) { const byReading = namesByReading(q); list = list.filter((e) => matchesSearch(e, q, byReading)); }
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
  // 検索の候補（打っている途中から出す・2026-11-07）。カレンダーに入っている予定から
  const suggest = useSearchSuggest(query, items);

  // オンボーディングの案内（OnboardingTour）で、いいねした予定を見せているところ。
  // 絞り込み・タブに関係なく必ず出し、その日のパネルを開いたままにする
  const tourStep = useTourStep();
  const tourId = tourStep === 'calview' || tourStep === 'calendar' || tourStep === 'bell' || tourStep === 'done' ? tourEventId() : null;
  // いいねの保存が届く前に取り直すことがあるので、無ければ案内が持っている予定を使う
  const tourEvent = tourId ? (items?.find((e) => e.id === tourId) ?? (tourLikedEvent()?.id === tourId ? tourLikedEvent()! : undefined)) : undefined;
  const shown = useMemo(
    () => (tourEvent && !filtered.some((e) => e.id === tourEvent.id) ? [...filtered, tourEvent] : filtered),
    [filtered, tourEvent],
  );
  // 案内で♡した予定が、取り直した一覧にまだ無い（♡の保存が届く前に取り直した）ときは、一覧に足しておく。
  // 足さないと、案内が先へ進んで（Xの共有・自分の予定の説明）その予定を見せなくなったとたん、カレンダーから消えて
  // 「まだ予定がありません」と出ていた（2026-11-07 通しで確認）
  useEffect(() => {
    const liked = tourLikedEvent();
    if (!user || !tourStep || !liked || !items || items.some((e) => e.id === liked.id)) return;
    const add = (list: CalendarEvent[]) => (list.some((it) => it.id === liked.id) ? list : [...list, { ...liked, likedByMe: true }]);
    setItems((prev) => (prev ? add(prev) : prev));
    updateSaved(user.id, add);
  }, [tourStep, items, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  // 案内（2026-11-07 実際のボードの画面で説明する）:
  //   calview・personal … ボードの一番上へ戻し、カレンダーを開く（カレンダー・自分の予定のボタンを光らせる）
  //   calendar・bell・done … カレンダーをたたんで、♡した予定の行を真ん中へ。ボードに行が無い予定（日付未定など）はリスト表示で
  const [foldTick, setFoldTick] = useState(0);
  useEffect(() => {
    if (tourStep === 'calview' || tourStep === 'personal') {
      setAnchor(today); setTodayTick((n) => n + 1);
      return;
    }
    // 通知の段階・その次も（途中でアプリを開き直したときに、開いたカレンダーが行を隠さないように）
    if ((tourStep !== 'calendar' && tourStep !== 'bell' && tourStep !== 'done') || !tourEvent) return;
    setFoldTick((n) => n + 1);
    let tries = 0, done = false;
    const t = setInterval(() => {
      const el = document.querySelector(`[data-card-id="${CSS.escape(tourEvent.id)}"]`);
      // たたみ終わる（.28s）のを待ってから真ん中へ送る
      if (el && !done) { done = true; clearInterval(t); setTimeout(() => el.scrollIntoView({ block: 'center', behavior: 'auto' }), 300); return; }
      // ボードに出ない予定（終わった・日付の無いもの）は、ボードが今日の行に出す
      if (++tries > 70) clearInterval(t);
    }, 80);
    return () => clearInterval(t);
  }, [tourStep, tourEvent?.id]); // eslint-disable-line react-hooks/exhaustive-deps

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


  // 絞り込みボタンに出す件数。すべて/自分の投稿… も数える（検索は上の検索欄に文字が見えているので数えない）
  const activeCount = facetCount + (tab !== 'all' ? 1 : 0);
  const clearAll = () => { clearFilters(); setTab('all'); };


  const headerH = useStickyTop(headerRef);
  const typing = useTyping();
  const screenH = useRef(window.innerHeight);
  if (!typing) screenH.current = window.innerHeight;

  const year = anchor.slice(0, 4), month = Number(anchor.slice(5, 7));
  return (
    // ⚠️ ルートに上の余白を付けないこと。上部バーは自分で var(--sat) を持っているので、
    // ここに余白を足すと**帯の外側に地の色の帯**ができる（外皮で帯の色が変わると目立つ）
    <div ref={rootRef} className="px-4">
      <div ref={headerRef} className="sticky top-0 z-20 flex-shrink-0 -mx-4 px-4 pb-2" data-skin-bar="main"
        style={{ paddingTop: 'calc(var(--sat) + 6px)', backgroundColor: 'var(--bg-primary)' }}>
        {/* 1行だけ: 見出し（11月＋今日）／検索／絞り込み／その他。2026-11-07 デザインの一新でボタンを3つに絞った */}
        <div className="flex items-center gap-1 h-11">
          {/* 見出し。右の虫眼鏡を押すと、見出しと入れ替わって検索欄に広がる */}
          <ExpandingSearch value={query} onChange={setQuery} placeholder="カレンダーの予定を検索" sideRef={sideRef}
            suggest={<SuggestList query={query} works={suggest.works} events={suggest.events}
              onWork={(w) => { setQuery(w.name); (document.activeElement as HTMLElement | null)?.blur(); }}
              onEvent={(e) => openItem(e)}
              onAll={() => (document.activeElement as HTMLElement | null)?.blur()} allLabel="カレンダーで見る" />}
            title={
              <div className="flex items-center gap-2 min-w-0">
                <h1 className="flex items-baseline gap-0.5 whitespace-nowrap">
                  <span className="num text-[32px] font-extrabold leading-none">{month}</span>
                  <span className="text-[18px] font-extrabold">月</span>
                  {year !== today.slice(0, 4) && <span className="num ml-1 text-[14px] font-bold text-label-secondary">{year}</span>}
                </h1>
                {/* 今月を見ていないときだけ出す */}
                {showToday && (
                  <button onClick={() => { haptic.select(); setAnchor(today); setTodayTick((n) => n + 1); }}
                    className="pressable flex-shrink-0 text-[12px] font-bold px-2.5 h-7 rounded-full"
                    style={{ backgroundColor: 'var(--label-primary)', color: 'var(--bg-primary)' }}>
                    今日
                  </button>
                )}
              </div>
            } />

          <SearchSideButtons ref={sideRef} gap={2}>
          <IconButton label="絞り込み" pressed={filterOpen} active={activeCount > 0}
            onClick={() => setFilterOpen((v) => !v)}>
            <SlidersHorizontal size={20} aria-hidden />
            {activeCount > 0 && (
              <span className="num absolute top-0.5 right-0.5 min-w-[16px] h-4 px-1 rounded-full text-[10px] font-bold leading-4 text-center"
                style={{ backgroundColor: 'var(--accent-color)', color: 'var(--accent-on)' }}>{activeCount}</span>
            )}
          </IconButton>
          {/* その他: カスタマイズ（テーマ・背景・色）と、無料の人にはプレミアム（いつものカレンダーへの自動同期） */}
          <IconButton label="その他" pressed={!!menuAt}
            onClick={(el) => {
              const r = el.getBoundingClientRect();
              setMenuAt((cur) => (cur ? null : { top: r.bottom + 6, right: window.innerWidth - r.right }));
            }}>
            <MoreHorizontal size={20} aria-hidden />
          </IconButton>
          {menuAt && createPortal(
            <>
              <div className="fixed inset-0" style={{ zIndex: 200 }} onClick={() => setMenuAt(null)} />
              <div className="fixed min-w-[220px] rounded-[14px] py-1.5 shadow-float" role="menu"
                style={{ zIndex: 201, top: menuAt.top, right: menuAt.right, backgroundColor: 'var(--bg-primary)', border: '0.5px solid var(--separator)' }}>
                <MenuItem icon={<Palette size={18} aria-hidden />} label="カスタマイズ" sub="テーマ・背景・作品の色"
                  onClick={() => { setMenuAt(null); navigate('/customize'); }} />
                {FEATURE_PREMIUM && !premium && (
                  <MenuItem icon={<Crown size={18} aria-hidden />} label="プレミアム" sub="いつものカレンダーに自動同期"
                    onClick={() => { setMenuAt(null); navigate('/premium'); }} />
                )}
              </div>
            </>,
            document.body,
          )}
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
      ) : (
        <SavedBoard events={shown} anchor={anchor} setAnchor={setAnchor} workImages={workImages} stickyTop={headerH}
          onOpen={openItem} onRemove={onRemove} userId={user?.id} onVisits={onVisits} todayTick={todayTick}
          autoFold={!tourStep} foldTick={foldTick}
          lockFold={tourStep === 'calendar' || tourStep === 'bell' || tourStep === 'done'}
          tourId={tourStep === 'calendar' || tourStep === 'bell' || tourStep === 'done' ? tourEvent?.id ?? null : null}
          onAddPersonal={() => navigate(`/personal/new?date=${anchor.slice(0, 7) === today.slice(0, 7) ? today : `${anchor.slice(0, 7)}-01`}`)} />
      )}
      {styling && <EventStyleSheet eventId={styling.id} workId={styling.workId} onClose={() => setStyling(null)} onChange={() => setStyleTick((t) => t + 1)} />}
    </div>
  );
}


/** 上の行のアイコンだけのボタン。塗りは無く、絞り込み中だけアクセント色の丸 */
function IconButton({ label, onClick, pressed, active, children }: {
  label: string; onClick: (el: HTMLButtonElement) => void; pressed?: boolean; active?: boolean; children: React.ReactNode;
}) {
  return (
    <button onClick={(e) => { haptic.select(); onClick(e.currentTarget); }} aria-label={label} title={label}
      aria-pressed={pressed}
      className="pressable relative w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
      style={active
        ? { backgroundColor: 'var(--accent-color)', color: 'var(--accent-on)' }
        : { color: 'var(--label-primary)', backgroundColor: pressed ? 'var(--fill-tertiary)' : undefined }}>
      {children}
    </button>
  );
}

function MenuItem({ icon, label, sub, onClick }: { icon: React.ReactNode; label: string; sub?: string; onClick: () => void }) {
  return (
    <button role="menuitem" onClick={() => { haptic.select(); onClick(); }}
      className="pressable w-full flex items-center gap-3 px-3.5 py-2.5 text-left">
      <span className="text-label-secondary">{icon}</span>
      <span className="flex-1 min-w-0">
        <span className="block text-[15px] font-semibold">{label}</span>
        {sub && <span className="block text-[12px] text-label-secondary">{sub}</span>}
      </span>
    </button>
  );
}

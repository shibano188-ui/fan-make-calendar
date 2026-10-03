import type { CalendarEvent } from '../types';
import { getWorksByNames, listExploreEvents, type Work } from './api';
import { getCached, setCachedLarge, EXPLORE_EVENTS_KEY } from './swrCache';
import { todayStr } from '../design/tokens';
import { ONBOARDING_FEATURED_WORKS } from './constants';

// オンボーディングの先読み（2026-09-30 柴野「アニメーションの間に必要なものを読み込んで、最初の体験で待たせない」）。
// ようこその画面（OnboardingIntro）がロゴのアニメーションの間に呼び、作品選び・探す・カレンダーで使うものを先にそろえる:
//   - 作品の候補（SNS の8作品＋これからの予定が多い作品）… 作品選びがそのまま使う（同じ Promise を返す）
//   - ホーム・探すと同じ範囲の予定の一覧 … 作品の候補の数え上げと、探すの表示に使う（api 側で2分覚えている）
//   - 次に開く画面のプログラム（探す・カレンダー・マイページ・課金の案内）… 画面を移るときの読み込みをなくす

/** 候補に出すのに要る、これからの予定の数 */
const MIN_UPCOMING = 5;

function shiftMonths(base: string, n: number): string {
  const d = new Date(base + 'T00:00:00');
  d.setMonth(d.getMonth() + n);
  return todayStr(d);
}

/** ホーム・探すと同じ範囲の予定（キャッシュのキーも同じ） */
export function loadExploreRange(): Promise<CalendarEvent[]> {
  const today = todayStr();
  const from = shiftMonths(today, -12), to = shiftMonths(today, 18);
  const key = EXPLORE_EVENTS_KEY;
  return listExploreEvents(from, to)
    .then((data) => { setCachedLarge(key, data); return data; })
    .catch(() => getCached<CalendarEvent[]>(key) ?? []);
}

let featuredLoad: Promise<Work[]> | null = null;
let candidates: Promise<Work[]> | null = null;

/** SNS の8作品（決めた順）。軽いので、作品選びはまずこれを出す */
export function loadFeaturedWorks(): Promise<Work[]> {
  featuredLoad ??= getWorksByNames(ONBOARDING_FEATURED_WORKS)
    .then((featured) => ONBOARDING_FEATURED_WORKS.map((name) => featured.find((w) => w.name === name)).filter((w): w is Work => !!w))
    .catch((e) => { featuredLoad = null; throw e; });
  return featuredLoad;
}

/** 作品選びの候補。SNS の8作品を先頭に、これからの予定が多い作品を多い順に。1回の起動で1度だけ取る */
export function loadPickerCandidates(): Promise<Work[]> {
  candidates ??= (async () => {
    const today = todayStr();
    const [first, evs] = await Promise.all([loadFeaturedWorks().catch(() => [] as Work[]), loadExploreRange()]);
    const counts = new Map<string, { name: string; n: number }>();
    for (const e of evs) {
      if (!e.workId) continue;
      if ((e.endDate || e.date || '') < today && (e.date || e.endDate)) continue; // 終わった予定は数えない（日付未定は数える）
      const c = counts.get(e.workId);
      if (c) c.n++; else counts.set(e.workId, { name: e.workName ?? '', n: 1 });
    }
    const firstIds = new Set(first.map((w) => w.id));
    const rest = [...counts.entries()]
      .filter(([id, c]) => !firstIds.has(id) && c.n >= MIN_UPCOMING && c.name)
      .sort((a, b) => b[1].n - a[1].n)
      .map(([id, c]) => ({ id, name: c.name, participantCount: 0 }) as Work);
    return [...first, ...rest];
  })().catch((e) => { candidates = null; throw e; });
  return candidates;
}

/** ようこその画面から呼ぶ。「はじめる」を出してよくなったら返る。
 *  待つのは軽いもの（8作品・次に開く画面のプログラム）だけ。予定の一覧は数千件で数秒かかるので待たずに裏で読み続ける
 *  （作品を選んでいる間に終わるので、探すは待たずに出る）。それでも上限の時間が来たら返す */
export function preloadOnboarding(maxMs = 2500): Promise<void> {
  void loadPickerCandidates().catch(() => {});
  const quick = Promise.allSettled([
    loadFeaturedWorks(),
    import('../pages/Explore'), import('../pages/Saved'), import('../pages/MyPage'), import('../pages/Premium'),
  ]).then(() => undefined);
  return Promise.race([quick, new Promise<void>((r) => setTimeout(r, maxMs))]);
}

import type { CalendarEvent } from '../types';
import { deriveItemType, deriveStatus, todayStr } from '../design/tokens';
import { pushAppState } from './appState';

// ホームのストーリー（2026-10-04 柴野）。仕様 → Obsidian: Decisions/2026-10-04-fanhive-home-story-premium.md
//   - 作品ごとに、フォロー中の作品の新着を1件ずつめくる。自動では進めない
//   - 新着＝「数え始めた時刻」より後に投稿され、まだ見ていない予定。数え始めは初めて開いた日の7日前（以降は前回見たあとの全部）
//   - 無料の人は、毎朝9時（日本時間）までに投稿された分だけ。課金の人は投稿された時点で入る
//   - 先頭に「今週のまとめ」（今週発売・締切が近い・人気）。ホームの区画だったものをここへ移した

const DAY = 86400000;

// ─── 数え始める時刻 ──────────────────────────────────────────────
const SINCE_KEY = 'fan_story_since';
export function storySince(): string {
  try {
    const raw = localStorage.getItem(SINCE_KEY);
    if (raw) { const v = JSON.parse(raw); if (typeof v === 'string') return v; }
  } catch { /* noop */ }
  const v = new Date(Date.now() - 7 * DAY).toISOString();
  try { localStorage.setItem(SINCE_KEY, JSON.stringify(v)); } catch { /* noop */ }
  pushAppState('story_since', v);
  return v;
}

/** 無料の人に見せる新着の締め時刻。今が9時より前なら前日の9時（日本時間） */
export function freeCutoff(now = new Date()): string {
  const jst = new Date(now.getTime() + 9 * 3600000);
  const y = jst.getUTCFullYear(), m = jst.getUTCMonth(), d = jst.getUTCDate();
  let cut = Date.UTC(y, m, d, 0, 0, 0); // JST 9:00 = UTC 0:00
  if (now.getTime() < cut) cut -= DAY;
  return new Date(cut).toISOString();
}
/** 次に無料の人へ新着が届く時刻（表示用） */
export function nextFreeDelivery(now = new Date()): Date {
  return new Date(new Date(freeCutoff(now)).getTime() + DAY);
}

// ─── 1作品ぶんのストーリー ────────────────────────────────────────
export type StoryPage = { event: CalendarEvent; badge?: string };
export type StoryGroup = {
  key: string;            // 作品は work_id、今週のまとめは 'week'
  workId: string | null;
  title: string;
  color: string;
  image?: string;
  pages: StoryPage[];
  /** 開いたときに最初に出すページ（まだ見ていない最初の1件） */
  start: number;
  unseen: number;
};

export const WEEK_KEY = 'week';

function upcoming(e: CalendarEvent, today: string): boolean {
  const st = deriveStatus(e, today);
  if (st === 'ended' || st === 'soldout') return false;
  if (st === 'preorder_ended') return !!e.date && e.date > today;
  return true;
}

/** フォロー中の作品ごとの新着。見た新着も直近7日ぶんは前に残す（左を押して見返せるように） */
export function buildWorkGroups(
  items: CalendarEvent[],
  works: { id: string; name: string }[],
  opts: { seen: Set<string>; since: string; cutoff: string | null; colors: Map<string, string>; images: Record<string, string>; isHidden: (e: CalendarEvent) => boolean },
): StoryGroup[] {
  const recent = new Date(Date.now() - 7 * DAY).toISOString();
  const byWork = new Map<string, CalendarEvent[]>();
  for (const e of items) {
    if (!e.workId || !e.createdAt || opts.isHidden(e)) continue;
    if (opts.cutoff && e.createdAt > opts.cutoff) continue;
    const list = byWork.get(e.workId);
    if (list) list.push(e); else byWork.set(e.workId, [e]);
  }
  const groups = works.map((w): StoryGroup => {
    const list = (byWork.get(w.id) ?? []).sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''));
    const unseen = list.filter((e) => !opts.seen.has(e.id) && (e.createdAt ?? '') >= opts.since);
    const seenRecent = list.filter((e) => opts.seen.has(e.id) && (e.createdAt ?? '') >= recent);
    const pages = [...seenRecent, ...unseen].map((event) => ({ event, badge: opts.seen.has(event.id) ? undefined : '新着' }));
    return {
      key: w.id, workId: w.id, title: w.name,
      color: opts.colors.get(w.id) ?? 'var(--accent-color)', image: opts.images[w.id],
      pages, start: unseen.length ? seenRecent.length : 0, unseen: unseen.length,
    };
  });
  // 未読がある作品を前に（その中はカレンダーの並び順のまま）。見終えた作品は後ろへ
  return [...groups.filter((g) => g.unseen > 0), ...groups.filter((g) => g.unseen === 0)];
}

/** 今週のまとめ。フォロー中の作品の、今週発売・締切まで3日以内・人気（いいねの多いこれからの予定） */
export function buildWeekGroup(items: CalendarEvent[], followIds: Set<string>, seen: Set<string>, isHidden: (e: CalendarEvent) => boolean): StoryGroup {
  const today = todayStr();
  const weekEnd = todayStr(new Date(Date.now() + 6 * DAY));
  const soon = todayStr(new Date(Date.now() + 3 * DAY));
  const mine = items.filter((e) => e.workId && followIds.has(e.workId) && !isHidden(e) && upcoming(e, today));
  const pages: StoryPage[] = [];
  const used = new Set<string>();
  const add = (e: CalendarEvent, badge: string) => { if (!used.has(e.id)) { used.add(e.id); pages.push({ event: e, badge }); } };
  mine.filter((e) => !!e.preorderEnd && e.preorderEnd >= today && e.preorderEnd <= soon)
    .sort((a, b) => a.preorderEnd!.localeCompare(b.preorderEnd!))
    .forEach((e) => add(e, e.preorderEnd === today ? '今日締切' : `締切まであと${daysBetween(today, e.preorderEnd!)}日`));
  mine.filter((e) => deriveItemType(e) === 'goods' && !!e.date && !e.dateLabel && e.date >= today && e.date <= weekEnd)
    .sort((a, b) => a.date!.localeCompare(b.date!))
    .forEach((e) => add(e, e.date === today ? '今日発売' : '今週発売'));
  mine.filter((e) => (e.likes ?? 0) > 0).sort((a, b) => (b.likes ?? 0) - (a.likes ?? 0)).slice(0, 5)
    .forEach((e) => add(e, '人気'));
  const firstUnseen = pages.findIndex((p) => !seen.has(p.event.id));
  return {
    key: WEEK_KEY, workId: null, title: '今週のまとめ', color: 'var(--accent-color)',
    pages, start: Math.max(0, firstUnseen), unseen: pages.filter((p) => !seen.has(p.event.id)).length,
  };
}

// ─── 作品カードの「次の予定」 ───────────────────────────────────
export function daysBetween(from: string, to: string): number {
  return Math.round((new Date(to + 'T00:00:00').getTime() - new Date(from + 'T00:00:00').getTime()) / DAY);
}

export type NextDate = { event: CalendarEvent; label: string; date: string; days: number };

/** 予定の中で、今日から一番近い節目（予約開始・予約締切・発売/開催・開催中なら終了） */
export function nextDateOf(e: CalendarEvent, today = todayStr()): NextDate | null {
  const goods = deriveItemType(e) === 'goods';
  const cands: { label: string; date: string }[] = [];
  if (e.preorderStart && e.preorderStart >= today) cands.push({ label: '予約開始', date: e.preorderStart });
  if (e.preorderEnd && e.preorderEnd >= today) cands.push({ label: '予約締切', date: e.preorderEnd });
  if (e.date && !e.dateLabel && e.date >= today) cands.push({ label: goods ? '発売' : '開催', date: e.date });
  if (!goods && e.date && e.endDate && e.date < today && e.endDate >= today) cands.push({ label: '終了', date: e.endDate });
  if (!cands.length) return null;
  const c = cands.sort((a, b) => a.date.localeCompare(b.date))[0];
  return { event: e, label: c.label, date: c.date, days: daysBetween(today, c.date) };
}

/** 作品カードに出す次の予定。いいねした予定（自分が買う・行くもの）を優先し、無ければ作品の全部から */
export function workNext(items: CalendarEvent[], likedIds: Set<string>, isHidden: (e: CalendarEvent) => boolean): { mine: boolean; main: NextDate | null; after: NextDate[] } {
  const today = todayStr();
  const dated = (list: CalendarEvent[]) => list
    .filter((e) => !isHidden(e))
    .map((e) => nextDateOf(e, today)).filter((n): n is NextDate => !!n)
    .sort((a, b) => a.date.localeCompare(b.date));
  const liked = dated(items.filter((e) => likedIds.has(e.id)));
  const mine = liked.length > 0;
  const list = mine ? liked : dated(items);
  // その次の予定（カードの高さに余りがあるときに並べる）。同じ予定が2回並ばないよう、予定ごとに1つ
  // いいねした予定が少ないときは、その作品のほかの予定で続きを埋める（カードの中ほどが空かないように）
  const seen = new Set(list[0] ? [list[0].event.id] : []);
  const rest = mine ? [...list.slice(1), ...dated(items)] : list.slice(1);
  const after = rest.filter((n) => !seen.has(n.event.id) && seen.add(n.event.id)).slice(0, 4);
  return { mine, main: list[0] ?? null, after };
}

// ─── 連続記録 ───────────────────────────────────────────────────
// 「その日にストーリーを見た」で1日分伸びる。新着が無い日は、ホームを開くだけで伸びる
const STREAK_KEY = 'fan_streak';
export type Streak = { count: number; last: string | null };

export function loadStreak(): Streak {
  try {
    const v = JSON.parse(localStorage.getItem(STREAK_KEY) ?? 'null');
    if (v && typeof v.count === 'number') return { count: v.count, last: typeof v.last === 'string' ? v.last : null };
  } catch { /* noop */ }
  return { count: 0, last: null };
}

/** 今の連続日数。昨日までで止まっていれば（今日まだ見ていなくても）続いている扱い。2日以上空いたら0 */
export function currentStreak(s: Streak, today = todayStr()): number {
  if (!s.last) return 0;
  return daysBetween(s.last, today) <= 1 ? s.count : 0;
}

/** 今日の分を記録する。今日すでに記録していれば何もしない */
export function markStreakToday(today = todayStr()): Streak {
  const s = loadStreak();
  if (s.last === today) return s;
  const next: Streak = { count: s.last && daysBetween(s.last, today) === 1 ? s.count + 1 : 1, last: today };
  try { localStorage.setItem(STREAK_KEY, JSON.stringify(next)); } catch { /* noop */ }
  pushAppState('streak', next);
  return next;
}

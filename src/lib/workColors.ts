import { pushAppState } from './appState';

// 作品ごとの色（カレンダー・各種タイルで共通利用）。
// localStorage `fan_work_colors` を真実とし、未割当の作品にはパレットから
// 重複しない色を割り当てて永続化する。割当済みの色は変更しない。

export const WORK_COLORS = [
  '#FF6B6B', '#4FC3F7', '#81C784', '#FFB74D',
  '#BA68C8', '#4DB6AC', '#F06292', '#A1887F',
  '#7986CB', '#9CCC65', '#FF8A65', '#4DD0E1',
  '#DCE775', '#BA8FD0', '#90A4AE', '#F48FB1',
];

const STORAGE_KEY = 'fan_work_colors';
// 予定ごとの色も同じ保存先に `e:<予定のid>` で入れる（2026-10-31 柴野「作品の中でも予定ごとに色を決めたい」）。
// 表の列を増やさずに、端末をまたいで引き継げる
const EVENT_PREFIX = 'e:';
// カレンダーの帯の先頭に付ける記号も同じく `m:<予定のid>`
const MARK_PREFIX = 'm:';

/** 選べる記号。絵文字ではなく文字なので、帯の文字色に合わせて読める */
export const EVENT_MARKS = ['★', '♥', '♦', '♪', '✿', '●', '▲', '■', '✓', '！', '？', '☆', '♠', '♣', '◆'];

/**
 * 作品ID→色のMapを返す。`works` に渡した作品で未割当のものがあれば
 * パレットから色を割り当てて localStorage に保存する。返すMapは保存済みの
 * 全エントリ（＝アプリ全体で既に色が付いている作品すべて）を含む。
 */
export function buildWorkColorMap(works: { id: string }[] = []): Map<string, string> {
  const saved: Record<string, string> = (() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}'); } catch { return {}; }
  })();
  const usedColors = new Set<string>(Object.entries(saved).filter(([k]) => !k.startsWith(EVENT_PREFIX) && !k.startsWith(MARK_PREFIX)).map(([, c]) => c));
  const updated = { ...saved };
  let hasNew = false;
  works.forEach((w) => {
    if (!updated[w.id]) {
      const color = WORK_COLORS.find((c) => !usedColors.has(c)) ?? WORK_COLORS[0];
      updated[w.id] = color;
      usedColors.add(color);
      hasNew = true;
    }
  });
  if (hasNew) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    pushAppState('work_colors', updated);
  }
  return new Map(Object.entries(updated));
}

/** 予定の色。自分で選んだ色があればそれ、無ければ作品の色 */
export function eventColorFrom(colors: Map<string, string>, e: { id: string; workId?: string }): string {
  return colors.get(EVENT_PREFIX + e.id) ?? (e.workId ? colors.get(e.workId) : undefined) ?? 'var(--accent-color)';
}

/** カレンダーの帯の先頭の記号。無ければ空 */
export function eventMarkFrom(colors: Map<string, string>, id: string): string {
  return colors.get(MARK_PREFIX + id) ?? '';
}

function loadOne(key: string): string | null {
  try { return (JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Record<string, string>)[key] ?? null; }
  catch { return null; }
}

function saveOne(key: string, value: string | null): void {
  let saved: Record<string, string> = {};
  try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}'); } catch { /* 空から始める */ }
  if (value) saved[key] = value; else delete saved[key];
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(saved)); } catch { /* この端末では残らないだけ */ }
  pushAppState('work_colors', saved);
}

export const loadEventColor = (id: string): string | null => loadOne(EVENT_PREFIX + id);
export const loadEventMark = (id: string): string | null => loadOne(MARK_PREFIX + id);
/** 予定の色を選ぶ。null で作品の色に戻す */
export const saveEventColor = (id: string, color: string | null): void => saveOne(EVENT_PREFIX + id, color);
/** 帯の先頭の記号を選ぶ。null で記号なし */
export const saveEventMark = (id: string, mark: string | null): void => saveOne(MARK_PREFIX + id, mark);

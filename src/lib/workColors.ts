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

/**
 * 作品ID→色のMapを返す。`works` に渡した作品で未割当のものがあれば
 * パレットから色を割り当てて localStorage に保存する。返すMapは保存済みの
 * 全エントリ（＝アプリ全体で既に色が付いている作品すべて）を含む。
 */
export function buildWorkColorMap(works: { id: string }[] = []): Map<string, string> {
  const saved: Record<string, string> = (() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}'); } catch { return {}; }
  })();
  const usedColors = new Set<string>(Object.values(saved));
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
  if (hasNew) localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  return new Map(Object.entries(updated));
}

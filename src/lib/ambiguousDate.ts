// 曖昧日付（日付未定）の共通ロジック。
// データモデル: dateLabel（上旬/中旬/下旬/中=月のみ/春頃…）＋ 代表日 date（並び替え・カレンダー配置用）。
// 投稿フォーム（PostNew）と詳細ページの編集（EventEditForm）で共用する。

export const SEASON_LABELS = ['春頃', '夏頃', '秋頃', '冬頃'];
export const SEASON_MONTH: Record<string, string> = { '春頃': '04', '夏頃': '08', '秋頃': '11', '冬頃': '02' };
export const LABEL_DAY: Record<string, string> = { '上旬': '05', '中旬': '15', '下旬': '25' };
export const DATE_LABEL_OPTIONS: [string, string][] = [
  ['上旬', '上旬'], ['中旬', '中旬'], ['下旬', '下旬'], ['月のみ', '中'],
  ['春頃', '春頃'], ['夏頃', '夏頃'], ['秋頃', '秋頃'], ['冬頃', '冬頃'],
];

/** 年/月/区分から代表日(YYYY-MM-DD)を算出。季節は月固定・月のみは末日・上中下旬は5/15/25。 */
export function ambiguousDate(year: string, month: string, label: string): string {
  if (SEASON_MONTH[label]) return `${year}-${SEASON_MONTH[label]}-15`;
  const day = label === '中'
    ? String(new Date(Number(year), Number(month), 0).getDate()).padStart(2, '0')
    : (LABEL_DAY[label] ?? '15');
  return `${year}-${month}-${day}`;
}

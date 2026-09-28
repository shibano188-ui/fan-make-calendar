// ホーム・探す・カレンダーで共通の絞り込み（作品・状態・カテゴリ・地域・近くの）。
// 前はページごとに別々に覚えていて、探すで外した作品がホームでは外れていなかった（本人指摘・2026-09-28）。
// アプリを閉じるまで（sessionStorage）覚えておき、ユーザーが外す・リセットするまで勝手に解除しない。
// 検索の文字・グッズ/イベントの切り替え・表示の形は、ページごとのまま（各ページの session に置く）。
export interface SharedFilters {
  excludedWorks: string[];
  statuses: string[];
  categories: string[];
  prefs: string[];
  regions: string[];
  neighborActive: boolean;
}

const KEY = 'shared_filters_v1';
const EMPTY: SharedFilters = { excludedWorks: [], statuses: [], categories: [], prefs: [], regions: [], neighborActive: false };

export function loadSharedFilters(): SharedFilters {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (raw) return { ...EMPTY, ...(JSON.parse(raw) as Partial<SharedFilters>) };
    // 前のページごとの置き場から引き継ぐ（探す → カレンダー → ホームの順で、あるものを使う）
    const old = JSON.parse(sessionStorage.getItem('explore_filters') ?? sessionStorage.getItem('saved_filters') ?? '{}') as Partial<SharedFilters>;
    const home = JSON.parse(sessionStorage.getItem('home_excluded') ?? 'null') as string[] | null;
    return { ...EMPTY, ...old, excludedWorks: old.excludedWorks ?? home ?? [] };
  } catch { return { ...EMPTY }; }
}

/** 変えた項目だけ書き足す（ホームは作品だけを書く） */
export function saveSharedFilters(patch: Partial<SharedFilters>): void {
  try { sessionStorage.setItem(KEY, JSON.stringify({ ...loadSharedFilters(), ...patch })); } catch { /* 表示は続ける */ }
}

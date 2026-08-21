// ═══════════════════════════════════════════════════════════════════
// 外皮（スキン）= 色・形・書体・質感をひとまとめにした「見た目の層」
//
// 既存の機能は1つも消さない:
//   - テーマ（ライト/ダーク/システム）と コミュニティテーマ7種 はそのまま動く
//   - アクセント色6色の選択もそのまま
//   - CSS変数のキーは1つも削除・改名しない（値の上書きと変数の追加のみ）
//
// コミュニティテーマを選んでいるときは「色は使う人のもの」を優先し、
// 外皮は形・書体・質感だけを足す（色は上書きしない）。
//
// 保存先は localStorage のみ。Supabase の user_settings には触らない
// （本番のスキーマを変更しないため）。
// ═══════════════════════════════════════════════════════════════════

export type SkinId = 'classic' | 'panel' | 'surge';

export interface SkinDef {
  id: SkinId;
  /** マイページに出す名前 */
  name: string;
  /** 一行の説明 */
  tagline: string;
  /** この外皮の署名色。切り替え時、アクセントが署名色のいずれかなら追従させる */
  accent: string;
  /** 見本に出す3色（左から 地・面・アクセント） */
  swatch: [string, string, string];
  /** Google Fonts のクエリ（classic は読み込み不要） */
  fontQuery: string | null;
  /** 色の上書き。コミュニティテーマ選択時は適用しない */
  vars: { dark: Record<string, string>; light: Record<string, string> } | null;
}

/** 署名色の集合。ユーザーが自分で別の色を選んでいたら追従させない */
export const SIGNATURE_ACCENTS = ['#FBBF00', '#FF5A1E', '#FFD400'];

const PANEL_DARK: Record<string, string> = {
  '--bg-primary': '#101012',
  '--bg-secondary': '#1b1b20',
  '--bg-tertiary': '#26262c',
  '--label-primary': '#f3f0ea',
  '--label-secondary': 'rgba(243,240,234,0.62)',
  '--label-tertiary': 'rgba(243,240,234,0.34)',
  '--border-faint': 'rgba(255,255,255,0.05)',
  '--border-subtle': 'rgba(255,255,255,0.09)',
  '--border-default': 'rgba(255,255,255,0.16)',
  '--border-strong': 'rgba(255,255,255,0.32)',
  '--border-selected': 'rgba(255,255,255,0.62)',
  '--separator': 'rgba(120,120,132,0.55)',
  '--fill-primary': 'rgba(140,140,150,0.34)',
  '--fill-secondary': 'rgba(140,140,150,0.28)',
  '--fill-tertiary': 'rgba(140,140,150,0.20)',
  '--fill-quaternary': 'rgba(140,140,150,0.14)',
  '--input-text': '#f3f0ea',
  '--input-placeholder': 'rgba(243,240,234,0.30)',
  '--input-caret': '#f3f0ea',
  '--color-destructive': '#ff4d4d',
  '--color-success': '#37cf7c',
  '--color-warning': '#ffb020',
  '--status-info': '#5aa9ff',
  '--status-preorder': '#ff5a1e',
  '--status-upcoming': '#a06bff',
  '--status-onsale': '#37cf7c',
  '--status-ended': '#5a5a61',
};

const PANEL_LIGHT: Record<string, string> = {
  // TE の筐体のような、わずかに温かいグレー
  '--bg-primary': '#e7e4db',
  '--bg-secondary': '#f6f4ef',
  '--bg-tertiary': '#d9d5c9',
  '--label-primary': '#17171a',
  '--label-secondary': 'rgba(23,23,26,0.64)',
  '--label-tertiary': 'rgba(23,23,26,0.38)',
  '--border-faint': 'rgba(23,23,26,0.05)',
  '--border-subtle': 'rgba(23,23,26,0.10)',
  '--border-default': 'rgba(23,23,26,0.18)',
  '--border-strong': 'rgba(23,23,26,0.34)',
  '--border-selected': 'rgba(23,23,26,0.62)',
  '--separator': 'rgba(23,23,26,0.20)',
  '--fill-primary': 'rgba(23,23,26,0.16)',
  '--fill-secondary': 'rgba(23,23,26,0.12)',
  '--fill-tertiary': 'rgba(23,23,26,0.08)',
  '--fill-quaternary': 'rgba(23,23,26,0.05)',
  '--input-text': '#17171a',
  '--input-placeholder': 'rgba(23,23,26,0.34)',
  '--input-caret': '#17171a',
  '--color-destructive': '#d92d2d',
  '--color-success': '#1f8a52',
  '--color-warning': '#b8730a',
  '--status-info': '#2b7fd4',
  '--status-preorder': '#d94a12',
  '--status-upcoming': '#7c47c9',
  '--status-onsale': '#1f8a52',
  '--status-ended': '#8d8a83',
};

const SURGE_DARK: Record<string, string> = {
  '--bg-primary': '#0b0b0c',
  '--bg-secondary': '#151519',
  '--bg-tertiary': '#1f1f24',
  '--label-primary': '#ffffff',
  '--label-secondary': 'rgba(255,255,255,0.56)',
  '--label-tertiary': 'rgba(255,255,255,0.32)',
  '--border-faint': 'rgba(255,255,255,0.06)',
  '--border-subtle': 'rgba(255,255,255,0.11)',
  '--border-default': 'rgba(255,255,255,0.18)',
  '--border-strong': 'rgba(255,255,255,0.34)',
  '--border-selected': 'rgba(255,212,0,0.85)',
  '--separator': 'rgba(255,255,255,0.14)',
  '--fill-primary': 'rgba(255,255,255,0.16)',
  '--fill-secondary': 'rgba(255,255,255,0.12)',
  '--fill-tertiary': 'rgba(255,255,255,0.08)',
  '--fill-quaternary': 'rgba(255,255,255,0.05)',
  '--input-text': '#ffffff',
  '--input-placeholder': 'rgba(255,255,255,0.30)',
  '--input-caret': '#ffd400',
  '--color-destructive': '#ff4d63',
  '--color-success': '#3ee08a',
  '--color-warning': '#ffd400',
  '--status-info': '#5ab0ff',
  '--status-preorder': '#ffd400',
  '--status-upcoming': '#c77dff',
  '--status-onsale': '#3ee08a',
  '--status-ended': 'rgba(255,255,255,0.34)',
};

const SURGE_LIGHT: Record<string, string> = {
  '--bg-primary': '#f4f2ec',
  '--bg-secondary': '#ffffff',
  '--bg-tertiary': '#e7e4db',
  '--label-primary': '#0b0b0c',
  '--label-secondary': 'rgba(11,11,12,0.60)',
  '--label-tertiary': 'rgba(11,11,12,0.36)',
  '--border-faint': 'rgba(11,11,12,0.05)',
  '--border-subtle': 'rgba(11,11,12,0.10)',
  '--border-default': 'rgba(11,11,12,0.18)',
  '--border-strong': 'rgba(11,11,12,0.34)',
  '--border-selected': 'rgba(11,11,12,0.72)',
  '--separator': 'rgba(11,11,12,0.16)',
  '--fill-primary': 'rgba(11,11,12,0.14)',
  '--fill-secondary': 'rgba(11,11,12,0.10)',
  '--fill-tertiary': 'rgba(11,11,12,0.07)',
  '--fill-quaternary': 'rgba(11,11,12,0.04)',
  '--input-text': '#0b0b0c',
  '--input-placeholder': 'rgba(11,11,12,0.34)',
  '--input-caret': '#0b0b0c',
  '--color-destructive': '#e0243c',
  '--color-success': '#128a4d',
  '--color-warning': '#a37a00',
  '--status-info': '#2b7fd4',
  '--status-preorder': '#a37a00',
  '--status-upcoming': '#7c47c9',
  '--status-onsale': '#128a4d',
  '--status-ended': 'rgba(11,11,12,0.34)',
};

export const SKINS: Record<SkinId, SkinDef> = {
  classic: {
    id: 'classic',
    name: '現行',
    tagline: '今のFanHive。iOS風のやわらかい面と丸み',
    accent: '#FBBF00',
    swatch: ['#0e0e10', '#1c1c1e', '#FBBF00'],
    fontQuery: null,
    vars: null,
  },
  panel: {
    id: 'panel',
    name: 'PANEL ／ 計器',
    tagline: '発売日と締切を読む計器。無彩色と点の格子、数字は点で組む',
    accent: '#FF5A1E',
    swatch: ['#101012', '#1b1b20', '#FF5A1E'],
    fontQuery:
      'family=BIZ+UDPGothic:wght@400;700&family=BIZ+UDGothic:wght@400;700' +
      '&family=Martian+Mono:wght@300;400;500;700&family=Bitcount+Grid+Double:wght@400;700',
    vars: { dark: PANEL_DARK, light: PANEL_LIGHT },
  },
  surge: {
    id: 'surge',
    name: 'SURGE ／ 高揚',
    tagline: '斜めに切って太い字で殴る。黄と黒、動きは瞬間だけ',
    accent: '#FFD400',
    swatch: ['#0b0b0c', '#151519', '#FFD400'],
    fontQuery:
      'family=Zen+Kaku+Gothic+New:wght@500;700;900&family=Dela+Gothic+One' +
      '&family=Anybody:wght@400;700;900&family=Big+Shoulders+Display:wght@600;800;900',
    vars: { dark: SURGE_DARK, light: SURGE_LIGHT },
  },
};

export const SKIN_IDS: SkinId[] = ['classic', 'panel', 'surge'];

const SKIN_KEY = 'fan_skin';

export function loadSkin(): SkinId {
  try {
    const v = localStorage.getItem(SKIN_KEY);
    if (v === 'panel' || v === 'surge' || v === 'classic') return v;
  } catch { /* プライベートモード等では既定値でよい */ }
  return 'classic';
}

export function saveSkin(id: SkinId): void {
  try { localStorage.setItem(SKIN_KEY, id); } catch { /* 保存できなくても表示は続ける */ }
}

/** 外皮の書体を必要になったときだけ読み込む（classic では1バイトも読まない） */
export function ensureSkinFonts(id: SkinId): void {
  const def = SKINS[id];
  if (!def.fontQuery) return;
  const elId = `skin-fonts-${id}`;
  if (document.getElementById(elId)) return;
  const link = document.createElement('link');
  link.id = elId;
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?${def.fontQuery}&display=swap`;
  document.head.appendChild(link);
}

/**
 * 外皮を documentElement に反映する。
 * @param id            外皮
 * @param isDark        解決済みのライト/ダーク
 * @param hasCommunity  コミュニティテーマ選択中か（true なら色は上書きしない）
 */
export function applySkin(id: SkinId, isDark: boolean, hasCommunity: boolean): void {
  const root = document.documentElement;
  root.dataset.skin = id;
  const def = SKINS[id];
  ensureSkinFonts(id);
  if (!def.vars || hasCommunity) return;
  const vars = isDark ? def.vars.dark : def.vars.light;
  Object.entries(vars).forEach(([k, v]) => root.style.setProperty(k, v));
}

/** 外皮を切り替えたときのアクセント色。使う人が自分で選んだ色なら変えない */
export function accentForSkin(id: SkinId, currentAccent: string): string {
  return SIGNATURE_ACCENTS.includes(currentAccent.toUpperCase()) ? SKINS[id].accent : currentAccent;
}

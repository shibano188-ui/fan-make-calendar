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

import {
  type ThemeSpec, specToAttrs, shapeToVars, specFontQuery, colorsToVars,
} from './themeSpec';

export type SkinId = 'classic' | 'panel' | 'surge';

export interface SkinDef {
  id: SkinId;
  /** マイページに出す名前 */
  name: string;
  /** この外皮の署名色。切り替え時、アクセントが署名色のいずれかなら追従させる */
  accent: string;
  /** 見本に出す3色（地・面・アクセント）。暗いとき */
  swatch: [string, string, string];
  /** 同じく、明るいとき。明暗で見本を出し分けないと3つとも同じ絵になる */
  swatchLight: [string, string, string];
  /** 見本の中の面の角丸(px)。**「面の形」が外皮の違いで一番効く**ので見本にも出す */
  swatchRadius: number;
  /** 面の形。丸／直角／右下を切る。テーマ生成の「設定表」でも同じ語彙を使う予定 */
  shape: 'round' | 'square' | 'cut';
  /** 地に質感（点の格子）を敷くか。見本にも出す */
  texture: boolean;
  /**
   * ステータスバーの裏に実際に出る色。アイコンを白にするか黒にするかをここから決める。
   *
   * Android 15 は edge-to-edge が強制で **StatusBar.setBackgroundColor が効かない**
   * （実機で確認: マゼンタを指定してもバーの色は変わらず、getInfo は指定値を返すのに見た目は
   * アプリが描いた色のまま）。つまりバーの裏に出るのは**アプリ自身が描いている色**なので、
   * 地の色ではなく「そこに何を描いているか」でアイコンの明暗を決めないと読めなくなる。
   * SURGE は上部の帯がアクセント色（黄）なので、暗いテーマでも黒アイコンでなければ読めない。
   */
  statusBar: 'bg' | 'accent';
  /**
   * この外皮の設定表。**形・書体・質感・押した反応・飾りはすべてここから決まる**。
   * 生成テーマも同じ型なので、適用の経路は1本で済む（applyThemeSpec）。
   */
  spec: ThemeSpec;
  /**
   * 手で作った色の表。生成テーマは持たない（表の色から階段で作る）。
   * 既存の3つだけは、実機で確認済みの見た目をずらさないためにこちらを正とする。
   * コミュニティテーマ選択時は適用しない。
   */
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
  '--status-ended': '#75757e',
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
  '--status-ended': 'rgba(11,11,12,0.40)',
};

// ── 既存3つの設定表 ────────────────────────────────────────────────
// **色以外はすべてここに書いてある**。skins.css はこの値を属性で引くだけなので、
// 生成テーマも同じ語彙の別の組み合わせにすぎない。

const CLASSIC_SPEC: ThemeSpec = {
  v: 1,
  name: 'デフォルト',
  accent: '#FBBF00',
  shape: 'round',
  // null = アプリ既定の角丸の階層をそのまま残す（デフォルトは「素のアプリ」）
  radius: null,
  bars: 'floating',
  shadow: 'float',
  texture: 'none',
  textureSize: 19,
  textureStrength: 16,
  press: 'spring',
  ornament: 'none',
  ornamentSize: 11,
  ornamentWeight: 2,
  type: 'plain',
  border: 1,
  iconStroke: 2,
  iconCap: 'round',
  fonts: { body: 'system', label: 'system', meta: 'system', num: 'system', display: 'system' },
  dark:  { bg: '#0e0e10', surface: '#1c1c1e', surface2: '#2c2c2e', text: '#ffffff' },
  light: { bg: '#f2f2f7', surface: '#ffffff', surface2: '#e5e5ea', text: '#000000' },
  statusBar: 'bg',
};

const PANEL_SPEC: ThemeSpec = {
  v: 1,
  name: 'PANEL',
  accent: '#FF5A1E',
  shape: 'square',
  radius: 2,
  bars: 'plate',
  shadow: 'raise',
  texture: 'dots',
  textureSize: 19,
  textureStrength: 16,
  press: 'mechanical',
  ornament: 'led',
  ornamentSize: 11,
  ornamentWeight: 2,
  type: 'mono',
  border: 1,
  iconStroke: 2,
  iconCap: 'round',
  fonts: { body: 'bizudp', label: 'bizud', meta: 'martian', num: 'martian', display: 'bizud' },
  dark:  { bg: '#101012', surface: '#1b1b20', surface2: '#26262c', text: '#f3f0ea', line: '#8c8c96' },
  light: { bg: '#e7e4db', surface: '#f6f4ef', surface2: '#d9d5c9', text: '#17171a' },
  statusBar: 'bg',
};

const SURGE_SPEC: ThemeSpec = {
  v: 1,
  name: 'SURGE',
  accent: '#FFD400',
  shape: 'cut',
  radius: 0,
  bars: 'band',
  shadow: 'hard',
  texture: 'halftone',
  textureSize: 5,
  textureStrength: 13,
  press: 'bounce',
  ornament: 'tilt',
  ornamentSize: 11,
  ornamentWeight: 2,
  type: 'display',
  border: 1,
  iconStroke: 2,
  iconCap: 'round',
  fonts: { body: 'zenkaku', label: 'zenkaku', meta: 'anybody', num: 'bigshoulder', display: 'dela' },
  dark:  { bg: '#0b0b0c', surface: '#151519', surface2: '#1f1f24', text: '#ffffff' },
  light: { bg: '#f4f2ec', surface: '#ffffff', surface2: '#e7e4db', text: '#0b0b0c' },
  statusBar: 'accent',
};

export const PRESET_SPECS: Record<SkinId, ThemeSpec> = {
  classic: CLASSIC_SPEC,
  panel: PANEL_SPEC,
  surge: SURGE_SPEC,
};

export const SKINS: Record<SkinId, SkinDef> = {
  classic: {
    id: 'classic',
    name: 'デフォルト',
    accent: '#FBBF00',
    swatch: ['#0e0e10', '#1c1c1e', '#FBBF00'],
    swatchLight: ['#f2f2f7', '#ffffff', '#FBBF00'],
    swatchRadius: 8,
    shape: 'round',
    texture: false,
    statusBar: 'bg',
    spec: CLASSIC_SPEC,
    vars: null,
  },
  panel: {
    id: 'panel',
    name: 'PANEL',
    accent: '#FF5A1E',
    swatch: ['#101012', '#1b1b20', '#FF5A1E'],
    swatchLight: ['#e7e4db', '#f6f4ef', '#FF5A1E'],
    swatchRadius: 2,
    shape: 'square',
    texture: true,
    statusBar: 'bg',
    spec: PANEL_SPEC,
    vars: { dark: PANEL_DARK, light: PANEL_LIGHT },
  },
  surge: {
    id: 'surge',
    name: 'SURGE',
    accent: '#FFD400',
    swatch: ['#0b0b0c', '#151519', '#FFD400'],
    swatchLight: ['#f4f2ec', '#ffffff', '#FFD400'],
    swatchRadius: 0,
    shape: 'cut',
    texture: false,
    // 上部の帯が accent（skins.css の [data-bars='band'] [data-skin-part='header']）
    statusBar: 'accent',
    spec: SURGE_SPEC,
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

/** テーマの書体を必要になったときだけ読み込む（デフォルトでは1バイトも読まない） */
export function ensureSpecFonts(spec: ThemeSpec): void {
  const q = specFontQuery(spec);
  if (!q) return;
  // クエリそのものを鍵にする。同じ書体の組み合わせなら二度読まない
  const elId = `skin-fonts-${hashQuery(q)}`;
  if (document.getElementById(elId)) return;
  const link = document.createElement('link');
  link.id = elId;
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?${q}&display=swap`;
  document.head.appendChild(link);
}

function hashQuery(q: string): string {
  let h = 0;
  for (let i = 0; i < q.length; i++) h = (h * 31 + q.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
}

// このモジュールが html に付ける属性。テーマを外すときに**必ず全部消す**
// （消し忘れると、前のテーマの形だけが残って混ざる）
const MANAGED_ATTRS = [
  'data-shape', 'data-bars', 'data-shadow', 'data-texture',
  'data-press', 'data-ornament', 'data-type', 'data-themed', 'data-icon-cap',
];

/**
 * 設定表を documentElement に反映する。
 *
 * @param spec          設定表（プリセットでも生成テーマでも同じ）
 * @param isDark        解決済みのライト/ダーク
 * @param hasCommunity  コミュニティテーマ選択中か（true なら色は上書きしない）
 * @param colorVars     手で作った色の表（既存3つ用）。無ければ設定表の色から階段で作る
 */
export function applyThemeSpec(
  spec: ThemeSpec,
  isDark: boolean,
  hasCommunity: boolean,
  colorVars?: Record<string, string>,
): void {
  const root = document.documentElement;
  ensureSpecFonts(spec);

  const attrs = specToAttrs(spec);
  for (const name of MANAGED_ATTRS) {
    if (name in attrs) root.setAttribute(name, attrs[name]);
    else root.removeAttribute(name);
  }

  // 形・書体は色と独立。コミュニティテーマ選択中でもこちらは効かせる
  Object.entries(shapeToVars(spec)).forEach(([k, v]) => root.style.setProperty(k, v));
  // 角丸を指定しないテーマ（デフォルト）では、前のテーマの角丸を残さない
  if (spec.radius === null) {
    ['--skin-radius', '--skin-radius-sm', '--skin-radius-lg', '--skin-radius-pill']
      .forEach(k => root.style.removeProperty(k));
  }

  if (hasCommunity) return;
  const vars = colorVars ?? colorsToVars(isDark ? spec.dark : spec.light, isDark ? 'dark' : 'light');
  Object.entries(vars).forEach(([k, v]) => root.style.setProperty(k, v));
}

/**
 * 外皮を documentElement に反映する（プリセット用の入口）。
 * @param id            外皮
 * @param isDark        解決済みのライト/ダーク
 * @param hasCommunity  コミュニティテーマ選択中か（true なら色は上書きしない）
 */
export function applySkin(id: SkinId, isDark: boolean, hasCommunity: boolean): void {
  const def = SKINS[id];
  document.documentElement.dataset.skin = id;
  const colorVars = def.vars ? (isDark ? def.vars.dark : def.vars.light) : undefined;
  // デフォルトは色を上書きしない（アプリ既定の THEME_VARS のまま）
  applyThemeSpec(def.spec, isDark, hasCommunity || !def.vars, colorVars);
}

/** 外皮を切り替えたときのアクセント色。使う人が自分で選んだ色なら変えない */
export function accentForSkin(id: SkinId, currentAccent: string): string {
  return SIGNATURE_ACCENTS.includes(currentAccent.toUpperCase()) ? SKINS[id].accent : currentAccent;
}

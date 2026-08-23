// ═══════════════════════════════════════════════════════════════════
// テーマの「設定表」（ThemeSpec）と、それを CSS変数の辞書に展開する純粋関数。
//
// なぜ表にするか:
//   AIにCSSを書かせない。**決まった表を埋めさせるだけ**にする。
//   手で作り込む部品は20個弱なのに、組み合わせは
//   形3 × バー3 × 影4 × 質感3 × 押した反応4 × 飾り3 × 書体の性格3 = 3,888通り。
//   ここに書体の割り当てと色（連続値）が乗るので実質無限。
//   **検品するのは部品であって組み合わせではない**ので、テーマが増えても確認の手間は増えない。
//
// 設計の芯（→ [[2026-08-22-fanhive-theme-consolidation]]）:
//   1. specToVars は **CSS変数の辞書を返すだけ**。DOM に一切書かない。
//      → プレビューを <div style={vars}> に局所適用できる（今の applySkin ではできなかった）
//   2. 明暗は必ず2組そろえる。明るさの選択はテーマから奪わない
//   3. 部品の語彙（shape / bars / …）は skins.css の属性セレクタと1対1で対応する
//
// 既存の3つ（デフォルト / PANEL / SURGE）もこの表で表現してある。
// ただし**色だけは手で作った表をそのまま持つ**（vars）。理由は下の COLOR_LADDER を見ること。
// ═══════════════════════════════════════════════════════════════════

// ── 部品の語彙 ────────────────────────────────────────────────────
// 値を足すときは skins.css に対応する html[data-…] のブロックを足す。
// **CSSに無い値をここに足さない**（選んでも何も変わらない設定になる。
//   フォント機能が実体を失ったまま残っていたのと同じ失敗をしない）

/** 面の形。「別のアプリに見える」を作っている一番の要因 */
export type ShapeId = 'round' | 'square' | 'cut';
/** 上部バーと下タブの扱い。形に次いで効く */
export type BarsId = 'floating' | 'plate' | 'band';
export type ShadowId = 'float' | 'raise' | 'hard' | 'none';
export type TextureId = 'none' | 'dots' | 'halftone';
export type PressId = 'spring' | 'mechanical' | 'bounce' | 'none';
/** 飾り。テーマごとに1つだけ決めて決まった場所に置く（2つ入れると全部盛りで破綻する） */
export type OrnamentId = 'none' | 'led' | 'tilt';
/** 書体の性格。字間と太さの取り方が書体の選択と一緒に動くので、1本の軸にしてある */
export type TypeId = 'plain' | 'mono' | 'display';

export type FontRole = 'body' | 'label' | 'meta' | 'num' | 'display';

// ── 書体の在庫 ────────────────────────────────────────────────────
// **本文に使える書体は絞る**（装飾系を本文にすると読めない）。
// jp:true = 日本語のグリフを持つ。持たない書体は後ろに和文を足して混植する。
export type FontId = keyof typeof FONTS;

export const FONTS = {
  system:      { family: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', q: null, jp: true, body: true },
  bizudp:      { family: "'BIZ UDPGothic'", q: 'family=BIZ+UDPGothic:wght@400;700', jp: true, body: true },
  bizud:       { family: "'BIZ UDGothic'", q: 'family=BIZ+UDGothic:wght@400;700', jp: true, body: true },
  zenkaku:     { family: "'Zen Kaku Gothic New'", q: 'family=Zen+Kaku+Gothic+New:wght@400;500;700;900', jp: true, body: true },
  zenmaru:     { family: "'Zen Maru Gothic'", q: 'family=Zen+Maru+Gothic:wght@400;500;700;900', jp: true, body: true },
  mplusround:  { family: "'M PLUS Rounded 1c'", q: 'family=M+PLUS+Rounded+1c:wght@400;500;700;900', jp: true, body: true },
  shippori:    { family: "'Shippori Mincho'", q: 'family=Shippori+Mincho:wght@400;600;800', jp: true, body: true },
  notoserifjp: { family: "'Noto Serif JP'", q: 'family=Noto+Serif+JP:wght@400;600;900', jp: true, body: true },
  // ここから下は見出し・数字・短いラベル専用。日本語の本文には使わない
  dela:        { family: "'Dela Gothic One'", q: 'family=Dela+Gothic+One', jp: true, body: false },
  kaisei:      { family: "'Kaisei Decol'", q: 'family=Kaisei+Decol:wght@400;700', jp: true, body: false },
  rocknroll:   { family: "'RocknRoll One'", q: 'family=RocknRoll+One', jp: true, body: false },
  yusei:       { family: "'Yusei Magic'", q: 'family=Yusei+Magic', jp: true, body: false },
  dotgothic:   { family: "'DotGothic16'", q: 'family=DotGothic16', jp: true, body: false },
  martian:     { family: "'Martian Mono'", q: 'family=Martian+Mono:wght@300;400;500;700', jp: false, body: false },
  jetbrains:   { family: "'JetBrains Mono'", q: 'family=JetBrains+Mono:wght@400;500;700', jp: false, body: false },
  anybody:     { family: "'Anybody'", q: 'family=Anybody:wght@400;700;900', jp: false, body: false },
  bigshoulder: { family: "'Big Shoulders Display'", q: 'family=Big+Shoulders+Display:wght@600;800;900', jp: false, body: false },
  spacegro:    { family: "'Space Grotesk'", q: 'family=Space+Grotesk:wght@400;500;700', jp: false, body: false },
  archivo:     { family: "'Archivo Black'", q: 'family=Archivo+Black', jp: false, body: false },
} as const;

export const FONT_IDS = Object.keys(FONTS) as FontId[];
/** 本文・ラベルに使ってよい書体（AIにはこの一覧しか渡さない） */
export const BODY_FONT_IDS = FONT_IDS.filter(id => FONTS[id].body);

const JP_FALLBACK = "'Hiragino Kaku Gothic ProN', system-ui, sans-serif";

// ── 色 ────────────────────────────────────────────────────────────

/** 明暗どちらか1組ぶんの色。AIが埋めるのはこの7つだけで、残りは階段で作る */
export interface ThemeColors {
  /** 地 */
  bg: string;
  /** 面（カード・バー） */
  surface: string;
  /** 一段沈んだ面（入力欄など） */
  surface2: string;
  /** 文字 */
  text: string;
  /** 罫線と薄い塗りのもと。省略すると text を使う */
  line?: string;
  /** 状態の5色。省略すると既定を使う（意味を持つ色なので、崩したいときだけ指定させる） */
  status?: Partial<Record<'info' | 'preorder' | 'upcoming' | 'onsale' | 'ended', string>>;
}

/**
 * 薄い塗り・罫線の階段。**1本に固定する**。
 *
 * PANEL / SURGE は手で少しずつ違う階段を持っている（PANEL の塗りは 0.34〜0.14、
 * SURGE は 0.16〜0.05）。ここを表から作り直すと、実機で確認済みの見た目が
 * わずかにずれる。既存の3つは手の表（SkinDef.vars）をそのまま使い、
 * **生成テーマだけこの階段で作る**。表の型は同じなので、あとから寄せられる。
 */
const LADDER = {
  labelSecondary: 0.62, labelTertiary: 0.36,
  borderFaint: 0.06, borderSubtle: 0.11, borderDefault: 0.18, borderStrong: 0.34, borderSelected: 0.62,
  separator: 0.20,
  fillPrimary: 0.16, fillSecondary: 0.12, fillTertiary: 0.08, fillQuaternary: 0.05,
  placeholder: 0.34,
} as const;

const DEFAULT_STATUS = {
  dark:  { info: '#5aa9ff', preorder: '#ff8a3d', upcoming: '#a06bff', onsale: '#37cf7c', ended: '#75757e' },
  light: { info: '#2b7fd4', preorder: '#d94a12', upcoming: '#7c47c9', onsale: '#1f8a52', ended: '#8d8a83' },
} as const;

const DEFAULT_SEMANTIC = {
  dark:  { destructive: '#ff4d4d', success: '#37cf7c', warning: '#ffb020' },
  light: { destructive: '#d92d2d', success: '#1f8a52', warning: '#b8730a' },
} as const;

// ── 設定表 ────────────────────────────────────────────────────────

export interface ThemeSpec {
  /** 表の版。読めない版は既定にフォールバックする */
  v: 1;
  name: string;
  /** アクセント（署名色）。塗りボタン・選択中の印に使う */
  accent: string;
  /** 面の形 */
  shape: ShapeId;
  /**
   * 角丸(px)。null = アプリ既定の角丸をそのまま使う（デフォルトテーマ専用）。
   * 数値を入れると**アプリ中の角丸がこの1つに揃う**。それがテーマの言語になる。
   */
  radius: number | null;
  bars: BarsId;
  shadow: ShadowId;
  texture: TextureId;
  press: PressId;
  ornament: OrnamentId;
  type: TypeId;
  fonts: Record<FontRole, FontId>;
  dark: ThemeColors;
  light: ThemeColors;
  /**
   * ステータスバーの裏に実際に出る色。アイコンを白にするか黒にするかをここから決める。
   * bars='band' は上部が accent 一色になるので 'accent' にすること。
   */
  statusBar: 'bg' | 'accent';
}

/** 生成テーマがサーバーから返ってきたときの入れ物 */
export interface UserTheme {
  id: string;
  spec: ThemeSpec;
  createdAt: string;
}

// ── 展開 ──────────────────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  const m = hex.replace('#', '').trim();
  if (m.length === 3) return [parseInt(m[0] + m[0], 16), parseInt(m[1] + m[1], 16), parseInt(m[2] + m[2], 16)];
  return [parseInt(m.slice(0, 2), 16), parseInt(m.slice(2, 4), 16), parseInt(m.slice(4, 6), 16)];
}

function rgba(hex: string, a: number): string {
  if (!/^#[0-9a-fA-F]{3,6}$/.test(hex)) return hex;
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

/** 色の階段を1組ぶん展開する。生成テーマの色はすべてここを通る */
export function colorsToVars(c: ThemeColors, mode: 'dark' | 'light'): Record<string, string> {
  const line = c.line ?? c.text;
  const st = { ...DEFAULT_STATUS[mode], ...(c.status ?? {}) };
  const sem = DEFAULT_SEMANTIC[mode];
  return {
    '--bg-primary': c.bg,
    '--bg-secondary': c.surface,
    '--bg-tertiary': c.surface2,
    '--label-primary': c.text,
    '--label-secondary': rgba(c.text, LADDER.labelSecondary),
    '--label-tertiary': rgba(c.text, LADDER.labelTertiary),
    '--border-faint': rgba(line, LADDER.borderFaint),
    '--border-subtle': rgba(line, LADDER.borderSubtle),
    '--border-default': rgba(line, LADDER.borderDefault),
    '--border-strong': rgba(line, LADDER.borderStrong),
    '--border-selected': rgba(line, LADDER.borderSelected),
    '--separator': rgba(line, LADDER.separator),
    '--fill-primary': rgba(line, LADDER.fillPrimary),
    '--fill-secondary': rgba(line, LADDER.fillSecondary),
    '--fill-tertiary': rgba(line, LADDER.fillTertiary),
    '--fill-quaternary': rgba(line, LADDER.fillQuaternary),
    '--input-text': c.text,
    '--input-placeholder': rgba(c.text, LADDER.placeholder),
    '--input-caret': c.text,
    '--color-destructive': sem.destructive,
    '--color-success': sem.success,
    '--color-warning': sem.warning,
    '--status-info': st.info,
    '--status-preorder': st.preorder,
    '--status-upcoming': st.upcoming,
    '--status-onsale': st.onsale,
    '--status-ended': st.ended,
  };
}

/** 書体の指定を1本のスタックにする。和文を持たない書体には和文を足して混植させる */
function stack(id: FontId, jpId: FontId): string {
  const f = FONTS[id];
  if (f.jp) return `${f.family}, ${JP_FALLBACK}`;
  return `${f.family}, ${FONTS[jpId].jp ? FONTS[jpId].family : ''} ${JP_FALLBACK}`.replace(/,\s+,/, ',');
}

/** 形と書体の変数。色を含まないので、コミュニティテーマ選択中でもこちらは効かせてよい */
export function shapeToVars(spec: ThemeSpec): Record<string, string> {
  const r = spec.radius;
  const jp = spec.fonts.body;
  const vars: Record<string, string> = {
    '--skin-font-body': stack(spec.fonts.body, jp),
    '--skin-font-label': stack(spec.fonts.label, jp),
    '--skin-font-meta': stack(spec.fonts.meta, jp),
    '--skin-font-num': stack(spec.fonts.num, jp),
    '--skin-display': stack(spec.fonts.display, jp),
    // 混植用。日付や金額のように「数字＋日本語」が1行に混ざるところで使う
    '--skin-font-meta-mix': stack(spec.fonts.meta, jp),
    '--skin-font-num-mix': stack(spec.fonts.num, jp),
    '--skin-dot': spec.texture === 'dots' ? 'rgba(128,128,132,0.16)' : 'rgba(128,128,132,0.13)',
  };
  if (r !== null) {
    vars['--skin-radius'] = `${r}px`;
    vars['--skin-radius-sm'] = `${Math.min(r, 6)}px`;
    vars['--skin-radius-lg'] = `${Math.round(r * 1.5)}px`;
    // 丸のテーマではピルは丸のまま。角のあるテーマでは少しだけ大きい角に合わせる
    vars['--skin-radius-pill'] = spec.shape === 'round' ? '9999px' : `${Math.round(r * 1.5)}px`;
  }
  return vars;
}

/**
 * 設定表 → CSS変数の辞書。**DOM に書かない純粋関数**。
 * プレビューは `<div style={specToVars(spec, isDark)}>` で局所適用できる。
 */
export function specToVars(spec: ThemeSpec, isDark: boolean): Record<string, string> {
  const c = isDark ? spec.dark : spec.light;
  return {
    ...colorsToVars(c, isDark ? 'dark' : 'light'),
    ...shapeToVars(spec),
    '--accent-color': spec.accent,
  };
}

/** 設定表 → html に付ける属性。skins.css の部品セレクタはすべてこれで引く */
export function specToAttrs(spec: ThemeSpec): Record<string, string> {
  const attrs: Record<string, string> = {
    'data-shape': spec.shape,
    'data-bars': spec.bars,
    'data-shadow': spec.shadow,
    'data-texture': spec.texture,
    'data-press': spec.press,
    'data-ornament': spec.ornament,
    'data-type': spec.type,
  };
  // 角丸を1つに揃えるテーマだけ data-themed が付く。
  // デフォルト（radius=null）はアプリ既存の角丸の階層をそのまま残す
  if (spec.radius !== null) attrs['data-themed'] = '';
  return attrs;
}

/** このテーマが必要とする Google Fonts のクエリ（重複を畳む） */
export function specFontQuery(spec: ThemeSpec): string | null {
  const qs = new Set<string>();
  for (const role of ['body', 'label', 'meta', 'num', 'display'] as FontRole[]) {
    const q = FONTS[spec.fonts[role]].q;
    if (q) qs.add(q);
  }
  return qs.size ? [...qs].join('&') : null;
}

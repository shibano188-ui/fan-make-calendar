// アクセント色・作品色から派生色を算出するユーティリティ（Phase E-2）

function hexToRgb(hex: string): [number, number, number] | null {
  const m = hex.replace('#', '').trim();
  if (m.length === 3) {
    return [parseInt(m[0] + m[0], 16), parseInt(m[1] + m[1], 16), parseInt(m[2] + m[2], 16)];
  }
  if (m.length === 6) {
    return [parseInt(m.slice(0, 2), 16), parseInt(m.slice(2, 4), 16), parseInt(m.slice(4, 6), 16)];
  }
  return null;
}

function relativeLuminance(hex: string): number | null {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  const [r, g, b] = rgb.map(v => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** 墨色（塗りの上に載せる暗い方の文字色）の輝度 */
const INK = '#1a1a1a';
const INK_LUM = 0.0103;

/**
 * 塗り色の上に載せる文字色を返す。
 *
 * 以前は「輝度 0.45 を境に白か墨か」で決めていたが、**中くらいの明るさの色で
 * 明らかに悪い方を選んでしまう**。例えば橙 #FF5A1E（輝度 0.29）は白だと 3.12 しか出ず、
 * 墨なら 5.46 出る。境界値ではなく**両方の比を実際に計算して良い方を採る**。
 * 選べる6色のうち橙・緑・青・桃はこの帯に入るので、既存の配色でも読みやすくなる。
 */
export function getContrastText(color: string): string {
  // CSS変数（アクセント色）が渡された場合は算出済みトークンに委ねる
  if (color.startsWith('var(')) return 'var(--accent-on)';
  const lum = relativeLuminance(color);
  if (lum === null) return '#ffffff';
  const withWhite = 1.05 / (lum + 0.05);
  const withInk = (lum + 0.05) / (INK_LUM + 0.05);
  return withInk >= withWhite ? INK : '#ffffff';
}

/** 色を ratio (0〜1) ぶん暗くする */
export function darken(hex: string, ratio: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  return `#${rgb.map(v => Math.round(v * (1 - ratio)).toString(16).padStart(2, '0')).join('')}`;
}

/**
 * アクセント色から派生トークンを算出する。
 * - on:        アクセント塗りの上の文字色
 * - textDark:  ダーク背景で文字/アイコンに使うアクセント
 * - textLight: ライト背景で文字/アイコンに使うアクセント（明るい色は暗くして可読性を確保）
 */
export function accentTokens(accent: string): { on: string; textDark: string; textLight: string } {
  const on = getContrastText(accent);
  const textLight = on === '#1a1a1a' ? darken(accent, 0.35) : accent;
  return { on, textDark: accent, textLight };
}

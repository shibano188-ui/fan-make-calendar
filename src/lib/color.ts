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

/** 塗り色の上に載せる文字色を返す。明るい塗り→黒系、暗い塗り→白 */
export function getContrastText(color: string): string {
  // CSS変数（アクセント色）が渡された場合は算出済みトークンに委ねる
  if (color.startsWith('var(')) return 'var(--accent-on)';
  const lum = relativeLuminance(color);
  if (lum === null) return '#ffffff';
  return lum > 0.45 ? '#1a1a1a' : '#ffffff';
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

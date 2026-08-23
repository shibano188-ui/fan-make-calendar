// ═══════════════════════════════════════════════════════════════════
// 生成された設定表を「信用しないで受け取る」ための層。
//
//   1. 語彙の検査 … 表に無い値・壊れた色は捨てて、今の値を残す
//   2. 差分の適用 … AIは**差分だけ**返す。全部返させると関係ない項目が毎回揺れる
//   3. 明暗差の検算 … 通らなければ**自動で文字を寄せる**（→ [[contrast-regression-test]]）
//
// 検算は文字を動かして直す。**地の色は動かさない**——地はそのテーマの正体そのもので、
// ここを勝手に変えると「頼んだ色と違う」になる。読めるようにするのは文字の役目。
// ═══════════════════════════════════════════════════════════════════

import {
  FONTS, type FontId, type FontRole, type ThemeColors, type ThemeSpec,
} from './themeSpec';

// ── 語彙 ──────────────────────────────────────────────────────────
// skins.css に実体のある値だけを並べる。ここに無い値は捨てる

export const VOCAB = {
  shape: ['round', 'square', 'cut'],
  bars: ['floating', 'plate', 'band'],
  shadow: ['float', 'raise', 'hard', 'none'],
  texture: ['none', 'dots', 'halftone', 'grid', 'scanline', 'paper'],
  press: ['spring', 'mechanical', 'bounce', 'none'],
  ornament: ['none', 'led', 'tilt', 'corner', 'stripe', 'rays'],
  iconCap: ['round', 'square'],
  type: ['plain', 'mono', 'display'],
  statusBar: ['bg', 'accent'],
} as const;

const HEX = /^#[0-9a-fA-F]{6}$/;
const FONT_ROLES: FontRole[] = ['body', 'label', 'meta', 'num', 'display'];
const STATUS_KEYS = ['info', 'preorder', 'upcoming', 'onsale', 'ended'] as const;

// ── 明暗差 ────────────────────────────────────────────────────────

function toRgb(hex: string): [number, number, number] {
  const m = hex.replace('#', '');
  return [parseInt(m.slice(0, 2), 16), parseInt(m.slice(2, 4), 16), parseInt(m.slice(4, 6), 16)];
}

function luminance(hex: string): number {
  const [r, g, b] = toRgb(hex).map(v => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG のコントラスト比（1〜21） */
export function contrast(a: string, b: string): number {
  if (!HEX.test(a) || !HEX.test(b)) return 21;
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** 色を明るい方／暗い方へ1段動かす */
function nudge(hex: string, toward: 'light' | 'dark', step = 6): string {
  const rgb = toRgb(hex).map(v => {
    const next = toward === 'light' ? v + step : v - step;
    return Math.max(0, Math.min(255, Math.round(next)));
  });
  return `#${rgb.map(v => v.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * ある色を、地に対して必要な比が出るまで動かす。
 * 地より明るいなら明るい方へ、暗いなら暗い方へ寄せる（色相はほぼ保つ）。
 */
function ensureContrast(color: string, bg: string, need: number): string {
  if (!HEX.test(color) || !HEX.test(bg)) return color;
  const toward: 'light' | 'dark' = luminance(color) >= luminance(bg) ? 'light' : 'dark';
  let out = color;
  for (let i = 0; i < 42 && contrast(out, bg) < need; i++) {
    const next = nudge(out, toward);
    if (next === out) break;   // 白／黒に振り切った
    out = next;
  }
  return out;
}

/**
 * 色の鮮やかさを変える。1.0 がそのまま、0 に近いほど無彩色、1より大きいほど鮮やか。
 * 明るさ（HSLのL）は動かさない——明るさを動かすと地と文字の関係が崩れて濁る。
 * つまみ（AIを呼ばない即時の調整）が使う。
 */
export function saturate(hex: string, factor: number): string {
  if (!HEX.test(hex)) return hex;
  const [r, g, b] = toRgb(hex).map(v => v / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return hex;   // 元から無彩色なら鮮やかにしようがない
  const d = max - min;
  let s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  s = Math.max(0, Math.min(1, s * factor));

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue = (t: number) => {
    let x = t;
    if (x < 0) x += 1;
    if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  const out = [hue(h + 1 / 3), hue(h), hue(h - 1 / 3)]
    .map(v => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0'));
  return `#${out.join('')}`;
}

/** 色を明るい／暗い方へずらす。手直しボタン（AIを呼ばない即時の調整）が使う */
export function shade(hex: string, amount: number): string {
  if (!HEX.test(hex)) return hex;
  const rgb = toRgb(hex).map(v => Math.max(0, Math.min(255, Math.round(v + amount))));
  return `#${rgb.map(v => v.toString(16).padStart(2, '0')).join('')}`;
}

export type ContrastReport = { label: string; ratio: number; need: number; fixed: boolean };

/**
 * 1組ぶんの色を検算し、通らなければ文字側を寄せて返す。
 *
 * 見る組み合わせは**毎日踏むところだけ**に絞る:
 *   本文と地 / 本文と面 / 状態の色と面 / アクセントと面。
 * 補助文字（62%・36%）は本文から作るので、本文が通れば連動して通る。
 */
export function fixColors(c: ThemeColors, accent: string): { colors: ThemeColors; report: ContrastReport[] } {
  const report: ContrastReport[] = [];
  const out: ThemeColors = { ...c, status: c.status ? { ...c.status } : undefined };

  const check = (label: string, fg: string, bg: string, need: number, apply: (v: string) => void) => {
    const before = contrast(fg, bg);
    if (before >= need) {
      report.push({ label, ratio: Math.round(before * 100) / 100, need, fixed: false });
      return;
    }
    const fixedColor = ensureContrast(fg, bg, need);
    apply(fixedColor);
    report.push({ label, ratio: Math.round(contrast(fixedColor, bg) * 100) / 100, need, fixed: true });
  };

  // 本文。地と面の両方で読めないといけないので、厳しい方に合わせる
  check('本文と地', out.text, out.bg, 4.5, v => { out.text = v; });
  check('本文と面', out.text, out.surface, 4.5, v => { out.text = v; });

  // 状態の5色は面の上に小さく出る。UI部品の基準（3.0）
  for (const k of STATUS_KEYS) {
    const v = out.status?.[k];
    if (!v || !HEX.test(v)) continue;
    check(`状態(${k})`, v, out.surface, 3.0, fixed => {
      out.status = { ...(out.status ?? {}), [k]: fixed };
    });
  }

  // アクセントは面の上に文字・アイコンとしても出る。塗りの上の文字は accentTokens が別に面倒を見る
  report.push({
    label: 'アクセントと面',
    ratio: Math.round(contrast(accent, out.surface) * 100) / 100,
    need: 3.0,
    fixed: false,
  });

  return { colors: out, report };
}

// ── 語彙の検査と差分の適用 ────────────────────────────────────────

function pickEnum<T extends string>(v: unknown, allowed: readonly string[], now: T): T {
  return typeof v === 'string' && allowed.includes(v) ? (v as T) : now;
}

function pickHex(v: unknown, now: string): string {
  return typeof v === 'string' && HEX.test(v) ? v.toLowerCase() : now;
}

function mergeColors(now: ThemeColors, patch: unknown): ThemeColors {
  if (!patch || typeof patch !== 'object') return now;
  const p = patch as Record<string, unknown>;
  const next: ThemeColors = {
    bg: pickHex(p.bg, now.bg),
    surface: pickHex(p.surface, now.surface),
    surface2: pickHex(p.surface2, now.surface2),
    text: pickHex(p.text, now.text),
    line: p.line === null ? undefined : pickHex(p.line, now.line ?? now.text),
    status: now.status ? { ...now.status } : undefined,
  };
  if (p.status && typeof p.status === 'object') {
    const s = p.status as Record<string, unknown>;
    const merged = { ...(next.status ?? {}) };
    for (const k of STATUS_KEYS) if (HEX.test(String(s[k]))) merged[k] = String(s[k]).toLowerCase();
    next.status = merged;
  }
  return next;
}

/**
 * 本文に使えない書体を本文に指定されたときの逃がし先。
 * 黙って捨てると「素の書体のまま」になって、頼んだ雰囲気（ポップ・レトロ）が消える。
 * **一番近い、本文に使える書体へ寄せる**（読めることは譲らない）。
 */
const BODY_ALIAS: Partial<Record<FontId, FontId>> = {
  rocknroll: 'mplusround', yusei: 'mplusround', kaisei: 'mplusround', dotgothic: 'mplusround',
  dela: 'zenkaku', archivo: 'zenkaku', anybody: 'zenkaku', spacegro: 'zenkaku',
  bigshoulder: 'zenkaku', martian: 'bizud', jetbrains: 'bizud',
};

function mergeFonts(now: Record<FontRole, FontId>, patch: unknown): Record<FontRole, FontId> {
  if (!patch || typeof patch !== 'object') return now;
  const p = patch as Record<string, unknown>;
  const next = { ...now };
  for (const role of FONT_ROLES) {
    const v = p[role];
    if (typeof v !== 'string' || !(v in FONTS)) continue;
    let id = v as FontId;
    // 本文とラベルに装飾書体を入れさせない（読めなくなる）。
    // ただし雰囲気は残したいので、近い本文書体へ寄せる
    if ((role === 'body' || role === 'label') && !FONTS[id].body) {
      const alias = BODY_ALIAS[id];
      if (!alias) continue;
      id = alias;
    }
    next[role] = id;
  }
  return next;
}

/**
 * AIが返した**差分**を今の表に当てる。
 * 表に無い値・壊れた色は黙って捨てて今の値を残す（1項目の失敗で全部を捨てない）。
 * 当てたあとに必ず検算して、通らない組み合わせは文字を寄せて直す。
 */
export function applyPatch(now: ThemeSpec, patch: unknown): { spec: ThemeSpec; report: ContrastReport[] } {
  const p = (patch && typeof patch === 'object' ? patch : {}) as Record<string, unknown>;

  const radius = typeof p.radius === 'number' && p.radius >= 0 && p.radius <= 24
    ? Math.round(p.radius)
    : now.radius;

  /** 数値は必ず範囲で受ける。**表に無い形の値は捨てて今の値を残す** */
  const num = (v: unknown, min: number, max: number, nowValue: number, round = true) => {
    if (typeof v !== 'number' || !Number.isFinite(v)) return nowValue;
    const clamped = Math.max(min, Math.min(max, v));
    return round ? Math.round(clamped) : Math.round(clamped * 100) / 100;
  };

  const merged: ThemeSpec = {
    v: 1,
    name: typeof p.name === 'string' && p.name.trim() ? p.name.trim().slice(0, 24) : now.name,
    accent: pickHex(p.accent, now.accent),
    shape: pickEnum(p.shape, VOCAB.shape, now.shape),
    // 生成テーマは必ず角丸を1つに決める（null はデフォルトテーマ専用）
    radius: radius ?? 12,
    bars: pickEnum(p.bars, VOCAB.bars, now.bars),
    shadow: pickEnum(p.shadow, VOCAB.shadow, now.shadow),
    texture: pickEnum(p.texture, VOCAB.texture, now.texture),
    textureSize: num(p.textureSize, 3, 28, now.textureSize),
    textureStrength: num(p.textureStrength, 4, 40, now.textureStrength),
    press: pickEnum(p.press, VOCAB.press, now.press),
    ornament: pickEnum(p.ornament, VOCAB.ornament, now.ornament),
    ornamentSize: num(p.ornamentSize, 2, 24, now.ornamentSize),
    ornamentWeight: num(p.ornamentWeight, 1, 6, now.ornamentWeight),
    type: pickEnum(p.type, VOCAB.type, now.type),
    border: num(p.border, 0, 3, now.border),
    iconStroke: num(p.iconStroke, 1, 2.5, now.iconStroke, false),
    iconCap: pickEnum(p.iconCap, VOCAB.iconCap, now.iconCap),
    fonts: mergeFonts(now.fonts, p.fonts),
    dark: mergeColors(now.dark, p.dark),
    light: mergeColors(now.light, p.light),
    statusBar: pickEnum(p.statusBar, VOCAB.statusBar, now.statusBar),
  };

  // 上の帯がアクセント一色になるテーマは、ステータスバーのアイコンを帯の色から決めないと読めない
  // （Android 15 は setBackgroundColor が効かず、アプリが描いた色がそのまま見える）
  merged.statusBar = merged.bars === 'band' ? 'accent' : 'bg';

  const d = fixColors(merged.dark, merged.accent);
  const l = fixColors(merged.light, merged.accent);
  merged.dark = d.colors;
  merged.light = l.colors;

  return {
    spec: merged,
    report: [
      ...d.report.map(r => ({ ...r, label: `暗: ${r.label}` })),
      ...l.report.map(r => ({ ...r, label: `明: ${r.label}` })),
    ],
  };
}

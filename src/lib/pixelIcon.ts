// 作品の画像（workImages.ts）をドット絵にして、カレンダーの「ボード」表示の点に使う（2026-11-06 柴野）。
// 画像そのものは今までどおり workImages.ts に1枚だけ持ち、ドット絵は表示するときに端末の中で作る（保存先は増やさない）。
// 見た目の選び方（丸いドット絵／背景を抜いたドット絵／写真のまま・細かさ）だけを端末に覚える。

export type IconMode = 'round' | 'sprite' | 'photo';
export type IconStyle = { mode: IconMode; grid: number };

export const DEFAULT_ICON_STYLE: IconStyle = { mode: 'round', grid: 16 };
export const ICON_GRIDS: { grid: number; label: string }[] = [
  { grid: 12, label: 'あらい' },
  { grid: 16, label: 'ふつう' },
  { grid: 24, label: 'こまかい' },
];

const STYLE_KEY = 'fan_work_icon_styles';
const STYLE_EVENT = 'fan-work-icon-styles';

export function loadIconStyles(): Record<string, IconStyle> {
  try { return JSON.parse(localStorage.getItem(STYLE_KEY) ?? '{}'); } catch { return {}; }
}

export function iconStyleOf(styles: Record<string, IconStyle>, workId: string): IconStyle {
  return styles[workId] ?? DEFAULT_ICON_STYLE;
}

export function setIconStyle(workId: string, style: IconStyle) {
  const all = loadIconStyles();
  all[workId] = style;
  try { localStorage.setItem(STYLE_KEY, JSON.stringify(all)); } catch { /* 覚えられなくても表示は続ける */ }
  window.dispatchEvent(new Event(STYLE_EVENT));
}

export function onIconStylesChange(fn: () => void): () => void {
  window.addEventListener(STYLE_EVENT, fn);
  return () => window.removeEventListener(STYLE_EVENT, fn);
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

type RGB = [number, number, number];

/** 色を n 色に減らす（メディアンカット）。ドット絵らしい、はっきりした色にする */
function palette(px: RGB[], n: number): RGB[] {
  let boxes: RGB[][] = [px];
  while (boxes.length < n) {
    let bi = -1, best = 0, ch = 0;
    boxes.forEach((b, i) => {
      if (b.length < 2) return;
      for (let c = 0; c < 3; c++) {
        let lo = 255, hi = 0;
        for (const p of b) { if (p[c] < lo) lo = p[c]; if (p[c] > hi) hi = p[c]; }
        if (hi - lo > best) { best = hi - lo; bi = i; ch = c; }
      }
    });
    if (bi < 0) break;
    const b = [...boxes[bi]].sort((x, y) => x[ch] - y[ch]);
    const mid = b.length >> 1;
    boxes = [...boxes.slice(0, bi), b.slice(0, mid), b.slice(mid), ...boxes.slice(bi + 1)];
  }
  return boxes.map((b) => [0, 1, 2].map((c) => Math.round(b.reduce((s, p) => s + p[c], 0) / b.length)) as RGB);
}

/**
 * 画像をドット絵にする。真ん中を正方形に切り抜き → grid×grid に縮める → 色を減らす → 補間なしで拡大（PNG）。
 *  round … 丸く切り抜き、縁に1マスの輪郭を付ける（カレンダーの丸い点に馴染む）
 *  sprite … 周りの一番多い色を背景とみなして抜き、残った形に輪郭を付ける（白地の立ち絵・グッズ写真向け）
 */
export async function toPixelIcon(src: string, grid: number, shape: 'round' | 'sprite'): Promise<string | null> {
  const img = await loadImage(src);
  if (!img) return null;
  const side = Math.min(img.width, img.height);
  // いったん4倍の大きさに縮めてから grid へ。一気に縮めると細い線が消える
  const mid = document.createElement('canvas');
  mid.width = mid.height = grid * 4;
  const mx = mid.getContext('2d');
  const sm = document.createElement('canvas');
  sm.width = sm.height = grid;
  const sx = sm.getContext('2d', { willReadFrequently: true });
  if (!mx || !sx) return null;
  mx.imageSmoothingQuality = 'high';
  mx.fillStyle = '#ffffff';
  mx.fillRect(0, 0, mid.width, mid.height);
  mx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, mid.width, mid.height);
  sx.imageSmoothingQuality = 'high';
  sx.drawImage(mid, 0, 0, grid, grid);

  const data = sx.getImageData(0, 0, grid, grid);
  const d = data.data;
  const px: RGB[] = [];
  for (let i = 0; i < d.length; i += 4) {
    // 少しだけ彩度とコントラストを上げてから減色する
    const l = (d[i] + d[i + 1] + d[i + 2]) / 3;
    for (let c = 0; c < 3; c++) d[i + c] = Math.max(0, Math.min(255, (l + (d[i + c] - l) * 1.25 - 128) * 1.08 + 128));
    px.push([d[i], d[i + 1], d[i + 2]]);
  }
  const pal = palette(px, grid <= 12 ? 8 : grid <= 16 ? 12 : 16);
  for (let i = 0; i < d.length; i += 4) {
    let best = Infinity, bc = pal[0];
    for (const c of pal) {
      const e = (d[i] - c[0]) ** 2 + (d[i + 1] - c[1]) ** 2 + (d[i + 2] - c[2]) ** 2;
      if (e < best) { best = e; bc = c; }
    }
    d[i] = bc[0]; d[i + 1] = bc[1]; d[i + 2] = bc[2]; d[i + 3] = 255;
  }

  const at = (x: number, y: number) => (y * grid + x) * 4;
  if (shape === 'round') {
    // マスの中心が円の外にあるものを透明にする
    const r = grid / 2;
    for (let y = 0; y < grid; y++) for (let x = 0; x < grid; x++) {
      if ((x + 0.5 - r) ** 2 + (y + 0.5 - r) ** 2 > r * r) d[at(x, y) + 3] = 0;
    }
  } else {
    const key = (i: number) => `${d[i]},${d[i + 1]},${d[i + 2]}`;
    const edge: [number, number][] = [];
    for (let i = 0; i < grid; i++) edge.push([i, 0], [i, grid - 1], [0, i], [grid - 1, i]);
    const cnt: Record<string, number> = {};
    for (const [x, y] of edge) { const k = key(at(x, y)); cnt[k] = (cnt[k] ?? 0) + 1; }
    const [bgKey, bgN] = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0];
    // 周りの4割以上が同じ色のときだけ背景とみなす（写真の背景は抜けないので、そのまま四角で残す）
    if (bgN >= edge.length * 0.4) {
      const stack = edge.filter(([x, y]) => key(at(x, y)) === bgKey);
      const seen = new Set<number>();
      while (stack.length) {
        const [x, y] = stack.pop()!;
        if (x < 0 || y < 0 || x >= grid || y >= grid) continue;
        const i = at(x, y);
        if (seen.has(i) || key(i) !== bgKey) continue;
        seen.add(i);
        d[i + 3] = 0;
        stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
      }
    }
  }
  // 透明なところに接するマスを暗くして、1マスの輪郭にする
  const opaque = (x: number, y: number) => x >= 0 && y >= 0 && x < grid && y < grid && d[at(x, y) + 3] > 0;
  const rim: number[] = [];
  for (let y = 0; y < grid; y++) for (let x = 0; x < grid; x++) {
    if (opaque(x, y) && (!opaque(x + 1, y) || !opaque(x - 1, y) || !opaque(x, y + 1) || !opaque(x, y - 1))) rim.push(at(x, y));
  }
  for (const i of rim) { d[i] *= 0.45; d[i + 1] *= 0.45; d[i + 2] *= 0.5; }
  sx.putImageData(data, 0, 0);

  const out = document.createElement('canvas');
  out.width = out.height = grid * 8;
  const ox = out.getContext('2d');
  if (!ox) return null;
  ox.imageSmoothingEnabled = false;
  ox.drawImage(sm, 0, 0, out.width, out.height);
  return out.toDataURL('image/png');
}

// 同じ画像・同じ見た目は作り直さない（画面を開くたびに作ると、作品が多い人で重くなる）
const cache = new Map<string, Promise<string | null>>();

/** 作品の点に使う画像。写真のままなら元の画像をそのまま返す */
export function workIconUrl(src: string, style: IconStyle): Promise<string | null> {
  if (style.mode === 'photo') return Promise.resolve(src);
  const key = `${style.mode}:${style.grid}:${src.length}:${src.slice(-48)}`;
  let p = cache.get(key);
  if (!p) {
    p = toPixelIcon(src, style.grid, style.mode).catch(() => null);
    cache.set(key, p);
  }
  return p;
}

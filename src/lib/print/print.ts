// 記録の1枚を刷る（2026-11-19 柴野）。すべて端末の中でキャンバスに描く。写真は保存せず、予定の画像と記録の行から毎回刷る。
// 試作（Obsidian: Projects/fanhive-hive-mock/v5/src.html）の printPhoto・makeTicket・makeCheki・makeSeal・makeCell を移したもの。
//   riso  … 青・蛍光ピンク・黄の3色を網で重ねる。版が少しずれて、ざらつく（インクの色は学校の資料・stencil.wiki の近い値）
//   cheki … インスタント写真の色（黒が浮く・影は青緑・周りが暗い・粒子・ときどき光もれ）。ふちは紙の色。下が広い（instax mini 54×86mm・写真 46×62mm）
//   seal  … 白いふちの写真シールを台紙に。台紙の色は紙の色
//   plain … 文字だけの半券（撮らなかった・あとで）
// 外の画像が読めない（iOS の同梱アプリなど、キャンバスが汚れて画素を読めない）ときは、加工をせずに描く。
// 紙の色・入鋏・銀の紙は画面に説明を出さない（柴野「キリ番とかもわざわざ書かなくていい」）。

import { optimizedImage } from '../image';

export type PrintMode = 'riso' | 'cheki' | 'seal' | 'plain';
export type RecordKind = 'bought' | 'went';

/** 刷るのに要る、予定の中身 */
export type PrintItem = {
  title: string;
  work?: string;
  image?: string;       // 元の画像の URL（https）
  date?: string | null; // 発売日・開催日
  price?: number;
  isEvent: boolean;
  place?: string;       // 行ったの消印（都道府県）
};

/** 刷るのに要る、記録の中身（RPC print_record が決めた値） */
export type PrintRec = {
  id: string;
  kind: RecordKind;
  day: string;          // YYYY-MM-DD
  serial: number;
  paper: string;        // 白・桃・空・檸檬・若草・銀
  punch: string;
  mode: PrintMode;
  seed: number;
  sample?: boolean;     // 刷る前の見本（白い紙・入鋏なし）
};

export const PAPER_COLORS: Record<string, string> = { 白: '#f6f5f0', 桃: '#f6e2e5', 空: '#e0eaf4', 檸檬: '#f4edc9', 若草: '#e3eed8', 銀: '#e6e8ec' };
export const MODE_LABEL: Record<PrintMode, string> = { riso: 'リソ', cheki: 'チェキ', seal: 'シール', plain: '文字だけ' };
const RISO = ['#0078bf', '#ff48b0', '#ffe800'];
const INK = '#1d1d1b';
const PM_INK = '#8a3b2a';
const WDE = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const LABEL: Record<RecordKind, string> = { bought: '買った', went: '行った' };

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const hexRgb = (h: string) => { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
const nz = (x: number, y: number, i: number) => (((x * 73856093) ^ (y * 19349663) ^ (i * 83492791)) >>> 0) % 997 / 997;
/** 文字列から 0〜1 の値（同じ入力なら同じ値） */
export const hr = (s: string | number): number => {
  let h = 2166136261;
  for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15;
  return ((h >>> 0) % 10007) / 10007;
};
const cv = (w: number, h: number) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };
const rr = (g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
  g.beginPath();
  if ((g as CanvasRenderingContext2D & { roundRect?: unknown }).roundRect) g.roundRect(x, y, w, h, r); else g.rect(x, y, w, h);
};
const fitTx = (g: CanvasRenderingContext2D, t: string, w: number) => {
  if (g.measureText(t).width <= w) return t;
  while (t && g.measureText(t + '…').width > w) t = t.slice(0, -1);
  return t + '…';
};
const md = (d: string) => `${+d.slice(5, 7)}/${+d.slice(8, 10)}`;
const mono = (s: number) => `500 ${s}px "DM Mono", ui-monospace, Menlo, monospace`;
const jp = (s: number, w = 700) => `${w} ${s}px -apple-system, "Hiragino Sans", "Noto Sans JP", sans-serif`;
const num = (s: number, w = 800) => `${w} ${s}px "Outfit", ui-rounded, sans-serif`;

// ─── 画像を読む ─────────────────────────────────────────────
// Web と Android（fanhive.jp）は /_vercel/image が同じ出どころなので画素を読める。読めない画像は tainted を返す
type Loaded = { im: HTMLImageElement; tainted: boolean };
const imgCache = new Map<string, Promise<Loaded | null>>();
function loadOne(src: string, cors: boolean): Promise<HTMLImageElement> {
  return new Promise((ok, ng) => {
    const im = new Image();
    if (cors) im.crossOrigin = 'anonymous';
    im.onload = () => ok(im);
    im.onerror = ng;
    im.src = src;
  });
}
function canRead(im: HTMLImageElement): boolean {
  try { const c = cv(1, 1), g = c.getContext('2d')!; g.drawImage(im, 0, 0, 1, 1); g.getImageData(0, 0, 1, 1); return true; } catch { return false; }
}
export function loadPrintImage(url?: string): Promise<Loaded | null> {
  if (!url) return Promise.resolve(null);
  let p = imgCache.get(url);
  if (!p) {
    p = (async () => {
      const opt = optimizedImage(url, 640);
      const sameOrigin = opt.startsWith('/');
      try {
        const im = await loadOne(opt, !sameOrigin);
        if (canRead(im)) return { im, tainted: false };
      } catch { /* 次を試す */ }
      try { const im = await loadOne(url, true); if (canRead(im)) return { im, tainted: false }; } catch { /* 次を試す */ }
      try { const im = await loadOne(opt.startsWith('/') ? url : opt, false); return { im, tainted: true }; } catch { return null; }
    })();
    imgCache.set(url, p);
  }
  return p;
}

let fontsReady: Promise<unknown> | null = null;
const waitFonts = () => fontsReady ??= Promise.race([
  Promise.all([document.fonts.load(mono(12)), document.fonts.load(num(20)), document.fonts.load(num(14, 700))]),
  new Promise((ok) => setTimeout(ok, 1500)),
]);

// ─── 写真を刷る ─────────────────────────────────────────────
type PhotoOpt = { mode: PrintMode; paper: string; seed: number; small?: boolean; tainted?: boolean };
function regOf(seed: number): number[][] {
  return [0, 1, 2].map((i) => (i ? [Math.round((hr(seed + 'rx' + i) - 0.5) * 3), Math.round((hr(seed + 'ry' + i) - 0.5) * 3)] : [0, 0]));
}
function printPhoto(im: HTMLImageElement, w: number, h: number, o: PhotoOpt, cover: boolean): HTMLCanvasElement {
  const sw = Math.max(1, Math.round(w)), sh = Math.max(1, Math.round(h)), sc = cv(sw, sh);
  const g = sc.getContext('2d', { willReadFrequently: true })!;
  const P = hexRgb(PAPER_COLORS[o.paper] ?? PAPER_COLORS['白']);
  g.fillStyle = o.mode === 'seal' ? (PAPER_COLORS[o.paper] ?? '#fff') : '#fff';
  g.fillRect(0, 0, sw, sh);
  const r = cover ? Math.max(sw / im.width, sh / im.height) : Math.min(sw / im.width, sh / im.height);
  const iw = im.width * r, ih = im.height * r;
  g.filter = o.mode === 'seal' ? 'saturate(1.12) contrast(1.04)' : o.mode === 'riso' ? 'saturate(1.35) contrast(1.12)' : 'none';
  g.drawImage(im, (sw - iw) / 2, (sh - ih) / 2, iw, ih);
  g.filter = 'none';
  if (o.mode === 'seal') return sc;
  let id: ImageData;
  try { id = g.getImageData(0, 0, sw, sh); } catch {
    // 画素が読めない: 加工せずに紙の色を少し重ねるだけ
    g.globalCompositeOperation = 'multiply'; g.fillStyle = PAPER_COLORS[o.paper] ?? '#fff'; g.fillRect(0, 0, sw, sh);
    g.globalCompositeOperation = 'source-over';
    return sc;
  }
  const a = id.data;
  if (o.mode === 'riso') {
    const s = new Uint8ClampedArray(a), reg = regOf(o.seed), ink = RISO.map(hexRgb);
    for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
      const p = (y * sw + x) * 4, c = [P[0], P[1], P[2]];
      for (let i = 0; i < 3; i++) {
        const xx = clamp(x - reg[i][0], 0, sw - 1), yy = clamp(y - reg[i][1], 0, sh - 1);
        const v = clamp((s[(yy * sw + xx) * 4 + i] - 128) * 1.18 + 128, 0, 255) / 255;
        const cov = clamp((1 - v) * 1.12 - 0.07, 0, 1);
        const th = ((BAYER[((yy + i) % 4) * 4 + ((xx + 2 * i) % 4)] + 0.5) / 16) * 0.72 + nz(xx, yy, i) * 0.28;
        if (cov > th) for (let j = 0; j < 3; j++) c[j] *= (ink[i][j] / 255) * 0.9 + 0.1;
      }
      a[p] = c[0]; a[p + 1] = c[1]; a[p + 2] = c[2]; a[p + 3] = 255;
    }
  } else {
    for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
      const p = (y * sw + x) * 4, l = 0.299 * a[p] + 0.587 * a[p + 1] + 0.114 * a[p + 2], t = l / 255;
      const dx = x / sw - 0.5, dy = y / sh - 0.5, vg = 1 - 0.55 * (dx * dx + dy * dy), n = (nz(x, y, 7) - 0.5) * (o.small ? 8 : 16);
      const r0 = l + (a[p] - l) * 0.84, g0 = l + (a[p + 1] - l) * 0.84, b0 = l + (a[p + 2] - l) * 0.84;
      a[p] = clamp((24 + r0 * 0.84 + 12 * t) * vg + n, 0, 255);
      a[p + 1] = clamp((22 + g0 * 0.85 + 4 * t) * vg + n, 0, 255);
      a[p + 2] = clamp((34 + b0 * 0.78 - 8 * t) * vg + n, 0, 255);
    }
  }
  g.putImageData(id, 0, 0);
  if (o.mode === 'cheki' && hr(o.seed + 'lk') < 0.4) {
    const cx = hr(o.seed + 'lx') < 0.5 ? 0 : sw, rg = g.createRadialGradient(cx, sh * 0.15, 0, cx, sh * 0.15, sw * 0.75);
    rg.addColorStop(0, 'rgba(255,120,50,.55)'); rg.addColorStop(0.5, 'rgba(255,170,90,.18)'); rg.addColorStop(1, 'rgba(255,200,120,0)');
    g.globalCompositeOperation = 'screen'; g.fillStyle = rg; g.fillRect(0, 0, sw, sh); g.globalCompositeOperation = 'source-over';
  }
  return sc;
}

// ─── 入鋏・消印・ギザギザ・銀 ────────────────────────────────
function punchPath(g: CanvasRenderingContext2D, s: string, cx: number, cy: number, r: number) {
  g.beginPath();
  if (s === '丸') g.arc(cx, cy, r, 0, Math.PI * 2);
  else if (s === '四角') g.rect(cx - r * 0.82, cy - r * 0.82, r * 1.64, r * 1.64);
  else if (s === '三角') { g.moveTo(cx, cy - r); g.lineTo(cx + r * 0.98, cy + r * 0.72); g.lineTo(cx - r * 0.98, cy + r * 0.72); }
  else if (s === '菱') { g.moveTo(cx, cy - r * 1.05); g.lineTo(cx + r * 0.78, cy); g.lineTo(cx, cy + r * 1.05); g.lineTo(cx - r * 0.78, cy); }
  else if (s === '星') { for (let i = 0; i < 10; i++) { const t = -Math.PI / 2 + (i * Math.PI) / 5, q = i % 2 ? r * 0.46 : r * 1.08; if (i) g.lineTo(cx + Math.cos(t) * q, cy + Math.sin(t) * q); else g.moveTo(cx + Math.cos(t) * q, cy + Math.sin(t) * q); } }
  else if (s === '半月') g.arc(cx, cy, r, Math.PI * 0.5, Math.PI * 1.5, true);
  else if (s === '十字') { const t = r * 0.36; g.rect(cx - t, cy - r, t * 2, r * 2); g.rect(cx - r, cy - t, r * 2, t * 2); }
  else { g.moveTo(cx, cy - r * 1.1); g.quadraticCurveTo(cx + r * 1.05, cy + r * 0.2, cx, cy + r); g.quadraticCurveTo(cx - r * 1.05, cy + r * 0.2, cx, cy - r * 1.1); }
  g.closePath();
}
function postmark(g: CanvasRenderingContext2D, cx: number, cy: number, r: number, d: string, place: string, paper: string, seed: number) {
  g.save(); g.translate(cx, cy); g.rotate((hr(seed + 'pm') - 0.5) * 0.8);
  g.globalAlpha = 0.62; g.fillStyle = paper; g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fill();
  g.globalAlpha = 0.72 + hr(seed + 'pa') * 0.22; g.strokeStyle = g.fillStyle = PM_INK; g.lineWidth = 1.6;
  g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.stroke();
  g.lineWidth = 1; g.beginPath(); g.moveTo(-r * 0.94, -r * 0.3); g.lineTo(r * 0.94, -r * 0.3); g.moveTo(-r * 0.94, r * 0.3); g.lineTo(r * 0.94, r * 0.3); g.stroke();
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = jp(r * 0.36, 800); g.fillText(place, 0, -r * 0.6);
  g.font = mono(r * 0.36); g.fillText(d.slice(2).replace(/-/g, '.'), 0, 1);
  g.font = jp(r * 0.3, 800); g.fillText('行った', 0, r * 0.62);
  g.restore();
}
function jagClip(g: CanvasRenderingContext2D, W: number, H: number, seed: number, tw0 = 8, amp0 = 4) {
  g.beginPath(); g.moveTo(0, amp0);
  let x = 0, k = 0;
  while (x < W) { const tw = tw0 * (0.7 + hr(seed + 't' + k) * 0.7), a = amp0 * (0.55 + hr(seed + 'a' + k) * 0.8); g.lineTo(Math.min(W, x + tw / 2), amp0 - a); x += tw; g.lineTo(Math.min(W, x), amp0); k++; }
  g.lineTo(W, H - amp0); x = W; k = 0;
  while (x > 0) { const tw = tw0 * (0.7 + hr(seed + 'T' + k) * 0.7), a = amp0 * (0.55 + hr(seed + 'A' + k) * 0.8); g.lineTo(Math.max(0, x - tw / 2), H - amp0 + a); x -= tw; g.lineTo(Math.max(0, x), H - amp0); k++; }
  g.closePath();
}
function holo(g: CanvasRenderingContext2D, W: number, H: number) {
  g.save(); g.globalCompositeOperation = 'source-atop';
  const lg = g.createLinearGradient(0, 0, W, H);
  ['#ff9fb2', '#ffe08a', '#a6f0c6', '#9fd3ff', '#d6b0ff', '#ff9fb2'].forEach((c, i, a) => lg.addColorStop(i / (a.length - 1), c));
  g.globalAlpha = 0.28; g.fillStyle = lg; g.fillRect(0, 0, W, H);
  const sh = g.createLinearGradient(0, H * 0.2, W, H * 0.55); sh.addColorStop(0, 'rgba(255,255,255,0)'); sh.addColorStop(0.5, 'rgba(255,255,255,.75)'); sh.addColorStop(1, 'rgba(255,255,255,0)');
  g.globalAlpha = 0.5; g.fillStyle = sh; g.fillRect(0, 0, W, H); g.restore();
}
const short = (it: PrintItem) => (it.work ? it.title.replace(it.work, '').trim() : '') || it.title;

// ─── 1枚（大きい）─────────────────────────────────────────────
export type Printed = { url: string; w: number; h: number };
const DPR = 2;

/** 半券（リソ・文字だけ）: 写真か大きな日付、日付・作品・名前・値段・通し番号。上下はちぎった形 */
async function ticket(it: PrintItem, r: PrintRec, ld: Loaded | null): Promise<Printed> {
  const W = 250, pad = 16, PW = W - pad * 2, paper = PAPER_COLORS[r.paper] ?? PAPER_COLORS['白'];
  const im = r.mode === 'plain' ? null : ld?.im ?? null;
  const ph = im ? Math.round(Math.min((PW * im.height) / im.width, 190)) : 96;
  const H0 = 560, c = cv(W * DPR, H0 * DPR), g = c.getContext('2d')!; g.scale(DPR, DPR);
  g.fillStyle = paper; g.fillRect(0, 0, W, H0);
  let y = 24;
  g.fillStyle = INK; g.font = mono(10); g.fillText('FANHIVE', pad, y);
  g.textAlign = 'right'; g.fillText(r.sample ? 'SAMPLE' : 'No.' + String(r.serial).padStart(4, '0'), W - pad, y); g.textAlign = 'left';
  y += 9;
  const dash = (yy: number) => { g.save(); g.strokeStyle = INK; g.setLineDash([3, 3]); g.lineWidth = 1; g.beginPath(); g.moveTo(pad, yy + 0.5); g.lineTo(W - pad, yy + 0.5); g.stroke(); g.restore(); };
  dash(y); y += 10;
  const py = y, went = r.kind === 'went' && !r.sample;
  if (im) { g.drawImage(printPhoto(im, PW, ph, { mode: 'riso', paper: r.paper, seed: r.seed }, false), pad, y, PW, ph); }
  else {
    g.font = num(54); g.textAlign = 'center'; g.fillText(md(r.day), W / 2, y + 62);
    g.font = jp(12, 800); g.fillText(LABEL[r.kind], W / 2, y + 86); g.textAlign = 'left';
  }
  y += ph + 18;
  const dt = new Date(r.day + 'T00:00:00');
  g.font = mono(11); g.fillText(`${r.day.replace(/-/g, '.')} ${WDE[dt.getDay()]}`, pad, y);
  if (!went) { g.textAlign = 'right'; g.font = jp(11, 800); g.fillText(LABEL[r.kind], W - pad, y); g.textAlign = 'left'; }
  y += 17; g.font = jp(9.5, 600); g.fillStyle = '#5f5f5a'; g.fillText(fitTx(g, it.work ?? '', PW), pad, y);
  g.fillStyle = INK; g.font = jp(11.5, 700); y += 16;
  const t = short(it); let line = ''; const lines: string[] = [];
  for (const ch of t) { if (g.measureText(line + ch).width > PW - 18) { lines.push(line); line = ch; if (lines.length === 2) break; } else line += ch; }
  if (lines.length < 2 && line) lines.push(line); else if (lines.length === 2 && line) lines[1] = lines[1].slice(0, -1) + '…';
  lines.forEach((l, k) => g.fillText(l, pad, y + k * 16)); y += (lines.length - 1) * 16 + 12;
  dash(y); y += 24;
  g.font = mono(9); g.fillStyle = '#5f5f5a'; g.fillText((it.isEvent ? 'EVENT ' : 'RELEASE ') + (it.date ? md(it.date) : '—'), pad, y - 3);
  g.fillStyle = INK; g.textAlign = 'right'; g.font = num(19); g.fillText(it.price ? `¥${it.price.toLocaleString()}` : '—', W - pad, y); g.textAlign = 'left';
  y += 14;
  const H = y + 8;
  if (r.paper === '銀') holo(g, W, H);
  // かすれ
  g.save(); g.globalCompositeOperation = 'source-atop';
  for (let k = 0; k < 200; k++) { g.fillStyle = paper; g.globalAlpha = 0.3 + hr(r.seed + ':' + k) * 0.4; g.fillRect(hr(k + 'x' + r.seed) * W, hr(k + 'y' + r.seed) * H, 1 + hr(k + 'w') * 3, 1); }
  g.restore();
  if (went) postmark(g, W - pad - 30, py + ph + 2, 27, r.day, it.place ?? '会場', paper, r.seed);
  else if (!r.sample) { g.save(); g.globalCompositeOperation = 'destination-out'; punchPath(g, r.punch, W - pad - 7, y - 50 - (lines.length - 1) * 8, 6.5); g.fill('nonzero'); g.restore(); }
  const out = cv(W * DPR, H * DPR), og = out.getContext('2d')!; og.scale(DPR, DPR);
  jagClip(og, W, H, r.seed, 8, 4); og.clip(); og.drawImage(c, 0, 0, W * DPR, H * DPR, 0, 0, W, H);
  return { url: out.toDataURL('image/png'), w: W, h: H };
}

/** 下の余白の文字（チェキ・シール） */
function infoTx(g: CanvasRenderingContext2D, it: PrintItem, r: PrintRec, L: number, R: number, y: number) {
  const dt = new Date(r.day + 'T00:00:00'), went = r.kind === 'went' && !r.sample;
  g.fillStyle = INK; g.font = mono(10); g.fillText(`${r.day.replace(/-/g, '.')} ${WDE[dt.getDay()]}`, L, y);
  if (!went) { g.textAlign = 'right'; g.font = jp(11, 800); g.fillText(LABEL[r.kind], R, y); g.textAlign = 'left'; }
  y += 16; g.font = jp(9.5, 600); g.fillStyle = '#5f5f5a'; g.fillText(fitTx(g, it.work ?? '', R - L), L, y);
  y += 15; g.fillStyle = INK; g.font = mono(9); g.textAlign = 'right'; g.fillText(r.sample ? 'SAMPLE' : 'No.' + String(r.serial).padStart(4, '0'), R, y); g.textAlign = 'left';
  g.font = jp(10.5, 700); g.fillText(fitTx(g, short(it), R - L - 58), L, y);
}

async function cheki(it: PrintItem, r: PrintRec, ld: Loaded | null): Promise<Printed> {
  const W = 230, sd = 12, tp = 14, PW = W - sd * 2, PH = Math.round(PW * 1.1), H = tp + PH + 70;
  const c = cv(W * DPR, H * DPR), g = c.getContext('2d')!; g.scale(DPR, DPR);
  const paper = PAPER_COLORS[r.paper] ?? PAPER_COLORS['白'];
  rr(g, 0, 0, W, H, 7); g.clip(); g.fillStyle = paper; g.fillRect(0, 0, W, H);
  if (r.paper === '銀') holo(g, W, H);
  if (ld) g.drawImage(printPhoto(ld.im, PW * DPR, PH * DPR, { mode: 'cheki', paper: r.paper, seed: r.seed }, true), sd, tp, PW, PH);
  else { g.fillStyle = '#2a2a28'; g.fillRect(sd, tp, PW, PH); }
  g.strokeStyle = 'rgba(0,0,0,.1)'; g.lineWidth = 1; g.strokeRect(sd + 0.5, tp + 0.5, PW - 1, PH - 1);
  infoTx(g, it, r, sd + 2, W - sd - 2, tp + PH + 22);
  if (r.kind === 'went' && !r.sample) postmark(g, W - sd - 30, tp + PH - 8, 26, r.day, it.place ?? '会場', paper, r.seed);
  return { url: c.toDataURL('image/png'), w: W, h: H };
}

async function seal(it: PrintItem, r: PrintRec, ld: Loaded | null): Promise<Printed> {
  const W = 230, pd = 16;
  const iw0 = ld ? ld.im.width : 1, ih0 = ld ? ld.im.height : 1;
  const s0 = Math.min((W - pd * 2 - 16) / iw0, 186 / ih0), iw = Math.round(iw0 * s0), ih = Math.round(ih0 * s0);
  const H = pd + ih + 20 + 56, paper = PAPER_COLORS[r.paper] ?? PAPER_COLORS['白'];
  // シール本体: 白いふち＋角を丸めた写真
  const st = cv((iw + 8) * DPR, (ih + 8) * DPR), sg = st.getContext('2d')!; sg.scale(DPR, DPR);
  sg.fillStyle = '#fff'; rr(sg, 0, 0, iw + 8, ih + 8, 12); sg.fill();
  sg.save(); rr(sg, 5, 5, iw - 2, ih - 2, 8); sg.clip();
  if (ld) sg.drawImage(printPhoto(ld.im, (iw - 2) * DPR, (ih - 2) * DPR, { mode: 'seal', paper: '白', seed: r.seed }, true), 5, 5, iw - 2, ih - 2);
  sg.restore();
  if (r.paper === '銀') holo(sg, iw + 8, ih + 8);
  const c = cv(W * DPR, H * DPR), g = c.getContext('2d')!; g.scale(DPR, DPR);
  rr(g, 0, 0, W, H, 10); g.clip(); g.fillStyle = paper; g.fillRect(0, 0, W, H);
  g.save(); g.shadowColor = 'rgba(0,0,0,.25)'; g.shadowBlur = 3; g.shadowOffsetY = 1.5; g.drawImage(st, (W - iw - 8) / 2, pd - 4, iw + 8, ih + 8); g.restore();
  const ly = pd + ih + 12;
  g.save(); g.strokeStyle = 'rgba(0,0,0,.35)'; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(12, ly + 0.5); g.lineTo(W - 12, ly + 0.5); g.stroke(); g.restore();
  infoTx(g, it, r, 14, W - 14, ly + 20);
  if (r.kind === 'went' && !r.sample) postmark(g, W - 44, pd + 26, 26, r.day, it.place ?? '会場', paper, r.seed);
  return { url: c.toDataURL('image/png'), w: W, h: H };
}

/** 1枚を刷る（大きい方）。同じ記録・同じ刷り方なら覚えておいたものを返す */
const bigCache = new Map<string, Promise<Printed>>();
export function printRecord(it: PrintItem, r: PrintRec): Promise<Printed> {
  const key = `${r.id}:${r.mode}:${r.paper}:${r.sample ? 's' : ''}:${it.image ?? ''}`;
  let p = bigCache.get(key);
  if (!p) {
    p = (async () => {
      await waitFonts();
      const ld = r.mode === 'plain' ? null : await loadPrintImage(it.image);
      if (r.mode === 'cheki' && ld) return cheki(it, r, ld);
      if (r.mode === 'seal' && ld) return seal(it, r, ld);
      return ticket(it, ld ? r : { ...r, mode: 'plain' }, ld);
    })();
    bigCache.set(key, p);
  }
  return p;
}

// ─── マスに収める小さな1枚（40×52）───────────────────────────
const cellCache = new Map<string, Promise<string>>();
export function printCell(it: PrintItem, r: PrintRec): Promise<string> {
  const key = `${r.id}:${r.mode}:${r.paper}:${it.image ?? ''}`;
  let p = cellCache.get(key);
  if (!p) {
    p = (async () => {
      await waitFonts();
      const W = 40, H = 52, D = 3, c = cv(W * D, H * D), g = c.getContext('2d')!; g.scale(D, D);
      const paper = PAPER_COLORS[r.paper] ?? PAPER_COLORS['白'];
      const ld = r.mode === 'plain' ? null : await loadPrintImage(it.image);
      if (ld && (r.mode === 'cheki' || r.mode === 'seal')) {
        rr(g, 0, 0, W, H, 2.5); g.clip(); g.fillStyle = paper; g.fillRect(0, 0, W, H);
        if (r.mode === 'cheki') g.drawImage(printPhoto(ld.im, 34 * D, 38 * D, { mode: 'cheki', paper: r.paper, seed: r.seed, small: true }, true), 3, 3, 34, 38);
        else {
          g.save(); g.shadowColor = 'rgba(0,0,0,.25)'; g.shadowBlur = 1.5; g.shadowOffsetY = 0.5;
          g.fillStyle = '#fff'; rr(g, 4, 10, 32, 34, 4); g.fill(); g.restore();
          g.save(); rr(g, 6, 12, 28, 30, 3); g.clip(); g.drawImage(printPhoto(ld.im, 28 * D, 30 * D, { mode: 'seal', paper: '白', seed: r.seed }, true), 6, 12, 28, 30); g.restore();
        }
        if (r.paper === '銀') holo(g, W, H);
        if (r.kind === 'went') { g.save(); g.strokeStyle = PM_INK; g.lineWidth = 1; g.globalAlpha = 0.9; g.beginPath(); g.arc(W - 6.5, r.mode === 'cheki' ? 46 : 6.5, 3.6, 0, Math.PI * 2); g.stroke(); g.restore(); }
        return c.toDataURL('image/png');
      }
      g.fillStyle = paper; g.fillRect(0, 0, W, H);
      if (ld) g.drawImage(printPhoto(ld.im, 36 * D, 33 * D, { mode: 'riso', paper: r.paper, seed: r.seed, small: true }, true), 2, 12, 36, 33);
      else { g.fillStyle = INK; g.font = jp(15, 800); g.textAlign = 'center'; g.fillText(r.kind === 'went' ? '行' : '買', W / 2, 35); g.textAlign = 'left'; }
      if (r.paper === '銀') holo(g, W, H);
      if (r.kind === 'went') { g.save(); g.strokeStyle = PM_INK; g.lineWidth = 1; g.globalAlpha = 0.9; g.beginPath(); g.arc(W - 6.5, 6.5, 3.6, 0, Math.PI * 2); g.stroke(); g.restore(); }
      else { g.save(); g.globalCompositeOperation = 'destination-out'; punchPath(g, r.punch, W - 6, 6, 2.8); g.fill('nonzero'); g.restore(); }
      const out = cv(W * D, H * D), og = out.getContext('2d')!; og.scale(D, D);
      og.beginPath(); og.moveTo(0, 0); og.lineTo(W, 0); og.lineTo(W, H - 2);
      let xx = W, k = 0;
      while (xx > 0) { const tw = 4 * (0.75 + hr(r.seed + 'c' + k) * 0.6); og.lineTo(Math.max(0, xx - tw / 2), H); xx -= tw; og.lineTo(Math.max(0, xx), H - 2); k++; }
      og.closePath(); og.clip(); og.drawImage(c, 0, 0, W * D, H * D, 0, 0, W, H);
      return out.toDataURL('image/png');
    })();
    cellCache.set(key, p);
  }
  return p;
}

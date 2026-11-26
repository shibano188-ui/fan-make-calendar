// @ts-nocheck
// ホームの下のカバンと、ゲーム機の中の部屋・町（試作 Obsidian: Projects/fanhive-room-mock/game.html 第7版から移した）。
// 中身はほぼ試作のまま。違うのは: 自分のグッズ＝「買った」「行った」を押した予定（opts.goods）、ほかの人の部屋とファンの話＝アプリにある予定（opts.samples）、
// 並びは端末に残す（fh-room-app:ユーザー）、画面の外枠はアプリのタブの上に重ねる。
import * as THREE from 'three';

export type RoomGoods = { id: string; img: string; kind: 'stand' | 'card' | 'badge' | 'poster' | 'ticket'; title: string; sub: string; h: number };
export type RoomSample = { img: string; title: string; date?: string | null };
export type RoomState = { layout?: Record<string, string | null>; char?: 'A' | 'B'; myStk?: { id: string; pix: string }[]; placed?: { id: string; x: number; y: number; r: number }[]; coins?: number; cans?: { id: string; name: string; col: string; col2: string; code: string }[]; tut?: number | 'done' };
export type RoomOpts = { goods: RoomGoods[]; samples: RoomSample[]; userId?: string | null; state?: RoomState | null; save?: (s: RoomState) => void; share?: (blob: Blob, name: string, text: string) => Promise<unknown>; onMatome?: () => void; onOpen?: () => void; onClose?: () => void };

// ゲームを閉じても、画面を移ってもどっても、遊んでいた所から続ける（アプリを開いている間だけ覚える）
const SESSION: { s: null | { mode: string; owner: string; pos: number[]; ry: number; yaw: number; pitch: number; dist: number }; reopen: boolean } = { s: null, reopen: false };

export function startRoom(root: HTMLElement, opts: RoomOpts): { destroy: () => void } {
const $ = (id) => root.querySelector('#' + id);
const DPR = Math.min(2, devicePixelRatio || 1);
let dead = false, raf = 0;
const offs = [];
const onWin = (ev, fn) => { window.addEventListener(ev, fn); offs.push(() => window.removeEventListener(ev, fn)); };
const navH = () => document.querySelector('[data-bottom-nav]')?.getBoundingClientRect().height ?? 78;


// ───────── ドットの文字（3×5） ─────────
const GL = { A:'010101111101101',B:'110101110101110',C:'011100100100011',D:'110101101101110',E:'111100110100111',F:'111100110100100',G:'011100101101011',H:'101101111101101',I:'111010010010111',J:'001001001101010',K:'101101110101101',L:'100100100100111',O:'010101101101010',P:'110101110100100',Q:'010101101110011',R:'110101110101101',S:'011100010001110',T:'111010010010010',U:'101101101101111',V:'101101101101010',X:'101101010101101',Y:'101101010010010',Z:'111001010100111',
  0:'111101101101111',1:'010110010010111',2:'110001010100111',3:'110001010001110',4:'101101111001001',5:'111100110001110',6:'011100111101111',7:'111001010010010',8:'111101111101111',9:'111101111001110','+':'000010111010000','!':'010010010000010','?':'110001010000010',':':'000010000010000','.':'000000000000010','-':'000000111000000','/':'001001010100100',' ':'000000000000000','x':'000101010101000','>':'100010001010100','<':'001010100010001',
  M:'10001110111010110001100011', N:'10011101101110011001', W:'10001100011010111011100010' };
const gw = (ch) => Math.floor((GL[ch] ?? GL[' ']).length / 5);
function ptext(g, s, x, y, col, sc = 1, shadow) {
  s = String(s);
  if (shadow) ptext(g, s, x + sc, y + sc, shadow, sc);
  g.fillStyle = col;
  for (const ch of s) { const m = GL[ch] ?? GL[' '], w = gw(ch); for (let i = 0; i < w * 5; i++) if (m[i] === '1') g.fillRect(x + (i % w) * sc, y + ((i / w) | 0) * sc, sc, sc); x += (w + 1) * sc; }
}
const ptw = (s, sc = 1) => [...String(s)].reduce((a, ch) => a + (gw(ch) + 1) * sc, 0) - sc;
let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const px = (g, x, y, c) => { g.fillStyle = c; g.fillRect(x, y, 1, 1); };

// ───────── 画像: 読み込み・白い地を抜く ─────────
const imgCache = {};
const loadImg = (src) => imgCache[src] ||= new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = src; });
function bgMask(img, S) {
  const k = S / Math.max(img.width, img.height), w = Math.round(img.width * k), h = Math.round(img.height * k);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0, w, h);
  let id0; try { id0 = g.getImageData(0, 0, w, h); } catch { id0 = new ImageData(w, h); id0.data.fill(0); }
  const id = id0, d = id.data, bg = new Uint8Array(w * h), st = [];
  const white = (i) => d[i * 4] > 236 && d[i * 4 + 1] > 236 && d[i * 4 + 2] > 236;
  for (let x = 0; x < w; x++) st.push(x, (h - 1) * w + x); for (let y = 0; y < h; y++) st.push(y * w, y * w + w - 1);
  while (st.length) { const i = st.pop(); if (bg[i] || !white(i)) continue; bg[i] = 1; const x = i % w, y = (i / w) | 0; if (x > 0) st.push(i - 1); if (x < w - 1) st.push(i + 1); if (y > 0) st.push(i - w); if (y < h - 1) st.push(i + w); }
  return { c, g, id, bg, w, h };
}

// ───────── ゲーム機: ゲームボーイの縦の形＋エミュ機の肩ボタン。色はクリーム地にレトロポップ ─────────
const CON = { body:'#f2eadb', hi:'#fffaf0', sh:'#ddd0b7', speck:'#e9e0cd', edge:'#4b4360', bezel:'#3d3552', bezelHi:'#564c70', bezelTxt:'#cfc6e6',
  stripe:['#ff7a6b', '#9d8cf0'], logo:'#4b4360', logo2:'#ff6f61',
  dpad:['#211d2a', '#2e2a38', '#4a4458', '#17141e'], a:['#ff6f61', '#a83a32', '#ffc2b8', '#ffffff'], pill:['#b6a8ee', '#5d5390', '#e2dbff'], shoulder:['#7fd8c0', '#2f7f6c', '#c4f2e5'], btn:'#ff6f61' };
const consoleEl = $('console'), screenEl = $('screen'), tv = $('tv');
const PX = 3, L = {};
const place = (id, x, y, w, h) => Object.assign($(id).style, { left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px' });
function layoutConsole() {
  const cw = consoleEl.clientWidth, ch = consoleEl.clientHeight, BT = 18;
  const ctrl = Math.round(Math.min(296, Math.max(236, ch * 0.35)));
  const st = BT + 66, sh = ch - ctrl - st - 12 - 30;
  Object.assign(L, { cw, ch, BT, ctrl, y0: ch - ctrl, sl: 26, st, sw: cw - 52, sh });
  place('screen', L.sl, L.st, L.sw, L.sh);
  place('bL', 14, 0, 90, 30); place('bR', cw - 14 - 90, 0, 90, 30);
  place('bPow', cw - 24 - 96, BT + 6, 96, 24);
  place('dpad', 22, L.y0 + 30, 126, 126);
  place('bA', cw - 26 - 84, L.y0 + 40, 84, 84);
  place('bSel', Math.round(cw / 2 - 84), ch - 90, 72, 45);
  place('bStart', Math.round(cw / 2 + 2), ch - 90, 72, 45);
  place('bShot', 30, ch - 96, 48, 48);
  place('bHome', cw - 26 - 50, ch - 116, 48, 48);
}
// 角: 右下だけ大きく丸い（本体は肩ボタンのぶん下がっている）
function bodyTest(W, H, top) {
  return (x, y) => { if (y < top) return false; const yy = y - top, HH = H - top;
    const r = (x > W / 2 && yy > HH / 2) ? 26 : 8; const cx = Math.min(Math.max(x, r), W - 1 - r), cy = Math.min(Math.max(yy, r), HH - 1 - r); return (x - cx) ** 2 + (yy - cy) ** 2 <= r * r; };
}
function bodyPath(g, W, H, k, top) { g.beginPath(); g.roundRect(0, top * k, W * k, (H - top) * k, [8 * k, 8 * k, 26 * k, 8 * k]); }

// ステッカー（自分で描いたドット絵だけ）
const PAL = ['#2e2a38', '#ffffff', '#ff6f61', '#ffc94a', '#5fcfb0', '#9d8cf0', '#7cc7ff', '#ff9ec4', '#a0704a'];
const HEART = ['............', '.000...000..', '07770.07770.', '07177077770.', '07177777770.', '07777777770.', '.077777770..', '..0777770...', '...07770....', '....070.....', '.....0......', '............'].join('');
const BEEFACE = ['.0........0.', '..0......0..', '...0....0...', '..00333300..', '.0333333330.', '000333333000', '010333333010', '000333333000', '000733337000', '.0033883300.', '..00333300..', '....0000....'].join('');
const ST = opts.state && typeof opts.state === 'object' ? { ...opts.state } : {};
let persistT = 0;
const persist = () => { clearTimeout(persistT); persistT = setTimeout(() => opts.save?.({ ...ST }), 700); };
let myStk = Array.isArray(ST.myStk) && ST.myStk.length ? ST.myStk : [{ id: 'bee', pix: BEEFACE }];
let placedStk = Array.isArray(ST.placed) ? ST.placed : [{ id: 'bee', x: 0.5, y: 0.77, r: -0.12 }];
const saveStk = () => { ST.myStk = myStk; ST.placed = placedStk; persist(); };
function stickerCanvas(pix, cell) {
  const N = 12, pad = 2, c = document.createElement('canvas'); c.width = c.height = (N + pad * 2) * cell; const g = c.getContext('2d');
  const on = (x, y) => x >= 0 && y >= 0 && x < N && y < N && pix[y * N + x] !== '.';
  for (let y = -pad; y < N + pad; y++) for (let x = -pad; x < N + pad; x++) {
    let near = false; for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1; dx++) if (on(x + dx, y + dy)) { near = true; break; }
    if (near) { g.fillStyle = '#ffffff'; g.fillRect((x + pad) * cell, (y + pad) * cell, cell, cell); }
  }
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (on(x, y)) { g.fillStyle = PAL[+pix[y * N + x]]; g.fillRect((x + pad) * cell, (y + pad) * cell, cell, cell); }
  return c;
}

function drawSkin() {
  const { cw, ch } = L; const c = $('skin');
  c.width = Math.round(cw * DPR); c.height = Math.round(ch * DPR); c.style.width = cw + 'px'; c.style.height = ch + 'px';
  const g = c.getContext('2d'); g.imageSmoothingEnabled = false; g.clearRect(0, 0, c.width, c.height);
  const W = Math.round(cw / PX), H = Math.round(ch / PX), k = c.width / W, top = Math.round(L.BT / PX), inside = bodyTest(W, H, top);
  const lo = document.createElement('canvas'); lo.width = W; lo.height = H; const q = lo.getContext('2d');
  const s0 = seed; seed = 77;
  // 本体: つや消しのクリーム
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!inside(x, y)) continue;
    const edge = !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1);
    let col = rnd() < .14 ? CON.speck : CON.body;
    if (edge) col = CON.edge; else if (!inside(x - 2, y - 2)) col = CON.hi; else if (!inside(x + 2, y + 2)) col = CON.sh;
    px(q, x, y, col);
  }
  // 上のみぞと「OFF ON」の刻印
  for (let y = top + 3; y < top + 9; y += 2) for (let x = 40; x < Math.round(W * 0.56); x++) { px(q, x, y, CON.sh); px(q, x, y + 1, CON.hi); }
  ptext(q, '<OFF ON>', 6, top + 5, CON.hi); ptext(q, '<OFF ON>', 5, top + 4, '#c9bb9f');
  // 画面のふち（右下だけ大きく丸い）と 2 本の線
  const bx = Math.round((L.sl - 12) / PX), by = Math.round((L.st - 30) / PX), bw = Math.round((L.sw + 24) / PX), bh = Math.round((L.sh + 42) / PX);
  for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
    const r = (x > bw / 2 && y > bh / 2) ? 12 : 3, cx = Math.min(Math.max(x, r), bw - 1 - r), cy = Math.min(Math.max(y, r), bh - 1 - r);
    if ((x - cx) ** 2 + (y - cy) ** 2 > r * r) continue;
    px(q, bx + x, by + y, y === 0 ? CON.bezelHi : CON.bezel);
  }
  const label = 'DOT POCKET', lw = ptw(label), lx = bx + Math.round(bw * 0.2);
  [[CON.stripe[0], by + 4], [CON.stripe[1], by + 6]].forEach(([col, yy]) => { q.fillStyle = col; q.fillRect(bx + 4, yy, lx - bx - 7, 1); q.fillRect(lx + lw + 3, yy, bx + bw - 4 - (lx + lw + 3), 1); });
  ptext(q, label, lx, by + 3, CON.bezelTxt);
  // 電池のランプ
  const ly = by + Math.round(bh * 0.36), on = S.power === 'on' || S.power === 'boot';
  q.fillStyle = on ? '#ff5a5a' : '#2a2436'; q.fillRect(bx + 1, ly, 2, 2); if (on) px(q, bx + 1, ly, '#ffd0d0');
  // ロゴ
  const lgy = by + bh + 3; ptext(q, 'FANHIVE', Math.round(L.sl / PX), lgy, CON.logo, 2);
  const px2 = Math.round(L.sl / PX) + ptw('FANHIVE', 2) + 4; ptext(q, 'POCKET', px2, lgy + 5, CON.logo2); q.fillStyle = CON.logo2; q.fillRect(px2, lgy + 11, ptw('POCKET'), 1);
  // 十字ボタンと A のくぼみ
  const ring = (cx, cy, r) => { for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) { const d = Math.hypot(x, y); if (d <= r && d > r - 1.2) px(q, cx + x, cy + y, CON.sh); else if (d <= r - 1.2 && d > r - 2.2 && y < 0) px(q, cx + x, cy + y, CON.hi); } };
  ring(Math.round((22 + 63) / PX), Math.round((L.y0 + 30 + 63) / PX), 23);
  ring(Math.round((cw - 26 - 42) / PX), Math.round((L.y0 + 40 + 42) / PX), 16);
  // スピーカー: 斜めのみぞ（右下）
  for (let i = 0; i < 6; i++) { const x0 = W - 30 + i * 4, y0 = H - 7; for (let j = 0; j < 13; j++) { const x = x0 + Math.round(j * 0.55), y = y0 - j; if (inside(x + 1, y)) { px(q, x, y, '#6d6280'); px(q, x + 1, y, CON.hi); } } }
  seed = s0;
  g.drawImage(lo, 0, 0, W * k, H * k);
  drawButtons(); buildBagConsole(); renderStickers();
}

// ───────── ボタン（ドット） ─────────
function drawPow() {
  const c = $('bPow').querySelector('canvas'), g = c.getContext('2d'), [fill, line, hi] = CON.pill; g.clearRect(0, 0, 32, 8);
  g.fillStyle = line; g.fillRect(1, 0, 30, 8); g.fillRect(0, 1, 32, 6);
  g.fillStyle = fill; g.fillRect(1, 1, 30, 6); g.fillStyle = hi; g.fillRect(2, 1, 28, 1);
  const on = S.power === 'on' || S.power === 'boot';
  g.fillStyle = on ? '#2bd66a' : '#5b6b60'; g.fillRect(3, 2, 3, 3); if (on) px(g, 3, 2, '#c8ffd9');
  ptext(g, 'POWER', 8, 2, line);
}
function drawPill(id, label) {
  const c = $(id).querySelector('canvas'), g = c.getContext('2d'), [fill, line, hi] = CON.pill; g.clearRect(0, 0, 24, 15);
  g.fillStyle = line; g.fillRect(3, 2, 18, 7); g.fillRect(2, 3, 20, 5);
  g.fillStyle = fill; g.fillRect(4, 3, 16, 5); g.fillRect(3, 4, 18, 3); g.fillStyle = hi; g.fillRect(5, 3, 14, 1);
  ptext(g, label, Math.round(12 - ptw(label) / 2), 10, CON.logo);
}
function drawA() {
  const c = $('bA').querySelector('canvas'), g = c.getContext('2d'), [fill, line, hi, txt] = CON.a; g.clearRect(0, 0, 28, 28);
  for (let y = 0; y < 28; y++) for (let x = 0; x < 28; x++) { const d = Math.hypot(x - 13.5, y - 13.5), ds = Math.hypot(x - 13.5, y - 14.8);
    if (d < 12.4) px(g, x, y, d > 11.3 ? line : (Math.hypot(x - 10, y - 9.5) < 4 ? hi : fill)); else if (ds < 12.4) px(g, x, y, 'rgba(0,0,0,.25)'); }
  ptext(g, 'A', 13, 11, txt);
}
function drawShoulder(id, label) {
  const c = $(id).querySelector('canvas'), g = c.getContext('2d'), [fill, line, hi] = CON.shoulder; g.clearRect(0, 0, 30, 10);
  for (let y = 0; y < 10; y++) for (let x = 0; x < 30; x++) { const r = 4, cx = Math.min(Math.max(x, r), 29 - r), cy = Math.max(y, r); if ((x - cx) ** 2 + (y - cy) ** 2 > r * r) continue;
    const edge = x === 0 || x === 29 || y === 0 || (x - cx) ** 2 + (y - cy) ** 2 > (r - 1) ** 2; px(g, x, y, edge ? line : y === 1 ? hi : fill); }
  ptext(g, label, 14, 1, line);
}
let dpadDir = '';
function drawDpad(dir = dpadDir) {
  dpadDir = dir;
  const g = $('dpadC').getContext('2d'), [line, fill, hi, press] = CON.dpad; g.clearRect(0, 0, 42, 42);
  const inC = (x, y) => x >= 1 && x <= 39 && y >= 1 && y <= 39 && ((x >= 14 && x <= 26) || (y >= 14 && y <= 26));
  const arm = (x, y) => y < 14 ? 'u' : y > 26 ? 'd' : x < 14 ? 'l' : x > 26 ? 'r' : '';
  for (let y = 0; y < 42; y++) for (let x = 0; x < 42; x++) {
    if (!inC(x, y)) { if (inC(x - 1, y - 2)) px(g, x, y, 'rgba(0,0,0,.28)'); continue; }
    const edge = !inC(x - 1, y) || !inC(x + 1, y) || !inC(x, y - 1) || !inC(x, y + 1);
    const a = arm(x, y), on = a && dir.includes(a);
    px(g, x, y, edge ? line : on ? press : (!inC(x, y - 2) ? hi : fill));
  }
  for (let y = 17; y < 24; y++) for (let x = 17; x < 24; x++) if (Math.hypot(x - 20, y - 20) < 3.2) px(g, x, y, line);
  const tri = (cx, cy, dx, dy) => { for (let i = 0; i < 3; i++) for (let j = -i; j <= i; j++) px(g, cx + dx * i + dy * j, cy + dy * i + dx * j, hi); };
  tri(20, 5, 0, 1); tri(20, 35, 0, -1); tri(5, 20, 1, 0); tri(35, 20, -1, 0);
}
function drawShotBtn() {
  const g = $('bShot').querySelector('canvas').getContext('2d'), [fill, line, hi] = CON.pill; g.clearRect(0, 0, 16, 16);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const d = Math.hypot(x - 7.5, y - 7.5); if (d < 7.6) px(g, x, y, d > 6.6 ? line : (d < 5.8 && y < 5 ? hi : fill)); }
  g.fillStyle = line; g.fillRect(4, 6, 8, 5); g.fillRect(6, 5, 3, 1); g.fillStyle = fill; g.fillRect(6, 7, 3, 3); g.fillStyle = line; g.fillRect(7, 8, 1, 1); g.fillStyle = '#ffffff'; g.fillRect(10, 7, 1, 1);
}
function drawHomeBtn() {
  const g = $('bHome').querySelector('canvas').getContext('2d'), [fill, line, hi] = CON.pill; g.clearRect(0, 0, 16, 16);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const d = Math.hypot(x - 7.5, y - 7.5); if (d < 7.6) px(g, x, y, d > 6.6 ? line : (d < 5.8 && y < 5 ? hi : fill)); }
  g.fillStyle = line; for (let i = 0; i < 4; i++) g.fillRect(7 - i, 4 + i, 2 + i * 2, 1); g.fillRect(4, 8, 8, 4); g.fillStyle = fill; g.fillRect(7, 9, 2, 3);
}
function drawButtons() { drawShotBtn(); drawHomeBtn(); drawPow(); drawPill('bSel', 'SELECT'); drawPill('bStart', 'START'); drawA(); drawDpad(); drawShoulder('bL', 'L'); drawShoulder('bR', 'R'); document.documentElement.style.setProperty('--btn', CON.btn); }

// ───────── カバン（ホーム・ドット絵）: 画面の下のはしで、くたっと口が開いている ─────────
const bagEl = $('bag'), BAG = {};
function drawBag() {
  const aw = bagEl.clientWidth, ah = bagEl.clientHeight, W = Math.round(aw / PX), H = Math.round(ah / PX);
  const cx = Math.round(W * 0.5), my = 22, mw = 47;
  Object.assign(BAG, { aw, ah, mouth: (my + 6) * PX });
  const C = { milk:'#f6f1e7', hi:'#ffffff', sh:'#e8e0d0', sh2:'#d7ccb8', sh3:'#c4b8a2', line:'#8f8676', in1:'#d4cab8', in2:'#bdb29c', in3:'#a39883', ring:'#c9c3d6', ringD:'#8d86a0' };
  const mk = (id) => { const c = $(id); c.width = Math.round(aw * DPR); c.height = Math.round(ah * DPR); c.style.width = aw + 'px'; c.style.height = ah + 'px'; const g = c.getContext('2d'); g.imageSmoothingEnabled = false; return g; };
  const lo = document.createElement('canvas'); lo.width = W; lo.height = H; const q = lo.getContext('2d');
  const k = aw * DPR / W, blit = (g) => { g.drawImage(lo, 0, 0, W * k, H * k); q.clearRect(0, 0, W, H); };
  const tt = (x) => Math.max(-1, Math.min(1, (x + 0.5 - cx) / mw));
  const backY = (x) => my - Math.round(7 * Math.sqrt(1 - tt(x) ** 2) + Math.sin(x * 0.45) * 0.6);
  const droop = (x) => x > cx + 6 ? Math.min(8, (x - cx - 6) * 0.24) : 0; // 右側の口がつぶれて垂れている
  const frontY = (x) => my + Math.round(5 * Math.sqrt(1 - tt(x) ** 2) + droop(x) + Math.sin(x * 0.7) * 0.7);
  const hw = (y) => mw + 2 + 11 * Math.sin(Math.min(1, Math.max(0, (y - my) / 34)) * Math.PI / 2); // 下へ行くほどつぶれて広がる
  const span = (x) => Math.abs(x + 0.5 - cx) < mw;
  const inBody = (x, y) => y >= my && Math.abs(x + 0.5 - cx) <= hw(y) && (!span(x) || y >= frontY(x));
  const bez = (p, t) => { const u = 1 - t; return [u * u * u * p[0][0] + 3 * u * u * t * p[1][0] + 3 * u * t * t * p[2][0] + t * t * t * p[3][0], u * u * u * p[0][1] + 3 * u * u * t * p[1][1] + 3 * u * t * t * p[2][1] + t * t * t * p[3][1]]; };
  // ひも: 立たずに垂れている（やわらかい帯）
  const strap = (p, clip) => {
    const pts = []; for (let i = 0; i <= 90; i++) pts.push(bez(p, i / 90));
    const disc = (r, col) => pts.forEach(([x, y]) => { for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) if (dx * dx + dy * dy <= r * r) { const X = Math.round(x + dx), Y = Math.round(y + dy); if (!clip || !clip(X, Y)) px(q, X, Y, col); } });
    disc(2.6, C.line); disc(1.7, C.milk);
    pts.forEach(([x, y], i) => { if (i % 4 === 0) { const X = Math.round(x), Y = Math.round(y); if (!clip || !clip(X, Y)) px(q, X, Y, C.sh2); } });
  };
  // 後ろ: 右のひも（体の横に落ちている）・奥の口・中の暗がり
  let g = mk('bagBack');
  strap([[cx + mw - 1, my], [cx + mw + 14, my - 6], [cx + mw + 16, my + 22], [W + 6, my + 30]], inBody);
  for (let x = cx - mw; x <= cx + mw; x++) {
    const b = backY(x), f = frontY(x);
    for (let y = b - 1; y <= f + 2; y++) {
      let col;
      if (y === b - 1) col = C.line; else if (y === b) col = C.hi; else if (y === b + 1) col = C.sh;
      else { const t = (y - b) / Math.max(1, f - b); col = t < 0.35 ? C.in1 : t < 0.75 ? C.in2 : C.in3; if ((x * 7 + y * 3) % 23 === 0) col = C.in3; }
      px(q, x, y, col);
    }
  }
  // 中身（ドット）: 口からのぞく持ち物。ゲーム機だけはローポリで前に出す
  const INK = '#5b5068';
  const thing = (cx0, cy0, w, h, a, fill, parts, hi, sh) => {
    const ca = Math.cos(a), sa = Math.sin(a), R0 = Math.ceil(Math.hypot(w, h) / 2) + 1;
    const loc = (x, y) => { const dx = x + 0.5 - cx0, dy = y + 0.5 - cy0; return [dx * ca + dy * sa, -dx * sa + dy * ca]; };
    const ins = (x, y) => { const [lx, ly] = loc(x, y); return Math.abs(lx) <= w / 2 && Math.abs(ly) <= h / 2; };
    for (let y = Math.floor(cy0 - R0); y <= cy0 + R0; y++) for (let x = Math.floor(cx0 - R0); x <= cx0 + R0; x++) {
      if (!ins(x, y)) continue; const [lx, ly] = loc(x, y); let col = fill;
      for (const p of parts) if (lx >= p[0] * w && lx <= p[1] * w && ly >= p[2] * h && ly <= p[3] * h) col = p[4];
      if (lx < -w / 2 + 1.3) col = hi; else if (lx > w / 2 - 1.8 && (x + y) % 2 === 0) col = sh;
      if (!ins(x - 1, y) || !ins(x + 1, y) || !ins(x, y - 1) || !ins(x, y + 1)) col = INK;
      px(q, x, y, col);
    }
  };
  thing(108, 13, 6, 26, 0.42, '#ff7a6b', [[-0.5, 0.5, -0.5, -0.3, '#f2eadb'], [-0.5, 0.5, -0.04, 0.06, '#fffaf0']], '#ffa598', '#d65a4c');
  thing(44, 12, 5, 26, -0.55, '#e4dbff', [[-0.5, 0.5, 0.15, 0.5, '#3d3552'], [-0.5, 0.5, 0.08, 0.15, '#9d8cf0'], [-0.5, 0.5, -0.5, -0.42, '#ffffff']], '#ffffff', '#b6a8ee');
  thing(89, 14, 7, 26, 0.2, '#e6f7f1', [[-0.5, 0.5, -0.5, -0.36, '#ffffff'], [-0.5, 0.5, -0.05, 0.25, '#5fcfb0'], [-0.5, 0.5, 0.06, 0.12, '#ffffff']], '#ffffff', '#bfe3d6');
  thing(27, 17, 15, 20, 0.33, '#ffc94a', [[0.16, 0.3, -0.5, 0.5, '#3d3552']], '#ffe08a', '#e0a92e');
  thing(37, 21, 18, 8, 0.6, '#fff4dc', [[-0.5, -0.3, -0.5, 0.5, '#ff7a6b'], [-0.1, 0.4, -0.18, 0.0, '#3d3552']], '#ffffff', '#ecdcb8');
  thing(78, 19, 13, 15, -0.25, '#ff9ec4', [[-0.5, 0.5, -0.5, -0.38, '#ffd1e3'], [-0.5, 0.5, 0.0, 0.22, '#ffc94a'], [-0.2, 0.2, -0.3, -0.08, '#ffffff']], '#ffc2da', '#e57aa5');
  thing(99, 22, 18, 11, -0.12, '#7fd8c0', [[-0.5, 0.5, -0.5, -0.1, '#5fbfa6'], [-0.07, 0.07, -0.16, 0.02, '#ffc94a']], '#a8e8d5', '#4fae94');
  thing(52, 23, 22, 11, -0.08, '#b6a8ee', [[-0.45, 0.45, -0.42, -0.28, '#ffc94a']], '#d4cbf7', '#8f80d0');
  for (let y = 19; y < 32; y++) for (let x = 15; x < 28; x++) { const d = Math.hypot(x + 0.5 - 21, (y + 0.5 - 25) * 1.3); if (d < 5.2 && d > 2) px(q, x, y, d > 4.4 || d < 2.8 ? INK : ((x + y) % 3 ? '#7fd8c0' : '#a8e8d5')); }
  for (let y = 16; y < 30; y++) for (let x = 108; x < 122; x++) { const d = Math.hypot(x + 0.5 - 113, y + 0.5 - 20); if (d < 3.2 && d > 1.8) px(q, x, y, '#c9c3d6'); }
  [[115, 23, '..00.00..'], [115, 24, '.0770770.'], [115, 25, '.0777770.'], [115, 26, '..07770..'], [115, 27, '...070...'], [115, 28, '....0....']].forEach(([x0, y, r]) => [...r].forEach((ch, i) => { if (ch !== '.') px(q, x0 - 4 + i, y, ch === '0' ? INK : '#ff9ec4'); }));
  blit(g);
  // 前: 本体（しわが寄ってくしゃっとした生地）
  g = mk('bagFront');
  for (let y = my - 1; y < H; y++) for (let x = 0; x < W; x++) {
    if (!inBody(x, y)) continue;
    const edge = !inBody(x - 1, y) || !inBody(x + 1, y) || !inBody(x, y - 1) || !inBody(x, y + 1);
    const t = (y - my) / (H - my), rel = (x + 0.5 - cx) / hw(y);
    let col = C.milk;
    if (rel < -0.84) col = C.hi; else if (rel > 0.8) col = C.sh2; else if (rel > 0.55 || t > 0.72) col = C.sh;
    if (span(x) && y <= frontY(x) + 2 && y > frontY(x)) col = C.hi;
    if (span(x) && y === frontY(x) + 4 && x % 3 === 0) col = C.sh2;
    if (edge) col = C.line;
    px(q, x, y, col);
  }
  // つぶれた口の下の影
  for (let x = cx + 6; x < cx + mw; x++) { const d = Math.round(droop(x) * 0.9); for (let i = 0; i < d; i++) { const y = frontY(x) + 3 + i; if (inBody(x, y)) px(q, x, y, i < d / 2 ? C.sh2 : C.sh); } }
  // しわ
  const crease = (x0, y0, len, dx, strong) => { for (let i = 0; i < len; i++) { const x = Math.round(x0 + i * dx + Math.sin(i / 2.5) * 0.8), y = y0 + i; if (!inBody(x, y) || !inBody(x - 1, y)) continue; px(q, x, y, strong ? C.sh3 : C.sh2); px(q, x - 1, y, C.hi); } };
  crease(cx - 31, my + 9, 13, 0.35, 1); crease(cx - 13, my + 8, 9, -0.3, 0); crease(cx + 17, my + 13, 15, 0.5, 1); crease(cx + 37, my + 17, 10, -0.45, 0);
  crease(cx - 46, my + 17, 16, 0.18, 0); crease(cx + 2, my + 22, 12, -0.12, 0);
  for (let x = cx - 22; x < cx + 26; x++) { const y = my + 30 + Math.round(Math.sin((x - cx) / 9) * 1.6); if (inBody(x, y)) { px(q, x, y, C.sh2); px(q, x, y - 1, C.hi); } }
  // 前のひも: 口の左の金具から、体の前に垂れて下へ
  strap([[cx - mw + 1, my + 1], [cx - mw + 6, my + 30], [cx - 18, my + 34], [cx + 10, H + 8]]);
  // 金具（D カン）
  [[cx - mw + 1, my], [cx + mw - 1, my]].forEach(([x, y]) => { q.fillStyle = C.ringD; q.fillRect(x - 2, y - 2, 4, 4); q.fillStyle = C.ring; q.fillRect(x - 1, y - 1, 2, 2); });
  blit(g);
  sizeBag();
}

// ───────── 町と部屋のテクスチャ ─────────
function pix(w, h, draw, rep = [1, 1]) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...rep);
  return t;
}
const floorTex = pix(32, 32, (g) => { const wood = ['#a0764d', '#93693f', '#ab8257', '#9a7047'];
  for (let r = 0; r < 4; r++) for (let y = 0; y < 8; y++) for (let x = 0; x < 32; x++) { let c = wood[(r + ((x + r * 11) >> 4)) % 4]; if (y === 7 || ((x + r * 11) % 16 === 0)) c = '#6a4a2e'; else if (rnd() < 0.08) c = '#b98f62'; px(g, x, r * 8 + y, c); } }, [5, 5]);
const wallTex = (base, stripe, dot, rep = [8, 3]) => pix(16, 16, (g) => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { let c = (x % 8 === 0) ? stripe : base; if ((x % 8 === 4) && (y % 8 === 2 || y % 8 === 3)) c = dot; if (rnd() < 0.05) c = stripe; px(g, x, y, c); } }, rep);
const wallA = wallTex('#f0e2cf', '#e4d2b8', '#e08a7d'), wallB = wallTex('#e2e6f6', '#d0d6ee', '#9d8cf0');
const woodTex = pix(16, 8, (g) => { for (let y = 0; y < 8; y++) for (let x = 0; x < 16; x++) px(g, x, y, y === 0 ? '#c49a6b' : (rnd() < .1 ? '#95714c' : '#a98259')); });
const ivoryTex = pix(16, 8, (g) => { for (let y = 0; y < 8; y++) for (let x = 0; x < 16; x++) px(g, x, y, y === 0 ? '#ffffff' : (rnd() < .08 ? '#e6dfd2' : '#f4efe6')); });
const corkTex = pix(24, 18, (g) => { for (let y = 0; y < 18; y++) for (let x = 0; x < 24; x++) px(g, x, y, (x < 1 || y < 1 || x > 22 || y > 16) ? '#6b5038' : ['#c19a6b', '#b48d5f', '#caa577', '#a98455'][Math.floor(rnd() * 4)]); });
const windowTex = pix(24, 24, (g) => { for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) { const fr = x < 2 || y < 2 || x > 21 || y > 21 || x === 11 || x === 12 || y === 11; px(g, x, y, fr ? '#efe9de' : (y < 8 ? '#f0a46b' : y < 15 ? '#f6c98c' : '#d9b9a3')); }
  for (let x = 2; x < 22; x++) px(g, x, 6 + Math.round(Math.sin(x / 4)), '#3a3a44'); for (let x = 2; x < 22; x++) px(g, x, 9 + Math.round(Math.sin(x / 5 + 1)), '#3a3a44'); });
const rugTex = pix(16, 16, (g) => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const b = x === 0 || y === 0 || x === 15 || y === 15; const d = (x + y) % 4 === 0 || (x - y + 16) % 4 === 0; px(g, x, y, b ? '#6f63a8' : d ? '#b6a8ee' : '#d9d1f7'); } });
const bedTex = pix(16, 16, (g) => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) px(g, x, y, ((x >> 2) + (y >> 2)) % 2 ? '#ffe2d6' : '#ffc9b8'); });
const spineTex = pix(48, 16, (g) => { let x = 0; const cols = ['#e2574c', '#3f7fbf', '#f0c040', '#2e9b67', '#8e6ad8', '#ee8a3a', '#2a2733', '#f5f5f5', '#ff9ec4', '#3fb3a0'];
  while (x < 48) { const w = 2 + Math.floor(rnd() * 2), c = cols[Math.floor(rnd() * cols.length)], h = 12 + Math.floor(rnd() * 4);
    for (let i = 0; i < w && x + i < 48; i++) for (let y = 16 - h; y < 16; y++) px(g, x + i, y, c);
    px(g, x, 16 - h + 2, '#fff'); x += w; } });
const doorTex = pix(12, 24, (g) => { for (let y = 0; y < 24; y++) for (let x = 0; x < 12; x++) px(g, x, y, (x === 0 || x === 11 || y === 0) ? '#5b4430' : (y % 6 === 0 ? '#7d5f42' : '#94734f')); px(g, 9, 12, '#e8c15a'); px(g, 9, 13, '#e8c15a'); });
const facade = (base, win, lit) => pix(16, 16, (g) => { g.fillStyle = base; g.fillRect(0, 0, 16, 16); g.fillStyle = 'rgba(0,0,0,.08)'; g.fillRect(0, 15, 16, 1); g.fillRect(0, 7, 16, 1);
  [[2, 2], [9, 2], [2, 9], [9, 9]].forEach(([wx, wy], i) => { g.fillStyle = '#f4f1ea'; g.fillRect(wx, wy, 5, 4); g.fillStyle = (i * 7 + wx) % 3 ? win : lit; g.fillRect(wx + 1, wy + 1, 3, 2); g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(wx, wy + 4, 5, 1); }); }, [2, 2]);
function signTex(text, bg, fg) { return pix(ptw(text) + 4, 9, (g, w, h) => { g.fillStyle = bg; g.fillRect(0, 0, w, h); g.fillStyle = '#00000033'; g.fillRect(0, h - 1, w, 1); ptext(g, text, 2, 2, fg); }); }
const cobbleTex = pix(16, 16, (g) => { const cols = ['#c9bfae', '#bfb4a2', '#d3cab9', '#b7ab98'];
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const row = y >> 2, off = (row & 1) * 2, col = (x + off) >> 2; const mortar = y % 4 === 3 || (x + off) % 4 === 3; px(g, x, y, mortar ? '#9d9384' : cols[(row * 5 + col * 3) % 4]); } }, [70, 70]);
const grassTex = pix(16, 16, (g) => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const r = rnd(); px(g, x, y, r < .08 ? '#7fb069' : r < .5 ? '#93c27a' : '#8aba72'); } [[3, 4, '#fff6f0'], [11, 9, '#ffd166'], [6, 13, '#ff9ec4']].forEach(([x, y, c]) => px(g, x, y, c)); }, [4, 4]);
const tileTex = pix(16, 16, (g) => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) px(g, x, y, (x % 8 === 0 || y % 8 === 0) ? '#cdbfae' : (((x >> 3) + (y >> 3)) % 2 ? '#efe4d2' : '#e6d7c2')); }, [4, 4]);
const vendTex = pix(10, 18, (g) => { g.fillStyle = '#e2574c'; g.fillRect(0, 0, 10, 18); g.fillStyle = '#dff4ff'; g.fillRect(1, 2, 8, 7); ['#3498db', '#f1c40f', '#2ecc71', '#e67e22'].forEach((c, i) => { g.fillStyle = c; g.fillRect(2 + (i % 2) * 4, 3 + Math.floor(i / 2) * 3, 2, 2); }); g.fillStyle = '#222'; g.fillRect(2, 12, 6, 2); });
const qTex = pix(8, 8, (g) => { g.fillStyle = '#f5b700'; g.fillRect(0, 0, 8, 8); g.fillStyle = '#b37800'; g.fillRect(0, 7, 8, 1); g.fillRect(7, 0, 1, 8); ptext(g, '?', 3, 1, '#fff'); });
const mangaTex = pix(8, 11, (g) => { g.fillStyle = '#f5f2ea'; g.fillRect(0, 0, 8, 11); g.fillStyle = '#e84393'; g.fillRect(0, 0, 8, 3); g.fillStyle = '#2d2d2d'; g.fillRect(2, 4, 4, 4); g.fillStyle = '#f5d6b4'; g.fillRect(3, 5, 2, 2); });

// ───────── 描画: 世界は粗く（ドット）、グッズとアイテムはくっきり ─────────
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(DPR);
renderer.outputColorSpace = THREE.SRGBColorSpace;
tv.prepend(renderer.domElement);
const LOW = 0.28;
let lowRT;
const camera = new THREE.PerspectiveCamera(52, 1, 0.05, 120);
const quadScene = new THREE.Scene(), quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
// 粗い世界: 色だけを引き伸ばして写す
const quadMat = new THREE.ShaderMaterial({
  uniforms: { tColor: { value: null }, tDepth: { value: null }, cNear: { value: camera.near }, cFar: { value: camera.far }, res: { value: new THREE.Vector2(1, 1) }, uInk: { value: 1 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
  fragmentShader: `varying vec2 vUv; uniform sampler2D tColor; uniform sampler2D tDepth; uniform float cNear; uniform float cFar; uniform vec2 res; uniform float uInk;
    float lin(vec2 uv){ float d = texture2D(tDepth, uv).x; return cNear * cFar / (cFar - d * (cFar - cNear)); }
    void main(){ gl_FragColor = linearToOutputTexel(texture2D(tColor, vUv)); }`,
  depthTest: false, depthWrite: false,
});
const depthOnly = new THREE.MeshBasicMaterial({ colorWrite: false });
const noDepth = []; // 透けた物（ガラス・影）は細かい奥行きに書かない
const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), quadMat); quad.frustumCulled = false; quadScene.add(quad);
// グッズを掲げるときの暗がり（スポットライトの外を暗くする）
const dimU = { uDim: { value: 0 }, uC: { value: new THREE.Vector2(0.5, 0.5) }, uR: { value: 0.42 }, uAsp: { value: 1 } };
const dimScene = new THREE.Scene();
const dimQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ uniforms: dimU, transparent: true, depthTest: false, depthWrite: false,
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
  fragmentShader: `varying vec2 vUv; uniform float uDim; uniform vec2 uC; uniform float uR; uniform float uAsp;
    void main(){ vec2 d = (vUv - uC) * vec2(uAsp, 1.0); float m = smoothstep(uR * 0.5, uR, length(d)); gl_FragColor = vec4(0.05, 0.03, 0.09, uDim * mix(0.1, 0.86, m)); }` }));
dimQuad.frustumCulled = false; dimScene.add(dimQuad);
function resize() {
  layoutConsole();
  const w = L.sw, h = L.sh;
  renderer.setSize(w, h);
  const lw = Math.max(64, Math.round(w * DPR * LOW)), lh = Math.max(64, Math.round(h * DPR * LOW));
  lowRT?.dispose();
  lowRT = new THREE.WebGLRenderTarget(lw, lh, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
  lowRT.depthTexture = new THREE.DepthTexture(lw, lh); lowRT.depthTexture.minFilter = lowRT.depthTexture.magFilter = THREE.NearestFilter;
  quadMat.uniforms.tColor.value = lowRT.texture; quadMat.uniforms.tDepth.value = lowRT.depthTexture; quadMat.uniforms.res.value.set(lw, lh);
  camera.aspect = w / h; camera.updateProjectionMatrix(); dimU.uAsp.value = w / h;
  const b = $('boot'); b.width = Math.round(w / 3); b.height = Math.round(h / 3); drawBoot(S.power === 'off' ? 0 : 9);
  drawSkin(); drawHud(); drawBag();
}
const CRISP = 1, FX = 2, HELD = 3;
const setLayer = (o, l) => { o.traverse((m) => m.layers.set(l)); return o; };
const crisp = (o) => setLayer(o, CRISP);

const scene = new THREE.Scene();
const hemi = new THREE.HemisphereLight('#fff7ec', '#6a5a4a', 1.3); hemi.layers.enableAll(); scene.add(hemi);
const sun = new THREE.DirectionalLight('#fff0d8', 1.3); sun.position.set(2, 6, 3); sun.layers.enableAll(); scene.add(sun);
const lam = (o) => new THREE.MeshLambertMaterial(o), flat = (o) => new THREE.MeshLambertMaterial({ flatShading: true, ...o });
const box = (w, h, d, mat, x, y, z, parent) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); parent.add(m); return m; };
function roundShape(w, h, [tl, tr, br, bl]) {
  const s = new THREE.Shape(), x0 = -w / 2, x1 = w / 2, y0 = -h / 2, y1 = h / 2;
  s.moveTo(x0 + bl, y0); s.lineTo(x1 - br, y0); s.quadraticCurveTo(x1, y0, x1, y0 + br); s.lineTo(x1, y1 - tr); s.quadraticCurveTo(x1, y1, x1 - tr, y1);
  s.lineTo(x0 + tl, y1); s.quadraticCurveTo(x0, y1, x0, y1 - tl); s.lineTo(x0, y0 + bl); s.quadraticCurveTo(x0, y0, x0 + bl, y0); return s;
}
const slab = (shape, d, mat, bev = 1.2) => new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: bev > 0, bevelThickness: bev, bevelSize: bev, bevelSegments: 1, curveSegments: 3 }), mat);
const imgTex = (img) => { const t = new THREE.Texture(img); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.needsUpdate = true; return t; };

// ───────── カバンの中身（ローポリ）。ゲーム機を選ぶと出てくる ─────────
const bag3d = $('bag3d');
const bagR = new THREE.WebGLRenderer({ canvas: bag3d, alpha: true, antialias: true, preserveDrawingBuffer: true });
bagR.setPixelRatio(DPR); bagR.outputColorSpace = THREE.SRGBColorSpace; bagR.setClearColor(0x000000, 0);
const bagScene = new THREE.Scene(), bagCam = new THREE.OrthographicCamera(0, 390, 0, -198, 1, 1000); bagCam.position.z = 400;
bagScene.add(new THREE.HemisphereLight('#ffffff', '#cfc3b0', 1.55));
const bagSun = new THREE.DirectionalLight('#fff4e2', 1.5); bagSun.position.set(-1, 1.7, 2); bagScene.add(bagSun);
const bagFill = new THREE.DirectionalLight('#dcd4ff', 0.45); bagFill.position.set(1.5, -0.3, 1); bagScene.add(bagFill);
const bagRoot = new THREE.Group(); bagScene.add(bagRoot);
const bagItems = [];
function bagItem(g, x, y, z, rx, ry, rz) { g.position.set(x, -y, z); g.rotation.set(rx, ry, rz); g.userData.base = { y, rz }; bagRoot.add(g); bagItems.push(g); g.traverse((m) => { m.userData.item = g; }); return g; }
const M = (c, o = {}) => new THREE.MeshLambertMaterial({ color: c, flatShading: true, ...o });
const mesh = (geo, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); return o; };
const cyl = (rt, rb, h, seg, m, y = 0) => mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m, 0, y, 0);
// ゲーム機: 本物の形と色をそのまま小さくしたもの（出すときに本物と入れかわる）
const bagCon = new THREE.Group(); bagItem(bagCon, 200, 84, 55, 0.08, -0.22, 0.14);
const BAGCON_W = 64;
let bagStar = null, bagScreenTex = null;
function buildBagConsole() {
  if (!L.cw) return;
  bagCon.children.slice().forEach((c) => bagCon.remove(c));
  const w = BAGCON_W, k = w / L.cw, h = (L.ch - L.BT) * k, d = 7, front = d + 1.2, oy = L.BT;
  bagCon.add(slab(roundShape(w, h, [24 * k, 24 * k, 78 * k, 24 * k]), d, M(CON.body)));
  const at = (x, y, z) => new THREE.Vector3(-w / 2 + x * k, h / 2 - (y - oy) * k, z);
  const plane = (x, y, pw, ph, col, z) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(pw * k, ph * k), new THREE.MeshBasicMaterial({ color: col })); m.position.copy(at(x, y, z)); bagCon.add(m); };
  plane(L.sl + L.sw / 2, L.st + L.sh / 2 - 9, L.sw + 24, L.sh + 42, CON.bezel, front + 0.1);
  // 画面は点いていて、はち男の顔が映っている
  bagScreenTex ||= pix(24, 30, (g) => { g.fillStyle = '#cfe0b4'; g.fillRect(0, 0, 24, 30); g.fillStyle = '#b9cc9c'; for (let y = 0; y < 30; y += 2) g.fillRect(0, y, 24, 1); const P = ['#2e2a38', '#ffffff', '#ff6f61', '#ffc94a', '#5fcfb0', '#9d8cf0', '#7cc7ff', '#ff9ec4', '#a0704a'];
    [...BEEFACE].forEach((ch, i) => { if (ch !== '.') px(g, 6 + (i % 12), 9 + ((i / 12) | 0), P[+ch]); }); });
  { const m = new THREE.Mesh(new THREE.PlaneGeometry(L.sw * k, L.sh * k), new THREE.MeshBasicMaterial({ map: bagScreenTex })); m.position.copy(at(L.sl + L.sw / 2, L.st + L.sh / 2, front + 0.2)); bagCon.add(m); }
  plane(L.sl + L.sw * 0.3, L.st - 18, L.sw * 0.5, 4, CON.stripe[0], front + 0.25);
  const dm = M(CON.dpad[1]);
  [[116, 40], [40, 116]].forEach(([a, bb]) => { const m = new THREE.Mesh(new THREE.BoxGeometry(a * k, bb * k, 2.4), dm); m.position.copy(at(22 + 63, L.y0 + 30 + 63, front + 1.2)); bagCon.add(m); });
  const ab = new THREE.Mesh(new THREE.CylinderGeometry(40 * k, 40 * k, 2.6, 8), M(CON.a[0])); ab.rotation.x = Math.PI / 2; ab.position.copy(at(L.cw - 26 - 42, L.y0 + 82, front + 1.3)); bagCon.add(ab);
  [L.cw / 2 - 48, L.cw / 2 + 38].forEach((x) => { const m = new THREE.Mesh(new THREE.BoxGeometry(52 * k, 14 * k, 1.6), M(CON.pill[0])); m.position.copy(at(x, L.ch - 70, front + 0.8)); m.rotation.z = 0.42; bagCon.add(m); });
  [14 + 45, L.cw - 14 - 45].forEach((x) => { const m = new THREE.Mesh(new THREE.BoxGeometry(80 * k, 10 * k, d), M(CON.shoulder[0])); m.position.copy(at(x, L.BT - 3, d / 2)); bagCon.add(m); });
  bagCon.traverse((m) => { m.userData.item = bagCon; });
}
function sizeBag() {
  const aw = bagEl.clientWidth, ah = bagEl.clientHeight; if (!aw) return;
  bagR.setSize(aw, ah); bagCam.right = aw; bagCam.bottom = -ah; bagCam.updateProjectionMatrix(); bagRoot.scale.setScalar(aw / 390);
}
// ゲーム機はときどき跳ねて「選べる」と知らせる。押した物は少し揺れる
function renderBag(t) {
  if (!bagStar && typeof starTex !== 'undefined') { bagStar = new THREE.Sprite(new THREE.SpriteMaterial({ map: starTex, transparent: true })); bagScene.add(bagStar); }
  if (bagStar) { const ph = (t % 2.3) / 2.3; bagStar.position.set(bagCon.position.x + 30, bagCon.position.y + 58, 90); bagStar.scale.setScalar(ph < 0.3 ? Math.sin(ph / 0.3 * Math.PI) * 16 : 0.01); }
  for (const g of bagItems) {
    const b = g.userData.base; let dy = 0, rz = b.rz;
    if (g === bagCon && !reduce) { const ph = t % 4.6; if (ph < 0.5) dy = Math.sin(ph / 0.5 * Math.PI) * 9; }
    if (g.userData.jig != null) { const e = t - g.userData.jig; if (e < 1) { const w = Math.sin(e * 28) * Math.exp(-e * 5); rz += w * 0.14; dy += w * 2; } else g.userData.jig = null; }
    g.position.y = -(b.y - dy); g.rotation.z = rz;
  }
  bagR.render(bagScene, bagCam);
}
const bagRay = new THREE.Raycaster();
bagEl.addEventListener('click', (e) => {
  if (S.power !== 'off' || S.anim) return;
  if (e.detail === 0) return openConsole();
  const r = bag3d.getBoundingClientRect();
  bagRay.setFromCamera(new THREE.Vector2((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), bagCam);
  const item = bagRay.intersectObjects(bagItems, true)[0]?.object.userData.item;
  if (item === bagCon) return openConsole();
  if (item && e.clientY - r.top < BAG.mouth + 10) { item.userData.jig = clock.elapsedTime; return; }
  bagEl.animate([{ transform: 'none' }, { transform: 'scale(1.03,.95)' }, { transform: 'scale(.99,1.02)' }, { transform: 'none' }], { duration: reduce ? 1 : 420, easing: 'ease-out' });
});

// ───────── 部屋（家具は共通・壁紙とグッズは持ち主ごと） ─────────
const room = new THREE.Group(); scene.add(room);
const R = 3.5, WH = 2.9;
const floor = new THREE.Mesh(new THREE.PlaneGeometry(R * 2, R * 2), lam({ map: floorTex })); floor.rotation.x = -Math.PI / 2; room.add(floor);
const walls = [
  { n: [0, 0, 1], pos: [0, WH / 2, -R], ry: 0 },
  { n: [0, 0, -1], pos: [0, WH / 2, R], ry: Math.PI },
  { n: [1, 0, 0], pos: [-R, WH / 2, 0], ry: Math.PI / 2 },
  { n: [-1, 0, 0], pos: [R, WH / 2, 0], ry: -Math.PI / 2 },
].map((w) => { const g = new THREE.Group(); g.position.set(...w.pos); g.rotation.y = w.ry; room.add(g);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(R * 2, WH), lam({ map: wallA })); g.add(mesh);
  box(R * 2, 0.12, 0.04, lam({ color: '#f6f1e7' }), 0, -WH / 2 + 0.06, 0.02, g);
  return { ...w, n: new THREE.Vector3(...w.n), g, mesh }; });
const onWall = (parent, obj, x, y) => { obj.position.set(x, y - WH / 2, 0.03); parent.add(obj); return obj; };
onWall(walls[0].g, new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.2), lam({ map: windowTex, emissive: '#553', emissiveIntensity: .5 })), 1.6, 1.9);
onWall(walls[1].g, new THREE.Mesh(new THREE.PlaneGeometry(1.0, 2.0), lam({ map: doorTex })), 0, 1.0);
const exitTex = pix(20, 10, (g) => { g.fillStyle = '#5d5390'; g.fillRect(0, 0, 20, 10); g.fillStyle = '#3d3552'; g.fillRect(0, 0, 20, 1); g.fillRect(0, 9, 20, 1); ptext(g, 'EXIT', 3, 3, '#ffc94a'); });
const mat = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.65), lam({ map: exitTex, emissive: '#223', emissiveIntensity: .3 })); mat.rotation.x = -Math.PI / 2; mat.rotation.z = Math.PI; mat.position.set(0, 0.008, R - 0.45); room.add(mat);
const wood = lam({ map: woodTex }), ivory = lam({ map: ivoryTex });
// 飾り棚: 白い枠・うすむらさきの背板・板の下に LED
const shelf = new THREE.Group(); shelf.position.set(-0.9, 0, -R + 0.25); room.add(shelf);
box(2.6, 2.05, 0.03, lam({ color: '#cfc4f2' }), 0, 1.03, -0.21, shelf);
[0.55, 1.25, 1.95].forEach((y) => { box(2.6, 0.05, 0.45, ivory, 0, y, 0, shelf); box(2.4, 0.015, 0.02, new THREE.MeshBasicMaterial({ color: '#fff3cf' }), 0, y - 0.034, 0.2, shelf); });
[-1.3, 1.3].forEach((x) => box(0.06, 2.05, 0.45, ivory, x, 1.02, 0, shelf));
const pegTex = pix(24, 20, (g) => { for (let y = 0; y < 20; y++) for (let x = 0; x < 24; x++) px(g, x, y, (x < 1 || y < 1 || x > 22 || y > 18) ? '#6b5038' : (x % 3 === 1 && y % 3 === 1) ? '#8a6f52' : '#e9d3b4'); });
onWall(walls[2].g, new THREE.Mesh(new THREE.PlaneGeometry(2.3, 1.75), lam({ map: pegTex })), 0.75, 1.85);
// 右の壁の飾り棚（机の上）と、窓の下の小さな棚
[1.55, 2.15].forEach((y) => { box(0.26, 0.04, 1.4, ivory, R - 0.13, y, -2.4, room); box(0.02, 0.012, 1.3, new THREE.MeshBasicMaterial({ color: '#fff3cf' }), R - 0.255, y - 0.026, -2.4, room); });
box(1.3, 0.04, 0.26, ivory, 1.6, 0.9, -R + 0.13, room); [1.0, 2.2].forEach((x) => box(0.03, 0.2, 0.2, ivory, x, 0.8, -R + 0.12, room));
const roomCol = [box(1.1, 0.42, 2.0, lam({ map: bedTex }), -R + 0.6, 0.21, 1.6, room), box(1.1, 0.6, 0.1, wood, -R + 0.6, 0.45, 0.6, room)];
box(0.5, 0.12, 0.34, lam({ color: '#fffaf0' }), -R + 0.6, 0.48, 0.85, room);
const books = new THREE.Group(); books.position.set(R - 0.25, 0, -0.3); room.add(books);
box(0.4, 2.2, 1.3, wood, 0, 1.1, 0, books);
[0.35, 0.9, 1.45, 2.0].forEach((y) => { const sp = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.42), lam({ map: spineTex })); sp.rotation.y = -Math.PI / 2; sp.position.set(-0.205, y, 0); books.add(sp); });
const desk = new THREE.Group(); desk.position.set(R - 0.45, 0, -2.4); room.add(desk);
box(0.8, 0.05, 1.2, wood, 0, 0.75, 0, desk);
[[-.35, -.5], [-.35, .5], [.35, -.5], [.35, .5]].forEach(([x, z]) => box(0.05, 0.75, 0.05, wood, x, 0.375, z, desk));
roomCol.push(shelf, books, desk);
const cabinet = new THREE.Group(); cabinet.position.set(R - 0.35, 0, 1.5); room.add(cabinet);
// ガラスは奥行きを書かない（書くと中のグッズが隠れる）
noDepth.push(box(0.6, 1.8, 1.2, new THREE.MeshPhongMaterial({ color: '#cfe8ff', transparent: true, opacity: .15, depthWrite: false }), 0, 0.9, 0, cabinet));
[0.05, 0.7, 1.3].forEach((y) => box(0.6, 0.04, 1.2, ivory, 0, y, 0, cabinet));
box(0.6, 0.04, 1.2, ivory, 0, 1.8, 0, cabinet);
const rug = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.8), lam({ map: rugTex })); rug.rotation.x = -Math.PI / 2; rug.position.set(0.2, 0.005, 0.6); room.add(rug);
['#ff9ec4', '#7cc7ff', '#ffc94a', '#5fcfb0', '#ff7a6b'].forEach((c, i) => { const b = box(0.34, 0.06, 0.24, lam({ color: c }), -1.2 + (i % 2) * 0.02, 0.03 + i * 0.06, 2.6, room); b.rotation.y = i * 0.25; });
box(0.28, 0.28, 0.28, lam({ color: '#d9775a' }), 2.9, 0.14, -2.95, room);
const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(0.36, 0), flat({ color: '#6aa35a' })); leaf.position.set(2.9, 0.55, -2.95); room.add(leaf);
// 天井から下がる小さな電球のひも
for (let i = 0; i < 9; i++) { const x = -2.6 + i * 0.65, y = 2.72 - Math.sin(i / 8 * Math.PI) * 0.22; const b = new THREE.Mesh(new THREE.SphereGeometry(0.04, 5, 4), new THREE.MeshBasicMaterial({ color: ['#fff3cf', '#ffc2b8', '#c4f2e5'][i % 3] })); b.position.set(x, y, -R + 0.08); room.add(b); }
// 家具の当たり（キャラがめり込まない）
const roomObs = [
  { x: -0.9, z: -R + 0.25, ry: 0, hw: 1.33, hd: 0.25 }, { x: -R + 0.6, z: 1.6, ry: 0, hw: 0.55, hd: 1.05 }, { x: R - 0.25, z: -0.3, ry: 0, hw: 0.2, hd: 0.66 },
  { x: R - 0.45, z: -2.4, ry: 0, hw: 0.42, hd: 0.62 }, { x: R - 0.35, z: 1.5, ry: 0, hw: 0.31, hd: 0.61 }, { x: 2.9, z: -2.95, ry: 0, hw: 0.3, hd: 0.3 },
  { x: -1.2, z: 2.6, ry: 0, hw: 0.22, hd: 0.2 },
];

// 飾る場所（置く＝棚・ケース・机、かける＝壁）。高さは板の上にぴったり合わせる
const SLOTS = {};
[0.575, 1.275, 1.975].forEach((y, b) => [-1.75, -0.9, -0.05].forEach((x, i) => { SLOTS[`s${b}${i}`] = { type: 'put', pos: [x, y, -R + 0.3], ry: 0, maxH: b === 2 ? 0.7 : 0.6 }; }));
[0.07, 0.72, 1.32].forEach((y, b) => [1.2, 1.8].forEach((z, i) => { SLOTS[`c${b}${i}`] = { type: 'put', pos: [R - 0.35, y, z], ry: -Math.PI / 2, maxH: b === 2 ? 0.44 : 0.56 }; }));
SLOTS.d0 = { type: 'put', pos: [R - 0.5, 0.775, -2.7], ry: -Math.PI / 2, maxH: 0.6 }; SLOTS.d1 = { type: 'put', pos: [R - 0.5, 0.775, -2.15], ry: -Math.PI / 2, maxH: 0.6 };
SLOTS.w0 = { type: 'hang', wall: 0, wx: -0.9, wy: 2.45, maxH: 0.75 }; SLOTS.w1 = { type: 'hang', wall: 0, wx: 0.58, wy: 2.38, maxH: 0.6 };
SLOTS.w2 = { type: 'hang', wall: 2, wx: 2.45, wy: 1.95, maxH: 0.6 };
[-0.15, 0.3, 0.75, 1.2, 1.65].forEach((wx, i) => [1.25, 1.65, 2.05, 2.45].forEach((wy, j) => { SLOTS[`p${i}${j}`] = { type: 'peg', wall: 2, wx, wy, maxH: 0.3 }; }));
[1.55, 2.15].forEach((y, b) => [-2.85, -2.4, -1.95].forEach((z, i) => { SLOTS[`r${b}${i}`] = { type: 'put', pos: [R - 0.14, y + 0.02, z], ry: -Math.PI / 2, maxH: 0.42 }; }));
[1.15, 1.6, 2.05].forEach((x, i) => { SLOTS[`n${i}`] = { type: 'put', pos: [x, 0.9 + 0.02, -R + 0.14], ry: 0, maxH: 0.36 }; }); SLOTS.w3 = { type: 'hang', wall: 2, wx: -1.6, wy: 1.95, maxH: 0.7 }; SLOTS.w4 = { type: 'hang', wall: 3, wx: -2.4, wy: 1.85, maxH: 0.6 };
const HANG = ['poster', 'ticket'];
const fits = (gd, slotId) => { const t = SLOTS[slotId].type; if (gd.kind === 'badge') return t !== 'hang'; if (t === 'peg') return false; return (t === 'hang') === HANG.includes(gd.kind); };

// ───────── ハチの頭の人（A: シャツとパンツ / B: リボンとスカート） ─────────
function makeBee({ type = 'A', shirt, skinC = '#e8bf9a', headC = '#d9a43a', accent = '#ff6f61', bottom } = {}) {
  const g = new THREE.Group(), B = type === 'B';
  shirt ||= B ? '#fff6ea' : '#e9e6df';
  const skin = flat({ color: skinC }), sh = flat({ color: shirt }), pa = flat({ color: bottom || (B ? '#b6a8ee' : '#3f4a66') });
  let legs, arms;
  if (B) {
    const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.2, 0.27, 8), pa); skirt.position.y = 0.5; g.add(skirt);
    legs = [-0.055, 0.055].map((x) => { const l0 = new THREE.Group(); l0.position.set(x, 0.42, 0);
      const l = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.03, 0.38, 5), skin); l.position.y = -0.19;
      const sock = new THREE.Mesh(new THREE.CylinderGeometry(0.037, 0.035, 0.1, 5), flat({ color: '#ffffff' })); sock.position.y = -0.33;
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.045, 0.13), flat({ color: '#8c2f39' })); s.position.set(0, -0.4, 0.025);
      l0.add(l, sock, s); g.add(l0); return l0; });
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.1, 0.36, 6), sh); torso.position.y = 0.79; g.add(torso);
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.125, 0.03, 8), flat({ color: '#ffffff' })); collar.position.y = 0.955; g.add(collar);
    arms = [-0.15, 0.15].map((x) => { const a0 = new THREE.Group(); a0.position.set(x, 0.92, 0);
      const puff = new THREE.Mesh(new THREE.IcosahedronGeometry(0.065, 0), sh); puff.position.y = -0.03;
      const a = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.027, 0.3, 5), skin); a.position.y = -0.2;
      const h = new THREE.Mesh(new THREE.IcosahedronGeometry(0.034, 0), skin); h.position.y = -0.37; a0.add(puff, a, h); g.add(a0); return a0; });
    // ななめがけの小さなバッグ
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.44, 0.012), flat({ color: '#5d5390' })); strap.position.set(0.02, 0.79, 0.105); strap.rotation.z = 0.62; g.add(strap);
    const mb = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.04), flat({ color: '#ffc94a' })); mb.position.set(0.14, 0.62, 0.08); g.add(mb);
  } else {
    box(0.26, 0.12, 0.18, pa, 0, 0.48, 0, g);
    legs = [-0.06, 0.06].map((x) => { const l0 = new THREE.Group(); l0.position.set(x, 0.46, 0); const l = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.04, 0.42, 5), pa); l.position.y = -0.21;
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.055, 0.15), flat({ color: '#f4f1ea' })); s.position.set(0, -0.43, 0.03);
      const so = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.015, 0.155), flat({ color: '#ff6f61' })); so.position.set(0, -0.455, 0.03); l0.add(l, s, so); g.add(l0); return l0; });
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.11, 0.42, 6), sh); torso.position.y = 0.72; g.add(torso);
    arms = [-0.17, 0.17].map((x) => { const a0 = new THREE.Group(); a0.position.set(x, 0.9, 0); const a = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.36, 5), sh); a.position.y = -0.18; const h = new THREE.Mesh(new THREE.IcosahedronGeometry(0.035, 0), skin); h.position.y = -0.38; a0.add(a, h); g.add(a0); return a0; });
  }
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.06, 5), skin); neck.position.y = 0.97; g.add(neck);
  const head = new THREE.Group(); head.position.y = 1.1; g.add(head);
  const skull = new THREE.Mesh(new THREE.IcosahedronGeometry(B ? 0.145 : 0.15, 1), flat({ color: headC })); skull.scale.set(1, 1.08, 0.9); head.add(skull);
  const eyeMat = new THREE.MeshPhongMaterial({ color: '#1b1712', shininess: 110, flatShading: true });
  [-1, 1].forEach((s) => { const e = new THREE.Mesh(new THREE.IcosahedronGeometry(0.085, 1), eyeMat); e.scale.set(0.7, 1.3, 0.9); e.position.set(s * 0.115, 0.02, 0.05); head.add(e);
    const an = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.2, 4), eyeMat); an.position.set(s * 0.05, 0.2, 0.08); an.rotation.set(0.5, 0, -s * 0.35); head.add(an);
    const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.006, 0.12, 4), eyeMat); tip.position.set(s * 0.1, 0.32, 0.17); tip.rotation.set(1.3, 0, -s * 0.2); head.add(tip);
    const mand = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.07, 4), flat({ color: '#5a3f1c' })); mand.position.set(s * 0.03, -0.14, 0.08); mand.rotation.set(Math.PI, 0, s * 0.3); head.add(mand);
    if (B) { [0, 1].forEach((i) => { const l = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.012, 0.012), eyeMat); l.position.set(s * (0.16 + i * 0.012), 0.1 - i * 0.03, 0.06); l.rotation.z = s * (0.5 + i * 0.3); head.add(l); });
      const ck = new THREE.Mesh(new THREE.IcosahedronGeometry(0.026, 0), flat({ color: '#ff9ec4' })); ck.position.set(s * 0.085, -0.085, 0.1); head.add(ck); } });
  const fuzz = new THREE.Mesh(new THREE.IcosahedronGeometry(0.07, 0), flat({ color: '#f0c96a' })); fuzz.position.set(0, -0.06, 0.1); head.add(fuzz);
  if (B) { // リボン
    const rib = new THREE.Group(); rib.position.set(0.09, 0.12, 0.02); rib.rotation.z = -0.35; head.add(rib);
    [-1, 1].forEach((s) => { const w = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.085, 4), flat({ color: accent })); w.rotation.z = s * Math.PI / 2; w.position.x = s * 0.045; rib.add(w); });
    rib.add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.025, 0), flat({ color: accent })));
  }
  return { g, legs, arms, head };
}
let charId = ST.char === 'B' ? 'B' : 'A';
let ME = makeBee({ type: charId }), me = ME.g, legs = ME.legs, arms = ME.arms, head = ME.head;
me.position.set(0.3, 0, 1.2); me.rotation.y = Math.PI; scene.add(me);
function setChar(id) {
  charId = id; ST.char = id; persist(); tutHit('dress');
  const nb = makeBee({ type: id }); nb.g.position.copy(me.position); nb.g.rotation.copy(me.rotation);
  scene.remove(me); scene.add(nb.g); ME = nb; me = nb.g; legs = nb.legs; arms = nb.arms; head = nb.head;
}
const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.22, 8), new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.22 })); shadow.rotation.x = -Math.PI / 2; scene.add(shadow); noDepth.push(shadow);

// ───────── グッズ（商品画像から。印刷面は光で濁らせず、アクリル・ケース・缶の質感を足す） ─────────
function outline(img, rows = 14) {
  const m = bgMask(img, 120), { w, h, bg } = m;
  let top = h, bot = 0; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (!bg[y * w + x]) { top = Math.min(top, y); bot = Math.max(bot, y); }
  const Lp = [], Rp = [];
  for (let r = 0; r <= rows; r++) { const y = Math.round(top + (bot - top) * r / rows); let a = -1, b = -1; for (let x = 0; x < w; x++) if (!bg[y * w + x]) { if (a < 0) a = x; b = x; } if (a < 0) continue; Lp.push([Math.max(0, a - 3) / w, 1 - y / h]); Rp.push([Math.min(w, b + 4) / w, 1 - y / h]); }
  return { pts: [...Lp, ...Rp.reverse()], aspect: w / h, top: 1 - top / h, bot: 1 - bot / h };
}
const clearMat = new THREE.MeshPhongMaterial({ color: '#dff3ff', transparent: true, opacity: .5, shininess: 140, specular: '#ffffff', flatShading: true });
const glossMat = new THREE.MeshPhongMaterial({ color: '#ffffff', transparent: true, opacity: .1, shininess: 220, specular: '#ffffff', depthWrite: false });
const edgeMat = new THREE.LineBasicMaterial({ color: '#c7ecff', transparent: true, opacity: 0.9 });
THREE.LineSegments.prototype.raycast = () => {}; // 飾り線は押せない
const holoTex = (() => { const c = document.createElement('canvas'); c.width = 64; c.height = 64; const g = c.getContext('2d'); const gr = g.createLinearGradient(0, 0, 64, 64);
  ['#ff9ad5', '#9ee7ff', '#fff59a', '#b5a6ff', '#9affc7', '#ff9ad5'].forEach((col, i) => gr.addColorStop(i / 5, col)); g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t; })();
const holoMat = new THREE.MeshBasicMaterial({ map: holoTex, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false });
const TITLE = {
  'img/8ff4d3f4.webp': '呪術廻戦 5周年 描き下ろしアクリルスタンド', 'img/d910c6de.webp': '呪術廻戦 5周年 ダイカットアクリルブロック 五条 悟', 'img/73071bef.webp': '呪術廻戦 5周年 おしのびチャーム',
  'img/2e7aeeee.webp': '呪術廻戦 第3期 ネックストラップ', 'img/128be105.webp': '葬送のフリーレン サムネイルキラステッカーセット vol.4', 'img/5956714c.webp': '葬送のフリーレン クリアポスター（新パーティー）',
  'img/c6275784.webp': 'ハイキュー!! わくわく文化祭 POP UP SHOP 大阪', 'img/2bddb169.webp': '葬送のフリーレン トートバッグ（新パーティー）', 'img/e7aa0230.webp': '葬送のフリーレン クリスマスビジュアルグッズ',
};
const OWNERS = [
  { id: 'me', en: 'MY ROOM', walls: [wallA, wallA, wallB, wallB], goods: opts.goods.map((g) => ({ ...g })) },
  { id: 'mitsuba', name: 'みつば', en: 'MITSUBA', type: 'B', shirt: '#ffd1dc', bottom: '#7cc7ff', roof: '#e06c7a', fav: 'img/5956714c.webp', favName: '葬送のフリーレン',
    walls: [wallTex('#f6e3e8', '#ecccd5', '#d79aa9'), wallTex('#f6e3e8', '#ecccd5', '#d79aa9'), wallTex('#ece4f6', '#dcd0ea', '#ab9bca'), wallTex('#ece4f6', '#dcd0ea', '#ab9bca')], goods: [
    { img:'img/5956714c.webp', kind:'poster', h:0.8, slot:'w0' }, { img:'img/e7aa0230.webp', kind:'card', h:0.5, slot:'s10' }, { img:'img/2bddb169.webp', kind:'card', h:0.5, slot:'s11' },
    { img:'img/128be105.webp', kind:'card', h:0.48, slot:'s01' }, { img:'img/128be105.webp', kind:'card', h:0.4, slot:'d0' }, { img:'img/e7aa0230.webp', kind:'poster', h:0.7, slot:'w3' },
  ] },
  { id: 'neru', name: 'ねる', en: 'NERU', type: 'A', shirt: '#9fc5e8', roof: '#4f7fa8', fav: 'img/c6275784.webp', favName: 'ハイキュー!!',
    walls: [wallTex('#dfe6ee', '#cdd7e2', '#8fa6bf'), wallTex('#dfe6ee', '#cdd7e2', '#8fa6bf'), wallTex('#e6e6e0', '#d6d6cd', '#a3a391'), wallTex('#e6e6e0', '#d6d6cd', '#a3a391')], goods: [
    { img:'img/c6275784.webp', kind:'ticket', h:0.5, slot:'w2' }, { img:'img/c6275784.webp', kind:'poster', h:0.7, slot:'w4' }, { img:'img/8ff4d3f4.webp', kind:'stand', h:0.55, slot:'s20' },
    { img:'img/73071bef.webp', kind:'stand', h:0.42, slot:'s21' }, { img:'img/2e7aeeee.webp', kind:'badge', h:0.42, slot:'s11' }, { img:'img/d910c6de.webp', kind:'stand', h:0.45, slot:'d1' },
  ] },
  { id: 'kohaku', name: 'こはく', en: 'KOHAKU', type: 'B', shirt: '#fff0b8', bottom: '#5fcfb0', roof: '#7f9f55', fav: 'img/d910c6de.webp', favName: '呪術廻戦',
    walls: [wallTex('#e3eadb', '#d2dcc7', '#93a77e'), wallTex('#e3eadb', '#d2dcc7', '#93a77e'), wallTex('#efe6d4', '#e1d4bb', '#b89a6b'), wallTex('#efe6d4', '#e1d4bb', '#b89a6b')], goods: [
    { img:'img/8ff4d3f4.webp', kind:'stand', h:0.42, slot:'c20' }, { img:'img/d910c6de.webp', kind:'stand', h:0.4, slot:'c21' }, { img:'img/73071bef.webp', kind:'stand', h:0.4, slot:'c10' },
    { img:'img/5956714c.webp', kind:'poster', h:0.8, slot:'w3' }, { img:'img/2e7aeeee.webp', kind:'badge', h:0.42, slot:'s00' }, { img:'img/e7aa0230.webp', kind:'card', h:0.5, slot:'s11' },
    { img:'img/c6275784.webp', kind:'ticket', h:0.45, slot:'w1' },
  ] },
];
const OWN = Object.fromEntries(OWNERS.map((o) => [o.id, o]));
const props = [];
// ほかの人の部屋は、アプリにある予定の画像で埋める（試作の画像は使わない）
const SAMPLE = (k) => opts.samples.length ? opts.samples[k % opts.samples.length] : null;
OWNERS.forEach((o, oi) => { if (o.id === 'me') return; o.goods = o.goods.map((gd, i) => { const s = SAMPLE(oi * 7 + i); return s && { ...gd, img: s.img, title: s.title }; }).filter(Boolean); const f = SAMPLE(oi * 7); o.fav = f?.img; o.favName = f?.title ?? ''; });
// 自販機で出た缶も、自分のグッズとして戻す
(ST.cans || []).forEach((c) => OWN.me.goods.push({ id: c.id, kind: 'can', h: 0.24, col: c.col, col2: c.col2, code: c.code, title: c.name, sub: '町の自販機で出た · コイン 3' }));
// 置き場所: 残した並び → 無ければ空いている所に順に
{ const saved = ST.layout || {};
  const used = new Set();
  OWN.me.goods.forEach((gd) => { const s = saved[gd.id]; gd.slot = s && SLOTS[s] && !used.has(s) && fits(gd, s) ? s : undefined; if (gd.slot) used.add(gd.slot); });
  OWN.me.goods.forEach((gd) => { if (gd.slot !== undefined || saved[gd.id] === null) { gd.slot ??= null; return; } gd.slot = Object.keys(SLOTS).find((id) => !used.has(id) && fits(gd, id)) ?? null; if (gd.slot) used.add(gd.slot); }); }
const saveRoom = () => { ST.layout = Object.fromEntries(OWN.me.goods.filter((g) => g.id).map((g) => [g.id, g.slot])); persist(); };
const pickables = [];

OWNERS.forEach((o) => {
  o.group = new THREE.Group(); o.group.visible = o.id === 'me'; room.add(o.group);
  o.anchors = walls.map((w) => { const a = new THREE.Group(); a.position.copy(w.g.position); a.rotation.copy(w.g.rotation); o.group.add(a); return a; });
  o.goods.forEach((gd) => { gd.owner = o; gd.title = gd.title || ((TITLE[gd.img] || '') + (gd.title2 ? `（${gd.title2}）` : '')); if (o.id !== 'me') gd.sub = `${o.name}さんのグッズ`; makeGoods(gd); });
  if (o.id !== 'me') {
    const npc = makeBee({ type: o.type, shirt: o.shirt, bottom: o.bottom }); npc.g.position.set(1.0, 0, -0.6); npc.g.rotation.y = Math.PI * 0.85; o.group.add(npc.g); o.npc = npc;
    const data = { npc: true, owner: o, img: o.fav, title: `${o.name}さん`, sub: `推し: ${o.favName}` };
    npc.g.traverse((m) => { m.userData = data; }); data.obj = npc.g; pickables.push(npc.g);
  }
});
// 壁のカレンダー: 押すと今月のまとめ画像を作る（自分の部屋だけ）
{ const m = new Date().getMonth() + 1;
  const calTex = pix(16, 20, (g) => { g.fillStyle = '#fffaf0'; g.fillRect(0, 0, 16, 20); g.fillStyle = '#ff6f61'; g.fillRect(0, 0, 16, 6); ptext(g, String(m), m > 9 ? 4 : 6, 1, '#ffffff');
    g.fillStyle = '#c9c3d6'; for (let y = 8; y < 19; y += 3) for (let x = 2; x < 15; x += 3) g.fillRect(x, y, 2, 2); g.fillStyle = '#ffc94a'; g.fillRect(8, 14, 2, 2); g.fillStyle = '#5b5068'; g.fillRect(7, 0, 2, 1); });
  const cal = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.62), new THREE.MeshBasicMaterial({ map: calTex })); cal.position.set(1.5, 1.6 - WH / 2, 0.04);
  OWN.me.anchors[1].add(cal); crisp(cal); cal.userData = { prop: 'calendar', title: 'カレンダー' }; pickables.push(cal); }
function framed(tex, w, h, frameCol, matCol, z = 0.04) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(w + 0.1, h + 0.1, z), lam({ color: frameCol })));
  g.add(mesh(new THREE.PlaneGeometry(w + 0.04, h + 0.04), new THREE.MeshBasicMaterial({ color: matCol }), 0, 0, z / 2 + 0.001));
  g.add(mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex }), 0, 0, z / 2 + 0.002));
  g.add(mesh(new THREE.PlaneGeometry(w + 0.04, h + 0.04), glossMat, 0, 0, z / 2 + 0.004));
  const back = mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex }), 0, 0, -z / 2 - 0.002); back.rotation.y = Math.PI; g.add(back);
  return g;
}
function canGoods(gd) {
  const t = pix(32, 16, (g) => { g.fillStyle = gd.col; g.fillRect(0, 0, 32, 16); g.fillStyle = '#ffffff'; g.fillRect(0, 5, 32, 6); g.fillStyle = gd.col2; g.fillRect(3, 6, 8, 4); ptext(g, gd.code, 13, 6, '#2e2a38'); });
  const obj = new THREE.Group(); const side = new THREE.MeshPhongMaterial({ map: t, shininess: 90, specular: '#ffffff' }), top = new THREE.MeshPhongMaterial({ color: '#d9dae2', shininess: 120, specular: '#ffffff' });
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, gd.h, 14), [side, top, top]); m.position.y = gd.h / 2; obj.add(m);
  return obj;
}
async function makeGoods(gd) {
  if (gd.kind === 'can') { const obj = canGoods(gd); obj.traverse((m) => { m.userData = gd; }); gd.obj = obj; crisp(obj); pickables.push(obj); placeGoods(gd); return; }
  const img = await loadImg(gd.img); if (!img) return; const tex = imgTex(img); let obj; const H = gd.h;
  if (gd.kind === 'stand') {
    // アクリルスタンド: 白い下地ごと切り抜いた板＋透けたふち＋台座
    const o = outline(img), shp = new THREE.Shape(o.pts.map(([x, y]) => new THREE.Vector2(x, y)));
    const geo = new THREE.ExtrudeGeometry(shp, { depth: 0.045, bevelEnabled: false });
    const m = new THREE.Mesh(geo, [new THREE.MeshBasicMaterial({ map: tex }), clearMat]);
    const s = H / (o.top - o.bot); m.scale.set(s * o.aspect, s, 1); m.position.set(-0.5 * s * o.aspect, -o.bot * s + 0.04, -0.022);
    const ln = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 20), edgeMat); ln.scale.copy(m.scale); ln.position.copy(m.position);
    const gl = new THREE.Mesh(new THREE.ShapeGeometry(shp), glossMat); gl.scale.copy(m.scale); gl.position.set(m.position.x, m.position.y, 0.026);
    obj = new THREE.Group(); obj.add(m, ln, gl);
    const bw = Math.min(0.34, s * o.aspect * 0.7), bgeo = new THREE.ExtrudeGeometry(roundShape(bw, 0.16, [0.03, 0.03, 0.03, 0.03]), { depth: 0.035, bevelEnabled: false, curveSegments: 3 });
    const base = new THREE.Mesh(bgeo, clearMat); base.rotation.x = -Math.PI / 2; base.position.y = 0.0; obj.add(base);
    const bl = new THREE.LineSegments(new THREE.EdgesGeometry(bgeo, 20), edgeMat); bl.rotation.copy(base.rotation); obj.add(bl);
  } else if (gd.kind === 'card') {
    // かたいケース（トップローダー）に入れて、小さな台に立てる。キラは見る角度で流れる
    const a = img.width / img.height, w = H * a; obj = new THREE.Group(); const c = new THREE.Group(); c.position.y = H / 2 + 0.05; c.rotation.x = -0.12; obj.add(c);
    c.add(mesh(new THREE.PlaneGeometry(w, H), new THREE.MeshBasicMaterial({ map: tex }), 0, 0, 0.004));
    c.add(mesh(new THREE.PlaneGeometry(w, H), holoMat, 0, 0, 0.006));
    const cg = new THREE.BoxGeometry(w + 0.06, H + 0.07, 0.016); c.add(mesh(cg, new THREE.MeshPhongMaterial({ color: '#eaf7ff', transparent: true, opacity: .18, shininess: 160, specular: '#fff', depthWrite: false })));
    c.add(new THREE.LineSegments(new THREE.EdgesGeometry(cg), edgeMat));
    const st = box(Math.min(0.28, w * 0.6), 0.05, 0.12, lam({ color: '#3d3552' }), 0, 0.025, -0.02, obj);
    box(0.03, 0.18, 0.02, lam({ color: '#3d3552' }), 0, 0.1, -0.08, obj).rotation.x = 0.4; void st;
  } else if (gd.kind === 'badge') {
    // 缶バッジ: 銀のふち・ふくらんだ面のつや・うしろの小さな台
    const r = H / 2; obj = new THREE.Group(); const c = new THREE.Group(); c.position.y = r + 0.05; c.rotation.x = -0.18; obj.add(c);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.05, 32), [new THREE.MeshPhongMaterial({ color: '#d9dae2', shininess: 120, specular: '#ffffff' }), new THREE.MeshBasicMaterial({ map: tex }), new THREE.MeshBasicMaterial({ map: tex })]);
    m.rotation.x = Math.PI / 2; c.add(m);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 8, 0, Math.PI * 2, 0, 0.55), glossMat); dome.rotation.x = Math.PI / 2; dome.scale.set(1, 1, 0.22); dome.position.z = 0.026 - r * 0.22 * Math.cos(0.55); c.add(dome);
    box(0.2, 0.04, 0.12, clearMat, 0, 0.02, -0.02, obj);
  } else if (gd.kind === 'poster') {
    const a = img.width / img.height; obj = framed(tex, H * a, H, '#fffaf0', '#ffffff');
  } else {
    const a = img.width / img.height, w = Math.min(H * a, H * 1.6); obj = framed(tex, w, H * 0.8, '#3d3552', '#e2dbff', 0.03);
    const stub = mesh(new THREE.PlaneGeometry(0.16, H * 0.8), new THREE.MeshBasicMaterial({ color: '#ff7a6b' }), w / 2 + 0.13, 0, 0.0); obj.add(stub);
  }
  obj.traverse((m) => { m.userData = gd; }); gd.obj = obj; crisp(obj); pickables.push(obj);
  placeGoods(gd);
}
function placeGoods(gd) {
  const o = gd.obj; if (!o) return; o.parent?.remove(o);
  if (!gd.slot) { o.visible = false; return; }
  const s = SLOTS[gd.slot]; o.visible = true; o.scale.setScalar(Math.min(1, s.maxH / gd.h));
  if (s.type === 'hang') { o.position.set(s.wx, s.wy - WH / 2, 0.04); o.rotation.set(0, 0, 0); gd.owner.anchors[s.wall].add(o); }
  else if (s.type === 'peg') { o.position.set(s.wx, s.wy - WH / 2 - (gd.h * 0.5 + 0.05) * o.scale.x, 0.07); o.rotation.set(0.18, 0, 0); gd.owner.anchors[s.wall].add(o); }
  else { o.position.set(...s.pos); o.rotation.set(0, s.ry, 0); gd.owner.group.add(o); }
}

// ───────── 光の演出（グッズを掲げる・きらっと光る） ─────────
const raysTex = pix(32, 32, (g) => { for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) { const dx = x - 15.5, dy = y - 15.5, d = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
  const ray = Math.cos(a * 7) > 0.35, fall = Math.max(0, 1 - d / 16); const v = ray ? fall : fall * 0.25; if (v <= 0.02) continue; g.fillStyle = `rgba(255,236,170,${Math.min(1, v * 1.1).toFixed(2)})`; g.fillRect(x, y, 1, 1); } });
const starTex = pix(7, 7, (g) => { const P = ['...w...', '...w...', '..wyw..', 'wwyyyww', '..wyw..', '...w...', '...w...']; P.forEach((r, y) => [...r].forEach((ch, x) => { if (ch !== '.') px(g, x, y, ch === 'w' ? '#ffffff' : '#ffe58a'); })); });
const coneTex = pix(2, 16, (g) => { for (let y = 0; y < 16; y++) { g.fillStyle = `rgba(255,244,205,${(0.25 + 0.5 * (1 - y / 15)).toFixed(2)})`; g.fillRect(0, y, 2, 1); } });
const poolTex = pix(16, 16, (g) => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const d = Math.hypot(x - 7.5, y - 7.5) / 8; if (d < 1) { g.fillStyle = `rgba(255,240,200,${(0.75 * (1 - d * d)).toFixed(2)})`; g.fillRect(x, y, 1, 1); } } });
const add = { transparent: true, blending: THREE.AdditiveBlending, depthWrite: false };
const fx = new THREE.Group(); scene.add(fx); fx.visible = false;
const cone = new THREE.Mesh(new THREE.ConeGeometry(0.95, 3.4, 16, 1, true), new THREE.MeshBasicMaterial({ map: coneTex, side: THREE.DoubleSide, ...add, opacity: 0.55 })); fx.add(cone);
const pool = new THREE.Mesh(new THREE.CircleGeometry(1.0, 16), new THREE.MeshBasicMaterial({ map: poolTex, ...add })); pool.rotation.x = -Math.PI / 2; fx.add(pool);
const rays = new THREE.Sprite(new THREE.SpriteMaterial({ map: raysTex, ...add, opacity: 0.9 })); fx.add(rays);
const sparks = Array.from({ length: 7 }, () => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: starTex, ...add })); fx.add(s); return s; });
setLayer(fx, FX);
const hint = new THREE.Sprite(new THREE.SpriteMaterial({ map: starTex, ...add })); hint.scale.setScalar(0.001); scene.add(hint); crisp(hint);
const pointer = new THREE.Sprite(new THREE.SpriteMaterial({ map: pix(7, 6, (g) => { ['wwwwwww', 'wkkkkkw', '.wkkkw.', '..wkw..', '...w...', '.......'].forEach((r, y) => [...r].forEach((ch, x) => { if (ch !== '.') px(g, x, y, ch === 'w' ? '#ffffff' : '#ff6f61'); })); }), depthTest: false })); pointer.scale.set(0.14, 0.12, 1); pointer.visible = false; scene.add(pointer); crisp(pointer);
// かざりかえのときの置き場所の目印
const markTex = pix(12, 12, (g) => { g.fillStyle = 'rgba(255,255,255,.28)'; g.fillRect(1, 1, 10, 10); g.fillStyle = '#ffffff'; [[0, 0], [8, 0], [0, 8], [8, 8]].forEach(([x, y]) => { g.fillRect(x, y + (y ? 2 : 0), 4, 2); g.fillRect(x + (x ? 2 : 0), y, 2, 4); }); });
const markers = [];
Object.entries(SLOTS).forEach(([id, s]) => {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(s.type === 'hang' ? 0.62 : 0.4, s.type === 'hang' ? 0.62 : 0.3), new THREE.MeshBasicMaterial({ map: markTex, color: '#ffc94a', transparent: true, depthWrite: false, depthTest: false }));
  if (s.type === 'hang' || s.type === 'peg') { if (s.type === 'peg') m.geometry = new THREE.PlaneGeometry(0.32, 0.32); m.position.set(s.wx, s.wy - WH / 2, 0.02); m.userData = { slot: id }; }
  else { m.geometry = new THREE.PlaneGeometry(0.42, Math.min(0.5, s.maxH)); m.rotation.y = s.ry; m.position.set(s.pos[0], s.pos[1] + Math.min(0.5, s.maxH) / 2 + 0.01, s.pos[2]); m.userData = { slot: id }; room.add(m); }
  m.visible = false; crisp(m); markers.push(m); s.marker = m;
});
Object.values(SLOTS).forEach((s) => { if (s.type === 'hang' || s.type === 'peg') OWN.me.anchors[s.wall].add(s.marker); });

// ───────── 町: 家と店をハニカムに並べる（すき間が道） ─────────
const town = new THREE.Group(); town.visible = false; scene.add(town);
const HR = 6.2, PLOT = HR - 1.4, SQ3 = Math.sqrt(3), TOWN_R = 23.5;
const cellPos = (q, r) => new THREE.Vector3(SQ3 * HR * (q + r / 2), 0, 1.5 * HR * r);
const colliders = [], obstacles = [], acts = [], walkables = [];
const ground = new THREE.Mesh(new THREE.CircleGeometry(90, 24), lam({ map: cobbleTex })); ground.rotation.x = -Math.PI / 2; town.add(ground); walkables.push(ground);
function plotTile(c, kind) {
  const top = new THREE.Mesh(new THREE.CircleGeometry(PLOT, 6, Math.PI / 2), lam({ map: kind === 'tile' ? tileTex : grassTex })); top.rotation.x = -Math.PI / 2; top.position.set(c.x, 0.012, c.z); town.add(top); walkables.push(top);
  const curb = new THREE.Mesh(new THREE.RingGeometry(PLOT - 0.22, PLOT, 6, 1, Math.PI / 2), lam({ color: '#efe7d8' })); curb.rotation.x = -Math.PI / 2; curb.position.set(c.x, 0.018, c.z); town.add(curb);
}
const obb = (x, z, ry, hw, hd) => obstacles.push({ x, z, ry, hw, hd });
const circ = (x, z, r) => obstacles.push({ x, z, r });
function building(c, fwd, o) {
  const g = new THREE.Group(), ry = Math.atan2(fwd.x, fwd.z); g.position.copy(c).addScaledVector(fwd, -(o.back ?? 0.8)); g.rotation.y = ry; town.add(g);
  const body = box(o.w, o.h, o.d, lam({ map: o.wall }), 0, o.h / 2, 0, g); colliders.push(body); obb(g.position.x, g.position.z, ry, o.w / 2, o.d / 2);
  if (o.roof) { // 切妻の屋根
    const rh = o.d * 0.42, s = new THREE.Shape(); s.moveTo(-o.d / 2 - 0.3, 0); s.lineTo(o.d / 2 + 0.3, 0); s.lineTo(0, rh); s.lineTo(-o.d / 2 - 0.3, 0);
    const geo = new THREE.ExtrudeGeometry(s, { depth: o.w + 0.4, bevelEnabled: false }); geo.translate(0, 0, -(o.w + 0.4) / 2);
    const roof = new THREE.Mesh(geo, flat({ color: o.roof })); roof.rotation.y = Math.PI / 2; roof.position.y = o.h; g.add(roof); colliders.push(roof);
    box(0.4, 0.8, 0.4, flat({ color: '#b9a189' }), o.w * 0.28, o.h + rh * 0.55, -o.d * 0.15, g);
  } else box(o.w + 0.2, 0.18, o.d + 0.2, flat({ color: o.top || '#efe7d8' }), 0, o.h + 0.09, 0, g);
  const door = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.9), lam({ map: doorTex })); door.position.set(0, 0.95, o.d / 2 + 0.01); g.add(door);
  if (o.sign) { const [t, bg, fg] = o.sign; const sg = new THREE.Mesh(new THREE.PlaneGeometry(t.length * 0.32 + 0.4, 0.62), o.neon ? new THREE.MeshBasicMaterial({ map: signTex(t, bg, fg) }) : lam({ map: signTex(t, bg, fg), emissive: '#222', emissiveIntensity: .3 }));
    sg.position.set(0, Math.min(o.h - 0.4, 2.55), o.d / 2 + 0.02); g.add(sg); o.signMesh = sg;
    const awn = box(o.w * 0.86, 0.08, 0.7, flat({ color: o.awning || bg }), 0, 2.15, o.d / 2 + 0.3, g); awn.rotation.x = 0.3; }
  if (o.plate) { const pl = new THREE.Mesh(new THREE.PlaneGeometry(o.plate.length * 0.2 + 0.3, 0.34), lam({ map: signTex(o.plate, '#fffdf4', '#2a2733'), emissive: '#333', emissiveIntensity: .25 })); pl.position.set(0.95, 1.6, o.d / 2 + 0.02); g.add(pl); }
  const doorW = g.localToWorld(new THREE.Vector3(0, 0, o.d / 2)); return { g, door, doorW, fwd, ry };
}
// 木・ベンチ・池
function tree(x, z, s = 1) { const t = box(0.18 * s, 1.0 * s, 0.18 * s, flat({ color: '#8a6446' }), x, 0.5 * s, z, town); const c = new THREE.Mesh(new THREE.IcosahedronGeometry(0.85 * s, 0), flat({ color: rnd() < .5 ? '#6aa35a' : '#7cb46a' })); c.position.set(x, 1.45 * s, z); town.add(c); circ(x, z, 0.3 * s); void t; }
function park(c) { plotTile(c, 'grass'); for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2 + 0.4 + rnd(); tree(c.x + Math.cos(a) * (2.2 + rnd()), c.z + Math.sin(a) * (2.2 + rnd()), 0.8 + rnd() * 0.5); }
  const b = new THREE.Group(); b.position.copy(c); town.add(b); box(1.4, 0.08, 0.4, wood, 0, 0.42, 0, b); box(1.4, 0.4, 0.06, wood, 0, 0.66, -0.2, b); [-0.6, 0.6].forEach((x) => box(0.06, 0.42, 0.36, flat({ color: '#3d3552' }), x, 0.21, 0, b)); circ(c.x, c.z, 0.7); }
function pond(c) { plotTile(c, 'grass'); const w = new THREE.Mesh(new THREE.CircleGeometry(2.4, 10), lam({ color: '#7cc7ff', emissive: '#1d4a6e', emissiveIntensity: .2 })); w.rotation.x = -Math.PI / 2; w.position.set(c.x, 0.03, c.z); town.add(w); circ(c.x, c.z, 2.4);
  for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2; const r = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3, 0), flat({ color: '#b7ab98' })); r.position.set(c.x + Math.cos(a) * 2.5, 0.1, c.z + Math.sin(a) * 2.5); town.add(r); } }
const HOUSE_WALL = (b) => pix(16, 16, (g) => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) px(g, x, y, b);
  g.fillStyle = 'rgba(0,0,0,.06)'; for (let y = 0; y < 16; y += 4) g.fillRect(0, y + 3, 16, 1);
  [[2, 3], [9, 3]].forEach(([wx, wy], i) => { g.fillStyle = '#ffffff'; g.fillRect(wx, wy, 5, 6); g.fillStyle = i ? '#ffe7a8' : '#a9d8f0'; g.fillRect(wx + 1, wy + 1, 3, 4); g.fillStyle = '#ffffff'; g.fillRect(wx + 2, wy + 1, 1, 4); g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(wx, wy + 6, 5, 1); }); }, [2, 1]);
const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
const hexDist = (q, r) => Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r));
// まんなか: 自分の家（ドアは手前 +z）
plotTile(cellPos(0, 0), 'grass');
const myHouse = building(cellPos(0, 0), new THREE.Vector3(0, 0, 1), { w: 4.0, h: 2.8, d: 3.4, back: 0, wall: HOUSE_WALL('#f6ead6'), roof: '#ff7a6b', plate: 'MY HOME' });
box(0.3, 0.4, 0.3, flat({ color: '#ffc94a' }), 1.6, 0.9, 2.6, town); box(0.06, 0.7, 0.06, flat({ color: '#5c5a55' }), 1.6, 0.35, 2.6, town); circ(1.6, 2.6, 0.22);
acts.push({ x: 0, z: 2.3, r: 1.3, stand: new THREE.Vector3(0, 0, 2.4), label: '部屋に入る', mesh: myHouse.door, act: () => goto('room', { owner: 'me' }) });
const RING1 = { '1,0': 'mitsuba', '-1,0': 'neru', '1,-1': 'kohaku', '0,1': 'arcade', '-1,1': 'anime', '0,-1': 'books' };
const GAMES = [{ id: 'RUN', ok: true, col: '#ff6f61', label: '走る' }, { id: 'RACE', ok: true, col: '#7cc7ff', label: 'いすレース' }, { id: 'FIGHT', ok: true, col: '#ffc94a', label: '自販機ずもう' }, { id: 'DELIVERY', ok: true, col: '#5fcfb0', label: '配達' }];
function cabScreen(gm) { return pix(24, 18, (g) => {
  if (gm.ok) { ['#f7d7a8', '#f3c38f', '#e9a87a'].forEach((c, i) => { g.fillStyle = c; g.fillRect(0, i * 4, 24, 4); }); g.fillStyle = '#5a5a60'; g.fillRect(0, 12, 24, 6); g.fillStyle = '#e8e2cf'; for (let x = 1; x < 24; x += 6) g.fillRect(x, 15, 3, 1);
    g.fillStyle = '#d9a43a'; g.fillRect(6, 5, 4, 3); g.fillStyle = '#e9e6df'; g.fillRect(6, 8, 4, 3); g.fillStyle = '#3f4a66'; g.fillRect(6, 11, 4, 1); g.fillStyle = '#f07c2a'; g.fillRect(16, 9, 3, 3); g.fillStyle = '#f5c518'; g.fillRect(12, 6, 2, 2); }
  else if (gm.id === 'RACE') { g.fillStyle = '#cfc6b6'; g.fillRect(0, 0, 24, 18); g.fillStyle = '#6a6670'; g.fillRect(5, 0, 14, 18); g.fillStyle = '#e8e2cf'; g.fillRect(9, 2, 1, 3); g.fillRect(14, 8, 1, 3); g.fillStyle = '#f07c2a'; g.fillRect(15, 3, 3, 3); g.fillStyle = '#4a4458'; g.fillRect(9, 11, 5, 4); g.fillStyle = '#d9a43a'; g.fillRect(10, 8, 3, 3); }
  else if (gm.id === 'FIGHT') { g.fillStyle = '#3b3650'; g.fillRect(0, 0, 24, 18); g.fillStyle = '#c9b48a'; g.fillRect(0, 13, 24, 5); g.fillStyle = '#e2574c'; g.fillRect(13, 4, 6, 9); g.fillStyle = '#dff4ff'; g.fillRect(14, 5, 4, 3); g.fillStyle = '#d9a43a'; g.fillRect(7, 6, 4, 3); g.fillStyle = '#e9e6df'; g.fillRect(7, 9, 4, 4); }
  else { g.fillStyle = '#dbe9f2'; g.fillRect(0, 0, 24, 18); g.fillStyle = '#7a6a52'; for (let x = 0; x < 24; x++) { const y = 13 + Math.round(Math.sin(x / 4) * 2); g.fillRect(x, y, 1, 18 - y); } g.fillStyle = '#d9a43a'; g.fillRect(7, 6, 3, 3); g.fillStyle = '#e9e6df'; g.fillRect(7, 9, 3, 3); [0, 1, 2].forEach((i) => { g.fillStyle = '#c9a06a'; g.fillRect(10 + i, 7 - i * 3, 4, 3); }); }
}); }
let arcadeSign = null;
for (let q = -2; q <= 2; q++) for (let r = -2; r <= 2; r++) {
  const d = hexDist(q, r); if (d === 0 || d > 2) continue;
  const c = cellPos(q, r), fwd = c.clone().multiplyScalar(-1).normalize(), key = `${q},${r}`, k = RING1[key];
  if (k && OWN[k]) {
    const o = OWN[k]; plotTile(c, 'grass');
    const hb = building(c, fwd, { w: 3.6, h: 2.6, d: 3.2, wall: HOUSE_WALL(['#f3e6ef', '#e6eef6', '#eef2df'][['mitsuba', 'neru', 'kohaku'].indexOf(k)]), roof: o.roof, plate: o.en });
    const mb = hb.doorW.clone().addScaledVector(fwd, 1.2).add(new THREE.Vector3(fwd.z, 0, -fwd.x).multiplyScalar(1.4));
    box(0.3, 0.4, 0.3, flat({ color: o.roof }), mb.x, 0.9, mb.z, town); box(0.06, 0.7, 0.06, flat({ color: '#5c5a55' }), mb.x, 0.35, mb.z, town); circ(mb.x, mb.z, 0.22);
    o.door = hb.doorW; o.fwd = fwd;
    acts.push({ x: hb.doorW.x + fwd.x * 0.6, z: hb.doorW.z + fwd.z * 0.6, r: 1.4, stand: hb.doorW.clone().addScaledVector(fwd, 0.9), label: `${o.name}さんの部屋に入る`, mesh: hb.door, act: () => goto('room', { owner: o.id }) });
  } else if (k === 'arcade') {
    plotTile(c, 'tile');
    const ab = building(c, fwd, { w: 4.6, h: 3.6, d: 3.4, back: 1.1, wall: facade('#2d2a3a', '#3b3650', '#ff8fc8'), top: '#3d3552', sign: ['GAME', '#1d1a29', '#ff8fc8'], neon: true, awning: '#ff6f61' });
    arcadeSign = ab.g.children.find((m) => m.material?.map && m.geometry.parameters?.height === 0.62);
    const side = new THREE.Vector3(fwd.z, 0, -fwd.x);
    GAMES.forEach((gm, i) => {
      const p = ab.doorW.clone().addScaledVector(fwd, 1.2).addScaledVector(side, (i - 1.5) * 1.05);
      const cg = new THREE.Group(); cg.position.copy(p); cg.rotation.y = ab.ry; town.add(cg);
      const body = box(0.8, 1.75, 0.6, flat({ color: gm.ok ? gm.col : '#5a5568' }), 0, 0.875, 0, cg); colliders.push(body);
      const mq = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.22), new THREE.MeshBasicMaterial({ map: signTex(gm.id, '#14121c', gm.ok ? '#ffe14d' : '#8a85a0') })); mq.position.set(0, 1.62, 0.31); cg.add(mq);
      const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.46), new THREE.MeshBasicMaterial({ map: cabScreen(gm) })); scr.position.set(0, 1.2, 0.305); cg.add(scr);
      const pnl = box(0.8, 0.08, 0.3, flat({ color: '#2a2733' }), 0, 0.92, 0.42, cg); pnl.rotation.x = 0.3;
      box(0.06, 0.06, 0.06, flat({ color: '#ff6fa8' }), 0.15, 0.97, 0.44, cg); box(0.06, 0.06, 0.06, flat({ color: '#ffe14d' }), 0.27, 0.97, 0.44, cg);
      obb(p.x, p.z, ab.ry, 0.4, 0.35);
      const stand = p.clone().addScaledVector(fwd, 0.95);
      acts.push({ x: stand.x, z: stand.z, r: 0.75, stand, label: gm.ok ? `${gm.label}ゲームで遊ぶ` : `${gm.label}ゲーム（じゅんび中）`, mesh: cg, game: gm,
        act: () => gm.ok ? startMinigame(gm) : flashPrompt(`${gm.label}ゲームは じゅんび中`) });
    });
  } else if (k === 'anime' || k === 'books') {
    plotTile(c, 'tile');
    building(c, fwd, { w: 4.4, h: 3.2, d: 3.4, wall: facade(k === 'anime' ? '#ffe3ec' : '#e3ecf7', '#4a5560', '#ffe7a8'), sign: k === 'anime' ? ['ANIME SHOP', '#ff6f61', '#fff'] : ['BOOKS', '#4f7fa8', '#fff'] });
  } else {
    const kinds = ['park', 'house', 'coffee', 'house', 'pond', 'manga', 'house', 'park', 'house', 'house', 'park', 'house'];
    const kind = kinds[(q * 7 + r * 3 + 40) % kinds.length];
    if (kind === 'park') park(c);
    else if (kind === 'pond') pond(c);
    else if (kind === 'house') { plotTile(c, 'grass'); building(c, fwd, { w: 3.4, h: 2.4 + Math.floor(rnd() * 2) * 0.5, d: 3.0, wall: HOUSE_WALL(['#f1e4cf', '#e6e0f2', '#e2efe6', '#f6e1d6'][Math.floor(rnd() * 4)]), roof: ['#9d8cf0', '#5fa88f', '#d98a5a', '#6f8fc0'][Math.floor(rnd() * 4)] });
      tree(c.x + fwd.z * 2.6 - fwd.x * 0.6, c.z - fwd.x * 2.6 - fwd.z * 0.6, 0.7); }
    else { plotTile(c, 'tile'); building(c, fwd, { w: 4.0, h: 3.0, d: 3.2, wall: facade(kind === 'coffee' ? '#e8d8c4' : '#f6e0dc', '#4a5560', '#ffe7a8'), sign: kind === 'coffee' ? ['COFFEE', '#6b4f3a', '#fff'] : ['MANGA', '#e2574c', '#fff'] }); }
  }
}
// 町のはしは木で囲む
for (let i = 0; i < 46; i++) { const a = i / 46 * Math.PI * 2 + rnd() * 0.05, r = 27 + rnd() * 3; tree(Math.cos(a) * r, Math.sin(a) * r, 1 + rnd() * 0.5); }
// 分かれ道の道しるべ（家の前の角）
{ const post = new THREE.Group(); post.position.set(-1.4, 0, HR + 0.2); town.add(post); box(0.1, 2.0, 0.1, flat({ color: '#8a6446' }), 0, 1.0, 0, post); circ(-1.4, HR + 0.2, 0.2);
  [['GAME', cellPos(0, 1), 1.55, '#ff6f61'], ['ANIME', cellPos(-1, 1), 1.2, '#9d8cf0'], ['HOME', cellPos(0, 0), 1.85, '#5fa88f']].forEach(([t, target, y, col]) => {
    const dx = target.x - post.position.x, dz = target.z - post.position.z, th = Math.atan2(-dz, dx);
    const tex = signTex(t + ' >', col, '#fff'), m = lam({ color: col }), face = lam({ map: tex });
    const b = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.26, 0.04), [m, m, m, m, face, face]); b.position.set(Math.cos(th) * 0.5, y, -Math.sin(th) * 0.5); b.rotation.y = th; post.add(b);
  }); }
// ───────── 町の描き込み: 電柱と電線・ブロック塀・植木鉢・マンホール・カーブミラー・止まれ ─────────
const cornersOf = (c, r = HR) => Array.from({ length: 6 }, (_, i) => { const a = (30 + 60 * i) * Math.PI / 180; return new THREE.Vector3(c.x + r * Math.cos(a), 0, c.z + r * Math.sin(a)); });
const blockTex = pix(16, 8, (g) => { for (let y = 0; y < 8; y++) for (let x = 0; x < 16; x++) { const row = y >> 2, off = (row & 1) * 4; let c = (y % 4 === 3 || (x + off) % 8 === 7) ? '#8e8a80' : '#c3beb2'; if (c !== '#8e8a80' && (x + y) % 5 === 0) c = '#b2ad a1'.replace(' ', ''); px(g, x, y, c); } }, [3, 1]);
const coping = lam({ color: '#d8d3c6' });
{ // ブロック塀: 家の区画の、道に面した裏側の辺
  const plots = []; for (let q = -2; q <= 2; q++) for (let r = -2; r <= 2; r++) { const d = hexDist(q, r); if (d >= 1 && d <= 2) plots.push(cellPos(q, r)); }
  plots.forEach((c, n) => { if (n % 3 === 2) return; const cs = cornersOf(c, PLOT - 0.2), fwd = c.clone().multiplyScalar(-1).normalize();
    for (let i = 0; i < 6; i++) { const a = cs[i], b = cs[(i + 1) % 6], mid = a.clone().add(b).multiplyScalar(0.5), nrm = mid.clone().sub(c).normalize();
      if (nrm.dot(fwd) > -0.1 || (i + n) % 3 === 0) continue;
      const len = a.distanceTo(b), ry = Math.atan2(b.x - a.x, b.z - a.z) - Math.PI / 2, w = box(len, 1.05, 0.16, lam({ map: blockTex }), mid.x, 0.525, mid.z, town); w.rotation.y = ry;
      const cp = box(len + 0.04, 0.06, 0.22, coping, mid.x, 1.08, mid.z, town); cp.rotation.y = ry; obb(mid.x, mid.z, ry, len / 2, 0.1); } });
}
{ // 電柱と電線
  const poles = [], seenP = new Set();
  for (let q = -1; q <= 1; q++) for (let r = -1; r <= 1; r++) { if (hexDist(q, r) > 1) continue; cornersOf(cellPos(q, r)).forEach((p, i) => { const k = `${Math.round(p.x)},${Math.round(p.z)}`; if (seenP.has(k)) return; seenP.add(k); if ((i + q * 2 + r) % 2) return; poles.push(p.clone().add(new THREE.Vector3(0.9, 0, 0.5))); }); }
  const poleMat = lam({ color: '#8d8a82' }), dark = flat({ color: '#4a4650' });
  poles.forEach((p, i) => { box(0.16, 5.2, 0.16, poleMat, p.x, 2.6, p.z, town); box(1.1, 0.08, 0.08, dark, p.x, 4.75, p.z, town); if (i % 3 === 0) box(0.35, 0.5, 0.35, flat({ color: '#9aa0a6' }), p.x + 0.25, 4.1, p.z, town);
    box(0.02, 0.6, 0.12, flat({ color: '#e8e2cf' }), p.x + 0.09, 1.7, p.z, town); circ(p.x, p.z, 0.15); });
  const wire = new THREE.LineBasicMaterial({ color: '#2b2730' });
  poles.forEach((a, i) => poles.forEach((b, j) => { if (j <= i) return; const d = a.distanceTo(b); if (d > HR * 1.9) return;
    [[4.72, -0.42], [4.72, 0.42], [4.3, 0]].forEach(([y, o]) => { const pts = []; for (let k = 0; k <= 10; k++) { const t = k / 10; pts.push(new THREE.Vector3(a.x + (b.x - a.x) * t + o * 0.1, y - Math.sin(t * Math.PI) * (0.35 + d * 0.03), a.z + (b.z - a.z) * t + o)); } town.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), wire)); }); }));
}
{ // マンホール・植木鉢・カーブミラー・止まれ
  const mhTex = pix(12, 12, (g) => { for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) { const d = Math.hypot(x - 5.5, y - 5.5); if (d < 6) px(g, x, y, d > 5 ? '#4a4650' : ((x + y) % 3 ? '#77727e' : '#5e5966')); } });
  [[0, HR], [SQ3 * HR / 2, HR / 2], [-SQ3 * HR, 0], [SQ3 * HR / 2, -HR * 1.5]].forEach(([x, z]) => { const m = new THREE.Mesh(new THREE.CircleGeometry(0.42, 10), lam({ map: mhTex, transparent: true })); m.rotation.x = -Math.PI / 2; m.position.set(x + 0.6, 0.02, z - 0.6); town.add(m); });
  const pot = (x, z, s) => { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.16 * s, 0.12 * s, 0.26 * s, 6), flat({ color: '#b8653f' })); p.position.set(x, 0.13 * s, z); town.add(p);
    const l = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22 * s, 0), flat({ color: rnd() < .5 ? '#5f9a4f' : '#7cb46a' })); l.position.set(x, 0.38 * s, z); town.add(l); };
  [myHouse.doorW, ...['mitsuba', 'neru', 'kohaku'].map((k) => OWN[k].door)].forEach((d, i) => { const f = i ? OWN[['mitsuba', 'neru', 'kohaku'][i - 1]].fwd : new THREE.Vector3(0, 0, 1), sd = new THREE.Vector3(f.z, 0, -f.x);
    for (let j = 0; j < 3; j++) pot(d.x + sd.x * (-1.0 - j * 0.32) + f.x * 0.3, d.z + sd.z * (-1.0 - j * 0.32) + f.z * 0.3, 0.8 + (j % 2) * 0.4); });
  const mir = new THREE.Group(); mir.position.set(1.3, 0, HR + 0.6); town.add(mir); box(0.1, 2.6, 0.1, flat({ color: '#ff7a3a' }), 0, 1.3, 0, mir);
  const mm = new THREE.Mesh(new THREE.CircleGeometry(0.38, 10), lam({ color: '#cfe3f0', emissive: '#556', emissiveIntensity: .3 })); mm.position.set(0, 2.7, 0.06); mm.rotation.y = -0.6; mir.add(mm); circ(1.3, HR + 0.6, 0.15);
  const stopTex = (() => { const c = document.createElement('canvas'); c.width = 64; c.height = 56; const g = c.getContext('2d'); g.fillStyle = '#e2574c'; g.beginPath(); g.moveTo(2, 2); g.lineTo(62, 2); g.lineTo(32, 54); g.closePath(); g.fill();
    g.strokeStyle = '#fff'; g.lineWidth = 3; g.stroke(); g.fillStyle = '#fff'; g.font = '13px "DotGothic16", sans-serif'; g.textAlign = 'center'; g.fillText('止まれ', 32, 20); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter; return t; })();
  const st = new THREE.Group(); st.position.set(-SQ3 * HR / 2 + 0.8, 0, HR / 2 + 0.4); town.add(st); box(0.07, 2.0, 0.07, flat({ color: '#c9c3d6' }), 0, 1.0, 0, st);
  const sp = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.54), lam({ map: stopTex, transparent: true, side: THREE.DoubleSide })); sp.position.set(0, 2.1, 0.05); sp.rotation.y = 0.5; st.add(sp); circ(st.position.x, st.position.z, 0.12);
}
// ───────── 自販機: コイン 3 枚で、ちょっと変な飲み物が出る（部屋に飾れる） ─────────
const DRINKS = [['麦茶（濃）', '#8a5a2b', '#e0b070', 'MUGI'], ['ぬるいサイダー', '#7cc7ff', '#ffffff', 'SODA'], ['ゆずの気配', '#ffe14d', '#9fd36b', 'YUZU'], ['炭酸のぬけたコーラ', '#3a2a2a', '#e2574c', 'COLA'], ['飲むプリン（固い）', '#ffd98a', '#8a5a2b', 'PURI'],
  ['白湯', '#f4f1ea', '#c9c3d6', 'SAYU'], ['みかんの缶の汁', '#ff9f40', '#ffffff', 'MIKAN'], ['黒いソーダ', '#2e2a38', '#9d8cf0', 'BLACK'], ['ほうじ茶（夏）', '#a0704a', '#7fd8c0', 'HOJI']];
const gotDrinks = new Set();
const vendTex2 = pix(12, 22, (g) => { g.fillStyle = '#f4f1ea'; g.fillRect(0, 0, 12, 22); g.fillStyle = '#dfe9f2'; g.fillRect(1, 2, 10, 9); DRINKS.forEach((d, i) => { if (i > 7) return; g.fillStyle = d[1]; g.fillRect(2 + (i % 4) * 2, 3 + Math.floor(i / 4) * 4, 1, 3); g.fillStyle = '#e2574c'; g.fillRect(2 + (i % 4) * 2, 6 + Math.floor(i / 4) * 4, 1, 1); });
  g.fillStyle = '#2e2a38'; g.fillRect(2, 16, 8, 3); g.fillStyle = '#5b5068'; g.fillRect(8, 12, 2, 2); ptext(g, '', 0, 0, '#000'); });
function vending(c, deg) {
  const a = deg * Math.PI / 180, dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a)), p = c.clone().addScaledVector(dir, PLOT * 0.866 - 0.45), ry = Math.atan2(dir.x, dir.z);
  const g = new THREE.Group(); g.position.copy(p); g.rotation.y = ry; town.add(g);
  const side = lam({ color: '#e2574c' }), face = lam({ map: vendTex2, emissive: '#fff', emissiveIntensity: .35 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.85, 0.7), [side, side, side, side, face, side]); body.position.y = 0.925; g.add(body); colliders.push(body); obb(p.x, p.z, ry, 0.45, 0.35);
  const stand = p.clone().addScaledVector(dir, 0.95);
  acts.push({ x: stand.x, z: stand.z, r: 0.85, stand, label: '買う（コイン 3）', mesh: g, act: buyDrink });
  return { p, dir };
}
const vend1 = vending(cellPos(0, 0), 60), vend2 = vending(cellPos(0, 1), 300);
function buyDrink() {
  if (S.coins < 3) { flashPrompt('コインが 3 枚いる'); return; }
  S.coins -= 3; drawHud(true); setTimeout(() => drawHud(), 300); buzz();
  const [name, col, col2, code] = DRINKS[Math.floor(Math.random() * DRINKS.length)], first = !gotDrinks.has(name); gotDrinks.add(name);
  const gd = { id: 'can-' + Date.now(), kind: 'can', h: 0.24, col, col2, code, title: name, sub: '町の自販機で出た · コイン 3', slot: null, owner: OWN.me };
  ST.cans = [...(ST.cans || []), { id: gd.id, name, col, col2, code }]; persist();
  OWN.me.goods.push(gd); makeGoods(gd);
  openTalk({ name: '自販機', lines: [`ガコン。「${name}」が出た。`, first ? '部屋の棚に飾れる。' : 'また出た。'] });
}
// ───────── 住人: ちょっと変な人たち・ねこ・すれちがったファン ─────────
const FAN_STK = {
  yuzu: ['....0000....', '...011110...', '..01111110..', '.0111111110.', '.0101111010.', '.0711111170.', '011110011110', '010000000010', '010000000010', '.0000000000.', '............', '............'].join(''),
  tamaki: ['.....00.....', '....0330....', '....0330....', '000003300000', '033333333330', '.0333333330.', '..03333330..', '..03300330..', '.0330..0330.', '.000....000.', '............', '............'].join(''),
  pon: ['............', '.00......00.', '.050....050.', '.0550000550.', '.0555555550.', '.0515555150.', '.0555775550.', '..05555550..', '...000000...', '............', '............', '............'].join(''),
};
const npcs = [];
function makeCat() {
  const g = new THREE.Group(), fur = flat({ color: '#e9a15a' }), wh = flat({ color: '#fffaf0' });
  box(0.42, 0.2, 0.2, fur, 0, 0.22, 0, g).rotation.y = Math.PI / 2; box(0.16, 0.08, 0.36, wh, 0, 0.14, 0, g);
  const head = new THREE.Group(); head.position.set(0, 0.38, 0.22); g.add(head); box(0.2, 0.17, 0.17, fur, 0, 0, 0, head);
  [-1, 1].forEach((s) => { const e = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.09, 4), fur); e.position.set(s * 0.06, 0.11, 0); head.add(e); box(0.025, 0.035, 0.01, flat({ color: '#2e2a38' }), s * 0.05, 0.02, 0.09, head); });
  const tail = box(0.04, 0.3, 0.04, fur, 0, 0.36, -0.24, g); tail.rotation.x = -0.5;
  const legs = [[-0.07, 0.14], [0.07, 0.14], [-0.07, -0.14], [0.07, -0.14]].map(([x, z]) => { const l = new THREE.Group(); l.position.set(x, 0.16, z); box(0.05, 0.16, 0.05, fur, 0, -0.08, 0, l); g.add(l); return l; });
  return { g, legs, arms: [], head, tail };
}
function addNpc(o) {
  const b = o.cat ? makeCat() : makeBee({ type: o.type, shirt: o.shirt, bottom: o.bottom, headC: o.headC });
  Object.assign(o, b, { i: 0, talks: 0, walkT: Math.random() * 6 }); o.g.position.copy(o.path ? o.path[0] : o.at); town.add(o.g);
  if (o.prop === 'broom') { const br = new THREE.Group(); br.position.set(0.12, 0.55, 0.12); box(0.03, 0.9, 0.03, flat({ color: '#a0704a' }), 0, 0, 0, br); box(0.18, 0.16, 0.06, flat({ color: '#e0c070' }), 0, -0.5, 0, br); o.g.add(br); o.broom = br; }
  if (o.prop === 'box') { box(0.34, 0.26, 0.28, flat({ color: '#c9a06a' }), 0, 0.82, 0.22, o.g); box(0.35, 0.04, 0.06, flat({ color: '#e8d9b8' }), 0, 0.95, 0.22, o.g); o.carry = true; }
  if (o.prop === 'wheel') { const w = new THREE.Group(); w.position.set(0.15, 0, 0.32); const wl = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.03, 10), flat({ color: '#ffc94a' })); wl.rotation.z = Math.PI / 2; wl.position.y = 0.15; w.add(wl); const h = box(0.025, 0.85, 0.025, flat({ color: '#4a4650' }), 0, 0.55, -0.15, w); h.rotation.x = -0.45; o.g.add(w); o.wheel = wl; }
  if (o.fan) loadImg(o.fan.img).then((im) => { if (!im) return; const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.beginPath(); g.arc(32, 32, 31, 0, 7); g.fill();
    g.save(); g.beginPath(); g.arc(32, 32, 27, 0, 7); g.clip(); const k = 54 / Math.min(im.width, im.height); g.drawImage(im, 32 - im.width * k / 2, 32 - im.height * k / 2, im.width * k, im.height * k); g.restore();
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; o.icon = new THREE.Sprite(new THREE.SpriteMaterial({ map: t })); o.icon.scale.setScalar(0.34); town.add(o.icon); crisp(o.icon); });
  o.g.traverse((m) => { m.userData = { npc: o }; });
  npcs.push(o); return o;
}
const ringPath = (q, r, rad = HR, from = 0) => { const cs = cornersOf(cellPos(q, r), rad); return [...cs.slice(from), ...cs.slice(0, from)]; };
addNpc({ name: '本屋の人', type: 'A', shirt: '#9aa38a', bottom: '#4f5a48', at: new THREE.Vector3(-SQ3 * HR / 2 - 0.6, 0, -HR / 2 - 0.4), prop: 'broom',
  lines: [['いらっしゃい。今日は新刊の入荷日だよ。'], ['特典、もう残り少ないよ。'], ['（店の前を掃いている）']] });
addNpc({ name: '配達の人', type: 'B', shirt: '#f2eadb', bottom: '#5d5390', path: [cornersOf(cellPos(1, 0))[2], cornersOf(cellPos(1, 0))[3]], speed: 0.7, prop: 'box',
  lines: [['お届けものです。'], ['発売日は荷物が倍になるんだよね。'], ['次はとなりの家。']] });
addNpc({ name: '自販機の前の人', type: 'A', shirt: '#ffd1a8', bottom: '#3f4a66', at: vend1.p.clone().addScaledVector(vend1.dir, 1.5).add(new THREE.Vector3(0.7, 0, 0.2)), face: vend1.p,
  lines: [['どれにしよう…'], ['「ゆずの気配」って飲んだことある？'], ['結局いつもの麦茶にした。']] });
addNpc({ name: 'ねこ', cat: true, at: new THREE.Vector3(-2.8, 0, 4.6), lines: [['（ごろごろ）']] });
const md = (d) => d ? `${+d.slice(5, 7)}/${+d.slice(8, 10)}` : '';
const short = (t) => t.length > 16 ? t.slice(0, 15) + '…' : t;
[['ゆず', 'B', '#ffe3ec', '#3d3552', '#e8b44a', ringPath(0, 0, HR, 1), 0.9, 'yuzu', (s) => `「${short(s.title)}」、もう見た？`],
 ['たまき', 'A', '#cfe8ff', '#5a6b54', '#c99a3a', ringPath(1, -1, HR, 3), 0.8, 'tamaki', (s) => s.date ? `「${short(s.title)}」、${md(s.date)}だって。` : `「${short(s.title)}」、気になってる。`],
 ['ぽん', 'B', '#fff0b8', '#e2574c', '#d9a43a', ringPath(-1, 1, HR, 5), 1.0, 'pon', (s) => `「${short(s.title)}」、予約した？`]].forEach(([name, type, shirt, bottom, headC, path, speed, stk, line], k) => {
  const s = SAMPLE(k * 5 + 3); if (!s) return;
  addNpc({ name, type, shirt, bottom, headC, path, speed, fan: { img: s.img, work: s.title, stk }, lines: [[line(s)]] });
});

// ───────── 話す ─────────
const talkEl = $('talk');
let talkS = null;
function openTalk(t) { S.busy = true; joy.x = joy.y = 0; promptEl.classList.remove('on'); talkS = { ...t, k: 0 }; showTalk(); }
function showTalk() {
  const t = talkS; $('tN').textContent = t.name; $('tL').textContent = t.lines[t.k]; $('tB').innerHTML = '';
  if (t.k === t.lines.length - 1 && t.offer) { const b = document.createElement('button'); b.textContent = 'ステッカーを交換'; b.onclick = (e) => { e.stopPropagation(); t.offer(); }; $('tB').appendChild(b); }
  talkEl.classList.add('on');
}
function nextTalk() { if (!talkS) return; if (talkS.k < talkS.lines.length - 1) { talkS.k++; showTalk(); } else closeTalk(); }
function closeTalk() { talkEl.classList.remove('on'); talkS = null; setTimeout(() => { S.busy = false; }, 120); }
talkEl.addEventListener('click', nextTalk);
function talkTo(n) {
  if (n.cat) { openTalk({ name: 'ねこ', lines: ['（ごろごろ）'] }); n.flee = 1; buzz(); return; }
  const lines = n.lines[Math.min(n.talks, n.lines.length - 1)]; n.talks++;
  const t = { name: n.name, lines: [...lines] };
  if (n.fan) {
    const has = myStk.some((m) => m.id === 'fan-' + n.fan.stk);
    if (!has) t.offer = () => { myStk.push({ id: 'fan-' + n.fan.stk, pix: FAN_STK[n.fan.stk] }); saveStk(); talkS.lines = [`${n.name}さんとステッカーを交換した。`]; talkS.k = 0; talkS.offer = null; showTalk(); buzz(); };

  }
  openTalk(t);
}
const sky = new THREE.Mesh(new THREE.SphereGeometry(70, 8, 6), new THREE.MeshBasicMaterial({ side: THREE.BackSide, map: pix(4, 16, (g) => { const c = ['#f7d7a8', '#f3c38f', '#e9a87a', '#c98b7a', '#8f8aa8', '#6d7aa0']; for (let y = 0; y < 16; y++) for (let x = 0; x < 4; x++) px(g, x, y, c[Math.min(5, Math.floor((15 - y) / 2.7))]); }) }));
town.add(sky);
acts.forEach((a) => a.mesh.traverse((m) => { m.userData = { act: a }; }));

// アイテム: 道（ハニカムのすき間）に落ちている。コイン・アニメや漫画らしい物・？の箱（コインが10枚）
const items = [];
function addItem(kind, x, z) {
  const g = new THREE.Group(); g.position.set(x, 0.55, z);
  if (kind === 'coin') { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.05, 10), new THREE.MeshPhongMaterial({ color: '#f5c518', emissive: '#6b4f00', shininess: 90, flatShading: true })); m.rotation.x = Math.PI / 2; g.add(m); }
  if (kind === 'onigiri') { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.16, 3), flat({ color: '#fbfbf5' })); m.rotation.x = Math.PI / 2; m.rotation.y = Math.PI / 2; g.add(m); box(0.2, 0.14, 0.18, flat({ color: '#1e2a22' }), 0, -0.12, 0, g); }
  if (kind === 'wand') { const s = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.6, 5), flat({ color: '#ff8fc8' })); g.add(s); const shape = new THREE.Shape(); for (let i = 0; i < 10; i++) { const r = i % 2 ? 0.08 : 0.2, a = i / 10 * Math.PI * 2 + Math.PI / 2; i ? shape.lineTo(Math.cos(a) * r, Math.sin(a) * r) : shape.moveTo(Math.cos(a) * r, Math.sin(a) * r); } const st = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.06, bevelEnabled: false }), flat({ color: '#ffe14d', emissive: '#553' })); st.position.y = 0.36; g.add(st); }
  if (kind === 'bubble') { const shp = new THREE.Shape(); shp.absellipse(0, 0, 0.34, 0.24, 0, Math.PI * 2); const b = new THREE.Mesh(new THREE.ExtrudeGeometry(shp, { depth: 0.06, bevelEnabled: false, curveSegments: 6 }), flat({ color: '#ffffff' })); g.add(b); const tl = box(0.08, 0.14, 0.06, flat({ color: '#fff' }), -0.14, -0.26, 0.03, g); tl.rotation.z = 0.6; box(0.05, 0.2, 0.07, flat({ color: '#e5484d' }), 0, 0.03, 0.02, g); box(0.05, 0.05, 0.07, flat({ color: '#e5484d' }), 0, -0.13, 0.02, g); }
  if (kind === 'manga') { const m = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.44, 0.07), [lam({ color: '#eee' }), lam({ color: '#eee' }), lam({ color: '#eee' }), lam({ color: '#eee' }), lam({ map: mangaTex }), lam({ map: mangaTex })]); g.add(m); }
  if (kind === 'q') { const m = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), lam({ map: qTex, emissive: '#553300', emissiveIntensity: .4 })); g.add(m); g.position.y = 1.0; }
  crisp(g); town.add(g); items.push({ kind, g, alive: true, x, z });
}
{
  const seen = new Set(), corners = [];
  for (let q = -1; q <= 1; q++) for (let r = -1; r <= 1; r++) { if (hexDist(q, r) > 1) continue; const c = cellPos(q, r);
    const cs = Array.from({ length: 6 }, (_, i) => { const a = (30 + 60 * i) * Math.PI / 180; return [c.x + HR * Math.cos(a), c.z + HR * Math.sin(a)]; });
    cs.forEach(([x, z], i) => { const key = `${Math.round(x * 2)},${Math.round(z * 2)}`; if (!seen.has('c' + key)) { seen.add('c' + key); corners.push([x, z]); }
      const [x2, z2] = cs[(i + 1) % 6], ek = [key, `${Math.round(x2 * 2)},${Math.round(z2 * 2)}`].sort().join('|');
      if (seen.has(ek)) return; seen.add(ek); if (rnd() > 0.55) return;
      [0.3, 0.5, 0.7].forEach((t) => addItem('coin', x + (x2 - x) * t, z + (z2 - z) * t)); }); }
  const sp = ['onigiri', 'wand', 'bubble', 'manga', 'q', 'onigiri', 'bubble', 'q', 'wand', 'manga', 'q'];
  corners.filter(([x, z]) => Math.hypot(x + 1.4, z - HR - 0.2) > 1.5).forEach(([x, z], i) => { if (i % 2 === 0 && sp[i / 2]) addItem(sp[i / 2], x, z); });
}

// ───────── 状態 ─────────
const S = { power: 'off', mode: 'room', owner: 'me', coins: ST.coins || 0, items: 0, yaw: 0.35, pitch: 0.42, dist: 3.4, edit: false, sel: null, busy: false, near: null, snap: true, menu: false, bootT: 0, turn: 0, get: null, spinT: null, intro: 0 };
const camGoal = { pos: new THREE.Vector3(), look: new THREE.Vector3() };
const camNow = { pos: new THREE.Vector3(2, 3, 5), look: new THREE.Vector3(0, 1, 0) };
const joy = { x: 0, y: 0 };
const keys = {};
const card = $('card'), promptEl = $('prompt'), promptT = $('promptT'), menuEl = $('menu'), toastEl = $('toast');

// ───────── HUD ─────────
const hud = $('hud');
function drawHud(flash) {
  if (ST.coins !== S.coins) { ST.coins = S.coins; persist(); }
  const w = Math.round((L.sw || 300) / 3), h = 14; hud.width = w; hud.height = h;
  const g = hud.getContext('2d'); g.clearRect(0, 0, w, h);
  const label = S.mode === 'town' ? 'TOWN' : OWN[S.owner].en;
  g.fillStyle = 'rgba(20,16,30,.6)'; g.fillRect(2, 2, ptw(label) + 4, 9); g.fillRect(w - 50, 2, 48, 9);
  ptext(g, label, 4, 4, '#fff');
  g.fillStyle = '#f5c518'; g.fillRect(w - 48, 4, 5, 5); g.fillStyle = '#b37800'; g.fillRect(w - 44, 5, 1, 4);
  ptext(g, 'x' + String(S.coins).padStart(3, '0'), w - 41, 4, flash ? '#ffe14d' : '#fff');
  ptext(g, '+' + S.items, w - 16, 4, '#ff8fc8');
}

// ───────── 起動の画面 ─────────
const bootEl = $('boot');
function drawBoot(t) {
  const g = bootEl.getContext('2d'), w = bootEl.width, h = bootEl.height; if (!w) return;
  g.fillStyle = '#151519'; g.fillRect(0, 0, w, h);
  if (t <= 0) { bootEl.style.opacity = 1; bootEl.style.display = 'block'; return; }
  g.globalAlpha = Math.min(1, t / 0.25); g.fillStyle = '#eceee2'; g.fillRect(0, 0, w, h); g.globalAlpha = 1;
  if (t > 0.25) {
    const k = Math.min(1, (t - 0.25) / 0.8), e = 1 - (1 - k) ** 3, tw = ptw('FANHIVE', 2);
    const y = Math.round(-14 + (h / 2 - 6 + 14) * e);
    ptext(g, 'FANHIVE', Math.round(w / 2 - tw / 2), y, t > 1.1 && t < 1.32 ? '#ff6f61' : '#3d3552', 2);
  }
  bootEl.style.opacity = t > 1.55 ? Math.max(0, 1 - (t - 1.55) / 0.35) : 1;
}

// ───────── カバンから出す・しまう ─────────
const phone = root, stage = $('stage'), dim = $('dim'), sBack = $('sBagBack'), sItems = $('sBagItems'), sFront = $('sBagFront');
function geom() {
  const pr = phone.getBoundingClientRect(), br = bagEl.getBoundingClientRect(), bx = br.left - pr.left, by = br.top - pr.top;
  const cr = { x: consoleEl.offsetLeft, y: consoleEl.offsetTop, w: consoleEl.offsetWidth, h: consoleEl.offsetHeight };
  bagCon.position.y = -bagCon.userData.base.y; bagCon.rotation.z = bagCon.userData.base.rz; bagCon.updateMatrixWorld(true);
  const v = bagCon.getWorldPosition(new THREE.Vector3()).project(bagCam);
  const pcx = bx + (v.x + 1) / 2 * br.width, pcy = by + (1 - v.y) / 2 * br.height;
  const s = BAGCON_W * bagRoot.scale.x / cr.w, dx = pcx - (cr.x + cr.w / 2), dy = pcy - (cr.y + cr.h / 2);
  const rise = (pcy + cr.h * s / 2) - (by + BAG.mouth) + 18;
  bagCon.visible = false; bagR.render(bagScene, bagCam);
  const tabTop = pr.height - navH(), cut = Math.max(0, by + br.height - tabTop); // タブの裏に隠れている分は写さない
  [[sBack, $('bagBack')], [sItems, bag3d], [sFront, $('bagFront')]].forEach(([d, src]) => { d.width = src.width; d.height = src.height; const g = d.getContext('2d'); g.clearRect(0, 0, d.width, d.height); g.drawImage(src, 0, 0); Object.assign(d.style, { left: bx + 'px', top: by + 'px', width: br.width + 'px', height: br.height + 'px', clipPath: `inset(0 0 ${cut}px 0)` }); });
  return { T0: `translate(${dx}px,${dy}px) scale(${s}) rotate(-9deg)`, T1: `translate(${dx}px,${dy - rise}px) scale(${s * 1.08}) rotate(-3deg)` };
}
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const anim = (el, kf, o) => el.animate(kf, { fill: 'forwards', ...o, duration: reduce ? 1 : o.duration });
async function openConsole() {
  if (S.power !== 'off' || S.anim) return; S.anim = true; root.style.zIndex = '200'; document.documentElement.dataset.roomOpen = '1'; opts.onOpen?.();
  const { T0, T1 } = geom();
  stage.classList.add('open'); consoleEl.style.zIndex = 3;
  [consoleEl, dim, sBack, sItems, sFront, tv].forEach((e) => e.getAnimations().forEach((a) => a.cancel()));
  await anim(consoleEl, [{ transform: T0 }, { transform: T1 }], { duration: 430, easing: 'cubic-bezier(.2,.8,.3,1)' }).finished;
  consoleEl.style.zIndex = 5;
  anim(dim, [{ opacity: 0 }, { opacity: 1 }], { duration: 460 });
  [sBack, sItems, sFront].forEach((e) => anim(e, [{ transform: 'none', opacity: 1 }, { transform: 'translateY(80px)', opacity: 0 }], { duration: 380, easing: 'ease-in' }));
  await anim(consoleEl, [{ transform: T1 }, { transform: 'none' }], { duration: 540, easing: 'cubic-bezier(.2,1.1,.3,1)' }).finished;
  S.anim = false; S.power = 'boot'; S.bootT = 0; drawPow(); drawSkin(); drawBoot(0.01);
}
async function closeConsole() {
  if (S.power !== 'on' || S.anim) return; S.anim = true;
  endGet(true); endEdit(); closeMenu(); closeStk(); unfocus(); joy.x = joy.y = 0; S.turn = 0; drawDpad(''); S.power = 'closing'; drawPow();
  await anim(tv, [{ transform: 'scale(1,1)', filter: 'brightness(1)' }, { transform: 'scale(1,.01)', filter: 'brightness(2.6)', offset: .6 }, { transform: 'scale(0,.01)', filter: 'brightness(3)' }], { duration: 340, easing: 'ease-in' }).finished;
  S.power = 'off'; drawPow(); drawSkin(); drawBoot(0);
  const { T0, T1 } = geom();
  anim(dim, [{ opacity: 1 }, { opacity: 0 }], { duration: 420 });
  [sBack, sItems, sFront].forEach((e) => anim(e, [{ transform: 'translateY(80px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 380, easing: 'ease-out' }));
  await anim(consoleEl, [{ transform: 'none' }, { transform: T1 }], { duration: 440, easing: 'cubic-bezier(.4,0,.6,1)' }).finished;
  consoleEl.style.zIndex = 3;
  await anim(consoleEl, [{ transform: T1 }, { transform: T0 }], { duration: 360, easing: 'cubic-bezier(.5,0,.75,.4)' }).finished;
  stage.classList.remove('open'); bagCon.visible = true; root.style.zIndex = ''; delete document.documentElement.dataset.roomOpen; opts.onClose?.();
  [consoleEl, dim, sBack, sItems, sFront, tv].forEach((e) => e.getAnimations().forEach((a) => a.cancel()));
  S.anim = false;
}
$('bPow').addEventListener('click', () => { if (S.power === 'on') closeConsole(); });
$('bHome').addEventListener('click', () => { if (S.power !== 'on' || mg.on || S.busy || S.get) return; buzz(); if (S.mode === 'room' && S.owner === 'me') { flashPrompt('ここが自分の部屋'); return; } closeMenu(); goto('room', { owner: 'me' }); });
$('bShot').addEventListener('click', () => { if (S.power !== 'on' || S.menu || stkEl.classList.contains('on')) return; buzz(); S.shot = true; tv.animate([{ filter: 'brightness(2.2)' }, { filter: 'brightness(1)' }], { duration: reduce ? 1 : 260 }); });

// ───────── SELECT: キャラを着がえる（A ⇄ B。くるっと回って入れかわる） ─────────
let toastT;
function toast(html, ms = 1300) { toastEl.innerHTML = html; toastEl.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.remove('on'), ms); }
const CHAR_SUB = { A: 'シャツとスニーカー', B: 'リボンとスカート' };
$('bSel').addEventListener('click', () => {
  if (S.power !== 'on' || S.busy || S.get || S.menu || mg.on || S.spinT != null) return;
  unfocus(); S.spinT = 0; S.spinBase = me.rotation.y; S.spinSwap = false; burst(me.position.clone().setY(0.8));
});

// ───────── START: メニュー ─────────
const menuBtns = [...menuEl.querySelectorAll('button')]; let menuSel = 0;
function openMenu() { if (mg.on || S.busy || S.get) return; unfocus(); S.menu = true; menuEl.classList.add('on');
  menuBtns[1].disabled = S.mode !== 'room' || S.owner !== 'me'; menuBtns[1].textContent = S.edit ? 'かざりかえをおわる' : (S.mode === 'room' && S.owner === 'me' ? 'グッズをかざりかえる' : 'かざりかえ（自分の部屋で）'); menuSel = 0; markMenu(); }
function closeMenu() { S.menu = false; menuEl.classList.remove('on'); }
function markMenu() { menuBtns.forEach((b, i) => b.classList.toggle('sel', i === menuSel)); }
function menuDo(k) {
  closeMenu();
  if (k === 'shot') S.shot = true;
  if (k === 'move') S.edit ? endEdit() : startEdit();
  if (k === 'lib') openLib();
  if (k === 'matome') toMatome();
}
menuBtns.forEach((b, i) => b.addEventListener('click', () => { if (!b.disabled) menuDo(b.dataset.k); }));
$('bStart').addEventListener('click', () => { if (S.power !== 'on') return; if (mg.on) return mgB(); if ($('stk').classList.contains('on')) return; if ($('lib').classList.contains('on')) return closeLib(); S.menu ? closeMenu() : openMenu(); });

// ───────── ステッカーをつくる（12×12 のドット絵を描いて本体にはる） ─────────
const libEl = $('lib'), stkEl = $('stk'), stkC = $('stkC'), stkG = stkC.getContext('2d'); const stkPix = Array(144).fill(-1); let stkCol = 7, stkDown = false;
stkC.width = stkC.height = 12 * 17;
function drawStk() {
  const c = 17; stkG.clearRect(0, 0, stkC.width, stkC.height);
  for (let i = 0; i < 144; i++) { const x = i % 12, y = (i / 12) | 0; stkG.fillStyle = stkPix[i] >= 0 ? PAL[stkPix[i]] : ((x + y) & 1 ? '#f4f1fa' : '#ffffff'); stkG.fillRect(x * c, y * c, c, c); }
  stkG.fillStyle = 'rgba(61,53,82,.12)'; for (let i = 1; i < 12; i++) { stkG.fillRect(i * c, 0, 1, stkC.height); stkG.fillRect(0, i * c, stkC.width, 1); }
}
const palEl = $('pal');
palEl.innerHTML = PAL.map((c, i) => `<button data-i="${i}" style="background:${c}" aria-label="色 ${i + 1}"></button>`).join('') + '<button data-i="-1" class="er" aria-label="けしゴム"></button>';
const markPal = () => palEl.querySelectorAll('button').forEach((b) => b.classList.toggle('sel', +b.dataset.i === stkCol));
palEl.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; stkCol = +b.dataset.i; markPal(); });
function stkPaint(e) { const r = stkC.getBoundingClientRect(), x = Math.floor((e.clientX - r.left) / r.width * 12), y = Math.floor((e.clientY - r.top) / r.height * 12); if (x < 0 || y < 0 || x > 11 || y > 11) return; stkPix[y * 12 + x] = stkCol; drawStk(); }
stkC.addEventListener('pointerdown', (e) => { e.preventDefault(); stkC.setPointerCapture(e.pointerId); stkDown = true; stkPaint(e); });
stkC.addEventListener('pointermove', (e) => { if (stkDown) stkPaint(e); });
stkC.addEventListener('pointerup', () => { stkDown = false; });
function openStk() { S.busy = true; trashEl.classList.remove('on'); S.libBack = libEl.classList.contains('on'); libEl.classList.remove('on'); stkPix.fill(-1); markPal(); drawStk(); stkEl.classList.add('on'); promptEl.classList.remove('on'); }
function closeStk() { if (!stkEl.classList.contains('on')) return; stkEl.classList.remove('on'); if (S.libBack) { S.libBack = false; libEl.classList.add('on'); trashEl.classList.add('on'); } else S.busy = false; }
$('stkNo').onclick = closeStk;
$('stkOk').onclick = () => {
  if (stkPix.every((v) => v < 0)) { toast('なにも描いていない'); return; }
  const id = 's' + Date.now(); myStk.push({ id, pix: stkPix.map((v) => v < 0 ? '.' : String(v)).join('') });
  addPlaced(id); saveStk(); closeStk(); renderStickers(); if ($('lib').classList.contains('on')) renderLib();
  toast('貼った');
};

// ───────── マイステッカー: 本体へドラッグして貼る・貼ったものも動かせる・ゴミ箱ではがす ─────────
const stksEl = $('stks'), ghost = $('ghost'), trashEl = $('trash'), libL = $('libL');
const stkCache = {};
const stkCv = (id, cell) => { const s = myStk.find((m) => m.id === id); if (!s) return null; return stkCache[id + ':' + cell] ||= stickerCanvas(s.pix, cell); };
{ const g = trashEl.querySelector('canvas').getContext('2d'); const P = ['....0000......', '.00000000000..', '.0111111111 0.', '..0101010100..', '..0101010100..', '..0101010100..', '..0101010100..', '..0101010100..', '..0101010100..', '..0101010100..', '..0101010100..', '..0111111110..', '...00000000...'];
  P.forEach((r, y) => [...r].forEach((ch, x) => { if (ch === '0') px(g, x, y + 1, '#1d1a29'); if (ch === '1') px(g, x, y + 1, '#c9c3d6'); })); }
function renderStickers() {
  if (!L.cw) return; stksEl.innerHTML = '';
  placedStk.forEach((p, i) => { const src = stkCv(p.id, Math.round(PX * DPR)); if (!src) return;
    const c = document.createElement('canvas'); c.width = src.width; c.height = src.height; c.getContext('2d').drawImage(src, 0, 0);
    const sz = src.width / DPR; Object.assign(c.style, { width: sz + 'px', height: sz + 'px', left: p.x * L.cw - sz / 2 + 'px', top: p.y * L.ch - sz / 2 + 'px', transform: `rotate(${p.r}rad)` });
    c.dataset.i = i; stksEl.appendChild(c); });
}
const FREE = [[0.5, 0.77], [0.16, 0.95], [0.3, 0.05], [0.82, 0.87], [0.5, 0.69], [0.08, 0.6], [0.93, 0.62], [0.66, 0.05]];
function addPlaced(id, x, y) {
  if (x == null) { const f = FREE.find(([a, b]) => !placedStk.some((p) => Math.hypot(p.x - a, (p.y - b) * 2) < 0.08)) || FREE[Math.floor(Math.random() * FREE.length)]; [x, y] = f; }
  placedStk.push({ id, x, y, r: (Math.random() - 0.5) * 0.6 }); if (placedStk.length > 10) placedStk.shift();
}
function renderLib() {
  libL.innerHTML = myStk.map((s) => `<button data-id="${s.id}" aria-label="ステッカー"></button>`).join('') + '<button class="add" id="libAdd">＋<br>つくる</button>';
  libL.querySelectorAll('button[data-id]').forEach((b) => { const src = stkCv(b.dataset.id, 6), c = document.createElement('canvas'); c.width = src.width; c.height = src.height; c.getContext('2d').drawImage(src, 0, 0); b.appendChild(c); });
  $('libAdd').onclick = openStk;
}
function openLib() { tutHit('stk'); S.busy = true; unfocus(); promptEl.classList.remove('on'); renderLib(); libEl.classList.add('on'); trashEl.classList.add('on'); }
function closeLib() { libEl.classList.remove('on'); trashEl.classList.remove('on'); S.busy = false; }
$('libEnd').onclick = closeLib;
let drag = null;
const inRect = (e, r, m = 0) => e.clientX >= r.left - m && e.clientX <= r.right + m && e.clientY >= r.top - m && e.clientY <= r.bottom + m;
function onBody(e) {
  const cr = consoleEl.getBoundingClientRect(), sr = screenEl.getBoundingClientRect();
  if (!inRect(e, { left: cr.left + 10, right: cr.right - 10, top: cr.top + L.BT + 10, bottom: cr.bottom - 10 })) return null;
  if (inRect(e, { left: sr.left - 12, right: sr.right + 12, top: sr.top - 30, bottom: sr.bottom + 12 })) return null;
  return [(e.clientX - cr.left) / cr.width, (e.clientY - cr.top) / cr.height];
}
function dragStart(e, kind, id, idx) {
  if (S.power !== 'on' || drag) return; e.preventDefault(); e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId);
  const src = stkCv(id, 6); ghost.width = src.width; ghost.height = src.height; ghost.getContext('2d').drawImage(src, 0, 0);
  drag = { kind, id, idx, el: e.currentTarget, sx: e.clientX, sy: e.clientY, moved: false, pid: e.pointerId };
}
function dragMove(e) {
  if (!drag || e.pointerId !== drag.pid) return;
  if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 6) { drag.moved = true; ghost.style.display = 'block'; trashEl.classList.add('on'); if (drag.kind === 'placed') drag.el.classList.add('away'); }
  if (!drag.moved) return;
  const pr = phone.getBoundingClientRect(); Object.assign(ghost.style, { left: e.clientX - pr.left - 28 + 'px', top: e.clientY - pr.top - 40 + 'px', transform: `rotate(${Math.sin(performance.now() / 120) * 0.08}rad)` });
  trashEl.classList.toggle('hot', inRect(e, trashEl.getBoundingClientRect(), 14));
}
function dragEnd(e) {
  if (!drag || e.pointerId !== drag.pid) return; const d = drag; drag = null; ghost.style.display = 'none';
  const toTrash = d.moved && inRect(e, trashEl.getBoundingClientRect(), 14); trashEl.classList.remove('hot');
  if (!libEl.classList.contains('on')) trashEl.classList.remove('on');
  if (d.kind === 'placed') {
    if (!d.moved) { placedStk[d.idx].r += 0.35; }
    else if (toTrash) { placedStk.splice(d.idx, 1); toast('はがした'); }
    else { const b = onBody(e); if (b) { placedStk[d.idx].x = b[0]; placedStk[d.idx].y = b[1]; tutHit('stk'); } }
  } else {
    if (!d.moved) addPlaced(d.id);
    else if (toTrash) { myStk = myStk.filter((m) => m.id !== d.id); placedStk = placedStk.filter((p) => p.id !== d.id); renderLib(); toast('消した'); }
    else { const b = onBody(e); if (b) addPlaced(d.id, b[0], b[1]); }
  }
  saveStk(); renderStickers();
}
stksEl.addEventListener('pointerdown', (e) => { const c = e.target.closest('canvas'); if (!c) return; const i = +c.dataset.i; dragStart({ ...e, preventDefault: () => e.preventDefault(), stopPropagation: () => e.stopPropagation(), currentTarget: c, clientX: e.clientX, clientY: e.clientY, pointerId: e.pointerId }, 'placed', placedStk[i].id, i); });
libL.addEventListener('pointerdown', (e) => { const b = e.target.closest('button[data-id]'); if (!b) return; dragStart({ preventDefault: () => e.preventDefault(), stopPropagation: () => e.stopPropagation(), currentTarget: b, clientX: e.clientX, clientY: e.clientY, pointerId: e.pointerId }, 'lib', b.dataset.id); });
onWin('pointermove', dragMove); onWin('pointerup', dragEnd); onWin('pointercancel', dragEnd);

// ───────── 十字ボタン・A・L/R ─────────
const dp = $('dpad'); let dpId = null;
function dpSet(ev) {
  const r = dp.getBoundingClientRect(), dx = ev.clientX - (r.left + r.width / 2), dy = ev.clientY - (r.top + r.height / 2);
  if (Math.hypot(dx, dy) < r.width * 0.09) { joy.x = joy.y = 0; drawDpad(''); return; }
  const a = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * Math.PI / 4;
  const x = Math.round(Math.cos(a)), y = Math.round(Math.sin(a));
  if (S.menu) { if (dpadDir === '' && y) { menuSel = (menuSel + y + menuBtns.length) % menuBtns.length; if (menuBtns[menuSel].disabled) menuSel = (menuSel + y + menuBtns.length) % menuBtns.length; markMenu(); } drawDpad(y < 0 ? 'u' : y > 0 ? 'd' : x < 0 ? 'l' : 'r'); return; }
  joy.x = x; joy.y = y;
  drawDpad((y < 0 ? 'u' : y > 0 ? 'd' : '') + (x < 0 ? 'l' : x > 0 ? 'r' : ''));
}
dp.addEventListener('pointerdown', (e) => { if (S.power !== 'on') return; e.preventDefault(); dp.setPointerCapture(e.pointerId); dpId = e.pointerId; dpSet(e); });
dp.addEventListener('pointermove', (e) => { if (e.pointerId === dpId) dpSet(e); });
const dpEnd = (e) => { if (e.pointerId !== dpId) return; dpId = null; joy.x = joy.y = 0; drawDpad(''); };
dp.addEventListener('pointerup', dpEnd); dp.addEventListener('pointercancel', dpEnd);
[['bL', 1], ['bR', -1]].forEach(([id, d]) => { const b = $(id);
  b.addEventListener('pointerdown', (e) => { if (S.power !== 'on') return; e.preventDefault(); b.setPointerCapture(e.pointerId); S.turn = d; });
  ['pointerup', 'pointercancel'].forEach((ev) => b.addEventListener(ev, () => { S.turn = 0; })); });
function pressA() {
  if (S.power !== 'on') return;
  if (S.menu) { if (!menuBtns[menuSel].disabled) menuDo(menuBtns[menuSel].dataset.k); return; }
  if (mg.on) return mgA();
  if (talkS) return nextTalk();
  if (tutEl.classList.contains('on')) { tutNext(); return; }
  if (S.get) return endGet();
  if (S.busy) return;
  if (card.classList.contains('on')) return unfocus();
  if (S.near) S.near.act();
}
$('bA').addEventListener('pointerdown', (e) => { e.preventDefault(); buzz(); pressA(); });
onWin('keydown', (e) => {
  const k = e.key.toLowerCase(); keys[k] = true;
  if (S.power !== 'on') return;
  if (k === 'z' || k === 'enter' || k === ' ') { e.preventDefault(); pressA(); }
  if (k === 'escape') { if (S.menu) closeMenu(); else if (S.get) endGet(); else if (S.edit) endEdit(); }
  if (k === 'q') S.turn = 1; if (k === 'e') S.turn = -1;
  if (S.menu && (k === 'arrowdown' || k === 'arrowup')) { e.preventDefault(); menuSel = (menuSel + (k === 'arrowdown' ? 1 : -1) + menuBtns.length) % menuBtns.length; markMenu(); }
});
onWin('keyup', (e) => { const k = e.key.toLowerCase(); keys[k] = false; if (k === 'q' || k === 'e') S.turn = 0; });

// ───────── 画面: なぞる＝見回す、押す＝見る・行く ─────────
const el = renderer.domElement, touches = new Map();
el.addEventListener('pointerdown', (ev) => {
  if (S.power !== 'on' || S.busy || S.menu) return;
  el.setPointerCapture(ev.pointerId);
  touches.set(ev.pointerId, { sx: ev.clientX, sy: ev.clientY, yaw: S.yaw, pitch: S.pitch, moved: false, t0: performance.now() });
});
el.addEventListener('pointermove', (ev) => {
  const t = touches.get(ev.pointerId); if (!t || S.get) return;
  const dx = ev.clientX - t.sx, dy = ev.clientY - t.sy;
  if (!t.moved && Math.hypot(dx, dy) > 14) { t.moved = true; t.sx = ev.clientX; t.sy = ev.clientY; unfocus(); return; }
  if (t.moved) { S.yaw = t.yaw - dx * 0.009; S.pitch = THREE.MathUtils.clamp(t.pitch + dy * 0.006, 0.12, 1.15); }
});
const endTouch = (ev) => { const t = touches.get(ev.pointerId); touches.delete(ev.pointerId); if (!t) return; if (!t.moved && performance.now() - t.t0 < 600) tap(ev); };
el.addEventListener('pointerup', endTouch); el.addEventListener('pointercancel', (ev) => touches.delete(ev.pointerId));

// 線（アクスタの縁・ケースの枠）は当たりに入れない。three.js の線は、光線から 1 の距離まで当たった扱いになり、
// となりの棚のアクスタが選ばれていた（2026-11-27 柴野「全然違うグッズを選んでしまう」）
const ray = new THREE.Raycaster(); ray.layers.enableAll(); ray.params.Line.threshold = 0;
const ndc = new THREE.Vector2();
function setRay(ev) { const r = el.getBoundingClientRect(); ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1); ray.setFromCamera(ndc, camera); }
const visible = (o) => { if (!o.parent) return false; let p = o; while (p) { if (!p.visible) return false; p = p.parent; } return true; };
const tmpBox = new THREE.Box3(), tmpV = new THREE.Vector3();
// 当たらなくても、押した点から 44px 以内でいちばん近いグッズを選ぶ（小さい・薄い物でも押せる）
function pick(ev, list = pickables.filter(visible)) {
  if (S.mode !== 'room') return null; setRay(ev);
  const hit = ray.intersectObjects(list, true)[0];
  if (hit) return hit.object.userData;
  const r = el.getBoundingClientRect(), mx = ev.clientX - r.left, my = ev.clientY - r.top; let best = null, bd = 22;
  for (const o of list) { tmpBox.setFromObject(o).getCenter(tmpV).project(camera); if (tmpV.z > 1) continue; const sx = (tmpV.x + 1) / 2 * r.width, sy = (1 - tmpV.y) / 2 * r.height, d = Math.hypot(sx - mx, sy - my); if (d < bd) { bd = d; best = o.userData; } }
  return best;
}
function tap(ev) {
  if (mg.on) return;
  if (talkS) { nextTalk(); return; }
  if (S.get) { endGet(); return; }
  if (S.edit) { editTap(ev); return; }
  if (S.mode === 'room') { const gd = pick(ev); if (gd) { if (gd.prop) return toMatome(); if (gd.npc) return talk(gd); if (S.aim === gd) return getItem(gd); return aimAt(gd); } aimAt(null); unfocus(); setRay(ev); return walkHere(ray.intersectObject(floor, false)[0]?.point); }
  setRay(ev); const hit = ray.intersectObjects([...acts.map((a) => a.mesh), ...npcs.map((n) => n.g)], true)[0];
  const n = hit?.object.userData.npc; if (n) { if (me.position.distanceTo(n.g.position) < 1.6) talkTo(n); else { S.walkTo = n.g.position.clone().lerp(me.position, 0.25); S.pending = { act: () => talkTo(n) }; } return; }
  const a = hit?.object.userData.act; if (a) { if (Math.hypot(me.position.x - a.x, me.position.z - a.z) < a.r) a.act(); else { S.walkTo = a.stand.clone(); S.pending = a; } return; }
  walkHere(ray.intersectObjects(walkables, false)[0]?.point);
}
// 押した所へ歩く（床・道）
const walkMark = new THREE.Mesh(new THREE.RingGeometry(0.12, 0.2, 10), new THREE.MeshBasicMaterial({ color: '#ffc94a', transparent: true, depthTest: false })); walkMark.rotation.x = -Math.PI / 2; walkMark.visible = false; scene.add(walkMark); crisp(walkMark);
function walkHere(p) { if (!p) return; S.walkTo = new THREE.Vector3(p.x, 0, p.z); S.pending = null; S.stuck = 0; walkMark.position.set(p.x, 0.03, p.z); walkMark.visible = true; walkMark.userData.t = 0; }
const buzz = () => { try { navigator.vibrate?.(8); } catch { /* なし */ } };
function talk(d) { $('cImg').src = d.img; $('cT').textContent = d.title; $('cS').textContent = d.sub || ''; card.classList.add('on'); }
function unfocus() { card.classList.remove('on'); }

// ───────── 印（カーソル）: 押したグッズの上に小さな矢印。もう 1 回押すか A で手に取る ─────────
const curEl = $('cur');
{ const g = curEl.getContext('2d'); const P = ['0...........', '00..........', '010.........', '0110........', '01110.......', '011110......', '0111110.....', '01111110....', '011111110...', '0111111110..', '01111100000.', '0110110.....', '010.0110....', '00..0110....', '0....0110...', '.....0110...', '......00....'];
  P.forEach((r, y) => [...r].forEach((ch, x) => { if (ch !== '.') px(g, x, y, ch === '0' ? '#1d1a29' : '#ffffff'); })); }
function aimAt(gd) { S.aim = gd || null; if (!gd) curEl.classList.remove('on'); }
function stepCursor(t) {
  const gd = S.aim; if (!gd || !gd.obj || !visible(gd.obj) || S.get || S.edit || S.mode !== 'room') { curEl.classList.remove('on'); if (S.aim && (S.mode !== 'room' || S.get)) S.aim = null; return; }
  // 矢印の先（絵の左上）が、グッズの上の方（高さの 6 割）を指す。浮かせすぎると、どれを指しているか分からない
  tmpBox.setFromObject(gd.obj); tmpV.set((tmpBox.min.x + tmpBox.max.x) / 2, tmpBox.min.y + (tmpBox.max.y - tmpBox.min.y) * 0.6, (tmpBox.min.z + tmpBox.max.z) / 2).project(camera);
  const r = el.getBoundingClientRect(), x = (tmpV.x + 1) / 2 * r.width, y = (1 - tmpV.y) / 2 * r.height;
  curEl.style.transform = `translate(${Math.round(x)}px, ${Math.round(y - Math.abs(Math.sin(t * 4)) * 3)}px)`; curEl.classList.add('on');
}
// ───────── グッズを掲げる（重要なアイテムを手に入れたときのように） ─────────
let actx;
function fanfare() {
  try { actx ||= new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === 'suspended') actx.resume(); const t0 = actx.currentTime + 0.03;
    [[392, 0, .1, 'square'], [523.25, .1, .1, 'square'], [659.25, .2, .1, 'square'], [880, .3, .1, 'square'], [783.99, .42, .7, 'square'], [523.25, .42, .7, 'triangle'], [659.25, .42, .7, 'triangle']].forEach(([f, s, d, type]) => {
      const o = actx.createOscillator(), g = actx.createGain(); o.type = type; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t0 + s); g.gain.exponentialRampToValueAtTime(type === 'square' ? 0.035 : 0.06, t0 + s + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t0 + s + d);
      o.connect(g).connect(actx.destination); o.start(t0 + s); o.stop(t0 + s + d + 0.05); });
  } catch { /* 音が出せない端末 */ }
}
const getEl = $('get'), GET_H = 0.82;
function getItem(gd) {
  if (S.get || S.busy || !gd.obj || S.spinT != null) return;
  tutHit('get');
  unfocus(); joy.x = joy.y = 0; S.walkTo = null; S.pending = null; promptEl.classList.remove('on');
  const o = gd.obj; scene.attach(o); setLayer(o, HELD);
  const toCam = camera.position.clone().sub(me.position), base = Math.atan2(toCam.x, toCam.z);
  const camOK = (f) => { const from = me.position.clone().setY(1.3), pos = me.position.clone().add(new THREE.Vector3(Math.sin(f) * 3.4, 2.45, Math.cos(f) * 3.4)), dir = pos.sub(from), len = dir.length();
    camRay.set(from, dir.normalize()); camRay.far = len; return !camRay.intersectObjects(S.mode === 'room' ? roomCol : colliders, true).length; };
  let face = base; for (const off of [0, 0.5, -0.5, 1.0, -1.0, 1.6, -1.6, 2.3, -2.3, Math.PI]) if (camOK(base + off)) { face = base + off; break; }
  S.get = { gd, t: 0, phase: 'in', face, p0: o.position.clone(), q0: o.quaternion.clone(), s0: o.scale.x, up: HANG.includes(gd.kind) ? gd.h * 0.5 : 0 };
  fx.visible = true; fanfare();
  $('gT').textContent = gd.title; $('gS').textContent = gd.sub || '';
  setTimeout(() => { if (S.get?.gd === gd && S.get.phase === 'in') getEl.classList.add('on'); }, 750);
}
function endGet(now) {
  const G = S.get; if (!G || G.phase === 'out') return; getEl.classList.remove('on');
  const o = G.gd.obj, cur = { p: o.position.clone(), q: o.quaternion.clone(), s: o.scale.x };
  placeGoods(G.gd); o.updateMatrixWorld(true);
  const tp = o.getWorldPosition(new THREE.Vector3()), tq = o.getWorldQuaternion(new THREE.Quaternion()), ts = o.getWorldScale(new THREE.Vector3()).x;
  scene.attach(o); o.position.copy(cur.p); o.quaternion.copy(cur.q); o.scale.setScalar(cur.s);
  Object.assign(G, { phase: 'out', t: 0, from: cur, tp, tq, ts });
  if (now) G.t = 1;
}
function stepGet(dt, t) {
  const G = S.get, o = G.gd.obj; G.t += dt;
  const dir = new THREE.Vector3(Math.sin(G.face), 0, Math.cos(G.face));
  const top = me.position.clone().add(new THREE.Vector3(0, 1.6 + G.up * (GET_H / G.gd.h), 0));
  if (G.phase === 'in') {
    const k = Math.min(1, G.t / 0.7), e = 1 - (1 - k) ** 3;
    let dr = G.face - me.rotation.y; dr = Math.atan2(Math.sin(dr), Math.cos(dr)); me.rotation.y += dr * Math.min(1, dt * 10);
    o.position.lerpVectors(G.p0, top, e).y += Math.sin(k * Math.PI) * 0.5;
    o.scale.setScalar(THREE.MathUtils.lerp(G.s0, GET_H / G.gd.h, e));
    const spin = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, G.face + Math.max(0, G.t - 0.7) * 1.5, 0));
    if (k < 1) o.quaternion.slerpQuaternions(G.q0, spin, e); else o.quaternion.copy(spin);
    o.position.y += k >= 1 ? Math.sin(t * 2.2) * 0.03 : 0;
    const a = Math.min(1, G.t / 0.35);
    arms[0].rotation.set(-0.15 * a, 0, (Math.PI - 0.38) * a); arms[1].rotation.set(-0.15 * a, 0, -(Math.PI - 0.38) * a);
    head.rotation.set(-0.22 * a, 0, 0); legs[0].rotation.x = legs[1].rotation.x = 0;
    me.position.y = k < 1 ? Math.sin(k * Math.PI) * 0.06 : 0;
    dimU.uDim.value = Math.min(1, dimU.uDim.value + dt * 3);
  } else {
    const k = Math.min(1, G.t / 0.45), e = k * k * (3 - 2 * k);
    o.position.lerpVectors(G.from.p, G.tp, e); o.quaternion.slerpQuaternions(G.from.q, G.tq, e); o.scale.setScalar(THREE.MathUtils.lerp(G.from.s, G.ts, e));
    arms[0].rotation.z *= 0.8; arms[1].rotation.z *= 0.8; head.rotation.x *= 0.8;
    dimU.uDim.value = Math.max(0, dimU.uDim.value - dt * 3.5);
    if (k >= 1) { placeGoods(G.gd); setLayer(o, CRISP); S.get = null; fx.visible = false; dimU.uDim.value = 0; return; }
  }
  // カメラ: 正面の少し上から
  camGoal.pos.copy(me.position).addScaledVector(dir, 3.4).add(new THREE.Vector3(0, 2.45, 0));
  camGoal.look.set(me.position.x, 1.0, me.position.z);
  // スポットライト・光の筋・きらきら
  cone.position.set(me.position.x, 1.7, me.position.z); pool.position.set(me.position.x, 0.02, me.position.z);
  const fade = G.phase === 'in' ? Math.min(1, G.t / 0.4) : Math.max(0, 1 - G.t / 0.35);
  cone.material.opacity = 0.3 * fade; pool.material.opacity = 0.7 * fade;
  const gc = o.getWorldPosition(new THREE.Vector3()); gc.y += (HANG.includes(G.gd.kind) ? 0 : GET_H * 0.5);
  rays.position.copy(gc).addScaledVector(camera.getWorldDirection(new THREE.Vector3()), 0.35);
  rays.scale.setScalar(1.45 * fade * (1 + Math.sin(t * 3) * 0.04)); rays.material.rotation = t * 0.35; rays.material.opacity = 0.4 * fade;
  sparks.forEach((s, i) => { const a = t * 1.1 + i / sparks.length * Math.PI * 2, r = 0.55 + Math.sin(t * 2 + i) * 0.08; s.position.set(gc.x + Math.cos(a) * r, gc.y + Math.sin(t * 3 + i * 2) * 0.3, gc.z + Math.sin(a) * r);
    s.scale.setScalar(0.09 * fade * (0.6 + 0.4 * Math.abs(Math.sin(t * 5 + i)))); });
  const sp = me.position.clone().setY(1.25).project(camera); dimU.uC.value.set((sp.x + 1) / 2, (sp.y + 1) / 2);
}
$('gBack').onclick = () => endGet();
$('gShot').onclick = () => { S.shot = true; };
// きらっ: ときどき飾ってあるグッズの上が光る（押せると分かる）
const hintS = { t: 0, next: 2.2 };
function stepHint(dt) {
  hintS.t += dt;
  if (S.mode !== 'room' || S.get || S.edit) { hint.scale.setScalar(0.001); return; }
  if (hintS.t > hintS.next) { const list = pickables.filter((o) => visible(o) && !o.userData.npc); const o = list[Math.floor(Math.random() * list.length)];
    if (o) { tmpBox.setFromObject(o); hint.position.set(tmpBox.max.x - 0.04, tmpBox.max.y + 0.02, (tmpBox.min.z + tmpBox.max.z) / 2); } hintS.t = 0; hintS.next = 1.6 + Math.random() * 1.6; }
  const k = hintS.t / 0.6; hint.scale.setScalar(k < 1 ? 0.13 * Math.sin(k * Math.PI) : 0.001); hint.material.rotation = hintS.t * 2;
}
// 着がえるときのぽんっ
const puffs = [];
function burst(p) { for (let i = 0; i < 8; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: starTex, ...add })); s.position.copy(p); crisp(s); scene.add(s); const a = i / 8 * Math.PI * 2; puffs.push({ s, v: new THREE.Vector3(Math.cos(a), 0.6 + Math.random() * 0.6, Math.sin(a)).multiplyScalar(1.4), t: 0 }); } }
function stepPuffs(dt) { for (let i = puffs.length - 1; i >= 0; i--) { const p = puffs[i]; p.t += dt; p.s.position.addScaledVector(p.v, dt); p.v.multiplyScalar(0.9); p.s.scale.setScalar(0.12 * Math.max(0, 1 - p.t / 0.6)); if (p.t > 0.6) { scene.remove(p.s); puffs.splice(i, 1); } } }

// ───────── かざりかえ: 選んで → 置き場所を押す（入れかえ・しまう） ─────────
const tray = $('tray'), trayL = $('trayL'), trayT = $('trayT');
function startEdit() { if (S.mode !== 'room' || S.owner !== 'me') return; tutHit('edit'); S.edit = true; S.sel = null; tray.classList.add('on'); promptEl.classList.remove('on'); renderTray(); }
function endEdit() { if (!S.edit) return; S.edit = false; select(null); tray.classList.remove('on'); markers.forEach((m) => { m.visible = false; }); }
function select(gd) { S.sel = gd; pointer.visible = !!(gd && gd.slot); renderTray(); }
function renderTray() {
  const stored = OWN.me.goods.filter((g) => !g.slot && g.obj);
  trayT.textContent = S.sel ? '置く場所を押す' : '動かすグッズを押す';
  trayL.innerHTML = stored.length ? stored.map((g) => `<button data-i="${OWN.me.goods.indexOf(g)}" class="${S.sel === g ? 'sel' : ''}">${g.img ? `<img src="${g.img}" alt="">` : `<span style="display:block;width:100%;height:100%;background:linear-gradient(90deg,${g.col} 0 30%,#fff 30% 70%,${g.col} 70%)"></span>`}</button>`).join('') : '<em>しまってあるグッズはない</em>';
  $('trayPut').disabled = !(S.sel && S.sel.slot);
}
trayL.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; const gd = OWN.me.goods[+b.dataset.i]; select(S.sel === gd ? null : gd); });
$('trayPut').onclick = () => { if (!S.sel?.slot) return; S.sel.slot = null; placeGoods(S.sel); saveRoom(); select(null); };
$('trayEnd').onclick = endEdit;
function moveTo(gd, slotId) {
  if (!fits(gd, slotId)) { trayT.textContent = HANG.includes(gd.kind) ? 'これは壁にかけるグッズです' : SLOTS[slotId].type === 'peg' ? 'ボードには缶バッジをかける' : 'これは棚に置くグッズです'; return; }
  const other = OWN.me.goods.find((o) => o !== gd && o.slot === slotId), prev = gd.slot;
  if (other) { other.slot = prev && fits(other, prev) ? prev : null; placeGoods(other); }
  gd.slot = slotId; placeGoods(gd); saveRoom(); select(null);
  gd.obj.scale.multiplyScalar(1.12); setTimeout(() => placeGoods(gd), 140);
}
function editTap(ev) {
  setRay(ev);
  const mk = ray.intersectObjects(markers.filter(visible), false)[0];
  const gd = pick(ev, pickables.filter((o) => visible(o) && o.userData.owner?.id === 'me'));
  if (S.sel && gd && gd !== S.sel && gd.slot) return moveTo(S.sel, gd.slot);
  if (S.sel && mk) return moveTo(S.sel, mk.object.userData.slot);
  if (gd) return select(S.sel === gd ? null : gd);
  select(null);
}

// ───────── スクショ ─────────
let shotBlob = null;
function makeShot(src) {
  tutHit('shot');
  const W = 1080, H = 1350, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
  g.fillStyle = CON.body; g.fillRect(0, 0, W, H);
  g.fillStyle = CON.speck; for (let i = 0; i < 900; i++) g.fillRect(Math.random() * W | 0, Math.random() * H | 0, 6, 6);
  // 画面のふち
  const asp = src.width / src.height, shh = 940, sw = Math.min(W - 168, Math.round(shh * asp)), sx = Math.round((W - sw) / 2), sy = 112;
  g.fillStyle = CON.bezel; g.beginPath(); g.roundRect(sx - 40, 44, sw + 80, 1040, [12, 12, 60, 12]); g.fill();
  const lab = document.createElement('canvas'); lab.width = 60; lab.height = 7; ptext(lab.getContext('2d'), 'DOT POCKET', 1, 1, CON.bezelTxt);
  g.imageSmoothingEnabled = false; g.drawImage(lab, W / 2 - 120, 62, 240, 28);
  [[CON.stripe[0], 70], [CON.stripe[1], 82]].forEach(([col, y]) => { g.fillStyle = col; g.fillRect(sx, y, W / 2 - 140 - sx, 6); g.fillRect(W / 2 + 140, y, sx + sw - W / 2 - 140, 6); });
  const kk = Math.max(sw / src.width, shh / src.height), dw = src.width * kk, dh = src.height * kk;
  g.save(); g.beginPath(); g.rect(sx, sy, sw, shh); g.clip(); g.imageSmoothingEnabled = true; g.drawImage(src, sx + (sw - dw) / 2, sy + (shh - dh) / 2, dw, dh); g.restore();
  // 下: ロゴ・掲げていたグッズの名前・場所と日付（行を分けて重ねない）
  const lg = document.createElement('canvas'); lg.width = 60; lg.height = 7; ptext(lg.getContext('2d'), 'FANHIVE', 1, 1, CON.logo);
  g.imageSmoothingEnabled = false; g.drawImage(lg, 84, 1116, 480, 56);
  const pk = document.createElement('canvas'); pk.width = 30; pk.height = 7; ptext(pk.getContext('2d'), 'POCKET', 1, 1, CON.logo2); g.drawImage(pk, 350, 1130, 180, 42);
  g.fillStyle = CON.edge; g.font = '34px "DotGothic16", monospace'; g.textBaseline = 'top';
  const title = S.get ? S.get.gd.title : (S.mode === 'room' ? (S.owner === 'me' ? 'わたしの部屋' : `${OWN[S.owner].name}さんの部屋`) : 'まち');
  let t = title; while (g.measureText(t).width > W - 420 && t.length > 4) t = t.slice(0, -2) + '…';
  g.fillText(t, 88, 1206);
  const d = new Date(); g.font = '26px "DotGothic16", monospace'; g.fillStyle = '#8a7f99'; g.fillText(`${d.getMonth() + 1}.${d.getDate()}  fanhive.jp`, 88, 1262);
  // 本体に貼ったステッカーも 2 枚まで
  placedStk.slice(-2).forEach((p, i) => { const cv = stkCv(p.id, 9); if (!cv) return; g.save(); g.translate(W - 230 + i * 120, 1215 + (i ? 22 : -8)); g.rotate(p.r); g.drawImage(cv, -cv.width / 2, -cv.height / 2); g.restore(); });
  // 描いた絵はすぐに出す。保存・共有用のファイルは裏で作る（PNG にするのを待つと、スマホでは 1 秒以上かかる）
  const img = $('shotImg'), sh = $('shot'); shotBlob = null; sh.querySelector('canvas.prev')?.remove();
  c.className = 'prev'; img.style.display = 'none'; img.after(c); sh.classList.add('on');
  c.toBlob((b) => { shotBlob = b; img.src = URL.createObjectURL(b); img.onload = () => { img.style.display = ''; c.remove(); }; }, 'image/png');
}
$('shotClose').onclick = () => $('shot').classList.remove('on');
const shotReady = () => new Promise((ok) => { const w = () => shotBlob ? ok(shotBlob) : setTimeout(w, 50); w(); });
$('shotSave').onclick = async () => { const b = await shotReady(); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'fanhive-room.png'; a.click(); };
$('shotShare').onclick = async () => { const b = await shotReady(); if (opts.share) await opts.share(b, 'fanhive-room.png', '#FanHive'); };

// ───────── 部屋 ⇄ 町 ─────────
const fadeEl = $('fade');
let introDone = false;
function setOwner(id) {
  S.owner = id; OWNERS.forEach((o) => { o.group.visible = o.id === id; });
  walls.forEach((w, i) => { w.mesh.material.map = OWN[id].walls[i]; });
}
function goto(mode, opt = {}) {
  S.busy = true; fadeEl.classList.add('on'); unfocus(); closeMenu(); endEdit(); S.walkTo = null; S.pending = null;
  setTimeout(() => {
    S.mode = mode; room.visible = mode === 'room'; town.visible = mode === 'town';
    if (mode === 'town') {
      const o = opt.from && opt.from !== 'me' ? OWN[opt.from] : null;
      const door = o ? o.door : myHouse.doorW, fwd = o ? o.fwd : new THREE.Vector3(0, 0, 1);
      me.position.copy(door).addScaledVector(fwd, 0.75); me.position.y = 0; me.rotation.y = Math.atan2(fwd.x, fwd.z);
      S.yaw = Math.atan2(fwd.x, fwd.z); S.dist = 3.6; S.pitch = 0.5; scene.fog = new THREE.Fog('#efc9a0', 20, 60);
      if (!introDone) { introDone = true; S.intro = 2.2; }
      tutHit('town');
    } else {
      setOwner(opt.owner || 'me');
      me.position.set(0, 0, R - 0.9); me.rotation.y = Math.PI; S.yaw = 0; S.dist = 3.4; S.pitch = 0.42; scene.fog = null;
    }
    S.snap = true; drawHud(); fadeEl.classList.remove('on'); setTimeout(() => { S.busy = false; }, 300);
  }, 380);
}

// ───────── ミニゲーム（ゲームセンターの台で遊ぶ）。どれも A と十字ボタンだけ ─────────
// 走る（コーンをとぶ・はとはくぐる）・いすレース（事務いすで商店街を下る）・自販機ずもう（A を連打して押し出す）・配達（背負った荷物を左右で支えて運ぶ）
// どれも一番の記録を残す（ST.best）。遊ぶたびに少しずつ速く・強くなる
const mgEl = $('mg'), mgC = $('mgC'), mgG = mgC.getContext('2d');
const mg = { on: false, phase: 'title', t: 0, got: 0 };
const MG_INFO = { RUN: ['JUMP OVER CONES', 'A: JUMP'], RACE: ['ROLL DOWN THE STREET', 'LEFT RIGHT: MOVE'], FIGHT: ['PUSH THE MACHINE OUT', 'MASH A'], DELIVERY: ['CARRY THE BOXES 300M', 'LEFT RIGHT: BALANCE'] };
function startMinigame(gm) {
  S.busy = true; joy.x = joy.y = 0; drawDpad('');
  Object.assign(mg, { on: true, game: gm, phase: 'title', t: 0, got: 0, end: '' }); mgInit();
  mgEl.classList.add('on'); promptEl.classList.remove('on');
}
function mgInit() {
  const id = mg.game.id;
  mg.score = 0; mg.newBest = false;
  if (id === 'RUN') Object.assign(mg, { y: 0, vy: 0, jumps: 0, obs: [], coins: [], speed: 82, spawn: 1.0, cspawn: .4, hurt: 0 });
  if (id === 'RACE') Object.assign(mg, { lane: 1, lx: 1, lastX: 0, obs: [], coins: [], speed: 70, spawn: 0.9, cspawn: 0.5, hurt: 0, scroll: 0 });
  if (id === 'FIGHT') Object.assign(mg, { p: 0, push: 0.3, surge: 0.8, mash: 0, shake: 0 });
  if (id === 'DELIVERY') Object.assign(mg, { dist: 0, th: 0, w: 0, boxes: 2, next: 60, gust: 0, gustT: 2, fallT: 0, walk: 0 });
}
function mgA() {
  if (mg.phase === 'title') { if (mg.t > 0.3) { mg.phase = 'play'; mg.t = 0; } return; }
  if (mg.phase === 'result') { if (mg.t > 0.8) endMinigame(); return; }
  const id = mg.game.id;
  if (id === 'RUN' && mg.jumps < 2) { mg.vy = mg.jumps ? -150 : -175; mg.jumps++; }
  if (id === 'FIGHT') { mg.p += 0.042; mg.mash = 0.12; mg.shake = 0.08; }
}
function mgB() { if (mg.phase === 'title') { mg.got = 0; endMinigame(); } else if (mg.phase === 'result') endMinigame(); }
mgC.addEventListener('pointerdown', (e) => { e.preventDefault(); if (S.power === 'on') mgA(); });
function endMinigame() { S.coins += mg.got; mg.on = false; mgEl.classList.remove('on'); S.busy = false; drawHud(true); setTimeout(() => drawHud(), 500); }
const mgDone = (end = 'CLEAR!') => {
  mg.phase = 'result'; mg.t = 0; mg.end = end;
  const id = mg.game.id, sc = id === 'DELIVERY' ? mg.score : mg.got; ST.best = { ...(ST.best || {}) };
  if (sc > (ST.best[id] || 0)) { ST.best[id] = sc; mg.newBest = sc > 0; persist(); }
};
const bestOf = (id) => (ST.best || {})[id] || 0;
const cx96 = (s, sc = 1) => 96 - ptw(s, sc) / 2;
// 小さなはち男（横向き・上から）
function beeSide(g, x, y, f, Bt) {
  g.fillStyle = '#2d2a28'; g.fillRect(x + (f ? 1 : 4), y + 14, 3, 2); g.fillRect(x + (f ? 5 : 2), y + 14, 3, 2);
  g.fillStyle = Bt ? '#b6a8ee' : '#3f4a66'; g.fillRect(x + (Bt ? 1 : 2), y + 10, Bt ? 7 : 5, 4);
  g.fillStyle = Bt ? '#fff6ea' : '#e9e6df'; g.fillRect(x + 1, y + 5, 7, 6); g.fillStyle = '#e8bf9a'; g.fillRect(x + (f ? 0 : 8), y + 7, 1, 3);
  g.fillStyle = '#d9a43a'; g.fillRect(x + 1, y, 7, 6); g.fillStyle = '#1b1712'; g.fillRect(x + 6, y + 1, 2, 3); g.fillRect(x + 3, y - 2, 1, 2); g.fillRect(x + 6, y - 3, 1, 3);
  if (Bt) { g.fillStyle = '#ff6f61'; g.fillRect(x + 1, y - 1, 3, 2); }
}
function hudCoins(g, left) {
  g.fillStyle = 'rgba(20,16,30,.55)'; g.fillRect(3, 3, 44, 9); g.fillStyle = '#f5c518'; g.fillRect(5, 5, 5, 5); ptext(g, 'x' + String(mg.got).padStart(2, '0'), 12, 5, '#fff');
  if (left != null) { g.fillStyle = 'rgba(20,16,30,.55)'; g.fillRect(150, 3, 39, 9); ptext(g, 'T ' + String(Math.ceil(left)).padStart(2, '0'), 153, 5, left < 4 ? '#ff8f8f' : '#fff'); }
}
const GROUND = 118;
function runStep(g, dt) {
  const skyC = ['#f7d7a8', '#f3c38f', '#e9a87a', '#d99a80'];
  for (let i = 0; i < 4; i++) { g.fillStyle = skyC[i]; g.fillRect(0, i * 22, 192, 22); }
  const sp = mg.phase === 'play' ? mg.speed : 20, off = (mg.t * sp * 0.25) % 48;
  g.fillStyle = '#b48c7a'; for (let i = -1; i < 6; i++) { const x = i * 48 - off; g.fillRect(x, 70, 20, 48); g.fillRect(x + 22, 58, 14, 60); g.fillRect(x + 38, 80, 10, 38); }
  g.fillStyle = '#9c7466'; for (let i = -1; i < 6; i++) { const x = i * 48 - off; for (let wy = 64; wy < 110; wy += 8) g.fillRect(x + 26, wy, 2, 3); }
  const off2 = (mg.t * sp * 0.6) % 64; g.fillStyle = '#3a3438';
  for (let i = -1; i < 5; i++) { const x = i * 64 - off2; g.fillRect(x, 40, 2, 78); g.fillRect(x - 5, 44, 12, 1); }
  for (let x = 0; x < 192; x++) { const k = ((x + off2) % 64) / 64; g.fillRect(x, 45 + Math.round(Math.sin(k * Math.PI) * 6), 1, 1); g.fillRect(x, 49 + Math.round(Math.sin(k * Math.PI) * 5), 1, 1); }
  g.fillStyle = '#5a5a60'; g.fillRect(0, GROUND, 192, 26); g.fillStyle = '#e8e2cf';
  const off3 = (mg.t * sp) % 24; for (let i = -1; i < 9; i++) g.fillRect(i * 24 - off3, GROUND + 12, 12, 2);
  g.fillStyle = '#bdb6a8'; g.fillRect(0, GROUND, 192, 3);
  if (mg.phase !== 'play') return;
  mg.speed = 82 + mg.t * 7;
  mg.vy += 520 * dt; mg.y = Math.min(0, mg.y + mg.vy * dt); if (mg.y === 0) { mg.vy = 0; mg.jumps = 0; }
  mg.spawn -= dt; mg.cspawn -= dt;
  if (mg.spawn < 0) { const r = Math.random(); mg.obs.push({ x: 200, k: r < .4 ? 'cone' : r < .75 ? 'sign' : 'bird' }); mg.spawn = Math.max(0.38, 0.8 - mg.t * 0.02) + Math.random() * 0.5; }
  if (mg.cspawn < 0) { const hy = Math.random() < .5 ? 0 : 26 + Math.random() * 18; for (let i = 0; i < 3; i++) mg.coins.push({ x: 200 + i * 10, y: GROUND - 10 - hy }); mg.cspawn = 0.9 + Math.random() * .6; }
  mg.obs.forEach((o) => o.x -= mg.speed * dt); mg.coins.forEach((c) => c.x -= mg.speed * dt);
  const py = GROUND - 16 + mg.y, pxx = 34;
  mg.coins = mg.coins.filter((c) => { if (Math.abs(c.x - (pxx + 4)) < 7 && Math.abs(c.y - (py + 6)) < 10) { mg.got++; return false; } return c.x > -10; });
  mg.obs = mg.obs.filter((o) => { const w = o.k === 'cone' ? 8 : 10, h = o.k === 'cone' ? 10 : 15; const hitY = o.k === 'bird' ? (py < GROUND - 30 && py + 14 > GROUND - 40) : py + 15 > GROUND - h; if (!o.hit && mg.hurt <= 0 && o.x < pxx + 7 && o.x + w > pxx + 1 && hitY) { o.hit = true; mg.hurt = 0.8; mg.got = Math.max(0, mg.got - 3); buzz(); } return o.x > -12; });
  mg.hurt -= dt;
  mg.coins.forEach((c) => { g.fillStyle = '#b37800'; g.fillRect(c.x - 2, c.y - 2, 5, 5); g.fillStyle = '#f5c518'; g.fillRect(c.x - 2, c.y - 2, 4, 4); g.fillStyle = '#fff3a8'; g.fillRect(c.x - 1, c.y - 1, 1, 2); });
  mg.obs.forEach((o) => { if (o.k === 'cone') { g.fillStyle = '#f07c2a'; for (let i = 0; i < 10; i++) g.fillRect(o.x + 4 - (i >> 1) * 0.5, GROUND - 10 + i, 1 + i * 0.8, 1); g.fillStyle = '#fff'; g.fillRect(o.x + 2, GROUND - 5, 5, 1); }
    else if (o.k === 'bird') { const f = Math.floor(mg.t * 8) % 2; g.fillStyle = '#8d8a98'; g.fillRect(o.x + 2, GROUND - 38, 7, 4); g.fillRect(o.x + (f ? 0 : 3), GROUND - (f ? 41 : 35), 5, 2); g.fillStyle = '#e2574c'; g.fillRect(o.x + 1, GROUND - 37, 1, 1); }
    else { g.fillStyle = '#6b6b70'; g.fillRect(o.x + 4, GROUND - 8, 2, 8); g.fillStyle = '#e5484d'; g.fillRect(o.x, GROUND - 15, 10, 8); ptext(g, '!', o.x + 3, GROUND - 14, '#fff'); } });
  if (!(mg.hurt > 0 && Math.floor(mg.t * 20) % 2)) beeSide(g, pxx, py, Math.floor(mg.t * 12) % 2, charId === 'B');
  const left = Math.max(0, 20 - mg.t); hudCoins(g, left);
  if (mg.t < 1.5) ptext(g, 'A: JUMP', cx96('A: JUMP'), 26, '#2a2540');
  if (left <= 0) mgDone();
}
// いすレース: 上から見た商店街。3 本の車線を左右で動く
function raceStep(g, dt) {
  const play = mg.phase === 'play', sp = play ? mg.speed : 25; mg.scroll += sp * dt;
  g.fillStyle = '#cfc6b6'; g.fillRect(0, 0, 192, 144);
  // 両側の店（上から見た屋根とひさし）
  const cols = ['#ff7a6b', '#7cc7ff', '#ffc94a', '#5fcfb0', '#b6a8ee'];
  for (let i = -1; i < 6; i++) { const y = i * 30 + (mg.scroll * 0.9) % 30; [[0, 26], [166, 26]].forEach(([x, w], s) => { g.fillStyle = '#8f877a'; g.fillRect(x, y, w, 28); g.fillStyle = cols[(i + 7 + s * 2 + Math.floor(mg.scroll / 30)) % 5]; g.fillRect(s ? x : x + w - 6, y + 2, 6, 24); g.fillStyle = '#fffaf0'; for (let k = 0; k < 24; k += 4) g.fillRect(s ? x + 1 : x + w - 5, y + 2 + k, 1, 2); }); }
  g.fillStyle = '#6a6670'; g.fillRect(36, 0, 120, 144); g.fillStyle = '#e8e2cf';
  for (let i = -1; i < 10; i++) { const y = i * 16 + (mg.scroll % 16); g.fillRect(75, y, 2, 8); g.fillRect(115, y, 2, 8); }
  const laneX = (l) => 56 + l * 40;
  if (play) {
    const jx = joy.x || (keys['arrowleft'] || keys['a'] ? -1 : keys['arrowright'] || keys['d'] ? 1 : 0);
    if (jx !== mg.lastX && jx !== 0) mg.lane = Math.max(0, Math.min(2, mg.lane + jx)); mg.lastX = jx;
    mg.lx += (mg.lane - mg.lx) * Math.min(1, dt * 14); mg.speed = 82 + mg.t * 9;
    mg.spawn -= dt; mg.cspawn -= dt;
    if (mg.spawn < 0) { const l = Math.floor(Math.random() * 3), two = Math.random() < 0.25 + mg.t * 0.015; [l, ...(two ? [(l + 1 + Math.floor(Math.random() * 2)) % 3] : [])].forEach((ln) => mg.obs.push({ l: ln, y: -16, k: ['cone', 'pigeon', 'cart'][Math.floor(Math.random() * 3)], d: Math.random() < .5 ? -1 : 1, px: 0 })); mg.spawn = Math.max(0.3, 0.75 - mg.t * 0.02) + Math.random() * 0.35; }
    if (mg.cspawn < 0) { const l = Math.floor(Math.random() * 3); for (let i = 0; i < 3; i++) mg.coins.push({ l, y: -10 - i * 12 }); mg.cspawn = 0.8 + Math.random() * 0.5; }
    mg.obs.forEach((o) => { o.y += mg.speed * dt; if (o.k === 'pigeon') { o.px += o.d * dt * 14; if (Math.abs(o.px) > 16) o.d *= -1; } });
    mg.coins.forEach((c) => { c.y += mg.speed * dt; });
    const pxp = laneX(mg.lx);
    mg.coins = mg.coins.filter((c) => { if (Math.abs(laneX(c.l) - pxp) < 10 && Math.abs(c.y - 112) < 9) { mg.got++; return false; } return c.y < 150; });
    mg.obs = mg.obs.filter((o) => { const ox = laneX(o.l) + (o.px || 0); if (!o.hit && mg.hurt <= 0 && Math.abs(ox - pxp) < 12 && Math.abs(o.y - 112) < 11) { o.hit = true; mg.hurt = 0.9; mg.got = Math.max(0, mg.got - 3); buzz(); } return o.y < 160; });
    mg.hurt -= dt;
  }
  mg.coins.forEach((c) => { const x = laneX(c.l); g.fillStyle = '#b37800'; g.fillRect(x - 2, c.y - 2, 5, 5); g.fillStyle = '#f5c518'; g.fillRect(x - 2, c.y - 2, 4, 4); });
  mg.obs.forEach((o) => { const x = laneX(o.l) + (o.px || 0), y = o.y;
    if (o.k === 'cone') { g.fillStyle = '#f07c2a'; g.fillRect(x - 4, y - 4, 9, 9); g.fillStyle = '#fff'; g.fillRect(x - 2, y - 2, 5, 5); g.fillStyle = '#f07c2a'; g.fillRect(x - 1, y - 1, 3, 3); }
    if (o.k === 'pigeon') { g.fillStyle = '#8d8a98'; g.fillRect(x - 3, y - 4, 7, 9); g.fillStyle = '#5fbfa6'; g.fillRect(x - 2, y - 5, 5, 2); g.fillStyle = '#e2574c'; g.fillRect(x, y - 7, 1, 2); }
    if (o.k === 'cart') { g.fillStyle = '#c9c3d6'; g.fillRect(x - 6, y - 8, 13, 15); g.fillStyle = '#6d6280'; for (let k = 0; k < 13; k += 3) g.fillRect(x - 6 + k, y - 8, 1, 15); g.fillStyle = '#ff6f61'; g.fillRect(x - 6, y + 5, 13, 2); } });
  // じぶん（事務いすにすわったはち男を上から）
  const x = laneX(mg.lx), y = 112;
  if (!(mg.hurt > 0 && Math.floor(mg.t * 20) % 2)) {
    g.fillStyle = '#2e2a38'; [[-6, 6], [6, 6], [0, 9], [-5, -2], [5, -2]].forEach(([dx, dy]) => g.fillRect(x + dx - 1, y + dy - 1, 3, 3));
    g.fillStyle = '#4a4458'; g.fillRect(x - 5, y - 1, 11, 9); g.fillStyle = charId === 'B' ? '#fff6ea' : '#e9e6df'; g.fillRect(x - 4, y - 3, 9, 7);
    g.fillStyle = '#d9a43a'; g.fillRect(x - 3, y - 8, 7, 6); g.fillStyle = '#1b1712'; g.fillRect(x - 4, y - 7, 2, 3); g.fillRect(x + 3, y - 7, 2, 3); g.fillRect(x - 2, y - 11, 1, 3); g.fillRect(x + 2, y - 11, 1, 3);
  }
  if (play) { const left = Math.max(0, 25 - mg.t); hudCoins(g, left); if (mg.t < 1.5) ptext(g, 'LEFT RIGHT', cx96('LEFT RIGHT'), 26, '#fff'); if (left <= 0) mgDone(); }
}
// 自販機ずもう: 横から見た土俵。A を連打して、自販機を外へ押し出す
function fightStep(g, dt) {
  const play = mg.phase === 'play';
  const sky = ['#2d2a3a', '#3b3650', '#4d4566']; for (let i = 0; i < 3; i++) { g.fillStyle = sky[i]; g.fillRect(0, i * 30, 192, 30); }
  g.fillStyle = '#ffe7a8'; [[20, 14], [60, 30], [140, 10], [172, 26], [100, 20]].forEach(([x, y]) => g.fillRect(x, y, 1, 1));
  g.fillStyle = '#ff8fc8'; for (let i = 0; i < 6; i++) { g.fillRect(8 + i * 34, 52, 6, 8); g.fillStyle = i % 2 ? '#ff8fc8' : '#ffc94a'; } // ちょうちん
  g.fillStyle = '#c9b48a'; g.fillRect(0, 96, 192, 48); g.fillStyle = '#e8d9b8'; g.fillRect(0, 96, 192, 3);
  g.fillStyle = '#fffaf0'; g.fillRect(24, 104, 2, 30); g.fillRect(166, 104, 2, 30); // 俵
  if (play) {
    mg.surge -= dt; if (mg.surge < 0) { mg.push = 0.3 + Math.random() * 0.45 + mg.t * 0.03; mg.surge = 0.4 + Math.random() * 1.0; }
    mg.p -= mg.push * dt; mg.mash -= dt; mg.shake -= dt;
    if (mg.p >= 1) { mg.got = 10 + Math.max(0, Math.ceil(20 - mg.t)); mgDone('WIN!'); buzz(); }
    else if (mg.p <= -1) { mg.got = 1; mgDone('OUT...'); }
    else if (mg.t > 20) { mg.got = 3; mgDone('DRAW'); }
  }
  const mid = 96 + mg.p * 66, sh = mg.shake > 0 ? (Math.random() - 0.5) * 2 : 0;
  // 自販機
  const vx = mid + 4 + sh; g.fillStyle = '#e2574c'; g.fillRect(vx, 66, 24, 46); g.fillStyle = '#dff4ff'; g.fillRect(vx + 3, 70, 18, 16);
  ['#3498db', '#f1c40f', '#2ecc71', '#e67e22', '#9d8cf0', '#ff9ec4'].forEach((c, i) => { g.fillStyle = c; g.fillRect(vx + 5 + (i % 3) * 5, 72 + Math.floor(i / 3) * 7, 3, 5); });
  g.fillStyle = Math.floor(mg.t * 6) % 2 ? '#ffe14d' : '#8a7a40'; g.fillRect(vx + 18, 90, 2, 2); g.fillStyle = '#222'; g.fillRect(vx + 5, 100, 14, 4);
  if (mg.push > 0.45) ptext(g, '!', vx + 10, 58, '#ffe14d');
  // じぶん（押している）
  const bx = mid - 14 - sh; beeSide(g, bx, 96, mg.mash > 0 ? 1 : 0, charId === 'B'); g.fillStyle = '#e8bf9a'; g.fillRect(bx + 8, 102, 4, 2);
  // 押し具合
  g.fillStyle = 'rgba(20,16,30,.55)'; g.fillRect(46, 18, 100, 7); g.fillStyle = '#5fcfb0'; g.fillRect(96, 19, Math.max(0, mg.p) * 49, 5); g.fillStyle = '#ff6f61'; g.fillRect(96 + Math.min(0, mg.p) * 49, 19, -Math.min(0, mg.p) * 49, 5); g.fillStyle = '#fff'; g.fillRect(95, 17, 1, 9);
  if (play) { hudCoins(g, Math.max(0, 20 - mg.t)); if (mg.t < 1.5) ptext(g, 'MASH A', cx96('MASH A'), 34, '#fff'); }
}
// 配達: 背中に積んだ段ボールを、左右でバランスを取りながら坂道を運ぶ。とちゅうで荷物が増える。300M で届く
const GOAL_M = 300;
const hAt = (x) => 9 * Math.sin(x / 38) + 5 * Math.sin(x / 15 + 1) + 3 * Math.sin(x / 6 + 2) * Math.min(1, x / 80);
function deliveryStep(g, dt) {
  const play = mg.phase === 'play';
  if (play && !mg.fallT) {
    const v = 20 + Math.min(16, mg.dist / 18);
    mg.dist += v * dt; mg.walk += dt * v / 5;
    const slope = (hAt(mg.dist + 2) - hAt(mg.dist - 2)) / 4;
    const jx = joy.x || (keys['arrowleft'] || keys['a'] ? -1 : keys['arrowright'] || keys['d'] ? 1 : 0);
    mg.gustT -= dt; if (mg.gustT < 0) { mg.gust = (Math.random() - 0.5) * (0.9 + mg.dist / 160); mg.gustT = 0.8 + Math.random() * 1.8; }
    const tall = 0.6 + mg.boxes * 0.14;
    mg.w += (Math.sin(mg.th) * 2.6 * tall + slope * 2.4 + mg.gust + jx * 3.2 - mg.w * 1.1) * dt; mg.th += mg.w * dt;
    if (Math.abs(mg.th) > 0.85) { mg.fallT = 0.001; buzz(); }
    if (mg.dist >= mg.next) { mg.boxes++; mg.next += 60; mg.got += 2; }
    if (mg.dist >= GOAL_M) { mg.got += 10 + mg.boxes * 2; mg.score = GOAL_M; mgDone('DELIVERED!'); }
  }
  if (mg.fallT) { mg.fallT += dt; if (mg.fallT > 1.1 && mg.phase === 'play') { mg.got += Math.floor(mg.dist / 30); mg.score = Math.floor(mg.dist); mgDone('DROPPED'); } }
  // 空と遠くの山
  const sky = ['#cfe3f0', '#dbe9f2', '#eef2ea']; for (let i = 0; i < 3; i++) { g.fillStyle = sky[i]; g.fillRect(0, i * 30, 192, 30); }
  g.fillStyle = '#b9c8c0'; for (let x = 0; x < 192; x++) { const y = 62 + Math.sin((x + mg.dist * 0.3) / 22) * 8 + Math.sin((x + mg.dist * 0.3) / 9) * 3; g.fillRect(x, y, 1, 144 - y); }
  // 地面（1 マス＝0.5M）
  const gy = (sx) => Math.round(108 - hAt(mg.dist + (sx - 50) * 0.5) * 1.3);
  for (let x = 0; x < 192; x++) { const y = gy(x); g.fillStyle = '#8fb06a'; g.fillRect(x, y, 1, 2); g.fillStyle = '#7a6a52'; g.fillRect(x, y + 2, 1, 144 - y); if ((x + Math.floor(mg.dist * 2)) % 9 === 0) { g.fillStyle = '#6a5a44'; g.fillRect(x, y + 6, 1, 1); } }
  // 荷物の置き場（拾うと増える）とゴールの旗
  const sxOf = (m) => 50 + (m - mg.dist) * 2;
  const px0 = sxOf(mg.next); if (px0 < 200) { const y = gy(px0); g.fillStyle = '#c9a06a'; g.fillRect(px0 - 3, y - 6, 7, 6); g.fillStyle = '#e8d9b8'; g.fillRect(px0, y - 6, 1, 6); }
  const fx = sxOf(GOAL_M); if (fx < 200) { const y = gy(fx); g.fillStyle = '#4a4458'; g.fillRect(fx, y - 22, 1, 22); g.fillStyle = '#ff6f61'; g.fillRect(fx + 1, y - 22, 8, 5); }
  // じぶんと背中の荷物
  const y0 = gy(50) - 16; beeSide(g, 46, y0, play && !mg.fallT ? Math.floor(mg.walk) % 2 : 0, charId === 'B');
  for (let i = 0; i < mg.boxes; i++) {
    g.save(); g.translate(48, y0 + 8);
    if (mg.fallT) { g.translate(i * mg.fallT * 18 * Math.sign(mg.th || 1), mg.fallT * mg.fallT * 60); g.rotate(mg.th * (1 + i * 0.4) + mg.fallT * 2 * Math.sign(mg.th || 1)); }
    else g.rotate(mg.th);
    g.fillStyle = '#c9a06a'; g.fillRect(-5, -8 - i * 7, 10, 7); g.fillStyle = '#a8814e'; g.fillRect(-5, -2 - i * 7, 10, 1); g.fillStyle = '#e8d9b8'; g.fillRect(-1, -8 - i * 7, 2, 7);
    g.restore();
  }
  if (play) {
    hudCoins(g); g.fillStyle = 'rgba(20,16,30,.55)'; g.fillRect(122, 3, 67, 9); ptext(g, String(Math.floor(mg.dist)).padStart(3, '0') + '/' + GOAL_M + 'M', 124, 5, '#fff');
    const lean = Math.max(-1, Math.min(1, mg.th / 0.85)); g.fillStyle = 'rgba(20,16,30,.55)'; g.fillRect(66, 16, 60, 5); g.fillStyle = Math.abs(lean) > 0.7 ? '#ff6f61' : '#5fcfb0'; g.fillRect(95 + lean * 28, 16, 3, 5);
    if (mg.t < 1.8) ptext(g, 'LEFT RIGHT', cx96('LEFT RIGHT'), 28, '#2a2540');
  }
}
function mgStep(dt) {
  const g = mgG; mg.t += dt; g.imageSmoothingEnabled = false; const id = mg.game.id;
  ({ RUN: runStep, RACE: raceStep, FIGHT: fightStep, DELIVERY: deliveryStep })[id](g, dt);
  if (mg.phase === 'title') {
    const [l1] = MG_INFO[id];
    g.fillStyle = 'rgba(20,16,30,.62)'; g.fillRect(0, 0, 192, 144);
    ptext(g, id, cx96(id, id.length > 5 ? 3 : 4), 30, '#ffe14d', id.length > 5 ? 3 : 4, '#ff6f61');
    ptext(g, l1, cx96(l1), 70, '#ffffff');
    if (mg.t % .8 < .5) ptext(g, 'PRESS A', cx96('PRESS A'), 96, '#ffffff');
    ptext(g, 'START: BACK', cx96('START: BACK'), 120, '#b6a8ee');
    if (bestOf(id)) { const b = 'BEST ' + bestOf(id) + (id === 'DELIVERY' ? 'M' : ''); ptext(g, b, cx96(b), 82, '#ffc94a'); }
  } else if (mg.phase === 'result') {
    g.fillStyle = 'rgba(20,16,30,.72)'; g.fillRect(0, 0, 192, 144);
    ptext(g, mg.end, cx96(mg.end, 3), 34, '#ffe14d', 3, '#ff6f61');
    g.fillStyle = '#f5c518'; g.fillRect(70, 72, 7, 7); ptext(g, '+' + mg.got, 82, 71, '#fff', 2);
    const b = mg.newBest ? 'NEW BEST!' : 'BEST ' + bestOf(id) + (id === 'DELIVERY' ? 'M' : ''); ptext(g, b, cx96(b), 90, mg.newBest ? '#ffc94a' : '#c9c4d6');
    if (mg.t > 0.8) ptext(g, 'PRESS A', cx96('PRESS A'), 112, mg.t % .6 < .3 ? '#fff' : '#b6a8ee');
  }
}

// ───────── 当たり（四角を回したもの・円） ─────────
function pushOut(p, o, rad) {
  if (o.r != null) { const dx = p.x - o.x, dz = p.z - o.z, d = Math.hypot(dx, dz), m = o.r + rad; if (d < m && d > 1e-4) { p.x = o.x + dx / d * m; p.z = o.z + dz / d * m; } return; }
  const s = Math.sin(o.ry), c = Math.cos(o.ry), dx = p.x - o.x, dz = p.z - o.z;
  let lx = dx * c - dz * s, lz = dx * s + dz * c; const ex = o.hw + rad, ez = o.hd + rad;
  if (Math.abs(lx) >= ex || Math.abs(lz) >= ez) return;
  if (ex - Math.abs(lx) < ez - Math.abs(lz)) lx = Math.sign(lx || 1) * ex; else lz = Math.sign(lz || 1) * ez;
  p.x = o.x + lx * c + lz * s; p.z = o.z - lx * s + lz * c;
}

// ───────── 案内（大家さん）: はじめて部屋に入ったら、できることを 1 つずつ。やるとすすむ ─────────
const TUT = [
  { say: '大家です。引っ越しおつかれさま。', auto: 3 },
  { say: '十字ボタンで歩けるよ。行きたい所を押しても歩く。', done: 'walk' },
  { say: '画面をなぞるか L・R で、まわりが見られる。', done: 'look' },
  { say: '棚のグッズを押すと、手に取って見られるよ。', done: 'get' },
  { say: '「撮る」か、左下のカメラのボタンで写真になる。', done: 'shot' },
  { say: 'START の「かざりかえる」で、置き場所を変えられる。', done: 'edit' },
  { say: 'ゲーム機のステッカーは指で動かせる。START の「マイステッカー」で描ける。', done: 'stk' },
  { say: 'SELECT で着がえ。', done: 'dress' },
  { say: '壁のカレンダーから、今月のまとめ画像が作れる。', auto: 5 },
  { say: 'ドアの前の EXIT から、町に出られる。', done: 'town' },
  { say: 'ゲームセンターは道の先。台の前で A。自販機はコイン 3 枚。', auto: 6, town: true },
];
let tutI = ST.tut === 'done' ? -1 : (typeof ST.tut === 'number' ? ST.tut : 0), tutT = 0, walkAcc = 0, lookAcc = 0, lastYaw = null;
const tutEl = $('tut');
const oya = makeBee({ type: 'A', shirt: '#c9b28a', bottom: '#5a4a3a', headC: '#b8862e' }); oya.g.position.set(-1.3, 0, 1.0); OWN.me.group.add(oya.g); oya.g.visible = tutI >= 0;
function tutShow() { if (tutI < 0) { tutEl.classList.remove('on'); oya.g.visible = false; return; } $('tutL').textContent = TUT[tutI].say; tutT = 0; }
function tutNext() { tutI++; if (tutI >= TUT.length) { tutI = -1; ST.tut = 'done'; } else ST.tut = tutI; persist(); tutShow(); }
function tutHit(kind) { if (tutI >= 0 && TUT[tutI].done === kind) { buzz(); tutNext(); } }
$('tutSkip').onclick = (e) => { e.stopPropagation(); tutI = -1; ST.tut = 'done'; persist(); tutShow(); };
$('tutNext').onclick = (e) => { e.stopPropagation(); buzz(); tutNext(); };
function stepTut(dt) {
  if (tutI < 0) return;
  const st = TUT[tutI], here = st.town ? S.mode === 'town' : (S.mode === 'room' && S.owner === 'me') || st.done === 'town';
  const show = S.power === 'on' && here && !S.get && !mg.on && !S.menu && !S.edit && !talkS && !stkEl.classList.contains('on') && !libEl.classList.contains('on');
  if (show && !tutEl.classList.contains('on')) $('tutL').textContent = st.say;
  tutEl.classList.toggle('on', show);
  if (!show) return;
  tutT += dt; if (st.auto && tutT > st.auto) tutNext();
  if (lastYaw != null) lookAcc += Math.abs(S.yaw - lastYaw); lastYaw = S.yaw;
  if (st.done === 'look' && lookAcc > 1.0) tutHit('look');
  if (st.done === 'walk' && walkAcc > 1.6) tutHit('walk');
  oya.g.visible = S.mode === 'room';
  const d = me.position.clone().sub(oya.g.position); oya.g.rotation.y = Math.atan2(d.x, d.z); oya.head.rotation.z = Math.sin(performance.now() / 600) * 0.1;
}
// ───────── 住人の動き ─────────
function stepNpcs(dt, t) {
  for (const n of npcs) {
    const near = me.position.distanceTo(n.g.position) < 2.0 && !n.flee;
    let moving = false;
    if (n.flee) { // ねこ: なでると、別の場所へ走っていく
      n.fleeTo ||= cornersOf(cellPos([[1, 0], [-1, 0], [0, -1], [1, -1]][Math.floor(Math.random() * 4)][0], 0))[Math.floor(Math.random() * 6)].clone();
      if (!talkS) { const d = n.fleeTo.clone().sub(n.g.position); d.y = 0; if (d.length() > 0.2) { moving = true; n.g.rotation.y = Math.atan2(d.x, d.z); n.g.position.addScaledVector(d.normalize(), dt * 2.6); } else { n.flee = 0; n.fleeTo = null; } }
    } else if (near) { const d = me.position.clone().sub(n.g.position); let dr = Math.atan2(d.x, d.z) - n.g.rotation.y; dr = Math.atan2(Math.sin(dr), Math.cos(dr)); n.g.rotation.y += dr * Math.min(1, dt * 6); }
    else if (n.path) { const goal = n.path[n.i], d = goal.clone().sub(n.g.position); d.y = 0;
      if (d.length() < 0.1) n.i = (n.i + 1) % n.path.length; else { moving = true; let dr = Math.atan2(d.x, d.z) - n.g.rotation.y; dr = Math.atan2(Math.sin(dr), Math.cos(dr)); n.g.rotation.y += dr * Math.min(1, dt * 5); n.g.position.addScaledVector(d.normalize(), dt * n.speed); } }
    else if (n.face) { const d = n.face.clone().sub(n.g.position); n.g.rotation.y = Math.atan2(d.x, d.z) + Math.sin(t * 0.5) * 0.4; }
    n.walkT += moving ? dt * (n.cat ? 14 : 8) : 0; const sw = moving ? Math.sin(n.walkT) * 0.5 : 0;
    n.legs.forEach((l, i) => { l.rotation.x = (i % 2 ? -sw : sw) * (n.cat && i > 1 ? -1 : 1); });
    if (n.arms.length) { n.arms[0].rotation.x = n.carry ? -1.25 : -sw * 0.7; n.arms[1].rotation.x = n.carry ? -1.25 : sw * 0.7; }
    if (n.broom) { n.broom.rotation.z = Math.sin(t * 3) * 0.35; n.arms[1].rotation.x = -0.6 + Math.sin(t * 3) * 0.2; }
    if (n.wheel) n.wheel.rotation.x += moving ? dt * n.speed / 0.15 : 0;
    if (n.tail) n.tail.rotation.z = Math.sin(t * 2) * 0.4;
    n.head.rotation.z = moving ? 0 : Math.sin(t * 0.7 + n.walkT) * 0.1;
    if (n.icon) n.icon.position.set(n.g.position.x, 1.78 + Math.sin(t * 2 + n.walkT) * 0.04, n.g.position.z);
  }
}
// ───────── 毎フレーム ─────────
const clock = new THREE.Clock(); let walkT = 0, lastBagT = -1;
const camRay = new THREE.Raycaster();
function nearest() {
  if (S.mode === 'town') { let best = null, bd = 1e9; for (const a of acts) { const d = Math.hypot(me.position.x - a.x, me.position.z - a.z); if (d < a.r && d < bd) { bd = d; best = a; } }
    for (const n of npcs) { const d = me.position.distanceTo(n.g.position); if (d < 1.5 && d < bd) { bd = d; best = { label: n.cat ? 'ねこをなでる' : `${n.name}${n.fan ? 'さん' : ''}と話す`, act: () => talkTo(n) }; } } return best; }
  let best = null, bd = 1.5;
  for (const o of pickables) { if (!visible(o)) continue; o.getWorldPosition(tmpV); const d = Math.hypot(me.position.x - tmpV.x, me.position.z - tmpV.z); if (d < bd) { bd = d; best = o.userData; } }
  return best && { label: best.prop ? '今月のまとめを作る' : best.npc ? `${best.title}と話す` : 'グッズを見る', act: () => best.prop ? toMatome() : best.npc ? talk(best) : getItem(best) };
}
function tick() {
  if (dead) return; raf = requestAnimationFrame(tick); if (S.power === 'on') keepSession();
  const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
  if (document.hidden) return;
  if (S.power === 'off') { if (t - lastBagT > 1 / 15) { lastBagT = t; renderBag(t); } return; }
  if (S.power === 'boot') { S.bootT += dt; drawBoot(S.bootT); if (S.bootT > 1.9) { S.power = 'on'; bootEl.style.display = 'none'; drawPow(); } if (S.bootT < 1.4) return; }
  if (mg.on) { mgStep(dt); if (S.shot) { S.shot = false; makeShot(mgC); } return; }
  holoTex.offset.set(t * 0.08 + camNow.pos.x * 0.05, camNow.pos.z * 0.04);
  if (arcadeSign) arcadeSign.material.color.setScalar(Math.sin(t * 6) > -0.2 ? 1 : 0.45);
  // 入力 → 動き（カメラの向き基準）
  let ix = joy.x, iy = joy.y;
  if (S.power === 'on' && !S.menu) { if (keys['w'] || keys['arrowup']) iy = -1; if (keys['s'] || keys['arrowdown']) iy = 1; if (keys['a'] || keys['arrowleft']) ix = -1; if (keys['d'] || keys['arrowright']) ix = 1; }
  if (S.turn && !S.get) S.yaw += S.turn * dt * 1.9;
  let moving = false;
  const fwd = new THREE.Vector3(-Math.sin(S.yaw), 0, -Math.cos(S.yaw)), right = new THREE.Vector3(-fwd.z, 0, fwd.x);
  const mv = new THREE.Vector3().addScaledVector(fwd, -iy).addScaledVector(right, ix);
  const free = !S.busy && !S.get && S.spinT == null;
  if (free && mv.lengthSq() > 0.02) {
    unfocus(); S.pending = null; S.walkTo = null; moving = true; if (S.aim) aimAt(null);
    S.hold = (S.hold || 0) + dt; S.spd = THREE.MathUtils.lerp(S.spd || 0, (S.mode === 'town' ? (S.hold > 1.2 ? 4.6 : 3.4) : 2.0), Math.min(1, dt * 7));
    mv.normalize(); let dr = Math.atan2(mv.x, mv.z) - me.rotation.y; dr = Math.atan2(Math.sin(dr), Math.cos(dr)); me.rotation.y += dr * Math.min(1, dt * 16);
    me.position.addScaledVector(mv, S.spd * dt); walkMark.visible = false; walkAcc += S.spd * dt;
  } else if (free && S.walkTo) {
    S.hold = 0; const d = S.walkTo.clone().sub(me.position); d.y = 0; const dist = d.length();
    if (dist > 0.08) { moving = true; let dr = Math.atan2(d.x, d.z) - me.rotation.y; dr = Math.atan2(Math.sin(dr), Math.cos(dr)); me.rotation.y += dr * Math.min(1, dt * 14);
      const before = me.position.clone(); me.position.addScaledVector(d.normalize(), Math.min(dist, dt * (S.mode === 'town' ? 3.4 : 1.8))); walkAcc += dt * 1.8;
      S.lastPos = before; if (S.mode === 'town') S.yaw += Math.atan2(Math.sin(me.rotation.y + Math.PI - S.yaw), Math.cos(me.rotation.y + Math.PI - S.yaw)) * Math.min(1, dt * 0.9); }
    else { S.walkTo = null; walkMark.visible = false; if (S.pending) { const p = S.pending; S.pending = null; p.act(); } }
  } else { S.hold = 0; S.spd = 0; }
  // 境界と当たり
  if (S.mode === 'room') {
    me.position.x = THREE.MathUtils.clamp(me.position.x, -R + .3, R - .3);
    if (Math.abs(me.position.x) < 0.7 && me.position.z > R - 0.55 && !S.busy && !S.get) goto('town', { from: S.owner });
    me.position.z = THREE.MathUtils.clamp(me.position.z, -R + .3, R - .2);
    roomObs.forEach((o) => pushOut(me.position, o, 0.2));
    const npc = OWN[S.owner].npc; if (npc) { const d = me.position.clone().sub(npc.g.position); let dr = Math.atan2(d.x, d.z) - npc.g.rotation.y; dr = Math.atan2(Math.sin(dr), Math.cos(dr)); npc.g.rotation.y += dr * 0.05; npc.head.rotation.z = Math.sin(t * 0.8) * 0.12; pushOut(me.position, { x: npc.g.position.x, z: npc.g.position.z, r: 0.25 }, 0.2); }
  } else {
    const r = Math.hypot(me.position.x, me.position.z); if (r > TOWN_R) me.position.multiplyScalar(TOWN_R / r);
    obstacles.forEach((o) => pushOut(me.position, o, 0.24));
    if (Math.hypot(me.position.x - myHouse.doorW.x, me.position.z - myHouse.doorW.z) < 0.42 && !S.busy) goto('room', { owner: 'me' });
    for (const it of items) { if (!it.alive) continue; const d = Math.hypot(it.g.position.x - me.position.x, it.g.position.z - me.position.z);
      if (d < 0.6) { it.alive = false; it.g.visible = false;
        if (it.kind === 'coin') S.coins++; else if (it.kind === 'q') S.coins += 10; else { S.items++; S.coins += 5; }
        drawHud(true); setTimeout(() => drawHud(), 300); } }
    items.forEach((it, i) => { if (it.alive) { it.g.rotation.y = t * 2 + i; it.g.position.y = (it.kind === 'q' ? 1.0 : 0.55) + Math.sin(t * 3 + i) * 0.06; } });
  }
  // 押した所へ歩いていて、物に当たって進めなくなったら止まる
  if (S.walkTo && S.lastPos) { if (me.position.distanceTo(S.lastPos) < dt * 0.4) { S.stuck = (S.stuck || 0) + dt; if (S.stuck > 0.5) { S.walkTo = null; S.pending = null; walkMark.visible = false; } } else S.stuck = 0; S.lastPos = null; }
  if (walkMark.visible) { walkMark.userData.t += dt; walkMark.scale.setScalar(1 + Math.sin(walkMark.userData.t * 8) * 0.12); }
  // 町の住人
  if (S.mode === 'town') stepNpcs(dt, t);
  stepTut(dt);
  // 近くで A を押すとできること
  S.near = (S.busy || S.get || S.menu || S.edit) ? null : S.aim && S.mode === 'room' ? { label: 'グッズを見る', act: () => getItem(S.aim) } : nearest();
  stepCursor(t);
  if (performance.now() > promptLock) { if (S.near && !card.classList.contains('on')) { promptT.textContent = S.near.label; promptEl.classList.add('on'); } else promptEl.classList.remove('on'); }
  // 着がえ: くるっと回って、半分で入れかわる
  if (S.spinT != null) { S.spinT += dt; const k = Math.min(1, S.spinT / 0.62), e = k < .5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2; me.rotation.y = S.spinBase + e * Math.PI * 4; me.position.y = Math.sin(k * Math.PI) * 0.25;
    if (!S.spinSwap && k > 0.5) { S.spinSwap = true; setChar(charId === 'A' ? 'B' : 'A'); burst(me.position.clone().setY(0.9)); toast(`TYPE ${charId}`); }
    if (k >= 1) { S.spinT = null; me.position.y = 0; } }
  // ポーズ
  if (S.get) stepGet(dt, t);
  else {
    walkT += moving ? dt * 9 : 0;
    const sw = moving ? Math.sin(walkT) * 0.5 : 0;
    legs[0].rotation.x = sw; legs[1].rotation.x = -sw;
    arms[0].rotation.set(-sw * 0.8, 0, charId === 'B' ? -0.12 : 0); arms[1].rotation.set(sw * 0.8, 0, charId === 'B' ? 0.12 : 0);
    if (S.spinT == null) me.position.y = moving ? Math.abs(Math.cos(walkT)) * 0.025 : 0;
    head.rotation.set(moving ? 0.05 : Math.sin(t * 0.45) * 0.06, 0, moving ? 0 : Math.sin(t * 0.7) * 0.12);
  }
  shadow.position.set(me.position.x, 0.02, me.position.z);
  stepHint(dt); stepPuffs(dt);
  // かざりかえ: 置ける場所に印・選んだグッズの上に矢印
  if (S.edit) {
    markers.forEach((m) => { const id = m.userData.slot, ok = !S.sel || fits(S.sel, id); m.visible = ok; m.material.opacity = S.sel ? 0.65 + Math.sin(t * 6) * 0.3 : 0.45; });
    if (S.sel?.slot && S.sel.obj.parent) { tmpBox.setFromObject(S.sel.obj); pointer.position.set((tmpBox.min.x + tmpBox.max.x) / 2, tmpBox.max.y + 0.12 + Math.abs(Math.sin(t * 5)) * 0.06, (tmpBox.min.z + tmpBox.max.z) / 2); pointer.visible = true; } else pointer.visible = false;
  }
  // カメラ
  if (!S.get) {
    const tgt = me.position.clone().setY(1.0), blockers = S.mode === 'room' ? roomCol : colliders;
    const aim = (pitch) => { const cp = Math.cos(pitch); return new THREE.Vector3(tgt.x + Math.sin(S.yaw) * cp * S.dist, tgt.y + Math.sin(pitch) * S.dist, tgt.z + Math.cos(S.yaw) * cp * S.dist); };
    const hitTo = (pos) => { const dir = pos.clone().sub(tgt), len = dir.length(); camRay.set(tgt, dir.normalize()); camRay.far = len + 0.2; return camRay.intersectObjects(blockers, true)[0]; };
    if (!touches.size) { S.blockT = hitTo(aim(S.pitch)) ? (S.blockT || 0) + dt : 0; S.camUp = THREE.MathUtils.clamp((S.camUp || 0) + (S.blockT > 0.5 ? dt * 1.1 : -dt * 0.9), 0, 1); }
    camGoal.look.copy(tgt); camGoal.pos.copy(aim(Math.min(1.3, S.pitch + (S.camUp || 0) * 0.6)));
    if (S.mode === 'room') { camGoal.pos.x = THREE.MathUtils.clamp(camGoal.pos.x, -R - 2.5, R + 2.5); camGoal.pos.z = THREE.MathUtils.clamp(camGoal.pos.z, -R - 2.5, R + 2.5); }
    const h = S.camUp > 0.95 && hitTo(camGoal.pos); if (h) { const dir = camGoal.pos.clone().sub(tgt).normalize(); camGoal.pos.copy(tgt).addScaledVector(dir, Math.max(S.mode === 'town' ? 1.9 : 1.2, h.distance - 0.3)); }
    if (S.mode === 'town') {
      // はじめて町に出たときは、上からハニカムの並びを見せてから降りてくる
      if (S.intro > 0) { S.intro -= dt; const k = Math.max(0, Math.min(1, (S.intro - 0.2) / 1.6)), e = k * k * (3 - 2 * k);
        camGoal.pos.lerp(new THREE.Vector3(0, 30, 16), e); camGoal.look.lerp(new THREE.Vector3(0, 0, 2), e); if (k > 0.98) S.snap = true; }
    }
  }
  if (S.snap) { camNow.pos.copy(camGoal.pos); camNow.look.copy(camGoal.look); S.snap = false; }
  const k = 1 - Math.pow(S.intro > 0 ? 0.02 : 0.004, dt);
  camNow.pos.lerp(camGoal.pos, k); camNow.look.lerp(camGoal.look, k);
  camera.position.copy(camNow.pos); camera.lookAt(camNow.look);
  if (S.mode === 'room') walls.forEach((w, i) => { const v = camera.position.clone().sub(w.g.position).dot(w.n) > 0.05; w.g.visible = v; OWNERS.forEach((o) => { o.anchors[i].visible = v; }); });

  camera.layers.set(0); renderer.setRenderTarget(lowRT); renderer.render(scene, camera);
  renderer.setRenderTarget(null); renderer.autoClear = true; renderer.render(quadScene, quadCam);
  renderer.autoClear = false; const bg = scene.background; scene.background = null;
  // 細かい奥行きだけを書く（色は書かない）→ くっきりのグッズが正しく隠れる・チラつかない
  noDepth.forEach((m) => { m.userData.vis = m.visible; m.visible = false; }); scene.overrideMaterial = depthOnly; renderer.render(scene, camera); scene.overrideMaterial = null; noDepth.forEach((m) => { m.visible = m.userData.vis; });
  camera.layers.set(CRISP); renderer.render(scene, camera);
  if (dimU.uDim.value > 0.001) renderer.render(dimScene, quadCam);
  if (fx.visible) { camera.layers.set(FX); renderer.render(scene, camera); camera.layers.set(HELD); renderer.render(scene, camera); }
  scene.background = bg; renderer.autoClear = true; camera.layers.set(0);
  if (S.shot) { S.shot = false; makeShot(renderer.domElement); }
}
let promptLock = 0;
function flashPrompt(t) { promptT.textContent = t; promptEl.classList.add('on'); promptLock = performance.now() + 1400; }
scene.background = new THREE.Color('#14121c');
let rT; onWin('resize', () => { clearTimeout(rT); rT = setTimeout(resize, 120); });
const toMatome = () => { opts.onMatome?.(); };
// 続きから: 部屋か町か・どこにいたか・カメラ
if (SESSION.s) { const v = SESSION.s; S.mode = v.mode; room.visible = v.mode === 'room'; town.visible = v.mode === 'town';
  if (v.mode === 'room') { setOwner(v.owner); scene.fog = null; } else { scene.fog = new THREE.Fog('#efc9a0', 20, 60); introDone = true; }
  me.position.set(v.pos[0], 0, v.pos[2]); me.rotation.y = v.ry; S.yaw = v.yaw; S.pitch = v.pitch; S.dist = v.dist; S.snap = true; }
const keepSession = () => { SESSION.s = { mode: S.mode, owner: S.owner, pos: [me.position.x, 0, me.position.z], ry: me.rotation.y, yaw: S.yaw, pitch: S.pitch, dist: S.dist }; };
// まとめ画像などからもどったときは、すぐにゲーム機を開いた所へ
function quickOpen() {
  geom(); stage.classList.add('open'); root.style.zIndex = '200'; document.documentElement.dataset.roomOpen = '1';
  [sBack, sItems, sFront].forEach((e) => { e.style.opacity = '0'; }); dim.animate([{ opacity: 1 }, { opacity: 1 }], { duration: 1, fill: 'forwards' });
  consoleEl.style.zIndex = 5; S.power = 'on'; bootEl.style.display = 'none'; drawPow(); drawSkin(); opts.onOpen?.();
}
resize(); tick();
if (SESSION.reopen) { SESSION.reopen = false; requestAnimationFrame(quickOpen); }
document.fonts?.ready.then(() => drawBag());
window.__room = { npcs, talkTo, buyDrink, walkHere, get myStk() { return myStk; }, get placedStk() { return placedStk; }, openLib, renderStickers, bagCon, bagItems, bagCam, BAG, S, OWN, camera, get me() { return me; }, goto, startMinigame, items, mg, el, R, openConsole, closeConsole, acts, pickables, getItem, endGet, startEdit, endEdit, moveTo, markers, SLOTS, openStk, myHouse, setChar };

return { destroy: () => { dead = true; delete document.documentElement.dataset.roomOpen; cancelAnimationFrame(raf); offs.forEach((f) => f()); try { renderer.dispose(); bagR.dispose(); } catch { /* なし */ } } };
}

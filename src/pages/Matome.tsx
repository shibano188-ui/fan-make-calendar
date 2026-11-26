import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { loadMyGot, loadSampleGot, imageOf, type MyGot } from '../room/data';
import { ROOM_PREVIEW } from '../room/preview';

// 今月のまとめ画像（2026-11-26 柴野「コラージュの方がいい」）。その月に「買った」「行った」を押した予定を、
// 切り抜いたステッカーにしてコラージュで並べる。一番の物（値段の高い物）を大きく、ほかは大きさ・向きを変えて重ねる。
// 「買った」「行った」の文字と件数は書かない。試作 → Obsidian: Projects/fanhive-room-mock/matome.html

const W = 1080, H = 1350, K = 2; // 下書きは 540×675 の座標で、2 倍で描く
// 置き場所（大事な順）: [中心x, 中心y, 大きさ, 回転, 日付x, 日付y]
const POS: [number, number, number, number, number, number][] = [
  [404, 318, 370, 4, 440, 470], [140, 316, 205, -8, 66, 410], [410, 92, 210, 7, 330, 150], [352, 572, 160, -5, 330, 640], [214, 548, 150, 7, 196, 606],
  [286, 200, 150, 10, 268, 268], [40, 470, 175, -24, 92, 556], [272, 410, 140, -11, 250, 470], [498, 548, 124, 16, 470, 600],
];
const DRAW_ORDER = [2, 1, 6, 5, 4, 7, 3, 0, 8];

const loadImg = (src: string) => new Promise<HTMLImageElement | null>((ok) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = src; });

/** 白い地を抜いて、白いふちのステッカーにする（読めない画像は、そのまま白いふちの四角に） */
function cutSticker(img: HTMLImageElement, S = 640, border = 14): HTMLCanvasElement {
  const k = S / Math.max(img.width, img.height), w = Math.round(img.width * k), h = Math.round(img.height * k);
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d', { willReadFrequently: true })!; g.drawImage(img, 0, 0, w, h);
  let minX = 0, minY = 0, maxX = w - 1, maxY = h - 1;
  try {
    const id = g.getImageData(0, 0, w, h), d = id.data, bg = new Uint8Array(w * h), st: number[] = [];
    const white = (i: number) => d[i * 4] > 234 && d[i * 4 + 1] > 234 && d[i * 4 + 2] > 234;
    for (let x = 0; x < w; x++) st.push(x, (h - 1) * w + x); for (let y = 0; y < h; y++) st.push(y * w, y * w + w - 1);
    while (st.length) { const i = st.pop()!; if (bg[i] || !white(i)) continue; bg[i] = 1; const x = i % w, y = (i / w) | 0; if (x > 0) st.push(i - 1); if (x < w - 1) st.push(i + 1); if (y > 0) st.push(i - w); if (y < h - 1) st.push(i + w); }
    for (let i = 0; i < bg.length; i++) if (bg[i]) d[i * 4 + 3] = 0; g.putImageData(id, 0, 0);
    minX = w; minY = h; maxX = 0; maxY = 0; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (!bg[y * w + x]) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
    if (maxX < minX) { minX = 0; minY = 0; maxX = w - 1; maxY = h - 1; }
  } catch { /* よその出どころで読めない（手元の開発だけ） */ }
  const cw = maxX - minX + 1, ch = maxY - minY + 1, pad = border + 4;
  const out = document.createElement('canvas'); out.width = cw + pad * 2; out.height = ch + pad * 2; const o = out.getContext('2d')!;
  const sil = document.createElement('canvas'); sil.width = out.width; sil.height = out.height; const s = sil.getContext('2d')!;
  s.drawImage(c, minX, minY, cw, ch, pad, pad, cw, ch); s.globalCompositeOperation = 'source-in'; s.fillStyle = '#fff'; s.fillRect(0, 0, out.width, out.height);
  for (let i = 0; i < 32; i++) { const a = i / 32 * Math.PI * 2; o.drawImage(sil, Math.cos(a) * border, Math.sin(a) * border); }
  o.drawImage(sil, 0, 0); o.drawImage(c, minX, minY, cw, ch, pad, pad, cw, ch);
  return out;
}

type Style = 'n' | 'r';
type Item = { got: MyGot; st: HTMLCanvasElement };

function draw(cv: HTMLCanvasElement, items: Item[], month: number, style: Style, showTotal: boolean) {
  cv.width = W; cv.height = H; const g = cv.getContext('2d')!;
  const ink = style === 'r' ? '#2a2540' : '#1c1c1e';
  // 地
  if (style === 'n') {
    g.fillStyle = '#f4efe6'; g.fillRect(0, 0, W, H); g.fillStyle = '#d9d2c5';
    for (let y = 18; y < H; y += 36) for (let x = 18; x < W; x += 36) { g.beginPath(); g.arc(x, y, 2, 0, 7); g.fill(); }
  } else {
    for (let y = 0; y < H; y += 6) for (let x = 0; x < W; x += 6) { const t = y / H; g.fillStyle = ((x + y) / 6 & 1) ? (t < .5 ? '#ece8ff' : '#e3f0ff') : (t < .5 ? '#e4dfff' : '#dbe9ff'); g.fillRect(x, y, 6, 6); }
    g.fillStyle = 'rgba(80,70,160,.10)'; for (let x = 0; x < W; x += 60) g.fillRect(x, 0, 6, H); for (let y = 0; y < H; y += 60) g.fillRect(0, y, W, 6);
  }
  // 後ろに大きな月の数字
  g.textBaseline = 'alphabetic';
  g.font = `800 ${style === 'n' ? 520 : 460}px Outfit, sans-serif`;
  const num = String(month), nw = g.measureText(num).width;
  if (style === 'n') { g.fillStyle = '#FBC000'; g.fillText(num, 36 - 20, 470); }
  else {
    const gr = g.createLinearGradient(30, 60, 30 + nw, 470); ['#ff9ad5', '#ffe08a', '#9effc8', '#8ad8ff', '#c79bff'].forEach((c, i) => gr.addColorStop(i / 4, c));
    g.fillStyle = gr; g.fillText(num, 36, 450); g.lineWidth = 8; g.strokeStyle = ink; g.strokeText(num, 36, 450);
  }
  g.fillStyle = ink; g.font = `800 ${style === 'n' ? 128 : 120}px -apple-system, "Hiragino Sans", sans-serif`; g.fillText('月', 36 + nw - 10, style === 'n' ? 460 : 440);
  // ステッカー
  const n = Math.min(items.length, POS.length);
  for (const pi of DRAW_ORDER) {
    if (pi >= n) continue; const { st } = items[pi]; const [cx, cy, size, rot] = POS[pi];
    const k = size * K / Math.max(st.width, st.height), w = st.width * k, h = st.height * k;
    g.save(); g.translate(cx * K, cy * K); g.rotate(rot * Math.PI / 180);
    if (style === 'n') { g.shadowColor = 'rgba(60,40,10,.22)'; g.shadowBlur = 22; g.shadowOffsetY = 14; g.drawImage(st, -w / 2, -h / 2, w, h); }
    else {
      const sil = document.createElement('canvas'); sil.width = st.width; sil.height = st.height; const s = sil.getContext('2d')!; s.drawImage(st, 0, 0); s.globalCompositeOperation = 'source-in'; s.fillStyle = ink; s.fillRect(0, 0, sil.width, sil.height);
      g.globalAlpha = 0.85; g.drawImage(sil, -w / 2 + 10, -h / 2 + 12, w, h); g.globalAlpha = 1;
      for (const [dx, dy] of [[-4, 0], [4, 0], [0, -4], [0, 4]]) g.drawImage(sil, -w / 2 + dx, -h / 2 + dy, w, h);
      g.drawImage(st, -w / 2, -h / 2, w, h);
    }
    g.restore();
  }
  // 日付の札
  g.font = '500 22px "DM Mono", ui-monospace, monospace';
  for (let pi = 0; pi < n; pi++) {
    const d = new Date(items[pi].got.at), t = `${d.getMonth() + 1}.${String(d.getDate()).padStart(2, '0')}`, [, , , rot, dx, dy] = POS[pi];
    const tw = g.measureText(t).width;
    g.save(); g.translate(dx * K, dy * K); g.rotate(rot * 0.4 * Math.PI / 180);
    g.fillStyle = style === 'n' ? 'rgba(251,192,0,.8)' : ink; g.fillRect(0, 0, tw + 20, 34);
    g.fillStyle = style === 'n' ? ink : '#fff'; g.textBaseline = 'middle'; g.fillText(t, 10, 18); g.restore();
  }
  // 合計
  if (showTotal) {
    const total = items.reduce((a, it) => a + (it.got.stamp === 'bought' ? it.got.event.price ?? 0 : 0), 0);
    g.textBaseline = 'alphabetic'; g.fillStyle = style === 'n' ? '#6e6e73' : ink; g.font = '22px -apple-system, "Hiragino Sans", sans-serif'; g.fillText('合計', 56, H - 182);
    g.fillStyle = ink; g.font = '800 60px Outfit, sans-serif'; g.fillText('¥' + total.toLocaleString(), 52, H - 116);
  }
  // 下
  g.fillStyle = '#FBC000'; g.beginPath(); g.roundRect(56, H - 70, 36, 36, 10); g.fill();
  g.fillStyle = '#fff'; g.font = '800 15px Outfit, sans-serif'; g.textBaseline = 'middle'; g.fillText('FH', 63, H - 51);
  g.fillStyle = ink; g.font = '700 24px -apple-system, "Hiragino Sans", sans-serif'; g.fillText('FanHive', 104, H - 51);
  g.fillStyle = '#6e6e73'; g.font = '500 22px "DM Mono", ui-monospace, monospace'; g.textAlign = 'right'; g.fillText('fanhive.jp', W - 56, H - 51); g.textAlign = 'left';
}

let fontLinked = false;
function linkFonts() {
  if (fontLinked) return; fontLinked = true;
  const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'https://fonts.googleapis.com/css2?family=Outfit:wght@800&family=DM+Mono:wght@500&display=swap'; document.head.appendChild(l);
}

export default function Matome() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const now = new Date(), month = now.getMonth() + 1;
  const [items, setItems] = useState<Item[] | null>(null);
  const [sample, setSample] = useState(false);
  const [style, setStyle] = useState<Style>('n');
  const [showTotal, setShowTotal] = useState(true);
  const cvRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    linkFonts();
    let alive = true;
    void (async () => {
      let got = user ? (await loadMyGot(user.id)).filter((g) => { const d = new Date(g.at); return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth(); }) : [];
      // プレビューでは、まだ何も無い人に見本を出す
      if (!got.length && ROOM_PREVIEW) { got = await loadSampleGot(); if (alive) setSample(true); }
      // 値段の高い物を大きく
      got.sort((a, b) => (b.event.price ?? 0) - (a.event.price ?? 0));
      const list: Item[] = [];
      for (const g of got.slice(0, POS.length)) { const src = imageOf(g.event, 640); const im = src ? await loadImg(src) : null; if (im) list.push({ got: g, st: cutSticker(im) }); }
      await Promise.all(['800 60px Outfit', '500 22px "DM Mono"'].map((f) => document.fonts?.load(f).catch(() => null)));
      if (alive) setItems(list);
    })();
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => { if (items?.length && cvRef.current) draw(cvRef.current, items, month, style, showTotal); }, [items, style, showTotal, month]);

  const blob = () => new Promise<Blob | null>((ok) => cvRef.current ? cvRef.current.toBlob(ok, 'image/png') : ok(null));
  const save = async () => { const b = await blob(); if (!b) return; const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `fanhive-${month}.png`; a.click(); };
  const share = async () => {
    const b = await blob(); if (!b) return;
    const data = { files: [new File([b], `fanhive-${month}.png`, { type: 'image/png' })], text: `${month}月 #FanHive`, url: 'https://fanhive.jp/lp.html' };
    try { if (navigator.canShare?.(data)) await navigator.share(data); else await save(); } catch { /* 閉じただけ */ }
  };
  const pill = (on: boolean) => `rounded-full px-3 py-1.5 text-[13px] font-semibold ${on ? 'bg-label-primary text-bg-primary' : 'bg-bg-secondary text-label-primary'}`;

  const empty = useMemo(() => items !== null && items.length === 0, [items]);
  return (
    <div className="min-h-[100dvh] pb-10" style={{ backgroundColor: 'var(--bg-primary)', paddingTop: 'var(--sat)' }}>
      <div className="flex items-center gap-2 px-2 h-12">
        <button onClick={() => navigate(-1)} aria-label="もどる" className="pressable tap-44 flex items-center justify-center"><ChevronLeft size={24} /></button>
        <h1 className="text-[17px] font-bold">{month}月のまとめ</h1>
      </div>
      {items === null && <p className="px-4 pt-10 text-center text-[14px] text-label-tertiary">作っています…</p>}
      {empty && <p className="px-4 pt-10 text-center text-[14px] text-label-secondary">今月はまだ「買った」「行った」を押した予定がない</p>}
      {!!items?.length && (
        <>
          <div className="flex gap-2 px-4 pb-3">
            <button className={pill(style === 'n')} onClick={() => setStyle('n')}>通常</button>
            <button className={pill(style === 'r')} onClick={() => setStyle('r')}>レトロ</button>
            <button className={pill(showTotal)} onClick={() => setShowTotal((v) => !v)}>合計金額</button>
          </div>
          {sample && <p className="px-4 pb-2 text-[12px] text-label-tertiary">見本（「買った」「行った」を押すと自分の1枚になる）</p>}
          <div className="px-4"><canvas ref={cvRef} className="w-full rounded-xl" style={{ aspectRatio: '4 / 5', boxShadow: '0 8px 24px rgba(0,0,0,.12)' }} /></div>
          <div className="flex gap-2 px-4 pt-4">
            <button onClick={share} className="pressable flex-1 rounded-full py-3 text-[15px] font-bold" style={{ backgroundColor: 'var(--accent-color)', color: 'var(--accent-on)' }}>共有する</button>
            <button onClick={save} className="pressable flex-1 rounded-full py-3 text-[15px] font-bold bg-bg-secondary">保存する</button>
          </div>
        </>
      )}
    </div>
  );
}

// いいねの瞬間の演出。Nothing OS風の細線が連鎖しながら放射し、
// カレンダータブへサーキット状のライン＋光点が走って「どこに追加されたか」を同時に教える。
// React stateを使わず document.body に直接描画して自動削除する（どのカードからでも1関数で呼べる）。

import { haptic } from './haptics';

const SVG_NS = 'http://www.w3.org/2000/svg';

function accentColor(): string {
  return getComputedStyle(document.documentElement).getPropertyValue('--accent-color').trim() || '#FBBF00';
}

/** いいねON時に呼ぶ。el はハートボタン要素。 */
export function likeEffect(el: HTMLElement): void {
  try {
    haptic.light(); // 各ページの haptic.select(selectionStart) は無振動なので、実振動はここで鳴らす
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) return;
    run(r.left + r.width / 2, r.top + r.height / 2);
  } catch { /* 演出はベストエフォート。失敗してもいいね自体は成立する */ }
}

function run(cx: number, cy: number): void {
  // viewBox を viewport サイズで明示し、パス座標(px)と画面座標を確実に1:1にする
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${vw} ${vh}`);
  svg.setAttribute('width', `${vw}`);
  svg.setAttribute('height', `${vh}`);
  svg.style.cssText = 'position:fixed;top:0;left:0;pointer-events:none;z-index:99999;';
  document.body.appendChild(svg);
  const color = accentColor();

  // ① 放射する線連鎖（6方向・各線は途中で1〜2回折れて連鎖する）
  for (let i = 0; i < 6; i++) {
    let a = (i / 6) * Math.PI * 2 + (Math.random() - 0.5) * 0.6;
    let x = cx + Math.cos(a) * 10;
    let y = cy + Math.sin(a) * 10;
    let d = `M ${x.toFixed(1)} ${y.toFixed(1)}`;
    const segs = 2 + (Math.random() < 0.5 ? 1 : 0);
    for (let s = 0; s < segs; s++) {
      const len = 12 + Math.random() * 14;
      x += Math.cos(a) * len;
      y += Math.sin(a) * len;
      d += ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
      a += (Math.random() < 0.5 ? 1 : -1) * (Math.PI / 4) * (0.5 + Math.random() * 0.8);
    }
    const p = document.createElementNS(SVG_NS, 'path');
    p.setAttribute('d', d);
    p.setAttribute('fill', 'none');
    p.setAttribute('stroke', color);
    p.setAttribute('stroke-width', '1.5');
    p.setAttribute('stroke-linecap', 'round');
    p.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(p);
    const L = p.getTotalLength();
    // 先端が描かれながら根元が消える＝線が「走り抜ける」
    p.style.strokeDasharray = `${L} ${L}`;
    p.animate(
      [{ strokeDashoffset: `${L}` }, { strokeDashoffset: `${-L}` }],
      { duration: 480, delay: i * 22, easing: 'cubic-bezier(0.22,1,0.36,1)', fill: 'both' },
    );
  }

  // ② 中心リング（タップ点の確認）。transform ではなく r 自体をアニメーションさせる
  const ring = document.createElementNS(SVG_NS, 'circle');
  ring.setAttribute('cx', `${cx}`);
  ring.setAttribute('cy', `${cy}`);
  ring.setAttribute('r', '4');
  ring.setAttribute('fill', 'none');
  ring.setAttribute('stroke', color);
  ring.setAttribute('stroke-width', '1.5');
  svg.appendChild(ring);
  ring.animate(
    [
      { r: '4px', opacity: 0.9 },
      { r: '20px', opacity: 0 },
    ],
    { duration: 420, easing: 'ease-out', fill: 'both' },
  );

  // ③ カレンダータブへのサーキットライン（直角に折れて走る）＋光点＋到着でタブが弾む
  const tab = document.querySelector<HTMLElement>('[data-nav-cal]');
  const tr = tab?.getBoundingClientRect();
  if (tab && tr && tr.width > 0) {
    const tx = tr.left + tr.width / 2;
    const ty = tr.top + 8;
    const my = ty - 26; // タブ手前で水平に曲がる高さ
    const d = `M ${cx} ${cy} L ${cx} ${my} L ${tx} ${my} L ${tx} ${ty}`;
    const p = document.createElementNS(SVG_NS, 'path');
    p.setAttribute('d', d);
    p.setAttribute('fill', 'none');
    p.setAttribute('stroke', color);
    p.setAttribute('stroke-width', '2');
    p.setAttribute('stroke-linejoin', 'round');
    p.setAttribute('stroke-linecap', 'round');
    svg.appendChild(p);
    const L = p.getTotalLength();
    const seg = Math.max(40, L * 0.22); // 走るパルスの長さ
    p.style.strokeDasharray = `${seg} ${L}`;
    p.animate(
      [{ strokeDashoffset: `${seg}` }, { strokeDashoffset: `${-L}` }],
      { duration: 520, delay: 60, easing: 'cubic-bezier(0.4,0,0.2,1)', fill: 'both' },
    );

    // 光点: SMIL の animateMotion でパス上を走らせる（座標系の食い違いが起きない）
    const dot = document.createElementNS(SVG_NS, 'circle');
    dot.setAttribute('r', '3');
    dot.setAttribute('fill', color);
    dot.setAttribute('opacity', '0');
    const motion = document.createElementNS(SVG_NS, 'animateMotion');
    motion.setAttribute('path', d);
    motion.setAttribute('dur', '0.52s');
    motion.setAttribute('begin', '0.06s');
    motion.setAttribute('fill', 'freeze');
    motion.setAttribute('keySplines', '0.4 0 0.2 1');
    motion.setAttribute('keyTimes', '0;1');
    motion.setAttribute('calcMode', 'spline');
    dot.appendChild(motion);
    svg.appendChild(dot);
    dot.animate(
      [
        { opacity: 0 },
        { opacity: 1, offset: 0.15 },
        { opacity: 1, offset: 0.85 },
        { opacity: 0 },
      ],
      { duration: 520, delay: 60, fill: 'both' },
    );

    setTimeout(() => {
      tab.animate(
        [{ transform: 'scale(1)' }, { transform: 'scale(1.22)' }, { transform: 'scale(1)' }],
        { duration: 300, easing: 'cubic-bezier(0.34,1.56,0.64,1)' },
      );
    }, 500);
  }

  setTimeout(() => svg.remove(), 1100);
}

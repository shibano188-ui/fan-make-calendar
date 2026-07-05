// ファンスター: 5軸の実績を「星形」で描く純SVGチャート（rechartsのレーダー代替）。
// 5つの外頂点＝各軸の値、間の5つの内頂点＝隣接軸の平均×0.45 で、値が育つと星が大きくなる。
// 成長した角（値がベースラインを超えた軸）は先端から光がチカチカ伸びる演出を入れる。
// タップでフォーカスリングが出る問題を避けるため装飾専用（aria-hidden）。

const TAU = Math.PI * 2;
const BASELINE = 15; // これを超えた軸は「成長した角」としてきらめく

type Datum = { axis: string; value: number }; // value: 0-100

function starPath(cx: number, cy: number, values: number[], rMax: number, innerRatio = 0.45): string {
  const n = values.length;
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const aOuter = -Math.PI / 2 + (i / n) * TAU;
    const rOuter = (values[i] / 100) * rMax;
    pts.push([cx + Math.cos(aOuter) * rOuter, cy + Math.sin(aOuter) * rOuter]);
    const aInner = aOuter + TAU / (n * 2);
    const rInner = ((values[i] + values[(i + 1) % n]) / 2 / 100) * rMax * innerRatio;
    pts.push([cx + Math.cos(aInner) * rInner, cy + Math.sin(aInner) * rInner]);
  }
  return `M ${pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(' L ')} Z`;
}

export default function FanStarChart({ data, size = 190 }: { data: Datum[]; size?: number }) {
  const cx = size / 2;
  const cy = size / 2 + 4;
  const rMax = size / 2 - 22; // ラベル余白（コンパクト）
  const values = data.map((d) => d.value);

  return (
    <svg width="100%" viewBox={`0 0 ${size} ${size}`} aria-hidden="true"
      style={{ display: 'block', maxHeight: size }}>
      <style>{`
        @keyframes starTip { 0%,100% { opacity: .12; transform: scale(1); } 50% { opacity: .95; transform: scale(1.5); } }
        .star-tip { animation: starTip 1.5s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
        @media (prefers-reduced-motion: reduce) { .star-tip { animation: none; opacity: .5; } }
      `}</style>
      {/* グリッド（星形の目盛り 33/66/100%） */}
      {[33, 66, 100].map((g) => (
        <path key={g} d={starPath(cx, cy, values.map(() => g), rMax)}
          fill="none" stroke="var(--separator)" strokeWidth={1} />
      ))}
      {/* データ星形 */}
      <path d={starPath(cx, cy, values, rMax)}
        fill="color-mix(in srgb, var(--accent-color) 32%, transparent)"
        stroke="var(--accent-color)" strokeWidth={1.75} strokeLinejoin="round" />
      {/* 成長した角のきらめき（先端の外側で光が明滅） */}
      {data.map((d, i) => {
        if (d.value <= BASELINE) return null;
        const a = -Math.PI / 2 + (i / data.length) * TAU;
        const r = (d.value / 100) * rMax;
        const tx = cx + Math.cos(a) * (r + 5);
        const ty = cy + Math.sin(a) * (r + 5);
        const s = 2.6; // 光のサイズ（4芒スパーク）
        return (
          <path key={`tip-${d.axis}`} className="star-tip"
            style={{ animationDelay: `${i * 0.28}s` }}
            d={`M ${tx} ${ty - s * 1.6} L ${tx + s * 0.5} ${ty - s * 0.5} L ${tx + s * 1.6} ${ty} L ${tx + s * 0.5} ${ty + s * 0.5} L ${tx} ${ty + s * 1.6} L ${tx - s * 0.5} ${ty + s * 0.5} L ${tx - s * 1.6} ${ty} L ${tx - s * 0.5} ${ty - s * 0.5} Z`}
            fill="var(--accent-color)" />
        );
      })}
      {/* 軸ラベル */}
      {data.map((d, i) => {
        const a = -Math.PI / 2 + (i / data.length) * TAU;
        const lx = cx + Math.cos(a) * (rMax + 13);
        const ly = cy + Math.sin(a) * (rMax + 11);
        return (
          <text key={d.axis} x={lx} y={ly} textAnchor="middle" dominantBaseline="middle"
            fontSize={9} fill="var(--label-secondary)">{d.axis}</text>
        );
      })}
    </svg>
  );
}

// Nothing風ローダー: 一列のドットの上を細線パルスが繋ぎながら走り続ける。
// AI解析待ちなど「数秒待たせる場面」の署名モチーフ。短い待ちはスケルトンを使うこと。
export default function LineLoader({ label }: { label?: string }) {
  const dots = 5;
  const gap = 16;
  const r = 2;
  const x0 = r + 1;
  const len = gap * (dots - 1);
  const w = len + (r + 1) * 2;
  const h = 8;
  const y = h / 2;
  return (
    <div className="flex flex-col items-center gap-2" role="status" aria-label={label ?? '読み込み中'}>
      <svg width={w} height={h} aria-hidden>
        {Array.from({ length: dots }, (_, i) => (
          <circle key={i} cx={x0 + i * gap} cy={y} r={r} fill="var(--label-tertiary)" />
        ))}
        {/* pathLength=100 で正規化し、keyframes(lineChain) を固定値で使い回す */}
        <path
          d={`M ${x0} ${y} L ${x0 + len} ${y}`}
          fill="none"
          stroke="var(--accent-color)"
          strokeWidth={1.5}
          strokeLinecap="round"
          pathLength={100}
          strokeDasharray="30 100"
          style={{ animation: 'lineChain 1.1s linear infinite' }}
        />
      </svg>
      {label && <span className="text-[12px] text-label-secondary">{label}</span>}
    </div>
  );
}

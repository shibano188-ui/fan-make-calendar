import FanHiveMark from './FanHiveMark';

// 起動のロゴ（2026-09-30）。黒地に黄色い六角形が1つずつはまって巣になり、真ん中から FanHive のマークが組み上がる
// （FanHive＝ハイブ＝巣。マークは 地 → F・H の棒 → 蜂が飛んできて横棒に止まる）。全部で約1.1秒。
// 毎回の起動画面（LaunchSplash）と、初回のようこその画面で同じものを使う。
// 動かすのは位置・大きさ・透明度だけ。端末の「視差効果を減らす」がオンなら、動かさずにマークだけ出す。

/** マークの組み上がりが終わるまで（ms）。これを過ぎたら次へ進んでよい */
export const LAUNCH_LOGO_MS = 1100;

const HONEY = '#FBBF00';

// とがった頭の六角形（半径16）。中心(60,60)のまわりに6つ、最後に真ん中
const R = 16;
const W = Math.sqrt(3) * R;
const CELLS: [number, number][] = [
  [60 - W / 2, 60 - 1.5 * R], [60 + W / 2, 60 - 1.5 * R], [60 + W, 60],
  [60 + W / 2, 60 + 1.5 * R], [60 - W / 2, 60 + 1.5 * R], [60 - W, 60],
  [60, 60],
];
const hexPoints = (cx: number, cy: number, r: number) =>
  Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 180) * (60 * i - 90);
    return `${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`;
  }).join(' ');

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export default function LaunchLogo({ size = 120 }: { size?: number }) {
  const reduced = prefersReducedMotion();
  const anim = (name: string, delayMs: number, durMs: number, ease = 'cubic-bezier(0.34,1.56,0.64,1)') =>
    reduced ? undefined : `${name} ${durMs}ms ${ease} ${delayMs}ms both`;
  const inner = Math.round(size * (100 / 120));
  return (
    <div className="relative" style={{ width: size, height: size }}>
      {!reduced && (
        <svg viewBox="0 0 120 120" className="absolute inset-0 w-full h-full" aria-hidden
          style={{ animation: anim('introHiveOut', 400, 160, 'ease-in') }}>
          {CELLS.map(([cx, cy], i) => (
            <polygon key={i} points={hexPoints(cx, cy, R - 1.2)} fill={HONEY}
              opacity={i === 6 ? 1 : 0.55 + (i % 3) * 0.15}
              style={{ transformOrigin: `${cx}px ${cy}px`, animation: anim('introCell', i === 6 ? 240 : i * 38, 380) }} />
          ))}
        </svg>
      )}
      {/* 巣が消えるところから、マークが組み上がる */}
      <div className="absolute rounded-[24px] overflow-hidden" style={{ inset: (size - inner) / 2, borderRadius: inner * 0.22 }}>
        {reduced ? <FanHiveMark size={inner} /> : <FanHiveMark size={inner} animate delayMs={420} />}
      </div>
    </div>
  );
}

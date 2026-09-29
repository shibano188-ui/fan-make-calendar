// FanHive のマーク（黄色の地に白い F と H。H の横棒に黄色い蜂が止まる）。
// 元のデータが無かったので、アイコンの画像（public/icon-512.png）を測って描き起こした（2026-09-30。public/logo.svg と同じ形）。
// animate を付けると、ようこその画面用に組み上がっていく:
//   地が広がる → F・H の棒が順に伸びる → 蜂が羽ばたきながら飛んできて横棒に止まる
// 動かすのは大きさ・位置・透明度だけ。各部品は自分の箱を基準に伸ばす（transform-box: fill-box）。

const HONEY = '#FBC000';

type Props = { size: number; animate?: boolean; delayMs?: number; className?: string };

export default function FanHiveMark({ size, animate = false, delayMs = 0, className }: Props) {
  // name: キーフレーム名 / at: 開始（ms・delayMs から数える）/ origin: 伸ばす起点
  const a = (name: string, at: number, dur: number, origin: string, ease = 'cubic-bezier(0.34,1.4,0.64,1)') =>
    animate ? { animation: `${name} ${dur}ms ${ease} ${delayMs + at}ms both`, transformBox: 'fill-box' as const, transformOrigin: origin } : undefined;
  return (
    <svg viewBox="0 0 512 512" width={size} height={size} className={className} role="img" aria-label="FanHive">
      <defs>
        <clipPath id="fh-stripes"><ellipse cx="325" cy="255.5" rx="29" ry="18.5" /></clipPath>
      </defs>
      <rect width="512" height="512" rx="112" fill={HONEY} style={a('markBase', 0, 420, 'center')} />
      <g fill="#fff">
        {/* F: 縦棒は上から下へ、横棒は左から右へ */}
        <rect x="103" y="166" width="40" height="180" style={a('markGrowY', 120, 300, 'top')} />
        <rect x="103" y="166" width="134" height="35" style={a('markGrowX', 200, 300, 'left')} />
        <rect x="103" y="242" width="124" height="35" style={a('markGrowX', 250, 300, 'left')} />
        {/* H: 2本の縦棒 → 横棒 */}
        <rect x="256" y="166" width="41" height="180" style={a('markGrowY', 220, 300, 'top')} />
        <rect x="368" y="166" width="41" height="180" style={a('markGrowY', 280, 300, 'top')} />
        <rect x="296" y="232" width="73" height="48" style={a('markGrowX', 340, 260, 'left')} />
      </g>
      {/* 蜂。左下から弧を描いて飛んできて、横棒に止まる。羽は止まるまで羽ばたく */}
      <g style={a('markBeeFly', 380, 620, 'center', 'cubic-bezier(0.22,1,0.36,1)')}>
        <g fill="#fff" style={animate ? { animation: `markWing 110ms ease-in-out ${delayMs + 380}ms 5 alternate`, transformBox: 'fill-box', transformOrigin: 'bottom' } : undefined}>
          <ellipse cx="331" cy="216" rx="14" ry="24" transform="rotate(-33 331 216)" />
        </g>
        <g fill="#fff" style={animate ? { animation: `markWing 110ms ease-in-out ${delayMs + 380}ms 5 alternate`, transformBox: 'fill-box', transformOrigin: 'top' } : undefined}>
          <ellipse cx="331" cy="296" rx="14" ry="24" transform="rotate(33 331 296)" />
        </g>
        <g fill={HONEY}>
          <path d="M277 256 L297 248.5 L297 263.5 Z" />
          <ellipse cx="325" cy="256" rx="33.5" ry="23" />
          <circle cx="365" cy="255.5" r="13" />
        </g>
        <g stroke={HONEY} strokeWidth="4.5" strokeLinecap="round" fill="none">
          <path d="M375 250 L387 243" /><path d="M375 261 L387 268" />
        </g>
        <g fill="#fff" clipPath="url(#fh-stripes)">
          <rect x="301" y="230" width="9" height="52" />
          <rect x="318" y="230" width="9.5" height="52" />
          <rect x="337" y="230" width="8.5" height="52" />
        </g>
      </g>
    </svg>
  );
}

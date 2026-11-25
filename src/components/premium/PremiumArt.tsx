// 課金の案内（pages/Premium.tsx）の絵。2026-11-26 柴野「文字が多すぎて圧倒される。イラストを入れて華やかに」。
// ロゴのハチと六角形だけで描く（ほかの画面と同じ持ち物）。塗りの色は作品の色（lib/workColors.ts）とはちみつ色で固定、
// 線はテーマの文字色に合わせる（暗いテーマでも線が消えない）。動きは index.css の pw* で、動きを減らす設定なら止まる。

const HONEY = '#FBC000';
const INK = 'var(--label-primary)';
// ハチは絵の登場人物なので、テーマで色を変えない（暗いテーマで頭が白く抜けるのを防ぐ）
const BEE_INK = '#2B2B2B';
// WORK_COLORS から、並べたときに隣どうしが似ない順に抜いたもの
const HEX_COLORS = ['#FF6B6B', '#4FC3F7', '#81C784', '#FFB74D', '#BA68C8', '#F06292', '#4DB6AC'];

/** 横に平らな六角形の頂点 */
function hex(cx: number, cy: number, r: number): string {
  const h = r * 0.866;
  return [[cx - r, cy], [cx - r / 2, cy - h], [cx + r / 2, cy - h], [cx + r, cy], [cx + r / 2, cy + h], [cx - r / 2, cy + h]]
    .map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
}

/** ロゴのハチを上から見た形（右向き）。x,y は胴の中心。s は大きさの倍率 */
function Bee({ x, y, s = 1, flap = true }: { x: number; y: number; s?: number; flap?: boolean }) {
  const wing = flap ? { animation: 'markWing 110ms ease-in-out infinite alternate', transformBox: 'fill-box' as const } : undefined;
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <ellipse cx="-2" cy="-15" rx="9" ry="14" transform="rotate(-25 -2 -15)" fill="#fff" stroke={BEE_INK} strokeWidth="1.6"
        style={wing ? { ...wing, transformOrigin: 'bottom' } : undefined} />
      <ellipse cx="-2" cy="15" rx="9" ry="14" transform="rotate(25 -2 15)" fill="#fff" stroke={BEE_INK} strokeWidth="1.6"
        style={wing ? { ...wing, transformOrigin: 'top' } : undefined} />
      <path d="M-30 0 L-22 -4 L-22 4 Z" fill={BEE_INK} />
      <ellipse cx="0" cy="0" rx="22" ry="15" fill={HONEY} stroke={BEE_INK} strokeWidth="1.8" />
      <path d="M-9 -14 Q-6 0 -9 14 M1 -15 Q4 0 1 15" stroke={BEE_INK} strokeWidth="4" fill="none" />
      <circle cx="25" cy="0" r="10" fill={BEE_INK} />
      <circle cx="29" cy="-4" r="2.4" fill="#fff" />
      <circle cx="29" cy="4" r="2.4" fill="#fff" />
      <path d="M31 -8 Q38 -16 42 -14 M31 8 Q38 16 42 14" stroke={BEE_INK} strokeWidth="1.6" fill="none" strokeLinecap="round" />
    </g>
  );
}

/** 一番上の絵: ハチのまわりに、色とりどりの六角形（＝推しの作品）が舞っている */
export function HeroArt() {
  const bits: { x: number; y: number; r: number; c: number; d: number }[] = [
    { x: 34, y: 34, r: 11, c: 0, d: 0 }, { x: 78, y: 18, r: 7, c: 1, d: 0.6 }, { x: 250, y: 26, r: 10, c: 2, d: 0.3 },
    { x: 292, y: 62, r: 7, c: 3, d: 0.9 }, { x: 22, y: 92, r: 7, c: 4, d: 1.2 }, { x: 276, y: 108, r: 12, c: 5, d: 0.2 },
    { x: 62, y: 120, r: 9, c: 6, d: 0.8 }, { x: 214, y: 128, r: 6, c: 0, d: 1.4 },
  ];
  return (
    <svg viewBox="0 0 320 150" className="w-full h-auto" aria-hidden="true">
      {bits.map((b, i) => (
        <polygon key={i} points={hex(b.x, b.y, b.r)} fill={HEX_COLORS[b.c]}
          style={{ animation: `pwFloat 3.2s ease-in-out ${b.d}s infinite alternate`, transformBox: 'fill-box', transformOrigin: 'center' }} />
      ))}
      {/* まん中の巣: 7つの六角形。真ん中だけはちみつ色 */}
      <g transform="translate(160 78)">
        {[[0, 0], [0, -36], [0, 36], [-31, -18], [31, -18], [-31, 18], [31, 18]].map(([dx, dy], i) => (
          <polygon key={i} points={hex(dx, dy, 19)} fill={i === 0 ? HONEY : HEX_COLORS[i - 1]} stroke="var(--bg-primary)" strokeWidth="3" />
        ))}
      </g>
      <g style={{ animation: 'pwBob 2.4s ease-in-out infinite alternate' }}>
        <Bee x={232} y={56} s={0.9} />
      </g>
    </svg>
  );
}

/** フォロー無制限: 作品の六角形がつながって増えていく。最後の1マスは「まだ足せる」の点線 */
export function FollowArt() {
  const cells: [number, number][] = [[26, 44], [52, 29], [52, 59], [78, 44], [104, 29], [104, 59]];
  return (
    <svg viewBox="0 0 150 88" className="w-full h-auto" aria-hidden="true">
      {cells.map(([x, y], i) => (
        <polygon key={i} points={hex(x, y, 16)} fill={HEX_COLORS[i]} stroke="var(--bg-primary)" strokeWidth="2.5" />
      ))}
      <polygon points={hex(130, 44, 16)} fill="none" stroke={INK} strokeWidth="1.6" strokeDasharray="4 3" opacity="0.55" />
      <path d="M130 37 V51 M123 44 H137" stroke={INK} strokeWidth="2" strokeLinecap="round" opacity="0.55" />
    </svg>
  );
}

/** 広告なし: スマホの下の広告の帯を、ハチが持って飛んでいく */
export function NoAdsArt() {
  return (
    <svg viewBox="0 0 150 88" className="w-full h-auto" aria-hidden="true">
      <rect x="22" y="6" width="54" height="78" rx="9" fill="var(--bg-primary)" stroke={INK} strokeWidth="1.8" />
      <rect x="30" y="16" width="38" height="12" rx="3" fill={HEX_COLORS[1]} />
      <rect x="30" y="32" width="38" height="12" rx="3" fill={HEX_COLORS[2]} />
      <rect x="30" y="48" width="38" height="12" rx="3" fill={HEX_COLORS[5]} />
      {/* 外れた広告の帯の跡 */}
      <rect x="30" y="66" width="38" height="10" rx="2" fill="none" stroke={INK} strokeWidth="1.2" strokeDasharray="3 3" opacity="0.4" />
      <g style={{ animation: 'pwBob 2.4s ease-in-out 0.4s infinite alternate' }}>
        <g transform="rotate(-14 104 52)">
          <rect x="84" y="50" width="40" height="15" rx="2" fill="var(--fill-tertiary)" stroke={INK} strokeWidth="1.4" />
          <text x="104" y="61" textAnchor="middle" fontSize="9" fontWeight="700" fill={INK} opacity="0.6">AD</text>
        </g>
        <path d="M95 47 L108 26 M115 45 L110 26" stroke={INK} strokeWidth="1" opacity="0.6" />
        <Bee x={112} y={18} s={0.5} />
      </g>
    </svg>
  );
}

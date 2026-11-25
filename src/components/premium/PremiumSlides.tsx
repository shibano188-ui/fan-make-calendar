import { useEffect, useRef, useState } from 'react';
import { haptic } from '../../lib/haptics';

// 課金の案内の本体（2026-11-26 柴野「文字だけで説明していて、文字が多すぎる。オンボーディングの最後に急に出ると読む気が失せる」）。
// 1枚に一言だけ。何が起きるかは絵の動きで見せる。自動で送り、指でも払える。
// 動きは index.css の pw*。動きを減らす設定なら止まった絵になる（それでも一枚で分かる絵にしてある）。

const HONEY = '#FBC000';
const INK = '#2B2B2B';
const COLORS = ['#FF6B6B', '#4FC3F7', '#81C784', '#FFB74D', '#BA68C8', '#F06292', '#4DB6AC', '#7986CB', '#9CCC65'];
const AUTO_MS = 2600;

function hex(cx: number, cy: number, r: number): string {
  const h = r * 0.866;
  return [[cx - r, cy], [cx - r / 2, cy - h], [cx + r / 2, cy - h], [cx + r, cy], [cx + r / 2, cy + h], [cx - r / 2, cy + h]]
    .map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
}

/** 1. フォロー無制限: 作品の六角形が次々に増えていく */
function FollowArt() {
  const cells: [number, number][] = [];
  for (let c = 0; c < 6; c++) for (let r = 0; r < 3; r++) cells.push([60 + c * 40, 62 + r * 46 + (c % 2) * 23]);
  return (
    <svg viewBox="0 0 320 220" className="w-full h-full" aria-hidden="true">
      {cells.map(([x, y], i) => (
        <polygon key={i} points={hex(x, y, 24)} fill={COLORS[i % COLORS.length]} stroke="var(--bg-primary)" strokeWidth="3"
          style={{ animation: `pwPop 2.6s ${(i * 0.09).toFixed(2)}s both infinite`, transformBox: 'fill-box', transformOrigin: 'center' }} />
      ))}
    </svg>
  );
}

/** 2. 広告なし: スマホの下の広告の帯が外れて飛んでいく */
function NoAdsArt() {
  return (
    <svg viewBox="0 0 320 220" className="w-full h-full" aria-hidden="true">
      <rect x="110" y="14" width="100" height="192" rx="16" fill="var(--bg-primary)" stroke="var(--label-primary)" strokeWidth="3" />
      {[0, 1, 2, 3].map((i) => <rect key={i} x="124" y={34 + i * 34} width="72" height="26" rx="5" fill={COLORS[i + 1]} />)}
      <g style={{ animation: 'pwFlyAway 2.6s ease-in-out infinite' }}>
        <rect x="120" y="172" width="80" height="22" rx="4" fill="var(--fill-tertiary)" stroke="var(--label-primary)" strokeWidth="2" />
        <text x="160" y="188" textAnchor="middle" fontSize="13" fontWeight="800" fill="var(--label-primary)" opacity="0.55">AD</text>
      </g>
    </svg>
  );
}

/** 3. 受付開始の瞬間に知らせる: 画面の上から知らせが降りてきて、ベルが揺れる */
function AlertArt() {
  return (
    <svg viewBox="0 0 320 220" className="w-full h-full" aria-hidden="true">
      <rect x="90" y="12" width="140" height="196" rx="20" fill="var(--bg-secondary)" stroke="var(--label-primary)" strokeWidth="3" />
      <text x="160" y="72" textAnchor="middle" fontSize="34" fontWeight="800" fill="var(--label-primary)" fontFamily="Outfit, sans-serif">10:00</text>
      <g style={{ animation: 'pwDrop 2.6s cubic-bezier(.2,.9,.3,1.2) infinite' }}>
        <rect x="100" y="92" width="120" height="44" rx="12" fill="var(--bg-primary)" stroke="var(--separator)" strokeWidth="1.5" />
        <rect x="108" y="100" width="28" height="28" rx="7" fill={HONEY} />
        <rect x="142" y="104" width="66" height="7" rx="3.5" fill="var(--label-primary)" opacity="0.8" />
        <rect x="142" y="117" width="46" height="7" rx="3.5" fill="var(--label-primary)" opacity="0.35" />
      </g>
      <g style={{ animation: 'pwRing 2.6s ease-in-out infinite', transformBox: 'fill-box', transformOrigin: '50% 10%' }}>
        <path d="M262 64 q0 -22 -20 -26 q-20 4 -20 26 v18 l-8 10 h56 l-8 -10 z" fill={HONEY} stroke={INK} strokeWidth="2.5" strokeLinejoin="round" transform="translate(-6 0)" />
        <circle cx="236" cy="98" r="6" fill={INK} />
      </g>
    </svg>
  );
}

/** 4. 値下げ・再入荷: 値札の数字が下がる */
function PriceArt() {
  return (
    <svg viewBox="0 0 320 220" className="w-full h-full" aria-hidden="true">
      <g transform="rotate(-8 160 110)">
        <path d="M70 70 h150 l40 40 l-40 40 h-150 z" fill={HONEY} stroke={INK} strokeWidth="3" strokeLinejoin="round" />
        <circle cx="222" cy="110" r="8" fill="var(--bg-primary)" stroke={INK} strokeWidth="2.5" />
        <g style={{ animation: 'pwOld 2.6s ease-in-out infinite' }}>
          <text x="140" y="100" textAnchor="middle" fontSize="24" fontWeight="800" fill={INK} fontFamily="Outfit, sans-serif">¥3,300</text>
          <line x1="96" y1="92" x2="184" y2="92" stroke="#e5484d" strokeWidth="4" strokeLinecap="round" style={{ animation: 'pwStrike 2.6s ease-in-out infinite', transformBox: 'fill-box', transformOrigin: 'left' }} />
        </g>
        <text x="140" y="136" textAnchor="middle" fontSize="32" fontWeight="800" fill="#e5484d" fontFamily="Outfit, sans-serif"
          style={{ animation: 'pwNew 2.6s ease-in-out infinite' }}>¥2,480</text>
      </g>
    </svg>
  );
}

/** 5. 新着をすぐ: 作品の丸に新着の輪が付き、NEW が出る */
function NewArt() {
  return (
    <svg viewBox="0 0 320 220" className="w-full h-full" aria-hidden="true">
      {[0, 1, 2].map((i) => {
        const cx = 90 + i * 70;
        return (
          <g key={i}>
            <circle cx={cx} cy="100" r="30" fill="none" stroke={i === 1 ? '#e5484d' : 'var(--fill-secondary)'} strokeWidth="5"
              style={i === 1 ? { animation: 'pwRingIn 2.6s ease-out infinite', transformBox: 'fill-box', transformOrigin: 'center' } : undefined} />
            <circle cx={cx} cy="100" r="23" fill={COLORS[i * 2 + 1]} />
            <rect x={cx - 20} y="146" width="40" height="7" rx="3.5" fill="var(--label-primary)" opacity="0.3" />
          </g>
        );
      })}
      <g style={{ animation: 'pwNew 2.6s ease-in-out infinite' }}>
        <rect x="170" y="56" width="46" height="22" rx="11" fill="#e5484d" />
        <text x="193" y="72" textAnchor="middle" fontSize="13" fontWeight="800" fill="#fff" fontFamily="Outfit, sans-serif">NEW</text>
      </g>
    </svg>
  );
}

/** 6. いつものカレンダーに自動で: 予定のカードがカレンダーのマスへ飛んでいく */
function SyncArt() {
  return (
    <svg viewBox="0 0 320 220" className="w-full h-full" aria-hidden="true">
      <rect x="150" y="40" width="140" height="150" rx="14" fill="var(--bg-primary)" stroke="var(--label-primary)" strokeWidth="3" />
      <rect x="150" y="40" width="140" height="30" rx="14" fill="#e5484d" />
      <rect x="150" y="56" width="140" height="14" fill="#e5484d" />
      {Array.from({ length: 12 }, (_, i) => (
        <rect key={i} x={162 + (i % 4) * 30} y={82 + Math.floor(i / 4) * 34} width="24" height="26" rx="4" fill="var(--fill-tertiary)" />
      ))}
      <rect x="222" y="116" width="24" height="26" rx="4" fill={HONEY} style={{ animation: 'pwNew 2.6s ease-in-out infinite' }} />
      <g style={{ animation: 'pwSend 2.6s ease-in-out infinite' }}>
        <rect x="28" y="96" width="84" height="40" rx="9" fill={HONEY} stroke={INK} strokeWidth="2.5" />
        <rect x="38" y="106" width="50" height="7" rx="3.5" fill={INK} />
        <rect x="38" y="119" width="34" height="7" rx="3.5" fill={INK} opacity="0.4" />
      </g>
    </svg>
  );
}

/** 7. AIのテーマを何個でも（保存は無制限・作れるのは1日20回なので「作り放題」とは書かない）: 言葉の吹き出しから、スマホの見た目が次々に変わる */
function ThemeArt() {
  const sw = ['#FFB74D', '#4FC3F7', '#BA68C8', '#81C784'];
  return (
    <svg viewBox="0 0 320 220" className="w-full h-full" aria-hidden="true">
      <g>
        <rect x="14" y="44" width="132" height="46" rx="14" fill="var(--bg-primary)" stroke="var(--label-primary)" strokeWidth="2.5" />
        <path d="M110 89 l14 16 l-2 -17 z" fill="var(--bg-primary)" stroke="var(--label-primary)" strokeWidth="2.5" strokeLinejoin="round" />
        <text x="80" y="73" textAnchor="middle" fontSize="15" fontWeight="700" fill="var(--label-primary)">夜の水族館</text>
      </g>
      <text x="150" y="132" fontSize="20" fill={HONEY} style={{ animation: 'pwRing 2.6s ease-in-out infinite', transformBox: 'fill-box', transformOrigin: 'center' }}>✦</text>
      {sw.map((c, i) => (
        // 傾きは外の g、出てくる動きは中の rect に分ける（同じ要素に付けると CSS の動きが傾きを上書きする）
        <g key={i} transform={`rotate(${(i - 1.5) * 9} 236 240)`}>
          <rect x="204" y="52" width="64" height="130" rx="14" fill={c} stroke="var(--bg-primary)" strokeWidth="3"
            style={{ animation: `pwPop 2.6s ${(0.3 + i * 0.12).toFixed(2)}s both infinite`, transformBox: 'fill-box', transformOrigin: 'bottom' }} />
          <rect x="214" y="70" width="44" height="8" rx="4" fill="#fff" opacity="0.7" />
          <rect x="214" y="86" width="30" height="8" rx="4" fill="#fff" opacity="0.5" />
        </g>
      ))}
    </svg>
  );
}

export function PremiumSlides() {
  const slides: { art: JSX.Element; line: string; note?: string }[] = [
    { art: <FollowArt />, line: '推しを、いくつでも' },
    { art: <NoAdsArt />, line: '広告なし' },
    { art: <AlertArt />, line: '受付開始の瞬間に通知' },
    { art: <PriceArt />, line: '値下げ・再入荷も通知' },
    // 分かりにくい3つだけ、短い補足を1行（2026-11-26 柴野「そもそもどういうこと？ってなりそう」）
    { art: <NewArt />, line: '新着をすぐ見られる', note: '無料は毎朝9時にまとめて' },
    { art: <SyncArt />, line: 'いつものカレンダーに自動で', note: 'Apple・Google・Outlook と同期' },
    { art: <ThemeArt />, line: 'AIのテーマを何個でも', note: '言葉で伝えると、アプリの見た目をAIが作ります' },
  ];
  const [at, setAt] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const touched = useRef(false);

  // 自動で送る。指で触ったら止める（読んでいる人の邪魔をしない）
  useEffect(() => {
    const id = setInterval(() => {
      if (touched.current) return;
      const box = boxRef.current;
      if (!box) return;
      const next = (Math.round(box.scrollLeft / box.clientWidth) + 1) % slides.length;
      box.scrollTo({ left: next * box.clientWidth, behavior: next === 0 ? 'auto' : 'smooth' });
    }, AUTO_MS);
    return () => clearInterval(id);
  }, [slides.length]);

  return (
    <div>
      <div ref={boxRef} className="flex overflow-x-auto snap-x snap-mandatory" style={{ scrollbarWidth: 'none' }}
        onPointerDown={() => { touched.current = true; }}
        onScroll={(e) => { const el = e.currentTarget; const i = Math.round(el.scrollLeft / el.clientWidth); if (i !== at) { setAt(i); if (touched.current) haptic.select(); } }}>
        {slides.map((s) => (
          <div key={s.line} className="snap-center flex-shrink-0 w-full flex flex-col items-center px-6">
            <div className="w-full max-w-[320px] aspect-[32/22]">{s.art}</div>
            <p className="text-[24px] font-extrabold mt-3 text-center leading-tight">{s.line}</p>
            <p className="text-[12px] text-label-secondary mt-1.5 h-4 text-center">{s.note ?? ''}</p>
          </div>
        ))}
      </div>
      <div className="flex justify-center gap-1.5 mt-3" aria-hidden="true">
        {slides.map((s, i) => (
          <span key={s.line} className="h-1.5 rounded-full transition-all"
            style={{ width: i === at ? 18 : 6, backgroundColor: i === at ? 'var(--label-primary)' : 'var(--fill-secondary)' }} />
        ))}
      </div>
    </div>
  );
}

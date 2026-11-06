import { useRef, useState, type ReactNode } from 'react';
import { haptic } from '../../lib/haptics';

// 左へスワイプして、1件を外す・隠す（2026-11-07 柴野「探す・カレンダーの予定タイルでもスワイプで消したい」）。
// ボード（SavedBoard）・カレンダーのリスト・探すで共通。中のボタンはそのまま押せる。
// 縦のスクロールは邪魔しない（横に動いたと分かってから指をつかむ）。払った後は高さを縮めてから onSwipe を呼ぶ

type Props = {
  children: ReactNode;
  /** 払いきったとき。親がこの1件を一覧から外す */
  onSwipe: () => void;
  /** 下から見える文字（「外す」「非表示」） */
  label: string;
  /** 下の地の色 */
  color?: string;
  /** 角を丸める（カードを包むとき。カードと同じ丸みにする） */
  radius?: number;
  disabled?: boolean;
};

export default function SwipeRow({ children, onSwipe, label, color = 'var(--color-destructive)', radius = 0, disabled }: Props) {
  const [dx, setDx] = useState(0);
  const [phase, setPhase] = useState<'idle' | 'drag' | 'out' | 'collapse'>('idle');
  const [h, setH] = useState<number | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; on: boolean; past: boolean } | null>(null);
  // 払った直後のクリック（指を離したときに出る）で詳細が開かないようにする
  const swiped = useRef(false);

  const threshold = () => Math.min(110, (wrap.current?.offsetWidth ?? 300) * 0.32);

  const finish = () => {
    haptic.select();
    setPhase('out');
    setTimeout(() => {
      setH(wrap.current?.offsetHeight ?? 0);
      requestAnimationFrame(() => requestAnimationFrame(() => setPhase('collapse')));
      setTimeout(onSwipe, 200);
    }, 170);
  };

  if (disabled) return <>{children}</>;
  return (
    <div ref={wrap} className="relative overflow-hidden"
      style={{
        borderRadius: radius, touchAction: 'pan-y',
        height: phase === 'collapse' ? 0 : h ?? undefined,
        transition: phase === 'collapse' ? 'height .2s ease' : undefined,
      }}
      onClickCapture={(e) => { if (swiped.current) { e.preventDefault(); e.stopPropagation(); } }}
      onPointerDown={(e) => {
        if (phase !== 'idle' || e.button !== 0) return;
        drag.current = { x: e.clientX, y: e.clientY, on: false, past: false };
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        const mx = e.clientX - d.x, my = e.clientY - d.y;
        if (!d.on) {
          // 横に 10px 動き、縦より十分大きければ横のスワイプとみなす。先に縦へ動いたらスクロールに任せる
          if (mx < -10 && Math.abs(mx) > Math.abs(my) * 1.4) {
            d.on = true;
            setPhase('drag');
            try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* noop */ }
          } else if (Math.abs(my) > 10 || mx > 10) { drag.current = null; return; }
          else return;
        }
        const x = Math.min(0, mx + 10);
        const past = -x > threshold();
        // しきい値を越えた・戻ったときに軽く震わせる（離せば外れる、が指で分かるように）
        if (past !== d.past) { d.past = past; haptic.select(); }
        setDx(x);
      }}
      onPointerUp={() => {
        const d = drag.current;
        drag.current = null;
        if (!d?.on) return;
        swiped.current = true;
        setTimeout(() => { swiped.current = false; }, 80);
        if (d.past) finish();
        else { setDx(0); setPhase('idle'); }
      }}
      onPointerCancel={() => { drag.current = null; setDx(0); setPhase('idle'); }}>
      {/* 下の地。指の動きに合わせて文字が見えてくる */}
      <div aria-hidden className="absolute inset-0 flex items-center justify-end pr-5"
        // 止まっているときは隠す（丸い角の縁から色がにじまないように）。戻る動きが終わってから消す
        style={{ backgroundColor: color, opacity: phase === 'idle' ? 0 : 1, transition: phase === 'idle' ? 'opacity 0s .2s' : 'none' }}>
        <span className="text-[13px] font-bold text-white transition-transform"
          style={{ transform: `scale(${-dx > threshold() || phase !== 'drag' ? 1 : 0.85})` }}>{label}</span>
      </div>
      <div className="relative"
        style={{
          transform: phase === 'out' || phase === 'collapse' ? 'translateX(-105%)' : `translateX(${dx}px)`,
          transition: phase === 'drag' ? 'none' : 'transform .2s ease',
        }}>
        {children}
      </div>
    </div>
  );
}

import { useRef, useState, type ReactNode } from 'react';
import { haptic } from '../../lib/haptics';

// 1件を横に払う（2026-11-07 柴野）。ボード・カレンダーのリスト・探すで共通。中のボタンはそのまま押せる。
//   左へ払う＝消す側（カレンダーから外す・探すから非表示）。払いきると高さを縮めてから onSwipe を呼ぶ
//   右へ払う＝足す側（探すは ♡ でカレンダーに追加、カレンダーは重要な予定にする）。行は元の位置に戻る
// iPhone のメールなどと同じく、右へ払うのが前向き・左へ払うのが消す、にそろえている。
// 縦のスクロールは邪魔しない（横に動いたと分かってから指をつかむ）

type Side = { label: ReactNode; color: string };

type Props = {
  children: ReactNode;
  /** 左へ払いきったとき。親がこの1件を一覧から外す */
  onSwipe?: () => void;
  /** 左へ払うときに下から見える文字（「外す」「非表示」） */
  label?: ReactNode;
  color?: string;
  /** 右へ払いきったとき（行は戻る）。無ければ右へは払えない */
  right?: Side & { onSwipe: () => void };
  /** 角を丸める（カードを包むとき。カードと同じ丸みにする） */
  radius?: number;
  disabled?: boolean;
};

export default function SwipeRow({ children, onSwipe, label, color = 'var(--color-destructive)', right, radius = 0, disabled }: Props) {
  const [dx, setDx] = useState(0);
  const [phase, setPhase] = useState<'idle' | 'drag' | 'out' | 'collapse'>('idle');
  const [h, setH] = useState<number | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; dir: -1 | 1 | 0; past: boolean } | null>(null);
  // 払った直後のクリック（指を離したときに出る）で詳細が開かないようにする
  const swiped = useRef(false);

  const threshold = () => Math.min(110, (wrap.current?.offsetWidth ?? 300) * 0.32);

  const finishLeft = () => {
    haptic.select();
    setPhase('out');
    setTimeout(() => {
      setH(wrap.current?.offsetHeight ?? 0);
      requestAnimationFrame(() => requestAnimationFrame(() => setPhase('collapse')));
      setTimeout(() => onSwipe?.(), 200);
    }, 170);
  };

  if (disabled || (!onSwipe && !right)) return <>{children}</>;
  const dir = dx < 0 ? -1 : dx > 0 ? 1 : (drag.current?.dir ?? 0);
  const side = dir > 0 ? right : { label, color };
  return (
    <div ref={wrap} className="relative overflow-hidden"
      style={{
        borderRadius: radius, touchAction: 'pan-y',
        height: phase === 'collapse' ? 0 : h ?? undefined,
        transition: phase === 'collapse' ? 'height .2s ease' : undefined,
      }}
      onClickCapture={(e) => { if (swiped.current) { e.preventDefault(); e.stopPropagation(); } }}
      // パソコンのマウスで画像の上から払うと、画像のドラッグが始まって払えないので止める
      onDragStart={(e) => e.preventDefault()}
      onPointerDown={(e) => {
        if (phase !== 'idle' || e.button !== 0) return;
        drag.current = { x: e.clientX, y: e.clientY, dir: 0, past: false };
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        const mx = e.clientX - d.x, my = e.clientY - d.y;
        if (!d.dir) {
          // 横に 10px 動き、縦より十分大きければ横のスワイプとみなす。先に縦へ動いたらスクロールに任せる
          const horiz = Math.abs(mx) > 10 && Math.abs(mx) > Math.abs(my) * 1.4;
          if (horiz && mx < 0 && onSwipe) d.dir = -1;
          else if (horiz && mx > 0 && right) d.dir = 1;
          else if (Math.abs(my) > 10 || Math.abs(mx) > 10) { drag.current = null; return; }
          else return;
          setPhase('drag');
          try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* noop */ }
        }
        const x = d.dir < 0 ? Math.min(0, mx + 10) : Math.max(0, mx - 10);
        const past = Math.abs(x) > threshold();
        // しきい値を越えた・戻ったときに軽く震わせる（離せば決まる、が指で分かるように）
        if (past !== d.past) { d.past = past; haptic.select(); }
        setDx(x);
      }}
      onPointerUp={() => {
        const d = drag.current;
        drag.current = null;
        if (!d?.dir) return;
        swiped.current = true;
        setTimeout(() => { swiped.current = false; }, 80);
        if (d.past && d.dir < 0) { finishLeft(); return; }
        if (d.past && d.dir > 0) right?.onSwipe();
        setDx(0); setPhase('idle');
      }}
      onPointerCancel={() => { drag.current = null; setDx(0); setPhase('idle'); }}>
      {/* 下の地。指の動きに合わせて文字が見えてくる。止まっているときは隠す（丸い角の縁から色がにじまないように） */}
      {side && (
        <div aria-hidden className={`absolute inset-0 flex items-center ${dir > 0 ? 'justify-start pl-5' : 'justify-end pr-5'}`}
          style={{ backgroundColor: side.color, opacity: phase === 'idle' ? 0 : 1, transition: phase === 'idle' ? 'opacity 0s .2s' : 'none' }}>
          <span className="text-[13px] font-bold text-white flex items-center gap-1 transition-transform"
            style={{ transform: `scale(${Math.abs(dx) > threshold() || phase !== 'drag' ? 1 : 0.85})` }}>{side.label}</span>
        </div>
      )}
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

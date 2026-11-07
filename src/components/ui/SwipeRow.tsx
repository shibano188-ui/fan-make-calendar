import { useRef, useState, type ReactNode } from 'react';
import { haptic } from '../../lib/haptics';

// 1件を横に払う（2026-11-07 柴野）。ボード・カレンダーのリスト・探すで共通。中のボタンはそのまま押せる。
//   左へ払う＝消す側（カレンダーから外す・探すから非表示）
//   右へ払う＝足す側（探すは ♡ でカレンダーに追加、カレンダーは通知の ON／OFF）
// iPhone のメールなどと同じく、右へ払うのが前向き・左へ払うのが消す、にそろえている。
// 縦のスクロールは邪魔しない（横に 16px 動いたと分かってから指をつかむ）。
//
// 決まったときの動き（柴野「払ってすぐ反発して戻ってくる。一回吹き飛んで、真ん中にマークが出るのがいい」。
// Gmail は払ったあとアイコンが動いて何をしたか確かめさせ、消える行は横へ出たあと高さが縮んで詰まる）:
//   左 … 行が左へ飛んでいき、真ん中にマーク（ゴミ箱など）がポンと出る → 行が細い線になって消える → onSwipe
//   右 … 行が右へ飛んでいき、真ん中にマーク（ベル・♡）がポンと出る → 少し見せてから、行が右から戻ってくる
// 決まる条件: 幅の半分まで払う、または勢いよく払う（0.6px/ms 以上・幅の 25% 以上）

type Side = { label: ReactNode; color: string; icon?: ReactNode };

type Props = {
  children: ReactNode;
  /** 左へ払いきったとき。親がこの1件を一覧から外す */
  onSwipe?: () => void;
  /** 左へ払うときに下から見える文字（「外す」「非表示」）とマーク */
  label?: ReactNode;
  icon?: ReactNode;
  color?: string;
  /** 右へ払いきったとき（行は戻ってくる）。無ければ右へは払えない */
  right?: Side & { onSwipe: () => void };
  /** 角を丸める（カードを包むとき。カードと同じ丸みにする） */
  radius?: number;
  disabled?: boolean;
};

type Phase = 'idle' | 'drag' | 'snap' | 'out' | 'collapse' | 'fly' | 'back';

export default function SwipeRow({ children, onSwipe, label, icon, color = 'var(--color-destructive)', right, radius = 0, disabled }: Props) {
  const [dx, setDx] = useState(0);
  const [phase, setPhase] = useState<Phase>('idle');
  const [h, setH] = useState<number | null>(null);
  // 決まったときの側（文字・マークは決めた瞬間のものを出し続ける。通知が ON に変わって「OFF」に変わらないように）
  const [done, setDone] = useState<{ side: Side; dir: 1 | -1 } | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; dir: -1 | 1 | 0; past: boolean; vx: number; lx: number; lt: number } | null>(null);
  // 払った直後のクリック（指を離したときに出る）で詳細が開かないようにする
  const swiped = useRef(false);

  const width = () => wrap.current?.offsetWidth ?? 300;
  const threshold = () => width() * 0.5;

  const commitLeft = () => {
    haptic.select();
    setDone({ side: { label, color, icon }, dir: -1 });
    setPhase('out');
    setTimeout(() => {
      setH(wrap.current?.offsetHeight ?? 0);
      requestAnimationFrame(() => requestAnimationFrame(() => setPhase('collapse')));
      setTimeout(() => onSwipe?.(), 260);
    }, 420);
  };
  const commitRight = () => {
    if (!right) return;
    haptic.select();
    setDone({ side: { label: right.label, color: right.color, icon: right.icon }, dir: 1 });
    setPhase('fly');
    right.onSwipe();
    // マークを見せてから、行を右から戻す
    setTimeout(() => {
      setPhase('back');
      setDx(0);
      setTimeout(() => { setPhase('idle'); setDone(null); }, 400);
    }, 650);
  };

  if (disabled || (!onSwipe && !right)) return <>{children}</>;
  const live = dx < 0 ? -1 : dx > 0 ? 1 : (drag.current?.dir ?? 0);
  const side: Side | undefined = done?.side ?? (live > 0 ? right : { label, color, icon });
  const dir = done?.dir ?? live;
  const finished = phase === 'out' || phase === 'collapse' || phase === 'fly' || phase === 'back';
  const rowX = phase === 'out' || phase === 'collapse' ? '-105%' : phase === 'fly' ? '105%' : `${dx}px`;
  return (
    <div ref={wrap} data-swipe-row className="relative overflow-hidden"
      style={{
        borderRadius: radius, touchAction: 'pan-y',
        height: phase === 'collapse' ? 0 : h ?? undefined,
        // 高さが縮むあいだ、下の色の帯が細い線になって消える
        opacity: phase === 'collapse' ? 0.4 : 1,
        transition: phase === 'collapse' ? 'height .26s cubic-bezier(0.4,0,0.2,1), opacity .26s' : undefined,
      }}
      onClickCapture={(e) => { if (swiped.current) { e.preventDefault(); e.stopPropagation(); } }}
      // パソコンのマウスで画像の上から払うと、画像のドラッグが始まって払えないので止める
      onDragStart={(e) => e.preventDefault()}
      onPointerDown={(e) => {
        if (phase !== 'idle' || e.button !== 0) return;
        drag.current = { x: e.clientX, y: e.clientY, dir: 0, past: false, vx: 0, lx: e.clientX, lt: e.timeStamp };
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        const mx = e.clientX - d.x, my = e.clientY - d.y;
        if (!d.dir) {
          // 横に 16px 動き、縦より十分大きければ横のスワイプとみなす。先に縦へ動いたらスクロールに任せる
          const horiz = Math.abs(mx) > 16 && Math.abs(mx) > Math.abs(my) * 1.6;
          if (horiz && mx < 0 && onSwipe) d.dir = -1;
          else if (horiz && mx > 0 && right) d.dir = 1;
          else if (Math.abs(my) > 12 || Math.abs(mx) > 16) { drag.current = null; return; }
          else return;
          setPhase('drag');
          try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* noop */ }
        }
        // 速さ（px/ms）。少しずつ均して、最後の動きの勢いを見る
        const dt = Math.max(1, e.timeStamp - d.lt);
        d.vx = d.vx * 0.6 + ((e.clientX - d.lx) / dt) * 0.4;
        d.lx = e.clientX; d.lt = e.timeStamp;
        const raw = d.dir < 0 ? Math.min(0, mx + 16) : Math.max(0, mx - 16);
        const past = Math.abs(raw) > threshold();
        // しきい値を越えた・戻ったときに軽く震わせる（離せば決まる、が指で分かるように）
        if (past !== d.past) { d.past = past; haptic.select(); }
        setDx(raw);
      }}
      onPointerUp={() => {
        const d = drag.current;
        drag.current = null;
        if (!d?.dir) return;
        swiped.current = true;
        setTimeout(() => { swiped.current = false; }, 80);
        const fling = d.dir * d.vx > 0.6 && Math.abs(dx) > width() * 0.25;
        if (d.past || fling) { if (d.dir < 0) commitLeft(); else commitRight(); return; }
        // 届かなかったときは、ゆっくり元へ戻す（跳ね返らない）
        setPhase('snap'); setDx(0);
        setTimeout(() => setPhase((p) => (p === 'snap' ? 'idle' : p)), 300);
      }}
      onPointerCancel={() => { drag.current = null; setDx(0); setPhase('idle'); }}>
      {/* 下の地。払っている間は端に文字とマーク、決まったら真ん中に大きなマーク */}
      {side && (
        <div aria-hidden className={`absolute inset-0 flex items-center ${finished ? 'justify-center' : dir > 0 ? 'justify-start pl-5' : 'justify-end pr-5'}`}
          // 止まっているときは隠す（丸い角の縁から色がにじまないように）。戻る動きが終わってから消す
          style={{ backgroundColor: side.color, opacity: phase === 'idle' ? 0 : 1, transition: phase === 'idle' ? 'opacity 0s .3s' : 'none' }}>
          {finished ? (
            <span className="flex flex-col items-center text-white" style={{ animation: 'swipePop .45s cubic-bezier(0.34,1.56,0.64,1) both' }}>
              <span className="flex items-center justify-center w-9 h-9 [&>svg]:w-7 [&>svg]:h-7">{side.icon}</span>
              <span className="text-[12px] font-bold mt-0.5">{side.label}</span>
            </span>
          ) : (
            <span className="text-[13px] font-bold text-white flex items-center gap-1 transition-transform"
              style={{ transform: `scale(${Math.abs(dx) > threshold() ? 1.12 : 0.92})` }}>{side.icon}{side.label}</span>
          )}
        </div>
      )}
      <div className="relative"
        style={{
          transform: `translateX(${rowX})`,
          transition: phase === 'drag' ? 'none'
            : phase === 'out' || phase === 'fly' ? 'transform .22s cubic-bezier(0.4,0,1,1)'
            : phase === 'back' ? 'transform .4s cubic-bezier(0.22,1,0.36,1)'
            : 'transform .3s cubic-bezier(0.22,1,0.36,1)',
        }}>
        {children}
      </div>
    </div>
  );
}

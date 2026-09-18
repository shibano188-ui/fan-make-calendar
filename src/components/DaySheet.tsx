import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { spring, project, rubberband, createVelocityTracker, prefersReducedMotion, type SpringHandle } from '../lib/fluid';

// カレンダーの日付を押したときに下から出る、その日の予定のパネル。
//
// ui/Sheet との違い:
//  ・**暗幕を敷かない**。上半分のカレンダーは触れたままにして、別の日付を押せば中身が切り替わる
//  ・止まる位置が2つある（半分／全画面）。上に引けば全画面、下に引けば半分→閉じる
// ドラッグの手触り（掴んだ位置を尊重・速度を投影して行き先を決める）は ui/Sheet と揃えてある。

type Detent = 'half' | 'full';

interface Props {
  open: boolean;
  onClose: () => void;
  /** グラバーの下のタイトル行（ドラッグの持ち手になる） */
  header: ReactNode;
  children: ReactNode;
}

/** 半分のときに見えている高さ（画面の高さに対する割合） */
const HALF = 0.5;

export default function DaySheet({ open, onClose, header, children }: Props) {
  const [mounted, setMounted] = useState(open);
  const sheetRef = useRef<HTMLDivElement>(null);
  const springRef = useRef<SpringHandle | null>(null);
  const yRef = useRef(0);
  const detentRef = useRef<Detent>('half');
  // 半分のときはパネルの下半分が画面の外にある。最後の予定まで指で届くよう、そのぶん下に余白を足す
  const [detent, setDetent] = useState<Detent>('half');
  const closingRef = useRef(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const reduced = prefersReducedMotion();

  const height = () => sheetRef.current?.offsetHeight ?? window.innerHeight;
  /** その位置に止まっているときの translateY */
  const yOf = (d: Detent) => (d === 'full' ? 0 : Math.max(0, height() - window.innerHeight * HALF));

  const setY = (y: number) => {
    yRef.current = y;
    const el = sheetRef.current;
    if (el) el.style.transform = `translateY(${y}px)`;
  };

  const animateTo = (to: number, velocity = 0, onSettle?: () => void) => {
    springRef.current?.stop();
    if (reduced) { setY(to); onSettle?.(); return; }
    springRef.current = spring({ from: yRef.current, to, velocity, damping: 0.9, response: 0.34, onUpdate: setY, onSettle });
  };

  useLayoutEffect(() => {
    if (open) { closingRef.current = false; setMounted(true); }
  }, [open]);

  // 出てくるとき: 画面の外から半分の位置へ
  useLayoutEffect(() => {
    if (!mounted) return;
    detentRef.current = 'half';
    setDetent('half');
    setY(height());
    animateTo(yOf('half'));
    return () => { springRef.current?.stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted]);

  const dismiss = (velocity = 0) => {
    if (closingRef.current) return;
    closingRef.current = true;
    animateTo(height() + 40, velocity, () => { setMounted(false); onCloseRef.current(); });
  };

  // 親が閉じたとき
  useEffect(() => {
    if (!open && mounted && !closingRef.current) {
      closingRef.current = true;
      animateTo(height() + 40, 0, () => setMounted(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mounted]);

  // ── ドラッグ（グラバー＋タイトル行が持ち手） ──
  const drag = useRef({ pointerY: 0, grabbedY: 0, raw: 0, tracker: createVelocityTracker(), active: false });

  const onDragStart = (e: ReactPointerEvent) => {
    if (closingRef.current) return;
    springRef.current?.stop();
    drag.current = { ...drag.current, active: true, pointerY: e.clientY, grabbedY: yRef.current, raw: yRef.current };
    drag.current.tracker.reset();
    drag.current.tracker.add(yRef.current);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onDragMove = (e: ReactPointerEvent) => {
    if (!drag.current.active) return;
    const raw = drag.current.grabbedY + (e.clientY - drag.current.pointerY);
    drag.current.raw = raw;
    drag.current.tracker.add(raw);
    // 全画面より上は硬い壁ではなく、じわっと抵抗させる
    setY(raw < 0 ? rubberband(raw, height()) : raw);
  };

  const onDragEnd = () => {
    if (!drag.current.active) return;
    drag.current.active = false;
    const v = drag.current.tracker.get();
    // 離した位置ではなく「向かっている先」で決める
    const projected = drag.current.raw + project(v);
    const half = yOf('half');
    if (projected > half + (height() - half) * 0.4) { dismiss(v); return; }
    const next: Detent = projected < half / 2 ? 'full' : 'half';
    detentRef.current = next;
    setDetent(next);
    animateTo(yOf(next), v);
  };

  if (!mounted) return null;

  return createPortal(
    // 下の浮遊ナビ（z-100）より上に出す。カレンダー側は触れるよう、外枠は指を通す
    <div className="fixed inset-0 max-w-app mx-auto pointer-events-none" style={{ zIndex: 150 }}>
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="false"
        // 下のカレンダーが透けると日付と予定が重なって読めないので、ぼかしではなく不透明の地にする
        className="pointer-events-auto absolute inset-x-0 bottom-0 rounded-t-[20px] flex flex-col shadow-float border-t border-subtle"
        style={{ height: 'calc(100dvh - var(--sat) - 8px)', backgroundColor: 'var(--bg-primary)', willChange: 'transform', transform: 'translateY(100vh)' }}
      >
        {/* 下に行き過ぎたときに隙間を見せないための延長面 */}
        <div aria-hidden className="absolute inset-x-0 top-full h-40" style={{ backgroundColor: 'var(--bg-primary)' }} />

        <div
          className="flex-shrink-0 select-none"
          style={{ touchAction: 'none', cursor: 'grab' }}
          onPointerDown={onDragStart}
          onPointerMove={onDragMove}
          onPointerUp={onDragEnd}
          onPointerCancel={onDragEnd}
        >
          <div className="flex justify-center pt-2.5 pb-1">
            <div className="w-9 h-[5px] rounded-full" style={{ backgroundColor: 'var(--fill-primary)' }} />
          </div>
          {header}
        </div>

        <div
          className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3"
          style={{
            WebkitOverflowScrolling: 'touch',
            paddingBottom: detent === 'half'
              ? `calc(${(1 - HALF) * 100}dvh - var(--sat) - 8px + 16px)`
              : 'max(16px, env(safe-area-inset-bottom))',
          }}
        >
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}

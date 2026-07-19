import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { spring, project, rubberband, createVelocityTracker, prefersReducedMotion, type SpringHandle } from '../../lib/fluid';

// ジェスチャー駆動の共通ボトムシート。
// ・グラバー/ヘッダーを指で1:1追従（掴んだ位置を尊重）
// ・進行中のアニメーションも掴んで中断・逆戻し可能（常に表示値から再出発）
// ・リリース速度を投影して行き先を決め、速度を引き継いでスプリングで着地
// ・上方向へのドラッグはラバーバンドで漸進的に抵抗
// ・スクリムの濃さはシート位置に1:1連動（終了時だけでなく操作中も連続フィードバック）

interface SheetProps {
  /** 条件付きマウントで使う場合は省略可（マウント=表示） */
  open?: boolean;
  onClose: () => void;
  children: ReactNode;
  /** グラバー横に出すタイトル行（ドラッグ領域になる） */
  title?: ReactNode;
  /** タイトル行の右端（閉じるボタン等を置き換えたいとき） */
  headerRight?: ReactNode;
  /** タイトル行右端の×ボタン（既定で表示。headerRight指定時は不要） */
  showClose?: boolean;
  /** タイトル行の下・スクロール領域の外に固定する内容（検索欄など） */
  fixed?: ReactNode;
  maxHeight?: string;
  zIndex?: number;
  /** スクロール領域の追加クラス */
  contentClassName?: string;
  ariaLabel?: string;
}

const SCRIM_ALPHA = 0.45;

export default function Sheet({
  open = true, onClose, children, title, headerRight, showClose = true, fixed,
  maxHeight = '85dvh', zIndex = 300, contentClassName = '', ariaLabel,
}: SheetProps) {
  const [mounted, setMounted] = useState(open);
  const sheetRef = useRef<HTMLDivElement>(null);
  const scrimRef = useRef<HTMLDivElement>(null);
  const springRef = useRef<SpringHandle | null>(null);
  const yRef = useRef(0);              // 現在の表示値（translateY px）
  const closingRef = useRef(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const reduced = prefersReducedMotion();

  const setY = (y: number) => {
    yRef.current = y;
    const el = sheetRef.current;
    if (el) el.style.transform = `translateY(${y}px)`;
    const scrim = scrimRef.current;
    if (scrim) {
      const h = el?.offsetHeight || 1;
      const t = Math.min(Math.max(1 - y / h, 0), 1);
      scrim.style.opacity = String(t);
    }
  };

  const sheetHeight = () => sheetRef.current?.offsetHeight ?? window.innerHeight;

  // 表示開始: 画面外から現在高さぶんスプリングで上がる
  useLayoutEffect(() => {
    if (open) setMounted(true);
  }, [open]);

  useLayoutEffect(() => {
    if (!mounted) return;
    closingRef.current = false;
    const h = sheetHeight();
    if (reduced) {
      // 動きを減らす: スライドせずフェードのみ
      setY(0);
      const el = sheetRef.current;
      if (el) {
        el.style.opacity = '0';
        el.style.transition = 'opacity 200ms ease';
        requestAnimationFrame(() => { el.style.opacity = '1'; });
      }
      return;
    }
    setY(h);
    springRef.current?.stop();
    springRef.current = spring({
      from: h, to: 0, damping: 0.85, response: 0.34,
      onUpdate: setY,
    });
    return () => { springRef.current?.stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted]);

  // 退場して閉じる（内部からの dismiss。完了後に onClose を親へ通知）
  const dismiss = (velocity = 0) => {
    if (closingRef.current) return;
    closingRef.current = true;
    if (reduced) {
      const el = sheetRef.current;
      if (el) { el.style.transition = 'opacity 160ms ease'; el.style.opacity = '0'; }
      setTimeout(() => { setMounted(false); onCloseRef.current(); }, 160);
      return;
    }
    springRef.current?.stop();
    springRef.current = spring({
      from: yRef.current, to: sheetHeight() + 40, velocity, damping: 1.0, response: 0.3,
      onUpdate: setY,
      onSettle: () => { setMounted(false); onCloseRef.current(); },
    });
  };

  // 親が open=false にしたら退場アニメーション後にアンマウント
  useEffect(() => {
    if (!open && mounted && !closingRef.current) {
      closingRef.current = true;
      if (reduced) { setMounted(false); return; }
      springRef.current?.stop();
      springRef.current = spring({
        from: yRef.current, to: sheetHeight() + 40, damping: 1.0, response: 0.3,
        onUpdate: setY,
        onSettle: () => setMounted(false),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mounted]);

  // Escで閉じる
  useEffect(() => {
    if (!mounted) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') dismiss(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted]);

  // ── ドラッグ（グラバー＋タイトル行が持ち手） ──
  const drag = useRef({ pointerY: 0, grabbedY: 0, raw: 0, tracker: createVelocityTracker(), active: false });

  const onDragStart = (e: ReactPointerEvent) => {
    if (closingRef.current) return;
    // 走っているスプリングを掴んで止める＝表示値から続きを操作
    if (springRef.current?.running) springRef.current.stop();
    drag.current.active = true;
    drag.current.pointerY = e.clientY;
    drag.current.grabbedY = yRef.current;
    drag.current.raw = yRef.current;
    drag.current.tracker.reset();
    drag.current.tracker.add(yRef.current);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onDragMove = (e: ReactPointerEvent) => {
    if (!drag.current.active) return;
    const raw = drag.current.grabbedY + (e.clientY - drag.current.pointerY);
    drag.current.raw = raw;
    drag.current.tracker.add(raw);
    // 上方向（raw<0）は境界越え: 硬い壁でなく漸進的な抵抗
    setY(raw < 0 ? rubberband(raw, sheetHeight()) : raw);
  };

  const onDragEnd = () => {
    if (!drag.current.active) return;
    drag.current.active = false;
    const h = sheetHeight();
    const v = drag.current.tracker.get();
    // 離した位置ではなく「向かっている先」で判定する（慣性投影）
    const projected = drag.current.raw + project(v);
    if (projected > h * 0.5) {
      dismiss(v);
      return;
    }
    if (reduced) { setY(0); return; }
    // 指の速度を引き継いで復帰（運動量があるので僅かなバウンスを許す）
    springRef.current = spring({
      from: yRef.current, to: 0, velocity: v, damping: 0.85, response: 0.35,
      onUpdate: setY,
    });
  };

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 max-w-app mx-auto" style={{ zIndex }} role="dialog" aria-modal="true" aria-label={ariaLabel}>
      {/* スクリム: シート位置に連動して濃くなる */}
      <div
        ref={scrimRef}
        className="absolute inset-0"
        style={{ backgroundColor: `rgba(0,0,0,${SCRIM_ALPHA})`, opacity: 0 }}
        onClick={() => dismiss()}
      />
      <div
        ref={sheetRef}
        className="absolute inset-x-0 bottom-0 rounded-t-[20px] flex flex-col material-sheet"
        style={{ maxHeight, willChange: 'transform', transform: 'translateY(100vh)' }}
      >
        {/* 下方向オーバーシュート時に隙間を見せないための延長面 */}
        <div aria-hidden className="material-sheet absolute inset-x-0 top-full h-40" />

        {/* 持ち手: グラバー＋タイトル行 */}
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
          {(title || headerRight) && (
            <div className="flex items-center justify-between px-4 pt-1 pb-2">
              <span className="text-[17px] font-bold tracking-tight">{title}</span>
              {headerRight ?? (showClose && (
                <button
                  onClick={() => dismiss()}
                  onPointerDown={(e) => e.stopPropagation()}
                  aria-label="閉じる"
                  className="pressable tap-44 w-7 h-7 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: 'var(--fill-tertiary)', color: 'var(--label-secondary)' }}
                >
                  <X size={16} />
                </button>
              ))}
            </div>
          )}
        </div>

        {fixed && <div className="flex-shrink-0">{fixed}</div>}

        {/* 本文（スクロール領域） */}
        <div
          className={`flex-1 min-h-0 overflow-y-auto overscroll-contain ${contentClassName}`}
          style={{ WebkitOverflowScrolling: 'touch', paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}
        >
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}

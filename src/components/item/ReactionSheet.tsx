import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { REACTIONS } from '../../lib/reactions';
import { useStamps, toggleStamp } from '../../lib/stampStore';
import { haptic } from '../../lib/haptics';
import { useBackToClose } from '../../lib/backStack';

// スタンプを選ぶ、下から出るパネル（2026-11-07 から「とっておく」印。押した予定はカレンダーの「スタンプ」で見返せる）。カレンダーの日付を押したときのパネル（DaySheet）と同じく
// 後ろを暗くしない。外を押すか、下に引くと閉じる。1つ押したら閉じる（別のを足すときはもう一度開く）。

/** 選んだものは Slack と同じく、枠ではなく地の色で示す */
export const STAMP_ON_BG = 'color-mix(in srgb, var(--accent-color) 24%, transparent)';

export default function ReactionSheet({ eventId, onClose }: { eventId: string; onClose: () => void }) {
  // Android の戻るで閉じる（前は、ホーム・探す・カレンダー・マイページの上で開いているとアプリごと終わっていた）
  useBackToClose(true, onClose);
  const { counts, mine } = useStamps(eventId);
  const panelRef = useRef<HTMLDivElement>(null);
  const [closing, setClosing] = useState(false);
  const drag = useRef({ y0: 0, dy: 0, active: false });

  const close = () => {
    if (closing) return;
    setClosing(true);
    const el = panelRef.current;
    if (el) { el.style.transition = 'transform 0.22s cubic-bezier(0.32,0.72,0,1)'; el.style.transform = 'translateY(110%)'; }
    setTimeout(onClose, 220);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onDown = (e: ReactPointerEvent) => {
    drag.current = { y0: e.clientY, dy: 0, active: true };
    if (panelRef.current) panelRef.current.style.transition = 'none';
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onMove = (e: ReactPointerEvent) => {
    if (!drag.current.active) return;
    drag.current.dy = Math.max(0, e.clientY - drag.current.y0);
    if (panelRef.current) panelRef.current.style.transform = `translateY(${drag.current.dy}px)`;
  };
  const onUp = () => {
    if (!drag.current.active) return;
    drag.current.active = false;
    if (drag.current.dy > 70) { close(); return; }
    const el = panelRef.current;
    if (el) { el.style.transition = 'transform 0.2s cubic-bezier(0.32,0.72,0,1)'; el.style.transform = 'translateY(0)'; }
  };

  return createPortal(
    // 外側は透明。押すと閉じる（下の浮遊ナビ z-100 より上）
    <div className="fixed inset-0 max-w-app mx-auto" style={{ zIndex: 400 }}
      onClick={(e) => { e.stopPropagation(); close(); }}>
      <div ref={panelRef} role="dialog" aria-label="スタンプ"
        className="absolute inset-x-0 bottom-0 rounded-t-[20px] shadow-float border-t border-subtle"
        style={{ backgroundColor: 'var(--bg-primary)', animation: 'slideUpIn 0.26s cubic-bezier(0.32,0.72,0,1) both' }}
        onClick={(e) => e.stopPropagation()}>
        <div className="select-none" style={{ touchAction: 'none', cursor: 'grab' }}
          onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
          <div className="flex justify-center pt-2.5 pb-1">
            <div className="w-9 h-[5px] rounded-full" style={{ backgroundColor: 'var(--fill-primary)' }} />
          </div>
          <div className="px-4 pt-1 pb-3 flex items-baseline gap-2">
            <span className="text-[15px] font-bold">スタンプ</span>
            <span className="text-[12px] text-label-secondary">押した予定はカレンダーの「スタンプ」にたまります</span>
          </div>
        </div>
        {/* 4つを横いっぱいに並べる（押しやすいように大きめ） */}
        <div className="grid grid-cols-4 gap-2 px-4" style={{ paddingBottom: 'max(20px, var(--sab))' }}>
          {REACTIONS.map((r) => {
            const on = mine.includes(r.type);
            const n = counts[r.type] ?? 0;
            return (
              <button key={r.type} aria-pressed={on} aria-label={r.label}
                onClick={() => { haptic.select(); toggleStamp(eventId, r.type); close(); }}
                className="pressable rounded-[14px] h-[68px] flex flex-col items-center justify-center gap-0.5"
                style={{ backgroundColor: on ? STAMP_ON_BG : 'var(--fill-tertiary)' }}>
                {/* スタンプの絵に文字が入っているので、名前は出さず数だけ */}
                <img src={r.image} alt="" className="stamp w-10 h-10" />
                <span className="text-[11px] font-bold h-3.5 leading-none" style={{ color: on ? 'var(--accent-text)' : 'var(--label-tertiary)' }}>{n > 0 ? n : ''}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>,
    document.body,
  );
}

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { REACTIONS } from '../../lib/reactions';
import { useStamps, toggleStamp } from '../../lib/stampStore';
import { haptic } from '../../lib/haptics';

// リアクションを選ぶ、下から出るパネル。カレンダーの日付を押したときのパネル（DaySheet）と同じく
// 後ろを暗くしない。外を押すか、下に引くと閉じる。1つ押したら閉じる（別のを足すときはもう一度開く）。

/** 選んだものは Slack と同じく、枠ではなく地の色で示す */
export const STAMP_ON_BG = 'color-mix(in srgb, var(--accent-color) 24%, transparent)';

export default function ReactionSheet({ eventId, onClose }: { eventId: string; onClose: () => void }) {
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
      <div ref={panelRef} role="dialog" aria-label="リアクション"
        className="absolute inset-x-0 bottom-0 rounded-t-[20px] shadow-float border-t border-subtle"
        style={{ backgroundColor: 'var(--bg-primary)', animation: 'slideUpIn 0.26s cubic-bezier(0.32,0.72,0,1) both' }}
        onClick={(e) => e.stopPropagation()}>
        <div className="select-none" style={{ touchAction: 'none', cursor: 'grab' }}
          onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
          <div className="flex justify-center pt-2.5 pb-1">
            <div className="w-9 h-[5px] rounded-full" style={{ backgroundColor: 'var(--fill-primary)' }} />
          </div>
          <div className="px-4 pt-1 pb-3 text-[15px] font-bold">リアクション</div>
        </div>
        {/* Slack と同じく小さく並べて左に寄せる。右は空いてよい（スタンプが増えたら折り返す） */}
        <div className="flex flex-wrap gap-2 px-4" style={{ paddingBottom: 'max(20px, env(safe-area-inset-bottom))' }}>
          {REACTIONS.map((r) => {
            const on = mine.includes(r.type);
            const n = counts[r.type] ?? 0;
            return (
              <button key={r.type} aria-pressed={on} aria-label={r.label}
                onClick={() => { haptic.select(); toggleStamp(eventId, r.type); close(); }}
                className="pressable rounded-full h-10 pl-2 pr-2.5 flex items-center gap-1"
                style={{ backgroundColor: on ? STAMP_ON_BG : 'var(--fill-tertiary)' }}>
                {/* スタンプの絵に文字が入っているので、名前は出さず数だけ */}
                <img src={r.image} alt="" className="w-7 h-7" />
                {n > 0 && <span className="text-[13px] font-bold" style={{ color: on ? 'var(--accent-text)' : 'var(--label-secondary)' }}>{n}</span>}
              </button>
            );
          })}
        </div>
      </div>
    </div>,
    document.body,
  );
}

import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { SmilePlus } from 'lucide-react';
import { REACTIONS, getMyReaction, saveMyReaction, type ReactionType } from '../../lib/reactions';
import { setReaction } from '../../lib/api';
import { useAuth } from '../../contexts/AuthContext';
import { haptic } from '../../lib/haptics';

/** カレンダー追加に代わるリアクションボタン。6種から選択・付け替え（同じものを選ぶと解除）。
 *  自分のリアクションは localStorage に保持し、サーバーへは書き込みのみ（カードごとの取得はしない）。 */
export default function ReactionButton({ eventId }: { eventId: string }) {
  const { user } = useAuth();
  const btnRef = useRef<HTMLButtonElement>(null);
  const [my, setMy] = useState<ReactionType | null>(() => getMyReaction(eventId));
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const current = REACTIONS.find((r) => r.type === my);

  const open = (e: React.MouseEvent) => {
    e.stopPropagation();
    haptic.select();
    const rect = btnRef.current?.getBoundingClientRect();
    if (rect) setPos({ top: rect.top, left: rect.left + rect.width / 2 });
  };

  const pick = (type: ReactionType) => {
    haptic.select();
    const next = my === type ? null : type;
    setMy(next);
    saveMyReaction(eventId, next);
    if (user) setReaction(eventId, user.id, next).catch(() => {});
    setPos(null);
  };

  return (
    <>
      <button ref={btnRef} onClick={open} aria-label="リアクション" className="pressable tap-44 flex items-center">
        {current
          ? <img src={current.image} alt={current.label} className="w-5 h-5" />
          : <SmilePlus size={18} className="text-label-secondary" />}
      </button>

      {pos && createPortal(
        <div className="fixed inset-0 z-[400]" onClick={(e) => { e.stopPropagation(); setPos(null); }}>
          <div
            className="absolute flex gap-1 p-1.5 rounded-full shadow-card"
            style={{
              top: pos.top, left: pos.left,
              transform: 'translate(-50%, -100%) translateY(-8px)',
              backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--separator)',
              animation: 'slideUpIn 0.18s cubic-bezier(0.32,0.72,0,1) both',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {REACTIONS.map((r) => (
              <button key={r.type} onClick={(e) => { e.stopPropagation(); pick(r.type); }} aria-label={r.label}
                className="pressable rounded-full p-0.5"
                style={my === r.type ? { boxShadow: '0 0 0 2px var(--accent-color)' } : undefined}>
                <img src={r.image} alt={r.label} className="w-8 h-8" />
              </button>
            ))}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

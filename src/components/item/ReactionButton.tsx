import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { SmilePlus } from 'lucide-react';
import { REACTIONS, getMyReaction, saveMyReaction, type ReactionType } from '../../lib/reactions';
import { setReaction } from '../../lib/api';
import { useAuth } from '../../contexts/AuthContext';
import { haptic } from '../../lib/haptics';

/** カレンダー追加に代わるリアクションボタン。6種から選択・付け替え（同じものを選ぶと解除）。
 *  自分のリアクションは localStorage に保持し、サーバーへは書き込みのみ（カードごとの取得はしない）。 */
/** スタンプの列のおおよその大きさ（32px×6 + 隙間 + 余白）。画面の端で寄せる計算に使う */
const PICKER_W = 36 * 6 + 4 * 5 + 12;
const PICKER_H = 48;

export default function ReactionButton({ eventId, size = 18 }: { eventId: string; size?: number }) {
  const { user } = useAuth();
  const btnRef = useRef<HTMLButtonElement>(null);
  const [my, setMy] = useState<ReactionType | null>(() => getMyReaction(eventId));
  const [pos, setPos] = useState<{ top: number; left: number; below: boolean } | null>(null);
  const current = REACTIONS.find((r) => r.type === my);

  const open = (e: React.MouseEvent) => {
    e.stopPropagation();
    haptic.select();
    const rect = btnRef.current?.getBoundingClientRect();
    if (!rect) return;
    // 列はボタンの真上・中央に出す。画面の端ではみ出さないよう左右に寄せ、
    // 上に場所が無いとき（画面の上の方のカード）はボタンの下に出す
    const half = PICKER_W / 2 + 8;
    const left = Math.min(Math.max(rect.left + rect.width / 2, half), window.innerWidth - half);
    const below = rect.top < PICKER_H + 16;
    setPos({ top: below ? rect.bottom : rect.top, left, below });
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
          ? <img src={current.image} alt={current.label} style={{ width: size + 2, height: size + 2 }} />
          : <SmilePlus size={size} className="text-label-secondary" />}
      </button>

      {pos && createPortal(
        <div className="fixed inset-0 z-[400]" onClick={(e) => { e.stopPropagation(); setPos(null); }}>
          {/* 位置合わせ（外側）と出てくる動き（内側）は箱を分ける。同じ箱にすると、
              動きの transform が位置合わせの transform を上書きして、列がボタンの右下にずれる */}
          <div className="absolute"
            style={{
              top: pos.top, left: pos.left,
              transform: pos.below ? 'translate(-50%, 8px)' : 'translate(-50%, -100%) translateY(-8px)',
            }}>
          <div
            className="flex gap-1 p-1.5 rounded-full shadow-card"
            style={{
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
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

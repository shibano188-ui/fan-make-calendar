import { useState } from 'react';
import { SmilePlus } from 'lucide-react';
import { REACTIONS } from '../../lib/reactions';
import { useStamps, topStamp, totalStamps } from '../../lib/stampStore';
import { useAuth } from '../../contexts/AuthContext';
import { haptic } from '../../lib/haptics';
import ReactionSheet, { STAMP_ON_BG } from './ReactionSheet';

const ORDER = REACTIONS.map((r) => r.type);

/** リアクションのボタン。一番多く押されたスタンプと合計数を出し、押すと下から選ぶパネルを開く。
 *  自分が1つでも押していれば、Slack と同じく地の色で示す。 */
export default function ReactionButton({ eventId, size = 18, variant = 'icon' }: { eventId: string; size?: number; variant?: 'icon' | 'labeled' }) {
  const { user } = useAuth();
  const stamps = useStamps(eventId);
  const [open, setOpen] = useState(false);
  const top = REACTIONS.find((r) => r.type === topStamp(stamps, ORDER));
  const total = totalStamps(stamps);
  const reacted = stamps.mine.length > 0;

  const icon = top
    ? <img src={top.image} alt={top.label} style={{ width: size + 2, height: size + 2 }} />
    : <SmilePlus size={size} className="text-label-secondary" />;

  return (
    <>
      <button onClick={(e) => { e.stopPropagation(); if (!user) return; haptic.select(); setOpen(true); }}
        aria-label="リアクション" aria-pressed={reacted}
        className={variant === 'labeled' ? 'pressable flex flex-col items-center gap-0.5' : 'pressable tap-44 flex items-center'}>
        <span className="flex items-center gap-1 rounded-full px-1.5 py-0.5"
          style={reacted ? { backgroundColor: STAMP_ON_BG } : undefined}>
          {icon}
          {total > 0 && variant === 'icon' && (
            <span className="text-[12px] font-semibold" style={{ color: reacted ? 'var(--accent-text)' : 'var(--label-secondary)' }}>{total}</span>
          )}
        </span>
        {variant === 'labeled' && (
          <span className="text-[10px] text-label-tertiary leading-none">{total > 0 ? total : 'リアクション'}</span>
        )}
      </button>
      {open && <ReactionSheet eventId={eventId} onClose={() => setOpen(false)} />}
    </>
  );
}

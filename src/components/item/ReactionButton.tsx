import { useState } from 'react';
import { SmilePlus } from 'lucide-react';
import { REACTIONS } from '../../lib/reactions';
import { useStamps, topStamp, toggleStamp } from '../../lib/stampStore';
import { useAuth } from '../../contexts/AuthContext';
import { haptic } from '../../lib/haptics';
import { useBeta } from '../../lib/beta';
import ReactionSheet, { STAMP_ON_BG } from './ReactionSheet';
import { useStampFlick } from './StampFlick';
import PrintSheet from '../record/PrintSheet';
import type { RecordKind } from '../../lib/print/print';

const ORDER = REACTIONS.map((r) => r.type);

/** スタンプのボタン。自分が押したスタンプがあればそれ、無ければ一番多く押されたものとその数を出し、
 *  押すと下から選ぶパネルを開く。自分が1つでも押していれば、Slack と同じく地の色で示す。
 *  スタンプは「とっておく」印（2026-11-07）なので、自分の押したものを先に見せる。
 *  beta の人（2026-11-19）: 押したまま払っても押せる。買った・行ったを押したら「記録にする」が出る */
export default function ReactionButton({ eventId, size = 18, variant = 'icon' }: { eventId: string; size?: number; variant?: 'icon' | 'labeled' }) {
  const { user } = useAuth();
  const beta = useBeta(user?.id);
  const stamps = useStamps(eventId);
  const [open, setOpen] = useState(false);
  const [print, setPrint] = useState<RecordKind | null>(null);
  const mineTop = REACTIONS.find((r) => stamps.mine.includes(r.type));
  const top = mineTop ?? REACTIONS.find((r) => r.type === topStamp(stamps, ORDER));
  const count = top ? stamps.counts[top.type] ?? 0 : 0;
  const reacted = stamps.mine.length > 0;

  const afterPick = (type: string, on: boolean) => {
    if (beta && on && (type === 'bought' || type === 'went')) setPrint(type);
  };
  const flick = useStampFlick({
    enabled: beta && !!user,
    onTap: () => { haptic.select(); setOpen(true); },
    onPick: (type) => {
      const on = stamps.mine.includes(type);
      if (!on) void toggleStamp(eventId, type);
      afterPick(type, true);
    },
  });

  const { onClick: flickClick, ...flickRest } = flick.handlers ?? { onClick: undefined };

  const icon = top
    ? <img src={top.image} alt={top.label} className="stamp" style={{ width: size + 2, height: size + 2 }} />
    : <SmilePlus size={size} className="text-label-secondary" />;

  return (
    <>
      <button {...flickRest}
        onClick={flickClick ?? ((e) => { e.stopPropagation(); if (!user) return; haptic.select(); setOpen(true); })}
        aria-label="スタンプ" aria-pressed={reacted}
        className={variant === 'labeled' ? 'pressable flex flex-col items-center gap-0.5' : 'pressable tap-44 flex items-center'}>
        <span className="flex items-center gap-1 rounded-full px-1.5 py-0.5"
          style={reacted ? { backgroundColor: STAMP_ON_BG } : undefined}>
          {icon}
          {count > 0 && variant === 'icon' && (
            <span className="text-[12px] font-semibold" style={{ color: reacted ? 'var(--accent-text)' : 'var(--label-secondary)' }}>{count}</span>
          )}
        </span>
        {variant === 'labeled' && (
          <span className="text-[10px] text-label-tertiary leading-none">{count > 0 ? count : 'スタンプ'}</span>
        )}
      </button>
      {flick.overlay}
      {open && <ReactionSheet eventId={eventId} onClose={() => setOpen(false)} onPicked={beta ? afterPick : undefined} />}
      {print && <PrintSheet eventId={eventId} kind={print} onClose={() => setPrint(null)} />}
    </>
  );
}

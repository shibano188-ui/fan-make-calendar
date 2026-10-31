import { useState } from 'react';
import { Check } from 'lucide-react';
import { WORK_COLORS, buildWorkColorMap, loadEventColor, saveEventColor } from '../../lib/workColors';
import { haptic } from '../../lib/haptics';

/** カレンダーに出す色をこの予定だけ変える。作品の色に戻すこともできる（2026-10-31 柴野） */
export default function EventColorPicker({ eventId, workId }: { eventId: string; workId?: string }) {
  const [color, setColor] = useState(() => loadEventColor(eventId));
  const workColor = workId ? buildWorkColorMap([{ id: workId }]).get(workId) : undefined;
  const pick = (next: string | null) => {
    haptic.select();
    setColor(next);
    saveEventColor(eventId, next);
  };
  return (
    <div className="mt-3">
      <div className="text-[12px] text-label-secondary mb-1.5">カレンダーの色</div>
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        <button onClick={() => pick(null)} aria-pressed={!color}
          className="pressable flex-shrink-0 flex items-center gap-1.5 h-8 px-2.5 rounded-full text-[12px] font-medium"
          style={{ backgroundColor: 'var(--fill-tertiary)', color: 'var(--label-primary)', boxShadow: color ? undefined : 'inset 0 0 0 2px var(--label-primary)' }}>
          <span className="w-3.5 h-3.5 rounded-full" style={{ backgroundColor: workColor ?? 'var(--accent-color)' }} />
          作品の色
        </button>
        {WORK_COLORS.map((c) => (
          <button key={c} onClick={() => pick(c)} aria-label={`色 ${c}`} aria-pressed={color === c}
            className="pressable flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center"
            style={{ backgroundColor: c, color: '#141414' }}>
            {color === c && <Check size={16} />}
          </button>
        ))}
      </div>
    </div>
  );
}

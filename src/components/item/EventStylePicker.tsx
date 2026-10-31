import { useState } from 'react';
import { Check, ChevronRight } from 'lucide-react';
import Sheet from '../ui/Sheet';
import { EVENT_MARKS, WORK_COLORS, buildWorkColorMap, loadEventColor, loadEventMark, saveEventColor, saveEventMark } from '../../lib/workColors';
import { haptic } from '../../lib/haptics';

// 予定ごとの色と、カレンダーの帯の先頭に付けるアイコンを選ぶ（2026-10-31 柴野）。
// カレンダーのカードからも詳細ページからも、同じシートで選ぶ

function Picker({ eventId, workId, onChange }: { eventId: string; workId?: string; onChange?: () => void }) {
  const [color, setColor] = useState(() => loadEventColor(eventId));
  const [mark, setMark] = useState(() => loadEventMark(eventId));
  const workColor = workId ? buildWorkColorMap([{ id: workId }]).get(workId) : undefined;
  const pickColor = (next: string | null) => {
    haptic.select();
    setColor(next);
    saveEventColor(eventId, next);
    onChange?.();
  };
  const pickMark = (next: string | null) => {
    haptic.select();
    setMark(next);
    saveEventMark(eventId, next);
    onChange?.();
  };
  const cell = 'pressable aspect-square rounded-full flex items-center justify-center';
  const ring = 'inset 0 0 0 2px var(--label-primary)';
  return (
    <div className="flex flex-col gap-3">
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[12px] text-label-secondary">色</span>
          <button onClick={() => pickColor(null)} aria-pressed={!color}
            className="pressable flex items-center gap-1.5 h-7 px-2.5 rounded-full text-[12px] font-medium"
            style={{ backgroundColor: 'var(--fill-tertiary)', color: 'var(--label-primary)', boxShadow: color ? undefined : ring }}>
            <span className="w-3 h-3 rounded-full" style={{ backgroundColor: workColor ?? 'var(--accent-color)' }} />
            作品の色
          </button>
        </div>
        <div className="grid grid-cols-8 gap-2">
          {WORK_COLORS.map((c) => (
            <button key={c} onClick={() => pickColor(c)} aria-label={`色 ${c}`} aria-pressed={color === c} className={cell}
              style={{ backgroundColor: c, color: '#141414' }}>
              {color === c && <Check size={15} />}
            </button>
          ))}
        </div>
      </div>
      <div>
        <div className="text-[12px] text-label-secondary mb-1.5">アイコン</div>
        <div className="grid grid-cols-8 gap-2">
          <button onClick={() => pickMark(null)} aria-pressed={!mark} className={`${cell} text-[11px]`}
            style={{ backgroundColor: 'var(--fill-tertiary)', color: 'var(--label-secondary)', boxShadow: mark ? undefined : ring }}>
            なし
          </button>
          {EVENT_MARKS.map((m) => (
            <button key={m} onClick={() => pickMark(m)} aria-label={`アイコン ${m}`} aria-pressed={mark === m} className={`${cell} text-[16px]`}
              style={{ backgroundColor: 'var(--fill-tertiary)', color: 'var(--label-primary)', boxShadow: mark === m ? ring : undefined }}>
              {m}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/** 色とアイコンを選ぶシート */
export function EventStyleSheet({ eventId, workId, onClose, onChange }: { eventId: string; workId?: string; onClose: () => void; onChange: () => void }) {
  return (
    <Sheet onClose={onClose} title={<span className="font-semibold">予定の色とアイコン</span>} ariaLabel="予定の色とアイコン" zIndex={320}>
      <div className="px-4 pt-1 pb-[calc(var(--sab)+20px)]">
        <Picker eventId={eventId} workId={workId} onChange={onChange} />
      </div>
    </Sheet>
  );
}

/** 詳細ページの行。いつも出ていると見にくいので、押すとシートを開く */
export default function EventStylePicker({ eventId, workId }: { eventId: string; workId?: string }) {
  const [open, setOpen] = useState(false);
  const [, setTick] = useState(0);
  const color = loadEventColor(eventId);
  const mark = loadEventMark(eventId);
  const workColor = workId ? buildWorkColorMap([{ id: workId }]).get(workId) : undefined;
  return (
    <div className="mt-3">
      <button onClick={() => { haptic.select(); setOpen(true); }}
        className="pressable w-full flex items-center gap-2 py-1 text-[13px] text-label-secondary">
        <span className="w-4 h-4 rounded-full flex items-center justify-center text-[10px] text-[#141414]" style={{ backgroundColor: color ?? workColor ?? 'var(--accent-color)' }}>{mark}</span>
        予定の色とアイコン
        <ChevronRight size={15} className="ml-auto" />
      </button>
      {open && <EventStyleSheet eventId={eventId} workId={workId} onClose={() => setOpen(false)} onChange={() => setTick((t) => t + 1)} />}
    </div>
  );
}

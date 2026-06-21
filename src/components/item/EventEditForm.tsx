import { useState } from 'react';
import type { CalendarEvent } from '../../types';
import type { EventPatch } from '../../lib/api';
import { todayStr } from '../../design/tokens';
import Chip from '../ui/Chip';
import { haptic } from '../../lib/haptics';

const dateCls = 'flex-1 rounded-[10px] px-3 py-2.5 text-[14px] outline-none';
const timeCls = 'rounded-[10px] px-3 py-2.5 text-[14px] outline-none';
const inputStyle = { backgroundColor: 'var(--fill-tertiary)', color: 'var(--input-text)' };

/** 日時/予約のコンパクト編集（共同編集用）。実効値を初期値にし、保存でパッチを返す。 */
export default function EventEditForm({ event, onSave, onClose }: { event: CalendarEvent; onSave: (patch: EventPatch) => void; onClose: () => void }) {
  const today = todayStr();
  const [dateTBD, setDateTBD] = useState(!event.date);
  const [allDay, setAllDay] = useState(!event.time);
  const [date, setDate] = useState(event.date ?? today);
  const [endDate, setEndDate] = useState(event.endDate ?? event.date ?? today);
  const [time, setTime] = useState(event.time ?? '');
  const [isOrder, setIsOrder] = useState(!!event.isOrderMade);
  const [preStart, setPreStart] = useState(event.preorderStart ?? today);
  const [preEnd, setPreEnd] = useState(event.preorderEnd ?? today);

  const save = () => {
    haptic.select();
    onSave({
      date: dateTBD ? null : (date || null),
      endDate: dateTBD ? undefined : (endDate || date || undefined),
      time: allDay || dateTBD ? undefined : (time || undefined),
      isOrderMade: isOrder,
      preorderStart: isOrder ? (preStart || undefined) : undefined,
      preorderEnd: isOrder ? (preEnd || undefined) : undefined,
    });
  };

  return (
    <div className="mt-2 rounded-[12px] border border-subtle p-3" style={{ backgroundColor: 'var(--bg-secondary)' }}>
      <div className="text-[12px] text-label-secondary mb-1">日付</div>
      <div className="flex gap-2 mb-2">
        <Chip active={allDay} onClick={() => { haptic.select(); setAllDay((v) => !v); }}>終日</Chip>
        <Chip active={dateTBD} onClick={() => { haptic.select(); setDateTBD((v) => !v); }}>日付未定</Chip>
      </div>
      {!dateTBD && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={dateCls} style={inputStyle} />
            {!allDay && <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={timeCls} style={inputStyle} />}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[13px] text-label-secondary">〜</span>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={dateCls} style={inputStyle} />
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mt-3">
        <span className="text-[14px]">予約・受注</span>
        <button onClick={() => { haptic.select(); setIsOrder((v) => !v); }} aria-label="予約・受注"
          className="pressable w-12 h-7 rounded-full relative" style={{ backgroundColor: isOrder ? 'var(--accent-color)' : 'var(--fill-tertiary)' }}>
          <span className="absolute top-0.5 w-6 h-6 rounded-full bg-white transition-all" style={{ left: isOrder ? 22 : 2 }} />
        </button>
      </div>
      {isOrder && (
        <div className="flex items-center gap-2 mt-2">
          <input type="date" value={preStart} onChange={(e) => setPreStart(e.target.value)} className={dateCls} style={inputStyle} />
          <span className="text-[13px] text-label-secondary">〜</span>
          <input type="date" value={preEnd} onChange={(e) => setPreEnd(e.target.value)} className={dateCls} style={inputStyle} />
        </div>
      )}

      <div className="flex gap-2 mt-3">
        <button onClick={onClose} className="pressable flex-1 py-2 rounded-[10px] text-[13px]" style={{ backgroundColor: 'var(--fill-tertiary)', color: 'var(--label-primary)' }}>キャンセル</button>
        <button onClick={save} className="pressable flex-1 py-2 rounded-[10px] text-[13px] font-semibold" style={{ backgroundColor: 'var(--accent-color)', color: 'var(--accent-on)' }}>保存</button>
      </div>
    </div>
  );
}

import { useState } from 'react';
import type { CalendarEvent } from '../../types';
import type { EventPatch } from '../../lib/api';
import { todayStr } from '../../design/tokens';
import { SEASON_LABELS, DATE_LABEL_OPTIONS, ambiguousDate } from '../../lib/ambiguousDate';
import Chip from '../ui/Chip';
import { haptic } from '../../lib/haptics';

const dateCls = 'flex-1 rounded-[10px] px-3 py-2.5 text-[14px] outline-none';
const timeCls = 'rounded-[10px] px-3 py-2.5 text-[14px] outline-none';
const inputStyle = { backgroundColor: 'var(--fill-tertiary)', color: 'var(--input-text)' };

/** 日時/予約のコンパクト編集（共同編集用）。実効値を初期値にし、保存でパッチを返す。
 *  日付未定は投稿フォームと同じ曖昧日付モデル（dateLabel＋代表日）で保存する。 */
export default function EventEditForm({ event, onSave, onClose }: { event: CalendarEvent; onSave: (patch: EventPatch) => void; onClose: () => void }) {
  const today = todayStr();
  // 曖昧日付（dateLabel あり）は「日付未定」扱いで初期化する
  const [dateTBD, setDateTBD] = useState(!event.date || !!event.dateLabel);
  const [dateLabel, setDateLabel] = useState(event.dateLabel ?? '');
  const [allDay, setAllDay] = useState(!event.time);
  const [date, setDate] = useState(event.date ?? today);
  const [endDate, setEndDate] = useState(event.endDate ?? event.date ?? today);
  const [time, setTime] = useState(event.time ?? '');
  const [isOrder, setIsOrder] = useState(!!event.isOrderMade);
  const [preStart, setPreStart] = useState(event.preorderStart ?? today);
  const [preEnd, setPreEnd] = useState(event.preorderEnd ?? today);

  const year = date ? date.slice(0, 4) : String(new Date().getFullYear());
  const month = date ? date.slice(5, 7) : String(new Date().getMonth() + 1).padStart(2, '0');

  const save = () => {
    haptic.select();
    onSave({
      // 日付未定: 代表日＋dateLabel（投稿フォームと同じモデル）。具体日: dateLabel をクリア
      date: date || null,
      dateLabel: dateTBD ? (dateLabel || null) : null,
      endDate: dateTBD ? null : (endDate || date || null),
      time: allDay || dateTBD ? null : (time || null),
      isOrderMade: isOrder,
      preorderStart: isOrder ? (preStart || undefined) : undefined,
      preorderEnd: isOrder ? (preEnd || undefined) : undefined,
    } as EventPatch);
  };

  // 単日（終了日＝開始日）のままなら、開始日を動かしたときに終了日も一緒に動かす。
  // 投稿フォーム（PostNew）と同じ挙動。期間を指定済みの人は終了日が違うので触らない。
  const changeStartDate = (next: string) => {
    if (endDate === date || !endDate) setEndDate(next);
    setDate(next);
  };

  return (
    <div className="mt-2 rounded-[12px] border border-subtle p-3" style={{ backgroundColor: 'var(--bg-secondary)' }}>
      <div className="text-[12px] text-label-secondary mb-1">日付</div>
      <div className="flex gap-2 mb-2">
        {!dateTBD && <Chip active={allDay} onClick={() => { haptic.select(); setAllDay((v) => !v); }}>終日</Chip>}
        <Chip active={dateTBD} onClick={() => {
          haptic.select();
          if (dateTBD) { setDateTBD(false); setDateLabel(''); }
          else {
            // 日付未定ON: 既定で「中旬」。代表日も当月15日にしておく
            const ym = (date || today).slice(0, 7);
            setDateTBD(true); setDateLabel('中旬'); setDate(`${ym}-15`);
          }
        }}>日付未定</Chip>
      </div>
      {!dateTBD ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <input type="date" value={date} onChange={(e) => changeStartDate(e.target.value)} className={dateCls} style={inputStyle} />
            {!allDay && <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={timeCls} style={inputStyle} />}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[13px] text-label-secondary">〜</span>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={dateCls} style={inputStyle} />
          </div>
        </div>
      ) : (
        /* 曖昧日付UI（年 / 月 / 区分）。投稿フォームと同じ */
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <select value={year}
              onChange={(e) => setDate(ambiguousDate(e.target.value, month || '01', dateLabel))}
              className={dateCls} style={inputStyle}>
              {[-1, 0, 1, 2].map((o) => { const y = new Date().getFullYear() + o; return <option key={y} value={y}>{y}年</option>; })}
            </select>
            {!SEASON_LABELS.includes(dateLabel) && (
              <select value={month}
                onChange={(e) => setDate(ambiguousDate(year, e.target.value, dateLabel))}
                className={dateCls} style={inputStyle}>
                {Array.from({ length: 12 }, (_, i) => { const m = String(i + 1).padStart(2, '0'); return <option key={m} value={m}>{i + 1}月</option>; })}
              </select>
            )}
          </div>
          <select value={dateLabel}
            onChange={(e) => { const val = e.target.value; setDateLabel(val); setDate(ambiguousDate(year, month, val)); }}
            className={`${dateCls} w-full`} style={inputStyle}>
            {DATE_LABEL_OPTIONS.map(([label, val]) => <option key={val} value={val}>{label}</option>)}
          </select>
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

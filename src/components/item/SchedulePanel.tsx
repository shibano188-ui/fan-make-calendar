import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import type { EventSchedule } from '../../types';
import { haptic } from '../../lib/haptics';

const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;

/** 「11/3 13:00〜」「11/1〜11/7」。日程1行の日付の書き方 */
function scheduleWhen(s: EventSchedule): string {
  const days = s.end && s.end !== s.start ? `${md(s.start)}〜${md(s.end)}` : md(s.start);
  return s.time ? `${days} ${s.time}${s.endTime ? `〜${s.endTime}` : '〜'}` : days;
}

type Draft = Omit<EventSchedule, 'id'>;

/** 予定の中の日程（昼の部・夜の部、一次受付・二次受付など）。投稿者と運営は足せる・消せる */
export default function SchedulePanel({ schedules, canEdit, onAdd, onRemove }: {
  schedules: EventSchedule[]; canEdit: boolean;
  onAdd: (s: Draft) => Promise<boolean>; onRemove: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<EventSchedule['kind']>('session');
  const [label, setLabel] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [time, setTime] = useState('');
  const [busy, setBusy] = useState(false);
  if (schedules.length === 0 && !canEdit) return null;

  const ready = !!label.trim() && !!start && (!end || end >= start) && !busy;
  const add = async () => {
    if (!ready) return;
    haptic.select();
    setBusy(true);
    const ok = await onAdd({ kind, label: label.trim(), start, end: end || undefined, time: kind === 'session' ? (time || undefined) : undefined });
    setBusy(false);
    if (ok) { setLabel(''); setStart(''); setEnd(''); setTime(''); setOpen(false); }
  };
  const input = 'w-full min-w-0 rounded-[8px] px-2.5 py-2 text-[13px] outline-none';
  const inputStyle = { backgroundColor: 'var(--fill-tertiary)', color: 'var(--input-text)' };

  return (
    <div className="mt-3">
      {schedules.length > 0 && <div className="text-[12px] text-label-secondary mb-1.5">日程</div>}
      <div className="flex flex-col gap-1.5">
        {schedules.map((s) => (
          <div key={s.id} className="flex items-center gap-2 text-[14px]">
            <span className="font-semibold min-w-0 truncate">{s.label}</span>
            <span className="text-label-secondary flex-shrink-0">{s.kind === 'preorder' ? (s.end ? `〜${md(s.end)} 締切` : `${md(s.start)}〜`) : scheduleWhen(s)}</span>
            {canEdit && (
              <button onClick={() => { haptic.select(); onRemove(s.id); }} aria-label={`${s.label}を消す`} className="pressable tap-44 ml-auto text-label-tertiary"><Trash2 size={15} /></button>
            )}
          </div>
        ))}
      </div>
      {canEdit && (!open ? (
        <button onClick={() => { haptic.select(); setOpen(true); }} className="pressable mt-1.5 text-[12px]" style={{ color: 'var(--accent-text)' }}>日程を足す（複数部・二次受付など）</button>
      ) : (
        <div className="mt-2 flex flex-col gap-2 rounded-[10px] p-2.5" style={{ backgroundColor: 'var(--bg-secondary)' }}>
          <div className="grid grid-cols-2 gap-2">
            {(['session', 'preorder'] as const).map((k) => (
              <button key={k} onClick={() => { haptic.select(); setKind(k); }} aria-pressed={kind === k}
                className="pressable h-8 rounded-[8px] text-[13px] font-medium"
                style={kind === k ? { backgroundColor: 'var(--accent-color)', color: 'var(--accent-on)' } : { backgroundColor: 'var(--fill-tertiary)', color: 'var(--label-primary)' }}>
                {k === 'session' ? '開催の回' : '受付の回'}
              </button>
            ))}
          </div>
          <input value={label} onChange={(e) => setLabel(e.target.value.slice(0, 40))} aria-label="日程の名前"
            placeholder={kind === 'session' ? '例）昼の部・東京公演' : '例）二次受付'} className={input} style={inputStyle} />
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[11px] text-label-secondary">{kind === 'session' ? '日付' : '受付開始'}
              <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className={`${input} mt-0.5`} style={inputStyle} /></label>
            <label className="text-[11px] text-label-secondary">{kind === 'session' ? '終わりの日（任意）' : '締切'}
              <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className={`${input} mt-0.5`} style={inputStyle} /></label>
          </div>
          {kind === 'session' && (
            <label className="text-[11px] text-label-secondary">開始時刻（任意）
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={`${input} mt-0.5`} style={inputStyle} /></label>
          )}
          <div className="flex items-center gap-3">
            <button onClick={add} disabled={!ready} className="pressable flex-1 h-9 rounded-[8px] text-[13px] font-semibold disabled:opacity-40"
              style={{ backgroundColor: 'var(--accent-color)', color: 'var(--accent-on)' }}>足す</button>
            <button onClick={() => { haptic.select(); setOpen(false); }} className="pressable text-[13px] text-label-secondary">閉じる</button>
          </div>
        </div>
      ))}
    </div>
  );
}

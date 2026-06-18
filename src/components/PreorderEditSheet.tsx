import { useState } from 'react';
import { X, Plus } from 'lucide-react';
import { updatePreorderInfo } from '../lib/api';
import { parseLinks, serializeLinks } from '../lib/constants';
import type { CalendarEvent } from '../types';
import { useToast } from './ui/Toast';

interface Props {
  event: CalendarEvent;
  onClose: () => void;
  onSaved: (updated: Partial<CalendarEvent>) => void;
}

const inputCls = 'w-full bg-bg-secondary rounded-lg px-3 py-2 text-sm text-label-primary outline-none border border-faint focus:border-strong';

export default function PreorderEditSheet({ event, onClose, onSaved }: Props) {
  const [date, setDate] = useState(event.dateLabel ? '' : (event.date ?? ''));
  const [time, setTime] = useState(event.time ?? '');
  const [endTime, setEndTime] = useState(event.endTime ?? '');
  const [endDate, setEndDate] = useState(event.endDate ?? '');
  const [preorderStart, setPreorderStart] = useState(event.preorderStart ?? '');
  const [preorderEnd, setPreorderEnd] = useState(event.preorderEnd ?? '');
  const [preorderStartTime, setPreorderStartTime] = useState(event.preorderStartTime ?? '');
  const [preorderEndTime, setPreorderEndTime] = useState(event.preorderEndTime ?? '');
  const [links, setLinks] = useState<string[]>(() => {
    const parsed = parseLinks(event.link);
    return parsed.length > 0 ? parsed : [''];
  });
  const [saving, setSaving] = useState(false);
  const showToast = useToast();

  const handleSave = async () => {
    setSaving(true);
    const link = serializeLinks(links) ?? '';
    const finalDate = date || (event.dateLabel ? null : (event.date || null));
    const finalDateLabel = date ? null : (event.dateLabel || null);
    // 予約開始日 or 終了日が入っていれば「予約あり」を自動でオンにする
    // （予約受付ページは is_order_made=true で絞り込むため）
    const isOrderMade = (event.isOrderMade ?? false) || !!preorderStart || !!preorderEnd;
    try {
      await updatePreorderInfo(event.id, { isOrderMade, preorderStart, preorderEnd, preorderStartTime, preorderEndTime, time, endTime, endDate, link, date: finalDate, dateLabel: finalDateLabel });
      onSaved({
        isOrderMade,
        preorderStart: preorderStart || undefined,
        preorderEnd: preorderEnd || undefined,
        preorderStartTime: preorderStartTime || undefined,
        preorderEndTime: preorderEndTime || undefined,
        time: time || undefined,
        endTime: endTime || undefined,
        endDate: endDate || undefined,
        link: link || undefined,
        ...(date ? { date, dateLabel: undefined } : {}),
      });
      onClose();
    } catch {
      showToast('保存に失敗しました', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-[400]" onClick={onClose} />
      <div
        className="fixed inset-x-0 bottom-0 z-[410] max-w-app mx-auto rounded-t-[18px] flex flex-col"
        style={{ backgroundColor: 'var(--bg-primary)', animation: 'slideUpPanel 0.22s cubic-bezier(0.32,0.72,0,1) both' }}
      >
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <span className="text-sm font-bold text-label-primary">情報を追加</span>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center text-label-tertiary active:opacity-60">
            <X size={18} />
          </button>
        </div>
        <p className="px-4 pb-3 text-xs text-label-tertiary truncate">{event.title}</p>

        <div className="px-4 flex flex-col gap-4 pb-6">
          {/* 日付 */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-label-tertiary">
              日付{event.dateLabel ? `（現在: ${event.dateLabel}）` : '（任意）'}
            </label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className={inputCls}
            />
            {event.dateLabel && !date && (
              <p className="text-[11px] text-label-tertiary">日付を入力すると「{event.dateLabel}」から変更されます</p>
            )}
          </div>

          {/* 開始時間・終了時間 */}
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-label-tertiary">開始時間（任意）</label>
              <input type="time" value={time} onChange={e => setTime(e.target.value)} className={inputCls} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-label-tertiary">終了時間（任意）</label>
              <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className={inputCls} />
            </div>
          </div>

          {/* 終了日 */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-label-tertiary">終了日（任意）</label>
            <input type="date" value={endDate} min={date || undefined} onChange={e => setEndDate(e.target.value)} className={inputCls} />
          </div>

          <div className="h-px" style={{ backgroundColor: 'var(--border-subtle)' }} />

          {/* 予約開始日 */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-label-tertiary">予約開始日（任意）</label>
            <input type="date" value={preorderStart} onChange={e => setPreorderStart(e.target.value)} className={inputCls} />
          </div>

          {/* 予約開始時間・締切時間 */}
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-label-tertiary">予約開始時間（任意）</label>
              <input type="time" value={preorderStartTime} onChange={e => setPreorderStartTime(e.target.value)} className={inputCls} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-label-tertiary">予約締切時間（任意）</label>
              <input type="time" value={preorderEndTime} onChange={e => setPreorderEndTime(e.target.value)} className={inputCls} />
            </div>
          </div>

          {/* 予約締切日 */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-label-tertiary">予約締切日（任意）</label>
            <input type="date" value={preorderEnd} min={preorderStart || undefined} onChange={e => setPreorderEnd(e.target.value)} className={inputCls} />
          </div>

          {/* 販売リンク */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-label-tertiary">リンク（任意・複数可）</label>
            <div className="flex flex-col gap-2">
              {links.map((lnk, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type="url"
                    value={lnk}
                    onChange={e => {
                      const next = [...links];
                      next[i] = e.target.value;
                      setLinks(next);
                    }}
                    placeholder="https://..."
                    className={`${inputCls} flex-1`}
                  />
                  {links.length > 1 && (
                    <button type="button" onClick={() => setLinks(links.filter((_, j) => j !== i))}
                      className="w-7 h-7 flex items-center justify-center text-label-tertiary active:opacity-60 flex-shrink-0">
                      <X size={14} />
                    </button>
                  )}
                </div>
              ))}
              {links.length < 5 && (
                <button type="button" onClick={() => setLinks([...links, ''])}
                  className="flex items-center gap-1 text-xs text-label-tertiary active:opacity-60 mt-0.5 w-fit">
                  <Plus size={12} />リンクを追加
                </button>
              )}
            </div>
          </div>

          <button onClick={handleSave} disabled={saving}
            className="w-full py-3 rounded-[14px] text-sm font-bold active:opacity-70 disabled:opacity-40"
            style={{ background: 'var(--accent-color)', color: 'var(--accent-on)' }}>
            {saving ? '更新中…' : '更新'}
          </button>
        </div>
      </div>
    </>
  );
}

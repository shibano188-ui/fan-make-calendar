import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import Sheet from './ui/Sheet';
import { listDeviceCalendars, getTargetCalendarId, type DeviceCalendar } from '../lib/deviceCalendar';
import { haptic } from '../lib/haptics';

interface Props {
  open: boolean;
  onClose: () => void;
  /** 「決定」を押したとき。ここで初めて書き込みが始まる */
  onDecide: (calendarId: string) => void;
}

// 端末カレンダーの書き込み先を選ぶシート。
//
// 端末には「誕生日」「日本の祝日」など読み取り専用に近いものまで並ぶので候補が多い。
// マイページに一覧を広げると設定画面が埋まるうえ、**先頭のものが黙って選ばれる**と
// 意図しないカレンダーに書き込まれる。そこでシートに閉じ込め、
// 選んで「決定」を押すまで1件も書き込まない。

export default function DeviceCalendarSheet({ open, onClose, onDecide }: Props) {
  const [cals, setCals] = useState<DeviceCalendar[] | null>(null);
  const [picked, setPicked] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setPicked(getTargetCalendarId());
    listDeviceCalendars().then(setCals).catch(() => setCals([]));
  }, [open]);

  const decide = () => {
    if (!picked) return;
    haptic.select();
    onDecide(picked);
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="書き込み先を選ぶ"
      maxHeight="70dvh"
      ariaLabel="書き込み先を選ぶ"
      headerRight={
        <button onClick={decide} disabled={!picked}
          className="pressable text-[13px] font-semibold px-3 py-1.5 rounded-full disabled:opacity-40"
          style={{ backgroundColor: 'var(--accent-color)', color: 'var(--accent-on)' }}>
          決定
        </button>
      }
      contentClassName="px-4"
    >
      <p className="px-1 pb-2 text-[12px] text-label-secondary">
        いいねした予定と自分の投稿を、ここで選んだカレンダーに書き込みます。
        Googleのカレンダーを選ぶとパソコンからも見られます。
      </p>
      {cals === null ? (
        <p className="px-1 py-6 text-center text-[13px] text-label-tertiary">読み込み中…</p>
      ) : cals.length === 0 ? (
        <p className="px-1 py-6 text-center text-[13px] text-label-tertiary">
          書き込めるカレンダーが見つかりませんでした。<br />端末の設定でカレンダーへのアクセスを許可してください。
        </p>
      ) : cals.map((c) => (
        <button key={c.id} onClick={() => { haptic.select(); setPicked(c.id); }}
          className="pressable w-full flex items-center gap-2 py-3 text-left border-b border-subtle">
          <span className="w-5 flex-shrink-0">
            {c.id === picked && <Check size={16} style={{ color: 'var(--accent-color)' }} />}
          </span>
          <span className="text-[14px] truncate">{c.title}</span>
        </button>
      ))}
    </Sheet>
  );
}

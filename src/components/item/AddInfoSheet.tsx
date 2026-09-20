import { useState } from 'react';
import type { CalendarEvent } from '../../types';
import type { EventPatch } from '../../lib/api';
import Sheet from '../ui/Sheet';
import EventEditForm from './EventEditForm';
import { haptic } from '../../lib/haptics';

// 予定詳細の「＋α」から開く、情報を足すためのパネル。
// 画面いっぱいには広げない（元の予定を見ながら足せるように半分くらい）。
// 何を足すかは詳細ページと同じ形のタブで選ぶ。

export type AddInfoTab = 'date' | 'link' | 'stock';

const TABS: { key: AddInfoTab; label: string }[] = [
  { key: 'date', label: '日時・予約' },
  { key: 'link', label: '購入リンク' },
  { key: 'stock', label: '在庫' },
];

const inputCls = 'flex-1 rounded-[10px] px-3 py-2.5 text-[14px] outline-none';
const inputStyle = { backgroundColor: 'var(--fill-tertiary)', color: 'var(--input-text)' };

interface Props {
  /** 編集パッチを重ねた実効値（日時フォームの初期値に使う） */
  event: CalendarEvent;
  onClose: () => void;
  onSaveEdit: (patch: EventPatch) => void | Promise<void>;
  /** false を返したら失敗＝パネルは開いたままにする（在庫の簡易チェックなど） */
  onAddLink: (url: string) => boolean | void | Promise<boolean | void>;
  onAddStock: (note: string) => boolean | void | Promise<boolean | void>;
}

export default function AddInfoSheet({ event, onClose, onSaveEdit, onAddLink, onAddStock }: Props) {
  const [tab, setTab] = useState<AddInfoTab>('date');
  const [url, setUrl] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (fn: () => boolean | void | Promise<boolean | void>) => {
    if (busy) return;
    setBusy(true);
    try { if (await fn() !== false) onClose(); } finally { setBusy(false); }
  };

  const tabs = (
    <div className="flex border-b border-subtle px-1" role="tablist">
      {TABS.map((t) => (
        <button key={t.key} role="tab" aria-selected={tab === t.key}
          onClick={() => { haptic.select(); setTab(t.key); }}
          className="pressable flex-1 py-2.5 text-[13px] font-semibold relative"
          style={{ color: tab === t.key ? 'var(--label-primary)' : 'var(--label-tertiary)' }}>
          {t.label}
          <span className="absolute left-3 right-3 -bottom-px h-[2px] rounded-full"
            style={{ backgroundColor: 'var(--accent-color)', opacity: tab === t.key ? 1 : 0, transition: 'opacity 0.2s' }} />
        </button>
      ))}
    </div>
  );

  return (
    <Sheet onClose={onClose} title="情報を追加" ariaLabel="情報を追加" maxHeight="62dvh" fixed={tabs}>
      <div className="px-4 pt-3" style={{ minHeight: '30dvh' }}>
        {tab === 'date' && (
          <>
            <p className="text-[12px] text-label-tertiary">直した日時はみんなに反映されます（履歴から戻せます）</p>
            <EventEditForm event={event} onClose={onClose} onSave={(p) => submit(() => onSaveEdit(p))} />
          </>
        )}

        {tab === 'link' && (
          <>
            <p className="text-[12px] text-label-tertiary">買えるページのURLを貼ってください</p>
            <div className="flex gap-2 mt-2">
              <input value={url} onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && url.trim() && submit(() => onAddLink(url.trim()))}
                placeholder="購入リンク（URL）" inputMode="url" autoFocus
                className={inputCls} style={inputStyle} />
              <button onClick={() => submit(() => onAddLink(url.trim()))} disabled={!url.trim() || busy}
                className="pressable px-4 rounded-[10px] text-[14px] font-semibold flex-shrink-0"
                style={{ backgroundColor: 'var(--accent-color)', color: 'var(--accent-on)' }}>追加</button>
            </div>
          </>
        )}

        {tab === 'stock' && (
          <>
            <p className="text-[12px] text-label-tertiary">見かけた在庫の様子を足せます</p>
            <div className="flex gap-2 mt-2">
              <input value={note} onChange={(e) => setNote(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && note.trim() && submit(() => onAddStock(note.trim()))}
                placeholder="在庫情報を追加" autoFocus
                className={inputCls} style={inputStyle} />
              <button onClick={() => submit(() => onAddStock(note.trim()))} disabled={!note.trim() || busy}
                className="pressable px-4 rounded-[10px] text-[14px] font-semibold flex-shrink-0"
                style={{ backgroundColor: 'var(--accent-color)', color: 'var(--accent-on)' }}>追加</button>
            </div>
          </>
        )}
      </div>
    </Sheet>
  );
}

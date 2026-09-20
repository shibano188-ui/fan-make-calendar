import { useState } from 'react';
import type { CalendarEvent } from '../../types';
import type { EventPatch } from '../../lib/api';
import Sheet from '../ui/Sheet';
import EventEditForm from './EventEditForm';
import { haptic } from '../../lib/haptics';

// 予定詳細の「＋α」から開く、情報を足す・直すためのパネル。
// 画面いっぱいには広げない（元の予定を見ながら足せるように半分くらい）。
// 何を足すかは詳細ページと同じ形のタブで選ぶが、**ボタンは下の「追加」ひとつだけ**。
// 3つとも直したい人が、タブを行き来して1回で送れるようにする。

export type AddInfoTab = 'date' | 'link' | 'stock' | 'note';

const TABS: { key: AddInfoTab; label: string }[] = [
  { key: 'date', label: '日時・予約' },
  { key: 'link', label: 'リンク' },
  { key: 'stock', label: '在庫' },
  { key: 'note', label: 'そのほか' },
];

const inputCls = 'flex-1 rounded-[10px] px-3 py-2.5 text-[14px] outline-none';
const inputStyle = { backgroundColor: 'var(--fill-tertiary)', color: 'var(--input-text)' };

interface Props {
  /** 編集パッチを重ねた実効値（日時フォームの初期値に使う） */
  event: CalendarEvent;
  onClose: () => void;
  /** それぞれ false を返したら失敗＝パネルは開いたままにする（在庫の簡易チェックなど） */
  onSaveEdit: (patch: EventPatch) => boolean | void | Promise<boolean | void>;
  onAddLink: (url: string) => boolean | void | Promise<boolean | void>;
  onAddStock: (note: string) => boolean | void | Promise<boolean | void>;
  onAddNote: (text: string) => boolean | void | Promise<boolean | void>;
}

export default function AddInfoSheet({ event, onClose, onSaveEdit, onAddLink, onAddStock, onAddNote }: Props) {
  const [tab, setTab] = useState<AddInfoTab>('date');
  const [datePatch, setDatePatch] = useState<EventPatch | null>(null); // 触られたときだけ入る
  const [url, setUrl] = useState('');
  const [stock, setStock] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const filled = !!datePatch || !!url.trim() || !!stock.trim() || !!note.trim();

  // 入っているものを上から順に送る。ひとつでも失敗したらパネルは閉じない（直して送り直せる）
  const submit = async () => {
    if (busy || !filled) return;
    haptic.select();
    setBusy(true);
    let ok = true;
    if (datePatch) ok = (await onSaveEdit(datePatch)) !== false && ok;
    if (url.trim()) ok = (await onAddLink(url.trim())) !== false && ok;
    if (stock.trim()) ok = (await onAddStock(stock.trim())) !== false && ok;
    if (note.trim()) ok = (await onAddNote(note.trim())) !== false && ok;
    setBusy(false);
    if (ok) onClose();
  };

  /** 入っているタブに点を付ける（別のタブに書いたことを忘れないように） */
  const hasInput = (k: AddInfoTab) =>
    k === 'date' ? !!datePatch : k === 'link' ? !!url.trim() : k === 'stock' ? !!stock.trim() : !!note.trim();

  const tabs = (
    <div className="flex border-b border-subtle px-1" role="tablist">
      {TABS.map((t) => (
        <button key={t.key} role="tab" aria-selected={tab === t.key}
          onClick={() => { haptic.select(); setTab(t.key); }}
          className="pressable flex-1 py-2.5 text-[13px] font-semibold relative"
          style={{ color: tab === t.key ? 'var(--label-primary)' : 'var(--label-tertiary)' }}>
          {t.label}
          {hasInput(t.key) && (
            <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full" style={{ backgroundColor: 'var(--accent-color)' }} />
          )}
          <span className="absolute left-3 right-3 -bottom-px h-[2px] rounded-full"
            style={{ backgroundColor: 'var(--accent-color)', opacity: tab === t.key ? 1 : 0, transition: 'opacity 0.2s' }} />
        </button>
      ))}
    </div>
  );

  return (
    <Sheet onClose={onClose} title="情報を追加・修正" ariaLabel="情報を追加・修正" maxHeight="62dvh" fixed={tabs}>
      <div className="px-4 pt-1" style={{ minHeight: '38dvh' }}>
        {tab === 'date' && (
          <EventEditForm event={event} showActions={false} onChange={setDatePatch}
            onSave={() => {}} onClose={onClose} />
        )}

        {tab === 'link' && (
          <>
            {/* 買えるページとソース（Xのポスト・公式サイト・記事）を同じ欄で受ける。
                どちらとして扱うかは貼られたURLで振り分ける（ItemDetail の addLink） */}
            <p className="text-[12px] text-label-tertiary mt-2">買えるページでも、Xのポストや記事でも</p>
            <input value={url} onChange={(e) => setUrl(e.target.value)}
              placeholder="リンク（URL）" inputMode="url"
              className={`${inputCls} w-full mt-2`} style={inputStyle} />
          </>
        )}

        {tab === 'stock' && (
          <>
            <p className="text-[12px] text-label-tertiary mt-2">見かけた在庫の様子を足せます</p>
            <input value={stock} onChange={(e) => setStock(e.target.value)}
              placeholder="在庫情報を追加"
              className={`${inputCls} w-full mt-2`} style={inputStyle} />
          </>
        )}

        {tab === 'note' && (
          <>
            {/* 型に収まらないこと（購入制限・整理券など）の受け皿。
                自由に書ける公開の場所は作らない方針なので、ここに書いたものは他の人には出さない */}
            <p className="text-[12px] text-label-tertiary mt-2">ここに書いたことは、ほかの人には出ません。運営とAIが読んで予定に反映します</p>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={4}
              placeholder="そのほかの詳しい情報（おひとり様2点まで、整理券の配布時間 など）"
              className="w-full mt-2 rounded-[10px] px-3 py-2.5 text-[14px] outline-none resize-none" style={inputStyle} />
          </>
        )}
      </div>

      {/* ボタンはタブをまたいでひとつ。どのタブから押しても、入っているものを全部送る */}
      <div className="sticky bottom-0 px-4 pt-2 pb-1 material-sheet">
        <button onClick={submit} disabled={!filled || busy}
          className="pressable w-full py-3 rounded-[10px] text-[15px] font-semibold"
          style={{ backgroundColor: filled ? 'var(--accent-color)' : 'var(--fill-tertiary)', color: filled ? 'var(--accent-on)' : 'var(--label-tertiary)' }}>
          追加
        </button>
      </div>
    </Sheet>
  );
}

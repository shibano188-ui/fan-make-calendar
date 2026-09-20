import { useState } from 'react';
import { Plus, X } from 'lucide-react';
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
  { key: 'note', label: '詳細' },
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
  // リンクと在庫は1回で何件も足せる（店ごとに在庫を書く・販路を何件も貼る）
  const [urls, setUrls] = useState<string[]>(['']);
  const [stocks, setStocks] = useState<string[]>(['']);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const written = (rows: string[]) => rows.map((r) => r.trim()).filter(Boolean);
  const filled = !!datePatch || written(urls).length > 0 || written(stocks).length > 0 || !!note.trim();

  // 入っているものを上から順に送る。通ったものは消し、失敗したものだけ残してパネルは開けておく
  const submit = async () => {
    if (busy || !filled) return;
    haptic.select();
    setBusy(true);
    let ok = true;
    if (datePatch) {
      if ((await onSaveEdit(datePatch)) === false) ok = false;
      else setDatePatch(null);
    }
    const leftUrls: string[] = [];
    for (const u of written(urls)) if ((await onAddLink(u)) === false) { leftUrls.push(u); ok = false; }
    setUrls(leftUrls.length ? leftUrls : ['']);
    const leftStocks: string[] = [];
    for (const n of written(stocks)) if ((await onAddStock(n)) === false) { leftStocks.push(n); ok = false; }
    setStocks(leftStocks.length ? leftStocks : ['']);
    if (note.trim()) {
      if ((await onAddNote(note.trim())) === false) ok = false;
      else setNote('');
    }
    setBusy(false);
    if (ok) onClose();
  };

  /** 入っているタブに点を付ける（別のタブに書いたことを忘れないように） */
  const hasInput = (k: AddInfoTab) =>
    k === 'date' ? !!datePatch
      : k === 'link' ? written(urls).length > 0
      : k === 'stock' ? written(stocks).length > 0
      : !!note.trim();

  /** 行を足せる入力欄。＋で行が増え、2行以上あるときは×で減らせる */
  const rowsField = (rows: string[], setRows: (v: string[]) => void, placeholder: string, url = false) => (
    <div className="flex flex-col gap-2 mt-2">
      {rows.map((v, i) => (
        <div key={i} className="flex items-center gap-2">
          <input value={v} placeholder={placeholder} inputMode={url ? 'url' : undefined}
            onChange={(e) => setRows(rows.map((r, j) => (j === i ? e.target.value : r)))}
            className={inputCls} style={inputStyle} />
          {rows.length > 1 && (
            <button onClick={() => { haptic.select(); setRows(rows.filter((_, j) => j !== i)); }}
              aria-label="この行を消す" className="pressable tap-44 text-label-tertiary flex-shrink-0"><X size={16} /></button>
          )}
        </div>
      ))}
      <button onClick={() => { haptic.select(); setRows([...rows, '']); }} disabled={!rows[rows.length - 1].trim()}
        aria-label="行を増やす" className="pressable self-start tap-44 py-1"
        style={{ color: rows[rows.length - 1].trim() ? 'var(--accent-text)' : 'var(--label-tertiary)' }}>
        <Plus size={18} strokeWidth={3} />
      </button>
    </div>
  );

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
            <p className="text-[12px] text-label-tertiary mt-2">販売先、Xのポスト、公式サイトなど</p>
            {rowsField(urls, setUrls, 'リンク（URL）', true)}
          </>
        )}

        {tab === 'stock' && (
          <>
            <p className="text-[12px] text-label-tertiary mt-2">店舗ごとに入力してください</p>
            {rowsField(stocks, setStocks, '在庫情報を追加')}
          </>
        )}

        {tab === 'note' && (
          <>
            {/* 型に収まらないこと（購入制限・整理券など）の受け皿。
                自由に書ける公開の場所は作らない方針なので、ここに書いたものは他の人には出さない */}
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={4}
              placeholder="詳細を追加"
              className="w-full mt-3 rounded-[10px] px-3 py-2.5 text-[14px] outline-none resize-none" style={inputStyle} />
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

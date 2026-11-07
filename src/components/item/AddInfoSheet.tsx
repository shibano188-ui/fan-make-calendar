import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import type { CalendarEvent } from '../../types';
import type { EventPatch } from '../../lib/api';
import Sheet from '../ui/Sheet';
import EventEditForm from './EventEditForm';
import { haptic } from '../../lib/haptics';
import { STATUS, deriveStatus, deriveItemType, type ItemStatus } from '../../design/tokens';
import { priceSpan } from '../../lib/affiliate';

// 予定詳細の「＋α」から開く、情報を足す・直すためのパネル。
// 画面いっぱいには広げない（元の予定を見ながら足せるように半分くらい）。
// 何を足すかは詳細ページと同じ形のタブで選ぶが、**ボタンは下の「追加」ひとつだけ**。
// 3つとも直したい人が、タブを行き来して1回で送れるようにする。
// 2026-11-07 デザインの一新: 日付はカレンダーで選ぶ（EventEditForm）。タブ・札は探すの上部と同じ見せ方に

export type AddInfoTab = 'date' | 'link' | 'stock' | 'note';

const TABS: { key: AddInfoTab; label: string }[] = [
  { key: 'date', label: '日時・状況' },
  { key: 'link', label: 'リンク・値段' },
  { key: 'stock', label: '在庫' },
  { key: 'note', label: '詳細' },
];

const inputCls = 'flex-1 min-w-0 h-11 rounded-[12px] px-3 text-[14px] outline-none';
const inputStyle = { backgroundColor: 'var(--fill-tertiary)', color: 'var(--input-text)' };

interface Props {
  /** 編集パッチを重ねた実効値（日時フォームの初期値に使う） */
  event: CalendarEvent;
  onClose: () => void;
  /** それぞれ false を返したら失敗＝パネルは開いたままにする（在庫の簡易チェックなど） */
  /** evidence: 同じ送信で貼られたURL（ボットが修正を確かめるときの裏付けに使う） */
  onSaveEdit: (patch: EventPatch, evidence?: string[]) => boolean | void | Promise<boolean | void>;
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
  // 値段の修正（グッズのみ）。販路から取れた値段が違うとき・取れないときに直す。日時と同じ共同編集
  // 種類で値段が分かれるもの（1,000〜2,000円など）は、〜のあとにも入れて幅にする（2026-11-07 柴野）
  const [price, setPrice] = useState('');
  const [priceTo, setPriceTo] = useState('');
  const toNum = (v: string) => { const t = v.trim().replace(/[,，円¥￥\s]/g, '').replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)); return /^\d+$/.test(t) && Number(t) > 0 ? Number(t) : null; };
  const priceNums = [toNum(price), toNum(priceTo)].filter((n): n is number => n != null).sort((a, b) => a - b);
  const priceNum = priceNums[0] ?? null;
  const priceMaxNum = priceNums.length === 2 && priceNums[1] > priceNums[0] ? priceNums[1] : null;
  const now = priceSpan(event);
  // 種別は詳細ページと同じ決め方（カテゴリ優先）。DB の type が event のままのグッズがある
  const isGoods = deriveItemType(event) === 'goods';
  const [busy, setBusy] = useState(false);
  // 発売状況（2026-09-29）。今の状態と違うものを選んだときだけ送る
  const current = deriveStatus(event);
  const [saleStatus, setSaleStatus] = useState<ItemStatus | null>(null);

  const written = (rows: string[]) => rows.map((r) => r.trim()).filter(Boolean);
  const filled = !!datePatch || !!saleStatus || priceNum != null || written(urls).length > 0 || written(stocks).length > 0 || !!note.trim();

  // 入っているものを上から順に送る。通ったものは消し、失敗したものだけ残してパネルは開けておく
  const submit = async () => {
    if (busy || !filled) return;
    haptic.select();
    setBusy(true);
    let ok = true;
    // 日時と値段は1つの修正としてまとめて送る（履歴に1行で残る）
    if (datePatch || saleStatus || priceNum != null) {
      // 売り切れは ended として保存する（soldout は画面だけの状態。tokens.ts）
      const stored = saleStatus === 'soldout' ? 'ended' : saleStatus;
      // 1つの値段にしたときは、前に幅で入っていた上限を消す（修正の記録は古い順に重なるため）
      const pricePatch: EventPatch = priceNum == null ? {} : priceMaxNum != null ? { price: priceNum, priceMax: priceMaxNum } : { price: priceNum, ...(event.priceMax ? { priceMax: null } : {}) };
      const patch: EventPatch = { ...(datePatch ?? {}), ...(stored ? { saleStatus: stored } : {}), ...pricePatch };
      if ((await onSaveEdit(patch, written(urls))) === false) ok = false;
      else { setDatePatch(null); setSaleStatus(null); setPrice(''); setPriceTo(''); }
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
    k === 'date' ? !!datePatch || !!saleStatus
      : k === 'link' ? written(urls).length > 0 || priceNum != null
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

  // 探すの上部と同じ: 太い字・選んでいるものだけ黒い下線
  const tabs = (
    <div className="flex items-end gap-4 px-4" role="tablist" style={{ borderBottom: '0.5px solid var(--separator)' }}>
      {TABS.map((t) => (
        <button key={t.key} role="tab" aria-selected={tab === t.key}
          onClick={() => { haptic.select(); setTab(t.key); }}
          className="pressable relative pb-2 pt-1 text-[14px] font-extrabold whitespace-nowrap"
          style={{ color: tab === t.key ? 'var(--label-primary)' : 'var(--label-tertiary)' }}>
          {t.key === 'link' && !isGoods ? 'リンク' : t.label}
          {hasInput(t.key) && (
            <span className="absolute top-0.5 -right-2 w-1.5 h-1.5 rounded-full" style={{ backgroundColor: 'var(--accent-color)' }} />
          )}
          {tab === t.key && <span className="absolute inset-x-0 -bottom-px h-[2.5px] rounded-full" style={{ backgroundColor: 'var(--label-primary)' }} />}
        </button>
      ))}
    </div>
  );

  return (
    // 日付をカレンダーで選ぶので、前（62dvh）より高くする。上に元の予定のタイトルは見えたまま
    <Sheet onClose={onClose} title="情報を追加・修正" ariaLabel="情報を追加・修正" maxHeight="84dvh" fixed={tabs}>
      <div className="px-4 pt-1" style={{ minHeight: '40dvh' }}>
        {tab === 'date' && (
          <>
            {/* 発売状況。日付から出す状態が店の実際と違うとき（前倒しで予約終了・再販で発売中など）に直す。横に1行で並べる */}
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-[13px] font-extrabold">{isGoods ? '発売状況' : '開催状況'}</span>
              <span className="text-[12px] text-label-secondary">今は「{STATUS[current][isGoods ? 'goodsLabel' : 'eventLabel']}」</span>
            </div>
            <div className="flex gap-1.5 mt-2 -mx-4 px-4 overflow-x-auto no-scrollbar">
              {/* グッズは「発売済み」（在庫が分からない）を選ばせず「売り切れ」を出す。イベントは逆 */}
              {(Object.keys(STATUS) as ItemStatus[]).filter((k) => k !== current && k !== (isGoods ? 'ended' : 'soldout')).map((k) => (
                <button key={k} type="button" aria-pressed={saleStatus === k}
                  onClick={() => { haptic.select(); setSaleStatus(saleStatus === k ? null : k); }}
                  className="pressable flex-shrink-0 h-8 px-3 rounded-full text-[13px] font-bold whitespace-nowrap"
                  style={saleStatus === k ? { backgroundColor: 'var(--label-primary)', color: 'var(--bg-primary)' } : { backgroundColor: 'var(--fill-tertiary)', color: 'var(--label-primary)' }}>
                  {STATUS[k][isGoods ? 'goodsLabel' : 'eventLabel']}
                </button>
              ))}
            </div>
            <div className="mt-5 text-[13px] font-extrabold">日付</div>
            <EventEditForm event={event} showActions={false} onChange={setDatePatch}
              onSave={() => {}} onClose={onClose} />
          </>
        )}

        {tab === 'link' && (
          <>
            {/* 買えるページとソース（Xのポスト・公式サイト・記事）を同じ欄で受ける。
                どちらとして扱うかは貼られたURLで振り分ける（ItemDetail の addLink） */}
            <p className="text-[12px] text-label-secondary mt-3">販売先、Xのポスト、公式サイトなど</p>
            {rowsField(urls, setUrls, 'リンク（URL）', true)}
            {isGoods && (
              <>
                <p className="text-[12px] text-label-secondary mt-5">
                  値段が違う・出ていないとき（税込）{now && <span className="ml-1.5">今は <span className="num font-bold text-label-primary">¥{now.min.toLocaleString()}{now.max > now.min ? `〜¥${now.max.toLocaleString()}` : ''}</span></span>}
                </p>
                <div className="flex items-center gap-2 mt-2">
                  <input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="numeric" aria-label="値段"
                    placeholder="例: 1650" className={`num font-bold ${inputCls}`} style={inputStyle} />
                  <span className="text-[14px] text-label-tertiary flex-shrink-0">〜</span>
                  <input value={priceTo} onChange={(e) => setPriceTo(e.target.value)} inputMode="numeric" aria-label="値段の上限（種類で違うとき）"
                    placeholder="種類で違えば" className={`num font-bold ${inputCls}`} style={inputStyle} />
                  <span className="text-[14px] text-label-secondary flex-shrink-0">円</span>
                </div>
              </>
            )}
          </>
        )}

        {tab === 'stock' && (
          <>
            <p className="text-[12px] text-label-secondary mt-3">店舗ごとに入力してください</p>
            {rowsField(stocks, setStocks, '在庫情報を追加')}
          </>
        )}

        {tab === 'note' && (
          <>
            {/* 型に収まらないこと（購入制限・整理券など）の受け皿。
                自由に書ける公開の場所は作らない方針なので、ここに書いたものは他の人には出さない */}
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={4}
              placeholder="詳細を追加"
              className="w-full mt-3 rounded-[12px] px-3 py-2.5 text-[14px] outline-none resize-none" style={inputStyle} />
          </>
        )}
      </div>

      {/* ボタンはタブをまたいでひとつ。どのタブから押しても、入っているものを全部送る */}
      {/* シートの本文には下の余白（max(16px, sab)）があり、そのままだと下から中身がのぞくので、その分だけ下げて自分で埋める */}
      <div className="sticky px-4 pt-2 material-sheet"
        style={{ bottom: 'calc(-1 * max(16px, var(--sab)))', marginBottom: 'calc(-1 * max(16px, var(--sab)))', paddingBottom: 'calc(max(16px, var(--sab)) + 4px)' }}>
        <button onClick={submit} disabled={!filled || busy}
          className="pressable w-full h-12 rounded-[14px] text-[15px] font-bold"
          style={{ backgroundColor: filled ? 'var(--accent-color)' : 'var(--fill-tertiary)', color: filled ? 'var(--accent-on)' : 'var(--label-tertiary)' }}>
          追加
        </button>
      </div>
    </Sheet>
  );
}

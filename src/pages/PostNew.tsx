import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Plus, Check } from 'lucide-react';
import Chip from '../components/ui/Chip';
import { searchWorks, getOrCreateWork, createEvents, upsertParticipation, type Work } from '../lib/api';
import { serializeCategories, GOODS_SUBCATEGORIES } from '../lib/constants';
import { affiliatize } from '../lib/affiliate';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../components/ui/Toast';
import { haptic } from '../lib/haptics';
import { todayStr, type ItemType } from '../design/tokens';

const GOODS_CATS = [...GOODS_SUBCATEGORIES, 'グルメ', '書籍'];
const EVENT_CATS = ['イベント', 'アニメ・映画', '誕生日', 'キャンペーン'];

const inputCls = 'w-full rounded-[10px] px-3 py-2.5 text-[14px] outline-none';
const dateCls = 'flex-1 rounded-[10px] px-3 py-2.5 text-[14px] outline-none';
const timeCls = 'rounded-[10px] px-3 py-2.5 text-[14px] outline-none';
const inputStyle = { backgroundColor: 'var(--fill-tertiary)', color: 'var(--input-text)' };
const labelCls = 'text-[12px] text-label-secondary mb-1 mt-4';

export default function PostNew() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const toast = useToast();

  const [type, setType] = useState<ItemType>('goods');
  const [workId, setWorkId] = useState<string | null>(null);
  const [workName, setWorkName] = useState('');
  const [workQuery, setWorkQuery] = useState('');
  const [workResults, setWorkResults] = useState<Work[]>([]);
  const [title, setTitle] = useState('');
  const [cats, setCats] = useState<Set<string>>(new Set());
  const today = todayStr();
  const [allDay, setAllDay] = useState(true);
  const [dateTBD, setDateTBD] = useState(false);
  const [date, setDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [time, setTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [isOrder, setIsOrder] = useState(false);
  const [preAllDay, setPreAllDay] = useState(true);
  const [preStart, setPreStart] = useState(today);
  const [preEnd, setPreEnd] = useState(today);
  const [preStartTime, setPreStartTime] = useState('');
  const [preEndTime, setPreEndTime] = useState('');
  const [price, setPrice] = useState('');
  const [link, setLink] = useState('');
  const [showExtra, setShowExtra] = useState(false);
  const [stockNote, setStockNote] = useState('');
  const [memo, setMemo] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);

  // 開いたら最上部から（前ページのスクロール位置を引き継がない）
  useEffect(() => {
    let el = rootRef.current?.parentElement as HTMLElement | null;
    while (el) {
      const oy = getComputedStyle(el).overflowY;
      if (oy === 'auto' || oy === 'scroll') el.scrollTop = 0;
      el = el.parentElement;
    }
    window.scrollTo(0, 0);
  }, []);

  // 作品オートコンプリート（名寄せ簡易版: 既存検索＋新規作成）
  useEffect(() => {
    const q = workQuery.trim();
    if (!q || workId) { setWorkResults([]); return; }
    let alive = true;
    const t = setTimeout(() => { searchWorks(q).then((r) => alive && setWorkResults(r)).catch(() => {}); }, 250);
    return () => { alive = false; clearTimeout(t); };
  }, [workQuery, workId]);

  const catList = type === 'goods' ? GOODS_CATS : EVENT_CATS;
  const toggleCat = (c: string) => {
    haptic.select();
    setCats((prev) => { const n = new Set(prev); n.has(c) ? n.delete(c) : n.add(c); return n; });
  };

  const linkInfo = link.trim() ? affiliatize(link.trim()) : null;
  const canSave = !!title.trim() && (!!workId || !!workQuery.trim()) && !saving;

  const onSubmit = async () => {
    if (!user || !canSave) return;
    setSaving(true); setError('');
    try {
      let wid = workId;
      if (!wid) { const w = await getOrCreateWork(workQuery.trim()); wid = w.id; }
      const info = link.trim() ? affiliatize(link.trim()) : null;
      await createEvents(wid, [{
        title: title.trim(),
        type,
        date: dateTBD ? null : (date || null),
        endDate: dateTBD ? undefined : (endDate || date || undefined),
        time: allDay || dateTBD ? undefined : (time || undefined),
        endTime: allDay || dateTBD ? undefined : (endTime || undefined),
        category: cats.size ? serializeCategories([...cats]) : undefined,
        price: type === 'goods' && price ? Number(price) : undefined,
        link: link.trim() || undefined,
        affiliateUrl: info?.url,
        hasAffiliate: info?.hasAffiliate,
        retailer: info?.retailer,
        isOrderMade: isOrder,
        preorderStart: isOrder ? (preStart || undefined) : undefined,
        preorderEnd: isOrder ? (preEnd || undefined) : undefined,
        preorderStartTime: isOrder && !preAllDay ? (preStartTime || undefined) : undefined,
        preorderEndTime: isOrder && !preAllDay ? (preEndTime || undefined) : undefined,
        stockNote: stockNote.trim() || undefined,
        memo: memo.trim() || undefined,
      }], user.id);
      await upsertParticipation(wid, user.id).catch(() => {}); // 投稿で自動フォロー
      haptic.select();
      toast('投稿しました');
      navigate(-1);
    } catch (e) {
      setError('投稿に失敗しました。時間をおいて再度お試しください。');
      setSaving(false);
    }
  };

  return (
    <div ref={rootRef} className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <div className="mx-auto w-full max-w-app">
        {/* ヘッダー */}
        <div className="sticky top-0 z-20 flex items-center justify-between px-3 py-2.5 border-b border-subtle" style={{ backgroundColor: 'var(--bg-primary)' }}>
          <button onClick={() => navigate(-1)} aria-label="閉じる" className="pressable tap-44 p-1"><X size={22} /></button>
          <span className="font-semibold">投稿</span>
          <button onClick={onSubmit} disabled={!canSave}
            className="pressable px-3 py-1.5 rounded-full text-[13px] font-semibold"
            style={canSave ? { backgroundColor: 'var(--accent-color)', color: 'var(--accent-on)' } : { backgroundColor: 'var(--fill-tertiary)', color: 'var(--label-tertiary)' }}>
            {saving ? '投稿中…' : '投稿'}
          </button>
        </div>

        <div className="px-4 pb-24">
          {/* 種別 */}
          <div className="flex gap-2 mt-3">
            <Chip active={type === 'goods'} onClick={() => { haptic.select(); setType('goods'); setCats(new Set()); }}>グッズ</Chip>
            <Chip active={type === 'event'} onClick={() => { haptic.select(); setType('event'); setCats(new Set()); }}>イベント</Chip>
          </div>

          {/* 作品 */}
          <div className={labelCls}>作品 <span style={{ color: 'var(--color-destructive)' }}>*</span></div>
          {workId ? (
            <div className="flex items-center justify-between rounded-[10px] px-3 py-2.5" style={inputStyle}>
              <span className="text-[14px]">{workName}</span>
              <button onClick={() => { setWorkId(null); setWorkName(''); setWorkQuery(''); }} className="pressable text-[12px] text-label-secondary">変更</button>
            </div>
          ) : (
            <div className="relative">
              <input value={workQuery} onChange={(e) => setWorkQuery(e.target.value)} placeholder="作品名を入力" className={inputCls} style={inputStyle} />
              {(workResults.length > 0 || workQuery.trim()) && (
                <div className="absolute left-0 right-0 mt-1 z-10 rounded-[10px] border border-subtle overflow-hidden" style={{ backgroundColor: 'var(--bg-secondary)' }}>
                  {workResults.map((w) => (
                    <button key={w.id} onClick={() => { haptic.select(); setWorkId(w.id); setWorkName(w.name); setWorkResults([]); }}
                      className="pressable w-full text-left px-3 py-2.5 text-[14px] border-b border-subtle">{w.name}</button>
                  ))}
                  {workQuery.trim() && !workResults.some((w) => w.name === workQuery.trim()) && (
                    <button onClick={() => { haptic.select(); setWorkName(workQuery.trim()); setWorkId(null); setWorkResults([]); }}
                      className="pressable w-full text-left px-3 py-2.5 text-[14px] flex items-center gap-2" style={{ color: 'var(--accent-text)' }}>
                      <Plus size={16} /> 「{workQuery.trim()}」を新規作成
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* タイトル */}
          <div className={labelCls}>タイトル <span style={{ color: 'var(--color-destructive)' }}>*</span></div>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={type === 'goods' ? '例: アクリルスタンド 全8種' : '例: POP UP STORE'} className={inputCls} style={inputStyle} />

          {/* カテゴリ */}
          <div className={labelCls}>カテゴリ</div>
          <div className="flex flex-wrap gap-1.5">
            {catList.map((c) => <Chip key={c} active={cats.has(c)} onClick={() => toggleCat(c)}>{c}</Chip>)}
          </div>

          {/* 価格（グッズ） */}
          {type === 'goods' && (
            <>
              <div className={labelCls}>価格（任意）</div>
              <input value={price} onChange={(e) => setPrice(e.target.value.replace(/[^0-9]/g, ''))} inputMode="numeric" placeholder="例: 1320" className={inputCls} style={inputStyle} />
            </>
          )}

          {/* 日程 */}
          <div className={labelCls}>{type === 'goods' ? '発売日' : '開催日'}</div>
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
                {!allDay && <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className={timeCls} style={inputStyle} />}
              </div>
            </div>
          )}

          {/* 受注・予約 */}
          <div className="flex items-center justify-between mt-4">
            <span className="text-[14px]">予約・受注</span>
            <button onClick={() => { haptic.select(); setIsOrder((v) => !v); }} aria-label="予約・受注"
              className="pressable w-12 h-7 rounded-full relative transition-colors"
              style={{ backgroundColor: isOrder ? 'var(--accent-color)' : 'var(--fill-tertiary)' }}>
              <span className="absolute top-0.5 w-6 h-6 rounded-full bg-white transition-all" style={{ left: isOrder ? 22 : 2 }} />
            </button>
          </div>
          {isOrder && (
            <div className="mt-2">
              <div className="flex gap-2 mb-2">
                <Chip active={preAllDay} onClick={() => { haptic.select(); setPreAllDay((v) => !v); }}>終日</Chip>
              </div>
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <input type="date" value={preStart} onChange={(e) => setPreStart(e.target.value)} className={dateCls} style={inputStyle} />
                  {!preAllDay && <input type="time" value={preStartTime} onChange={(e) => setPreStartTime(e.target.value)} className={timeCls} style={inputStyle} />}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[13px] text-label-secondary">〜</span>
                  <input type="date" value={preEnd} onChange={(e) => setPreEnd(e.target.value)} className={dateCls} style={inputStyle} />
                  {!preAllDay && <input type="time" value={preEndTime} onChange={(e) => setPreEndTime(e.target.value)} className={timeCls} style={inputStyle} />}
                </div>
              </div>
            </div>
          )}

          {/* リンク */}
          <div className={labelCls}>リンク（購入・予約ページ）</div>
          <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://..." inputMode="url" className={inputCls} style={inputStyle} />
          {linkInfo && (
            <div className="text-[12px] mt-1" style={{ color: linkInfo.hasAffiliate ? 'var(--color-success)' : 'var(--label-secondary)' }}>
              {linkInfo.hasAffiliate ? `✓ ${linkInfo.retailer}（アフィ対応）` : `${linkInfo.retailer || 'リンク'}（アフィ非対応・B2B送客）`}
            </div>
          )}

          {/* 在庫メモ・メモ（＋で展開） */}
          {!showExtra ? (
            <button onClick={() => setShowExtra(true)} className="pressable flex items-center gap-1 text-[13px] mt-4" style={{ color: 'var(--accent-text)' }}>
              <Plus size={16} /> 在庫メモ・メモを追加
            </button>
          ) : (
            <>
              <div className={labelCls}>在庫メモ</div>
              <input value={stockNote} onChange={(e) => setStockNote(e.target.value)} placeholder="例: 池袋本店 残りわずか" className={inputCls} style={inputStyle} />
              <div className={labelCls}>メモ</div>
              <textarea value={memo} onChange={(e) => setMemo(e.target.value)} rows={3} placeholder="補足情報" className={`${inputCls} resize-none`} style={inputStyle} />
            </>
          )}

          {error && <div className="text-[13px] mt-4" style={{ color: 'var(--color-destructive)' }}>{error}</div>}

          {/* 投稿ボタン（下部にも） */}
          <button onClick={onSubmit} disabled={!canSave}
            className="pressable w-full mt-6 py-3 rounded-[10px] font-semibold flex items-center justify-center gap-2"
            style={canSave ? { backgroundColor: 'var(--accent-color)', color: 'var(--accent-on)' } : { backgroundColor: 'var(--fill-tertiary)', color: 'var(--label-tertiary)' }}>
            <Check size={18} /> {saving ? '投稿中…' : '投稿する'}
          </button>
        </div>
      </div>
    </div>
  );
}

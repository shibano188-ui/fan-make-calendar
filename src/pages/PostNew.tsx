import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { X, Plus, Check, Sparkles, Camera, Link2, Loader2 } from 'lucide-react';
import Chip from '../components/ui/Chip';
import { searchWorks, getOrCreateWork, createEvents, upsertParticipation, findDuplicateEvents, findDuplicatesByTitleGlobal, type Work } from '../lib/api';
import { serializeCategories, parseCategories, parseImageUrls, serializeImageUrls, GOODS_SUBCATEGORIES } from '../lib/constants';
import { affiliatize } from '../lib/affiliate';
import { parseEventsApi, fileToBase64, type ParsedEvent } from '../lib/parseEvents';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../components/ui/Toast';
import { haptic } from '../lib/haptics';
import { todayStr, deriveItemType, type ItemType } from '../design/tokens';

const GOODS_CATS = [...GOODS_SUBCATEGORIES, 'グルメ', '書籍'];
const EVENT_CATS = ['イベント', 'アニメ・映画', '誕生日', 'キャンペーン'];

const inputCls = 'w-full rounded-[10px] px-3 py-2.5 text-[14px] outline-none';
const dateCls = 'flex-1 rounded-[10px] px-3 py-2.5 text-[14px] outline-none';
const timeCls = 'rounded-[10px] px-3 py-2.5 text-[14px] outline-none';
const inputStyle = { backgroundColor: 'var(--fill-tertiary)', color: 'var(--input-text)' };
const labelCls = 'text-[12px] text-label-secondary mb-1 mt-4';

const DRAFT_KEY = 'fanhive_post_draft';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function readDraft(): Record<string, any> | null {
  try { return JSON.parse(sessionStorage.getItem(DRAFT_KEY) || 'null'); } catch { return null; }
}

export default function PostNew() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const toast = useToast();

  const draft0 = useRef(readDraft()).current;
  const today = todayStr();
  const [type, setType] = useState<ItemType>(draft0?.type ?? 'goods');
  const [workId, setWorkId] = useState<string | null>(draft0?.workId ?? null);
  const [workName, setWorkName] = useState<string>(draft0?.workName ?? '');
  const [workQuery, setWorkQuery] = useState<string>(draft0?.workQuery ?? '');
  const [workResults, setWorkResults] = useState<Work[]>([]);
  const [title, setTitle] = useState<string>(draft0?.title ?? '');
  const [cats, setCats] = useState<Set<string>>(new Set(draft0?.cats ?? []));
  const [allDay, setAllDay] = useState<boolean>(draft0?.allDay ?? true);
  const [dateTBD, setDateTBD] = useState<boolean>(draft0?.dateTBD ?? false);
  const [date, setDate] = useState<string>(draft0?.date ?? today);
  const [endDate, setEndDate] = useState<string>(draft0?.endDate ?? today);
  const [time, setTime] = useState<string>(draft0?.time ?? '');
  const [endTime, setEndTime] = useState<string>(draft0?.endTime ?? '');
  const [isOrder, setIsOrder] = useState<boolean>(draft0?.isOrder ?? false);
  const [preAllDay, setPreAllDay] = useState<boolean>(draft0?.preAllDay ?? true);
  const [preStart, setPreStart] = useState<string>(draft0?.preStart ?? today);
  const [preEnd, setPreEnd] = useState<string>(draft0?.preEnd ?? today);
  const [preStartTime, setPreStartTime] = useState<string>(draft0?.preStartTime ?? '');
  const [preEndTime, setPreEndTime] = useState<string>(draft0?.preEndTime ?? '');
  const [price, setPrice] = useState<string>(draft0?.price ?? '');
  const [link, setLink] = useState<string>(draft0?.link ?? '');
  const [showExtra, setShowExtra] = useState<boolean>(draft0?.showExtra ?? false);
  const [stockNote, setStockNote] = useState<string>(draft0?.stockNote ?? '');
  const [memo, setMemo] = useState<string>(draft0?.memo ?? '');
  const [imageUrl, setImageUrl] = useState<string>(draft0?.imageUrl ?? '');
  const [prefecture, setPrefecture] = useState<string>(draft0?.prefecture ?? '');
  const [locationDetail, setLocationDetail] = useState<string>(draft0?.locationDetail ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  // AI入力
  const [aiText, setAiText] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');
  const [parsedList, setParsedList] = useState<ParsedEvent[] | null>(null);
  // ライブ重複検知
  const [dupMatches, setDupMatches] = useState<{ id: string; title: string }[]>([]);
  const [dupDismissed, setDupDismissed] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

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

  // 下書き保持（確認のため離れて戻っても内容を復元）。毎レンダーで保存。
  useEffect(() => {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify({
      type, workId, workName, workQuery, title, cats: [...cats], allDay, dateTBD, date, endDate, time, endTime,
      isOrder, preAllDay, preStart, preEnd, preStartTime, preEndTime, price, link, showExtra, stockNote, memo, imageUrl, prefecture, locationDetail,
    }));
  });
  const clearDraft = () => sessionStorage.removeItem(DRAFT_KEY);
  const onClose = () => { clearDraft(); navigate(-1); };

  // 共有シートから来た内容（?url / ?text）を受けて自動でAI解析
  useEffect(() => {
    const urlParam = searchParams.get('url') || '';
    const textParam = searchParams.get('text') || '';
    if (!urlParam && !textParam) return;
    const firstUrl = (s: string) => s.match(/https?:\/\/\S+/)?.[0] ?? '';
    const sharedUrl = urlParam.startsWith('http') ? urlParam
      : textParam.startsWith('http') ? textParam
      : firstUrl(textParam) || firstUrl(urlParam) || urlParam || textParam;
    const sharedText = (() => {
      if (!urlParam.startsWith('http')) return '';
      const s = textParam.replace(/https?:\/\/\S+/g, '').trim();
      return s.length > 5 ? s : '';
    })();
    if (sharedUrl) { setAiText(sharedUrl); runParse({ url: sharedUrl, sharedText: sharedText || undefined }); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 作品オートコンプリート（名寄せ簡易版: 既存検索＋新規作成）
  useEffect(() => {
    const q = workQuery.trim();
    if (!q || workId) { setWorkResults([]); return; }
    let alive = true;
    const t = setTimeout(() => { searchWorks(q).then((r) => alive && setWorkResults(r)).catch(() => {}); }, 250);
    return () => { alive = false; clearTimeout(t); };
  }, [workQuery, workId]);

  // ライブ重複検知（タイトル＋作品が分かれば。作品は未選択でも名前から既存を解決）
  useEffect(() => {
    if (!title.trim()) { setDupMatches([]); return; }
    let alive = true;
    const t = setTimeout(async () => {
      let wid = workId;
      if (!wid && workQuery.trim()) {
        const rs = await searchWorks(workQuery.trim()).catch(() => [] as Work[]);
        wid = rs.find((w) => w.name === workQuery.trim())?.id ?? null;
      }
      const seen = new Map<string, string>();
      if (wid) {
        const catStr = cats.size ? serializeCategories([...cats]) : null;
        const dup = await findDuplicateEvents(wid, title.trim(), null, catStr ?? null, {
          date: dateTBD ? null : (date || null), endDate: dateTBD ? null : (endDate || null),
          workName: workName || workQuery.trim() || null, prefecture: type === 'event' ? (prefecture || null) : null,
        }).catch(() => ({ byUrl: [], byTitle: [], byDateKeyword: [] }));
        for (const m of [...dup.byUrl, ...dup.byTitle, ...dup.byDateKeyword]) if (!seen.has(m.id)) seen.set(m.id, m.title);
      } else {
        // 作品未確定でもタイトルで全体検知（保守的・正規化完全一致）
        const g = await findDuplicatesByTitleGlobal(title.trim()).catch(() => []);
        for (const m of g) if (!seen.has(m.id)) seen.set(m.id, m.title);
      }
      if (!alive) return;
      setDupMatches([...seen].map(([id, t2]) => ({ id, title: t2 })));
      setDupDismissed(false);
    }, 500);
    return () => { alive = false; clearTimeout(t); };
  }, [workId, workQuery, title, date, endDate, dateTBD, prefecture, type]); // eslint-disable-line react-hooks/exhaustive-deps

  const catList = type === 'goods' ? GOODS_CATS : EVENT_CATS;
  const toggleCat = (c: string) => {
    haptic.select();
    setCats((prev) => { const n = new Set(prev); n.has(c) ? n.delete(c) : n.add(c); return n; });
  };

  // 解析結果をフォームに反映
  const applyParsed = (p: ParsedEvent) => {
    setType(deriveItemType({ category: p.category ?? undefined }));
    if (p.title) setTitle(p.title);
    if (p.work) {
      // 作品の名寄せ: 既存に完全一致があれば確定、無ければ入力欄に入れて確認/新規作成
      const name = p.work;
      setWorkId(null); setWorkName(''); setWorkQuery(name);
      searchWorks(name).then((rs) => {
        const exact = rs.find((w) => w.name === name);
        if (exact) { setWorkId(exact.id); setWorkName(exact.name); }
      }).catch(() => {});
    }
    if (p.price != null) setPrice(String(p.price));
    if (p.category) setCats(new Set(parseCategories(p.category)));
    if (p.date) { setDateTBD(false); setDate(p.date); setEndDate(p.endDate || p.date); }
    if (p.time) { setAllDay(false); setTime(p.time); if (p.endTime) setEndTime(p.endTime); }
    if (p.isOrderMade) { setIsOrder(true); if (p.preorderStart) setPreStart(p.preorderStart); if (p.preorderEnd) setPreEnd(p.preorderEnd); }
    if (p.link) setLink(p.link);
    if (p.prefecture) setPrefecture(p.prefecture);
    if (p.locationDetail) setLocationDetail(p.locationDetail);
    if (p.imageUrl) setImageUrl(p.imageUrl);
    if (p.memo) { setShowExtra(true); setMemo(p.memo); }
    setParsedList(null);
  };

  const runParse = async (body: { url?: string; imageBase64?: string; mimeType?: string; sharedText?: string }) => {
    setAiLoading(true); setAiError(''); setParsedList(null);
    try {
      const events = await parseEventsApi(body);
      if (events.length === 0) { setAiError('情報を読み取れませんでした'); }
      else if (events.length === 1) { applyParsed(events[0]); toast('AIが入力しました'); }
      else { setParsedList(events); }
    } catch (e) {
      setAiError(e instanceof Error && e.message === 'rate_limited' ? '混雑しています。少し待って再試行' : '解析に失敗しました');
    } finally {
      setAiLoading(false);
    }
  };

  const onAnalyzeText = () => { if (aiText.trim()) runParse({ url: aiText.trim() }); };
  const onPickPhoto = async (file: File | undefined) => {
    if (!file) return;
    const { data, mime } = await fileToBase64(file);
    runParse({ imageBase64: data, mimeType: mime });
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
        imageUrl: imageUrl || undefined,
        prefecture: type === 'event' ? (prefecture.trim() || undefined) : undefined,
        locationDetail: type === 'event' ? (locationDetail.trim() || undefined) : undefined,
      }], user.id);
      await upsertParticipation(wid, user.id).catch(() => {}); // 投稿で自動フォロー
      haptic.select();
      clearDraft();
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
          <button onClick={onClose} aria-label="閉じる" className="pressable tap-44 p-1"><X size={22} /></button>
          <span className="font-semibold">投稿</span>
          <button onClick={onSubmit} disabled={!canSave}
            className="pressable px-3 py-1.5 rounded-full text-[13px] font-semibold"
            style={canSave ? { backgroundColor: 'var(--accent-color)', color: 'var(--accent-on)' } : { backgroundColor: 'var(--fill-tertiary)', color: 'var(--label-tertiary)' }}>
            {saving ? '投稿中…' : '投稿'}
          </button>
        </div>

        <div className="px-4 pb-24">
          {/* AI入力（ヒーロー） */}
          <div className="mt-3 rounded-[12px] border border-subtle p-3" style={{ backgroundColor: 'var(--bg-secondary)' }}>
            <div className="flex items-center gap-1.5 mb-2">
              <Sparkles size={15} style={{ color: 'var(--accent-color)' }} />
              <span className="text-[13px] font-semibold">AIで入力</span>
            </div>
            {!parsedList ? (
              <>
                <div className="flex gap-2">
                  <div className="flex-1 relative">
                    <Link2 size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-label-tertiary pointer-events-none" />
                    <input value={aiText} onChange={(e) => setAiText(e.target.value)} placeholder="X や 商品ページのURL / テキストを貼り付け"
                      onKeyDown={(e) => e.key === 'Enter' && onAnalyzeText()}
                      className="w-full rounded-[10px] pl-8 pr-3 py-2.5 text-[13px] outline-none" style={inputStyle} />
                  </div>
                  <button onClick={onAnalyzeText} disabled={aiLoading || !aiText.trim()}
                    className="pressable px-3 rounded-[10px] text-[13px] font-semibold flex items-center"
                    style={{ backgroundColor: 'var(--accent-color)', color: 'var(--accent-on)' }}>
                    {aiLoading ? <Loader2 size={16} className="animate-spin" /> : '解析'}
                  </button>
                </div>
                <button onClick={() => fileRef.current?.click()} disabled={aiLoading} className="pressable mt-2 flex items-center gap-1.5 text-[13px]" style={{ color: 'var(--accent-text)' }}>
                  <Camera size={16} /> 写真から読み取る
                </button>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => onPickPhoto(e.target.files?.[0] || undefined)} />
                {aiError && <p className="text-[12px] mt-2" style={{ color: 'var(--color-destructive)' }}>{aiError}</p>}
              </>
            ) : (
              <div className="flex flex-col gap-1.5">
                <p className="text-[12px] text-label-secondary">{parsedList.length}件見つかりました。1つ選んで反映：</p>
                {parsedList.map((p, i) => (
                  <button key={i} onClick={() => { applyParsed(p); toast('AIが入力しました'); }} className="pressable text-left px-3 py-2 rounded-[10px] text-[13px]" style={{ backgroundColor: 'var(--bg-primary)' }}>
                    <div className="font-medium truncate">{p.title ?? '（タイトルなし）'}</div>
                    {(p.date || p.prefecture) && <div className="text-[11px] text-label-tertiary">{[p.date?.slice(5).replace('-', '/'), p.prefecture].filter(Boolean).join(' ')}</div>}
                  </button>
                ))}
                <button onClick={() => setParsedList(null)} className="text-[12px] text-label-tertiary mt-1 pressable">キャンセル</button>
              </div>
            )}
          </div>

          {/* 画像プレビュー（AIが自動取得・全枚数） */}
          {imageUrl && (
            <div className="mt-3 flex gap-2 overflow-x-auto no-scrollbar">
              {parseImageUrls(imageUrl).map((src, i) => (
                <div key={i} className="relative w-24 h-24 flex-shrink-0 rounded-[10px] overflow-hidden">
                  <img src={src} alt="" className="w-full h-full object-cover" />
                  <button
                    onClick={() => setImageUrl(serializeImageUrls(parseImageUrls(imageUrl).filter((_, j) => j !== i)) ?? '')}
                    aria-label="画像を削除" className="absolute top-1 right-1 rounded-full p-0.5" style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}>
                    <X size={14} color="#fff" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* 重複検知バナー（ライブ） */}
          {dupMatches.length > 0 && !dupDismissed && (
            <div className="mt-3 rounded-[12px] p-3" style={{ border: '1px solid var(--color-warning)', backgroundColor: 'var(--bg-secondary)' }}>
              <div className="text-[13px] font-semibold mb-1.5">似た投稿があります</div>
              {dupMatches.map((m) => (
                <div key={m.id} className="text-[13px] py-0.5">「{m.title}」</div>
              ))}
              <div className="flex gap-2 mt-2">
                <button onClick={() => navigate(`/item/${dupMatches[0].id}`)} className="pressable flex-1 py-2 rounded-[8px] text-[12px] font-semibold" style={{ backgroundColor: 'var(--accent-color)', color: 'var(--accent-on)' }}>投稿を確認</button>
                <button onClick={() => setDupDismissed(true)} className="pressable flex-1 py-2 rounded-[8px] text-[12px]" style={{ backgroundColor: 'var(--fill-tertiary)', color: 'var(--label-primary)' }}>違う予定として投稿</button>
              </div>
            </div>
          )}

          {/* 種別 */}
          <div className="flex gap-2 mt-4">
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

          {/* 会場・地域（イベント） */}
          {type === 'event' && (
            <>
              <div className={labelCls}>会場・地域（任意）</div>
              <div className="flex gap-2">
                <input value={prefecture} onChange={(e) => setPrefecture(e.target.value)} placeholder="都道府県" className={dateCls} style={inputStyle} />
                <input value={locationDetail} onChange={(e) => setLocationDetail(e.target.value)} placeholder="会場名" className="flex-[2] rounded-[10px] px-3 py-2.5 text-[14px] outline-none" style={inputStyle} />
              </div>
            </>
          )}

          {/* リンク */}
          <div className={labelCls}>リンク（購入・予約ページ）</div>
          <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://..." inputMode="url" className={inputCls} style={inputStyle} />
          {import.meta.env.DEV && linkInfo && (
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

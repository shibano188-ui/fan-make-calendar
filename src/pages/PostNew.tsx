import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { X, Plus, Check, Sparkles, Camera, Link2, Loader2, Search } from 'lucide-react';
import Chip from '../components/ui/Chip';
import { searchWorks, getOrCreateWork, createEvents, upsertParticipation, findDuplicateEvents, findDuplicatesByTitleGlobal, type Work } from '../lib/api';
import { serializeCategories, parseCategories, parseImageUrls, serializeImageUrls, GOODS_SUBCATEGORIES, GOODS_TAG } from '../lib/constants';
import { affiliatize, buildOffer, primaryOffer, isAffiliateUrl, offerUrl, isNoiseLink } from '../lib/affiliate';
import { parseEventsApi, fileToBase64, type ParsedEvent } from '../lib/parseEvents';
import { logAiExtraction, logSearch } from '../lib/dataLogs';
import { maybeAddWorkAlias } from '../lib/workAliases';
import { searchProductCandidates, titleMatchScore, retailerSearchUrls, highConfidenceCandidates, offerFromCandidate, variantMismatch, type ProductCandidate } from '../lib/searchProduct';
import type { Offer } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../components/ui/Toast';
import LineLoader from '../components/ui/LineLoader';
import WorkFollowSheet from '../components/WorkFollowSheet';
import { haptic } from '../lib/haptics';
import { todayStr, deriveItemType, type ItemType } from '../design/tokens';
import { SEASON_LABELS, DATE_LABEL_OPTIONS, ambiguousDate } from '../lib/ambiguousDate';

const GOODS_CATS = [...GOODS_SUBCATEGORIES, 'グルメ', '書籍'];
const EVENT_CATS = ['イベント', 'アニメ・映画', '誕生日', 'キャンペーン', GOODS_TAG];


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
// 販路をURL重複なしで追加
function addOffer(list: Offer[], o: Offer): Offer[] {
  return o.url && !list.some((x) => x.url === o.url) ? [...list, o] : list;
}

// 共有インテント（X等の共有シート / PWA share_target）で渡された内容を取り出す。
// X アプリは url=ツイートURL, text=本文 を送る場合と、url=空・text="本文 https://t.co/xxx" の場合がある。
function readShare(sp: URLSearchParams): { url: string; text: string } {
  const urlParam = sp.get('url') || '';
  const textParam = sp.get('text') || '';
  if (!urlParam && !textParam) return { url: '', text: '' };
  const firstUrl = (s: string) => s.match(/https?:\/\/\S+/)?.[0] ?? '';
  const url = urlParam.startsWith('http') ? urlParam
    : textParam.startsWith('http') ? textParam
    : firstUrl(textParam) || firstUrl(urlParam) || urlParam || textParam;
  const text = (() => {
    if (!urlParam.startsWith('http')) return '';
    const s = textParam.replace(/https?:\/\/\S+/g, '').trim();
    return s.length > 5 ? s : '';
  })();
  return { url, text };
}

export default function PostNew() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const toast = useToast();

  // 共有から来たときは「新しい予定」なので下書きを引き継がない（前の予定の入力が残るのを防ぐ）
  const share = readShare(searchParams);
  const draft0 = useRef(share.url ? null : readDraft()).current;
  const today = todayStr();
  const [type, setType] = useState<ItemType>(draft0?.type ?? 'goods');
  const [workId, setWorkId] = useState<string | null>(draft0?.workId ?? null);
  const [workName, setWorkName] = useState<string>(draft0?.workName ?? '');
  const [workQuery, setWorkQuery] = useState<string>(draft0?.workQuery ?? '');
  const [workResults, setWorkResults] = useState<Work[]>([]);
  const [workSheetOpen, setWorkSheetOpen] = useState(false);
  const [title, setTitle] = useState<string>(draft0?.title ?? '');
  const [cats, setCats] = useState<Set<string>>(new Set(draft0?.cats ?? []));
  const [allDay, setAllDay] = useState<boolean>(draft0?.allDay ?? true);
  const [dateTBD, setDateTBD] = useState<boolean>(draft0?.dateTBD ?? false);
  const [dateLabel, setDateLabel] = useState<string>(draft0?.dateLabel ?? ''); // 上旬/中旬/下旬/中/春頃…
  const [date, setDate] = useState<string>(draft0?.date ?? today);
  const [endDate, setEndDate] = useState<string>(draft0?.endDate ?? today);
  const [time, setTime] = useState<string>(draft0?.time ?? '');
  const [endTime, setEndTime] = useState<string>(draft0?.endTime ?? '');
  const [isOrder, setIsOrder] = useState<boolean>(draft0?.isOrder ?? false);
  const [preAllDay, setPreAllDay] = useState<boolean>(draft0?.preAllDay ?? true);
  const [preStart, setPreStart] = useState<string>(draft0?.preStart ?? today);
  const [preEnd, setPreEnd] = useState<string>(draft0?.preEnd ?? today);
  // 受付終了日を手動で触るまでは発売日に自動追従させる（下書き復元時は触った扱い）
  const [preEndTouched, setPreEndTouched] = useState<boolean>(!!draft0);
  const [preStartTime, setPreStartTime] = useState<string>(draft0?.preStartTime ?? '');
  const [preEndTime, setPreEndTime] = useState<string>(draft0?.preEndTime ?? '');
  const [price, setPrice] = useState<string>(draft0?.price ?? '');
  const [link, setLink] = useState<string>(draft0?.link ?? '');
  const [offers, setOffers] = useState<Offer[]>(draft0?.offers ?? []);
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
  // 販売先候補検索
  const [candidates, setCandidates] = useState<ProductCandidate[] | null>(null);
  const [searchingProduct, setSearchingProduct] = useState(false);
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
      type, workId, workName, workQuery, title, cats: [...cats], allDay, dateTBD, dateLabel, date, endDate, time, endTime,
      isOrder, preAllDay, preStart, preEnd, preStartTime, preEndTime, price, link, offers, showExtra, stockNote, memo, imageUrl, prefecture, locationDetail,
    }));
  });
  const clearDraft = () => sessionStorage.removeItem(DRAFT_KEY);
  // 共有インテント経由では /post が履歴の最初のページになり navigate(-1) が
  // no-op になる（投稿後も画面が残り「投稿中…」のまま見える）。戻り先が
  // 無ければホームへ置き換え遷移する。
  const goBack = () => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) navigate(-1);
    else navigate('/', { replace: true });
  };
  const onClose = () => { clearDraft(); goBack(); };

  // 受付終了日の既定値は発売日（日付未定なら空＝未定のまま）。手動で編集したら追従をやめる
  useEffect(() => {
    if (isOrder && !preEndTouched) setPreEnd(dateTBD ? '' : (date || ''));
  }, [isOrder, date, dateTBD, preEndTouched]);

  // 共有シートから来た内容（?url / ?text）を受けて自動でAI解析。
  // アプリを閉じずに再度Xから共有すると、同じ /post に search だけ変えて遷移するので
  // このコンポーネントは再マウントされない。共有内容が変わったらフォームを初期化してから解析する。
  const shareKey = `${share.url} | ${share.text}`;
  const handledShare = useRef<string | null>(null);
  useEffect(() => {
    if (!share.url || handledShare.current === shareKey) return;
    const isFirst = handledShare.current === null;
    handledShare.current = shareKey;
    if (!isFirst) resetForm(); // 2回目以降＝前の予定の入力が残っているので消す
    setAiText(share.url);
    runParse({ url: share.url, sharedText: share.text || undefined });
  }, [shareKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // 作品オートコンプリート（名寄せ簡易版: 既存検索＋新規作成）
  useEffect(() => {
    const q = workQuery.trim();
    if (!q || workId) { setWorkResults([]); return; }
    let alive = true;
    const t = setTimeout(() => {
      searchWorks(q).then((r) => {
        if (!alive) return;
        setWorkResults(r);
        // 検索クエリログ（データ資産化②の素材）
        logSearch('post_work', q, r.length, user?.id);
      }).catch(() => {});
    }, 250);
    return () => { alive = false; clearTimeout(t); };
  }, [workQuery, workId]); // eslint-disable-line react-hooks/exhaustive-deps

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
  // AI教師データログ用: 直近の解析入力と、フォームに反映したAI出力を保持し、
  // 投稿完了時に「入力×AI出力×最終保存値」をセットで記録する（データ資産化①）
  const aiSourceRef = useRef<{ sourceUrl?: string; sourceText?: string; sourceKind: 'url' | 'image' | 'shared_text' } | null>(null);
  const aiLogRef = useRef<{ sourceUrl?: string; sourceText?: string; sourceKind: 'url' | 'image' | 'shared_text'; output: ParsedEvent } | null>(null);

  // フォームを初期状態へ戻す（別の予定を続けて入力するとき、前の内容を持ち越さない）
  const resetForm = () => {
    setType('goods'); setWorkId(null); setWorkName(''); setWorkQuery(''); setWorkResults([]);
    setTitle(''); setCats(new Set()); setAllDay(true); setDateTBD(false); setDateLabel('');
    setDate(today); setEndDate(today); setTime(''); setEndTime('');
    setIsOrder(false); setPreAllDay(true); setPreStart(today); setPreEnd(today); setPreEndTouched(false);
    setPreStartTime(''); setPreEndTime('');
    setPrice(''); setLink(''); setOffers([]); setShowExtra(false); setStockNote(''); setMemo('');
    setImageUrl(''); setPrefecture(''); setLocationDetail('');
    setError(''); setAiError(''); setParsedList(null);
    setCandidates(null); setSearchingProduct(false);
    setDupMatches([]); setDupDismissed(false);
    aiSourceRef.current = null; aiLogRef.current = null;
    clearDraft();
  };

  // アフィリンクが取れていないグッズは、AI入力の画面でその場で販売先を探して添付する。
  // 高信頼（公式店/高一致度）なら自動で追加、確度が足りなければ候補を出して手動で選んでもらう。
  const autoFindOffers = async (t: string, w: string, current: Offer[]) => {
    if (!t.trim() || current.some((o) => isAffiliateUrl(offerUrl(o)))) return;
    setSearchingProduct(true); setCandidates(null);
    try {
      const items = await searchProductCandidates(`${w} ${t}`.trim());
      const picks = highConfidenceCandidates(t, items);
      if (picks.length) {
        const now = new Date().toISOString();
        setOffers((prev) => picks.reduce((acc, c) => addOffer(acc, offerFromCandidate(c, now)), prev));
        if (picks[0].price) setPrice((prev) => prev || String(picks[0].price));
        if (picks[0].image) setImageUrl((prev) => prev || picks[0].image);
        toast(`販売先を${picks.length}件見つけました`);
      } else if (items.length) {
        setCandidates(items);
      }
    } catch { /* 検索失敗は無視（「販売先を探す」で手動リトライできる） */ }
    finally { setSearchingProduct(false); }
  };

  const applyParsed = (p: ParsedEvent) => {
    if (aiSourceRef.current) aiLogRef.current = { ...aiSourceRef.current, output: p };
    const parsedType = deriveItemType({ category: p.category ?? undefined });
    setType(parsedType);
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
    // カテゴリ。イベントで物販あり（AI検出）なら「グッズあり」を付与（グッズ一覧にも出る）
    const sells = parsedType === 'event' && !!p.sellsGoods;
    if (p.category || sells) {
      const finalCats = new Set(p.category ? parseCategories(p.category) : []);
      if (sells) finalCats.add(GOODS_TAG);
      setCats(finalCats);
    }
    if (p.dateLabel) {
      // 曖昧日付（上旬・春頃・月のみ等）: ラベルを保持し、代表日も入れる
      setDateTBD(true); setDateLabel(p.dateLabel);
      if (p.date) { setDate(p.date); setEndDate(p.date); }
    } else if (p.date) {
      setDateTBD(false); setDateLabel(''); setDate(p.date); setEndDate(p.endDate || p.date);
    }
    if (p.time && !p.dateLabel) { setAllDay(false); setTime(p.time); if (p.endTime) setEndTime(p.endTime); }
    if (p.isOrderMade) { setIsOrder(true); if (p.preorderStart) setPreStart(p.preorderStart); if (p.preorderEnd) { setPreEnd(p.preorderEnd); setPreEndTouched(true); } }
    // まとめ記事・ニュース・SNSのURLは購入リンクではないので販路にしない（Xのまとめアカウント対策）
    const parsedOffers = p.link && !isNoiseLink(p.link) ? [buildOffer(p.link, p.price ?? undefined)] : [];
    if (parsedOffers.length) setOffers((prev) => parsedOffers.reduce(addOffer, prev));
    if (p.prefecture) setPrefecture(p.prefecture);
    if (p.locationDetail) setLocationDetail(p.locationDetail);
    if (p.imageUrl) setImageUrl(p.imageUrl);
    if (p.memo) { setShowExtra(true); setMemo(p.memo); }
    setParsedList(null);
    // グッズで収益リンクが取れていなければ、この場で販売先を探す（投稿時まで待たない）
    if (parsedType === 'goods' && p.title) {
      void autoFindOffers(p.title, p.work || workName || workQuery, parsedOffers);
    }
  };

  const runParse = async (body: { url?: string; imageBase64?: string; mimeType?: string; sharedText?: string }) => {
    // 解析入力を記録（画像はbase64が巨大なので本体は保存しない）
    aiSourceRef.current = body.imageBase64
      ? { sourceKind: 'image' }
      : body.sharedText
        ? { sourceKind: 'shared_text', sourceUrl: body.url, sourceText: body.sharedText }
        : /^https?:\/\//.test(body.url ?? '')
          ? { sourceKind: 'url', sourceUrl: body.url }
          : { sourceKind: 'url', sourceText: body.url };
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

  // 販売先候補を検索（リンク無し/価格不明の補完）
  const onSearchProduct = async () => {
    const kw = `${workName || workQuery} ${title}`.trim();
    if (!kw) return;
    haptic.select();
    setSearchingProduct(true); setCandidates(null);
    const items = await searchProductCandidates(kw);
    setSearchingProduct(false);
    setCandidates(items);
  };
  const pickCandidate = (c: ProductCandidate) => {
    haptic.select();
    setOffers((prev) => addOffer(prev, offerFromCandidate(c)));
    // タイトルはユーザー/AIが決めたものを正とする（ショップの商品名で上書きしない）
    if (!price && c.price) setPrice(String(c.price));
    if (!imageUrl && c.image) setImageUrl(c.image);
    setCandidates(null);
    toast('購入リンクを追加しました');
  };
  const addManualLink = () => {
    const u = link.trim();
    if (!u) return;
    haptic.select();
    setOffers((prev) => addOffer(prev, buildOffer(u, price ? Number(price) : undefined)));
    setLink('');
    toast('購入リンクを追加しました');
  };
  const removeOffer = (url: string) => setOffers((prev) => prev.filter((o) => o.url !== url));

  const linkInfo = link.trim() ? affiliatize(link.trim()) : null;
  const canSave = !!title.trim() && (!!workId || !!workQuery.trim()) && !saving;

  const onSubmit = async () => {
    if (!user || !canSave) return;
    setSaving(true); setError('');
    try {
      let wid = workId;
      if (!wid) { const w = await getOrCreateWork(workQuery.trim()); wid = w.id; }

      // グッズは投稿時に自動で販路を検索・添付（「販売先を探す」を押さなくても収益リンクが付く）。
      // 既にアフィ販路がある（手動で探した/AIが拾った）なら二重検索しない。高信頼(公式店/高一致度)のみ自動添付。
      let autoOffers = offers;
      let autoImage: string | undefined;
      if (type === 'goods' && title.trim() && !autoOffers.some((o) => isAffiliateUrl(offerUrl(o)))) {
        const kw = `${workName || workQuery} ${title}`.trim();
        try {
          const picks = highConfidenceCandidates(title.trim(), await searchProductCandidates(kw));
          const now = new Date().toISOString();
          for (const c of picks) autoOffers = addOffer(autoOffers, offerFromCandidate(c, now));
          if (!imageUrl && picks[0]?.image) autoImage = picks[0].image;
        } catch { /* 検索失敗時はそのまま通常保存 */ }
      }

      // 販路: 追加済み offers ＋ 入力欄に残ったURL。代表販路を旧フィールドにも要約保存（後方互換）
      const allOffers = link.trim() ? addOffer(autoOffers, buildOffer(link.trim(), price ? Number(price) : undefined)) : autoOffers;
      const prim = primaryOffer(allOffers);
      const eventPayload = {
        title: title.trim(),
        type,
        // 曖昧日付は代表日(並び替え用)＋dateLabel(表示用)を保存。具体日のときは dateLabel=null
        date: date || null,
        endDate: dateTBD ? undefined : (endDate || date || undefined),
        dateLabel: dateTBD ? (dateLabel || null) : null,
        time: allDay || dateTBD ? undefined : (time || undefined),
        endTime: allDay || dateTBD ? undefined : (endTime || undefined),
        category: cats.size ? serializeCategories([...cats]) : undefined,
        price: type === 'goods' ? (price ? Number(price) : (prim?.price ?? undefined)) : undefined,
        offers: allOffers,
        link: prim?.url,
        affiliateUrl: prim?.affiliateUrl,
        hasAffiliate: prim?.hasAffiliate,
        retailer: prim?.retailer,
        isOrderMade: isOrder,
        preorderStart: isOrder ? (preStart || undefined) : undefined,
        preorderEnd: isOrder ? (preEnd || undefined) : undefined,
        preorderStartTime: isOrder && !preAllDay ? (preStartTime || undefined) : undefined,
        preorderEndTime: isOrder && !preAllDay ? (preEndTime || undefined) : undefined,
        stockNote: stockNote.trim() || undefined,
        memo: memo.trim() || undefined,
        imageUrl: imageUrl || autoImage || undefined,
        prefecture: type === 'event' ? (prefecture.trim() || undefined) : undefined,
        locationDetail: type === 'event' ? (locationDetail.trim() || undefined) : undefined,
      };
      await createEvents(wid, [eventPayload], user.id);

      // AI入力を使った投稿なら教師データを記録（fire-and-forget）
      if (aiLogRef.current) {
        logAiExtraction({
          userId: user.id,
          sourceUrl: aiLogRef.current.sourceUrl,
          sourceText: aiLogRef.current.sourceText,
          sourceKind: aiLogRef.current.sourceKind,
          aiOutput: aiLogRef.current.output,
          finalSaved: { ...eventPayload, work: workName || workQuery.trim() },
        });
        aiLogRef.current = null;
      }

      await upsertParticipation(wid, user.id).catch(() => {}); // 投稿で自動フォロー
      haptic.select();
      clearDraft();
      toast('投稿しました');
      setSaving(false);
      goBack();
    } catch (e) {
      const timedOut = e instanceof DOMException && e.name === 'AbortError';
      setError(timedOut
        ? '通信が不安定です。投稿されている場合があるので、ホームで確認してから再度お試しください。'
        : '投稿に失敗しました。時間をおいて再度お試しください。');
      setSaving(false);
    }
  };

  return (
    <div ref={rootRef} className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <div className="mx-auto w-full max-w-app">
        {/* ヘッダー */}
        <div className="sticky top-0 z-20 flex items-center justify-between px-3 py-2.5 material-bar scroll-edge" style={{ paddingTop: 'calc(var(--sat) + 10px)' }}>
          {/* 入力中(キーボード表示中)は最初のタップがblurに食われて閉じないため pointerDown で確実に閉じる */}
          <button onPointerDown={(e) => { e.preventDefault(); onClose(); }} aria-label="閉じる" className="pressable tap-44 p-1"><X size={22} /></button>
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
                    解析
                  </button>
                </div>
                {aiLoading && <div className="mt-3 py-1"><LineLoader label="AIが読み取っています…" /></div>}
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
          <div className="flex items-end justify-between">
            <div className={labelCls}>作品 <span style={{ color: 'var(--color-destructive)' }}>*</span></div>
            <button onClick={() => { haptic.select(); setWorkSheetOpen(true); }}
              className="pressable flex items-center gap-0.5 text-[12px] font-medium mb-1" style={{ color: 'var(--accent-text)' }}>
              <Search size={13} /> フォロー中から選ぶ
            </button>
          </div>
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
                    <button key={w.id} onClick={() => { haptic.select(); if (workQuery.trim() && w.name !== workQuery.trim()) { logSearch('post_work', workQuery, workResults.length, user?.id, w.name); maybeAddWorkAlias(w, workQuery); } setWorkId(w.id); setWorkName(w.name); setWorkResults([]); }}
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
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={dateCls} style={inputStyle} />
                {!allDay && <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={timeCls} style={inputStyle} />}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[13px] text-label-secondary">〜</span>
                <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={dateCls} style={inputStyle} />
                {!allDay && <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className={timeCls} style={inputStyle} />}
              </div>
            </div>
          ) : (
            /* 曖昧日付UI（年 / 月 / 区分）。上旬・中旬・下旬・月のみ・春頃… */
            <div className="flex flex-col gap-2">
              <div className="flex gap-2">
                <select value={date ? date.slice(0, 4) : String(new Date().getFullYear())}
                  onChange={(e) => setDate(ambiguousDate(e.target.value, date.slice(5, 7) || '01', dateLabel))}
                  className={dateCls} style={inputStyle}>
                  {[0, 1, 2].map((o) => { const y = new Date().getFullYear() + o; return <option key={y} value={y}>{y}年</option>; })}
                </select>
                {!SEASON_LABELS.includes(dateLabel) && (
                  <select value={date ? date.slice(5, 7) : '01'}
                    onChange={(e) => setDate(ambiguousDate(date.slice(0, 4) || String(new Date().getFullYear()), e.target.value, dateLabel))}
                    className={dateCls} style={inputStyle}>
                    {Array.from({ length: 12 }, (_, i) => { const m = String(i + 1).padStart(2, '0'); return <option key={m} value={m}>{i + 1}月</option>; })}
                  </select>
                )}
              </div>
              <select value={dateLabel}
                onChange={(e) => {
                  const val = e.target.value;
                  const year = date ? date.slice(0, 4) : String(new Date().getFullYear());
                  const month = date ? date.slice(5, 7) : String(new Date().getMonth() + 1).padStart(2, '0');
                  setDateLabel(val); setDate(ambiguousDate(year, month, val));
                }}
                className={inputCls} style={inputStyle}>
                {DATE_LABEL_OPTIONS.map(([label, val]) => <option key={val} value={val}>{label}</option>)}
              </select>
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
                  <input type="date" value={preEnd} onChange={(e) => { setPreEnd(e.target.value); setPreEndTouched(true); }} className={dateCls} style={inputStyle} />
                  {!preAllDay && <input type="time" value={preEndTime} onChange={(e) => setPreEndTime(e.target.value)} className={timeCls} style={inputStyle} />}
                </div>
              </div>
            </div>
          )}

          {/* 会場・地域（イベント） */}
          {type === 'event' && (
            <>
              <div className={labelCls}>会場・地域（任意）</div>
              <div className="flex flex-col gap-2">
                <input value={prefecture} onChange={(e) => setPrefecture(e.target.value)} placeholder="都道府県" className={inputCls} style={inputStyle} />
                <input value={locationDetail} onChange={(e) => setLocationDetail(e.target.value)} placeholder="会場名" className={inputCls} style={inputStyle} />
              </div>
            </>
          )}


          {/* 購入リンク（複数可。発売に向けて随時追加できる） */}
          <div className={labelCls}>購入リンク</div>
          <div className="flex gap-2">
            <input value={link} onChange={(e) => setLink(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addManualLink()}
              placeholder="購入・予約ページのURL" inputMode="url" className={inputCls} style={inputStyle} />
            <button onClick={addManualLink} disabled={!link.trim()}
              className="pressable px-3 rounded-[10px] text-[13px] font-semibold flex-shrink-0" style={{ backgroundColor: 'var(--fill-tertiary)', color: 'var(--label-primary)' }}>追加</button>
          </div>

          {/* 追加済みの販路 */}
          {offers.length > 0 && (
            <div className="mt-2 flex flex-col gap-1.5">
              {offers.map((o) => (
                <div key={o.url} className="flex items-center gap-2 rounded-[10px] px-3 py-2" style={{ backgroundColor: 'var(--fill-tertiary)' }}>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] truncate">{o.retailer || o.url}{o.shop ? `（${o.shop}）` : ''}</div>
                    <div className="text-[11px] text-label-tertiary">
                      {o.price ? `¥${o.price.toLocaleString()}` : ''}{import.meta.env.DEV && o.hasAffiliate ? ' ・アフィ対応' : ''}
                    </div>
                  </div>
                  <button onClick={() => removeOffer(o.url)} aria-label="削除" className="pressable tap-44 text-label-secondary"><X size={16} /></button>
                </div>
              ))}
            </div>
          )}

          {/* 販売先を探す（候補→販路に追加・価格/画像も補完） */}
          <button onClick={onSearchProduct} disabled={searchingProduct || !title.trim()}
            className="pressable mt-2 flex items-center gap-1.5 text-[13px]" style={{ color: 'var(--accent-text)' }}>
            {searchingProduct ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />} 販売先を探す
          </button>
          {title.trim() && (
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]">
              <span className="text-label-tertiary">各店で探す:</span>
              {retailerSearchUrls(`${workName || workQuery} ${title}`.trim()).map((r) => (
                <a key={r.retailer} href={r.url} target="_blank" rel="noopener" onClick={() => haptic.select()} className="pressable" style={{ color: 'var(--accent-text)' }}>{r.retailer} ↗</a>
              ))}
            </div>
          )}
          {candidates && (
            candidates.length === 0 ? (
              <p className="text-[12px] text-label-tertiary mt-1">候補が見つかりませんでした</p>
            ) : (
              <div className="mt-2 flex flex-col gap-1.5 rounded-[10px] border border-subtle p-2" style={{ backgroundColor: 'var(--bg-secondary)' }}>
                <p className="text-[11px] text-label-tertiary">タイトルに一致する候補だけ選べます</p>
                {candidates.map((c, i) => {
                  const ok = titleMatchScore(`${workName || workQuery} ${title}`, c.title) >= 0.5;
                  // 種類違い（vol/弾/①②）と売切れは、自動添付では弾いている。手動では選べるが理由を出す
                  const variantNg = variantMismatch(title, c.title);
                  const soldOut = c.inStock === false;
                  return (
                    <button key={i} disabled={!ok} onClick={() => pickCandidate(c)}
                      className={`flex items-center gap-2 text-left p-1 rounded-[8px] ${ok ? 'pressable' : 'opacity-40 cursor-not-allowed'}`}>
                      <div className="w-12 h-12 flex-shrink-0 rounded-[6px] overflow-hidden bg-fill-3">
                        {c.image && <img src={c.image} alt="" className="w-full h-full object-cover" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[12px] line-clamp-2 leading-snug">{c.title}</div>
                        <div className="text-[12px] font-bold" style={{ color: 'var(--accent-text)' }}>
                          ¥{c.price?.toLocaleString()} <span className="font-normal text-label-tertiary">{c.retailer}{c.shop ? `（${c.shop}）` : ''}</span>
                          {c.official && <span className="font-normal" style={{ color: 'var(--color-success)' }}>・公式店</span>}
                          {!ok && <span className="font-normal text-label-tertiary">・タイトル不一致</span>}
                          {variantNg && <span className="font-normal" style={{ color: 'var(--color-warning)' }}>・種類違い</span>}
                          {soldOut && <span className="font-normal" style={{ color: 'var(--color-destructive)' }}>・売切れ</span>}
                          {!soldOut && c.stockLabel && <span className="font-normal text-label-tertiary">・{c.stockLabel}</span>}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )
          )}
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

      <WorkFollowSheet open={workSheetOpen} onClose={() => setWorkSheetOpen(false)}
        onPick={(w) => { setWorkId(w.id); setWorkName(w.name); setWorkQuery(''); setWorkResults([]); }} />
    </div>
  );
}

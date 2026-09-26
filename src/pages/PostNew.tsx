import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { X, Plus, Check, Sparkles, Link2, Loader2, Search, Share2, CalendarPlus, Trash2, ChevronLeft } from 'lucide-react';
import Chip from '../components/ui/Chip';
import { resolveWorkName, sameWorkName } from '../lib/workName';
import { searchWorks, getOrCreateWork, createEvents, toggleLike, upsertParticipation, findDuplicateEvents, findDuplicatesByTitleGlobal, distinguishSameNameByPlace, isOtherPlaceMatch, countUserPostedEvents, listAllParticipatedWorks, type Work } from '../lib/api';
import { serializeCategories, parseCategories, parseImageUrls, serializeImageUrls, GOODS_SUBCATEGORIES, GOODS_TAG, ONBOARDING_DEMO_KEY, FEATURE_PREMIUM, oneShotTip } from '../lib/constants';
import { DEMO_POST_TEXT } from '../lib/demoPost';
import { isPremiumCached, canFollowMore, FREE_FOLLOW_LIMIT } from '../lib/premium';
import { trialEligible } from '../lib/billing';
import { affiliatize, buildOffer, primaryOffer, isAffiliateUrl, offerUrl, isNoiseLink } from '../lib/affiliate';
import { parseEventsApiWithMeta, type ParsedEvent, type ListMeta } from '../lib/parseEvents';
import { logAiExtraction, logSearch } from '../lib/dataLogs';
import { maybeAddWorkAlias } from '../lib/workAliases';
import { searchProductCandidates, searchProductCandidatesWithMeta, titleMatchScore, retailerSearchUrls, highConfidenceCandidates, labelVariants, offerFromCandidate, buildPinnedOffer, variantMismatch, searchKeyword, type ProductCandidate } from '../lib/searchProduct';
import { openExternal } from '../lib/openExternal';
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
// 解析済みの共有内容。別の予定を確認しに行って戻ると画面が作り直され、同じ共有をまた解析していた
// （入力し直した内容も上書きされる）。下書きと同じく sessionStorage に持つ。
const SHARE_HANDLED_KEY = 'fanhive_post_share_handled';
// 一覧から「使わない」で消した候補の購入リンク。同じ一覧をまた解析しても出さない（端末ごと）
const DISMISSED_KEY = 'fanhive_post_dismissed_offers';
function loadDismissed(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(DISMISSED_KEY) || '[]') as string[]); } catch { return new Set(); }
}
/** 購入リンクが全部「使わない」にしたものなら、その候補は出さない（一覧ページの候補だけ。Xのポストの候補は対象外） */
function withoutDismissed(list: ParsedEvent[]): ParsedEvent[] {
  const d = loadDismissed();
  if (!d.size) return list;
  return list.filter((p) => !(p.offers?.length && p.offers.every((o) => d.has(o.url))));
}
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
  const location = useLocation();
  // 投稿したものをカレンダーに登録するか。前は自分の投稿が必ず入っていた（外せなかった）。
  // 選んだものは覚えておく（毎回外すのは手間なので）
  const [addToCalendar, setAddToCalendar] = useState(() => {
    try { return localStorage.getItem('fan_post_add_calendar') !== '0'; } catch { return true; }
  });
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const toast = useToast();

  // 共有から来たときは「新しい予定」なので下書きを引き継がない（前の予定の入力が残るのを防ぐ）
  const share = readShare(searchParams);
  const draft0 = useRef(share.url ? null : readDraft()).current;
  const today = todayStr();
  // カレンダーの「この日に追加」から来たときは、その日付を入れて開く（下書きの日付より優先）
  const dateParam = searchParams.get('date');
  const presetDate = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : null;
  const [type, setType] = useState<ItemType>(draft0?.type ?? 'goods');
  const [workId, setWorkId] = useState<string | null>(draft0?.workId ?? null);
  const [workName, setWorkName] = useState<string>(draft0?.workName ?? '');
  const [workQuery, setWorkQuery] = useState<string>(draft0?.workQuery ?? '');
  const [workResults, setWorkResults] = useState<Work[]>([]);
  // 表記ゆれ辞書からの候補。「ぼざろ」「ドラクエ」は既存作品名の部分一致では出てこない
  const [masterNames, setMasterNames] = useState<string[]>([]);
  const [workSheetOpen, setWorkSheetOpen] = useState(false);
  const [title, setTitle] = useState<string>(draft0?.title ?? '');
  const [cats, setCats] = useState<Set<string>>(new Set(draft0?.cats ?? []));
  const [allDay, setAllDay] = useState<boolean>(draft0?.allDay ?? true);
  const [dateTBD, setDateTBD] = useState<boolean>(presetDate ? false : (draft0?.dateTBD ?? false));
  const [dateLabel, setDateLabel] = useState<string>(presetDate ? '' : (draft0?.dateLabel ?? '')); // 上旬/中旬/下旬/中/春頃…
  const [date, setDate] = useState<string>(presetDate ?? draft0?.date ?? today);
  const [endDate, setEndDate] = useState<string>(presetDate ?? draft0?.endDate ?? today);
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
  const [parsedList, setParsedList] = useState<ParsedEvent[] | null>(draft0?.parsedList ?? null);
  // 解析で複数見つかったとき、選んで反映したもの以外の残り。1件投稿したらこの一覧に戻って続けて投稿する
  // （前は1つ選ぶと残りが消え、全部登録するには解析からやり直しだった）
  const [pendingParsed, setPendingParsed] = useState<ParsedEvent[]>(draft0?.pendingParsed ?? []);
  // 一覧から選んでフォームに入れた候補と、一覧での位置。閉じる・戻るで一覧のその位置に戻す
  // （前は閉じると解析結果ごと消え、解析し直すしかなかった）
  const [fromList, setFromList] = useState<{ p: ParsedEvent; index: number } | null>(draft0?.fromList ?? null);
  // 一覧ページ（公式通販・アニメイト・ムービック）を解析したときの補足。登録済みで外した数と、続きのページ
  const [listMeta, setListMeta] = useState<(ListMeta & { url: string }) | null>(draft0?.listMeta ?? null);
  const [loadingMore, setLoadingMore] = useState(false);
  // 公式通販のシリーズの一覧で「まとめる」ために選んだ行
  const [mergePick, setMergePick] = useState<Set<number>>(new Set());
  // いまフォームに入っている解析結果（リンクを外したとき、その商品を1件の予定として一覧に戻すのに使う）
  const appliedRef = useRef<ParsedEvent | null>(null);
  // ライブ重複検知
  const [dupMatches, setDupMatches] = useState<{ id: string; title: string }[]>([]);
  const [dupDismissed, setDupDismissed] = useState(false);
  // 同じ名前で都道府県が違う既存予定（巡回POP UPの別会場など）。重複ではないので警告にせず、
  // 投稿時にタイトルへ都道府県を付けて区別することを知らせるだけ。
  const [otherPlaces, setOtherPlaces] = useState<string[]>([]);
  // 販売先候補検索
  const [candidates, setCandidates] = useState<ProductCandidate[] | null>(null);
  const [searchingProduct, setSearchingProduct] = useState(false);
  // 候補は複数選んでまとめて追加できる（種類違いを全部付けたいとき）
  const [picked, setPicked] = useState<Set<number>>(new Set());
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

  // 下書き保持（確認のため離れて戻っても内容を復元）。毎レンダーで保存。
  useEffect(() => {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify({
      type, workId, workName, workQuery, title, cats: [...cats], allDay, dateTBD, dateLabel, date, endDate, time, endTime,
      isOrder, preAllDay, preStart, preEnd, preStartTime, preEndTime, price, link, offers, showExtra, stockNote, memo, imageUrl, prefecture, locationDetail,
      parsedList, pendingParsed, listMeta, fromList,
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
  // 閉じた・投稿した後に同じポストをまた共有したら、もう一度解析する
  const forgetShare = () => { try { sessionStorage.removeItem(SHARE_HANDLED_KEY); } catch { /* ignore */ } };
  // 一覧から候補を選んだ状態で閉じたら、画面を閉じずに一覧へ戻る（下の「戻る」と同じ）
  const onClose = () => {
    if (fromList) { navigate(-1); return; }
    clearDraft(); forgetShare(); goBack();
  };

  // 受付終了日の既定値は発売日（日付未定なら空＝未定のまま）。手動で編集したら追従をやめる
  useEffect(() => {
    if (isOrder && !preEndTouched) setPreEnd(dateTBD ? '' : (date || ''));
  }, [isOrder, date, dateTBD, preEndTouched]);

  // 共有シートから来た内容（?url / ?text）を受けて自動でAI解析。
  // アプリを閉じずに再度Xから共有すると、同じ /post に search だけ変えて遷移するので
  // このコンポーネントは再マウントされない。共有内容が変わったらフォームを初期化してから解析する。
  const shareKey = `${share.url} | ${share.text}`;
  const handledShare = useRef<string | null>((() => { try { return sessionStorage.getItem(SHARE_HANDLED_KEY); } catch { return null; } })());
  useEffect(() => {
    if (!share.url || handledShare.current === shareKey) return;
    const isFirst = handledShare.current === null;
    handledShare.current = shareKey;
    try { sessionStorage.setItem(SHARE_HANDLED_KEY, shareKey); } catch { /* 覚えられなくても動く */ }
    if (!isFirst) resetForm(); // 2回目以降＝前の予定の入力が残っているので消す
    setAiText(share.url);
    runParse({ url: share.url, sharedText: share.text || undefined });
  }, [shareKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // 初回オンボーディングのAI体験（?demo=1）。例のポストを**本番と同じ経路で**解析する。
  // モックにしないのは、画像・購入リンク・価格が自動で埋まるところまで見せたいため。
  // 保存だけはしない（架空の投稿を「探す」に流さない）。判定は onSubmit 側。
  const demo = searchParams.get('demo') === '1';
  const demoStarted = useRef(false);
  useEffect(() => {
    if (!demo || demoStarted.current) return;
    demoStarted.current = true;
    runParse({ url: DEMO_POST_TEXT });
  }, [demo]); // eslint-disable-line react-hooks/exhaustive-deps

  // 作品オートコンプリート（名寄せ簡易版: 既存検索＋新規作成）
  useEffect(() => {
    const q = workQuery.trim();
    if (!q || workId) { setWorkResults([]); setMasterNames([]); return; }
    let alive = true;
    const t = setTimeout(() => {
      searchWorks(q).then((r) => {
        if (!alive) return;
        setWorkResults(r);
        // 検索クエリログ（データ資産化②の素材）
        logSearch('post_work', q, r.length, user?.id);
      }).catch(() => {});
      resolveWorkName(q).then((res) => {
        if (!alive) return;
        const names = res.canonical ? [res.canonical] : res.candidates.map((c) => c.name).slice(0, 4);
        setMasterNames(names.filter((n) => n !== q));
      }).catch(() => setMasterNames([]));
    }, 250);
    return () => { alive = false; clearTimeout(t); };
  }, [workQuery, workId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ライブ重複検知（タイトル＋作品が分かれば。作品は未選択でも名前から既存を解決）
  useEffect(() => {
    if (!title.trim()) { setDupMatches([]); setOtherPlaces([]); return; }
    let alive = true;
    const t = setTimeout(async () => {
      let wid = workId;
      if (!wid && workQuery.trim()) {
        const rs = await searchWorks(workQuery.trim()).catch(() => [] as Work[]);
        wid = rs.find((w) => w.name === workQuery.trim())?.id ?? null;
      }
      const seen = new Map<string, string>();
      const places = new Set<string>();
      if (wid) {
        const catStr = cats.size ? serializeCategories([...cats]) : null;
        const dup = await findDuplicateEvents(wid, title.trim(), null, catStr ?? null, {
          date: dateTBD ? null : (date || null), endDate: dateTBD ? null : (endDate || null),
          workName: workName || workQuery.trim() || null, prefecture: type === 'event' ? (prefecture || null) : null,
        }).catch(() => ({ byUrl: [], byTitle: [], byDateKeyword: [] }));
        const pref = type === 'event' ? prefecture : null;
        for (const m of dup.byTitle) if (isOtherPlaceMatch(m, pref)) places.add(m.prefecture!);
        for (const m of [...dup.byUrl, ...dup.byTitle.filter((m) => !isOtherPlaceMatch(m, pref)), ...dup.byDateKeyword]) if (!seen.has(m.id)) seen.set(m.id, m.title);
      } else {
        // 作品未確定でもタイトルで全体検知（保守的・正規化完全一致）
        const g = await findDuplicatesByTitleGlobal(title.trim()).catch(() => []);
        for (const m of g) if (!seen.has(m.id)) seen.set(m.id, m.title);
      }
      if (!alive) return;
      setDupMatches([...seen].map(([id, t2]) => ({ id, title: t2 })));
      setOtherPlaces([...places]);
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
    setError(''); setAiError(''); setParsedList(null); setPendingParsed([]); setMergePick(new Set()); setListMeta(null); setFromList(null);
    appliedRef.current = null;
    setCandidates(null); setSearchingProduct(false); setPicked(new Set());
    setDupMatches([]); setDupDismissed(false);
    aiSourceRef.current = null; aiLogRef.current = null;
    clearDraft();
  };

  // アフィリンクが取れていないグッズは、AI入力の画面でその場で販売先を探して添付する。
  // 高信頼（公式店/高一致度）なら自動で追加、確度が足りなければ候補を出して手動で選んでもらう。
  // 販売先を検索済みのタイトル。投稿時に同じ検索をもう一度しない（楽天は1秒1回の制限で間隔を空けて
  // 5回叩くので、それだけで投稿が3〜4秒待たされていた）
  const searchedTitles = useRef(new Set<string>());
  const autoFindOffers = async (t: string, w: string, current: Offer[]) => {
    if (!t.trim() || current.some((o) => isAffiliateUrl(offerUrl(o)))) return;
    searchedTitles.current.add(t.trim());
    setSearchingProduct(true); setCandidates(null);
    try {
      const kw = searchKeyword(w, t);
      const { items, animateTotal } = await searchProductCandidatesWithMeta(kw);
      const picks = highConfidenceCandidates(t, items, w);
      if (picks.length) {
        const now = new Date().toISOString();
        let next = picks.map((c) => offerFromCandidate(c, now));
        // 種類違いが多い（アニメイトの総件数が付けた数より多い）ときは、取りこぼしても辿れるように
        // アニメイトの検索結果も購入リンクとして付ける（本人要望・2026-09-26）
        const fromAnimate = picks.filter((c) => c.retailer === 'アニメイト').length;
        const missing = animateTotal != null && animateTotal > fromAnimate && picks.some((c) => c.label);
        if (missing) next = [...next, searchOffer('アニメイト', kw)];
        setOffers((prev) => next.reduce(addOffer, prev));
        if (picks[0].price) setPrice((prev) => prev || String(picks[0].price));
        if (picks[0].image) setImageUrl((prev) => prev || picks[0].image);
        const kinds = new Set(picks.map((c) => c.label).filter(Boolean)).size;
        toast(kinds >= 2 ? `${kinds}種類のリンクを付けました` : `販売先を${picks.length}件見つけました`);
        if (missing) toast(`アニメイトでは${animateTotal}件見つかっています（付けたのは${fromAnimate}件）。検索結果のリンクも付けました`);
      } else if (items.length) {
        setCandidates(items);
      }
    } catch { /* 検索失敗は無視（「販売先を探す」で手動リトライできる） */ }
    finally { setSearchingProduct(false); }
  };

  // グッズのタイトルを入れ終えたら販売先を探す（AI入力を使わない投稿でも候補が見えるように）。
  // 確実なものだけ自動で付き、怪しいものは候補に並ぶだけ＝選ばないと付かない。同じタイトルでは探し直さない。
  const lastSearchedTitle = useRef('');
  const onTitleBlur = () => {
    const t = title.trim();
    if (type !== 'goods' || !t || demo || t === lastSearchedTitle.current) return;
    lastSearchedTitle.current = t;
    void autoFindOffers(t, workName || workQuery, offers);
  };

  /** 正式表記の候補を選んだとき。既に同名の作品があればそれに確定し、無ければ入力欄を正式表記にする */
  const pickWorkName = (name: string) => {
    haptic.select();
    setWorkQuery(name); setWorkName(name); setWorkId(null);
    setWorkResults([]); setMasterNames([]);
    searchWorks(name).then((rs) => {
      const exact = rs.find((w) => w.name === name);
      if (exact) { setWorkId(exact.id); setWorkName(exact.name); }
    }).catch(() => {});
  };

  const applyParsed = (p: ParsedEvent) => {
    appliedRef.current = p;
    if (aiSourceRef.current) aiLogRef.current = { ...aiSourceRef.current, output: p };
    const parsedType = deriveItemType({ category: p.category ?? undefined });
    setType(parsedType);
    if (p.title) setTitle(p.title);
    if (p.work) {
      // 作品の名寄せ: まず表記ゆれ辞書で正式表記に直し、既存に完全一致があれば確定。
      // AIは「略称は正式名称に直す」と指示していても表記が揺れるので、ここで揃える
      const name = p.work;
      setWorkId(null); setWorkName(''); setWorkQuery(name);
      resolveWorkName(name)
        .then((res) => res.canonical ?? name)
        .catch(() => name)
        .then((canonical) => {
          if (canonical !== name) setWorkQuery(canonical);
          return searchWorks(canonical).then((rs) => {
            const exact = rs.find((w) => w.name === canonical);
            if (exact) { setWorkId(exact.id); setWorkName(exact.name); }
          });
        })
        .catch(() => {});
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
    const parsedOffers = p.offers?.length
      // Shopifyのシリーズ: 中の商品のリンクがそろっている（名前・値段・在庫つき）
      ? p.offers.map((o) => ({ ...buildOffer(o.url), ...o, fetchedAt: new Date().toISOString() }))
      : p.link && !isNoiseLink(p.link) ? [buildOffer(p.link, p.price ?? undefined)] : [];
    if (parsedOffers.length) setOffers((prev) => parsedOffers.reduce(addOffer, prev));
    if (p.prefecture) setPrefecture(p.prefecture);
    if (p.locationDetail) setLocationDetail(p.locationDetail);
    if (p.imageUrl) setImageUrl(p.imageUrl);
    if (p.memo) { setShowExtra(true); setMemo(p.memo); }
    setParsedList(null); setMergePick(new Set());
    // グッズで収益リンクが取れていなければ、この場で販売先を探す（投稿時まで待たない）
    if (parsedType === 'goods' && p.title && !p.offers?.length) {
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
    setAiLoading(true); setAiError(''); setParsedList(null); setPendingParsed([]); setListMeta(null);
    try {
      const { events, list } = await parseEventsApiWithMeta(body);
      if (list && body.url) {
        // 一覧ページ: 1件でも一覧で出す（「登録済みを除いた数」や「次のページ」を見せるため）。
        // 全部登録済みなら空の一覧に「すべて登録済み」を出す
        setListMeta({ ...list, url: body.url });
        setParsedList(withoutDismissed(events));
      } else if (events.length === 0) { setAiError('情報を読み取れませんでした'); }
      else if (events.length === 1) { applyParsed(events[0]); toast('AIが入力しました'); }
      else { setParsedList(events); }
    } catch (e) {
      const code = e instanceof Error ? e.message : '';
      setAiError(
        code === 'rate_limited' ? '混雑しています。少し待って再試行'
        : code === 'unsupported_url' ? '読み取れるのはXのポストと、公式通販の商品一覧ページ（ちいかわマーケットなど）です。販売先のURLは下の「購入・予約ページのURL」へ、告知は本文を貼り付けてください'
        : '解析に失敗しました',
      );
    } finally {
      setAiLoading(false);
    }
  };

  const onAnalyzeText = () => { if (aiText.trim()) runParse({ url: aiText.trim() }); };

  // 一覧から候補を選んでフォームに入れる。履歴を1つ積むので、スマホの「戻る」でも一覧に戻れる
  // （同じURLに印（listPick）を付けて積むだけなので、画面は作り直されない）
  const pickFromList = (i: number) => {
    if (!parsedList) return;
    const p = parsedList[i];
    setPendingParsed(parsedList.filter((_, j) => j !== i));
    setFromList({ p, index: i });
    applyParsed(p);
    navigate(`${location.pathname}${location.search}`, { state: { ...(location.state as object | null), listPick: true } });
    toast('AIが入力しました');
  };
  // 一覧に戻す（選んだ候補は元の位置へ。フォームに入れた内容は捨てる）
  const backToList = () => {
    if (!fromList) return;
    const list = [...pendingParsed];
    list.splice(Math.min(fromList.index, list.length), 0, fromList.p);
    const meta = listMeta;
    resetForm();
    setParsedList(list);
    setListMeta(meta);
    setFromList(null);
    window.scrollTo(0, 0);
  };
  // 「戻る」（閉じる・スマホの戻る）で印の無い履歴に戻ったら一覧を出す
  useEffect(() => {
    if (fromList && !(location.state as { listPick?: boolean } | null)?.listPick) backToList();
  }, [location.key]); // eslint-disable-line react-hooks/exhaustive-deps
  // 要らない候補を一覧から消す。同じ一覧をまた解析しても出さないよう、購入リンクを覚えておく
  const dismissFromList = (i: number) => {
    if (!parsedList) return;
    haptic.select();
    const p = parsedList[i];
    if (p.offers?.length) {
      const d = loadDismissed();
      for (const o of p.offers) d.add(o.url);
      try { localStorage.setItem(DISMISSED_KEY, JSON.stringify([...d].slice(-2000))); } catch { /* 覚えられなくても今は消える */ }
    }
    setParsedList(parsedList.filter((_, j) => j !== i));
    setMergePick(new Set());
  };

  // 一覧ページの続き（2ページ目以降）を読んで、今の一覧の後ろに足す。登録済みはサーバーが外して返す
  const loadMore = async () => {
    if (!listMeta?.nextPage || loadingMore) return;
    haptic.select();
    setLoadingMore(true);
    try {
      const { events, list } = await parseEventsApiWithMeta({ url: listMeta.url, page: listMeta.nextPage });
      setParsedList((prev) => [...(prev ?? []), ...withoutDismissed(events)]);
      setListMeta((prev) => prev && { ...prev, excluded: prev.excluded + (list?.excluded ?? 0), read: prev.read + (list?.read ?? 0), nextPage: list?.nextPage ?? null });
    } catch {
      toast('続きを読めませんでした', 'error');
    } finally {
      setLoadingMore(false);
    }
  };

  // 販売先候補を検索（リンク無し/価格不明の補完）
  const onSearchProduct = async () => {
    const kw = searchKeyword(workName || workQuery, title);
    if (!kw) return;
    haptic.select();
    setSearchingProduct(true); setCandidates(null); setPicked(new Set());
    const items = await searchProductCandidates(kw);
    setSearchingProduct(false);
    setCandidates(items);
  };
  const togglePick = (i: number) => {
    haptic.select();
    setPicked((prev) => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n; });
  };
  const addPicked = () => {
    if (!candidates || !picked.size) return;
    haptic.select();
    const list = [...picked].sort((a, b) => a - b).map((i) => candidates[i]);
    // 選んだものどうしで種類の名前を付ける（同じ店で2件以上選んだとき）
    const labels = labelVariants(list);
    // 自分で選んだ候補は pinned（Cronが商品名検索で別の商品に付け替えないように）
    setOffers((prev) => list.reduce((acc, c) => addOffer(acc, { ...offerFromCandidate({ ...c, label: labels.get(c) }), pinned: true }), prev));
    const c = list[0];
    // タイトルはユーザー/AIが決めたものを正とする（ショップの商品名で上書きしない）
    if (!price && c.price) setPrice(String(c.price));
    if (!imageUrl && c.image) setImageUrl(c.image);
    setCandidates(null); setPicked(new Set());
    toast(list.length > 1 ? `購入リンクを${list.length}件追加しました` : '購入リンクを追加しました');
  };
  // 「各店で探す」の検索結果ページを購入リンクとして付ける。前は押すと店のページに飛ぶだけだった。
  // 付けたリンクは下の一覧から押せば開いて確かめられる
  const searchOffer = (retailer: string, kw: string): Offer => {
    const r = retailerSearchUrls(kw).find((x) => x.retailer === retailer);
    return { ...buildOffer(r?.url ?? ''), label: '検索結果' };
  };
  const addSearchLink = (retailer: string) => {
    haptic.select();
    const o = searchOffer(retailer, searchKeyword(workName || workQuery, title));
    if (!o.url) return;
    setOffers((prev) => addOffer(prev, o));
    toast(`${retailer}の検索結果を追加しました`);
  };
  const setOfferLabel = (url: string, label: string) =>
    setOffers((prev) => prev.map((o) => (o.url === url ? { ...o, label: label || undefined } : o)));
  const addManualLink = async () => {
    const u = link.trim();
    if (!u) return;
    haptic.select();
    setLink('');
    // 貼ったURLの商品の値段をその場で取る（取れない店は入力欄の値段のまま）
    const o = await buildPinnedOffer(u, price ? Number(price) : undefined);
    setOffers((prev) => addOffer(prev, o));
    if (!price && o.price) setPrice(String(o.price));
    toast('購入リンクを追加しました');
  };
  const removeOffer = (url: string) => {
    const removed = offers.find((o) => o.url === url);
    setOffers((prev) => prev.filter((o) => o.url !== url));
    // 公式通販のシリーズから外した商品は、捨てずに1件の予定として一覧に戻す（＝「分ける」）。
    // 分ける操作を別に作ると階層が増えるので、今ある × をそのまま使う
    const src = appliedRef.current;
    const item = src?.items?.find((it) => it.url === url);
    if (!src || !item || !removed || offers.length < 2) return;
    const single: ParsedEvent = {
      ...src, title: item.title, kind: null, price: removed.price ?? null, imageUrl: item.image || src.imageUrl,
      offers: [{ ...removed, label: undefined }], items: [item],
    };
    setPendingParsed((prev) => [...prev, single]);
    toast('外した商品は、投稿後の一覧に1件として戻します');
  };

  // シリーズの一覧で選んだ行を1件にまとめる。リンクの名前は種類を付けて「お守り（ハチワレ）」にする
  // 一覧が公式通販のシリーズ（全部に商品リンクがそろっている）か。まとめるのはこのときだけ
  // （Xのポストから複数見つかった予定は日付も内容も別物なので、まとめる対象にしない）
  const seriesList = !!parsedList?.length && parsedList.every((p) => (p.offers?.length ?? 0) > 0);
  const mergeSelected = () => {
    if (!parsedList || mergePick.size < 2) return;
    haptic.select();
    const idx = [...mergePick].sort((a, b) => a - b);
    const picked = idx.map((i) => parsedList[i]);
    const titles = picked.map((p) => p.title ?? '');
    // タイトルは共通部分（「ちいかわ シーサーのおみやげやさん」）。短すぎれば先頭のタイトル
    let n = 0;
    while (titles.every((t) => t[n] !== undefined && t[n] === titles[0][n])) n++;
    // 語の途中で切れた短い切れ端（「… ラ」ンチョンマット／「… ラ」ーメン）だけ落とす。長い部分は残す
    const raw = titles[0].slice(0, n).trim();
    const cut = raw.replace(/[\s　・（(]+[^\s　・（(]*$/, '').trim();
    const common = titles.every((t) => /^[\s　]?$/.test(t[n] ?? '')) || raw.length - cut.length > 3 ? raw : cut;
    const itemTitle = (p: ParsedEvent, url: string) => p.items?.find((it) => it.url === url)?.title;
    const merged: ParsedEvent = {
      ...picked[0],
      title: common.length >= 4 ? common : titles[0],
      kind: null,
      price: Math.min(...picked.map((p) => p.price ?? Infinity).filter(Number.isFinite)),
      // 種別が違う行をまとめたら親の「グッズ」だけにする（空にするとイベント扱いになってしまう）
      category: picked.every((p) => p.category === picked[0].category) ? picked[0].category : 'グッズ',
      imageUrl: serializeImageUrls(picked.flatMap((p) => parseImageUrls(p.imageUrl ?? undefined))) ?? null,
      offers: picked.flatMap((p) => (p.offers ?? []).map((o) => ({
        ...o,
        label: o.label || itemTitle(p, o.url) || p.kind || undefined,
      }))),
      items: picked.flatMap((p) => p.items ?? []),
    };
    const next = parsedList.filter((_, i) => !mergePick.has(i));
    next.splice(idx[0], 0, merged);
    setParsedList(next); setMergePick(new Set());
  };

  const linkInfo = link.trim() ? affiliatize(link.trim()) : null;
  const canSave = !!title.trim() && (!!workId || !!workQuery.trim()) && !saving;

  // 開始日を動かしたとき、終了日が**開始日と同じ＝単日**のままなら一緒に動かす。
  // 単日の予定で終了日まで直すのが面倒だという話（案A）。すでに期間を指定している人は
  // 終了日が開始日と違うので、ここでは触らない。
  const changeStartDate = (next: string) => {
    if (endDate === date || !endDate) setEndDate(next);
    setDate(next);
  };

  // 受付開始も同じ扱い。受付終了は既定で発売日に追従しているので普通はここに入らないが、
  // 「開始も終了も同じ日」に直した人はそのまま単日として動かせる。
  const changePreStart = (next: string) => {
    if (preEnd === preStart || !preEnd) { setPreEnd(next); setPreEndTouched(true); }
    setPreStart(next);
  };

  const onSubmit = async () => {
    if (!user || !canSave) return;
    // オンボーディングの体験。ここまでの手順を見せるのが目的なので**保存しない**。
    // 例のポストを本当に登録すると、他の人の「探す」に実在しない予定が流れる。
    if (demo) {
      haptic.select();
      try { localStorage.setItem(ONBOARDING_DEMO_KEY, '1'); } catch { /* ignore */ }
      clearDraft();
      navigate('/', { replace: true });
      return;
    }
    setSaving(true); setError('');
    try {
      let wid = workId;
      if (!wid) { const w = await getOrCreateWork(workQuery.trim()); wid = w.id; }

      // グッズは投稿時に自動で販路を検索・添付（「販売先を探す」を押さなくても収益リンクが付く）。
      // 既にアフィ販路がある（手動で探した/AIが拾った）なら二重検索しない。高信頼(公式店/高一致度)のみ自動添付。
      let autoOffers = offers;
      let autoImage: string | undefined;
      if (type === 'goods' && title.trim() && !searchedTitles.current.has(title.trim()) && !autoOffers.some((o) => isAffiliateUrl(offerUrl(o)))) {
        const kw = searchKeyword(workName || workQuery, title);
        try {
          const picks = highConfidenceCandidates(title.trim(), await searchProductCandidates(kw), workName || workQuery);
          const now = new Date().toISOString();
          for (const c of picks) autoOffers = addOffer(autoOffers, offerFromCandidate(c, now));
          if (!imageUrl && picks[0]?.image) autoImage = picks[0].image;
        } catch { /* 検索失敗時はそのまま通常保存 */ }
      }

      // 販路: 追加済み offers ＋ 入力欄に残ったURL。代表販路を旧フィールドにも要約保存（後方互換）
      const allOffers = link.trim() ? addOffer(autoOffers, await buildPinnedOffer(link.trim(), price ? Number(price) : undefined)) : autoOffers;
      const prim = primaryOffer(allOffers);
      // 同じ名前で場所が違う予定があれば、タイトルに都道府県を付けて区別する（既存側にも付ける）
      const finalTitle = type === 'event'
        ? await distinguishSameNameByPlace(wid, title, prefecture, cats.size ? serializeCategories([...cats]) ?? null : null, user.id).catch(() => title.trim())
        : title.trim();
      const eventPayload = {
        title: finalTitle,
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
      const createdIds = await createEvents(wid, [eventPayload], user.id);
      // カレンダーに登録＝保存（いいね）。外してあれば登録しない。
      // 下のフォローと互いに待たないので、並べて走らせる（前は1つずつ待っていた）
      const liked = addToCalendar && createdIds[0]
        ? toggleLike(createdIds[0], user.id).catch(() => { /* 入れられなくても投稿は成立している */ })
        : Promise.resolve();

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

      // 投稿で自動フォロー。ただし無料プランの上限は超えない。
      // ここだけ上限を見ていないと、投稿を繰り返すだけで無制限にフォローできてしまう。
      // **投稿そのものは必ず通す**（フォローできないことを理由に投稿を止めない）。
      let followSkipped = false;
      const followed = (async () => {
        try {
          const follows = await listAllParticipatedWorks(user.id);
          const already = follows.some((w) => w.id === wid);
          if (already || canFollowMore(follows.length, isPremiumCached())) {
            await upsertParticipation(wid, user.id);
          } else {
            followSkipped = true;
          }
        } catch { /* フォローに失敗しても投稿は成立している */ }
      })();
      // 初月無料の案内を出すかの判定用の投稿数。プロフィールの集計を丸ごと取っていた（7クエリ）のを件数だけにする
      const postedCount = FEATURE_PREMIUM && !isPremiumCached() ? countUserPostedEvents(user.id).catch(() => 0) : Promise.resolve(0);
      await Promise.all([liked, followed]);
      haptic.select();
      // 解析で複数見つかった残りがあれば、戻らずに残りの一覧を出して続けて投稿できるようにする
      if (pendingParsed.length || listMeta?.nextPage) {
        const rest = pendingParsed;
        const meta = listMeta;
        const stacked = !!fromList;
        resetForm();
        setParsedList(rest);
        setListMeta(meta); // 「次のページを読む」を残す
        // 候補を選んだときに積んだ履歴を戻す（fromList は消したので一覧はそのまま）
        if (stacked) navigate(-1);
        window.scrollTo(0, 0);
        toast(rest.length ? `投稿しました。残り${rest.length}件` : '投稿しました');
        setSaving(false);
        return;
      }
      clearDraft();
      forgetShare();
      // 黙って増えないと「なぜフォローされていないのか」が分からないので、そのときだけ伝える
      toast(followSkipped
        ? `投稿しました（フォローは${FREE_FOLLOW_LIMIT}作品までのため追加していません）`
        : '投稿しました');
      setSaving(false);
      // 初月無料の条件を満たした瞬間だけ、帰り道をプランの案内に変える。
      // ⚠️ **一度きり**であること。条件は「5件以上」なので、素通しにすると
      // 5件を超えた無料会員は**投稿するたび毎回**この画面に飛ばされる（実際そうなっていた）。
      // 投稿のたびに割り込まれるのは、宣伝として逆効果でもある。
      // oneShotTip は初回だけ true を返して印を残す。
      if (FEATURE_PREMIUM && !isPremiumCached()) {
        const posted = await postedCount;
        if (trialEligible(posted) && oneShotTip('trial_ready')) {
          navigate('/premium', { replace: true });
          return;
        }
      }
      // 一覧から選んだ候補を投稿したときは、積んだ履歴の分も戻る
      if (fromList && ((window.history.state as { idx?: number } | null)?.idx ?? 0) >= 2) navigate(-2);
      else goBack();
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
          <div className="flex items-center gap-1 min-w-0">
            {/* 入力中(キーボード表示中)は最初のタップがblurに食われて閉じないため pointerDown で確実に閉じる */}
            <button onPointerDown={(e) => { e.preventDefault(); onClose(); }} aria-label="閉じる" className="pressable tap-44 p-1"><X size={22} /></button>
            <span className="font-semibold truncate">{demo ? '投稿（例）' : '投稿'}</span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* カレンダーに登録するか。前は自分の投稿が必ず入っていた（外せなかった） */}
            <button onClick={() => {
                haptic.select();
                const next = !addToCalendar;
                setAddToCalendar(next);
                try { localStorage.setItem('fan_post_add_calendar', next ? '1' : '0'); } catch { /* 覚えられなくても動く */ }
              }}
              aria-pressed={addToCalendar} aria-label="カレンダーに登録"
              className="pressable flex items-center gap-1 px-2.5 h-8 rounded-full text-[12px] font-semibold"
              style={addToCalendar
                ? { backgroundColor: 'var(--fill-primary)', border: '1px solid var(--accent-color)', color: 'var(--accent-text)' }
                : { backgroundColor: 'var(--fill-tertiary)', border: '1px solid transparent', color: 'var(--label-tertiary)' }}>
              <CalendarPlus size={15} />カレンダー
            </button>
            <button onClick={onSubmit} disabled={!canSave}
              className="pressable px-3 py-1.5 rounded-full text-[13px] font-semibold"
              style={canSave ? { backgroundColor: 'var(--accent-color)', color: 'var(--accent-on)' } : { backgroundColor: 'var(--fill-tertiary)', color: 'var(--label-tertiary)' }}>
              {saving ? '投稿中…' : '投稿'}
            </button>
          </div>
        </div>

        <div className="px-4 pb-24">
          {/* オンボーディングの体験中であることを常に見せる（本当に投稿されると思わせない） */}
          {demo && (
            <div className="mt-3 rounded-[12px] px-3 py-2.5" style={{ backgroundColor: 'var(--fill-tertiary)' }}>
              <p className="text-[12px] leading-relaxed">
                今は投稿を押しても登録はされません。
              </p>
            </div>
          )}
          {/* AI入力（ヒーロー） */}
          <div className="mt-3 rounded-[12px] border border-subtle p-3" style={{ backgroundColor: 'var(--bg-secondary)' }}>
            <div className="flex items-center gap-1.5 mb-2">
              <Sparkles size={15} style={{ color: 'var(--accent-color)' }} />
              <span className="text-[13px] font-semibold">AIで入力</span>
            </div>
            {!parsedList && fromList && (
              // 一覧から選んだ候補が気に入らなかったとき用（閉じる・スマホの戻るでも同じ）
              <button onClick={() => { haptic.select(); navigate(-1); }}
                className="pressable w-full mb-2 py-2 rounded-[10px] text-[13px] font-semibold flex items-center justify-center gap-1"
                style={{ backgroundColor: 'var(--fill-tertiary)', color: 'var(--accent-text)' }}>
                <ChevronLeft size={16} /> 解析結果の一覧に戻る
              </button>
            )}
            {!parsedList ? (
              <>
                {/* 一番速い経路を先に出す。貼り付け欄を上に置くと「毎回コピーしてくるもの」と
                    読まれて、共有ひとつで済むことが伝わらない */}
                <div className="flex items-start gap-2 rounded-[10px] px-3 py-2.5" style={{ backgroundColor: 'var(--fill-tertiary)' }}>
                  <Share2 size={15} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--accent-text)' }} />
                  <p className="text-[12px] leading-relaxed">
                    XのポストをFanHiveに共有するだけ！<br />AIが自動で予定にします。<br />
                    <span className="text-label-secondary">公式通販の商品一覧のリンクを貼ると、シリーズごとの予定にまとめます。</span>
                  </p>
                </div>
                <div className="flex gap-2 mt-3">
                  <div className="flex-1 relative">
                    <Link2 size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-label-tertiary pointer-events-none" />
                    <input value={aiText} onChange={(e) => setAiText(e.target.value)} placeholder="Xのポスト・公式通販の一覧のリンク"
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
                {aiError && <p className="text-[12px] mt-2" style={{ color: 'var(--color-destructive)' }}>{aiError}</p>}
              </>
            ) : (
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[12px] text-label-secondary">
                    {parsedList.length ? `${parsedList.length}件あります。選んで1件ずつ投稿できます（投稿するとこの一覧に戻ります）：` : 'この一覧の商品はすべて登録済みです'}
                    {listMeta && listMeta.excluded > 0 && <><br />登録済みの{listMeta.excluded}商品は除いています</>}
                  </p>
                  {/* 公式通販のシリーズだけ、チェックした行を1件にまとめられる */}
                  {seriesList && (
                    <button onClick={mergeSelected} disabled={mergePick.size < 2}
                      className="pressable flex-shrink-0 px-3 py-1.5 rounded-full text-[12px] font-semibold"
                      style={mergePick.size >= 2 ? { backgroundColor: 'var(--accent-color)', color: 'var(--accent-on)' } : { backgroundColor: 'var(--fill-tertiary)', color: 'var(--label-tertiary)' }}>
                      まとめる
                    </button>
                  )}
                </div>
                {parsedList.map((p, i) => (
                  <div key={i} className="flex items-center gap-2">
                  {seriesList && (
                    <button onClick={() => { haptic.select(); setMergePick((prev) => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n; }); }}
                      aria-pressed={mergePick.has(i)} aria-label="まとめる対象に選ぶ"
                      className="pressable tap-44 flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center"
                      style={mergePick.has(i) ? { backgroundColor: 'var(--accent-color)', color: 'var(--accent-on)' } : { border: '1.5px solid var(--label-tertiary)' }}>
                      {mergePick.has(i) && <Check size={14} strokeWidth={3} />}
                    </button>
                  )}
                  <button onClick={() => pickFromList(i)} className="pressable flex-1 min-w-0 text-left px-3 py-2 rounded-[10px] text-[13px]" style={{ backgroundColor: 'var(--bg-primary)' }}>
                    <div className="font-medium truncate">{p.title ?? '（タイトルなし）'}</div>
                    {(p.date || p.prefecture || p.offers?.length) && <div className="text-[11px] text-label-tertiary">{[p.date?.slice(5).replace('-', '/'), p.prefecture, p.offers && p.offers.length > 1 ? `${p.offers.length}商品` : ''].filter(Boolean).join(' ')}</div>}
                  </button>
                  <button onClick={() => dismissFromList(i)} aria-label="この候補を使わない"
                    className="pressable tap-44 flex-shrink-0 text-label-tertiary"><Trash2 size={16} /></button>
                  </div>
                ))}
                {listMeta?.nextPage && (
                  <button onClick={loadMore} disabled={loadingMore}
                    className="pressable mt-1 py-2 rounded-[10px] text-[13px] font-semibold flex items-center justify-center gap-1.5"
                    style={{ backgroundColor: 'var(--fill-tertiary)', color: 'var(--accent-text)' }}>
                    {loadingMore ? <><Loader2 size={15} className="animate-spin" /> 読んでいます…</> : '次のページを読む'}
                  </button>
                )}
                <button onClick={() => { setParsedList(null); setMergePick(new Set()); setListMeta(null); }} className="text-[12px] text-label-tertiary mt-1 pressable">キャンセル</button>
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

          {otherPlaces.length > 0 && prefecture.trim() && !title.includes(prefecture.trim().replace(/[都府県]$/, '')) && (
            <div className="mt-3 rounded-[12px] p-3 text-[12px] text-label-secondary" style={{ backgroundColor: 'var(--bg-secondary)' }}>
              同じ名前の予定が別の場所（{otherPlaces.join('・')}）にあります。区別できるよう、タイトルの後ろに「{prefecture.trim().replace(/[都府県]$/, '')}」を付けて投稿します
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
              {(workResults.length > 0 || masterNames.length > 0 || workQuery.trim()) && (
                <div className="absolute left-0 right-0 mt-1 z-10 rounded-[10px] border border-subtle overflow-hidden" style={{ backgroundColor: 'var(--bg-secondary)' }}>
                  {workResults.map((w) => (
                    <button key={w.id} onClick={() => { haptic.select(); if (workQuery.trim() && w.name !== workQuery.trim()) { logSearch('post_work', workQuery, workResults.length, user?.id, w.name); maybeAddWorkAlias(w, workQuery); } setWorkId(w.id); setWorkName(w.name); setWorkResults([]); }}
                      className="pressable w-full text-left px-3 py-2.5 text-[14px] border-b border-subtle">{w.name}</button>
                  ))}
                  {(workResults.some((w) => sameWorkName(w.name, workQuery)) ? [] : masterNames)
                    .filter((n) => !workResults.some((w) => sameWorkName(w.name, n)))
                    .map((n) => (
                    <button key={n} onClick={() => pickWorkName(n)}
                      className="pressable w-full text-left px-3 py-2.5 text-[14px] border-b border-subtle flex items-center justify-between gap-2">
                      <span className="truncate">{n}</span>
                      <span className="text-[11px] text-label-tertiary flex-shrink-0">正式名</span>
                    </button>
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
          <input value={title} onChange={(e) => setTitle(e.target.value)} onBlur={onTitleBlur} placeholder={type === 'goods' ? '例: ぬいっぽ ハイキュー!!' : '例: POP UP STORE'} className={inputCls} style={inputStyle} />

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
                <input type="date" value={date} onChange={(e) => changeStartDate(e.target.value)} className={dateCls} style={inputStyle} />
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
                  <input type="date" value={preStart} onChange={(e) => changePreStart(e.target.value)} className={dateCls} style={inputStyle} />
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
                    {/* 押すと開いて確かめられる（投稿画面を離れても下書きは残る） */}
                    <button onClick={() => { haptic.select(); void openExternal(o.url); }} className="pressable block w-full text-left">
                      <div className="text-[13px] truncate">{o.retailer || o.url}{o.shop ? `（${o.shop}）` : ''} <span style={{ color: 'var(--accent-text)' }}>↗</span></div>
                      <div className="text-[11px] text-label-tertiary">
                        {o.price ? `¥${o.price.toLocaleString()}` : ''}{import.meta.env.DEV && o.hasAffiliate ? ' ・アフィ対応' : ''}
                      </div>
                    </button>
                    {/* 種類の名前（キャラ名など）。自動で付いたものも直せる */}
                    <input value={o.label ?? ''} onChange={(e) => setOfferLabel(o.url, e.target.value)} placeholder="名前（キャラ名など・任意）"
                      className="w-full mt-1 rounded-[6px] px-2 py-1 text-[12px] outline-none" style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--input-text)' }} />
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
              <span className="text-label-tertiary">検索結果を追加:</span>
              {retailerSearchUrls(searchKeyword(workName || workQuery, title)).map((r) => {
                const added = offers.some((o) => o.url === r.url);
                return (
                  <button key={r.retailer} onClick={() => addSearchLink(r.retailer)} disabled={added} className="pressable"
                    style={{ color: added ? 'var(--label-tertiary)' : 'var(--accent-text)' }}>{added ? `${r.retailer} ✓` : `＋${r.retailer}`}</button>
                );
              })}
            </div>
          )}
          {candidates && (
            candidates.length === 0 ? (
              <p className="text-[12px] text-label-tertiary mt-1">候補が見つかりませんでした</p>
            ) : (
              <div className="mt-2 flex flex-col gap-1.5 rounded-[10px] border border-subtle p-2" style={{ backgroundColor: 'var(--bg-secondary)' }}>
                <p className="text-[11px] text-label-tertiary">商品を特定できなかったので、リンクはまだ付けていません。同じ商品を選んでください（種類違いはまとめて選べます）</p>
                {candidates.map((c, i) => {
                  // 一致度は自動添付(highConfidenceCandidates)と揃えてタイトル基準で見る
                  const ok = titleMatchScore(title, c.title) >= 0.5;
                  // 種類違い（vol/弾/①②）と売切れは、自動添付では弾いている。手動では選べるが理由を出す
                  const variantNg = variantMismatch(title, c.title);
                  const soldOut = c.inStock === false;
                  return (
                    // 不一致でも選べる（ショップ側の商品名が崩れているだけのことが多い）。薄くして注意だけ出す
                    <button key={i} onClick={() => togglePick(i)} aria-pressed={picked.has(i)}
                      className={`pressable flex items-center gap-2 text-left p-1 rounded-[8px] ${ok || picked.has(i) ? '' : 'opacity-60'}`}
                      style={picked.has(i) ? { outline: '2px solid var(--accent-color)' } : undefined}>
                      <span className="w-5 h-5 flex-shrink-0 rounded-full flex items-center justify-center"
                        style={picked.has(i) ? { backgroundColor: 'var(--accent-color)', color: 'var(--accent-on)' } : { border: '1.5px solid var(--label-tertiary)' }}>
                        {picked.has(i) && <Check size={13} strokeWidth={3} />}
                      </span>
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
                <button onClick={addPicked} disabled={!picked.size}
                  className="pressable mt-1 py-2 rounded-[8px] text-[13px] font-semibold"
                  style={picked.size ? { backgroundColor: 'var(--accent-color)', color: 'var(--accent-on)' } : { backgroundColor: 'var(--fill-tertiary)', color: 'var(--label-tertiary)' }}>
                  {picked.size ? `選んだ${picked.size}件を追加` : '追加する商品を選んでください'}
                </button>
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
          {/* UGCの同意点。審査(1.2)で「規約に同意する場所」を見られる */}
          <p className="text-[11px] text-label-tertiary mt-3 text-center leading-relaxed">
            投稿すると<a href="/terms.html" className="underline" style={{ color: 'var(--accent-text)' }}>利用規約</a>に同意したものとみなされます。
            <br />不適切な投稿は削除され、繰り返した場合は利用を停止します。
          </p>
        </div>
      </div>

      <WorkFollowSheet open={workSheetOpen} onClose={() => setWorkSheetOpen(false)}
        onPick={(w) => { setWorkId(w.id); setWorkName(w.name); setWorkQuery(''); setWorkResults([]); }} />
    </div>
  );
}

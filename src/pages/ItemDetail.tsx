import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Heart, CalendarPlus, ShoppingCart, ExternalLink, Package, MapPin, Share2, X, Plus, BellRing } from 'lucide-react';
import type { CalendarEvent, EventSchedule, EventVisit } from '../types';
import EventEditForm from '../components/item/EventEditForm';
import StaffEditPanel from '../components/item/StaffEditPanel';
import { getEventById, getWorkById, getDisplayName, toggleLike, getCalendarAddData, toggleCalendarAdd, listOfferContribs, addOfferContrib, removeOfferContrib, listStockReports, addStockReport, removeStockReport, reportEvent, listEventEdits, addEventEdit, removeEventEdit, applyEdits, listAllParticipatedWorks, upsertParticipation, leaveCalendar, listEventVisits, listEventSchedules, addEventSchedules, removeEventSchedule, getMyStaffRole, getPersonalEvent, proposeEdit, listEditProposals, type EditProposal, type OfferContrib, type StockReport, type EventEdit, type EventPatch } from '../lib/api';
import { addToCalendar } from '../lib/googleCalendar';
import { useToast } from '../components/ui/Toast';
import { parseImageUrls, parseCategories, getPrimaryCategoryColor, addSeenEventId, ANON_NAME, isOfficialUser, FEATURE_PREMIUM } from '../lib/constants';
import OfficialBadge from '../components/ui/OfficialBadge';
import { deriveItemType, itemDateLines, todayStr, isDateUncertain, stageFlow } from '../design/tokens';
import { resolveBuy, getOffers, offerUrl, primaryOffer, isSearchPageUrl, isSourceOnlyLink, priceRange, isStockStale, stockBadge, cheapestOfferUrl } from '../lib/affiliate';
import { buildPinnedOffer } from '../lib/searchProduct';
import { openBuyLink } from '../lib/dataLogs';
import { useShareEvent } from '../hooks/useShareEvent';
import ReactionButton from '../components/item/ReactionButton';
import { checkStockNote } from '../lib/stockCheck';
import StageStepper from '../components/item/StageStepper';
import { useAuth } from '../contexts/AuthContext';
import { useHiddenContent } from '../hooks/useHiddenContent';
import { haptic } from '../lib/haptics';
import { likeEffect } from '../lib/likeEffect';
import { useLike, setLike, getLike } from '../lib/likeStore';
import { syncNotifyWithLike } from '../lib/notifications';
import ImageCarousel from '../components/item/ImageCarousel';
import NotifyBell from '../components/item/NotifyBell';
import SchedulePanel from '../components/item/SchedulePanel';
import EventStylePicker from '../components/item/EventStylePicker';
import AddInfoSheet from '../components/item/AddInfoSheet';
import PendingProposals, { samePatch } from '../components/item/PendingProposals';
import LineLoader from '../components/ui/LineLoader';
import UserProfileModal from '../components/UserProfileModal';
import { useConfirm } from '../components/ui/ConfirmDialog';
import { usePremium, canFollowMore, FREE_FOLLOW_LIMIT, useFeature, isPreorderSoon } from '../lib/premium';
import PromoLine from '../components/ui/PromoLine';
import { countdownLabel } from '../lib/relativeDay';
import GetAppSheet, { openAppHref } from '../components/item/GetAppSheet';
import FanHiveMark from '../components/FanHiveMark';
import { VisitPicker } from '../components/board/VisitSheet';
import { splitCountdown } from '../components/item/ItemCard';
import { MARKS, type Mark } from '../components/board/boardModel';
import { stripWorkName } from '../lib/stripWorkName';

// 外部カレンダー連携（Google/ics への追加）は一旦保留。再開時は true に戻す。
const EXTERNAL_CALENDAR_ENABLED = false;

function summarizePatch(p: EventPatch): string {
  const parts: string[] = [];
  if (p.removedOfferUrls?.length) parts.push(`購入リンクを取り消し（${p.removedOfferUrls.length}件）`);
  if (p.addedSourceUrls?.length) parts.push(`ソースを追加（${p.addedSourceUrls.length}件）`);
  if (p.addedNote) parts.push('詳しい情報を追加');
  if (typeof p.price === 'number') parts.push(`値段 ¥${p.price.toLocaleString()}`);
  if ('date' in p) parts.push(`日付 ${p.date ? p.date.slice(5).replace('-', '/') : '未定'}`);
  if (p.endDate) parts.push(`〜${p.endDate.slice(5).replace('-', '/')}`);
  if (p.time) parts.push(p.time);
  if (p.isOrderMade) parts.push(`予約${p.preorderStart ? ` ${p.preorderStart.slice(5).replace('-', '/')}〜${p.preorderEnd ? p.preorderEnd.slice(5).replace('-', '/') : ''}` : ''}`);
  return parts.join(' ') || '変更';
}


// shared … X などで共有された予定のページ（/e/:id・SharedItem）。ログインせずに見せる。
//          ♡・リアクション・ベル・フォロー・ピンなどアプリでしかできないボタンは出さない（どれを押しても案内が出てうるさかった・2026-10-09 柴野）。
//          アプリへの案内は上の「アプリで開く」（直接アプリ／ストアへ）と下の1本のボタン（GetAppSheet）だけ
export default function ItemDetail({ shared = false }: { shared?: boolean }) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  // 共有ページでは、この端末に Web のセッションがあっても使わない（見るだけ・直す操作は出さない）
  const { user: authUser } = useAuth();
  const user = shared ? null : authUser;
  const { hideReportedEvent } = useHiddenContent(user?.id);
  const toast = useToast();
  // リンク・共有から直接開いた人は履歴が無く、navigate(-1) では何も起きない（下のタブも無い画面なので閉じ込められる）。
  // 履歴が無ければホームへ出す。ホームを通らないとオンボーディングで作品を選ぶ機会も無くなる（PostNew の goBack と同じ）
  const goBack = () => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) navigate(-1);
    else navigate('/', { replace: true });
  };

  const [ev, setEv] = useState<CalendarEvent | null | undefined>(undefined); // undefined=loading
  const [workName, setWorkName] = useState('');
  const [authorName, setAuthorName] = useState<string | null>(null);
  // ?tab=stock などで、そのタブから開ける（ホームのストーリーの「在庫あり ◯店」から在庫情報へ飛ぶ）
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState<DetailTab>(() => {
    const t = searchParams.get('tab');
    return TABS.some((x) => x.key === t) ? (t as DetailTab) : 'detail';
  });
  const [viewingUserId, setViewingUserId] = useState<string | null>(null);
  // タイルと共有するいいねストア。fallback は読み込んだ予定の値。
  const { liked, count: likeCount } = useLike(id ?? '', { liked: !!ev?.likedByMe, count: ev?.likes ?? 0 });
  const [calCount, setCalCount] = useState(0);
  const [calAdded, setCalAdded] = useState(false);
  const [contribs, setContribs] = useState<OfferContrib[]>([]);
  const [addingLink, setAddingLink] = useState(false);
  // 「修正」パネルを開いている販路URL（同時に開くのはひとつだけ）と差し替え先の入力値
  const [fixingUrl, setFixingUrl] = useState<string | null>(null);
  const [replaceUrl, setReplaceUrl] = useState('');
  const [replacing, setReplacing] = useState(false);
  const [stockReports, setStockReports] = useState<StockReport[]>([]);
  const [addingStock, setAddingStock] = useState(false);
  const [reported, setReported] = useState(false);
  const confirm = useConfirm();
  const [edits, setEdits] = useState<EventEdit[]>([]);
  // ＋αの提案（確認中・却下）。投稿者と運営以外の日付・状況・値段・購入リンクはここを通る（2026-09-29）
  const [proposals, setProposals] = useState<EditProposal[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  // 運営（staff.role='admin'）は誰の予定でも直せる。巡回ボットの予定を各自の担当の作品で直してもらう
  const [isStaff, setIsStaff] = useState(false);
  const [staffEditing, setStaffEditing] = useState(false);
  useEffect(() => {
    if (!user) { setIsStaff(false); return; }
    let alive = true;
    getMyStaffRole(user.id).then((r) => { if (alive) setIsStaff(r === 'admin'); }).catch(() => {});
    return () => { alive = false; };
  }, [user]);
  const premium = usePremium();
  const instantAlerts = useFeature('instantAlerts');
  const [following, setFollowing] = useState(false);
  const [followCount, setFollowCount] = useState(0);
  const [visits, setVisits] = useState<EventVisit[]>([]);
  const [schedules, setSchedules] = useState<EventSchedule[]>([]);
  const [addOpen, setAddOpen] = useState(false); // 「＋α」で開く情報追加パネル
  const [editing, setEditing] = useState(false); // 投稿者だけのその場編集（日付）
  const rootRef = useRef<HTMLDivElement>(null);
  const [getAppOpen, setGetAppOpen] = useState(false);
  const shareEvent = useShareEvent();
  // スクロールしたら、上のバーに細い線と予定の名前を出す
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 120);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);

  // 開いたら最上部から表示（前ページのスクロール位置を引き継がない）。
  // ロード中は中身が短く効かないので、データ表示後(ev)にも実行＋全スクロール親を0に。
  useEffect(() => {
    const reset = () => {
      let el = rootRef.current?.parentElement as HTMLElement | null;
      while (el) {
        const oy = getComputedStyle(el).overflowY;
        if (oy === 'auto' || oy === 'scroll') el.scrollTop = 0;
        el = el.parentElement;
      }
      window.scrollTo(0, 0);
    };
    reset();
    requestAnimationFrame(reset);
  }, [id, ev]);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!id) return;
      // 生の値をもらい、パッチはこの画面で重ねる（「戻す」がその場で効くように）
      const e = await getEventById(id, user?.id, { raw: true });
      if (!alive) return;
      // 自分用の予定（personal_events）には詳細ページが無い。通知・端末カレンダーのリンクは /item/<id> で来るので、
      // 見つからなければ自分用の予定かを見て、編集画面へ回す
      if (!e && user) {
        const mine = await getPersonalEvent(id).catch(() => null);
        if (!alive) return;
        if (mine) { navigate(`/personal/${id}`, { replace: true }); return; }
      }
      setEv(e);
      if (!e) return;
      // まだ操作されていなければDBの値でストアを初期化（既存状態は保持）
      if (getLike(e.id) === undefined) setLike(e.id, { liked: !!e.likedByMe, count: e.likes ?? 0 });
      if (e.workId) getWorkById(e.workId).then((w) => alive && setWorkName(w?.name ?? ''));
      if (e.workId && user) listAllParticipatedWorks(user.id).then((ws) => { if (!alive) return; setFollowing(ws.some((w) => w.id === e.workId)); setFollowCount(ws.length); }).catch(() => {});
      if (e.authorId) getDisplayName(e.authorId).then((n) => alive && setAuthorName(n ?? ANON_NAME));
      addSeenEventId(id); // 閲覧済み＝新着判定から外す
      getCalendarAddData(id, user?.id).then((c) => { if (alive) { setCalCount(c.count); setCalAdded(c.added); } });
      listOfferContribs(id).then((cs) => { if (alive) setContribs(cs); });
      listStockReports(id).then((rs) => { if (alive) setStockReports(rs); });
      listEventEdits(id).then((es) => { if (alive) setEdits(es); });
      listEditProposals(id).then((ps) => { if (alive) setProposals(ps); });
      listEventSchedules([id]).then((ss) => { if (alive) setSchedules(ss); }).catch(() => {});
      if (user) listEventVisits(id, user.id).then((vs) => { if (alive) setVisits(vs); }).catch(() => {});
    })();
    return () => { alive = false; };
  }, [id, user?.id]);


  if (ev === undefined) {
    return <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <LineLoader />
    </div>;
  }
  if (ev === null) {
    return <div className="min-h-screen flex flex-col items-center justify-center gap-3" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <p className="text-label-secondary text-[14px]">見つかりませんでした</p>
      {shared
        ? <a href="/lp" className="pressable text-[14px]" style={{ color: 'var(--accent-text)' }}>FanHive について</a>
        : <button onClick={goBack} className="pressable text-[14px]" style={{ color: 'var(--accent-text)' }}>戻る</button>}
    </div>;
  }

  const event = ev;
  const eff = applyEdits(event, edits); // 編集パッチを重ねた実効値
  // 投稿者だけは今までどおりその場で直せる（ほかの人の追加・修正はすべて「＋α」から）
  const isAuthor = !!user && user.id === event.authorId;
  // 投稿者と運営は、日付・購入リンク・タイトル・説明・画像などをその場で直せる
  const canFix = isAuthor || isStaff;
  const type = deriveItemType(eff);
  const images = parseImageUrls(event.imageUrl);
  let cats = parseCategories(event.category);
  if (cats.length > 1) cats = cats.filter((c) => c !== 'グッズ');
  const catColor = getPrimaryCategoryColor(event.category);
  // 同じ商品を複数の店で売っているとき、一番安いリンクに「最安」を付ける
  const cheapest = cheapestOfferUrl(getOffers(eff));
  const buy = resolveBuy(event);
  const buyMode = buy.mode;
  const buyUrl = buy.url;
  const retailer = buy.retailer;

  const onLike = async () => {
    haptic.select();
    if (!user) return;
    const prev = { liked, count: likeCount };
    setLike(event.id, { liked: !prev.liked, count: prev.count + (prev.liked ? -1 : 1) });
    const notify = syncNotifyWithLike(eff, !prev.liked);
    try { const r = await toggleLike(event.id, user.id, !prev.liked); setLike(event.id, { liked: r.liked, count: r.count }); }
    catch { setLike(event.id, prev); }
    await notify;
  };

  const onCalendar = async () => {
    haptic.select();
    if (!user) return;
    const prev = calAdded;
    setCalAdded(!prev); setCalCount((c) => c + (prev ? -1 : 1));
    if (!prev) {
      const r = await addToCalendar(eff);
      toast(r === 'google' ? 'Googleカレンダーに追加しました' : r === 'ics' ? 'カレンダーに追加しました' : '日付未定のため追加できません');
    }
    try { const r = await toggleCalendarAdd(event.id, user.id); setCalAdded(r.added); setCalCount(r.count); } catch { setCalAdded(prev); }
  };
  const onFollow = async () => {
    if (!user || !event.workId) return;
    // 解除は常に可。追加だけ無料プランの上限で止める（今フォロー中のものは取り上げない）
    if (!following && !canFollowMore(followCount, premium)) {
      toast(`フォローは${FREE_FOLLOW_LIMIT}作品までです。今フォロー中の作品はそのまま使えます`);
      return;
    }
    haptic.select();
    const prev = following;
    setFollowing(!prev);
    try {
      if (prev) { await leaveCalendar(event.workId, user.id); setFollowCount((n) => Math.max(0, n - 1)); }
      else { await upsertParticipation(event.workId, user.id); setFollowCount((n) => n + 1); }
      toast(prev ? 'フォローを解除しました' : 'フォローしました');
    } catch { setFollowing(prev); }
  };
  const openBuy = () => { haptic.select(); if (buyUrl) openBuyLink(event, 'item', user?.id); };
  // X で共有（タイトル・日付・#作品名 #FanHive ＋ LP）。中身は lib/share.ts（ストーリーと共通）
  const onShare = () => { haptic.select(); void shareEvent(eff, workName); };

  // リンクの追加。詳細タブの入力欄と「＋α」のパネルの両方から呼ぶ。
  // 買えるページは購入リンクに、Xのポストやニュースなど買えないものはソースとして足す。
  const addLink = async (u: string): Promise<boolean> => {
    if (!u || !user || addingLink) return false;
    setAddingLink(true);
    if (isSourceOnlyLink(u)) {
      const ed = await addEventEdit(event.id, { addedSourceUrls: [u] }, user.id);
      if (ed) setEdits((prev) => [...prev, ed]);
      setAddingLink(false); haptic.select();
      toast(ed ? 'ソースとして追加しました' : '追加できませんでした', ed ? undefined : 'error');
      return !!ed;
    }
    // 投稿者・運営以外の購入リンクは、ボットがその商品のページか確かめてから足す
    if (!canFix) {
      const ok = await submitProposal({ addedOfferUrl: u }, [u]);
      setAddingLink(false);
      return ok;
    }
    const c = await addOfferContrib(event.id, await buildPinnedOffer(u), user.id);
    if (c) setContribs((prev) => [...prev, c]);
    setAddingLink(false); haptic.select();
    toast(c ? '購入リンクとして追加しました' : '追加できませんでした', c ? undefined : 'error');
    return !!c;
  };
  // ＋αの提案を送る。同じ中身の確認中の提案があれば、それへの「合っている」になる（数えるのはボット）
  const submitProposal = async (patch: EditProposal['patch'], evidence: string[] = []): Promise<boolean> => {
    if (!user) return false;
    if (proposals.some((p) => p.status === 'pending' && p.createdBy === user.id && samePatch(p.patch, patch))) {
      toast('同じ内容を確認しています');
      return true;
    }
    const p = await proposeEdit(event.id, patch, evidence);
    haptic.select();
    if (!p) { toast('送れませんでした', 'error'); return false; }
    setProposals((prev) => [p, ...prev]);
    toast('ありがとうございます。リンクで確かめてから反映します');
    return true;
  };
  const onRemoveContrib = async (cid: string) => {
    haptic.select();
    setContribs((prev) => prev.filter((c) => c.id !== cid));
    await removeOfferContrib(cid);
  };
  // 購入リンクの取り消し（誰でも可・共同編集）。events.offers は書き換えず日付編集と同じ
  // パッチとして記録するので、編集履歴に残り「戻す」で復活できる。
  const onRemoveOffer = async (url: string) => {
    if (!event || !user) return;
    if (!(await confirm({ title: 'この購入リンクを取り消しますか？', message: '編集履歴から元に戻せます', confirmLabel: '取り消す', destructive: true }))) return;
    haptic.select();
    const ed = await addEventEdit(event.id, { removedOfferUrls: [url] }, user.id);
    if (ed) { setEdits((prev) => [...prev, ed]); setFixingUrl(null); toast('購入リンクを取り消しました'); }
    else toast('取り消せませんでした');
  };
  // 購入リンクの差し替え（取り消し＋追加を1操作に）。リンクが誤っているときの
  // 「取り消す→URLを貼り直す」2手を1手にする。先に新リンクを追加してから取り消すので、
  // 途中で失敗しても購入リンクが1つも無い状態にはならない。
  const onReplaceOffer = async (oldUrl: string) => {
    const u = replaceUrl.trim();
    if (!u || !user || replacing) return;
    setReplacing(true);
    const c = await addOfferContrib(event.id, await buildPinnedOffer(u), user.id);
    if (!c) { setReplacing(false); toast('差し替えられませんでした'); return; }
    setContribs((prev) => [...prev, c]);
    const ed = await addEventEdit(event.id, { removedOfferUrls: [oldUrl] }, user.id);
    if (ed) setEdits((prev) => [...prev, ed]);
    setFixingUrl(null); setReplaceUrl(''); setReplacing(false); haptic.select();
    toast(ed ? '購入リンクを差し替えました' : '新しいリンクを追加しました（元のリンクは取り消せませんでした）');
  };
  // 在庫の報告。入り口が2つ（詳細タブの入力欄・「＋α」のパネル）なので簡易チェックはここに置く
  const addStock = async (n: string): Promise<boolean> => {
    if (!n || !user || addingStock) return false;
    const chk = checkStockNote(n);
    if (!chk.ok) { toast(chk.reason, 'error'); return false; }
    setAddingStock(true);
    const r = await addStockReport(event.id, n, user.id);
    if (r) setStockReports((prev) => [r, ...prev]);
    setAddingStock(false); haptic.select();
    if (!r) toast('追加できませんでした', 'error');
    return !!r;
  };
  // 型に収まらない詳しい情報。画面には出さず、運営とAIが読む（E6）
  const addNote = async (text: string): Promise<boolean> => {
    if (!text || !user) return false;
    const ed = await addEventEdit(event.id, { addedNote: text }, user.id);
    if (ed) setEdits((prev) => [...prev, ed]);
    haptic.select();
    toast(ed ? '詳しい情報を送りました' : '送れませんでした', ed ? undefined : 'error');
    return !!ed;
  };
  const onRemoveStock = async (rid: string) => {
    haptic.select();
    setStockReports((prev) => prev.filter((r) => r.id !== rid));
    await removeStockReport(rid);
  };
  const onReport = async () => {
    if (!user || reported) return;
    haptic.select();
    const ok = await confirm({ title: 'この投稿を通報しますか？', message: '不適切な内容・誤情報として運営に報告します。この投稿はあなたの画面から消えます', confirmLabel: '通報する', destructive: true });
    if (!ok) return;
    setReported(true);
    await reportEvent(event.id, user.id, 'user_report').catch(() => {});
    // 通報したものは自分の画面から消す（一覧に残っていると通報が効いていないように見える）
    hideReportedEvent(event.id);
    toast('通報しました。この投稿は表示されなくなります');
    goBack();
  };
  const onSaveEdit = async (patch: EventPatch, evidence: string[] = []) => {
    if (!user) return;
    setEditing(false);
    // 投稿者・運営は今までどおりすぐ反映。ほかの人は提案として送り、ボットが確かめてから反映する
    if (!canFix) return submitProposal(patch, evidence);
    const ed = await addEventEdit(event.id, patch, user.id);
    if (ed) setEdits((prev) => [...prev, ed]);
  };
  const onRevertEdit = async (eid: string) => {
    haptic.select();
    setEdits((prev) => prev.filter((e) => e.id !== eid));
    await removeEventEdit(eid);
  };

  // ソース（どこで知ったか）。編集履歴のパッチから並べる（古い順）
  const sources = edits.flatMap((ed) =>
    (ed.patch.addedSourceUrls ?? []).map((url) => ({ url, editId: ed.id, by: ed.createdBy })));

  // 情報を足した人（投稿者以外）。日時の編集・リンクの追加・在庫の報告の回数が多い順
  const contributorIds = (() => {
    const n = new Map<string, number>();
    for (const x of [...edits, ...contribs, ...stockReports]) {
      if (!x.createdBy || x.createdBy === eff.authorId) continue;
      n.set(x.createdBy, (n.get(x.createdBy) ?? 0) + 1);
    }
    return [...n.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
  })();

  // ─ 2026-11-07 デザインの一新（時刻表の考え）: 白地・細い線・余白。あと○日と値段は数字の書体で大きく、
  //   日付は〆受発の印を付けた行で並べる（カレンダーのボードと同じ印）。箱で囲むのは、行く日を選ぶなど操作のまとまりだけ ─
  const countdown = splitCountdown(countdownLabel({ ...eff, visits }, type === 'goods', todayStr()));
  // 代表は実効値(eff)から選ぶ。取り消されたリンクの価格・セット・取得日を出し続けると、
  // 「リンクが違うから取り消した」のに誤った価格が残ってしまう。
  // 代表販路に値段が無いときの控えは eff.price（元の event.price ではない）。
  // リンクが取り消されていれば applyEdits が残った販路の値段に直している（無ければ値段なし）。
  const prim = primaryOffer(getOffers(eff));
  const priceNow = eff.priceEdited ? eff.price : (prim?.price ?? eff.price);
  // 種類違いが並ぶ予定は「¥330〜¥1,980」と幅で出す（人が値段を直していればそちら）
  const range = eff.priceEdited ? null : priceRange(getOffers(eff));
  const priceText = range ? `¥${range.min.toLocaleString()}〜¥${range.max.toLocaleString()}` : priceNow != null ? `¥${priceNow.toLocaleString()}` : null;
  const timetable = dateRows(eff, type === 'goods', todayStr());
  // 日付が未定・曖昧（9月下旬・春頃など）なら、まだ確かでないことを添える（終わった予定には出さない）
  const uncertain = isDateUncertain(eff) && (() => { const f = stageFlow(eff); return f.current < f.steps.length - 1; })();
  const place = [event.prefecture, event.locationDetail].filter(Boolean).join(' ');
  const line = '0.5px solid var(--separator)';

  return (
    <div ref={rootRef} className="min-h-screen flex flex-col" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <div className="mx-auto w-full max-w-app flex-1 flex flex-col">
        {/* ヘッダー。白い平らなバーで、スクロールしたら下に細い線 */}
        <div className="sticky top-0 z-20 flex items-center px-2 pb-1.5"
          style={{ paddingTop: 'calc(var(--sat) + 6px)', backgroundColor: 'var(--bg-primary)', borderBottom: scrolled ? line : '0.5px solid transparent' }}>
          {shared ? (
            <div className="flex-1 flex items-center justify-between px-2">
              <a href="/lp" className="flex items-center gap-2">
                <FanHiveMark size={28} />
                <span className="text-[16px] font-bold">FanHive</span>
              </a>
              {/* 入っている人はアプリのこの予定へ、無い人はストアへ（openAppHref） */}
              <a href={openAppHref(event.id)} onClick={() => haptic.select()} className="pressable px-3 py-1.5 rounded-full text-[13px] font-bold"
                style={{ backgroundColor: 'var(--accent-color)', color: 'var(--accent-on)' }}>アプリで開く</a>
            </div>
          ) : (
            <>
              <button onClick={goBack} aria-label="戻る" className="pressable tap-44 p-2"><ArrowLeft size={22} /></button>
              {/* スクロールしたら、何の予定かを上に小さく出す */}
              <span className="flex-1 min-w-0 truncate text-[14px] font-bold pr-10 text-center transition-opacity" style={{ opacity: scrolled ? 1 : 0 }} aria-hidden>
                {stripWorkName(event.title, workName)}
              </span>
            </>
          )}
        </div>

        <div className={`flex-1 ${shared || buyMode !== 'none' ? 'pb-28' : 'pb-10'}`}>
          {/* 作品・カテゴリ・フォロー → タイトル を画像より上に（開いた瞬間に何のページか分かるように） */}
          <div className="px-4 pt-1 pb-4">
            <div className="flex items-center gap-2 min-w-0">
              <div className="flex-1 min-w-0 flex items-center gap-1.5 text-[12px] font-semibold text-label-secondary">
                {workName && <span className="truncate">{workName}</span>}
                {catColor && <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: catColor }} />}
                {cats.length > 0 && <span className="flex-shrink-0">{cats.join('・')}</span>}
              </div>
              {event.workId && !shared && (
                <button onClick={onFollow} className="pressable flex-shrink-0 h-7 px-3 rounded-full text-[12px] font-bold"
                  style={following
                    ? { color: 'var(--label-secondary)', boxShadow: 'inset 0 0 0 0.5px var(--border-default)' }
                    : { backgroundColor: 'var(--accent-color)', color: 'var(--accent-on)' }}>
                  {following ? 'フォロー中' : '＋ フォロー'}
                </button>
              )}
            </div>

            {/* タイトル */}
            <h1 className="text-[21px] font-extrabold leading-[1.4] mt-1.5">{event.title}</h1>
            {canFix && !staffEditing && (
              <button onClick={() => { haptic.select(); setStaffEditing(true); }} className="pressable mt-1 text-[12px] font-semibold" style={{ color: 'var(--accent-text)' }}>タイトル・説明・画像を直す</button>
            )}
            {canFix && staffEditing && (
              <StaffEditPanel event={event} onClose={() => setStaffEditing(false)}
                onSaved={(patch) => { setEv((prev) => (prev ? { ...prev, ...patch } : prev)); setStaffEditing(false); }}
                onDeleted={goBack} />
            )}
          </div>

          <div className="px-4">
            <div className="relative rounded-[18px] overflow-hidden">
              <ImageCarousel images={images} alt={event.title} />
              {EXTERNAL_CALENDAR_ENABLED && calCount > 0 && (
                <div className="absolute top-2 right-2 flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-medium"
                  style={{ backgroundColor: 'rgba(0,0,0,0.6)', color: '#fff' }}>
                  <CalendarPlus size={12} />
                  {calCount}人が追加
                </div>
              )}
            </div>
          </div>

          <div className="px-4 pt-5">
            {/* あと○日（一番気になる日まで・カレンダーと同じ考え方）と値段。どちらも数字の書体で大きく */}
            {(countdown || priceText) && (
              <div className="flex items-end justify-between gap-3 flex-wrap">
                {countdown ? <BigCountdown label={countdown.label} value={countdown.value} /> : <span />}
                {priceText && (
                  <div className="text-right ml-auto">
                    <div className={`num font-extrabold leading-none ${range ? 'text-[22px]' : 'text-[28px]'}`}>{priceText}</div>
                    {(prim?.isSet || prim?.fetchedAt) && (
                      <div className="mt-1 flex items-center justify-end gap-1.5 text-[11px] text-label-tertiary">
                        {prim?.isSet && <span className="font-bold text-label-secondary px-1.5 py-px rounded" style={{ background: 'var(--fill-tertiary)' }}>セット</span>}
                        {prim?.fetchedAt && <span>{new Date(prim.fetchedAt).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })}時点</span>}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* 段階の流れ（今いる段階に色） */}
            <div className={countdown || priceText ? 'mt-5' : ''}><StageStepper event={eff} /></div>
            {/* 受付開始の即時通知の案内（無料の人・予約受付がこれから始まるグッズだけ・2026-10-05）。
                一番ほしくなるのは「予約開始前」を見ているときなので、段階の表示のすぐ下に置く */}
            {!shared && FEATURE_PREMIUM && !instantAlerts && isPreorderSoon({ type: deriveItemType(eff), preorderStart: eff.preorderStart }, todayStr()) && (
              <PromoLine className="mt-3" icon={<BellRing size={15} />} text="予約受付が始まった瞬間に通知" badge="プレミアム"
                onClick={() => navigate('/premium')} />
            )}

            {/* 日付と場所の表（〆受発の印・名前・日付）。過ぎた日は薄く */}
            <div className="mt-5" style={{ borderTop: line, borderBottom: line }}>
              {timetable.map((r, i) => (
                <div key={r.label} className="flex items-center gap-2.5 min-h-[46px] py-1.5" style={{ borderTop: i ? line : undefined, opacity: r.past ? 0.45 : 1 }}>
                  <MarkBox mark={r.mark} />
                  <span className="w-[60px] flex-shrink-0 text-[12px] font-bold text-label-secondary">{r.label}</span>
                  <span className="flex-1 min-w-0 flex items-baseline flex-wrap gap-x-1.5">
                    <span className={r.num ? 'num text-[17px] font-extrabold' : 'text-[15px] font-extrabold'}>{r.value}</span>
                    {r.time && <span className="num text-[14px] font-bold text-label-secondary">{r.time}</span>}
                  </span>
                  {r.main && uncertain && (
                    <span className="flex-shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded"
                      style={{ color: 'var(--status-info)', backgroundColor: 'color-mix(in srgb, var(--status-info) 14%, transparent)' }}>未確定</span>
                  )}
                </div>
              ))}
              {/* 会場・地域。長い場所（店舗一覧など）も折り返して全部見せる */}
              {place && (
                <div className="flex items-start gap-2.5 py-3" style={{ borderTop: timetable.length ? line : undefined }}>
                  <span className="w-[18px] h-[18px] flex items-center justify-center flex-shrink-0"><MapPin size={16} className="text-label-secondary" /></span>
                  <span className="w-[60px] flex-shrink-0 text-[12px] font-bold text-label-secondary leading-[18px]">場所</span>
                  <span className="flex-1 min-w-0 text-[14px] font-semibold leading-snug">{place}</span>
                </div>
              )}
            </div>

            {/* ほかの人の追加・修正は「＋α」のパネルから。投稿者だけはここで直せる */}
            {canFix && (!editing ? (
              <button onClick={() => { haptic.select(); setEditing(true); }} className="pressable mt-2 text-[12px] font-semibold" style={{ color: 'var(--accent-text)' }}>日付を修正</button>
            ) : (
              <EventEditForm event={eff} onClose={() => setEditing(false)} onSave={onSaveEdit} />
            ))}
            {canFix && edits.length > 0 && (
              <div className="mt-2">
                <button onClick={() => setHistoryOpen((v) => !v)} className="pressable text-[12px] text-label-tertiary">
                  編集履歴（{edits.length}）{historyOpen ? ' ▲' : ' ▼'}
                </button>
                {historyOpen && (
                  <div className="mt-1 flex flex-col gap-1">
                    {[...edits].reverse().map((ed) => (
                      <div key={ed.id} className="flex items-center justify-between gap-2 text-[11px] text-label-secondary">
                        <span className="truncate">{ed.createdAt.slice(5, 10).replace('-', '/')} {summarizePatch(ed.patch)}</span>
                        {user && (ed.createdBy === user.id || event.authorId === user.id) && (
                          <button onClick={() => onRevertEdit(ed.id)} className="pressable flex-shrink-0" style={{ color: 'var(--accent-text)' }}>戻す</button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 複数部・二次受付など。投稿者と運営が足せる。見るのは誰でも */}
            <SchedulePanel schedules={schedules} canEdit={canFix && !shared}
              onAdd={async (s) => {
                try { const [added] = await addEventSchedules(event.id, [s]); if (added) setSchedules((prev) => [...prev, added].sort((a, b) => a.start.localeCompare(b.start))); return true; }
                catch { toast('足せませんでした。時間をおいてお試しください', 'error'); return false; }
              }}
              onRemove={(sid) => {
                setSchedules((prev) => prev.filter((s) => s.id !== sid));
                removeEventSchedule(sid).catch(() => toast('消せませんでした', 'error'));
              }} />

            {/* 共有ページ: 押せるのは共有だけ。いいねの数は文字で出す。購入リンクは中身の中に（X から来た人に一番役に立つ） */}
            {shared && (
              <div className="mt-5 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-[13px] text-label-secondary">
                    {likeCount > 0 && <><Heart size={15} fill="var(--accent-color)" style={{ color: 'var(--accent-color)' }} /><span className="num font-bold text-label-primary">{likeCount}</span>人がカレンダーに追加</>}
                  </span>
                  <button onClick={onShare} className="pressable flex items-center gap-1 text-[13px] text-label-secondary" aria-label="共有">
                    <Share2 size={16} /> 共有
                  </button>
                </div>
                {buyMode !== 'none' && (
                  <button onClick={openBuy} className="pressable w-full h-12 rounded-[14px] font-bold flex items-center justify-center gap-2"
                    style={{ backgroundColor: 'var(--fill-tertiary)', color: 'var(--label-primary)' }}>
                    {buyMode === 'cart' ? <ShoppingCart size={18} /> : <ExternalLink size={18} />}
                    {buyMode === 'cart' || (retailer && !retailer.includes('.')) ? `購入する${retailer ? `（${retailer}）` : ''}` : '販売ページを開く'}
                  </button>
                )}
              </div>
            )}

            {/* アクション: いいね・スタンプ・通知・共有。囲まずに、細い線のあいだに並べる */}
            {!shared && (
              <div className="mt-5 flex items-center justify-around py-2.5" style={{ borderTop: line, borderBottom: line }}>
                <button onClick={(e) => { if (!liked) likeEffect(e.currentTarget); onLike(); }} className="pressable flex flex-col items-center gap-0.5" aria-label="いいね">
                  <Heart size={22} fill={liked ? 'var(--accent-color)' : 'none'} style={{ color: liked ? 'var(--accent-color)' : 'var(--label-secondary)' }} />
                  <span className="text-[10px] text-label-tertiary leading-none">{likeCount > 0 ? likeCount : 'いいね'}</span>
                </button>
                <ReactionButton eventId={event.id} size={22} variant="labeled" />
                {EXTERNAL_CALENDAR_ENABLED && (
                  <button onClick={onCalendar} className="pressable flex flex-col items-center gap-0.5" aria-label="カレンダーに追加">
                    <CalendarPlus size={22} style={{ color: calAdded ? 'var(--accent-color)' : 'var(--label-secondary)' }} />
                    <span className="text-[10px] text-label-tertiary leading-none">{calAdded ? '追加済み' : 'カレンダー'}</span>
                  </button>
                )}
                <NotifyBell event={eff} liked={liked} onSave={onLike} variant="labeled" />
                {/* 「X で共有もできます」は、場面ごとのヒント（Hints.tsx の item-share）で、このボタンが画面に見えたときに出す。
                    前はいいねした予定を開いた瞬間に出ていて、ボタンが画面の下に隠れていても出ていた（2026-11-07 柴野） */}
                <button data-hint="item-share" onClick={onShare} className="pressable flex flex-col items-center gap-0.5" aria-label="共有">
                  <Share2 size={22} className="text-label-secondary" />
                  <span className="text-[10px] text-label-tertiary leading-none">共有</span>
                </button>
              </div>
            )}

            {/* 行く日（期間のある予定のみ・イベント/グッズ共通）。選ぶと自分のカレンダーはその日だけ表示する。
                2026-11-06 柴野: 日付の入力欄から、会期のカレンダーをタップして選ぶ形に（ボードの試作と同じ）。ふだんはたたんでおく */}
            {!shared && user && !!eff.endDate && eff.endDate !== eff.date && (
              <div className="mt-4 rounded-[16px] px-3 py-3" style={{ backgroundColor: 'var(--bg-secondary)', boxShadow: 'inset 0 0 0 0.5px var(--separator)' }}>
                <VisitPicker eventId={event.id} date={eff.date} endDate={eff.endDate} visits={visits} userId={user.id} foldable
                  onChange={(next) => {
                    // 行く日を足す＝自分のカレンダーに出したいので、いいねも付く（addEventVisit が付ける）
                    if (next.length > visits.length && !liked) setLike(event.id, { liked: true, count: likeCount + 1 });
                    setVisits(next);
                  }} />
              </div>
            )}

            {/* カレンダーに入っている予定だけ、この予定の色とアイコンを選べる */}
            {!shared && liked && <EventStylePicker eventId={event.id} workId={event.workId} />}

            <PendingProposals event={eff} proposals={proposals} userId={user?.id ?? null}
              onAgree={(p) => { void submitProposal(p.patch, p.evidenceUrls); }} />

            {/* ここから下はタブで切り替える */}
            <DetailTabs tab={tab} onChange={(t) => { haptic.select(); setTab(t); }} />
            {tab === 'detail' && (
              <div>
                {/* メモ */}
                {event.memo && <p className="text-[14px] leading-relaxed whitespace-pre-wrap mt-4">{event.memo}</p>}
                {!event.memo && <p className="text-[13px] text-label-tertiary mt-4">メモはまだありません</p>}
              </div>
            )}
            {tab === 'links' && (
              <div>
                {/* 購入リンク（共同編集で追記可・発売に向けて増える） */}
                <div className="mt-4">
                  <div className="flex items-baseline gap-2 pb-1">
                    <span className="text-[13px] font-extrabold">購入リンク</span>
                    <span className="text-[11px] text-label-tertiary">広告を含みます</span>
                  </div>
                  {getOffers(eff).length === 0 && contribs.length === 0 && <p className="text-[13px] text-label-tertiary py-2">購入リンクはまだありません</p>}
                  <div className="flex flex-col">
                    {getOffers(eff).map((o, i) => (
                      <div key={`b${i}`} style={{ borderBottom: line }}>
                        <div className="flex items-center gap-2 min-h-[52px] py-2">
                          <a href={offerUrl(o)} target="_blank" rel="noopener nofollow" onClick={() => haptic.select()}
                            className="pressable flex-1 min-w-0 flex items-center justify-between gap-2">
                            {/* 検索ページは商品ページと区別する（商品が特定できず価格も在庫も出ないため） */}
                            <span className="text-[14px] font-semibold truncate" style={o.inStock === false && !isStockStale(eff, o) ? { opacity: 0.55 } : undefined}>
                              {/* 種類違いのリンクが並ぶときは名前（キャラ名など）を先に出す */}
                              {o.label && <span className="font-bold">{o.label}<span className="text-label-tertiary font-normal"> ・ </span></span>}
                              {o.retailer || 'リンク'}{o.shop ? `（${o.shop}）` : ''}{isSearchPageUrl(o.url) && o.label !== '検索結果' ? '（検索）' : ''}
                            </span>
                            <span className="flex items-center gap-1.5 flex-shrink-0">
                              {/* 在庫は決まった4つの札だけ出す（stockBadge）。未取得のときは何も出さない＝Cronが更新するまで無表示 */}
                              {/* 節目（予約開始・終了・発売）より前に取ったきりの在庫は出さない（isStockStale） */}
                              {(() => {
                                const b = !isStockStale(eff, o) && stockBadge(o);
                                if (!b) return null;
                                const color = b.tone === 'ok' ? 'var(--color-success)' : b.tone === 'out' ? 'var(--color-destructive)' : 'var(--status-info)';
                                return <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ color, background: 'var(--fill-tertiary)' }}>{b.text}</span>;
                              })()}
                              {o.isSet && <span className="text-[10px] font-bold text-label-secondary px-1.5 py-0.5 rounded" style={{ background: 'var(--fill-tertiary)' }}>セット</span>}
                              {o.url === cheapest && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ color: 'var(--accent-on)', background: 'var(--accent-color)' }}>最安</span>}
                              {o.price
                                ? <span className="num text-[16px] font-extrabold">¥{o.price.toLocaleString()}</span>
                                : <span className="text-[13px] font-bold" style={{ color: 'var(--accent-text)' }}>開く ↗</span>}
                            </span>
                          </a>
                          {/* 入口は「修正」ひとつだけ。アイコンを2つ並べると tap-44 の44px判定が重なって
                              手前のボタンに食われるうえ、Xでは何が起きるか字で説明できない。
                              この機能の動機は「リンクがおかしいから消したい」なので、パネルの先頭は取り消し。 */}
                          {canFix && (
                            <button onClick={() => { haptic.select(); setReplaceUrl(''); setFixingUrl((prev) => (prev === o.url ? null : o.url)); }}
                              className="pressable flex-shrink-0 text-[11px] font-semibold px-2 py-1.5 text-label-tertiary">{fixingUrl === o.url ? '閉じる' : '修正'}</button>
                          )}
                        </div>
                        {fixingUrl === o.url && (
                          <div className="flex flex-col gap-2 rounded-[14px] px-3 py-2.5 mb-2.5" style={{ backgroundColor: 'var(--bg-secondary)', boxShadow: 'inset 0 0 0 0.5px var(--separator)' }}>
                            <button onClick={() => onRemoveOffer(o.url)} className="pressable text-left text-[13px] font-semibold" style={{ color: 'var(--color-destructive)' }}>このリンクを取り消す</button>
                            <div style={{ borderTop: line }} />
                            <div className="flex gap-2">
                              <input value={replaceUrl} onChange={(e) => setReplaceUrl(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && onReplaceOffer(o.url)}
                                placeholder="正しいリンク（URL）" inputMode="url"
                                className="flex-1 min-w-0 h-10 rounded-[10px] px-3 text-[13px] outline-none" style={{ backgroundColor: 'var(--fill-tertiary)', color: 'var(--input-text)' }} />
                              <button onClick={() => onReplaceOffer(o.url)} disabled={!replaceUrl.trim() || replacing}
                                className="pressable px-3 rounded-[10px] text-[13px] font-bold flex-shrink-0" style={{ backgroundColor: 'var(--accent-color)', color: 'var(--accent-on)' }}>差し替え</button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                    {contribs.map((c) => (
                      <div key={c.id} className="flex items-center gap-2 min-h-[52px] py-2" style={{ borderBottom: line }}>
                        <a href={offerUrl(c.offer)} target="_blank" rel="noopener nofollow" onClick={() => haptic.select()} className="pressable flex-1 min-w-0 flex items-center justify-between gap-2">
                          <span className="text-[14px] font-semibold truncate">{c.offer.label && <span className="font-bold">{c.offer.label} ・ </span>}{c.offer.retailer || 'リンク'}{c.offer.shop ? `（${c.offer.shop}）` : ''}{isSearchPageUrl(c.offer.url) ? '（検索）' : ''}<span className="text-[10px] font-normal text-label-tertiary"> ・ユーザー追加</span></span>
                          {c.offer.price
                            ? <span className="num text-[16px] font-extrabold flex-shrink-0">¥{c.offer.price.toLocaleString()}</span>
                            : <span className="text-[13px] font-bold flex-shrink-0" style={{ color: 'var(--accent-text)' }}>開く ↗</span>}
                        </a>
                        {user && c.createdBy === user.id && (
                          <button onClick={() => onRemoveContrib(c.id)} aria-label="削除" className="pressable tap-44 text-label-tertiary flex-shrink-0"><X size={15} /></button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* ソース（どこで知ったか）。買えるページではないので購入リンクとは分けて並べる */}
                {sources.length > 0 && (
                  <div className="mt-5">
                    <div className="text-[13px] font-extrabold pb-1">ソース</div>
                    <div className="flex flex-col">
                      {sources.map((sc) => (
                        <div key={sc.editId + sc.url} className="flex items-center gap-2 min-h-[48px] py-2" style={{ borderBottom: line }}>
                          <a href={sc.url} target="_blank" rel="noopener nofollow" onClick={() => haptic.select()}
                            className="pressable flex-1 min-w-0 flex items-center justify-between gap-2">
                            <span className="text-[14px] font-semibold truncate">{sourceLabel(sc.url)}</span>
                            <span className="text-[13px] font-bold flex-shrink-0" style={{ color: 'var(--accent-text)' }}>開く ↗</span>
                          </a>
                          {user && sc.by === user.id && (
                            <button onClick={() => onRevertEdit(sc.editId)} aria-label="削除" className="pressable tap-44 text-label-tertiary flex-shrink-0"><X size={15} /></button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
            {tab === 'stock' && (
              <div>
                {/* 在庫 */}
                {event.stockNote && (
                  <div className="mt-4 flex items-start gap-2">
                    <Package size={16} className="text-label-secondary mt-0.5 flex-shrink-0" />
                    <div className="text-[14px]">{event.stockNote}</div>
                  </div>
                )}

                {/* 在庫情報（共同編集・追記ログ） */}
                <div className="mt-4">
                  <div className="text-[13px] font-extrabold pb-1">在庫情報</div>
                  {stockReports.length === 0 && <p className="text-[13px] text-label-tertiary py-2">在庫の報告はまだありません</p>}
                  {stockReports.length > 0 && (
                    <div className="flex flex-col">
                      {stockReports.map((r) => (
                        <div key={r.id} className="flex items-start gap-2 py-2.5" style={{ borderBottom: line }}>
                          <span className="num w-[38px] flex-shrink-0 text-[12px] font-bold text-label-secondary pt-px">{r.createdAt.slice(5, 10).replace('-', '/').replace(/^0/, '')}</span>
                          <div className="flex-1 min-w-0 text-[14px]">{r.note}</div>
                          {user && r.createdBy === user.id && <button onClick={() => onRemoveStock(r.id)} aria-label="削除" className="pressable tap-44 text-label-tertiary flex-shrink-0"><X size={15} /></button>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
            {tab === 'contributors' && (
              <Contributors authorId={eff.authorId ?? null} authorName={authorName}
                others={contributorIds} onOpen={(id) => { haptic.select(); setViewingUserId(id); }} />
            )}

            {/* 通報（確認ダイアログあり）。共有ページでは出さない */}
            <div className={shared ? 'hidden' : 'mt-6'}>
              <button onClick={onReport} disabled={reported} className="pressable text-[12px] text-label-tertiary">
                {reported ? '通報しました' : '通報する'}
              </button>
            </div>
          </div>
        </div>

        {/* 共有ページの固定バー: アプリへの案内は1本だけ */}
        {shared && (
          <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-app px-4 pt-2.5"
            style={{ backgroundColor: 'var(--bg-primary)', borderTop: line, paddingBottom: 'calc(var(--sab) + 10px)' }}>
            <button onClick={() => { haptic.select(); setGetAppOpen(true); }} className="pressable w-full h-12 rounded-[14px] font-bold flex items-center justify-center gap-1.5 text-[14px]"
              style={{ backgroundColor: 'var(--accent-color)', color: 'var(--accent-on)' }}>
              <BellRing size={18} /> アプリでカレンダーに追加・締切前に通知
            </button>
          </div>
        )}

        {/* 固定バー: 購入/公式リンク。下のナビと同じ、細い線1本の平らなバー */}
        {!shared && buyMode !== 'none' && (
          <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-app px-4 pt-2.5"
            style={{ backgroundColor: 'var(--bg-primary)', borderTop: line, paddingBottom: 'calc(var(--sab) + 10px)' }}>
            <button onClick={openBuy} className="pressable w-full h-12 rounded-[14px] font-bold flex items-center justify-center gap-2"
              style={{ backgroundColor: 'var(--accent-color)', color: 'var(--accent-on)' }}>
              {buyMode === 'cart' ? <ShoppingCart size={18} /> : <ExternalLink size={18} />}
              {/* 店名が分かる販路（アフィ未提携のアニメイト等も）は「購入する」。前は一律「公式サイトを開く」で、
                  購入リンクなのに公式サイトに見えていた。店名が取れずホスト名のままのものだけ「販売ページを開く」 */}
              {buyMode === 'cart' || (retailer && !retailer.includes('.')) ? `購入する${retailer ? `（${retailer}）` : ''}` : '販売ページを開く'}
            </button>
          </div>
        )}

        {/* ＋α: 情報を足す入口。購入バーがあるときはその上に重ねる。
            色は購入バー（アクセント）と分ける＝主役は購入のままにする。2026-11-07: 白い丸に、＋（アクセント）とα */}
        {user && (
          <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-app z-30 pointer-events-none"
            style={{ paddingBottom: `calc(var(--sab) + ${buyMode !== 'none' ? 88 : 28}px)` }}>
            <div className="flex justify-end px-4">
              <button onClick={() => { haptic.select(); setAddOpen(true); }} aria-label="情報を追加・修正"
                className="pressable shadow-float pointer-events-auto w-[52px] h-[52px] rounded-full flex items-center justify-center gap-px"
                style={{ backgroundColor: 'var(--bg-primary)', boxShadow: 'inset 0 0 0 0.5px var(--separator)' }}>
                <Plus size={16} strokeWidth={3.2} style={{ color: 'var(--accent-color)' }} className="-mt-2" />
                <span className="text-[24px] font-extrabold leading-none -mt-0.5">α</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {getAppOpen && <GetAppSheet eventId={event.id} onClose={() => setGetAppOpen(false)} />}

      {addOpen && (
        <AddInfoSheet
          event={eff}
          onClose={() => setAddOpen(false)}
          onSaveEdit={onSaveEdit}
          onAddLink={addLink}
          onAddStock={addStock}
          onAddNote={addNote}
        />
      )}

      {viewingUserId && (
        <UserProfileModal
          userId={viewingUserId}
          workId={event.workId}
          workName={workName}
          onClose={() => setViewingUserId(null)}
          onBlocked={() => { setViewingUserId(null); goBack(); }}
        />
      )}
    </div>
  );
}

/** 「締切まで」「あと3日」→ 小さい見出しと、大きな数字（カレンダーのボードと同じ見せ方）。3日以内は締切の赤 */
function BigCountdown({ label, value }: { label: string; value: string }) {
  const m = value.match(/^あと(約)?(\d+)(.*)$/);
  const soon = m ? !m[1] && Number(m[2]) <= 3 && m[3] === '日' : /^本日/.test(value);
  const ink = soon ? MARKS['〆'].color : 'var(--label-primary)';
  return (
    <div className="min-w-0" style={{ color: ink }}>
      {label && <div className="text-[12px] font-bold" style={{ color: soon ? ink : 'var(--label-secondary)' }}>{label}</div>}
      {m ? (
        <div className="flex items-baseline mt-0.5">
          <span className="text-[13px] font-extrabold mr-0.5">あと{m[1] ?? ''}</span>
          <span className="num text-[46px] font-extrabold leading-[0.9]">{m[2]}</span>
          <span className="text-[15px] font-extrabold ml-0.5">{m[3]}</span>
        </div>
      ) : <div className="text-[26px] font-extrabold leading-tight">{value}</div>}
    </div>
  );
}

/** 表の頭の印（〆受発・イベント）。日付が無い行は空けておく */
function MarkBox({ mark }: { mark: Mark | null }) {
  if (!mark) return <span className="w-[18px] flex-shrink-0" />;
  const k = MARKS[mark];
  return (
    <b className="inline-flex items-center justify-center w-[18px] h-[18px] rounded-[5px] text-[11px] flex-shrink-0"
      style={{ backgroundColor: k.color, color: k.ink }}>{mark}</b>
  );
}

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];
/** 「11/20（金）」。今年でなければ年を頭に付ける */
function mdw(s: string, today: string): string {
  const y = s.slice(0, 4) !== today.slice(0, 4) ? `${s.slice(0, 4)}/` : '';
  return `${y}${Number(s.slice(5, 7))}/${Number(s.slice(8, 10))}（${WEEKDAYS[new Date(s + 'T00:00:00').getDay()]}）`;
}

type DateRow = { mark: Mark | null; label: string; value: string; time?: string; num: boolean; past: boolean; main?: boolean };

/** 詳細の日付の表。予約の始まり（受）・締切（〆）・発売（発）／開催（イ）を1行ずつ */
function dateRows(e: CalendarEvent, goods: boolean, today: string): DateRow[] {
  const rows: DateRow[] = [];
  if (e.preorderStart) rows.push({ mark: '受', label: goods ? '予約開始' : '受付開始', value: mdw(e.preorderStart, today), time: e.preorderStartTime ?? undefined, num: true, past: e.preorderStart < today });
  if (e.preorderEnd) rows.push({ mark: '〆', label: goods ? '予約締切' : '受付締切', value: mdw(e.preorderEnd, today), time: e.preorderEndTime ?? undefined, num: true, past: e.preorderEnd < today });
  const mark: Mark = goods ? '発' : 'イ';
  const label = goods ? '発売' : '開催';
  if (e.dateLabel) {
    // 曖昧日付（11月下旬・春頃など）は詳細の一覧と同じ書き方（itemDateLines）
    const l = itemDateLines(e).find((x) => x.startsWith(`${label} `));
    rows.push({ mark, label, value: l ? l.slice(label.length + 1) : '未定', num: false, past: false, main: true });
  } else if (e.date) {
    const end = e.endDate && e.endDate !== e.date ? e.endDate : null;
    const time = e.time ? `${e.time}${e.endTime ? `〜${e.endTime}` : ''}` : undefined;
    rows.push({ mark, label, value: `${mdw(e.date, today)}${end ? `〜${mdw(end, today)}` : ''}`, time, num: true, past: (end ?? e.date) < today, main: true });
  } else {
    rows.push({ mark: null, label: goods ? '発売日' : '日付', value: '未定', num: false, past: false, main: true });
  }
  return rows;
}

/** ソースの見出し。Xのポストは「Xのポスト」、それ以外はドメインで出す */
function sourceLabel(url: string): string {
  try {
    const h = new URL(url).host.replace(/^www\./, '');
    if (/(^|\.)(x\.com|twitter\.com|t\.co)$/.test(h)) return 'Xのポスト';
    return h;
  } catch { return url; }
}

type DetailTab = 'detail' | 'links' | 'stock' | 'contributors';
const TABS: { key: DetailTab; label: string }[] = [
  { key: 'detail', label: '詳細' },
  { key: 'links', label: 'リンク' },
  { key: 'stock', label: '在庫情報' },
  { key: 'contributors', label: 'Contributors' },
];

/** 詳細の下半分の切り替え。探すの上部と同じ（太い字・選んでいるものだけ黒い下線） */
function DetailTabs({ tab, onChange }: { tab: DetailTab; onChange: (t: DetailTab) => void }) {
  return (
    <div className="mt-7 flex items-end gap-5" role="tablist" style={{ borderBottom: '0.5px solid var(--separator)' }}>
      {TABS.map((t) => (
        <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => onChange(t.key)}
          className="pressable relative pb-2 pt-1 text-[15px] font-extrabold whitespace-nowrap"
          style={{ color: tab === t.key ? 'var(--label-primary)' : 'var(--label-tertiary)' }}>
          {t.label}
          {tab === t.key && <span className="absolute inset-x-0 -bottom-px h-[2.5px] rounded-full" style={{ backgroundColor: 'var(--label-primary)' }} />}
        </button>
      ))}
    </div>
  );
}

/** Contributors: 先頭に投稿者、続けて情報を足した人（多い順）。名前を押すとプロフィール */
function Contributors({ authorId, authorName, others, onOpen }: {
  authorId: string | null; authorName: string | null; others: string[]; onOpen: (id: string) => void;
}) {
  const [names, setNames] = useState<Record<string, string>>({});
  useEffect(() => {
    let alive = true;
    others.slice(0, 20).forEach((id) => {
      getDisplayName(id).then((n) => alive && setNames((p) => ({ ...p, [id]: n ?? ANON_NAME }))).catch(() => {});
    });
    return () => { alive = false; };
  }, [others.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps
  const row = (id: string | null, name: string, role: string) => (
    <button key={id ?? 'author'} disabled={!id} onClick={() => id && onOpen(id)}
      className="pressable w-full flex items-center gap-2 min-h-[48px] py-2 text-left" style={{ borderBottom: '0.5px solid var(--separator)' }}>
      <span className="text-[14px] font-semibold flex-1 min-w-0 flex items-center gap-1"><span className="truncate">{name}</span>{isOfficialUser(id) && <OfficialBadge />}</span>
      <span className="text-[11px] text-label-tertiary flex-shrink-0">{role}</span>
    </button>
  );
  return (
    <div className="mt-1">
      {row(authorId, authorName ?? ANON_NAME, '投稿')}
      {others.slice(0, 20).map((id) => row(id, names[id] ?? '…', '情報を追加'))}
      {others.length === 0 && <p className="text-[12px] text-label-tertiary mt-3">ほかに情報を足した人はまだいません</p>}
    </div>
  );
}

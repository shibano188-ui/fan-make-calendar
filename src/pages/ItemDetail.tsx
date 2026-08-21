import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Heart, CalendarPlus, ShoppingCart, ExternalLink, CalendarDays, Package, MapPin, Pin, Smile, Share2, X } from 'lucide-react';
import type { CalendarEvent, EventVisit } from '../types';
import { getEventById, getWorkById, getDisplayName, toggleLike, setReaction, getReactionData, getCalendarAddData, toggleCalendarAdd, listOfferContribs, addOfferContrib, removeOfferContrib, listStockReports, addStockReport, removeStockReport, reportEvent, listEventEdits, addEventEdit, removeEventEdit, applyEdits, listAllParticipatedWorks, upsertParticipation, leaveCalendar, listEventVisits, addEventVisit, removeEventVisit, type OfferContrib, type StockReport, type EventEdit, type EventPatch } from '../lib/api';
import EventEditForm from '../components/item/EventEditForm';
import { addToCalendar } from '../lib/googleCalendar';
import { useToast } from '../components/ui/Toast';
import { parseImageUrls, parseCategories, getPrimaryCategoryColor, addSeenEventId, ANON_NAME } from '../lib/constants';
import { deriveStatus, deriveItemType, itemDateLines } from '../design/tokens';
import { resolveBuy, getOffers, buildOffer, offerUrl, primaryOffer, isSearchPageUrl } from '../lib/affiliate';
import { openBuyLink } from '../lib/dataLogs';
import { openExternal } from '../lib/openExternal';
import { REACTIONS } from '../lib/reactions';
import { useAuth } from '../contexts/AuthContext';
import { useHiddenContent } from '../hooks/useHiddenContent';
import { haptic } from '../lib/haptics';
import { likeEffect } from '../lib/likeEffect';
import { useLike, setLike, getLike } from '../lib/likeStore';
import StatusBadge from '../components/ui/StatusBadge';
import ImageCarousel from '../components/item/ImageCarousel';
import NotifyBell from '../components/item/NotifyBell';
import LineLoader from '../components/ui/LineLoader';
import UserProfileModal from '../components/UserProfileModal';
import { useConfirm } from '../components/ui/ConfirmDialog';
import { usePremium, canFollowMore, FREE_FOLLOW_LIMIT } from '../lib/premium';

// 外部カレンダー連携（Google/ics への追加）は一旦保留。再開時は true に戻す。
const EXTERNAL_CALENDAR_ENABLED = false;

function summarizePatch(p: EventPatch): string {
  const parts: string[] = [];
  if (p.removedOfferUrls?.length) parts.push(`購入リンクを取り消し（${p.removedOfferUrls.length}件）`);
  if ('date' in p) parts.push(`日付 ${p.date ? p.date.slice(5).replace('-', '/') : '未定'}`);
  if (p.endDate) parts.push(`〜${p.endDate.slice(5).replace('-', '/')}`);
  if (p.time) parts.push(p.time);
  if (p.isOrderMade) parts.push(`予約${p.preorderStart ? ` ${p.preorderStart.slice(5).replace('-', '/')}〜${p.preorderEnd ? p.preorderEnd.slice(5).replace('-', '/') : ''}` : ''}`);
  return parts.join(' ') || '変更';
}

export default function ItemDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { hideReportedEvent } = useHiddenContent(user?.id);
  const toast = useToast();

  const [ev, setEv] = useState<CalendarEvent | null | undefined>(undefined); // undefined=loading
  const [workName, setWorkName] = useState('');
  const [authorName, setAuthorName] = useState<string | null>(null);
  const [viewingUserId, setViewingUserId] = useState<string | null>(null);
  // タイルと共有するいいねストア。fallback は読み込んだ予定の値。
  const { liked, count: likeCount } = useLike(id ?? '', { liked: !!ev?.likedByMe, count: ev?.likes ?? 0 });
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [myReaction, setMyReaction] = useState<string | null>(null);
  const [calCount, setCalCount] = useState(0);
  const [calAdded, setCalAdded] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [contribs, setContribs] = useState<OfferContrib[]>([]);
  const [addUrl, setAddUrl] = useState('');
  const [addingLink, setAddingLink] = useState(false);
  // 「修正」パネルを開いている販路URL（同時に開くのはひとつだけ）と差し替え先の入力値
  const [fixingUrl, setFixingUrl] = useState<string | null>(null);
  const [replaceUrl, setReplaceUrl] = useState('');
  const [replacing, setReplacing] = useState(false);
  const [stockReports, setStockReports] = useState<StockReport[]>([]);
  const [stockInput, setStockInput] = useState('');
  const [addingStock, setAddingStock] = useState(false);
  const [reported, setReported] = useState(false);
  const confirm = useConfirm();
  const [edits, setEdits] = useState<EventEdit[]>([]);
  const [editing, setEditing] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const premium = usePremium();
  const [following, setFollowing] = useState(false);
  const [followCount, setFollowCount] = useState(0);
  const [visits, setVisits] = useState<EventVisit[]>([]);
  const [visitOpen, setVisitOpen] = useState(false);
  const [visitStart, setVisitStart] = useState('');
  const [visitEnd, setVisitEnd] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);

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
      const e = await getEventById(id, user?.id);
      if (!alive) return;
      setEv(e);
      if (!e) return;
      // まだ操作されていなければDBの値でストアを初期化（既存状態は保持）
      if (getLike(e.id) === undefined) setLike(e.id, { liked: !!e.likedByMe, count: e.likes ?? 0 });
      if (e.workId) getWorkById(e.workId).then((w) => alive && setWorkName(w?.name ?? ''));
      if (e.workId && user) listAllParticipatedWorks(user.id).then((ws) => { if (!alive) return; setFollowing(ws.some((w) => w.id === e.workId)); setFollowCount(ws.length); }).catch(() => {});
      if (e.authorId) getDisplayName(e.authorId).then((n) => alive && setAuthorName(n ?? ANON_NAME));
      addSeenEventId(id); // 閲覧済み＝新着判定から外す
      getReactionData(id, user?.id).then((r) => { if (alive) { setCounts(r.counts); setMyReaction(r.myReaction); } });
      getCalendarAddData(id, user?.id).then((c) => { if (alive) { setCalCount(c.count); setCalAdded(c.added); } });
      listOfferContribs(id).then((cs) => { if (alive) setContribs(cs); });
      listStockReports(id).then((rs) => { if (alive) setStockReports(rs); });
      listEventEdits(id).then((es) => { if (alive) setEdits(es); });
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
      <button onClick={() => navigate(-1)} className="pressable text-[14px]" style={{ color: 'var(--accent-text)' }}>戻る</button>
    </div>;
  }

  const event = ev;
  const eff = applyEdits(event, edits); // 編集パッチを重ねた実効値
  const type = deriveItemType(eff);
  const status = deriveStatus(eff);
  const images = parseImageUrls(event.imageUrl);
  let cats = parseCategories(event.category);
  if (cats.length > 1) cats = cats.filter((c) => c !== 'グッズ');
  const catColor = getPrimaryCategoryColor(event.category);
  const dateLines = itemDateLines(eff);
  const buy = resolveBuy(event);
  const buyMode = buy.mode;
  const buyUrl = buy.url;
  const retailer = buy.retailer;

  const onLike = async () => {
    haptic.select();
    if (!user) return;
    const prev = { liked, count: likeCount };
    setLike(event.id, { liked: !prev.liked, count: prev.count + (prev.liked ? -1 : 1) });
    try { const r = await toggleLike(event.id, user.id); setLike(event.id, { liked: r.liked, count: r.count }); }
    catch { setLike(event.id, prev); }
  };

  const onReact = async (t: string) => {
    haptic.select();
    if (!user) return;
    const next = myReaction === t ? null : t;
    // 楽観更新
    setCounts((c) => {
      const n = { ...c };
      if (myReaction) n[myReaction] = Math.max(0, (n[myReaction] ?? 1) - 1);
      if (next) n[next] = (n[next] ?? 0) + 1;
      return n;
    });
    setMyReaction(next);
    try { await setReaction(event.id, user.id, next); } catch { /* noop */ }
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
  // 「ここ行く！」: 期間内の日/期間を登録。登録時に自動でいいねし保存カレンダーに出す。
  const openVisitPicker = () => {
    haptic.select();
    setVisitStart(eff.date ?? '');
    setVisitEnd(eff.date ?? '');
    setVisitOpen(true);
  };
  const onAddVisit = async () => {
    if (!user || !visitStart) return;
    haptic.select();
    const end = visitEnd && visitEnd >= visitStart ? visitEnd : visitStart;
    const v = await addEventVisit(event.id, user.id, visitStart, end);
    if (v) {
      setVisits((vs) => [...vs, v].sort((a, b) => a.start.localeCompare(b.start)));
      if (!liked) setLike(event.id, { liked: true, count: likeCount + 1 }); // 自動いいね
      setVisitOpen(false);
      toast('行く日に追加しました');
    }
  };
  const onRemoveVisit = async (visitId: string) => {
    haptic.select();
    setVisits((vs) => vs.filter((v) => v.id !== visitId));
    await removeEventVisit(visitId).catch(() => {});
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
  const onShare = () => {
    haptic.select();
    const text = encodeURIComponent(event.title);
    const url = event.sourceUrl || event.link || '';
    void openExternal(`https://twitter.com/intent/tweet?text=${text}${url ? `&url=${encodeURIComponent(url)}` : ''}`);
  };
  const myReactionImg = REACTIONS.find((r) => r.type === myReaction)?.image;

  const onAddLink = async () => {
    const u = addUrl.trim();
    if (!u || !user || addingLink) return;
    setAddingLink(true);
    const c = await addOfferContrib(event.id, buildOffer(u), user.id);
    if (c) setContribs((prev) => [...prev, c]);
    setAddUrl(''); setAddingLink(false); haptic.select();
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
    const c = await addOfferContrib(event.id, buildOffer(u), user.id);
    if (!c) { setReplacing(false); toast('差し替えられませんでした'); return; }
    setContribs((prev) => [...prev, c]);
    const ed = await addEventEdit(event.id, { removedOfferUrls: [oldUrl] }, user.id);
    if (ed) setEdits((prev) => [...prev, ed]);
    setFixingUrl(null); setReplaceUrl(''); setReplacing(false); haptic.select();
    toast(ed ? '購入リンクを差し替えました' : '新しいリンクを追加しました（元のリンクは取り消せませんでした）');
  };
  const onAddStock = async () => {
    const n = stockInput.trim();
    if (!n || !user || addingStock) return;
    setAddingStock(true);
    const r = await addStockReport(event.id, n, user.id);
    if (r) setStockReports((prev) => [r, ...prev]);
    setStockInput(''); setAddingStock(false); haptic.select();
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
    navigate(-1);
  };
  const onSaveEdit = async (patch: EventPatch) => {
    if (!user) return;
    setEditing(false);
    const ed = await addEventEdit(event.id, patch, user.id);
    if (ed) setEdits((prev) => [...prev, ed]);
  };
  const onRevertEdit = async (eid: string) => {
    haptic.select();
    setEdits((prev) => prev.filter((e) => e.id !== eid));
    await removeEventEdit(eid);
  };

  return (
    <div ref={rootRef} className="min-h-screen flex flex-col" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <div className="mx-auto w-full max-w-app flex-1 flex flex-col">
        {/* ヘッダー */}
        <div className="sticky top-0 z-20 flex items-center px-2 py-2 material-bar scroll-edge" style={{ paddingTop: 'calc(var(--sat) + 8px)' }}>
          <button onClick={() => navigate(-1)} aria-label="戻る" className="pressable tap-44 p-2"><ArrowLeft size={22} /></button>
        </div>

        <div className={`flex-1 ${buyMode !== 'none' ? 'pb-28' : 'pb-10'}`}>
          <div className="relative">
            <ImageCarousel images={images} alt={event.title} />
            {EXTERNAL_CALENDAR_ENABLED && calCount > 0 && (
              <div className="absolute top-2 right-2 flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-medium"
                style={{ backgroundColor: 'rgba(0,0,0,0.6)', color: '#fff' }}>
                <CalendarPlus size={12} />
                {calCount}人が追加
              </div>
            )}
          </div>

          <div className="px-4 pt-3">
            {/* 作品・カテゴリ＋フォロー */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1.5 text-[12px] text-label-secondary">
                {workName && <span>{workName}</span>}
                {catColor && <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: catColor }} />}
                {cats.length > 0 && <span>{cats.join(' ・ ')}</span>}
              </div>
              {event.workId && (
                <button onClick={onFollow} className="pressable text-[11px] px-2.5 py-0.5 rounded-full font-medium"
                  style={following ? { backgroundColor: 'var(--fill-tertiary)', color: 'var(--label-secondary)' } : { backgroundColor: 'var(--accent-color)', color: 'var(--accent-on)' }}>
                  {following ? 'フォロー中' : '＋フォロー'}
                </button>
              )}
            </div>

            {/* タイトル */}
            <h1 className="text-[19px] font-bold leading-snug mt-1">{event.title}</h1>

            {/* 状態 */}
            <div className="mt-2"><StatusBadge status={status} type={type} size="md" /></div>

            {/* 価格（セット品バッジ＋取得日「M/D時点」で価格の誤解を防ぐ）
                代表は実効値(eff)から選ぶ。取り消されたリンクの価格・セット・取得日を出し続けると、
                「リンクが違うから取り消した」のに誤った価格が残ってしまう。 */}
            {(() => {
              const prim = primaryOffer(getOffers(eff));
              const price = prim?.price ?? event.price;
              if (price == null) return null;
              return (
                <div className="mt-2 flex items-baseline flex-wrap gap-2">
                  <span className="text-[22px] font-bold" style={{ color: 'var(--accent-text)' }}>¥{price.toLocaleString()}</span>
                  {prim?.isSet && <span className="text-[11px] font-bold text-label-secondary px-1.5 py-0.5 rounded" style={{ background: 'var(--fill-tertiary, rgba(120,120,128,0.12))' }}>セット</span>}
                  {prim?.fetchedAt && <span className="text-[11px] text-label-tertiary">{new Date(prim.fetchedAt).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })}時点</span>}
                </div>
              );
            })()}

            {/* 日程 */}
            <div className="mt-3 flex items-start gap-2">
              <CalendarDays size={16} className="text-label-secondary mt-0.5 flex-shrink-0" />
              <div className="text-[14px]">
                {dateLines.map((l, i) => <div key={i}>{l}</div>)}
              </div>
            </div>

            {/* 会場・地域 */}
            {(event.prefecture || event.locationDetail) && (
              <div className="mt-2 flex items-start gap-2">
                <MapPin size={16} className="text-label-secondary mt-0.5 flex-shrink-0" />
                <div className="text-[14px]">{[event.prefecture, event.locationDetail].filter(Boolean).join(' ')}</div>
              </div>
            )}

            {/* 行く日（期間イベントのみ）。登録すると自分のカレンダーはその日だけ表示する */}
            {type === 'event' && !!eff.endDate && eff.endDate !== eff.date && (
              <div className="mt-3">
                {visits.length > 0 && (
                  <div className="flex flex-col gap-1.5 mb-2">
                    {visits.map((v) => (
                      <div key={v.id} className="flex items-center justify-between rounded-[8px] px-3 py-1.5 text-[13px]" style={{ backgroundColor: 'var(--fill-tertiary)' }}>
                        <span>{v.start.slice(5).replace('-', '/')}{v.end !== v.start ? `〜${v.end.slice(5).replace('-', '/')}` : ''} に行く</span>
                        <button onClick={() => onRemoveVisit(v.id)} aria-label="削除" className="pressable tap-44 text-label-secondary"><X size={16} /></button>
                      </div>
                    ))}
                  </div>
                )}
                {!visitOpen ? (
                  <div className="flex items-center gap-2 flex-wrap">
                    <button onClick={openVisitPicker} className="pressable flex items-center gap-1.5 px-3 py-2 rounded-[10px] text-[13px] font-semibold" style={{ backgroundColor: 'var(--accent-color)', color: 'var(--accent-on)' }}>
                      <Pin size={15} /> {visits.length > 0 ? '別の日も追加' : 'ここ行く！'}
                    </button>
                    {visits.length === 0 && <span className="text-[11px] text-label-tertiary">登録した日だけカレンダーに表示</span>}
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2 text-[13px]">
                      <input type="date" value={visitStart} min={eff.date ?? undefined} max={eff.endDate} onChange={(e) => setVisitStart(e.target.value)} className="flex-1 rounded-[10px] px-3 py-2 outline-none" style={{ backgroundColor: 'var(--fill-tertiary)', color: 'var(--input-text)' }} />
                      <span className="text-label-secondary">〜</span>
                      <input type="date" value={visitEnd} min={visitStart || eff.date || undefined} max={eff.endDate} onChange={(e) => setVisitEnd(e.target.value)} className="flex-1 rounded-[10px] px-3 py-2 outline-none" style={{ backgroundColor: 'var(--fill-tertiary)', color: 'var(--input-text)' }} />
                    </div>
                    <div className="flex gap-2">
                      <button onClick={onAddVisit} disabled={!visitStart} className="pressable flex-1 py-2 rounded-[10px] text-[13px] font-semibold" style={{ backgroundColor: 'var(--accent-color)', color: 'var(--accent-on)' }}>追加</button>
                      <button onClick={() => setVisitOpen(false)} className="pressable px-4 py-2 rounded-[10px] text-[13px]" style={{ backgroundColor: 'var(--fill-tertiary)', color: 'var(--label-primary)' }}>キャンセル</button>
                    </div>
                    <p className="text-[11px] text-label-tertiary">単日なら開始だけでOK（終了は同じ日にできます）</p>
                  </div>
                )}
              </div>
            )}

            {/* 日時/予約の共同編集（即反映＋履歴で戻せる） */}
            {!editing ? (
              <button onClick={() => { haptic.select(); setEditing(true); }} className="pressable mt-2 text-[12px]" style={{ color: 'var(--accent-text)' }}>日時・予約を編集</button>
            ) : (
              <EventEditForm event={eff} onClose={() => setEditing(false)} onSave={onSaveEdit} />
            )}
            {edits.length > 0 && (
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

            {/* 在庫 */}
            {event.stockNote && (
              <div className="mt-2 flex items-start gap-2">
                <Package size={16} className="text-label-secondary mt-0.5 flex-shrink-0" />
                <div className="text-[14px]">{event.stockNote}</div>
              </div>
            )}

            {/* メモ */}
            {event.memo && <p className="text-[14px] text-label-secondary whitespace-pre-wrap mt-3">{event.memo}</p>}

            {/* 購入リンク（共同編集で追記可・発売に向けて増える） */}
            <div className="mt-4">
              <div className="text-[12px] text-label-secondary mb-1.5">購入リンク（広告を含みます）</div>
              <div className="flex flex-col gap-1.5">
                {getOffers(eff).map((o, i) => (
                  <div key={`b${i}`} className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2 rounded-[10px] px-3 py-2.5" style={{ backgroundColor: 'var(--fill-tertiary)' }}>
                    <a href={offerUrl(o)} target="_blank" rel="noopener nofollow" onClick={() => haptic.select()}
                      className="pressable flex-1 min-w-0 flex items-center justify-between gap-2">
                      {/* 検索ページは商品ページと区別する（商品が特定できず価格も在庫も出ないため） */}
                      <span className="text-[13px] truncate" style={o.inStock === false ? { opacity: 0.55 } : undefined}>
                        {o.retailer || 'リンク'}{o.shop ? `（${o.shop}）` : ''}{isSearchPageUrl(o.url) ? '（検索）' : ''}
                      </span>
                      <span className="flex items-center gap-1.5 flex-shrink-0">
                        {/* 在庫は「あり/なし」の2値だけ出す（販路ごとに粒度が違うので生の表記は使わない）。
                            未取得(undefined)のときは何も出さない＝Cronが更新するまで無表示 */}
                        {o.inStock !== undefined && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                            style={{ color: o.inStock ? 'var(--color-success)' : 'var(--color-destructive)', background: 'var(--fill-secondary, rgba(120,120,128,0.16))' }}>
                            {o.inStock ? '在庫あり' : '在庫なし'}
                          </span>
                        )}
                        {o.isSet && <span className="text-[10px] font-bold text-label-secondary px-1.5 py-0.5 rounded" style={{ background: 'var(--fill-secondary, rgba(120,120,128,0.16))' }}>セット</span>}
                        <span className="text-[13px] font-bold" style={{ color: 'var(--accent-text)' }}>{o.price ? `¥${o.price.toLocaleString()}` : '開く ↗'}</span>
                      </span>
                    </a>
                    {/* 入口は「修正」ひとつだけ。アイコンを2つ並べると tap-44 の44px判定が重なって
                        手前のボタンに食われるうえ、Xでは何が起きるか字で説明できない。
                        この機能の動機は「リンクがおかしいから消したい」なので、パネルの先頭は取り消し。 */}
                    {user && (
                      <button onClick={() => { haptic.select(); setReplaceUrl(''); setFixingUrl((prev) => (prev === o.url ? null : o.url)); }}
                        className="pressable flex-shrink-0 text-[11px] px-2 py-1.5 text-label-tertiary">{fixingUrl === o.url ? '閉じる' : '修正'}</button>
                    )}
                  </div>
                  {fixingUrl === o.url && (
                    <div className="flex flex-col gap-2 rounded-[10px] border border-subtle px-3 py-2.5" style={{ backgroundColor: 'var(--bg-secondary)' }}>
                      <button onClick={() => onRemoveOffer(o.url)} className="pressable text-left text-[13px] font-semibold" style={{ color: 'var(--color-destructive)' }}>このリンクを取り消す</button>
                      <div className="border-t border-subtle" />
                      <div className="flex gap-2">
                        <input value={replaceUrl} onChange={(e) => setReplaceUrl(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && onReplaceOffer(o.url)}
                          placeholder="正しいリンク（URL）" inputMode="url"
                          className="flex-1 rounded-[10px] px-3 py-2 text-[13px] outline-none" style={{ backgroundColor: 'var(--fill-tertiary)', color: 'var(--input-text)' }} />
                        <button onClick={() => onReplaceOffer(o.url)} disabled={!replaceUrl.trim() || replacing}
                          className="pressable px-3 rounded-[10px] text-[13px] font-semibold flex-shrink-0" style={{ backgroundColor: 'var(--accent-color)', color: 'var(--accent-on)' }}>差し替え</button>
                      </div>
                    </div>
                  )}
                  </div>
                ))}
                {contribs.map((c) => (
                  <div key={c.id} className="flex items-center gap-2 rounded-[10px] px-3 py-2.5" style={{ backgroundColor: 'var(--fill-tertiary)' }}>
                    <a href={offerUrl(c.offer)} target="_blank" rel="noopener nofollow" onClick={() => haptic.select()} className="pressable flex-1 min-w-0 flex items-center justify-between gap-2">
                      <span className="text-[13px] truncate">{c.offer.retailer || 'リンク'}{c.offer.shop ? `（${c.offer.shop}）` : ''}{isSearchPageUrl(c.offer.url) ? '（検索）' : ''}<span className="text-[10px] text-label-tertiary"> ・ユーザー追加</span></span>
                      <span className="text-[13px] font-bold flex-shrink-0" style={{ color: 'var(--accent-text)' }}>{c.offer.price ? `¥${c.offer.price.toLocaleString()}` : '開く ↗'}</span>
                    </a>
                    {user && c.createdBy === user.id && (
                      <button onClick={() => onRemoveContrib(c.id)} aria-label="削除" className="pressable tap-44 text-label-tertiary flex-shrink-0"><X size={15} /></button>
                    )}
                  </div>
                ))}
              </div>
              <div className="flex gap-2 mt-2">
                <input value={addUrl} onChange={(e) => setAddUrl(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && onAddLink()}
                  placeholder="購入リンクを追加（URL）" inputMode="url"
                  className="flex-1 rounded-[10px] px-3 py-2 text-[13px] outline-none" style={{ backgroundColor: 'var(--fill-tertiary)', color: 'var(--input-text)' }} />
                <button onClick={onAddLink} disabled={!addUrl.trim() || addingLink} className="pressable px-3 rounded-[10px] text-[13px] font-semibold flex-shrink-0" style={{ backgroundColor: 'var(--accent-color)', color: 'var(--accent-on)' }}>追加</button>
              </div>
            </div>

            {/* アクション: いいね・リアクション・カレンダー・共有 */}
            <div className="relative mt-5">
              {pickerOpen && (
                <>
                  <div className="fixed inset-0 z-0" onClick={() => setPickerOpen(false)} />
                  <div className="absolute bottom-full left-0 right-0 mb-2 z-10 rounded-[14px] border border-subtle p-2 flex flex-wrap gap-1.5 justify-center shadow-card" style={{ backgroundColor: 'var(--bg-secondary)' }}>
                    {REACTIONS.map((r) => {
                      const active = myReaction === r.type;
                      const n = counts[r.type] ?? 0;
                      return (
                        <button key={r.type} onClick={() => { onReact(r.type); setPickerOpen(false); }}
                          className="pressable flex items-center gap-1 px-2.5 py-1.5 rounded-full"
                          style={active ? { backgroundColor: 'var(--accent-color)', color: 'var(--accent-on)' } : { backgroundColor: 'var(--fill-tertiary)' }}>
                          <img src={r.image} alt={r.label} className="w-4 h-4" />
                          <span className="text-[12px]">{r.label.replace('！', '')}</span>
                          {n > 0 && <span className="text-[11px] opacity-70">{n}</span>}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
              <div className="flex items-center justify-around py-2 rounded-[12px] border border-subtle" style={{ backgroundColor: 'var(--bg-secondary)' }}>
                <button onClick={(e) => { if (!liked) likeEffect(e.currentTarget); onLike(); }} className="pressable flex flex-col items-center gap-0.5" aria-label="いいね">
                  <Heart size={22} fill={liked ? 'var(--accent-color)' : 'none'} style={{ color: liked ? 'var(--accent-color)' : 'var(--label-secondary)' }} />
                  <span className="text-[10px] text-label-tertiary leading-none">{likeCount > 0 ? likeCount : 'いいね'}</span>
                </button>
                <button onClick={() => { haptic.select(); setPickerOpen((v) => !v); }} className="pressable flex flex-col items-center gap-0.5" aria-label="リアクション">
                  {myReactionImg ? <img src={myReactionImg} alt="" className="w-[22px] h-[22px]" /> : <Smile size={22} className="text-label-secondary" />}
                  <span className="text-[10px] text-label-tertiary leading-none">リアクション</span>
                </button>
                {EXTERNAL_CALENDAR_ENABLED && (
                  <button onClick={onCalendar} className="pressable flex flex-col items-center gap-0.5" aria-label="カレンダーに追加">
                    <CalendarPlus size={22} style={{ color: calAdded ? 'var(--accent-color)' : 'var(--label-secondary)' }} />
                    <span className="text-[10px] text-label-tertiary leading-none">{calAdded ? '追加済み' : 'カレンダー'}</span>
                  </button>
                )}
                <NotifyBell event={eff} liked={liked} variant="labeled" />
                <button onClick={onShare} className="pressable flex flex-col items-center gap-0.5" aria-label="Xで共有">
                  <Share2 size={22} className="text-label-secondary" />
                  <span className="text-[10px] text-label-tertiary leading-none">共有</span>
                </button>
              </div>
            </div>

            {/* 在庫情報（共同編集・追記ログ） */}
            <div className="mt-4">
              <div className="text-[12px] text-label-secondary mb-1.5">在庫情報</div>
              {stockReports.length > 0 && (
                <div className="flex flex-col gap-1.5 mb-2">
                  {stockReports.map((r) => (
                    <div key={r.id} className="flex items-start gap-2 rounded-[10px] px-3 py-2" style={{ backgroundColor: 'var(--fill-tertiary)' }}>
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px]">{r.note}</div>
                        <div className="text-[10px] text-label-tertiary">{r.createdAt.slice(5, 10).replace('-', '/')}</div>
                      </div>
                      {user && r.createdBy === user.id && <button onClick={() => onRemoveStock(r.id)} aria-label="削除" className="pressable tap-44 text-label-tertiary flex-shrink-0"><X size={15} /></button>}
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <input value={stockInput} onChange={(e) => setStockInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && onAddStock()}
                  placeholder="在庫情報を追加（例: 池袋本店 残りわずか）"
                  className="flex-1 rounded-[10px] px-3 py-2 text-[13px] outline-none" style={{ backgroundColor: 'var(--fill-tertiary)', color: 'var(--input-text)' }} />
                <button onClick={onAddStock} disabled={!stockInput.trim() || addingStock} className="pressable px-3 rounded-[10px] text-[13px] font-semibold flex-shrink-0" style={{ backgroundColor: 'var(--accent-color)', color: 'var(--accent-on)' }}>追加</button>
              </div>
            </div>

            {/* 投稿者（タップでプロフィール表示） */}
            {authorName && (
              <div className="mt-4">
                {eff.authorId ? (
                  <button onClick={() => { haptic.select(); setViewingUserId(eff.authorId!); }}
                    className="pressable text-[12px] text-label-tertiary underline underline-offset-2 decoration-dotted">
                    投稿: {authorName}
                  </button>
                ) : (
                  <span className="text-[12px] text-label-tertiary">投稿: {authorName}</span>
                )}
              </div>
            )}

            {/* 通報（確認ダイアログあり） */}
            <div className="mt-3">
              <button onClick={onReport} disabled={reported} className="pressable text-[12px] text-label-tertiary">
                {reported ? '通報しました' : '通報する'}
              </button>
            </div>
          </div>
        </div>

        {/* 固定バー: 購入/公式リンク */}
        {buyMode !== 'none' && (
          <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-app border-t border-separator px-4 py-3"
            style={{ backgroundColor: 'color-mix(in srgb, var(--bg-primary) 92%, transparent)', backdropFilter: 'blur(20px)', paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)' }}>
            <button onClick={openBuy} className="pressable w-full py-3 rounded-[10px] font-semibold flex items-center justify-center gap-2"
              style={{ backgroundColor: 'var(--accent-color)', color: 'var(--accent-on)' }}>
              {buyMode === 'cart' ? <ShoppingCart size={18} /> : <ExternalLink size={18} />}
              {buyMode === 'cart' ? `購入する${retailer ? `（${retailer}）` : ''}` : '公式サイトを開く'}
            </button>
          </div>
        )}
      </div>

      {viewingUserId && (
        <UserProfileModal
          userId={viewingUserId}
          onClose={() => setViewingUserId(null)}
          onBlocked={() => { setViewingUserId(null); navigate(-1); }}
        />
      )}
    </div>
  );
}
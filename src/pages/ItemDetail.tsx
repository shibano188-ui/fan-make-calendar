import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Heart, CalendarPlus, ShoppingCart, ExternalLink, CalendarDays, Package, MapPin, Smile, Share2, X } from 'lucide-react';
import type { CalendarEvent } from '../types';
import { getEventById, getWorkById, getDisplayName, toggleLike, setReaction, getReactionData, getCalendarAddData, toggleCalendarAdd, listOfferContribs, addOfferContrib, removeOfferContrib, listStockReports, addStockReport, removeStockReport, reportEvent, listEventEdits, addEventEdit, removeEventEdit, applyEdits, listAllParticipatedWorks, upsertParticipation, leaveCalendar, type OfferContrib, type StockReport, type EventEdit, type EventPatch } from '../lib/api';
import EventEditForm from '../components/item/EventEditForm';
import { addToCalendar } from '../lib/googleCalendar';
import { useToast } from '../components/ui/Toast';
import { parseImageUrls, parseCategories, getPrimaryCategoryColor, addSeenEventId } from '../lib/constants';
import { deriveStatus, deriveItemType, itemDateLines } from '../design/tokens';
import { resolveBuy, getOffers, buildOffer } from '../lib/affiliate';
import { REACTIONS } from '../lib/reactions';
import { useAuth } from '../contexts/AuthContext';
import { haptic } from '../lib/haptics';
import { useLike, setLike, getLike } from '../lib/likeStore';
import StatusBadge from '../components/ui/StatusBadge';
import ImageCarousel from '../components/item/ImageCarousel';
import NotifyBell from '../components/item/NotifyBell';

// 外部カレンダー連携（Google/ics への追加）は一旦保留。再開時は true に戻す。
const EXTERNAL_CALENDAR_ENABLED = false;

function summarizePatch(p: EventPatch): string {
  const parts: string[] = [];
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
  const toast = useToast();

  const [ev, setEv] = useState<CalendarEvent | null | undefined>(undefined); // undefined=loading
  const [workName, setWorkName] = useState('');
  const [authorName, setAuthorName] = useState<string | null>(null);
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
  const [stockReports, setStockReports] = useState<StockReport[]>([]);
  const [stockInput, setStockInput] = useState('');
  const [addingStock, setAddingStock] = useState(false);
  const [reported, setReported] = useState(false);
  const [edits, setEdits] = useState<EventEdit[]>([]);
  const [editing, setEditing] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [following, setFollowing] = useState(false);
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
      if (e.workId && user) listAllParticipatedWorks(user.id).then((ws) => alive && setFollowing(ws.some((w) => w.id === e.workId))).catch(() => {});
      if (e.authorId) getDisplayName(e.authorId).then((n) => alive && setAuthorName(n));
      addSeenEventId(id); // 閲覧済み＝新着判定から外す
      getReactionData(id, user?.id).then((r) => { if (alive) { setCounts(r.counts); setMyReaction(r.myReaction); } });
      getCalendarAddData(id, user?.id).then((c) => { if (alive) { setCalCount(c.count); setCalAdded(c.added); } });
      listOfferContribs(id).then((cs) => { if (alive) setContribs(cs); });
      listStockReports(id).then((rs) => { if (alive) setStockReports(rs); });
      listEventEdits(id).then((es) => { if (alive) setEdits(es); });
    })();
    return () => { alive = false; };
  }, [id, user?.id]);

  if (ev === undefined) {
    return <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <div className="w-6 h-6 rounded-full border-2 animate-spin" style={{ borderColor: 'var(--label-tertiary)', borderTopColor: 'var(--label-primary)' }} />
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
  const onFollow = async () => {
    haptic.select();
    if (!user || !event.workId) return;
    const prev = following;
    setFollowing(!prev);
    try {
      if (prev) await leaveCalendar(event.workId, user.id);
      else await upsertParticipation(event.workId, user.id);
      toast(prev ? 'フォローを解除しました' : 'フォローしました');
    } catch { setFollowing(prev); }
  };
  const openBuy = () => { haptic.select(); if (buyUrl) window.open(buyUrl, '_blank', 'noopener'); };
  const onShare = () => {
    haptic.select();
    const text = encodeURIComponent(event.title);
    const url = event.sourceUrl || event.link || '';
    window.open(`https://twitter.com/intent/tweet?text=${text}${url ? `&url=${encodeURIComponent(url)}` : ''}`, '_blank', 'noopener');
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
    setReported(true);
    await reportEvent(event.id, user.id, 'user_report').catch(() => {});
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
        <div className="sticky top-0 z-20 flex items-center px-2 py-2" style={{ backgroundColor: 'color-mix(in srgb, var(--bg-primary) 88%, transparent)', backdropFilter: 'blur(20px)', paddingTop: 'calc(env(safe-area-inset-top) + 8px)' }}>
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

            {/* 価格 */}
            {event.price != null && (
              <div className="text-[22px] font-bold mt-2" style={{ color: 'var(--accent-text)' }}>¥{event.price.toLocaleString()}</div>
            )}

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
              <div className="text-[12px] text-label-secondary mb-1.5">購入リンク</div>
              <div className="flex flex-col gap-1.5">
                {getOffers(event).map((o, i) => (
                  <a key={`b${i}`} href={o.affiliateUrl || o.url} target="_blank" rel="noopener" onClick={() => haptic.select()}
                    className="pressable flex items-center justify-between gap-2 rounded-[10px] px-3 py-2.5" style={{ backgroundColor: 'var(--fill-tertiary)' }}>
                    <span className="text-[13px] truncate">{o.retailer || 'リンク'}{o.shop ? `（${o.shop}）` : ''}</span>
                    <span className="text-[13px] font-bold flex-shrink-0" style={{ color: 'var(--accent-text)' }}>{o.price ? `¥${o.price.toLocaleString()}` : '開く ↗'}</span>
                  </a>
                ))}
                {contribs.map((c) => (
                  <div key={c.id} className="flex items-center gap-2 rounded-[10px] px-3 py-2.5" style={{ backgroundColor: 'var(--fill-tertiary)' }}>
                    <a href={c.offer.affiliateUrl || c.offer.url} target="_blank" rel="noopener" onClick={() => haptic.select()} className="pressable flex-1 min-w-0 flex items-center justify-between gap-2">
                      <span className="text-[13px] truncate">{c.offer.retailer || 'リンク'}{c.offer.shop ? `（${c.offer.shop}）` : ''}<span className="text-[10px] text-label-tertiary"> ・ユーザー追加</span></span>
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
                <button onClick={onLike} className="pressable flex flex-col items-center gap-0.5" aria-label="いいね">
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

            {/* 投稿者 */}
            {authorName && <div className="text-[12px] text-label-tertiary mt-4">投稿: {authorName}</div>}

            {/* 通報 */}
            <button onClick={onReport} disabled={reported} className="pressable mt-4 text-[12px] text-label-tertiary">
              {reported ? '通報しました' : '通報する'}
            </button>
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
    </div>
  );
}

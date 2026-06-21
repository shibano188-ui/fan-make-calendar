import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Heart, CalendarPlus, ShoppingCart, ExternalLink, CalendarDays, Package, MapPin, Smile, Share2 } from 'lucide-react';
import type { CalendarEvent } from '../types';
import { getEventById, getWorkById, getDisplayName, toggleLike, setReaction, getReactionData, getCalendarAddData, toggleCalendarAdd } from '../lib/api';
import { parseImageUrls, parseCategories, getPrimaryCategoryColor } from '../lib/constants';
import { deriveStatus, deriveItemType, itemDateLines } from '../design/tokens';
import { resolveBuy } from '../lib/affiliate';
import { REACTIONS } from '../lib/reactions';
import { useAuth } from '../contexts/AuthContext';
import { haptic } from '../lib/haptics';
import StatusBadge from '../components/ui/StatusBadge';
import ImageCarousel from '../components/item/ImageCarousel';

export default function ItemDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [ev, setEv] = useState<CalendarEvent | null | undefined>(undefined); // undefined=loading
  const [workName, setWorkName] = useState('');
  const [authorName, setAuthorName] = useState<string | null>(null);
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [myReaction, setMyReaction] = useState<string | null>(null);
  const [calCount, setCalCount] = useState(0);
  const [calAdded, setCalAdded] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
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
      const e = await getEventById(id);
      if (!alive) return;
      setEv(e);
      if (!e) return;
      setLikeCount(e.likes ?? 0);
      if (e.workId) getWorkById(e.workId).then((w) => alive && setWorkName(w?.name ?? ''));
      if (e.authorId) getDisplayName(e.authorId).then((n) => alive && setAuthorName(n));
      getReactionData(id, user?.id).then((r) => { if (alive) { setCounts(r.counts); setMyReaction(r.myReaction); } });
      getCalendarAddData(id, user?.id).then((c) => { if (alive) { setCalCount(c.count); setCalAdded(c.added); } });
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
  const type = deriveItemType(event);
  const status = deriveStatus(event);
  const images = parseImageUrls(event.imageUrl);
  let cats = parseCategories(event.category);
  if (cats.length > 1) cats = cats.filter((c) => c !== 'グッズ');
  const catColor = getPrimaryCategoryColor(event.category);
  const dateLines = itemDateLines(event);
  const buy = resolveBuy(event);
  const buyMode = buy.mode;
  const buyUrl = buy.url;
  const retailer = buy.retailer;

  const onLike = async () => {
    haptic.select();
    if (!user) return;
    const prev = liked;
    setLiked(!prev); setLikeCount((c) => c + (prev ? -1 : 1));
    try { const r = await toggleLike(event.id, user.id); setLiked(r.liked); setLikeCount(r.count); } catch { setLiked(prev); }
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
    try { const r = await toggleCalendarAdd(event.id, user.id); setCalAdded(r.added); setCalCount(r.count); } catch { setCalAdded(prev); }
  };
  const openBuy = () => { haptic.select(); if (buyUrl) window.open(buyUrl, '_blank', 'noopener'); };
  const onShare = () => {
    haptic.select();
    const text = encodeURIComponent(event.title);
    const url = event.sourceUrl || event.link || '';
    window.open(`https://twitter.com/intent/tweet?text=${text}${url ? `&url=${encodeURIComponent(url)}` : ''}`, '_blank', 'noopener');
  };
  const myReactionImg = REACTIONS.find((r) => r.type === myReaction)?.image;

  return (
    <div ref={rootRef} className="min-h-screen flex flex-col" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <div className="mx-auto w-full max-w-app flex-1 flex flex-col">
        {/* ヘッダー */}
        <div className="sticky top-0 z-20 flex items-center px-2 py-2" style={{ backgroundColor: 'color-mix(in srgb, var(--bg-primary) 88%, transparent)', backdropFilter: 'blur(20px)' }}>
          <button onClick={() => navigate(-1)} aria-label="戻る" className="pressable tap-44 p-2"><ArrowLeft size={22} /></button>
        </div>

        <div className={`flex-1 ${buyMode !== 'none' ? 'pb-28' : 'pb-10'}`}>
          <div className="relative">
            <ImageCarousel images={images} alt={event.title} />
            {calCount > 0 && (
              <div className="absolute top-2 right-2 flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-medium"
                style={{ backgroundColor: 'rgba(0,0,0,0.6)', color: '#fff' }}>
                <CalendarPlus size={12} />
                {calCount}人が追加
              </div>
            )}
          </div>

          <div className="px-4 pt-3">
            {/* 作品・カテゴリ */}
            <div className="flex items-center gap-1.5 text-[12px] text-label-secondary flex-wrap">
              {workName && <span>{workName}</span>}
              {catColor && <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: catColor }} />}
              {cats.length > 0 && <span>{cats.join(' ・ ')}</span>}
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

            {/* 在庫 */}
            {event.stockNote && (
              <div className="mt-2 flex items-start gap-2">
                <Package size={16} className="text-label-secondary mt-0.5 flex-shrink-0" />
                <div className="text-[14px]">{event.stockNote}</div>
              </div>
            )}

            {/* メモ */}
            {event.memo && <p className="text-[14px] text-label-secondary whitespace-pre-wrap mt-3">{event.memo}</p>}

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
                <button onClick={onCalendar} className="pressable flex flex-col items-center gap-0.5" aria-label="カレンダーに追加">
                  <CalendarPlus size={22} style={{ color: calAdded ? 'var(--accent-color)' : 'var(--label-secondary)' }} />
                  <span className="text-[10px] text-label-tertiary leading-none">{calAdded ? '追加済み' : 'カレンダー'}</span>
                </button>
                <button onClick={onShare} className="pressable flex flex-col items-center gap-0.5" aria-label="Xで共有">
                  <Share2 size={22} className="text-label-secondary" />
                  <span className="text-[10px] text-label-tertiary leading-none">共有</span>
                </button>
              </div>
            </div>

            {/* 投稿者 */}
            {authorName && <div className="text-[12px] text-label-tertiary mt-4">投稿: {authorName}</div>}
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

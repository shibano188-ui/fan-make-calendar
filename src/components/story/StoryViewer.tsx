import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Heart, Share2, ChevronRight, ChevronLeft, ImageOff, BellRing } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useFeature, isPreorderSoon } from '../../lib/premium';
import { FEATURE_PREMIUM } from '../../lib/constants';
import { todayStr } from '../../design/tokens';
import PromoLine from '../ui/PromoLine';
import type { CalendarEvent } from '../../types';
import type { StoryGroup } from '../../lib/story';
import { deriveStatus, deriveItemType, itemDateLines } from '../../design/tokens';
import { parseImageUrls } from '../../lib/constants';
import { optimizedImage } from '../../lib/image';
import { getOffers, primaryOffer, priceRange, isStockStale } from '../../lib/affiliate';
import { useLike, setLike } from '../../lib/likeStore';
import { likeEffect } from '../../lib/likeEffect';
import { shareToX } from '../../lib/share';
import { haptic } from '../../lib/haptics';
import { setStoryAdsSuppressed } from '../../lib/adSuppress';
import StatusBadge from '../ui/StatusBadge';
import OptImg from '../ui/OptImg';
import ReactionButton from '../item/ReactionButton';
import NotifyBell from '../item/NotifyBell';
import WorkBadge from './WorkBadge';
import { useBackToClose } from '../../lib/backStack';

// ホームのストーリー（2026-10-04 柴野）。詳細ページをもとに、1画面で読めるようにしたもの。
// 5秒で次へ進む（画像を読み終えてから数え始める）。押している間は止まる（2026-10-04 柴野「自動で進めよう」）。
// 左3分の1＝前へ・右3分の2＝次へ・下へスワイプ＝閉じる。作品を見終えたら次の作品へ。最後まで見たら閉じる。

export type StoryPosition = { group: number; page: number };

/** 1件を見せる長さ */
const PAGE_MS = 5000;
/** これより長く押したら「止めて見る」。指を離しても次へは進めない */
const HOLD_MS = 250;

function timeAgo(iso?: string): string {
  if (!iso) return '';
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return 'たった今';
  if (m < 60) return `${m}分前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}時間前`;
  const d = Math.floor(h / 24);
  return d < 30 ? `${d}日前` : new Date(iso).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' });
}

/** 在庫の一行。「在庫あり 3店」「どこも売り切れ」。店の情報が無い予定は出さない */
function stockLine(e: CalendarEvent): { text: string; out: boolean } | null {
  const offers = getOffers(e).filter((o) => typeof o.inStock === 'boolean' && !isStockStale(e, o));
  if (!offers.length) return null;
  const inStock = offers.filter((o) => o.inStock).length;
  return inStock > 0 ? { text: `在庫あり ${inStock}店`, out: false } : { text: 'どこも売り切れ', out: true };
}

export default function StoryViewer({ groups, initial, onClose, onSeen, onOpenDetail, onLike }: {
  groups: StoryGroup[];
  initial: StoryPosition;
  onClose: () => void;
  onSeen: (e: CalendarEvent) => void;
  /** 詳細へ。戻ってきたときに続きから開けるよう、今の位置も渡す */
  onOpenDetail: (e: CalendarEvent, pos: StoryPosition, tab?: 'stock') => void;
  onLike: (e: CalendarEvent) => Promise<{ liked: boolean; count: number } | void>;
}) {
  const [pos, setPos] = useState<StoryPosition>(initial);
  const navigate = useNavigate();
  // Android の戻るで閉じる（前はアプリごと終わっていた）
  useBackToClose(true, onClose);
  const instantAlerts = useFeature('instantAlerts');
  // 押した側に矢印を一瞬出す（戻ったのか進んだのか分かるように）
  const [flash, setFlash] = useState<{ side: 'prev' | 'next'; n: number } | null>(null);
  const flashSide = (side: 'prev' | 'next') => setFlash((f) => ({ side, n: (f?.n ?? 0) + 1 }));
  useEffect(() => { if (!flash) return; const t = setTimeout(() => setFlash(null), 350); return () => clearTimeout(t); }, [flash]);
  const group = groups[pos.group];
  const page = group?.pages[pos.page];

  // 開いている間はバナーを伏せ、下の画面がスクロールしないようにする
  useEffect(() => {
    setStoryAdsSuppressed(true);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { setStoryAdsSuppressed(false); document.body.style.overflow = prev; };
  }, []);

  useEffect(() => { if (page) onSeen(page.event); }, [page?.event.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // 画像を読み終えてから数え始める（読み込み中に進むと、画像を見ないまま次へ行ってしまう）
  // 予定ごとに覚える（表示したあとで「まだ」に戻すと、キャッシュ済みの画像は先に読み終わっていて止まったままになる）
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const loaded = !page || !parseImageUrls(page.event.imageUrl)[0] || loadedId === page.event.id;
  const setLoaded = () => { if (page) setLoadedId(page.event.id); };
  // 押している間・アプリが裏に回っている間は止める
  const [holding, setHolding] = useState(false);
  const [hidden, setHidden] = useState(document.hidden);
  useEffect(() => {
    const on = () => setHidden(document.hidden);
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, []);
  const paused = holding || hidden || !loaded;
  // 次の予定の画像を先に読んでおく（めくった瞬間に出るように）
  useEffect(() => {
    const following = group?.pages[pos.page + 1]?.event ?? groups[pos.group + 1]?.pages[groups[pos.group + 1]?.start ?? 0]?.event;
    const src = parseImageUrls(following?.imageUrl)[0];
    if (src) { const im = new Image(); im.src = optimizedImage(src, 828); }
  }, [pos.group, pos.page]); // eslint-disable-line react-hooks/exhaustive-deps

  /** byTap: 押してめくったときだけ振動させる（5秒ごとに鳴るとうるさい） */
  const next = (byTap = true) => {
    if (!group) return onClose();
    if (byTap) { haptic.select(); flashSide('next'); }
    if (pos.page < group.pages.length - 1) return setPos({ group: pos.group, page: pos.page + 1 });
    // 次の作品へ（中身のある作品だけ）。最後まで見たら閉じる
    for (let g = pos.group + 1; g < groups.length; g++) {
      if (groups[g].pages.length) return setPos({ group: g, page: groups[g].start });
    }
    onClose();
  };
  const prev = () => {
    haptic.select();
    flashSide('prev');
    if (pos.page > 0) return setPos({ group: pos.group, page: pos.page - 1 });
    for (let g = pos.group - 1; g >= 0; g--) {
      if (groups[g].pages.length) return setPos({ group: g, page: groups[g].pages.length - 1 });
    }
  };

  // 押した位置で前後を決める。ボタン・リンクを押したときはめくらない。長押し（止めて見た）のあとはめくらない
  const pressAt = useRef(0);
  const onPointerDown = (ev: React.PointerEvent) => {
    if ((ev.target as HTMLElement).closest('button, a, [role="button"]')) return;
    pressAt.current = Date.now();
    setHolding(true);
  };
  const onPointerUp = () => setHolding(false);
  const onTap = (ev: React.MouseEvent) => {
    if ((ev.target as HTMLElement).closest('button, a, [role="button"]')) return;
    if (Date.now() - pressAt.current > HOLD_MS) return;
    const x = ev.clientX / window.innerWidth;
    if (x < 1 / 3) prev(); else next();
  };
  // 下へスワイプで閉じる
  const touchY = useRef<number | null>(null);
  const onTouchStart = (ev: React.TouchEvent) => { touchY.current = ev.touches[0].clientY; };
  const onTouchEnd = (ev: React.TouchEvent) => {
    if (touchY.current != null && ev.changedTouches[0].clientY - touchY.current > 90) onClose();
    touchY.current = null;
  };

  if (!group || !page) return null;
  const e = page.event;
  const type = deriveItemType(e);
  const img = parseImageUrls(e.imageUrl)[0];
  const range = priceRange(getOffers(e));
  const price = range ? `¥${range.min.toLocaleString()}〜` : e.price != null ? `¥${e.price.toLocaleString()}` : null;
  const stock = stockLine(e);
  const hasShop = !!primaryOffer(getOffers(e));

  // 下のタブ（z-[100]）より上に出す。親の重なり順に左右されないよう body の直下に描く
  return createPortal(
    <div className="fixed inset-0 z-[110] flex flex-col select-none" style={{ backgroundColor: 'var(--bg-primary)' }}
      onClick={onTap} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}
      onPointerDown={onPointerDown} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onPointerLeave={onPointerUp}>
      <style>{'@keyframes story-fill { from { width: 0% } to { width: 100% } } @keyframes story-flash { from { opacity: 0.9 } to { opacity: 0 } }'}</style>
      {flash && (
        <span key={flash.n} className="fixed top-1/2 -translate-y-1/2 z-[1] w-14 h-14 rounded-full flex items-center justify-center pointer-events-none"
          style={{ [flash.side === 'prev' ? 'left' : 'right']: 12, backgroundColor: 'rgba(0,0,0,0.45)', color: '#fff', animation: 'story-flash 0.35s ease-out forwards' }}>
          {flash.side === 'prev' ? <ChevronLeft size={32} /> : <ChevronRight size={32} />}
        </span>
      )}
      <div className="mx-auto w-full max-w-app flex-1 flex flex-col min-h-0" style={{ paddingTop: 'calc(var(--sat) + 8px)' }}>
        {/* 進み具合（1本＝1予定）。今の1本が5秒で埋まり、埋まったら次へ。
            多すぎると線が見えないので、21件からは今の1件の線だけにする。
            何件目かは常に大きく出す（戻ったのか進んだのか分かりにくかった） */}
        <div className="flex items-center gap-2 px-3">
          {group.pages.length <= 20 ? (
            <div className="flex-1 flex gap-1">
              {group.pages.map((p, i) => (
                <span key={p.event.id} className="flex-1 h-[3px] rounded-full overflow-hidden" style={{ backgroundColor: 'var(--fill-secondary, rgba(120,120,128,0.24))' }}>
                  {i < pos.page && <span className="block h-full w-full" style={{ backgroundColor: 'var(--label-primary)' }} />}
                  {i === pos.page && <ProgressFill key={`${pos.group}-${pos.page}`} paused={paused} onDone={() => next(false)} />}
                </span>
              ))}
            </div>
          ) : (
            <span className="flex-1 h-[3px] rounded-full overflow-hidden" style={{ backgroundColor: 'var(--fill-secondary, rgba(120,120,128,0.24))' }}>
              <ProgressFill key={`${pos.group}-${pos.page}`} paused={paused} onDone={() => next(false)} />
            </span>
          )}
          <span className="flex-shrink-0 px-2 py-0.5 rounded-full text-[14px] font-bold tabular-nums" style={{ backgroundColor: 'var(--fill-tertiary)' }}>
            {pos.page + 1}<span className="text-label-tertiary font-semibold"> / {group.pages.length}</span>
          </span>
        </div>
        <div className="flex items-center gap-2 px-3 pt-2.5 pb-2">
          <WorkBadge title={group.title} color={group.color} image={group.image} size={32} />
          <span className="text-[14px] font-semibold truncate">{group.title}</span>
          <span className="text-[12px] text-label-tertiary flex-shrink-0">{timeAgo(e.createdAt)}</span>
          <button onClick={onClose} aria-label="閉じる" className="pressable tap-44 ml-auto p-1"><X size={24} /></button>
        </div>

        <div className="flex-1 min-h-0 overflow-hidden px-4 flex flex-col">
          {/* なぜ出ているか（締切まであと2日・今週発売・人気・新着）を画像の上に大きく */}
          {(page.badge || (group.key === 'week' && e.workName)) && (
            <div className="flex items-center gap-2 mb-2 min-w-0">
              {page.badge && (
                <span className="flex-shrink-0 text-[15px] font-bold rounded-full px-3 py-1"
                  style={page.badge === '新着'
                    ? { backgroundColor: 'var(--color-destructive)', color: '#fff' }
                    : { backgroundColor: 'var(--accent-color)', color: 'var(--accent-on)' }}>
                  {page.badge}
                </span>
              )}
              {group.key === 'week' && e.workName && <span className="text-[13px] text-label-secondary truncate">{e.workName}</span>}
            </div>
          )}
          {/* 予定ごとに作り直す。同じ img を使い回すと、次の画像を読み終えるまで前の予定の画像が出たままになる */}
          <div key={e.id} className="w-full rounded-[12px] overflow-hidden bg-fill-3 flex items-center justify-center flex-shrink-0" style={{ height: '36vh' }}>
            {img
              ? <OptImg src={img} w={828} alt={e.title} className="w-full h-full object-contain"
                  style={{ opacity: loaded ? 1 : 0, transition: 'opacity 0.15s' }}
                  onLoad={setLoaded} onError={setLoaded} />
              : <ImageOff size={32} className="text-label-tertiary" />}
          </div>
          <div className="mt-3 flex items-center gap-1.5 flex-wrap">
            <StatusBadge status={deriveStatus(e)} type={type} />
          </div>
          <div className="mt-1.5 text-[18px] font-bold leading-snug line-clamp-3">{e.title}</div>
          <div className="mt-1 text-[13px] text-label-secondary">{itemDateLines(e).join(' / ')}</div>
          {price && <div className="mt-1 text-[20px] font-bold" style={{ color: 'var(--accent-text)' }}>{price}</div>}
          {stock && (
            <button onClick={() => { haptic.select(); onOpenDetail(e, pos, 'stock'); }}
              className="pressable self-start mt-1 flex items-center gap-0.5 text-[13px] font-semibold"
              style={{ color: stock.out ? 'var(--color-destructive)' : 'var(--label-primary)' }}>
              {stock.text}<ChevronRight size={15} className="text-label-tertiary" />
            </button>
          )}
          {/* 受付開始の即時通知の案内（無料の人・予約受付がこれから始まるグッズだけ）。押したら閉じて課金の案内へ */}
          {FEATURE_PREMIUM && !instantAlerts && isPreorderSoon({ type, preorderStart: e.preorderStart }, todayStr()) && (
            <PromoLine className="mt-2" icon={<BellRing size={15} />} text="予約受付が始まった瞬間に通知" badge="プレミアム"
              onClick={() => { onClose(); navigate('/premium'); }} />
          )}
          {!stock && hasShop && (
            <button onClick={() => { haptic.select(); onOpenDetail(e, pos, 'stock'); }}
              className="pressable self-start mt-1 flex items-center gap-0.5 text-[13px] text-label-secondary">
              買えるお店を見る<ChevronRight size={15} className="text-label-tertiary" />
            </button>
          )}
        </div>

        <div className="px-4 pt-2" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 14px)' }}>
          <StoryActions event={e} onLike={() => onLike(e)} />
          <button onClick={() => { haptic.select(); onOpenDetail(e, pos); }}
            className="pressable w-full mt-3 py-3 rounded-full text-[15px] font-semibold"
            style={{ backgroundColor: 'var(--accent-color)', color: 'var(--accent-on)' }}>
            詳細を見る
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** 今の1件の進み具合。CSS のアニメーションで埋め、止めるときは animation-play-state で止める */
function ProgressFill({ paused, onDone }: { paused: boolean; onDone: () => void }) {
  return (
    <span className="block h-full" onAnimationEnd={onDone}
      style={{ backgroundColor: 'var(--label-primary)', animation: `story-fill ${PAGE_MS}ms linear forwards`, animationPlayState: paused ? 'paused' : 'running' }} />
  );
}

/** 詳細ページと同じ操作の列（いいね・リアクション・通知・共有）。いいねで FanHive のカレンダーに入る */
function StoryActions({ event, onLike }: { event: CalendarEvent; onLike: () => Promise<{ liked: boolean; count: number } | void> }) {
  const { liked, count } = useLike(event.id, { liked: !!event.likedByMe, count: event.likes ?? 0 });
  const like = async (el?: HTMLElement) => {
    const prev = { liked, count };
    if (!liked && el) likeEffect(el);
    setLike(event.id, { liked: !prev.liked, count: prev.count + (prev.liked ? -1 : 1) });
    try { const r = await onLike(); if (r && typeof r === 'object') setLike(event.id, r); }
    catch { setLike(event.id, prev); }
  };
  return (
    <div className="flex items-center justify-around py-2 rounded-[12px] border border-subtle" style={{ backgroundColor: 'var(--bg-secondary)' }}>
      <button onClick={(ev) => { haptic.select(); void like(ev.currentTarget); }} className="pressable flex flex-col items-center gap-0.5" aria-label="いいね">
        <Heart size={22} fill={liked ? 'var(--accent-color)' : 'none'} style={{ color: liked ? 'var(--accent-color)' : 'var(--label-secondary)' }} />
        <span className="text-[10px] text-label-tertiary leading-none">{count > 0 ? count : 'いいね'}</span>
      </button>
      <ReactionButton eventId={event.id} size={22} variant="labeled" />
      <NotifyBell event={event} liked={liked} onSave={() => void like()} variant="labeled" />
      <button onClick={() => { haptic.select(); shareToX(event, event.workName); }} className="pressable flex flex-col items-center gap-0.5" aria-label="Xで共有">
        <Share2 size={22} className="text-label-secondary" />
        <span className="text-[10px] text-label-tertiary leading-none">共有</span>
      </button>
    </div>
  );
}

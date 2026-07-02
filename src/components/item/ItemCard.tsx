import { useState } from 'react';
import { Heart, ShoppingCart, ExternalLink, ImageOff } from 'lucide-react';
import type { CalendarEvent } from '../../types';
import { useLike, setLike } from '../../lib/likeStore';
import { deriveStatus, deriveItemType, itemDateLines } from '../../design/tokens';
import { parseCategories, getPrimaryCategoryColor, parseImageUrls } from '../../lib/constants';
import { resolveBuy, type BuyMode } from '../../lib/affiliate';
import StatusBadge from '../ui/StatusBadge';
import ReactionButton from './ReactionButton';
import NotifyBell from './NotifyBell';

interface Props {
  event: CalendarEvent;
  layout?: 'grid' | 'list';
  isNew?: boolean;
  likedInit?: boolean;
  /** 作品ごとの色。カード左端の縦バーで示す。未指定なら表示しない。 */
  workColor?: string;
  onOpen?: () => void;
  onLike?: () => void | Promise<{ liked: boolean; count: number } | void>;
  onCalendar?: () => void;
  onBuy?: () => void;
}

function yen(n?: number): string {
  return n != null ? `¥${n.toLocaleString()}` : '';
}

const SEASON_KANJI: Record<string, string> = { 春頃: '春', 夏頃: '夏', 秋頃: '秋', 冬頃: '冬' };

// 日めくりバッジの上段(月)・下段(日 or ラベル)を決める。予約日を最優先。
function badgeDate(e: CalendarEvent): { top: string; bottom: string } {
  const pre = e.preorderStart ?? e.preorderEnd ?? null;
  if (pre) { const [, m, d] = pre.split('-'); return { top: `${+m}月`, bottom: `${+d}` }; }
  if (e.dateLabel) {
    if (SEASON_KANJI[e.dateLabel]) return { top: SEASON_KANJI[e.dateLabel], bottom: '頃' };
    const m = e.date ? +e.date.split('-')[1] : null;
    // 「中」＝月のみ（日部分なし）は月だけ表示。上旬/中旬/下旬は月＋ラベル。
    if (e.dateLabel === '中') return { top: '', bottom: m ? `${m}月` : '未定' };
    return { top: m ? `${m}月` : '', bottom: e.dateLabel };
  }
  if (e.date) { const [, m, d] = e.date.split('-'); return { top: `${+m}月`, bottom: `${+d}` }; }
  return { top: '', bottom: '未定' };
}

/** 画像右下に重ねる日めくりカレンダー風の日付バッジ。 */
function DateBadge({ event }: { event: CalendarEvent }) {
  const { top, bottom } = badgeDate(event);
  const bottomBig = /^\d+$/.test(bottom); // 数字の日は大きく、ラベルは小さく
  return (
    <div className="absolute bottom-1.5 right-1.5 w-10 rounded-[6px] overflow-hidden shadow-md" style={{ backgroundColor: '#fff' }}>
      {top ? (
        <div className="text-center text-[10px] font-bold leading-none py-[3px]" style={{ backgroundColor: 'var(--color-destructive)', color: '#fff' }}>{top}</div>
      ) : null}
      <div className={`text-center font-bold leading-none py-1 ${bottomBig ? 'text-[18px]' : 'text-[12px]'}`} style={{ color: '#1a1a1a' }}>
        {bottom}
      </div>
    </div>
  );
}

/** カテゴリのドット色＋ラベル。複数サブカテゴリは全部表示（親「グッズ」は種別がある時だけ省く）。 */
function CategoryLine({ event }: { event: CalendarEvent }) {
  let cats = parseCategories(event.category);
  if (cats.length > 1) cats = cats.filter((c) => c !== 'グッズ');
  const catColor = getPrimaryCategoryColor(event.category);
  return (
    <div className="flex items-center gap-1 text-[11px] text-label-secondary truncate min-h-[1.25em]">
      {catColor && <span className="inline-block w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: catColor }} />}
      <span className="truncate">{cats.join(' ・ ')}</span>
    </div>
  );
}

/** 探す/ホームの基本カード。メルカリ流＝画像が主役・価格を最強・枠線で区切り。 */
export default function ItemCard({ event, layout = 'grid', isNew, likedInit, workColor, onOpen, onLike, onBuy }: Props) {
  const type = deriveItemType(event);
  const status = deriveStatus(event);
  const price = yen(event.price);
  // 販路を判定: アフィ対応＝カート / 公式リンクのみ＝リンク / 無＝非表示
  const buyMode: BuyMode = resolveBuy(event).mode;
  const [imgError, setImgError] = useState(false);
  // 共有ストアで状態を持ち、詳細ページや他タイルと同期する
  const { liked, count: likeCount } = useLike(event.id, {
    liked: likedInit ?? !!event.likedByMe,
    count: event.likes ?? 0,
  });
  const handleLike = async () => {
    const prev = { liked, count: likeCount };
    setLike(event.id, { liked: !prev.liked, count: prev.count + (prev.liked ? -1 : 1) });
    try { const r = await onLike?.(); if (r && typeof r === 'object') setLike(event.id, { liked: r.liked, count: r.count }); }
    catch { setLike(event.id, prev); }
  };
  const firstImg = parseImageUrls(event.imageUrl)[0];
  const showImg = !!firstImg && !imgError;

  const Thumb = (
    <div className="relative w-full h-full bg-fill-3 flex items-center justify-center overflow-hidden">
      {showImg ? (
        <img
          src={firstImg}
          alt={event.title}
          loading="lazy"
          onError={() => setImgError(true)}
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="flex flex-col items-center gap-1 px-2 text-center">
          <ImageOff size={22} className="text-label-tertiary" />
          {event.workName && <span className="text-[10px] text-label-tertiary line-clamp-1">{event.workName}</span>}
        </div>
      )}
      <div className="absolute top-1.5 left-1.5">
        <StatusBadge status={status} type={type} />
      </div>
      {isNew && (
        <span className="absolute top-1.5 right-1.5 text-[10px] font-bold rounded-full px-1.5 py-0.5" style={{ backgroundColor: 'var(--color-destructive)', color: '#fff' }}>新着</span>
      )}
    </div>
  );

  if (layout === 'list') {
    return (
      <div className="rounded-[12px] border border-subtle overflow-hidden bg-bg-secondary p-2 flex gap-3"
        style={workColor ? { borderLeft: `3px solid ${workColor}` } : undefined}>
        <button onClick={onOpen} className="pressable flex-shrink-0 w-24 h-24 rounded-[8px] overflow-hidden">{Thumb}</button>
        <div className="flex-1 min-w-0 flex flex-col">
          <button onClick={onOpen} className="pressable text-left">
            {event.workName && <div className="text-[11px] text-label-secondary truncate">{event.workName}</div>}
            <div className="text-[14px] font-semibold leading-snug line-clamp-2">{event.title}</div>
            <CategoryLine event={event} />
            <div className="text-[12px] text-label-secondary mt-0.5">{itemDateLines(event).join(' / ')}</div>
            {price && <div className="text-[15px] font-bold mt-1" style={{ color: 'var(--accent-text)' }}>{price}</div>}
          </button>
          <div className="mt-auto pt-1.5"><CardActions liked={liked} likeCount={likeCount} onLike={handleLike} event={event} onBuy={onBuy} buyMode={buyMode} /></div>
        </div>
      </div>
    );
  }

  // grid（枠線つきカード・画像は正方形で固定・アクションは必ず最下段）
  return (
    <div className="flex flex-col h-full rounded-[12px] border border-subtle overflow-hidden bg-bg-secondary"
      style={workColor ? { borderLeft: `3px solid ${workColor}` } : undefined}>
      <button onClick={onOpen} className="pressable text-left flex flex-col">
        <div className="w-full aspect-square relative">{Thumb}<DateBadge event={event} /></div>
        <div className="px-2 pt-1.5">
          <div className="text-[11px] text-label-secondary truncate min-h-[1.25em]">{event.workName ?? ''}</div>
          <div className="text-[13px] font-medium leading-snug line-clamp-2 min-h-[2.75em]">{event.title}</div>
          <CategoryLine event={event} />
          <div className="text-[15px] font-bold mt-0.5 min-h-[1.4em]" style={{ color: 'var(--accent-text)' }}>{price}</div>
        </div>
      </button>
      <div className="px-2 pb-2 pt-1 mt-auto">
        <CardActions liked={liked} likeCount={likeCount} onLike={handleLike} event={event} onBuy={onBuy} buyMode={buyMode} />
      </div>
    </div>
  );
}

function CardActions({ liked, likeCount, onLike, event, onBuy, buyMode }: { liked?: boolean; likeCount?: number; onLike?: () => void; event: CalendarEvent; onBuy?: () => void; buyMode?: BuyMode }) {
  return (
    <div className="flex items-center gap-4">
      <button onClick={(e) => { e.stopPropagation(); onLike?.(); }} aria-label="いいね" className="pressable tap-44 flex items-center gap-1">
        <Heart size={18} fill={liked ? 'var(--accent-color)' : 'none'} style={{ color: liked ? 'var(--accent-color)' : 'var(--label-secondary)' }} />
        {!!likeCount && likeCount > 0 && <span className="text-[11px] text-label-secondary">{likeCount}</span>}
      </button>
      <ReactionButton eventId={event.id} />
      <NotifyBell event={event} liked={!!liked} />
      {buyMode === 'cart' && <IconBtn label="購入する" onClick={onBuy}><ShoppingCart size={18} /></IconBtn>}
      {buyMode === 'link' && <IconBtn label="公式サイトを開く" onClick={onBuy}><ExternalLink size={18} /></IconBtn>}
    </div>
  );
}

function IconBtn({ children, label, onClick }: { children: React.ReactNode; label: string; onClick?: () => void }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick?.(); }}
      aria-label={label}
      className="pressable tap-44 text-label-secondary"
    >
      {children}
    </button>
  );
}

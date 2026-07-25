import { useState } from 'react';
import { Heart, ImageOff } from 'lucide-react';
import type { CalendarEvent } from '../../types';
import { useLike, setLike } from '../../lib/likeStore';
import { deriveStatus, deriveItemType, itemDateLines } from '../../design/tokens';
import { parseCategories, getPrimaryCategoryColor, parseImageUrls } from '../../lib/constants';
import { likeEffect } from '../../lib/likeEffect';
import { primaryOffer, getOffers } from '../../lib/affiliate';
import StatusBadge from '../ui/StatusBadge';
import OptImg from '../ui/OptImg';
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
}

function yen(n?: number): string {
  return n != null ? `¥${n.toLocaleString()}` : '';
}

const SEASON_KANJI: Record<string, string> = { 春頃: '春', 夏頃: '夏', 秋頃: '秋', 冬頃: '冬' };

// 日めくりバッジの上段(月)・下段(日 or ラベル)を決める。予約日を最優先。
// 期間がある場合は日部分に「〜」を付ける（開始日のみ→"20〜"、締切のみ→"〜22"）。
function badgeDate(e: CalendarEvent): { top: string; bottom: string } {
  if (e.preorderStart || e.preorderEnd) {
    if (e.preorderStart) {
      const [, m, d] = e.preorderStart.split('-');
      // 終了日未入力でも受付は期間もの（発売日まで等）なので、単日受付でない限り「〜」を付ける
      const single = e.preorderEnd === e.preorderStart;
      return { top: `${+m}月`, bottom: `${+d}${single ? '' : '〜'}` };
    }
    const [, m, d] = e.preorderEnd!.split('-');
    return { top: `${+m}月`, bottom: `〜${+d}` };
  }
  if (e.dateLabel) {
    if (SEASON_KANJI[e.dateLabel]) return { top: SEASON_KANJI[e.dateLabel], bottom: '頃' };
    const m = e.date ? +e.date.split('-')[1] : null;
    // 「中」＝月のみ（日部分なし）は月だけ表示。上旬/中旬/下旬は月＋ラベル。
    if (e.dateLabel === '中') return { top: '', bottom: m ? `${m}月` : '未定' };
    return { top: m ? `${m}月` : '', bottom: e.dateLabel };
  }
  if (e.date) {
    const [, m, d] = e.date.split('-');
    const range = !!e.endDate && e.endDate !== e.date;
    return { top: `${+m}月`, bottom: `${+d}${range ? '〜' : ''}` };
  }
  return { top: '', bottom: '未定' };
}

/** 画像右下に重ねる日めくりカレンダー風の日付バッジ。 */
function DateBadge({ event }: { event: CalendarEvent }) {
  const { top, bottom } = badgeDate(event);
  const bottomBig = /^〜?\d+〜?$/.test(bottom); // 数字の日(〜付き含む)は大きく、ラベルは小さく
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
export default function ItemCard({ event, layout = 'grid', isNew, likedInit, workColor, onOpen, onLike }: Props) {
  const type = deriveItemType(event);
  const status = deriveStatus(event);
  const price = yen(event.price);
  const isSet = !!primaryOffer(getOffers(event))?.isSet;
  const setTag = <span className="text-[9px] font-bold text-label-secondary px-1 py-px rounded flex-shrink-0" style={{ background: 'var(--fill-secondary, rgba(120,120,128,0.16))' }}>セット</span>;
  // 購入導線はカードに出さず詳細ページに一本化（PR表記＝「広告を含みます」を購入リンク直近に置くため）。
  const [imgError, setImgError] = useState(false);
  // 共有ストアで状態を持ち、詳細ページや他タイルと同期する
  const { liked, count: likeCount } = useLike(event.id, {
    liked: likedInit ?? !!event.likedByMe,
    count: event.likes ?? 0,
  });
  // 「いいね＝カレンダーに追加」は likeEffect のサーキットライン（タブへ走る線）が毎回教える
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
        <OptImg
          src={firstImg}
          w={384}
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
            {price && <div className="text-[15px] font-bold mt-1 flex items-center gap-1" style={{ color: 'var(--accent-text)' }}>{price}{isSet && setTag}</div>}
          </button>
          <div className="mt-auto pt-1.5"><CardActions liked={liked} likeCount={likeCount} onLike={handleLike} event={event} /></div>
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
          <div className="text-[15px] font-bold mt-0.5 min-h-[1.4em] flex items-center gap-1" style={{ color: 'var(--accent-text)' }}>{price}{price && isSet && setTag}</div>
        </div>
      </button>
      <div className="px-2 pb-2 pt-1 mt-auto">
        <CardActions liked={liked} likeCount={likeCount} onLike={handleLike} event={event} />
      </div>
    </div>
  );
}

function CardActions({ liked, likeCount, onLike, event }: { liked?: boolean; likeCount?: number; onLike?: () => void; event: CalendarEvent }) {
  return (
    <div className="flex items-center gap-4">
      <button onClick={(e) => { e.stopPropagation(); if (!liked) likeEffect(e.currentTarget); onLike?.(); }} aria-label="いいね" className="pressable tap-44 flex items-center gap-1">
        <Heart size={18} fill={liked ? 'var(--accent-color)' : 'none'} style={{ color: liked ? 'var(--accent-color)' : 'var(--label-secondary)' }} />
        {!!likeCount && likeCount > 0 && <span className="text-[11px] text-label-secondary">{likeCount}</span>}
      </button>
      <ReactionButton eventId={event.id} />
      <NotifyBell event={event} liked={!!liked} />
    </div>
  );
}

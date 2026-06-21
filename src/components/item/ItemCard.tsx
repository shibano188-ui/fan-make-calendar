import { Heart, CalendarPlus, ShoppingCart, ImageOff } from 'lucide-react';
import type { CalendarEvent } from '../../types';
import { deriveStatus, type ItemType } from '../../design/tokens';
import { parseCategories, getPrimaryCategoryColor } from '../../lib/constants';
import StatusBadge from '../ui/StatusBadge';

interface Props {
  event: CalendarEvent;
  layout?: 'grid' | 'list';
  onOpen?: () => void;
  onLike?: () => void;
  onCalendar?: () => void;
  onBuy?: () => void;
}

function yen(n?: number): string {
  return n != null ? `¥${n.toLocaleString()}` : '';
}

/** カテゴリのドット色＋ラベル（親「グッズ」は冗長なので種別があれば省く）。日付/時間はタイルに出さず詳細で表示。 */
function CategoryLine({ event }: { event: CalendarEvent }) {
  const cats = parseCategories(event.category);
  const catLabel = cats.find((c) => c !== 'グッズ') ?? cats[0];
  const catColor = getPrimaryCategoryColor(event.category);
  return (
    <div className="flex items-center gap-1 text-[11px] text-label-secondary truncate min-h-[1.25em]">
      {catColor && <span className="inline-block w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: catColor }} />}
      <span className="truncate">{catLabel ?? ''}</span>
    </div>
  );
}

/** 探す/ホームの基本カード。メルカリ流＝画像が主役・価格を最強・枠線で区切り。 */
export default function ItemCard({ event, layout = 'grid', onOpen, onLike, onCalendar, onBuy }: Props) {
  const type: ItemType = (event.type as ItemType) || 'event';
  const status = deriveStatus(event);
  const price = yen(event.price);

  const Thumb = (
    <div className="relative w-full h-full bg-fill-3 flex items-center justify-center overflow-hidden">
      {event.imageUrl ? (
        <img src={event.imageUrl} alt={event.title} loading="lazy" className="w-full h-full object-cover" />
      ) : (
        <ImageOff size={28} className="text-label-tertiary" />
      )}
      <div className="absolute top-1.5 left-1.5">
        <StatusBadge status={status} type={type} />
      </div>
    </div>
  );

  if (layout === 'list') {
    return (
      <div className="rounded-[12px] border border-subtle overflow-hidden bg-bg-secondary">
        <button onClick={onOpen} className="pressable w-full flex gap-3 text-left p-2">
          <div className="flex-shrink-0 w-24 h-24 rounded-[8px] overflow-hidden">{Thumb}</div>
          <div className="flex-1 min-w-0">
            {event.workName && <div className="text-[11px] text-label-secondary truncate">{event.workName}</div>}
            <div className="text-[14px] font-semibold leading-snug line-clamp-2">{event.title}</div>
            <CategoryLine event={event} />
            {price && <div className="text-[15px] font-bold mt-1" style={{ color: 'var(--accent-text)' }}>{price}</div>}
            <div className="mt-1.5"><CardActions onLike={onLike} onCalendar={onCalendar} onBuy={onBuy} /></div>
          </div>
        </button>
      </div>
    );
  }

  // grid（枠線つきカード・高さ揃え）
  return (
    <div className="flex flex-col rounded-[12px] border border-subtle overflow-hidden bg-bg-secondary">
      <button onClick={onOpen} className="pressable text-left flex flex-col">
        <div className="w-full aspect-square">{Thumb}</div>
        <div className="px-2 pt-1.5">
          <div className="text-[11px] text-label-secondary truncate min-h-[1.25em]">{event.workName ?? ''}</div>
          <div className="text-[13px] font-medium leading-snug line-clamp-2 min-h-[2.75em]">{event.title}</div>
          <CategoryLine event={event} />
          <div className="text-[15px] font-bold mt-0.5 min-h-[1.4em]" style={{ color: 'var(--accent-text)' }}>{price}</div>
        </div>
      </button>
      <div className="px-2 pb-2 pt-1">
        <CardActions onLike={onLike} onCalendar={onCalendar} onBuy={onBuy} />
      </div>
    </div>
  );
}

function CardActions({ onLike, onCalendar, onBuy }: { onLike?: () => void; onCalendar?: () => void; onBuy?: () => void }) {
  return (
    <div className="flex items-center gap-4">
      <IconBtn label="いいね" onClick={onLike}><Heart size={18} /></IconBtn>
      <IconBtn label="カレンダーに追加" onClick={onCalendar}><CalendarPlus size={18} /></IconBtn>
      <IconBtn label="購入する" onClick={onBuy}><ShoppingCart size={18} /></IconBtn>
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

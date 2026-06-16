import type { ReactNode } from 'react';
import { Heart, Smile, Flag, Trash2, Pencil, Star, Share2, ExternalLink } from 'lucide-react';
import CategoryChips from './CategoryChips';
import MemoText from './MemoText';
import SourceBadge from './SourceBadge';
import { getPrimaryCategoryColor, parseImageUrls, parseLinks } from '../lib/constants';
import { safeHref } from '../lib/url';
import { REACTIONS, type ReactionType } from '../lib/reactions';
import type { CalendarEvent } from '../types';

function getDomain(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}

type Density = 'rich' | 'compact';

export type EventTileProps = {
  event: CalendarEvent;
  density?: Density;
  /** 作品名チップ・チェックボタンに使う色 */
  workColor?: string;
  showImages?: boolean;
  highlighted?: boolean;

  // ♥ いいね
  liked?: boolean;
  likeLocked?: boolean;
  onLike?: (el: HTMLElement) => void;

  // カレンダー状態（追加済み / 再追加）
  calendarStatus?: 'in' | 'readd' | null;
  onCalendarStatusClick?: () => void;

  // 😊 リアクション
  myReaction?: ReactionType | null;
  onReact?: () => void;

  // ⭐ 重要トグル
  important?: boolean;
  onToggleImportant?: () => void;

  // 𝕏 シェア
  shareUrl?: string;

  // 自分の投稿のときだけ出す編集・削除
  isOwn?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
  // 他人の投稿のときだけ出す通報
  onReport?: () => void;

  // ＋情報（参加中の作品のみ）
  onInfoEdit?: () => void;

  onAuthorClick?: () => void;

  /** 共通タイルの下に差し込む追加行（予約受付中の「締切まで／チェック!」など） */
  footer?: ReactNode;
};

const TOKENS = {
  rich:    { dateW: 'w-12', title: 'text-base', badge: 'text-[11px]', pad: 'pt-4', btn: 'px-3 py-1.5', icon: 14 },
  compact: { dateW: 'w-10', title: 'text-sm',   badge: 'text-[10px]', pad: 'pt-3', btn: 'px-2.5 py-1', icon: 13 },
} as const;

const SEASON = ['春頃', '夏頃', '秋頃', '冬頃'];

/** 左の日付列（予約・開催中・期間・単日・時間を文脈で出し分ける） */
function DateColumn({ event, density }: { event: CalendarEvent; density: Density }) {
  const t = TOKENS[density];
  const [, em, ed] = event.date ? event.date.split('-').map(Number) : [0, 0, 0];
  const hasPeriod = !!event.endDate && event.endDate !== event.date;
  const [, endM, endD] = hasPeriod ? event.endDate!.split('-').map(Number) : [0, 0, 0];
  const hasPreorderData = !!(event.preorderStart || event.preorderEnd);
  const [, psm, psd] = event.preorderStart ? event.preorderStart.split('-').map(Number) : [0, 0, 0];
  const [, pem, ped] = event.preorderEnd ? event.preorderEnd.split('-').map(Number) : [0, 0, 0];
  const todayStr = new Date().toISOString().slice(0, 10);
  const isOngoing = !!event.date && event.date < todayStr && !!event.endDate && event.endDate >= todayStr;

  return (
    <div className={`flex-shrink-0 ${t.dateW} flex flex-col items-center pt-0.5`}>
      {hasPreorderData ? (
        <>
          <span className="text-[10px] text-label-tertiary leading-none">予約</span>
          {event.preorderStart && <span className="text-[12px] font-bold text-label-primary leading-snug mt-0.5">{psm}/{psd}</span>}
          {event.preorderEnd
            ? <span className="text-[11px] font-bold text-label-secondary leading-snug">〜{pem}/{ped}</span>
            : <span className="text-[11px] text-label-tertiary leading-none">〜</span>}
          {event.date && (
            <>
              <div className="w-full h-px my-1" style={{ backgroundColor: 'var(--border-subtle)' }} />
              <span className="text-[10px] text-label-tertiary leading-none">発売</span>
              {SEASON.includes(event.dateLabel ?? '')
                ? <span className="text-[10px] font-bold text-label-secondary leading-snug mt-0.5">{event.dateLabel}</span>
                : event.dateLabel
                  ? <><span className="text-[10px] text-label-tertiary leading-none mt-0.5">{em}月</span><span className="text-[11px] font-bold text-label-secondary leading-snug">{event.dateLabel}</span></>
                  : <span className="text-[11px] font-bold text-label-secondary leading-snug mt-0.5">{em}/{ed}</span>}
            </>
          )}
        </>
      ) : isOngoing ? (
        <>
          <span className="text-[11px] font-bold leading-none" style={{ color: 'var(--color-success)' }}>開催中</span>
          <span className="text-[11px] font-bold text-label-secondary leading-snug mt-1">〜{endM}/{endD}</span>
        </>
      ) : hasPeriod ? (
        <>
          <span className="text-[13px] font-bold text-label-primary leading-snug">{em}/{ed}</span>
          <span className="text-[13px] font-bold text-label-secondary leading-snug">〜{endM}/{endD}</span>
        </>
      ) : !event.date ? (
        <span className="text-sm text-label-tertiary leading-snug">—</span>
      ) : SEASON.includes(event.dateLabel ?? '') ? (
        <span className="text-xl font-bold text-label-primary leading-snug">{event.dateLabel}</span>
      ) : event.dateLabel ? (
        <><span className="text-[10px] text-label-tertiary leading-none">{em}月</span><span className="text-[13px] font-bold text-label-primary leading-snug">{event.dateLabel}</span></>
      ) : (
        <span className="text-[13px] font-bold text-label-primary leading-snug">{em}/{ed}</span>
      )}
      {event.time && (
        <>
          <span className="text-sm font-bold text-label-primary leading-snug mt-1">{event.time}</span>
          {event.endTime && <span className="text-sm font-bold text-label-primary leading-snug">〜{event.endTime}</span>}
        </>
      )}
    </div>
  );
}

const actBtn = 'rounded-full pressable flex items-center justify-center';

export default function EventTile(props: EventTileProps) {
  const {
    event, density = 'rich', workColor = 'var(--accent-color)', showImages = false, highlighted,
    liked, likeLocked, onLike, calendarStatus, onCalendarStatusClick,
    myReaction, onReact, important, onToggleImportant, shareUrl,
    isOwn, onEdit, onDelete, onReport, onInfoEdit, onAuthorClick, footer,
  } = props;
  const t = TOKENS[density];
  const catColor = getPrimaryCategoryColor(event.category);
  const imgs = showImages ? parseImageUrls(event.imageUrl) : [];
  const links = parseLinks(event.link);
  const reaction = myReaction ? REACTIONS.find(r => r.type === myReaction) : undefined;

  const hasActions = onLike || calendarStatus || onReact || onToggleImportant || shareUrl
    || (onReport && !isOwn) || (isOwn && (onEdit || onDelete));

  return (
    <div
      className="bg-bg-secondary rounded-[14px] overflow-hidden select-none"
      style={{
        borderLeft: catColor ? `3px solid ${catColor}` : undefined,
        borderRight: important ? '3px solid #f59e0b' : undefined,
        outline: highlighted ? '2px solid var(--accent-color)' : undefined,
      }}
    >
      {/* 本体: 左日付列 + 右コンテンツ */}
      <div className={`flex items-stretch px-4 ${t.pad} gap-3`}>
        <DateColumn event={event} density={density} />
        <div className="w-px self-stretch flex-shrink-0" style={{ backgroundColor: 'var(--separator)' }} />
        <div className="flex-1 min-w-0 flex flex-col gap-2 pb-3">
          {/* バッジ行 + ＋情報 */}
          <div className="flex items-start justify-between gap-2">
            {(event.isOrderMade || event.workName || event.category || event.prefecture) && (
              <div className="flex items-center gap-1.5 flex-wrap flex-1">
                {event.isOrderMade && (
                  <span className={`${t.badge} font-bold px-2 py-0.5 rounded-full`} style={{ background: 'var(--color-destructive)', color: '#fff' }}>予約</span>
                )}
                {event.workName && (
                  <span className={`${t.badge} font-medium px-2 py-0.5 rounded-full max-w-[120px] truncate`} style={{ color: workColor, backgroundColor: `${workColor}20` }}>{event.workName}</span>
                )}
                <CategoryChips category={event.category} className={`${t.badge} text-label-secondary rounded-full px-2 py-0.5`} style={{ backgroundColor: 'var(--fill-quaternary)' }} />
                {event.prefecture && (
                  <span className={`${t.badge} text-label-secondary rounded-full px-2 py-0.5`} style={{ backgroundColor: 'var(--fill-quaternary)' }}>{event.prefecture}</span>
                )}
              </div>
            )}
            {onInfoEdit && (
              <button onClick={onInfoEdit} className={`flex-shrink-0 ${t.badge} px-2.5 py-1 rounded-full pressable`} style={{ backgroundColor: 'color-mix(in srgb, var(--accent-color) 15%, transparent)', color: 'var(--accent-color)' }}>＋情報</button>
            )}
          </div>

          {/* タイトル */}
          <p className={`text-label-primary font-bold ${t.title} leading-snug`}>{event.title}</p>

          {/* 画像 */}
          {imgs.length === 1 && (
            <div className="flex justify-center">
              <img src={imgs[0]} alt="" loading="lazy" decoding="async" className="rounded-lg block" style={{ maxHeight: 220, maxWidth: '100%', height: 'auto', width: 'auto' }} />
            </div>
          )}
          {imgs.length > 1 && (
            <div className="flex gap-1.5 overflow-x-auto pb-1" style={{ scrollSnapType: 'x mandatory' }}>
              {imgs.map((src, i) => (
                <img key={i} src={src} alt="" loading="lazy" decoding="async" className="rounded-lg flex-shrink-0 block" style={{ height: 130, width: 'auto', scrollSnapAlign: 'start' }} />
              ))}
            </div>
          )}

          {/* メモ */}
          {event.memo && <MemoText text={event.memo} className="text-label-secondary text-sm leading-relaxed" />}

          {/* リンク */}
          {links.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {links.map((url, i) => (
                <a key={i} href={safeHref(url)} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                  className="flex items-center gap-1 px-3 py-1 rounded-full text-label-secondary text-xs w-fit pressable" style={{ backgroundColor: 'var(--fill-tertiary)' }}>
                  <ExternalLink size={10} />{getDomain(url)}
                </a>
              ))}
            </div>
          )}

          {/* 投稿者 / 出典 */}
          {(event.authorName || event.sourceUrl) && (
            <div className="flex items-center justify-between gap-2">
              <p className="text-label-tertiary text-xs">
                {event.authorName && (onAuthorClick
                  ? <button onClick={onAuthorClick} className="underline underline-offset-2 active:opacity-60">by {event.authorName}</button>
                  : `by ${event.authorName}`)}
              </p>
              <SourceBadge sourceUrl={event.sourceUrl} />
            </div>
          )}
        </div>
      </div>

      {/* 追加フッター（予約受付中の締切行など） */}
      {footer}

      {/* アクション行 */}
      {hasActions && (
        <div className="flex items-center gap-2 pt-1 mx-4 border-t pb-3" style={{ borderColor: 'var(--separator)' }}>
          {onLike && (
            <button onClick={e => onLike(e.currentTarget)} disabled={likeLocked}
              className={`flex items-center gap-1.5 ${t.btn} rounded-full text-sm disabled:opacity-40 pressable`}
              style={{ backgroundColor: liked ? 'color-mix(in srgb, var(--color-destructive) 15%, transparent)' : 'var(--fill-tertiary)', color: liked ? 'var(--color-destructive)' : 'var(--label-secondary)' }}>
              <Heart size={t.icon} style={{ fill: liked ? 'var(--color-destructive)' : 'none' }} />
              <span className="text-xs">{event.likes.toLocaleString('ja-JP')}</span>
            </button>
          )}

          {calendarStatus === 'in' ? (
            <button onClick={onCalendarStatusClick} className={`flex items-center gap-1 ${t.btn} rounded-full text-xs text-label-tertiary pressable`} style={{ backgroundColor: 'var(--fill-tertiary)' }}>追加済み</button>
          ) : calendarStatus === 'readd' ? (
            <button onClick={onCalendarStatusClick} className={`flex items-center gap-1 ${t.btn} rounded-full text-xs font-semibold pressable`} style={{ backgroundColor: 'color-mix(in srgb, var(--accent-color) 15%, transparent)', color: 'var(--accent-color)' }}>＋ 再追加</button>
          ) : null}

          {onReact && (
            <button onClick={onReact} className={`ml-auto ${t.btn} ${actBtn} text-sm`}
              style={{ backgroundColor: myReaction ? 'color-mix(in srgb, var(--accent-color) 15%, transparent)' : 'var(--fill-tertiary)', color: myReaction ? 'var(--accent-color)' : 'var(--label-secondary)', minWidth: '2.5rem' }}>
              {reaction ? <img src={reaction.image} alt="" className="h-4 w-auto" /> : <Smile size={t.icon} />}
            </button>
          )}

          {onToggleImportant && (
            <button onClick={onToggleImportant} className={`${onReact ? '' : 'ml-auto'} ${t.btn} ${actBtn} text-sm`}
              style={{ backgroundColor: 'var(--fill-tertiary)', minWidth: '2.5rem' }}>
              <Star size={t.icon} style={{ fill: important ? '#f59e0b' : 'none', color: important ? '#f59e0b' : 'var(--label-tertiary)' }} />
            </button>
          )}

          {shareUrl && (
            <a href={shareUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
              className={`${t.btn} ${actBtn} text-sm`} style={{ backgroundColor: 'var(--fill-tertiary)', color: 'var(--label-tertiary)', minWidth: '2.5rem' }}>
              <Share2 size={t.icon} />
            </a>
          )}

          {onReport && !isOwn && (
            <button onClick={onReport} className={`${t.btn} ${actBtn} text-sm`} style={{ backgroundColor: 'var(--fill-tertiary)', color: 'var(--label-tertiary)', minWidth: '2.5rem' }}>
              <Flag size={t.icon} />
            </button>
          )}

          {isOwn && onEdit && (
            <button onClick={onEdit} className={`${t.btn} ${actBtn} text-sm`} style={{ backgroundColor: 'var(--fill-tertiary)', color: 'var(--accent-color)', minWidth: '2.5rem' }}>
              <Pencil size={t.icon} />
            </button>
          )}

          {isOwn && onDelete && (
            <button onClick={onDelete} className={`${t.btn} ${actBtn} text-sm`} style={{ backgroundColor: 'var(--fill-tertiary)', color: 'var(--label-tertiary)', minWidth: '2.5rem' }}>
              <Trash2 size={t.icon} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

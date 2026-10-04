import { Crown } from 'lucide-react';
import { haptic } from '../../lib/haptics';

// ホームのプロフィール（2026-10-05 柴野「ファンが親しみやすいように」）。推し活の会員証・ライブのチケットの見た目。
// 左＝本券（アイコン・名前・称号・ヌシ・追加した予定・使い始めた月）、右＝半券（連続記録）。間にもぎり線と切り欠き。
// 色はアクセント色と面の色だけで描く（テーマを変えても合う）。押すとマイページ

const NOTCH = 14; // 切り欠きの直径

export default function ProfileTicket({ avatar, name, title, nushi, added, since, streak, onOpen }: {
  avatar: string; name: string; title?: string; nushi?: string; added: number; since: string | null; streak: number; onOpen: () => void;
}) {
  return (
    <button onClick={() => { haptic.select(); onOpen(); }} aria-label="マイページを開く"
      className="pressable relative w-full flex text-left rounded-[14px] overflow-hidden"
      style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid color-mix(in srgb, var(--accent-color) 35%, transparent)' }}>
      {/* 本券 */}
      <span className="flex-1 min-w-0 flex items-center gap-3 pl-3 pr-2 py-2.5">
        <span className="w-12 h-12 rounded-full flex items-center justify-center text-[26px] flex-shrink-0" style={{ backgroundColor: 'var(--fill-tertiary)' }}>
          {avatar}
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-[9px] font-bold tracking-[0.18em]" style={{ color: 'var(--accent-text)' }}>FANHIVE MEMBER</span>
          <span className="block text-[16px] font-bold truncate leading-tight">{name}</span>
          <span className="flex items-center gap-1 mt-0.5 min-w-0">
            {title && (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-[1px] rounded-full text-[10px] font-bold flex-shrink-0"
                style={{ backgroundColor: 'color-mix(in srgb, var(--accent-color) 18%, transparent)', color: 'var(--accent-text)' }}>
                <Crown size={9} strokeWidth={2.5} />{title}
              </span>
            )}
            {nushi && <span className="text-[10px] text-label-secondary truncate">{nushi}のヌシ</span>}
          </span>
          <span className="block text-[10px] text-label-tertiary mt-0.5 tabular-nums truncate">
            追加した予定 {added}件{since ? ` ・ ${since}〜` : ''}
          </span>
        </span>
      </span>
      {/* もぎり線（点線）と、上下の切り欠き（面の外の色で丸く抜く） */}
      <span aria-hidden className="relative flex-shrink-0" style={{ width: 1, borderLeft: '2px dashed color-mix(in srgb, var(--accent-color) 40%, transparent)', margin: `${NOTCH / 2 + 2}px 0` }} />
      <span aria-hidden className="absolute rounded-full" style={{ width: NOTCH, height: NOTCH, right: 78 - NOTCH / 2, top: -NOTCH / 2, backgroundColor: 'var(--bg-primary)', border: '1px solid color-mix(in srgb, var(--accent-color) 35%, transparent)' }} />
      <span aria-hidden className="absolute rounded-full" style={{ width: NOTCH, height: NOTCH, right: 78 - NOTCH / 2, bottom: -NOTCH / 2, backgroundColor: 'var(--bg-primary)', border: '1px solid color-mix(in srgb, var(--accent-color) 35%, transparent)' }} />
      {/* 半券: 連続記録 */}
      <span className="flex-shrink-0 w-[77px] flex flex-col items-center justify-center py-2"
        style={{ backgroundColor: 'color-mix(in srgb, var(--accent-color) 10%, transparent)' }} aria-label={`${streak}日連続`}>
        <span className="text-[22px] leading-none" style={{ filter: streak ? 'none' : 'grayscale(1)', opacity: streak ? 1 : 0.4 }}>🔥</span>
        <span className="text-[15px] font-bold tabular-nums mt-0.5 leading-none">{streak}<span className="text-[10px] font-semibold">日</span></span>
        <span className="text-[9px] text-label-tertiary mt-0.5">連続</span>
      </span>
    </button>
  );
}

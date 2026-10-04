import type { ReactNode } from 'react';
import { ChevronRight, X } from 'lucide-react';
import { haptic } from '../../lib/haptics';

// 機能の案内の1行（2026-10-05）。課金の機能は、その機能が役に立つ場所のすぐ近くに置く（柴野の方針）。
// ストレスにならないように: 画面をふさがない・1行・押したら案内先へ。繰り返し見る画面では onDismiss を渡して✕で消せるようにする。
// badge を渡すと右端に札（「プレミアム」など）を出す。文言は短く（狭い iPhone SE で見切れない長さ）
export default function PromoLine({ icon, text, badge, onClick, onDismiss, className = '' }: {
  icon?: ReactNode; text: string; badge?: string; onClick: () => void; onDismiss?: () => void; className?: string;
}) {
  return (
    <div className={`flex items-center gap-2 pl-3 ${onDismiss ? 'pr-1' : 'pr-2'} py-1 rounded-[10px] border ${className}`}
      style={{ borderColor: 'color-mix(in srgb, var(--accent-color) 45%, transparent)' }}>
      <button onClick={() => { haptic.select(); onClick(); }} className="pressable flex-1 min-w-0 flex items-center gap-2 py-1 text-left">
        {icon && <span className="flex-shrink-0" style={{ color: 'var(--accent-text)' }}>{icon}</span>}
        <span className="flex-1 min-w-0 truncate text-[12px] font-semibold">{text}</span>
        {badge && (
          <span className="flex-shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full"
            style={{ backgroundColor: 'color-mix(in srgb, var(--accent-color) 20%, transparent)', color: 'var(--accent-text)' }}>{badge}</span>
        )}
        {!onDismiss && <ChevronRight size={15} className="flex-shrink-0 text-label-tertiary" />}
      </button>
      {onDismiss && (
        <button onClick={() => { haptic.select(); onDismiss(); }} aria-label="この案内を消す" className="pressable tap-44 p-1 flex-shrink-0">
          <X size={16} className="text-label-tertiary" />
        </button>
      )}
    </div>
  );
}

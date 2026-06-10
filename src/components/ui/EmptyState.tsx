import type { ReactNode } from 'react';

// 空状態の共通コンポーネント（Phase G-2）
// アイコン + 見出し + 説明 + CTA ボタン

interface Props {
  icon: ReactNode;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  /** filled = アクセント塗り（主CTA） / tinted = 薄塗り（副CTA） */
  actionVariant?: 'filled' | 'tinted';
}

export default function EmptyState({ icon, title, description, actionLabel, onAction, actionVariant = 'filled' }: Props) {
  return (
    <div className="flex flex-col items-center gap-3 py-16 px-6 text-center">
      <div className="text-label-tertiary" style={{ fontSize: 48, lineHeight: 1 }}>{icon}</div>
      <p className="text-[15px] font-semibold text-label-primary mt-1">{title}</p>
      {description && <p className="text-[13px] text-label-secondary leading-relaxed">{description}</p>}
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="mt-2 px-6 py-2.5 rounded-full text-sm font-semibold pressable"
          style={actionVariant === 'filled'
            ? { backgroundColor: 'var(--accent-color)', color: 'var(--accent-on)' }
            : { backgroundColor: 'color-mix(in srgb, var(--accent-color) 15%, transparent)', color: 'var(--accent-text)' }}
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

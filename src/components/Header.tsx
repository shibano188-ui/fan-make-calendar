import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, X } from 'lucide-react';

interface Props {
  title?: string;
  subtitle?: string;
  subtitleNode?: ReactNode;
  onBack?: () => void;
  closeMode?: boolean;
  rightAction?: ReactNode;
  leftNode?: ReactNode;
  compact?: boolean;
}

const headerStyle: React.CSSProperties = {
  backgroundColor: 'color-mix(in srgb, var(--bg-primary) 88%, transparent)',
  backdropFilter: 'saturate(180%) blur(20px)',
  WebkitBackdropFilter: 'saturate(180%) blur(20px)',
};

export default function Header({ title, subtitle, subtitleNode, onBack, closeMode = false, rightAction, leftNode, compact = false }: Props) {
  const navigate = useNavigate();

  const handleBack = () => {
    if (onBack) onBack();
    else navigate(-1);
  };

  const py = compact ? 'py-1' : 'py-2';

  if (leftNode !== undefined) {
    return (
      <header
        className={`flex items-center justify-between px-4 ${py} border-b border-separator`}
        style={headerStyle}
      >
        <div className="flex-1 flex items-center min-w-0">
          {leftNode}
        </div>
        {rightAction && (
          <div className="flex items-center flex-shrink-0">
            {rightAction}
          </div>
        )}
      </header>
    );
  }

  return (
    <header
      className={`flex items-center px-4 ${py} border-b border-separator`}
      style={headerStyle}
    >
      <div className="flex-1 flex items-center">
        <button
          onClick={handleBack}
          className="w-9 h-9 flex items-center justify-center rounded-lg pressable"
          style={{ color: 'var(--accent-color)', backgroundColor: 'var(--fill-tertiary)' }}
          aria-label={closeMode ? '閉じる' : '戻る'}
        >
          {closeMode ? <X size={20} /> : <ChevronLeft size={24} />}
        </button>
      </div>

      <div className="flex-1 text-center px-1">
        {title && <p className="text-sm font-semibold text-label-primary leading-tight">{title}</p>}
        {subtitleNode ?? (subtitle && (
          <p className="text-[11px] text-label-secondary leading-tight">{subtitle}</p>
        ))}
      </div>

      <div className="flex-1 flex justify-end items-center">
        {rightAction ?? null}
      </div>
    </header>
  );
}

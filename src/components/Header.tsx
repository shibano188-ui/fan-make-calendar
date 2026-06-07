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

export default function Header({ title, subtitle, subtitleNode, onBack, closeMode = false, rightAction, leftNode, compact = false }: Props) {
  const navigate = useNavigate();

  const handleBack = () => {
    if (onBack) onBack();
    else navigate(-1);
  };

  const py = compact ? 'py-2' : 'py-3';

  if (leftNode !== undefined) {
    return (
      <header className={`flex items-center justify-between px-4 ${py} bg-bg-primary border-b border-subtle`}>
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
    <header className={`flex items-center px-4 ${py} bg-bg-primary border-b border-subtle`}>
      <div className="flex-1 flex items-center">
        <button
          onClick={handleBack}
          className="w-8 h-8 flex items-center justify-center rounded-lg bg-bg-secondary text-label-primary"
          aria-label={closeMode ? '閉じる' : '戻る'}
        >
          {closeMode ? <X size={16} /> : <ChevronLeft size={18} />}
        </button>
      </div>

      <div className="flex-1 text-center px-1">
        {title && <p className="text-sm font-semibold text-label-primary leading-tight">{title}</p>}
        {subtitleNode ?? (subtitle && (
          <p className="text-xs text-label-secondary leading-tight">{subtitle}</p>
        ))}
      </div>

      <div className="flex-1 flex justify-end items-center">
        {rightAction ?? null}
      </div>
    </header>
  );
}

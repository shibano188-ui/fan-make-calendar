import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, X } from 'lucide-react';

interface Props {
  title: string;
  subtitle?: string;
  subtitleNode?: ReactNode;
  onBack?: () => void;
  closeMode?: boolean;
  rightAction?: ReactNode;
}

export default function Header({ title, subtitle, subtitleNode, onBack, closeMode = false, rightAction }: Props) {
  const navigate = useNavigate();

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      navigate(-1);
    }
  };

  return (
    <header className="flex items-center justify-between px-4 py-3 bg-bg-primary border-b border-subtle">
      {/* 左: 戻る / 閉じる */}
      <div className="w-10">
        <button
          onClick={handleBack}
          className="w-8 h-8 flex items-center justify-center rounded-lg bg-bg-secondary text-label-primary"
          aria-label={closeMode ? '閉じる' : '戻る'}
        >
          {closeMode ? <X size={16} /> : <ChevronLeft size={18} />}
        </button>
      </div>

      {/* 中央: タイトル */}
      <div className="flex-1 text-center">
        <p className="text-sm font-semibold text-label-primary leading-tight">{title}</p>
        {subtitleNode ?? (subtitle && (
          <p className="text-xs text-label-secondary leading-tight">{subtitle}</p>
        ))}
      </div>

      {/* 右: アクション */}
      <div className="min-w-[40px] flex justify-end flex-shrink-0">
        {rightAction ?? null}
      </div>
    </header>
  );
}

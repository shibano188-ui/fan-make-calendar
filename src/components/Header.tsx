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
    <header
      className="flex items-center px-4 py-2.5"
      style={{
        backgroundColor: 'var(--bg-primary)',
        borderBottom: '1px solid rgba(0,200,255,0.18)',
        boxShadow: '0 1px 12px rgba(0,200,255,0.06)',
      }}
    >
      {/* 左: 戻る / 閉じる */}
      <div className="flex-1 flex items-center">
        <button
          onClick={handleBack}
          className="w-8 h-8 flex items-center justify-center text-label-secondary active:opacity-60 transition-opacity"
          style={{
            border: '1px solid rgba(0,200,255,0.22)',
            borderRadius: 4,
            backgroundColor: 'rgba(0,200,255,0.06)',
          }}
          aria-label={closeMode ? '閉じる' : '戻る'}
        >
          {closeMode ? <X size={15} /> : <ChevronLeft size={17} />}
        </button>
      </div>

      {/* 中央: タイトル */}
      <div className="flex-1 text-center px-1">
        <p
          className="text-sm font-semibold leading-tight tracking-wider uppercase"
          style={{ fontFamily: "'Rajdhani', sans-serif", color: 'var(--label-primary)', letterSpacing: '0.1em' }}
        >
          {title}
        </p>
        {subtitleNode ?? (subtitle && (
          <p className="text-[10px] leading-tight" style={{ color: 'var(--label-tertiary)' }}>{subtitle}</p>
        ))}
      </div>

      {/* 右: アクション */}
      <div className="flex-1 flex justify-end items-center">
        {rightAction ?? null}
      </div>
    </header>
  );
}

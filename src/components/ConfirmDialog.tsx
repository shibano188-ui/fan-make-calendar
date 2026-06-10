import { createPortal } from 'react-dom';

export interface ConfirmAction {
  label: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress: () => void;
}

interface Props {
  open: boolean;
  title: string;
  message?: string;
  actions: ConfirmAction[];
}

export default function ConfirmDialog({ open, title, message, actions }: Props) {
  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[500] flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}
    >
      <div
        className="w-[270px] rounded-[14px] overflow-hidden"
        style={{ backgroundColor: 'var(--bg-secondary)' }}
      >
        <div className="px-6 pt-5 pb-4 text-center">
          <p className="text-[17px] font-semibold text-label-primary leading-snug">{title}</p>
          {message && (
            <p className="text-[13px] text-label-secondary leading-snug mt-1">{message}</p>
          )}
        </div>
        <div className="flex flex-col" style={{ borderTop: '1px solid var(--separator)' }}>
          {actions.map((action, i) => (
            <button
              key={i}
              onClick={action.onPress}
              className="w-full py-[11px] text-[17px] text-center pressable"
              style={{
                borderTop: i > 0 ? '1px solid var(--separator)' : undefined,
                color: action.style === 'destructive'
                  ? 'var(--color-destructive)'
                  : 'var(--accent-color)',
                fontWeight: action.style === 'cancel' ? 600 : 400,
              }}
            >
              {action.label}
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body
  );
}

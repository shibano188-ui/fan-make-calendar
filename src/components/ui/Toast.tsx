import { createContext, useContext, useState, useRef, useCallback, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Check, AlertCircle } from 'lucide-react';

// 非ブロッキング通知（alert 置き換え。Phase F-2）
// BottomTab(56px) の上から出る。広告は上部固定のため下から出して被りを回避。

type ToastType = 'success' | 'error';
type ShowToastFn = (message: string, type?: ToastType) => void;

const ToastContext = createContext<ShowToastFn>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback<ShowToastFn>((message, type = 'success') => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setToast({ message, type });
    timerRef.current = setTimeout(() => setToast(null), 2500);
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast && createPortal(
        <div className="fixed inset-x-0 z-[400] flex justify-center pointer-events-none" style={{ bottom: 56 + 12 }}>
          <div
            className="flex items-center gap-2 px-4 py-2.5 rounded-full shadow-card"
            style={{ backgroundColor: 'var(--bg-tertiary)', animation: 'slideUpIn 0.25s cubic-bezier(0.32,0.72,0,1) both' }}
          >
            {toast.type === 'success'
              ? <Check size={15} style={{ color: 'var(--color-success)' }} />
              : <AlertCircle size={15} style={{ color: 'var(--color-destructive)' }} />}
            <span className="text-[13px] text-label-primary">{toast.message}</span>
          </div>
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}

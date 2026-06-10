import { createContext, useContext, useState, useRef, useCallback, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

// iOS 風の確認ダイアログ（window.confirm 置き換え。Phase F-1）

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** true なら確認ボタンを赤（破壊的アクション） */
  destructive?: boolean;
  /** true ならキャンセルボタンなし（通知のみの alert 用途） */
  hideCancel?: boolean;
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn>(() => Promise.resolve(false));

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const resolverRef = useRef<((v: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>(o => {
    setOpts(o);
    return new Promise<boolean>(resolve => { resolverRef.current = resolve; });
  }, []);

  const close = (v: boolean) => {
    resolverRef.current?.(v);
    resolverRef.current = null;
    setOpts(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {opts && createPortal(
        <div
          className="fixed inset-0 z-[500] flex items-center justify-center px-8"
          style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
          onClick={() => { if (!opts.hideCancel) close(false); }}
        >
          <div
            className="w-[270px] rounded-[14px] overflow-hidden"
            style={{ backgroundColor: 'var(--bg-secondary)', animation: 'confirmIn 0.2s cubic-bezier(0.32,0.72,0,1) both' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="px-4 pt-5 pb-4 text-center">
              <p className="text-[17px] font-semibold text-label-primary leading-snug">{opts.title}</p>
              {opts.message && (
                <p className="text-[13px] text-label-secondary mt-1.5 leading-relaxed whitespace-pre-line">{opts.message}</p>
              )}
            </div>
            <div className="flex border-t" style={{ borderColor: 'var(--separator)' }}>
              {!opts.hideCancel && (
                <>
                  <button
                    onClick={() => close(false)}
                    className="flex-1 py-3 text-[17px] pressable"
                    style={{ color: 'var(--accent-text)' }}
                  >
                    {opts.cancelLabel ?? 'キャンセル'}
                  </button>
                  <div className="w-px self-stretch" style={{ backgroundColor: 'var(--separator)' }} />
                </>
              )}
              <button
                onClick={() => close(true)}
                className="flex-1 py-3 text-[17px] font-semibold pressable"
                style={{ color: opts.destructive ? 'var(--color-destructive)' : 'var(--accent-text)' }}
              >
                {opts.confirmLabel ?? 'OK'}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  return useContext(ConfirmContext);
}

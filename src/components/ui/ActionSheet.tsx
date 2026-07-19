import { createContext, useContext, useState, useRef, useCallback, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

// iOS 風のアクションシート（複数選択肢＋キャンセル。選んだ id を返す。キャンセルは null）

export interface ActionSheetOption {
  id: string;
  label: string;
  /** true なら赤（破壊的アクション） */
  destructive?: boolean;
}
export interface ActionSheetOptions {
  title?: string;
  message?: string;
  options: ActionSheetOption[];
}

type ActionSheetFn = (opts: ActionSheetOptions) => Promise<string | null>;

const ActionSheetContext = createContext<ActionSheetFn>(() => Promise.resolve(null));

export function ActionSheetProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<ActionSheetOptions | null>(null);
  const resolverRef = useRef<((v: string | null) => void) | null>(null);

  const show = useCallback<ActionSheetFn>(o => {
    setOpts(o);
    return new Promise<string | null>(resolve => { resolverRef.current = resolve; });
  }, []);

  const close = (v: string | null) => {
    resolverRef.current?.(v);
    resolverRef.current = null;
    setOpts(null);
  };

  return (
    <ActionSheetContext.Provider value={show}>
      {children}
      {opts && createPortal(
        <div
          className="fixed inset-0 z-[500]"
          style={{ backgroundColor: 'rgba(0,0,0,0.4)', animation: 'fadeIn 0.2s ease both' }}
          onClick={() => close(null)}
        >
          <div
            className="absolute inset-x-0 bottom-0 max-w-app mx-auto px-3"
            style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}
            onClick={e => e.stopPropagation()}
          >
            <div
              className="material-thick rounded-[16px] overflow-hidden mb-2"
              style={{ animation: 'slideUpIn 0.3s cubic-bezier(0.34,1.2,0.64,1) both' }}
            >
              {(opts.title || opts.message) && (
                <div className="px-4 pt-3 pb-3 text-center border-b" style={{ borderColor: 'var(--separator)' }}>
                  {opts.title && <p className="text-[13px] font-semibold text-label-secondary">{opts.title}</p>}
                  {opts.message && <p className="text-[12px] text-label-tertiary mt-0.5 leading-relaxed whitespace-pre-line">{opts.message}</p>}
                </div>
              )}
              {opts.options.map((o, i) => (
                <button
                  key={o.id}
                  onClick={() => close(o.id)}
                  className="w-full py-3.5 text-[17px] pressable"
                  style={{ color: o.destructive ? 'var(--color-destructive)' : 'var(--accent-text)', borderTop: i > 0 ? '1px solid var(--separator)' : undefined }}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <button
              onClick={() => close(null)}
              className="material-thick w-full py-3.5 rounded-[16px] text-[17px] font-semibold pressable"
              style={{ color: 'var(--accent-text)', animation: 'slideUpIn 0.3s cubic-bezier(0.34,1.2,0.64,1) both' }}
            >
              キャンセル
            </button>
          </div>
        </div>,
        document.body,
      )}
    </ActionSheetContext.Provider>
  );
}

export function useActionSheet() {
  return useContext(ActionSheetContext);
}

import type { ReactNode } from 'react';
import { useImportant } from '../../lib/important';

/** 重要な予定（★）のカードを、オレンジの枠と★で目立たせる（カレンダーのリスト・日付のパネル） */
export default function ImportantFrame({ id, children }: { id: string; children: ReactNode }) {
  const on = useImportant().has(id);
  return (
    <div className="relative">
      {children}
      {on && (
        <>
          <span aria-hidden className="absolute inset-0 rounded-[12px] pointer-events-none" style={{ boxShadow: 'inset 0 0 0 2px #f59e0b' }} />
          <span aria-label="重要" className="absolute -top-px right-2 px-1.5 rounded-b-[6px] text-[11px] font-bold leading-[18px] text-white pointer-events-none" style={{ backgroundColor: '#f59e0b' }}>★ 重要</span>
        </>
      )}
    </div>
  );
}

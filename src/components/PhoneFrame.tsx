import { useState, type ReactNode } from 'react';
import WidgetPreviewModal from './WidgetPreviewModal';

function StatusBar() {
  return (
    <div className="absolute top-0 left-0 right-0 h-11 flex items-center justify-between px-7 z-[55] pointer-events-none select-none">
      <span className="text-white text-[15px] font-semibold tracking-tight">9:41</span>
      <div className="flex items-center gap-[6px]">
        {/* Signal */}
        <svg width="17" height="12" viewBox="0 0 17 12" fill="white">
          <rect x="0"   y="8"  width="3" height="4" rx="0.6" opacity="1"/>
          <rect x="4.5" y="5"  width="3" height="7" rx="0.6" opacity="1"/>
          <rect x="9"   y="2"  width="3" height="10" rx="0.6" opacity="1"/>
          <rect x="13.5" y="0" width="3" height="12" rx="0.6" opacity="0.3"/>
        </svg>
        {/* Wi-Fi */}
        <svg width="16" height="12" viewBox="0 0 24 18" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round">
          <path d="M1.5 7.5C5.9 3.1 18.1 3.1 22.5 7.5" opacity="0.3"/>
          <path d="M5 11C8.1 7.9 15.9 7.9 19 11"/>
          <path d="M8.5 14.5C10.3 12.7 13.7 12.7 15.5 14.5"/>
          <circle cx="12" cy="17" r="1.5" fill="white" stroke="none"/>
        </svg>
        {/* Battery */}
        <div className="flex items-center gap-[1px]">
          <div className="w-[25px] h-[12px] border-[1.5px] border-white/70 rounded-[3px] p-[1.5px]">
            <div className="bg-white w-[16px] h-full rounded-[1px]" />
          </div>
          <div className="w-[2px] h-[5px] bg-white/70 rounded-r-sm" />
        </div>
      </div>
    </div>
  );
}

interface Props {
  children: ReactNode;
}

export default function PhoneFrame({ children }: Props) {
  const [showPreview, setShowPreview] = useState(false);

  return (
    <>
      {/* デスクトップ: スマホフレーム */}
      <div className="hidden sm:flex min-h-screen items-center justify-center bg-[#0d0d0d] relative">
        <div
          className="relative flex-shrink-0"
          style={{ width: 390, height: 'min(844px, calc(100vh - 48px))' }}
        >
          {/* 物理フレーム */}
          <div
            className="absolute inset-0 rounded-[52px] border-[10px] border-[#3a3a3c]"
            style={{
              boxShadow:
                '0 60px 120px rgba(0,0,0,0.9), 0 0 0 0.5px rgba(255,255,255,0.05) inset',
            }}
          />

          {/* スクリーン ─ transform により position:fixed 子要素のコンテナになる */}
          <div
            className="absolute inset-[10px] rounded-[42px] bg-bg-primary overflow-hidden"
            style={{ transform: 'translateZ(0)' }}
          >
            <StatusBar />

            {/* Dynamic Island */}
            <div className="absolute top-[10px] left-1/2 -translate-x-1/2 w-[120px] h-[34px] bg-black rounded-full z-[60] pointer-events-none" />

            {/* アプリコンテンツ */}
            <div
              className="absolute inset-0 overflow-y-auto overflow-x-hidden"
              style={{ paddingTop: 44, scrollbarWidth: 'none' }}
            >
              {children}
            </div>

            {/* ホームインジケーター */}
            <div className="absolute bottom-[6px] left-1/2 -translate-x-1/2 w-32 h-[5px] bg-white/25 rounded-full z-[60] pointer-events-none" />
          </div>

          {/* 電源ボタン (右) */}
          <div className="absolute right-[-2px] top-[160px] w-[3px] h-[80px] bg-[#4a4a4c] rounded-r" />
          {/* ボリューム上 (左) */}
          <div className="absolute left-[-2px] top-[140px] w-[3px] h-[44px] bg-[#4a4a4c] rounded-l" />
          {/* ボリューム下 (左) */}
          <div className="absolute left-[-2px] top-[196px] w-[3px] h-[44px] bg-[#4a4a4c] rounded-l" />
          {/* サイレントスイッチ (左) */}
          <div className="absolute left-[-2px] top-[100px] w-[3px] h-[28px] bg-[#4a4a4c] rounded-l" />
        </div>
        {/* ウィジェットプレビューボタン */}
        <button
          onClick={() => setShowPreview(true)}
          className="absolute bottom-8 right-8 flex flex-col items-center gap-1.5 group"
        >
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center transition-colors"
            style={{ background: 'rgba(255,255,255,0.08)', border: '0.5px solid rgba(255,255,255,0.12)' }}
          >
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
              <rect x="1" y="1" width="8" height="8" rx="2" fill="rgba(255,255,255,0.7)" />
              <rect x="13" y="1" width="8" height="8" rx="2" fill="rgba(255,255,255,0.7)" />
              <rect x="1" y="13" width="8" height="8" rx="2" fill="rgba(255,255,255,0.7)" />
              <rect x="13" y="13" width="8" height="8" rx="2" fill="rgba(255,255,255,0.35)" />
            </svg>
          </div>
          <span className="text-[10px] text-white/40 group-hover:text-white/60 transition-colors">ウィジェット</span>
        </button>

        {showPreview && <WidgetPreviewModal onClose={() => setShowPreview(false)} />}
      </div>

      {/* スマホ実機: フレームなし、そのまま表示 */}
      <div className="sm:hidden">
        {children}
      </div>
    </>
  );
}

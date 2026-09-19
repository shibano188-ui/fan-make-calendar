import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ChevronsDown, ChevronsUp } from 'lucide-react';
import type { Work } from '../lib/api';
import { haptic } from '../lib/haptics';

// 上部の作品の並び（TimeTree 風）。カレンダーと探すで共通。
// 押すとその作品を隠す（もう一度で戻す）。入りきらない分は横にスクロールするか、右端の︾で広げて選ぶ。
// 広げたときは下の中身を縮めず、上に重ねる。ここだけスクロールできる。

export default function WorkChipsRow({ works, colors, images, excluded, onToggle, onShowAll, trailing }: {
  works: Work[];
  colors: Map<string, string>;
  images: Record<string, string>;
  excluded: Set<string>;
  onToggle: (id: string) => void;
  onShowAll: () => void;
  /** 並びの最後に足すもの（探すの「＋作品」など） */
  trailing?: ReactNode;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [top, setTop] = useState(0);
  useLayoutEffect(() => {
    if (open && rowRef.current) setTop(rowRef.current.getBoundingClientRect().top);
  }, [open]);

  const chips = works.map((w) => (
    <WorkChip key={w.id} work={w} color={colors.get(w.id)} image={images[w.id]}
      hidden={excluded.has(w.id)} onClick={() => onToggle(w.id)} />
  ));

  return (
    <>
      <div ref={rowRef} className="flex items-center gap-1 mt-1.5">
        <div className="flex-1 min-w-0 flex gap-1.5 overflow-x-auto no-scrollbar overscroll-x-contain">
          {chips}
          {trailing}
        </div>
        <button onClick={() => { haptic.select(); setOpen(true); }} aria-label="作品をすべて表示"
          className="pressable flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-label-secondary">
          <ChevronsDown size={18} />
        </button>
      </div>

      {open && createPortal(
        <>
          <div className="fixed inset-0" style={{ zIndex: 90, top, backgroundColor: 'rgba(0,0,0,0.25)' }}
            onClick={() => setOpen(false)} />
          <div className="fixed inset-x-0 max-w-app mx-auto px-3 pt-0.5 pb-3 rounded-b-[16px] shadow-float flex flex-col"
            style={{ zIndex: 91, top, maxHeight: `calc(100dvh - ${top}px - 110px)`, backgroundColor: 'var(--bg-primary)' }}>
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                {chips}
                {trailing}
              </div>
            </div>
            <div className="flex items-center gap-3 pt-2.5 text-[12px] font-medium">
              {excluded.size > 0 && (
                <button onClick={() => { haptic.select(); onShowAll(); }} className="pressable" style={{ color: 'var(--accent-color)' }}>
                  すべて表示
                </button>
              )}
              <button onClick={() => { haptic.select(); setOpen(false); }} aria-label="閉じる"
                className="pressable ml-auto w-7 h-7 rounded-full flex items-center justify-center text-label-secondary">
                <ChevronsUp size={18} />
              </button>
            </div>
          </div>
        </>,
        document.body,
      )}
    </>
  );
}

/** 作品の並びの1つ。左に作品の画像（無ければ作品カラーの四角）。隠している作品は薄くする */
function WorkChip({ work, color, image, hidden, onClick }: {
  work: Work; color?: string; image?: string; hidden: boolean; onClick: () => void;
}) {
  return (
    <button onClick={onClick} aria-pressed={!hidden} title={work.name}
      className="pressable flex-shrink-0 flex items-center gap-1.5 h-7 pl-1 pr-2.5 rounded-full max-w-[11rem]"
      style={{ backgroundColor: 'var(--fill-tertiary)', opacity: hidden ? 0.4 : 1 }}>
      {image
        ? <img src={image} alt="" className="w-5 h-5 rounded-[5px] object-cover flex-shrink-0" />
        : <span className="w-5 h-5 rounded-[5px] flex-shrink-0" style={{ backgroundColor: color ?? 'var(--accent-color)' }} />}
      <span className={`text-[12px] font-medium truncate ${hidden ? 'line-through' : ''}`}>{work.name}</span>
    </button>
  );
}

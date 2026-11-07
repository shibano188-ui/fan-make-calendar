import { useState } from 'react';
import { ImageOff } from 'lucide-react';
import OptImg from '../ui/OptImg';

/** 詳細画面の画像カルーセル。複数画像は横スワイプ＋ドット。詳細では全体を見せたいので object-contain。 */
export default function ImageCarousel({ images, alt }: { images: string[]; alt: string }) {
  const [idx, setIdx] = useState(0);

  if (images.length === 0) {
    return (
      <div className="w-full aspect-square flex items-center justify-center" style={{ backgroundColor: 'var(--fill-quaternary)' }}>
        <ImageOff size={36} className="text-label-tertiary" />
      </div>
    );
  }

  return (
    <div className="relative w-full aspect-square" style={{ backgroundColor: 'var(--fill-quaternary)' }}>
      <div
        className="w-full h-full flex overflow-x-auto no-scrollbar snap-x snap-mandatory"
        onScroll={(e) => {
          const el = e.currentTarget;
          setIdx(Math.round(el.scrollLeft / el.clientWidth));
        }}
      >
        {images.map((src, i) => (
          <OptImg key={i} src={src} w={828} alt={alt} className="w-full h-full object-contain flex-shrink-0 snap-center" />
        ))}
      </div>
      {images.length > 1 && (
        // 何枚目か。地が白に近いので、黒い点（いまの1枚は長く）
        <div className="absolute bottom-2.5 left-1/2 -translate-x-1/2 flex items-center gap-1 px-1.5 py-1 rounded-full" style={{ backgroundColor: 'color-mix(in srgb, var(--bg-primary) 70%, transparent)' }}>
          {images.map((_, i) => (
            <span
              key={i}
              className="h-1.5 rounded-full transition-all"
              style={{ width: i === idx ? 14 : 6, backgroundColor: i === idx ? 'var(--label-primary)' : 'var(--label-tertiary)' }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

import { useState } from 'react';
import { ImageOff } from 'lucide-react';
import OptImg from '../ui/OptImg';

/** 詳細画面の画像カルーセル。複数画像は横スワイプ＋ドット。詳細では全体を見せたいので object-contain。 */
export default function ImageCarousel({ images, alt }: { images: string[]; alt: string }) {
  const [idx, setIdx] = useState(0);

  if (images.length === 0) {
    return (
      <div className="w-full aspect-square bg-fill-3 flex items-center justify-center">
        <ImageOff size={36} className="text-label-tertiary" />
      </div>
    );
  }

  return (
    <div className="relative w-full aspect-square bg-fill-3">
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
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5">
          {images.map((_, i) => (
            <span
              key={i}
              className="w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: i === idx ? 'var(--accent-color)' : 'rgba(255,255,255,0.5)' }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

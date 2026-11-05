import { useEffect, useState } from 'react';
import { loadIconStyles, onIconStylesChange, iconStyleOf, workIconUrl } from '../../lib/pixelIcon';

// ボード表示の作品の点。作品の画像（workImages.ts）を選んだ見た目にしたもの。無ければ作品の色の丸

export type WorkIcons = Record<string, { src: string; pixel: boolean }>;

/** 作品の画像を、選んだ見た目（丸いドット絵・背景を抜いたドット絵・写真のまま）にしたもの */
export function useWorkIcons(workImages: Record<string, string>): WorkIcons {
  const [styles, setStyles] = useState(loadIconStyles);
  useEffect(() => onIconStylesChange(() => setStyles(loadIconStyles())), []);
  const [icons, setIcons] = useState<WorkIcons>({});
  useEffect(() => {
    let alive = true;
    Promise.all(Object.entries(workImages).map(async ([id, src]) => {
      const st = iconStyleOf(styles, id);
      const url = await workIconUrl(src, st);
      return [id, url ? { src: url, pixel: st.mode !== 'photo' } : null] as const;
    })).then((list) => {
      if (!alive) return;
      const next: WorkIcons = {};
      for (const [id, v] of list) if (v) next[id] = v;
      setIcons(next);
    });
    return () => { alive = false; };
  }, [workImages, styles]);
  return icons;
}

export function WorkDot({ workId, size, color, icons }: { workId?: string; size: number; color?: string; icons: WorkIcons }) {
  const ic = workId ? icons[workId] : undefined;
  if (ic) {
    return (
      <img src={ic.src} alt="" width={size} height={size} className="block flex-shrink-0"
        style={ic.pixel
          ? { width: size, height: size, imageRendering: 'pixelated' }
          : { width: size, height: size, borderRadius: '50%', objectFit: 'cover', boxShadow: '0 0 0 1.5px var(--bg-primary)' }} />
    );
  }
  const s = Math.round(size * 0.42);
  return <span className="block rounded-full flex-shrink-0" style={{ width: s, height: s, margin: (size - s) / 2 - 1, backgroundColor: color ?? 'var(--label-tertiary)' }} />;
}

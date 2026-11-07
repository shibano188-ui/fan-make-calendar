import { useEffect, useMemo, useState } from 'react';

// ボードのカレンダーの点に使う画像（2026-11-07 柴野「作品のアイコンと同じにもできつつ、別にも決めたい」）。
// 決めていない作品は、作品のアイコン（workImages.ts）をそのまま使う。
//   値が data URL … 点だけ別の写真
//   値が ''       … 作品のアイコンがあっても、点は作品の色の丸
// この端末にだけ覚える（ドット絵の見た目 fan_work_icon_styles と同じ）

const KEY = 'fan_cal_dot_images';
const CHANGE = 'fan-cal-dot-images';

export function loadCalDotImages(): Record<string, string> {
  try { const v = JSON.parse(localStorage.getItem(KEY) ?? '{}'); return v && typeof v === 'object' ? v : {}; } catch { return {}; }
}

/** img: data URL＝別の写真 / ''＝色の丸 / null＝作品のアイコンと同じに戻す */
export function setCalDotImage(workId: string, img: string | null): void {
  const all = loadCalDotImages();
  if (img === null) delete all[workId]; else all[workId] = img;
  try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* 容量超過でも表示は続ける */ }
  window.dispatchEvent(new Event(CHANGE));
}

/** 点に使う画像（作品 id → 画像）。作品のアイコンと、点だけの設定を重ねたもの */
export function useCalDotImages(workImages: Record<string, string>): { images: Record<string, string>; own: Record<string, string> } {
  const [own, setOwn] = useState(loadCalDotImages);
  useEffect(() => {
    const on = () => setOwn(loadCalDotImages());
    window.addEventListener(CHANGE, on);
    return () => window.removeEventListener(CHANGE, on);
  }, []);
  // 毎回作り直すと、ドット絵を作り直す処理（useWorkIcons）が止まらなくなるので、中身が変わったときだけ作る
  const images = useMemo(() => {
    const m: Record<string, string> = { ...workImages };
    for (const [id, v] of Object.entries(own)) { if (v) m[id] = v; else delete m[id]; }
    return m;
  }, [workImages, own]);
  return { images, own };
}

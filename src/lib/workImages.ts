import { pushAppState } from './appState';

// 作品ごとの画像（カレンダー上部の作品の並びで、名前の左に出す）。
// 無い作品は作品カラーの四角を出す。保存の仕方は作品カラー（workColors.ts）と同じで、
// localStorage が正、アカウントへは appState で同期する（sql/2026-09-19-work-images.sql）。

const STORAGE_KEY = 'fan_work_images';
/** 保存する大きさ。表示は16〜20pxなので、Retina の3倍でも足りる */
const SIZE = 96;

export function loadWorkImages(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}'); } catch { return {}; }
}

function save(all: Record<string, string>) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(all)); } catch { /* 容量超過でも表示は続ける */ }
  pushAppState('work_images', all);
  window.dispatchEvent(new Event('fan-work-images'));
}

export function setWorkImage(workId: string, dataUrl: string | null) {
  const all = loadWorkImages();
  if (dataUrl) all[workId] = dataUrl; else delete all[workId];
  save(all);
}

/** 選んだ画像（data URL）を真ん中で正方形に切り抜き、96px の JPEG にする */
export function toWorkImage(dataUrl: string): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const side = Math.min(img.width, img.height);
      const canvas = document.createElement('canvas');
      canvas.width = SIZE;
      canvas.height = SIZE;
      const ctx = canvas.getContext('2d');
      if (!ctx) { resolve(null); return; }
      // 透過のある画像を JPEG にすると黒く落ちるので、白を敷いてから描く
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, SIZE, SIZE);
      ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, SIZE, SIZE);
      resolve(canvas.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

export function fileToDataUrl(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

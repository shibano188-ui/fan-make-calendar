import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';
import { openInApp } from './openExternal';

// 画像を X などへ共有する（今月のまとめ画像・2026-11-27 柴野「X に共有できるようにしたい。ダウンロードリンク付きで」）。
// X の投稿画面（intent）には画像を付けられないので、画像は OS の共有シートで渡し、本文にダウンロードの案内のリンクを入れる。
//   アプリ: 画像をいったん端末に書き出して共有シートへ（@capacitor/filesystem が入ったビルドから。無い版は下へ）
//   ブラウザ: 画像ごと共有できるならそれで。できない（PC など）なら画像を保存して、X の投稿画面を開く
export const GET_URL = 'https://fanhive.jp/get.html';

function download(blob: Blob, name: string): void {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

const toBase64 = (blob: Blob) => new Promise<string>((ok, ng) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1] ?? ''); r.onerror = ng; r.readAsDataURL(blob); });

/** この端末で画像を共有・保存できるか。アプリは @capacitor/filesystem が入った版から
 *  （Android は Web が先に新しくなるので、古いアプリでは出さない） */
export function canShareImage(): boolean {
  if (!Capacitor.isNativePlatform()) return true;
  return Capacitor.isPluginAvailable('Filesystem') && Capacitor.isPluginAvailable('Share');
}

/** 画像を共有する。text はハッシュタグまで（リンクはこちらで足す） */
export async function shareImage(blob: Blob, name: string, text: string): Promise<'shared' | 'saved' | 'cancel'> {
  const body = `${text}\n${GET_URL}`;
  if (Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('Filesystem') && Capacitor.isPluginAvailable('Share')) {
    try {
      const { Filesystem, Directory } = await import('@capacitor/filesystem');
      const file = await Filesystem.writeFile({ path: name, data: await toBase64(blob), directory: Directory.Cache });
      await Share.share({ text: body, files: [file.uri] });
      return 'shared';
    } catch { return 'cancel'; }
  }
  const file = new File([blob], name, { type: blob.type || 'image/png' });
  if (typeof navigator !== 'undefined' && navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], text: body }); return 'shared'; } catch { return 'cancel'; }
  }
  download(blob, name);
  void openInApp(`https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(GET_URL)}`);
  return 'saved';
}

/** 画像を保存する（アプリでは共有シートの「画像を保存」から） */
export async function saveImage(blob: Blob, name: string): Promise<void> {
  if (Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('Filesystem') && Capacitor.isPluginAvailable('Share')) { await shareImage(blob, name, ''); return; }
  download(blob, name);
}

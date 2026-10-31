import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';
import type { CalendarEvent } from '../types';
import { itemDateLines } from '../design/tokens';
import { openInApp } from './openExternal';

// 予定の共有（2026-10-04 柴野）。本文は「タイトル・日付・#作品名 #FanHive」。詳細ページとホームのストーリーで共通。
// リンクはその予定の共有ページ（/e/:id・2026-10-09）。X のカードはその予定の画像（api/_sharePage.ts）で出て、
// 押した人はアプリと同じ詳細を見て、♡・通知からアプリに案内される（前は LP を載せていた）
// X のボタンはアプリ内ブラウザを通さず OS に渡す（2026-10-31 柴野「X のアプリを開いてほしい」）。
// LINE など X 以外へは OS の共有シートから送る

/** X のハッシュタグにできない文字（記号・空白）を落とす。「ハイキュー!!」→「#ハイキュー」 */
function toHashtag(name: string): string {
  const body = name.replace(/[^\p{L}\p{N}_ー]/gu, '');
  return body ? `#${body}` : '';
}

function shareText(e: CalendarEvent, workName?: string | null): string {
  const tag = workName ? toHashtag(workName) : '';
  return [e.title, ...itemDateLines(e), [tag, '#FanHive'].filter(Boolean).join(' ')].join('\n');
}

const shareUrl = (e: CalendarEvent) => `https://fanhive.jp/e/${e.id}`;

export function shareToX(e: CalendarEvent, workName?: string | null): void {
  void openInApp(`https://x.com/intent/tweet?text=${encodeURIComponent(shareText(e, workName))}&url=${encodeURIComponent(shareUrl(e))}`);
}

/** OS の共有シートを出せるか。プラグインの無い古い Android アプリと、対応していないブラウザでは出せない */
export async function canShareToApps(): Promise<boolean> {
  if (!Capacitor.isPluginAvailable('Share')) return false;
  return Share.canShare().then((r) => r.value).catch(() => false);
}

export async function shareToApps(e: CalendarEvent, workName?: string | null): Promise<void> {
  // 途中で閉じると例外になるが、何もしなくてよい
  await Share.share({ text: shareText(e, workName), url: shareUrl(e) }).catch(() => {});
}

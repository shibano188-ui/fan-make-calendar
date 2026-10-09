import type { CalendarEvent } from '../types';
import { itemDateLines } from '../design/tokens';
import { openExternal } from './openExternal';

// X で共有（2026-10-04 柴野）。本文は「タイトル・日付・#作品名 #FanHive」。詳細ページとホームのストーリーで共通。
// リンクはその予定の共有ページ（/e/:id・2026-10-09）。X のカードはその予定の画像（api/_sharePage.ts）で出て、
// 押した人はアプリと同じ詳細を見て、♡・通知からアプリに案内される（前は LP を載せていた）

/** X のハッシュタグにできない文字（記号・空白）を落とす。「ハイキュー!!」→「#ハイキュー」 */
function toHashtag(name: string): string {
  const body = name.replace(/[^\p{L}\p{N}_ー]/gu, '');
  return body ? `#${body}` : '';
}

export function shareToX(e: CalendarEvent, workName?: string | null): void {
  const tag = workName ? toHashtag(workName) : '';
  const text = [e.title, ...itemDateLines(e), [tag, '#FanHive'].filter(Boolean).join(' ')].join('\n');
  void openExternal(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(`https://fanhive.jp/e/${e.id}`)}`);
}

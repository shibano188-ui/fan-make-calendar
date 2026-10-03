import type { CalendarEvent } from '../types';
import { itemDateLines } from '../design/tokens';
import { openExternal } from './openExternal';

// X で共有（2026-10-04 柴野）。公式サイトではなく FanHive の LP を載せ、見た人がアプリに来られるようにする。
// 本文は「タイトル・日付・#作品名 #FanHive」。LP は横長のプレビュー画像を持っているので大きなカードで出る。
// 詳細ページとホームのストーリーで共通

const SHARE_LP_URL = 'https://fanhive.jp/lp';

/** X のハッシュタグにできない文字（記号・空白）を落とす。「ハイキュー!!」→「#ハイキュー」 */
function toHashtag(name: string): string {
  const body = name.replace(/[^\p{L}\p{N}_ー]/gu, '');
  return body ? `#${body}` : '';
}

export function shareToX(e: CalendarEvent, workName?: string | null): void {
  const tag = workName ? toHashtag(workName) : '';
  const text = [e.title, ...itemDateLines(e), [tag, '#FanHive'].filter(Boolean).join(' ')].join('\n');
  void openExternal(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(SHARE_LP_URL)}`);
}

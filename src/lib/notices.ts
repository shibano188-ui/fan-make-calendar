import type { Notice } from './api';

// お知らせ履歴の「未読」判定。値下げの未読判定（priceAlerts.ts）と同じ考え方で、
// 端末ローカルに「いつまで見たか」だけを持つ。消えても最悪バッジがもう一度出るだけ
// （中身はサーバーにあるので失われない）。

const SEEN_KEY = 'fan_notices_seen_v1';

export function getNoticesSeenAt(): string {
  try { return localStorage.getItem(SEEN_KEY) ?? ''; } catch { return ''; }
}

export function markNoticesSeen(at: string = new Date().toISOString()): void {
  try { localStorage.setItem(SEEN_KEY, at); } catch { /* ignore */ }
}

export function unseenNotices(notices: Notice[]): Notice[] {
  const seen = getNoticesSeenAt();
  return notices.filter((n) => n.createdAt > seen);
}

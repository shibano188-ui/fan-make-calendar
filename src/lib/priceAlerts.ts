import type { PriceChange } from './api';

// 値下げ・再入荷の「未読」判定。端末ローカルにしか無いが、消えても実害が無い
// （最悪もう一度バッジが出るだけ）ので user_app_state には載せない。
// ここで消してよいのは「いつまで見たか」だけ ＝ 中身はサーバーにある。

const SEEN_KEY = 'fan_price_alerts_seen_v1';

export function getPriceAlertsSeenAt(): string {
  try { return localStorage.getItem(SEEN_KEY) ?? ''; } catch { return ''; }
}

export function markPriceAlertsSeen(at: string = new Date().toISOString()): void {
  try { localStorage.setItem(SEEN_KEY, at); } catch { /* ignore */ }
}

/** まだ見ていないもの。1件ずつ通知すると煩わしいので、ホームではこの「数」だけ出す。 */
export function unseenChanges(changes: PriceChange[]): PriceChange[] {
  const seen = getPriceAlertsSeenAt();
  return changes.filter((c) => c.createdAt > seen);
}

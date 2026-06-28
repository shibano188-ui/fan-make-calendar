// ローカル通知（ネイティブのみ）。
// 対象は「いいね済み × ベルON × 未来の日付」の予定。サーバー不要で端末にスケジュールする。
// トリガー: 予約受付開始 / 予約締切(前日・当日) / 発売・開催(前日・当日) の朝9時。
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import type { CalendarEvent } from '../types';
import { deriveItemType } from '../design/tokens';
import { loadNotifyEventIds } from './constants';

// ローカル通知が使えるか（ネイティブ かつ プラグイン同梱の新APK）。
// 旧APK/PWAでは false になり、機能ごと無効化される。
export const notificationsSupported = (): boolean =>
  Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('LocalNotifications');
const native = notificationsSupported;

const KINDS = ['pstart', 'pend1', 'pend0', 'd1', 'd0'] as const;
type Kind = (typeof KINDS)[number];

// 文字列→正整数ハッシュ（通知IDのベース。Javaのint上限内に収める）
function hashId(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h) % 100_000_000;
}
function notifId(eventId: string, kind: Kind): number {
  return hashId(eventId) * 10 + KINDS.indexOf(kind);
}

// 指定日付の朝 hour 時（端末ローカル）。dayOffset で前日等にずらす。
function morningOf(dateStr: string, dayOffset = 0, hour = 9): Date {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, 0, 0, 0);
  return d;
}

type Trigger = { kind: Kind; at: Date; title: string; body: string };

function triggersFor(e: CalendarEvent): Trigger[] {
  const out: Trigger[] = [];
  const tag = e.workName ? `【${e.workName}】` : '';
  const isGoods = deriveItemType(e) === 'goods';
  const onsaleWord = isGoods ? '発売' : '開催';

  if (e.preorderStart) {
    out.push({ kind: 'pstart', at: morningOf(e.preorderStart), title: `${tag}予約受付スタート`, body: `「${e.title}」の予約受付が始まります` });
  }
  if (e.preorderEnd) {
    out.push({ kind: 'pend1', at: morningOf(e.preorderEnd, -1), title: `${tag}予約締切まであと1日`, body: `「${e.title}」の予約は明日まで` });
    out.push({ kind: 'pend0', at: morningOf(e.preorderEnd), title: `${tag}本日が予約締切`, body: `「${e.title}」の予約は本日までです` });
  }
  if (e.date) {
    out.push({ kind: 'd1', at: morningOf(e.date, -1), title: `${tag}${onsaleWord}まであと1日`, body: `「${e.title}」は明日です` });
    out.push({ kind: 'd0', at: morningOf(e.date), title: `${tag}本日${onsaleWord}`, body: `「${e.title}」は本日です` });
  }
  return out;
}

/** 通知許可を確認・要求。許可されていれば true。 */
export async function ensurePermission(): Promise<boolean> {
  if (!native()) return false;
  const cur = await LocalNotifications.checkPermissions();
  if (cur.display === 'granted') return true;
  if (cur.display === 'denied') return false;
  const req = await LocalNotifications.requestPermissions();
  return req.display === 'granted';
}

/** 1予定分を組み直す（既存を消してから未来分のみ登録）。 */
export async function scheduleForEvent(e: CalendarEvent): Promise<void> {
  if (!native()) return;
  await cancelForEvent(e.id);
  const now = Date.now();
  const notifications = triggersFor(e)
    .filter((t) => t.at.getTime() > now)
    .map((t) => ({
      id: notifId(e.id, t.kind),
      title: t.title,
      body: t.body,
      schedule: { at: t.at },
      extra: { eventId: e.id },
    }));
  if (notifications.length) await LocalNotifications.schedule({ notifications });
}

/** 1予定分の通知を全キャンセル。 */
export async function cancelForEvent(eventId: string): Promise<void> {
  if (!native()) return;
  await LocalNotifications.cancel({ notifications: KINDS.map((k) => ({ id: notifId(eventId, k) })) });
}

/** 起動/復帰時に全体を組み直す。events から「いいね済み×ベルON×未来」を抽出。 */
export async function rescheduleAll(events: CalendarEvent[]): Promise<void> {
  if (!native()) return;
  const ok = await ensurePermission();
  if (!ok) return;
  const pending = await LocalNotifications.getPending();
  if (pending.notifications.length) await LocalNotifications.cancel(pending);
  const notifyIds = loadNotifyEventIds();
  const targets = events.filter((e) => e.likedByMe && notifyIds.has(e.id));
  for (const e of targets) await scheduleForEvent(e);
}

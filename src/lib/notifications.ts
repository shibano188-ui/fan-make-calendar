// ローカル通知（ネイティブのみ）。
// 対象は「いいね済み × ベルON × 未来の日付」の予定。サーバー不要で端末にスケジュールする。
// トリガー: 予約受付開始 / 予約締切(前日・当日) / 発売・開催(前日・当日) の朝9時。
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import type { CalendarEvent } from '../types';
import { deriveItemType } from '../design/tokens';
import { loadNotifyEventIds, loadNotifyLeadDays } from './constants';
import { waitForTrackingDecision } from './att';

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
  const lead = loadNotifyLeadDays(); // マイページの「◯日前」設定

  if (e.preorderStart) {
    out.push({ kind: 'pstart', at: morningOf(e.preorderStart, -lead), title: `${tag}受付開始まであと${lead}日`, body: `「${e.title}」の予約受付がもうすぐ始まります` });
  }
  if (e.preorderEnd) {
    out.push({ kind: 'pend1', at: morningOf(e.preorderEnd, -lead), title: `${tag}予約締切まであと${lead}日`, body: `「${e.title}」の予約締切が近づいています` });
    out.push({ kind: 'pend0', at: morningOf(e.preorderEnd), title: `${tag}本日が予約締切`, body: `「${e.title}」の予約は本日までです` });
  }
  // 来店予定があれば直近の来店日を基準にする（無ければイベント本来の日）
  const today = new Date().toISOString().slice(0, 10);
  const nextVisit = (e.visits ?? [])
    .map((v) => v.start).filter((d) => d >= today).sort()[0];
  const baseDate = nextVisit ?? e.date;
  if (baseDate) {
    const word = nextVisit ? '来店予定' : onsaleWord;
    out.push({ kind: 'd1', at: morningOf(baseDate, -lead), title: `${tag}${word}まであと${lead}日`, body: `「${e.title}」の${word}が近づいています` });
    out.push({ kind: 'd0', at: morningOf(baseDate), title: `${tag}本日${word}`, body: `「${e.title}」は本日です` });
  }
  return out;
}

/** 今の通知許可の状態。'prompt' は「まだ聞いていない」＝アプリから聞ける。
 *  'denied' はOSに断られた状態で、**アプリからはもう聞けない**（端末の設定を開いてもらうしかない）。 */
export async function notificationPermission(): Promise<'granted' | 'denied' | 'prompt' | 'unsupported'> {
  if (!native()) return 'unsupported';
  try {
    const cur = await LocalNotifications.checkPermissions();
    if (cur.display === 'granted') return 'granted';
    if (cur.display === 'denied') return 'denied';
    return 'prompt';
  } catch {
    return 'unsupported';
  }
}

/** 通知許可を確認・要求。許可されていれば true。 */
export async function ensurePermission(): Promise<boolean> {
  if (!native()) return false;
  const cur = await LocalNotifications.checkPermissions();
  if (cur.display === 'granted') return true;
  if (cur.display === 'denied') return false;
  // iOS: ATTの回答が出るまで通知を聞かない。**起動直後の rescheduleAll がここを通る**ので、
  // 塞がないと出したばかりのATTのダイアログが通知のダイアログに覆われて押せなくなる
  // （2026-08-17 実機で確認。Guideline 2.1 の「ATTが見つからない」の実態がこれ）。
  // ベルや設定から呼ばれるときは、ATTは既に答え済みなので即座に返る。
  await waitForTrackingDecision();
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

/** 無料お試しの終わりを知らせる通知のID。予定用のIDと衝突しない固定値にしてある。 */
const TRIAL_NOTIF_ID = 2_000_000_001;
/** 何日前に知らせるか。当日だと解約する時間が無く、遠すぎると忘れられる。 */
const TRIAL_LEAD_DAYS = 2;

/** 無料お試しの終わりを知らせる通知を組み直す。
 *  黙って請求が始まると、解約と低評価に直結する（本人が「知らされていない」と感じる）。
 *  お試し中でないときは登録しない。月額の更新日ごとに知らせるのは邪魔なだけなので。 */
export async function scheduleTrialEndReminder(expiresAt: string | null, isTrial: boolean): Promise<void> {
  if (!native()) return;
  await LocalNotifications.cancel({ notifications: [{ id: TRIAL_NOTIF_ID }] });
  if (!isTrial || !expiresAt) return;
  const at = new Date(Date.parse(expiresAt) - TRIAL_LEAD_DAYS * 86400000);
  if (at.getTime() <= Date.now()) return;
  await LocalNotifications.schedule({
    notifications: [{
      id: TRIAL_NOTIF_ID,
      title: '無料お試しがもうすぐ終わります',
      body: `${TRIAL_LEAD_DAYS}日後から料金がかかります。続けない場合はストアの定期購入から解約できます。`,
      schedule: { at },
    }],
  });
}

/** 1予定分の通知を全キャンセル。 */
export async function cancelForEvent(eventId: string): Promise<void> {
  if (!native()) return;
  await LocalNotifications.cancel({ notifications: KINDS.map((k) => ({ id: notifId(eventId, k) })) });
}

// iOSは**アプリあたり保留中の通知が64件まで**で、超えたぶんは黙って捨てられる
// （Androidにこの制限は無い）。1予定で最大5件積むので、ベルONが13件を超えると
// 上限に当たる。近い日のものから詰めて、無料お試しリマインダー用に少し空けておく。
const IOS_PENDING_LIMIT = 60;

/** 起動/復帰時に全体を組み直す。events から「いいね済み×ベルON×未来」を抽出。 */
export async function rescheduleAll(events: CalendarEvent[]): Promise<void> {
  if (!native()) return;
  const ok = await ensurePermission();
  if (!ok) return;
  const pending = await LocalNotifications.getPending();
  if (pending.notifications.length) await LocalNotifications.cancel(pending);

  const notifyIds = loadNotifyEventIds();
  const targets = events.filter((e) => e.likedByMe && notifyIds.has(e.id));
  const now = Date.now();

  // 予定ごとに登録すると、上限に当たったとき「先に処理した予定だけ入る」＝
  // 日付が遠いものが近いものを押し出すことがある。全部集めてから**近い順**に詰める。
  // （まとめて1回で渡すぶん、プラグイン呼び出しの往復も減る）
  const all = targets
    .flatMap((e) => triggersFor(e).map((t) => ({ e, t })))
    .filter(({ t }) => t.at.getTime() > now)
    .sort((a, b) => a.t.at.getTime() - b.t.at.getTime());

  const capped = Capacitor.getPlatform() === 'ios' ? all.slice(0, IOS_PENDING_LIMIT) : all;
  if (!capped.length) return;

  await LocalNotifications.schedule({
    notifications: capped.map(({ e, t }) => ({
      id: notifId(e.id, t.kind),
      title: t.title,
      body: t.body,
      schedule: { at: t.at },
      extra: { eventId: e.id },
    })),
  });
}

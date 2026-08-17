// プッシュ通知（FCM・ネイティブのみ）。
//
// ローカル通知（notifications.ts）との住み分け:
//   ローカル … 端末で完結する予定リマインダー（発売・締切の◯日前と当日の朝9時）
//   プッシュ … サーバーが**その場で**知らせたいこと（値下げ・再入荷・受付開始の検知）。
//              端末がスケジュールを持てない＝サーバーが起点になるものだけをこちらに置く。
//
// ここがやるのは「宛先の登録と後片付け」だけ。誰に送るかの判定（プレミアム・ミュート・いいね）は
// すべてサーバー側（api/refresh-offers.ts）にある。クライアントに判定を置くと、
// 送ってから捨てることになり通知が漏れる／二重になる。
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { supabase } from './supabase';
import { waitForTrackingDecision } from './att';

// iOS だけ別のプラグインを使う理由:
// @capacitor/push-notifications の iOS 実装が返すのは **APNsのデバイストークン**で、
// FCMの登録トークンではない（Android は内部でFCMを使うのでそのまま使える）。
// サーバー(api/_alerts.ts)は push_tokens の値をFCMトークンとして送るので、
// APNsトークンを入れると毎回「無効なトークン」で弾かれ、掃除ロジックに消される。
// iOS では @capacitor-firebase/messaging からFCMトークンを取って登録する。
// 配信中のAndroidには手を触れない（壊すリスクを負わない）。
const isIOS = (): boolean => Capacitor.getPlatform() === 'ios';

/** プッシュが使えるか（ネイティブ かつ プラグイン同梱のビルド）。旧APK・Webでは false。 */
export const pushSupported = (): boolean =>
  Capacitor.isNativePlatform() &&
  Capacitor.isPluginAvailable(isIOS() ? 'FirebaseMessaging' : 'PushNotifications');

const TOKEN_KEY = 'fan_push_token';

// リスナーの二重登録を防ぐフラグ（同じ通知で2回遷移させない）
let registered = false;
let openerBound = false;

/** 通知チャンネル。Android 8以降は必須で、無いとFCMが既定チャンネルにフォールバックし、
 *  重要度や表示名をこちらで決められない（AndroidManifest の default_notification_channel_id と揃える）。 */
const CHANNEL_ID = 'fanhive_default';

function rememberToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch { /* noop */ }
}

function lastToken(): string | null {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}

async function saveToken(userId: string, token: string): Promise<void> {
  await supabase.from('push_tokens').upsert(
    { user_id: userId, token, platform: Capacitor.getPlatform() === 'ios' ? 'ios' : 'android', updated_at: new Date().toISOString() },
    { onConflict: 'user_id,token' },
  );
  rememberToken(token);
}

/** 宛先を登録する。起動時とログイン直後に呼ぶ（同じトークンでも upsert で updated_at が延びる）。
 *
 *  ⚠️ google-services.json がまだ無いビルドでは Firebase の初期化に失敗して register() が投げる。
 *  プッシュが無いだけでアプリは動くので、握りつぶして黙って諦める。 */
export async function registerPush(userId: string): Promise<void> {
  if (!pushSupported()) return;

  if (isIOS()) {
    try {
      // ATTの回答が出るまで通知の許可を聞かない。
      // システムのダイアログを重ねると片方が表示されないまま消えることがあり、
      // 実際にATTのダイアログが通知のダイアログに覆われていた（2026-08-17 Guideline 2.1）。
      await waitForTrackingDecision();
      const { FirebaseMessaging } = await import('@capacitor-firebase/messaging');
      const cur = await FirebaseMessaging.checkPermissions();
      const state = cur.receive === 'prompt' || cur.receive === 'prompt-with-rationale'
        ? (await FirebaseMessaging.requestPermissions()).receive
        : cur.receive;
      if (state !== 'granted') return;

      // トークンは後から作り直されることがある（アプリ再インストール・復元など）。
      // 更新を取りこぼすと通知が届かなくなるので購読しておく。
      if (!registered) {
        registered = true;
        await FirebaseMessaging.addListener('tokenReceived', (e) => {
          if (e.token) void saveToken(userId, e.token);
        });
      }
      const { token } = await FirebaseMessaging.getToken();
      if (token) await saveToken(userId, token);
    } catch { /* Firebase未設定のビルド。プッシュ無しで動かす */ }
    return;
  }

  try {
    const cur = await PushNotifications.checkPermissions();
    // 通知はローカル通知の側で既に許可を取っていることが多い。まだなら1回だけ聞く。
    const state = cur.receive === 'prompt' || cur.receive === 'prompt-with-rationale'
      ? (await PushNotifications.requestPermissions()).receive
      : cur.receive;
    if (state !== 'granted') return;

    // 通知チャンネルを用意（同じidで何度呼んでも増えない）
    try {
      await PushNotifications.createChannel({
        id: CHANNEL_ID, name: 'お知らせ',
        description: '値下げ・受付開始・フォロー作品の新着',
        importance: 4, visibility: 1,
      });
    } catch { /* 非対応端末では何もしない */ }

    // ⚠️ ここで removeAllListeners() を呼んではいけない。
    // onPushOpened() が登録する**タップ用リスナーまで消える**（2つを await せず並行で呼ぶので、
    // 順序次第で「通知をタップしても何も起きない」になる）。二重登録は下のフラグで防ぐ。
    if (!registered) {
      registered = true;
      await PushNotifications.addListener('registration', (t) => { void saveToken(userId, t.value); });
      // 失敗しても再試行はしない（次の起動でまた register される）
      await PushNotifications.addListener('registrationError', () => { /* noop */ });
    }
    // ⚠️ google-services.json が無いビルドでは register() が**投げずに返ってこない**
    // （FirebaseAppの初期化に失敗したまま待ち続ける）。待ちっぱなしにしないよう打ち切る。
    // トークンは 'registration' イベントで届くので、ここで待つ必要はもともと無い。
    await Promise.race([
      PushNotifications.register(),
      new Promise((r) => setTimeout(r, 10_000)),
    ]);
  } catch { /* Firebase未設定のビルド。プッシュ無しで動かす */ }
}

/** 通知タップ時の遷移を配線する。
 *  1件の通知は data.eventId（その商品へ）、まとめの通知は data.path（まとめページへ）を持つ。 */
export async function onPushOpened(go: (path: string) => void): Promise<void> {
  if (!pushSupported() || openerBound) return;
  openerBound = true;
  const toPath = (data: { eventId?: string; path?: string } | undefined): string | null =>
    data?.path ?? (data?.eventId ? `/item/${data.eventId}` : null);
  try {
    if (isIOS()) {
      const { FirebaseMessaging } = await import('@capacitor-firebase/messaging');
      await FirebaseMessaging.addListener('notificationActionPerformed', (a) => {
        const path = toPath(a.notification.data as { eventId?: string; path?: string } | undefined);
        if (path) go(path);
      });
      return;
    }
    await PushNotifications.addListener('pushNotificationActionPerformed', (a) => {
      const path = toPath(a.notification.data as { eventId?: string; path?: string } | undefined);
      if (path) go(path);
    });
  } catch { /* noop */ }
}

// ─── フォロー作品の新着まとめ（毎朝9時・プレミアム）のON/OFF ──────────────
//
// ⚠️ 端末間同期（appState.ts の pushAppState）には**乗せない**。
// あちらは「デバイス間の同時同期」の判定で止まることがあり、そうなるとOFFがサーバーに
// 届かず「止めたのに送られ続ける」ことになる。通知の停止は必ず届く必要があるので直接書く。
const DIGEST_OFF_KEY = 'fan_new_events_digest_off';

/** まとめ通知を受け取るか。既定はON（オプトアウト方式）。 */
export function isDigestOn(): boolean {
  try { return localStorage.getItem(DIGEST_OFF_KEY) !== '1'; } catch { return true; }
}

export async function setDigestOn(userId: string, on: boolean): Promise<void> {
  try {
    if (on) localStorage.removeItem(DIGEST_OFF_KEY);
    else localStorage.setItem(DIGEST_OFF_KEY, '1');
  } catch { /* noop */ }
  await supabase.from('user_app_state').upsert(
    { user_id: userId, new_events_digest_off: !on, updated_at: new Date().toISOString() },
    { onConflict: 'user_id' },
  );
}

/** ログイン時にサーバーの設定を端末へ引き戻す（別端末で切った設定を尊重する）。 */
export async function loadDigestSetting(userId: string): Promise<void> {
  const { data } = await supabase.from('user_app_state').select('new_events_digest_off').eq('user_id', userId).maybeSingle();
  if (!data) return;
  try {
    if (data.new_events_digest_off === true) localStorage.setItem(DIGEST_OFF_KEY, '1');
    else localStorage.removeItem(DIGEST_OFF_KEY);
  } catch { /* noop */ }
}

/** ログアウト時に**この端末の宛先だけ**を消す。
 *  消さないと、次にこの端末を使う別アカウント宛の通知が前の持ち主に届く。
 *  他の端末の宛先（同じアカウントの別スマホ）は残す。 */
export async function unregisterPush(userId: string): Promise<void> {
  const token = lastToken();
  rememberToken(null);
  if (!token) return;
  await supabase.from('push_tokens').delete().eq('user_id', userId).eq('token', token);
}

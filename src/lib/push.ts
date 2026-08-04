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

/** プッシュが使えるか（ネイティブ かつ プラグイン同梱のAPK）。旧APK・Webでは false。 */
export const pushSupported = (): boolean =>
  Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('PushNotifications');

const TOKEN_KEY = 'fan_push_token';

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
  try {
    const cur = await PushNotifications.checkPermissions();
    // 通知はローカル通知の側で既に許可を取っていることが多い。まだなら1回だけ聞く。
    const state = cur.receive === 'prompt' || cur.receive === 'prompt-with-rationale'
      ? (await PushNotifications.requestPermissions()).receive
      : cur.receive;
    if (state !== 'granted') return;

    await PushNotifications.removeAllListeners();
    await PushNotifications.addListener('registration', (t) => { void saveToken(userId, t.value); });
    // 失敗しても再試行はしない（次の起動でまた register される）
    await PushNotifications.addListener('registrationError', () => { /* noop */ });
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
  if (!pushSupported()) return;
  try {
    await PushNotifications.addListener('pushNotificationActionPerformed', (a) => {
      const data = a.notification.data as { eventId?: string; path?: string } | undefined;
      const path = data?.path ?? (data?.eventId ? `/item/${data.eventId}` : null);
      if (path) go(path);
    });
  } catch { /* noop */ }
}

// ─── フォロー作品の新着まとめ（毎朝9時）のON/OFF ──────────────────────
//
// ⚠️ プレミアムの端末間同期（appState.ts の pushAppState）には**乗せない**。
// あちらはプレミアムのときしかサーバーへ書かないので、無料ユーザーがOFFにしても
// サーバーには届かず、止めたつもりで送られ続けることになる。ここは直接書く。
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

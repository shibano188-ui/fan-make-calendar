import { supabase } from './supabase';
import { clearAccountScopedCache } from './constants';
import { unregisterPush } from './push';
import type { User } from '@supabase/supabase-js';

// アカウント連携（匿名→メール恒久化＋デバイス間引き継ぎ）。
// 仕組み: リモートURL WebViewではGoogle OAuthが埋め込みWebView禁止で弾かれるため、
// リダイレクト不要の「メール6桁OTP」を主軸にする。
//   連携(初回・端末A): updateUser({email}) → 6桁OTP → verifyOtp({type:'email_change'})
//   ログイン(端末B):   signInWithOtp({email}) → 6桁OTP → verifyOtp({type:'email'})

export type AccountState = 'anonymous' | 'email';

export function accountState(user: User | null): AccountState {
  if (user && !user.is_anonymous && user.email) return 'email';
  return 'anonymous';
}

export function accountEmail(user: User | null): string | null {
  return user?.email ?? null;
}

const friendly = (msg: string): string => {
  const m = msg.toLowerCase();
  if (m.includes('already') && m.includes('registered')) return 'このメールアドレスは既に登録済みです。「別の端末で登録済み」からログインしてください。';
  if (m.includes('invalid') && m.includes('email')) return 'メールアドレスの形式が正しくありません。';
  if (m.includes('token') || m.includes('otp') || m.includes('expired')) return '確認コードが正しくないか、有効期限が切れています。';
  if (m.includes('rate') || m.includes('limit') || m.includes('after')) return '試行が多すぎます。しばらく待ってからお試しください。';
  if (m.includes('not found') || m.includes('signups not allowed')) return 'このメールアドレスは登録されていません。先に「メールで引き継ぎを設定」してください。';
  return msg;
};

type Result = { ok: true } | { ok: false; error: string };

/** 端末A: 現在の匿名アカウントにメールを紐づけ、確認コードを送信する。 */
export async function startEmailLink(email: string): Promise<Result> {
  const { error } = await supabase.auth.updateUser({ email: email.trim() });
  return error ? { ok: false, error: friendly(error.message) } : { ok: true };
}

/** 端末A: 送られた6桁コードで連携を確定（匿名→恒久・uidは維持）。 */
export async function verifyEmailLink(email: string, code: string): Promise<Result> {
  const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email_change' });
  return error ? { ok: false, error: friendly(error.message) } : { ok: true };
}

/** 端末B: 登録済みメールにログイン用コードを送信（新規作成はしない）。 */
export async function startEmailSignIn(email: string): Promise<Result> {
  const { error } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: false } });
  return error ? { ok: false, error: friendly(error.message) } : { ok: true };
}

/** 端末B: 6桁コードで既存アカウントにログイン（データが引き継がれる）。 */
export async function verifyEmailSignIn(email: string, code: string): Promise<Result> {
  const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' });
  return error ? { ok: false, error: friendly(error.message) } : { ok: true };
}

/**
 * この端末からログアウト（クラウド上のデータは残る。同じメールでログインすれば戻る）。
 *
 * サーバーのキャッシュ（いいね・カレンダー追加・リアクション）だけを捨て、
 * 端末にしか無いデータ（重要フラグ・通知ベル・非表示作品・作品ごとの色）は残す。
 * localStorage.clear() は後者まで消してしまい、再ログインしても復元できない。
 */
export async function signOutAccount(): Promise<Result> {
  // 先にこの端末のプッシュ宛先を消す（サインアウト後はRLSで自分の行を消せなくなる）。
  // 残すと、次にこの端末を使う別アカウント宛の通知が前の持ち主に届く。
  const { data } = await supabase.auth.getUser();
  if (data.user) await unregisterPush(data.user.id).catch(() => { /* 消せなくてもログアウトは続ける */ });
  const { error } = await supabase.auth.signOut();
  if (error) return { ok: false, error: friendly(error.message) };
  clearAccountScopedCache();
  window.location.href = '/';
  return { ok: true };
}

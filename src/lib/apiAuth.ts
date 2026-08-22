import { supabase } from './supabase';

/**
 * `api/` を叩くときの Authorization ヘッダ。
 *
 * サーバーは利用上限を **IPではなく user_id** で数える（api/_identity.ts）。
 * アプリは起動時に匿名サインインしているので、**メール登録の有無に関わらず**
 * ここでトークンが取れる。取れなければ空を返し、サーバー側はIPで数えるほうへ落ちる
 * （共有インテントからの起動直後など、セッション確立前に呼ばれる可能性があるため、
 *   ここで失敗しても機能を止めない）。
 */
export async function authHeaders(): Promise<Record<string, string>> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

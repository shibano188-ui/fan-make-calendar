import { supabase } from './supabase';
import { openExternal } from './openExternal';

// 「Googleで連携」（プレミアム・2026-10-06）。相手の Google に「FanHive」カレンダーを作り、サーバーが予定を書く。
// サーバー側は api/_gcal.ts（入口は api/ics?action=google-…）。
//
// ログインは外部ブラウザで行う（アプリ内の画面だと Google に弾かれる）。同意すると /api/google-callback に戻り、
// そこでカレンダーを作って最初の同期まで済ませる。アプリに戻ってきたら getGoogleLink で状態を読み直す。
//
// いいね・ここ行く!・自分用の予定を変えたら requestGoogleSync で差分を書く（毎日1回の見直しもサーバーで回している）。

export type GoogleLink = { calendarId: string | null; syncedAt: string | null; lastError: string | null };

// この端末で連携を確認できたか。連携していない人のために毎回 API を呼ばないための目印
const LINKED_KEY = 'fan_google_link_v1';

async function call(action: string): Promise<Response | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return null;
  // ⚠️ 相対パスにしないこと（iOS は capacitor://localhost から呼ぶ。account.ts と同じ）
  const apiBase = (import.meta.env.VITE_API_BASE as string | undefined) ?? '';
  return fetch(`${apiBase}/api/ics?action=${action}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
}

/** 連携の状態。表が無い環境（SQL を流す前）では undefined（ボタンを出さない） */
export async function getGoogleLink(userId: string): Promise<GoogleLink | null | undefined> {
  const { data, error } = await supabase.from('google_calendar_links')
    .select('calendar_id, synced_at, last_error').eq('user_id', userId).maybeSingle();
  if (error) return undefined;
  try {
    if (data) localStorage.setItem(LINKED_KEY, '1'); else localStorage.removeItem(LINKED_KEY);
  } catch { /* 保存できなくても動く */ }
  if (!data) return null;
  return { calendarId: data.calendar_id as string | null, syncedAt: data.synced_at as string | null, lastError: data.last_error as string | null };
}

/** 連携を始める（Google の同意画面を外部ブラウザで開く） */
export async function startGoogleLink(): Promise<boolean> {
  try {
    const r = await call('google-auth');
    if (!r?.ok) return false;
    const { url } = (await r.json()) as { url?: string };
    if (!url) return false;
    await openExternal(url);
    return true;
  } catch {
    return false;
  }
}

export async function syncGoogleNow(): Promise<boolean> {
  try {
    const r = await call('google-sync');
    if (!r?.ok) return false;
    return ((await r.json()) as { ok?: boolean }).ok === true;
  } catch {
    return false;
  }
}

export async function unlinkGoogleCalendar(): Promise<boolean> {
  try {
    const r = await call('google-unlink');
    try { localStorage.removeItem(LINKED_KEY); } catch { /* noop */ }
    return !!r?.ok;
  } catch {
    return false;
  }
}

// 目印はカレンダー連携の画面を開いたときにしか付かないので、付いていなければ起動ごとに1回だけ表を見に行く
// （連携してから画面を開かずにいいねした・別の端末で連携した、のときに同期されなかった。2026-10-06 柴野）
let checked: Promise<boolean> | null = null;
function isLinked(): Promise<boolean> {
  try { if (localStorage.getItem(LINKED_KEY) === '1') return Promise.resolve(true); } catch { /* 下で確かめる */ }
  if (!checked) {
    checked = supabase.auth.getSession()
      .then(({ data: { session } }) => (session ? getGoogleLink(session.user.id) : null))
      .then((l) => !!l && l.lastError !== 'revoked')
      .catch(() => false);
  }
  return checked;
}

let pending: ReturnType<typeof setTimeout> | undefined;
/** 予定を変えたあとに呼ぶ。連続した操作はまとめて1回にする */
export function requestGoogleSync(delayMs = 3000): void {
  clearTimeout(pending);
  pending = setTimeout(() => {
    void isLinked().then((linked) => { if (linked) void syncGoogleNow(); });
  }, delayMs);
}

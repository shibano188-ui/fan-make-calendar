import type { CalendarEvent } from '../types';
import { todayStr } from '../design/tokens';
import { resolveBuy } from './affiliate';
import { downloadICS } from './ics';

// Google Identity Services のトークンモデル（client_idのみ・secret不要・クライアント完結）。
// 「📅押す→Google認可→自分のGoogleカレンダーへ直接登録」。短命トークン(約1h)はキャッシュ、切れたら再ポップ。
/* eslint-disable @typescript-eslint/no-explicit-any */
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

export function isGoogleConfigured(): boolean {
  return !!CLIENT_ID;
}

let cachedToken = '';
let cachedExp = 0;

function loadGIS(): Promise<void> {
  return new Promise((resolve, reject) => {
    const w = window as any;
    let tries = 0;
    const check = () => {
      if (w.google?.accounts?.oauth2) return resolve();
      if (++tries > 50) return reject(new Error('GIS not loaded'));
      setTimeout(check, 100);
    };
    check();
  });
}

async function getToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedExp) return cachedToken;
  await loadGIS();
  const w = window as any;
  return new Promise<string>((resolve, reject) => {
    const tc = w.google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: 'https://www.googleapis.com/auth/calendar.events',
      callback: (resp: any) => {
        if (resp.access_token) {
          cachedToken = resp.access_token;
          cachedExp = Date.now() + ((resp.expires_in ?? 3600) * 1000 - 60000);
          resolve(resp.access_token);
        } else reject(new Error('no_token'));
      },
      error_callback: (err: any) => reject(err),
    });
    tc.requestAccessToken();
  });
}

function buildGoogleEvent(e: CalendarEvent): Record<string, unknown> | null {
  if (!e.date) return null;
  const summary = e.title;
  const description = [e.memo, resolveBuy(e).url || e.link].filter(Boolean).join('\n');
  if (!e.time) {
    const end = new Date((e.endDate || e.date) + 'T00:00:00');
    end.setDate(end.getDate() + 1); // 全日のendは排他的→+1日
    return { summary, description, start: { date: e.date }, end: { date: todayStr(end) } };
  }
  const tz = 'Asia/Tokyo';
  return {
    summary, description,
    start: { dateTime: `${e.date}T${e.time}:00`, timeZone: tz },
    end: { dateTime: `${e.endDate || e.date}T${e.endTime || e.time}:00`, timeZone: tz },
  };
}

async function addToGoogleCalendar(e: CalendarEvent): Promise<boolean> {
  const body = buildGoogleEvent(e);
  if (!body) return false;
  const token = await getToken();
  const r = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return r.ok;
}

export type AddResult = 'google' | 'ics' | 'fail';

/** カレンダー追加: Google連携があればGoogleへ直接登録、無ければ/失敗時はICSにフォールバック。 */
export async function addToCalendar(e: CalendarEvent): Promise<AddResult> {
  if (isGoogleConfigured()) {
    try { if (await addToGoogleCalendar(e)) return 'google'; } catch { /* fallback */ }
  }
  return downloadICS(e) ? 'ics' : 'fail';
}

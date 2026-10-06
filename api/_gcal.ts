import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createHash, randomBytes } from 'node:crypto';
import { waitUntil } from '@vercel/functions';
import { isPremium, loadCalendarItems, type CalendarItem } from './_calendarItems.js';

// 「Googleで連携」（2026-10-06）。相手の Google アカウントに「FanHive」カレンダーを作り、サーバーから予定を書く。
//
// 購読URL（api/ics）は Android のスマホだけでは Google に追加できない（アプリが cid を受け取って
// 「追加しました」と出るのに何も入らない）。こちらから書けば、スマホだけで完結し、すぐ反映され、作品ごとの色も付く。
//
// - スコープは calendar.app.created（このアプリが作ったカレンダーだけ触れる。機密性の低いスコープ）
// - ログインは外部ブラウザで行う（アプリ内の画面だと Google に弾かれる）。戻り先は /api/google-callback（vercel.json で ics に流す）
// - refresh token は google_calendar_links に置き、service_role だけが読む（本人も読めない列）
// - 予定IDは uid を16進にしたもの（Google の予定IDは a〜v と数字だけ）。対応表が要らない
// - 関数は増やさない（12個の上限）。api/ics.ts に相乗りしている

const SCOPE = 'https://www.googleapis.com/auth/calendar.app.created';
const REDIRECT_URI = 'https://fanhive.jp/api/google-callback';
const API = 'https://www.googleapis.com/calendar/v3';
// 公開値（src/lib/googleCalendar.ts と同じ）
const CLIENT_ID = process.env.VITE_GOOGLE_CLIENT_ID ?? '237162120701-ummv7jdacb5env21p424poecb513ts13.apps.googleusercontent.com';

// Google の予定の色（colorId 1〜11）。アプリの作品カラーに一番近いものを選ぶ
const GOOGLE_COLORS: [string, string][] = [
  ['1', '#7986cb'], ['2', '#33b679'], ['3', '#8e24aa'], ['4', '#e67c73'], ['5', '#f6bf26'], ['6', '#f4511e'],
  ['7', '#039be5'], ['8', '#616161'], ['9', '#3f51b5'], ['10', '#0b8043'], ['11', '#d50000'],
];

function rgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function nearestColorId(hex: string): string {
  const [r, g, b] = rgb(hex);
  let best = '1', bestD = Infinity;
  for (const [id, c] of GOOGLE_COLORS) {
    if (id === '8') continue; // グレーは選ばない（予定が沈んで見える）
    const [cr, cg, cb] = rgb(c);
    const d = (r - cr) ** 2 + (g - cg) ** 2 + (b - cb) ** 2;
    if (d < bestD) { bestD = d; best = id; }
  }
  return best;
}
// 作品カラーがまだ無い作品（端末で一度も開いていない）は、作品IDから決める
function colorIdFor(workId: string | null, workColors: Record<string, string>): string | undefined {
  if (!workId) return undefined;
  const hex = workColors[workId];
  if (hex && /^#[0-9a-f]{6}$/i.test(hex)) return nearestColorId(hex);
  const n = parseInt(createHash('sha1').update(workId).digest('hex').slice(0, 8), 16);
  const ids = GOOGLE_COLORS.map(([id]) => id).filter((id) => id !== '8');
  return ids[n % ids.length];
}

function googleEventId(uid: string): string {
  return Buffer.from(uid, 'utf8').toString('hex');
}

function addDay(d: string): string {
  const t = new Date(d + 'T00:00:00Z');
  t.setUTCDate(t.getUTCDate() + 1);
  return t.toISOString().slice(0, 10);
}

function eventBody(it: CalendarItem, colorId: string | undefined) {
  const when = it.time
    ? { start: { dateTime: `${it.start}T${it.time}:00`, timeZone: 'Asia/Tokyo' },
        end: { dateTime: `${it.end || it.start}T${it.time}:00`, timeZone: 'Asia/Tokyo' } }
    : { start: { date: it.start }, end: { date: addDay(it.end || it.start) } }; // 全日の end は排他的
  const body: Record<string, unknown> = {
    summary: it.summary,
    description: it.desc,
    ...when,
    transparency: 'transparent', // 発売日などで「予定あり」にしない
    ...(colorId ? { colorId } : {}),
    ...(/^https?:\/\//.test(it.url) ? { source: { title: 'FanHive', url: it.url } } : {}),
  };
  const h = createHash('sha1').update(JSON.stringify(body)).digest('hex').slice(0, 16);
  return { ...body, extendedProperties: { private: { h } } };
}

// ─── Google の API ───────────────────────────────────────────

async function tokenRequest(params: Record<string, string>): Promise<Record<string, unknown>> {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET ?? '', ...params }),
  });
  return (await r.json().catch(() => ({}))) as Record<string, unknown>;
}

class RevokedError extends Error {}

async function accessTokenFor(refreshToken: string): Promise<string> {
  const j = await tokenRequest({ grant_type: 'refresh_token', refresh_token: refreshToken });
  if (typeof j.access_token === 'string') return j.access_token;
  // 本人が Google 側で外した・テスト中で7日たった など
  if (j.error === 'invalid_grant') throw new RevokedError('revoked');
  throw new Error(`token: ${String(j.error ?? 'unknown')}`);
}

// 最初の同期で予定をまとめて作ると、Google が 403（rateLimitExceeded）や 429 で一時的に断ってくる。少し待って3回までやり直す
async function gfetch(token: string, path: string, init: RequestInit = {}): Promise<Response> {
  for (let i = 0; ; i++) {
    const r = await fetch(`${API}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    });
    const retry = r.status === 429 || r.status >= 500
      || (r.status === 403 && /rateLimitExceeded|userRateLimitExceeded|quotaExceeded/.test(await r.clone().text()));
    if (!retry || i >= 3) return r;
    await new Promise((ok) => setTimeout(ok, 1000 * 2 ** i));
  }
}

async function ensureCalendar(token: string, calendarId: string | null): Promise<string> {
  if (calendarId) {
    const r = await gfetch(token, `/calendars/${encodeURIComponent(calendarId)}`);
    if (r.ok) return calendarId;
    if (r.status !== 404 && r.status !== 410) throw new Error(`calendar get: ${r.status}`);
  }
  const r = await gfetch(token, '/calendars', {
    method: 'POST',
    body: JSON.stringify({ summary: 'FanHive', description: 'FanHive で保存した予定', timeZone: 'Asia/Tokyo' }),
  });
  if (!r.ok) throw new Error(`calendar create: ${r.status} ${await r.text()}`);
  return ((await r.json()) as { id: string }).id;
}

async function listExisting(token: string, calendarId: string): Promise<Map<string, string>> {
  const out = new Map<string, string>(); // 予定ID → 内容ハッシュ
  let pageToken = '';
  do {
    const q = new URLSearchParams({ maxResults: '2500', fields: 'items(id,extendedProperties),nextPageToken' });
    if (pageToken) q.set('pageToken', pageToken);
    const r = await gfetch(token, `/calendars/${encodeURIComponent(calendarId)}/events?${q}`);
    if (!r.ok) throw new Error(`events list: ${r.status}`);
    const j = (await r.json()) as { items?: { id: string; extendedProperties?: { private?: { h?: string } } }[]; nextPageToken?: string };
    for (const e of j.items ?? []) out.set(e.id, e.extendedProperties?.private?.h ?? '');
    pageToken = j.nextPageToken ?? '';
  } while (pageToken);
  return out;
}

async function inBatches<T>(list: T[], size: number, fn: (x: T) => Promise<void>): Promise<void> {
  for (let i = 0; i < list.length; i += size) await Promise.all(list.slice(i, i + size).map(fn));
}

// ─── 同期 ───────────────────────────────────────────────────

/** その人の FanHive カレンダーを、アプリのカレンダーと同じ中身にそろえる（差分だけ書く） */
export async function syncUser(db: SupabaseClient, userId: string): Promise<{ ok: boolean; error?: string }> {
  const { data: link } = await db.from('google_calendar_links')
    .select('refresh_token, calendar_id').eq('user_id', userId).maybeSingle();
  if (!link) return { ok: false, error: 'not_linked' };
  try {
    const token = await accessTokenFor(link.refresh_token as string);
    const calendarId = await ensureCalendar(token, (link.calendar_id as string | null) ?? null);

    // プレミアムが切れたら中身を空にする（購読URLと同じ）
    const items = (await isPremium(db, userId)) ? await loadCalendarItems(db, userId) : [];
    const { data: st } = await db.from('user_app_state').select('work_colors').eq('user_id', userId).maybeSingle();
    const workColors = ((st?.work_colors as Record<string, string> | null) ?? {});

    const want = new Map(items.map((it) => [googleEventId(it.uid), eventBody(it, colorIdFor(it.workId, workColors))]));
    const have = await listExisting(token, calendarId);
    const base = `/calendars/${encodeURIComponent(calendarId)}/events`;
    const errors: string[] = [];

    const put = async (id: string, body: object) => {
      const r = await gfetch(token, `${base}/${id}`, { method: 'PUT', body: JSON.stringify({ ...body, status: 'confirmed' }) });
      if (!r.ok) errors.push(`put ${r.status}`);
    };
    await inBatches([...want.entries()], 3, async ([id, body]) => {
      const h = (body.extendedProperties as { private: { h: string } }).private.h;
      if (have.has(id)) {
        if (have.get(id) !== h) await put(id, body);
        return;
      }
      const r = await gfetch(token, base, { method: 'POST', body: JSON.stringify({ id, ...body }) });
      // 409 = 前に消した同じIDの予定が残っている → 上書きで戻す
      if (r.status === 409) await put(id, body);
      else if (!r.ok) errors.push(`insert ${r.status} ${(await r.text()).slice(0, 120)}`);
    });
    await inBatches([...have.keys()].filter((id) => !want.has(id)), 5, async (id) => {
      const r = await gfetch(token, `${base}/${id}`, { method: 'DELETE' });
      if (!r.ok && r.status !== 404 && r.status !== 410) errors.push(`delete ${r.status}`);
    });

    await db.from('google_calendar_links').update({
      calendar_id: calendarId, synced_at: new Date().toISOString(), last_error: errors[0] ?? null,
    }).eq('user_id', userId);
    return errors.length ? { ok: false, error: errors[0] } : { ok: true };
  } catch (e) {
    const msg = e instanceof RevokedError ? 'revoked' : String((e as Error).message ?? e).slice(0, 200);
    await db.from('google_calendar_links').update({ last_error: msg }).eq('user_id', userId);
    return { ok: false, error: msg };
  }
}

// ─── 入口（api/ics.ts の ?action=… から呼ぶ） ─────────────────

function adminDb(): SupabaseClient {
  return createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function userFromBearer(req: VercelRequest): Promise<string | null> {
  const jwt = String(req.headers.authorization ?? '').replace('Bearer ', '');
  if (!jwt) return null;
  const c = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!);
  const { data: { user } } = await c.auth.getUser(jwt);
  return user?.id ?? null;
}

function donePage(res: VercelResponse, ok: boolean, message: string) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.status(ok ? 200 : 400).send(`<!doctype html><html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>FanHive</title>
<style>body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Hiragino Sans",sans-serif;background:#fffaf0;color:#222;
display:flex;min-height:100vh;align-items:center;justify-content:center;text-align:center;padding:24px;box-sizing:border-box}
h1{font-size:20px;margin:0 0 12px}p{font-size:15px;line-height:1.7;margin:0;color:#555}h1,p{word-break:auto-phrase;text-wrap:balance}</style></head>
<body><div><h1>${ok ? 'Googleカレンダーと連携しました' : '連携できませんでした'}</h1><p>${message}</p></div></body></html>`);
}

export async function gcalHandler(req: VercelRequest, res: VercelResponse, action: string) {
  // iOS は capacitor://localhost から呼ぶので別オリジン（delete-account と同じ）
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (!process.env.GOOGLE_CLIENT_SECRET) return res.status(500).json({ error: 'not_configured' });
  const db = adminDb();

  // Google の同意画面から戻ってきた
  if (action === 'google-callback') {
    const code = String(req.query.code ?? '');
    const state = String(req.query.state ?? '');
    if (req.query.error) return donePage(res, false, 'FanHive に戻って、もう一度お試しください。');
    const { data: st } = await db.from('google_oauth_states').select('user_id, created_at').eq('state', state).maybeSingle();
    await db.from('google_oauth_states').delete().eq('state', state);
    if (!st || Date.now() - Date.parse(st.created_at as string) > 15 * 60 * 1000) {
      return donePage(res, false, '時間がたちすぎました。FanHive に戻って、もう一度お試しください。');
    }
    const j = await tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI });
    const refresh = j.refresh_token as string | undefined;
    if (!refresh) return donePage(res, false, 'FanHive に戻って、もう一度お試しください。');
    const userId = st.user_id as string;
    // 連携し直したときは前のカレンダーを使い回す（calendar_id は残す）
    const { data: prev } = await db.from('google_calendar_links').select('calendar_id').eq('user_id', userId).maybeSingle();
    await db.from('google_calendar_links').upsert({
      user_id: userId, refresh_token: refresh, calendar_id: (prev?.calendar_id as string | null) ?? null, last_error: null,
    }, { onConflict: 'user_id' });
    // 最初の同期は予定が多いと時間がかかるので、ページは先に出して裏で書く（ページを閉じても続く）
    waitUntil(syncUser(db, userId));
    return donePage(res, true, '予定を入れています。少しすると Googleカレンダーに出ます。このページは閉じて、FanHive に戻ってください。');
  }

  // 毎日の見直し（日付の修正・プレミアムの期限切れに追随する）。Vercel の cron から呼ぶ
  if (action === 'google-sync-all') {
    if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) return res.status(401).end();
    const { data: links } = await db.from('google_calendar_links').select('user_id').or('last_error.is.null,last_error.neq.revoked');
    const ids = (links ?? []).map((l) => l.user_id as string);
    let ok = 0;
    for (const id of ids) if ((await syncUser(db, id)).ok) ok++;
    return res.status(200).json({ users: ids.length, ok });
  }

  if (req.method !== 'POST') return res.status(405).end();
  const userId = await userFromBearer(req);
  if (!userId) return res.status(401).json({ error: 'unauthorized' });

  // 連携を始める: state を作って Google の同意画面の URL を返す（アプリが外部ブラウザで開く）
  if (action === 'google-auth') {
    if (!(await isPremium(db, userId))) return res.status(403).json({ error: 'premium_only' });
    const state = randomBytes(24).toString('hex');
    await db.from('google_oauth_states').insert({ state, user_id: userId });
    const q = new URLSearchParams({
      client_id: CLIENT_ID, redirect_uri: REDIRECT_URI, response_type: 'code', scope: SCOPE,
      access_type: 'offline', prompt: 'consent', state,
    });
    return res.status(200).json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${q}` });
  }

  if (action === 'google-sync') {
    const r = await syncUser(db, userId);
    return res.status(200).json(r);
  }

  // 連携を解除: FanHive カレンダーを消し、トークンを無効にして行を消す
  if (action === 'google-unlink') {
    const { data: link } = await db.from('google_calendar_links')
      .select('refresh_token, calendar_id').eq('user_id', userId).maybeSingle();
    if (link) {
      try {
        const token = await accessTokenFor(link.refresh_token as string);
        if (link.calendar_id) await gfetch(token, `/calendars/${encodeURIComponent(link.calendar_id as string)}`, { method: 'DELETE' });
      } catch { /* 既に Google 側で外されている */ }
      await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(link.refresh_token as string)}`, { method: 'POST' }).catch(() => {});
      await db.from('google_calendar_links').delete().eq('user_id', userId);
    }
    return res.status(200).json({ ok: true });
  }

  return res.status(400).json({ error: 'unknown_action' });
}

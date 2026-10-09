import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { isPremium, loadCalendarItems, type CalendarItem } from './_calendarItems.js';
import { gcalHandler } from './_gcal.js';
import { shareHandler } from './_sharePage.js';

// カレンダー自動同期（プレミアム）: 保存した予定を .ics で配信する。
// Google/Appleカレンダーに「URLで購読」してもらう方式なので、こちらから送信はしない。
// 相手が数時間〜1日おきに取りに来て、その時点の内容に置き換わる。
//
// 認証はURLのトークンだけ（カレンダーアプリはヘッダーを付けられない）。
// トークンは推測できない値で、漏れたらアプリ側で作り直せる（ics_tokens を update）。
// 出しているのは「公開イベント」＋「その人が保存したかどうか」だけで、個人情報は載せない。

function ymd(d: string): string { return d.replace(/-/g, ''); }
function esc(s: string): string { return s.replace(/([,;\\])/g, '\\$1').replace(/\r?\n/g, '\\n'); }
function addDay(d: string): string {
  const t = new Date(d + 'T00:00:00Z');
  t.setUTCDate(t.getUTCDate() + 1);
  return t.toISOString().slice(0, 10);
}
// RFC5545 は1行75オクテット上限。日本語が入ると簡単に超えるので折る（折り返し行は先頭に空白）。
function fold(line: string): string {
  if (Buffer.byteLength(line, 'utf8') <= 73) return line;
  const out: string[] = [];
  let cur = '';
  for (const ch of line) {
    if (Buffer.byteLength(cur + ch, 'utf8') > 73) { out.push(cur); cur = ' '; }
    cur += ch;
  }
  out.push(cur);
  return out.join('\r\n');
}

// 取りに来た相手を見分ける（アプリの「連携済み」の表示に使う）。
// ブラウザで URL を開いただけのときは数えない（連携できたと誤解させないため）。
function fetcherOf(ua: string): string | null {
  if (/Google-Calendar-Importer/i.test(ua)) return 'google';
  if (/dataaccessd|CalendarAgent|iOS\/|macOS\//i.test(ua)) return 'apple';
  if (/Microsoft|Outlook|Exchange/i.test(ua)) return 'outlook';
  if (!ua || /Mozilla/i.test(ua)) return null;
  return 'other';
}

// TZID=Asia/Tokyo を使うので定義も載せる。Google・Apple は無くても読むが、Outlook は無いと時刻がずれたり取り込めないことがある
const VTIMEZONE = [
  'BEGIN:VTIMEZONE', 'TZID:Asia/Tokyo',
  'BEGIN:STANDARD', 'DTSTART:19700101T000000', 'TZOFFSETFROM:+0900', 'TZOFFSETTO:+0900', 'TZNAME:JST', 'END:STANDARD',
  'END:VTIMEZONE',
];

function vevent({ uid, summary, start, end, time, desc, url }: CalendarItem, stamp: string): string[] {
  const lines = [
    'BEGIN:VEVENT',
    `UID:${uid}@fanhive.jp`,
    `DTSTAMP:${stamp}`,
  ];
  if (time) {
    // 日本時間で入っている（アプリはJSTのみ扱う）。TZIDを明示しないとUTC扱いで9時間ずれる。
    lines.push(`DTSTART;TZID=Asia/Tokyo:${ymd(start)}T${time.slice(0, 5).replace(':', '')}00`);
    lines.push(`DTEND;TZID=Asia/Tokyo:${ymd(end || start)}T${time.slice(0, 5).replace(':', '')}00`);
  } else {
    lines.push(`DTSTART;VALUE=DATE:${ymd(start)}`);
    lines.push(`DTEND;VALUE=DATE:${ymd(addDay(end || start))}`); // 全日のDTENDは排他的
  }
  lines.push(fold(`SUMMARY:${esc(summary)}`));
  if (desc) lines.push(fold(`DESCRIPTION:${esc(desc)}`));
  if (url) lines.push(fold(`URL:${url}`));
  lines.push('END:VEVENT');
  return lines;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // 「Googleで連携」の入口も相乗りしている（関数は12個が上限）。/api/google-callback 等は vercel.json でここへ流す
  const action = String(req.query.action ?? '');
  if (action.startsWith('google-')) return gcalHandler(req, res, action);
  // 共有された予定のページのカード（X などのクローラー向け）。api/_sharePage.ts
  if (action.startsWith('share-')) return shareHandler(req, res, action);

  const token = String(req.query.t ?? '').trim();
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');

  const empty = (note: string) =>
    res.status(200).send(['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//FanHive//JP', 'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH', 'X-WR-CALNAME:FanHive', fold(`X-WR-CALDESC:${esc(note)}`), 'END:VCALENDAR'].join('\r\n'));

  if (!token || token.length < 16) return empty('購読URLが正しくありません');

  const supabaseUrl = process.env.VITE_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!supabaseUrl || !serviceKey) return res.status(500).end();
  const db = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

  const { data: row } = await db.from('ics_tokens').select('user_id').eq('token', token).maybeSingle();
  if (!row) return empty('この購読URLは無効です（アプリで作り直してください）');
  const userId = row.user_id as string;

  // いつ・どこから取りに来たかを残す。列が無い環境（SQL を流す前）では error が返るだけなので黙って飛ばす
  const fetcher = fetcherOf(String(req.headers['user-agent'] ?? ''));
  if (fetcher) {
    const { data: f, error: fe } = await db.from('ics_tokens').select('fetched').eq('token', token).maybeSingle();
    if (!fe) {
      const fetched = { ...((f?.fetched as Record<string, string> | null) ?? {}), [fetcher]: new Date().toISOString() };
      await db.from('ics_tokens').update({ fetched }).eq('token', token);
    }
  }

  // プレミアムが切れたら中身を止める。エラーではなく空のカレンダーを返す
  // （カレンダーアプリは404を出し続けると購読ごと壊れることがある）。
  if (!(await isPremium(db, userId))) return empty('カレンダー自動同期はプレミアムの機能です');

  const stamp = `${ymd(new Date().toISOString().slice(0, 10))}T000000Z`;
  const body = (await loadCalendarItems(db, userId)).flatMap((it) => vevent(it, stamp));

  return res.status(200).send([
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//FanHive//JP', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'X-WR-CALNAME:FanHive', 'X-WR-TIMEZONE:Asia/Tokyo',
    // 更新間隔の希望（Apple・Outlook は見る。Google は見ない）
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H', 'X-PUBLISHED-TTL:PT1H',
    ...VTIMEZONE,
    ...body,
    'END:VCALENDAR',
  ].join('\r\n'));
}

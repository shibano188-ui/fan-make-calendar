import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

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

type EventRow = {
  id: string; title: string; event_date: string | null; end_date: string | null; date_label: string | null;
  event_time: string | null; preorder_end_date: string | null; memo: string | null; link_url: string | null;
};

function vevent(uid: string, summary: string, start: string, end: string | null, time: string | null, desc: string, url: string, stamp: string): string[] {
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

  // プレミアムが切れたら中身を止める。エラーではなく空のカレンダーを返す
  // （カレンダーアプリは404を出し続けると購読ごと壊れることがある）。
  const { data: sub } = await db
    .from('user_private').select('subscription_status, subscription_expires_at').eq('user_id', userId).maybeSingle();
  const status = (sub?.subscription_status as string | null) ?? 'free';
  const expires = sub?.subscription_expires_at as string | null;
  const active = (status === 'active' || status === 'grace') && (!expires || Date.parse(expires) > Date.now());
  if (!active) return empty('カレンダー自動同期はプレミアムの機能です');

  // 保存した予定＝自分のいいね＋自分の投稿（アプリの「いいね」タブと同じ範囲）
  const { data: likeRows } = await db.from('likes').select('event_id').eq('user_id', userId);
  const likedIds = (likeRows ?? []).map((r) => r.event_id as string);
  const cols = 'id, title, event_date, end_date, date_label, event_time, preorder_end_date, memo, link_url';
  const queries = [db.from('events').select(cols).eq('pool', 0).eq('author_id', userId)];
  if (likedIds.length) queries.push(db.from('events').select(cols).eq('pool', 0).in('id', likedIds));
  const results = await Promise.all(queries);

  const seen = new Set<string>();
  const stamp = `${ymd(new Date().toISOString().slice(0, 10))}T000000Z`;
  const body: string[] = [];
  for (const { data } of results) {
    for (const e of (data ?? []) as EventRow[]) {
      if (seen.has(e.id)) continue;
      seen.add(e.id);
      const url = e.link_url || `https://fanhive.jp/item/${e.id}`;
      if (e.event_date) {
        // 曖昧日付（「7月上旬」など）は date が代表日でしかなく、期間・時刻は意味を持たない
        // （rowToEvent と同じ不変条件）。カレンダーには代表日の全日予定として置き、
        // 見た人が誤解しないようタイトルにラベルを添える。
        const vague = !!e.date_label;
        const summary = vague ? `${e.title}（${e.date_label}）` : e.title;
        body.push(...vevent(e.id, summary, e.event_date, vague ? null : e.end_date, vague ? null : e.event_time, e.memo ?? '', url, stamp));
      }
      // 受付の締切は見逃すと取り返しがつかないので、日付が別なら独立した予定として出す
      if (e.preorder_end_date && e.preorder_end_date !== e.event_date) {
        body.push(...vevent(`${e.id}-deadline`, `【締切】${e.title}`, e.preorder_end_date, null, null, e.memo ?? '', url, stamp));
      }
    }
  }

  return res.status(200).send([
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//FanHive//JP', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'X-WR-CALNAME:FanHive', 'X-WR-TIMEZONE:Asia/Tokyo',
    ...body,
    'END:VCALENDAR',
  ].join('\r\n'));
}

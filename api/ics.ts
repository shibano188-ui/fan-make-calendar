import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { loadEventPatches, applyPatchesToRows } from './_edits.js';

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

type EventRow = {
  id: string; title: string; event_date: string | null; end_date: string | null; date_label: string | null;
  event_time: string | null; preorder_start_date: string | null; preorder_start_time: string | null;
  preorder_end_date: string | null; memo: string | null; link_url: string | null;
  works: { name: string } | null;
};

// メモ欄。Google は URL 欄を画面に出さないので、リンクはメモ欄にも書く（端末カレンダー版と同じ並び）。
// 予定ごとの色は購読カレンダーでは付けられない（Google・Apple とも無視する）ので、作品名で見分けてもらう
function describe(e: EventRow, url: string): string {
  return [e.memo?.trim(), e.works?.name ? `作品: ${e.works.name}` : '', url].filter(Boolean).join('\n');
}

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
  const { data: sub } = await db
    .from('user_private').select('subscription_status, subscription_expires_at').eq('user_id', userId).maybeSingle();
  const status = (sub?.subscription_status as string | null) ?? 'free';
  const expires = sub?.subscription_expires_at as string | null;
  const active = (status === 'active' || status === 'grace') && (!expires || Date.parse(expires) > Date.now());
  if (!active) return empty('カレンダー自動同期はプレミアムの機能です');

  // 保存した予定＝自分がカレンダーに入れたもの（アプリのカレンダーと同じ範囲）。
  // 自分の投稿でも、保存していなければ入れない（投稿時に入れるかはフォームのトグルで決める）
  const { data: likeRows } = await db.from('likes').select('event_id').eq('user_id', userId);
  const likedIds = (likeRows ?? []).map((r) => r.event_id as string);
  const cols = 'id, title, event_date, end_date, date_label, event_time, preorder_start_date, preorder_start_time, preorder_end_date, memo, link_url, works(name)';
  const results = likedIds.length
    ? [await db.from('events').select(cols).eq('pool', 0).in('id', likedIds)]
    : [];
  // 共同編集で直した日付を重ねる（アプリ内と同じ実効値にする）
  const patches = await loadEventPatches(db, likedIds);

  // 「ここ行く!」を登録した予定は、**その日だけ**を出す。
  // 長期のコラボカフェ等を全期間で出すとカレンダーが何週間も埋まる
  // （アプリ内の表示・ローカル通知は既に行く日基準。ここと端末カレンダーだけ全期間だった）。
  const { data: visitRows } = await db
    .from('event_visits').select('id, event_id, start_date, end_date').eq('user_id', userId);
  const visitsByEvent = new Map<string, { id: string; start: string; end: string }[]>();
  for (const v of visitRows ?? []) {
    const list = visitsByEvent.get(v.event_id as string) ?? [];
    list.push({ id: String(v.id), start: v.start_date as string, end: v.end_date as string });
    visitsByEvent.set(v.event_id as string, list);
  }

  const seen = new Set<string>();
  const stamp = `${ymd(new Date().toISOString().slice(0, 10))}T000000Z`;
  const body: string[] = [];
  for (const { data } of results) {
    for (const e of applyPatchesToRows((data ?? []) as EventRow[], patches)) {
      if (seen.has(e.id)) continue;
      seen.add(e.id);
      const url = e.link_url ?? ''; // リンクが無い予定は出さない（FanHive のページで代わりにしない。柴野）
      const desc = describe(e, url);
      const visits = visitsByEvent.get(e.id) ?? [];
      if (visits.length) {
        for (const v of visits) {
          // 1日だけの来店で時刻があるなら時刻を活かす（開催時間のあるイベント用）
          const single = v.start === v.end;
          body.push(...vevent(
            `${e.id}-visit-${v.id}`, e.title, v.start,
            single ? null : v.end, single ? e.event_time : null,
            desc, url, stamp,
          ));
        }
      } else if (e.event_date) {
        // 曖昧日付（「7月上旬」など）は date が代表日でしかなく、期間・時刻は意味を持たない
        // （rowToEvent と同じ不変条件）。カレンダーには代表日の全日予定として置き、
        // 見た人が誤解しないようタイトルにラベルを添える。
        const vague = !!e.date_label;
        const summary = vague ? `${e.title}（${e.date_label}）` : e.title;
        body.push(...vevent(e.id, summary, e.event_date, vague ? null : e.end_date, vague ? null : e.event_time, desc, url, stamp));
      }
      // 受付開始も、日付が別なら独立した予定として出す。時刻が分かればその時刻に置く
      // （人気のグッズは開始から数分で売り切れる。通知と同じく一番大事な日なのに入っていなかった。2026-10-05 柴野）
      if (e.preorder_start_date && e.preorder_start_date !== e.event_date) {
        body.push(...vevent(`${e.id}-start`, `【受付開始】${e.title}`, e.preorder_start_date, null,
          e.preorder_start_time?.slice(0, 5) ?? null, desc, url, stamp));
      }
      // 受付の締切は見逃すと取り返しがつかないので、日付が別なら独立した予定として出す
      if (e.preorder_end_date && e.preorder_end_date !== e.event_date) {
        body.push(...vevent(`${e.id}-deadline`, `【締切】${e.title}`, e.preorder_end_date, null, null, desc, url, stamp));
      }
    }
  }

  // 自分用の予定（personal_events・2026-09-29）も同じカレンダーに出す。アプリのカレンダーと同じ範囲にそろえる。
  // テーブルがまだ無い環境では error が返るだけなので、黙って飛ばす
  const { data: personal } = await db.from('personal_events')
    .select('id, title, event_date, end_date, event_time, memo, link_url').eq('user_id', userId);
  for (const p of personal ?? []) {
    if (!p.event_date) continue;
    const url = (p.link_url as string | null) ?? '';
    const desc = [((p.memo as string | null) ?? '').trim(), url].filter(Boolean).join('\n');
    body.push(...vevent(`personal-${p.id}`, String(p.title), p.event_date as string, (p.end_date as string | null) ?? null,
      ((p.event_time as string | null) ?? null)?.slice(0, 5) ?? null, desc, url, stamp));
  }

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

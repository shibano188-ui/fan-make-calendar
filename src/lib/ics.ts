import type { CalendarEvent } from '../types';
import { todayStr } from '../design/tokens';
import { resolveBuy } from './affiliate';

// 端末のカレンダー(Google/Apple等)に取り込む .ics を生成。OAuth不要・両対応。
function ymd(d: string): string { return d.replace(/-/g, ''); }
function esc(s: string): string { return s.replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n'); }

export function buildICS(e: CalendarEvent): string | null {
  const date = e.date;
  if (!date) return null; // 日付未定は不可
  const stamp = `${ymd(todayStr())}T000000Z`;
  const allDay = !e.time;
  let dtstart: string;
  let dtend: string;
  if (allDay) {
    const end = new Date((e.endDate || date) + 'T00:00:00');
    end.setDate(end.getDate() + 1); // ICSの全日DTENDは排他的→+1日
    dtstart = `DTSTART;VALUE=DATE:${ymd(date)}`;
    dtend = `DTEND;VALUE=DATE:${ymd(todayStr(end))}`;
  } else {
    const et = e.endTime || e.time!;
    dtstart = `DTSTART:${ymd(date)}T${e.time!.replace(':', '')}00`;
    dtend = `DTEND:${ymd(e.endDate || date)}T${et.replace(':', '')}00`;
  }
  const url = resolveBuy(e).url || e.link || '';
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//FanHive//JP', 'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${e.id}@fanhive`,
    `DTSTAMP:${stamp}`,
    dtstart, dtend,
    `SUMMARY:${esc(e.title)}`,
    e.memo ? `DESCRIPTION:${esc(e.memo)}` : '',
    url ? `URL:${url}` : '',
    'END:VEVENT', 'END:VCALENDAR',
  ].filter(Boolean);
  return lines.join('\r\n');
}

/** .ics をダウンロード/オープン（端末カレンダーが取り込む）。日付未定なら false。 */
export function downloadICS(e: CalendarEvent): boolean {
  const ics = buildICS(e);
  if (!ics) return false;
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${(e.title || 'event').slice(0, 40)}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}

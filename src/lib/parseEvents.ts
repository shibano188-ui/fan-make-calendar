// /api/parse-event を叩いて解析結果(複数可)を返す。SmartInputPanel のロジックを共通化。
import { categoriesFromRaw } from './constants';

export type ParsedEvent = {
  title: string | null;
  work: string | null;
  price: number | null;
  date: string | null;
  dateLabel: string | null;
  time: string | null;
  endDate: string | null;
  endTime: string | null;
  category: string | null;
  prefecture: string | null;
  locationDetail: string | null;
  link: string | null;
  memo: string | null;
  imageUrl: string | null;
  sourceUrl: string | null;
  isOrderMade?: boolean;
  preorderStart?: string | null;
  preorderEnd?: string | null;
};

function clean(v: unknown): string | null {
  if (v === null || v === undefined || v === 'null' || v === '') return null;
  return String(v);
}

function rawToParsed(raw: Record<string, unknown>): ParsedEvent {
  return {
    title: clean(raw.title),
    work: clean(raw.work),
    price: raw.price != null && !isNaN(Number(raw.price)) ? Number(raw.price) : null,
    date: clean(raw.date),
    dateLabel: clean(raw.dateLabel),
    time: clean(raw.time),
    endDate: clean(raw.endDate),
    endTime: clean(raw.endTime),
    category: categoriesFromRaw(raw),
    prefecture: clean(raw.prefecture),
    locationDetail: clean(raw.locationDetail),
    link: clean(raw.link),
    memo: clean(raw.memo),
    imageUrl: clean(raw.imageUrl),
    sourceUrl: null,
    isOrderMade: raw.isOrderMade === true || raw.isOrderMade === 'true',
    preorderStart: clean(raw.preorderStart),
    preorderEnd: clean(raw.preorderEnd),
  };
}

type ParseBody = { url?: string; imageBase64?: string; mimeType?: string; sharedText?: string };

export async function parseEventsApi(body: ParseBody): Promise<ParsedEvent[]> {
  const apiBase = (import.meta.env.VITE_API_BASE as string | undefined) ?? '';
  const res = await fetch(`${apiBase}/api/parse-event`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(res.status === 429 ? 'rate_limited' : `error_${res.status}`);
  const raw = await res.json();
  const arr: Record<string, unknown>[] = Array.isArray(raw) ? raw : [raw];
  const events = arr.filter((e) => clean(e.title)).map(rawToParsed);

  // URL入力時: 非ツイートはそのURLを購入/公式リンクに、ツイートは元リンク維持＋sourceに記録
  if (body.url) {
    const isTweet = /twitter\.com|x\.com/.test(body.url);
    return events.map((e) => ({
      ...e,
      link: isTweet ? e.link : (e.link ?? body.url!),
      sourceUrl: isTweet ? body.url! : e.sourceUrl,
    }));
  }
  return events;
}

export function fileToBase64(file: File): Promise<{ data: string; mime: string }> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => { const s = String(r.result); resolve({ data: s.split(',')[1] ?? '', mime: file.type || 'image/jpeg' }); };
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

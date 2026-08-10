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
  sellsGoods?: boolean;        // イベントで物販がある（会場/関連でグッズ販売）→「グッズあり」カテゴリ付与
};

function clean(v: unknown): string | null {
  if (v === null || v === undefined || v === 'null' || v === '') return null;
  return String(v);
}

function rawToParsed(raw: Record<string, unknown>): ParsedEvent {
  // 不変条件: 曖昧日付（dateLabel あり）に期間・時刻は持たせない。
  // AIは「発売は7月中・お届けは10月」のようなポストで dateLabel と endDate を両方返すことがあり、
  // そのまま保存すると「7/31〜10/31 の期間予定」として描画が壊れる（実例あり）。
  const dateLabel = clean(raw.dateLabel);
  return {
    title: clean(raw.title),
    work: clean(raw.work),
    price: raw.price != null && !isNaN(Number(raw.price)) ? Number(raw.price) : null,
    date: clean(raw.date),
    dateLabel,
    time: dateLabel ? null : clean(raw.time),
    endDate: dateLabel ? null : clean(raw.endDate),
    endTime: dateLabel ? null : clean(raw.endTime),
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
    sellsGoods: raw.sellsGoods === true || raw.sellsGoods === 'true',
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
  if (!res.ok) {
    if (res.status === 429) throw new Error('rate_limited');
    // Xのポスト以外のURLだけを投げたとき（サーバーはページを取りに行かない）
    if (res.status === 400) {
      const detail = await res.json().catch(() => null);
      if (detail?.error === 'unsupported_url') throw new Error('unsupported_url');
    }
    throw new Error(`error_${res.status}`);
  }
  const raw = await res.json();
  const arr: Record<string, unknown>[] = Array.isArray(raw) ? raw : [raw];
  const events = arr.filter((e) => clean(e.title)).map(rawToParsed);

  // URL入力時: 非ツイートはそのURLを購入/公式リンクに、ツイートは元リンク維持＋sourceに記録。
  // `body.url` には**テキストがそのまま入ることがある**（貼り付け欄は種別を区別しない）ので、
  // 実際にURLの形をしているときだけ販路のフォールバックに使う（テキストが販路として保存されるのを防ぐ）。
  if (body.url) {
    const isTweet = /twitter\.com|x\.com/.test(body.url);
    const foundUrl = body.url.match(/https?:\/\/\S+/)?.[0] ?? null;
    return events.map((e) => ({
      ...e,
      link: isTweet ? e.link : (e.link ?? foundUrl),
      sourceUrl: isTweet ? (foundUrl ?? body.url!) : e.sourceUrl,
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

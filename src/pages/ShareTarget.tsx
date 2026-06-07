import { useEffect, useRef, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Loader2, CheckCircle, AlertCircle, Inbox } from 'lucide-react';
import { loadShareMode, addToEventQueue } from '../lib/constants';

type Status = 'parsing' | 'done' | 'stocked' | 'error';

const clean = (v: unknown): string | null => {
  if (v === null || v === undefined || v === 'null' || v === '') return null;
  return String(v);
};

export default function ShareTarget() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<Status>('parsing');
  const pendingRef = useRef<Record<string, string | null> | null>(null);

  const urlParam   = searchParams.get('url')   || '';
  const textParam  = searchParams.get('text')  || '';
  const sharedTitle = searchParams.get('title') || '';

  // X アプリは url=ツイートURL, text=ツイート本文 を送る場合と
  // url=空, text="本文 https://t.co/xxx" を送る場合がある。
  // いずれでも正しい URL を取り出す。
  const extractFirstUrl = (s: string) => s.match(/https?:\/\/\S+/)?.[0] ?? '';
  const sharedUrl = urlParam.startsWith('http') ? urlParam
    : textParam.startsWith('http') ? textParam
    : extractFirstUrl(textParam) || extractFirstUrl(urlParam) || urlParam || textParam;

  // ツイート本文（URL以外のテキスト）— url パラムに正規 URL がある場合のみ text がコンテンツ
  const sharedText = (() => {
    if (!urlParam.startsWith('http')) return '';
    const stripped = textParam.replace(/https?:\/\/\S+/g, '').trim();
    return stripped.length > 5 ? stripped : '';
  })();

  useEffect(() => {
    if (!sharedUrl) {
      navigate('/calendar', { replace: true });
      return;
    }

    const mode = loadShareMode();

    const MAX_RETRIES = 3;

    const attemptParse = async (): Promise<unknown[]> => {
      let lastError: string | null = null;
      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
          const res = await fetch('/api/parse-event', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              url: sharedUrl,
              ...(sharedText ? { sharedText } : {}),
            }),
          });
          if (!res.ok) throw new Error(`${res.status}`);
          const raw = await res.json();
          const arr: unknown[] = Array.isArray(raw) ? raw : [raw];
          const first = arr[0] as Record<string, unknown> | undefined;
          if (clean(first?.title)) return arr;
          throw new Error('no title');
        } catch (e) {
          lastError = e instanceof Error ? e.message : '不明';
        }
      }
      throw new Error(lastError ?? '解析失敗');
    };

    attemptParse()
      .then(arr => {
        const first = (arr[0] ?? {}) as Record<string, unknown>;
        const parsed = {
          title:          clean(first.title) ?? (sharedTitle || null),
          date:           clean(first.date),
          time:           clean(first.time),
          endDate:        clean(first.endDate),
          endTime:        clean(first.endTime),
          category:       clean(first.category),
          prefecture:     clean(first.prefecture),
          locationDetail: clean(first.locationDetail),
          link:           clean(first.link),
          memo:           clean(first.memo),
          sourceUrl:      sharedUrl,
          imageUrl:       clean(first.imageUrl),
        };

        if (mode === 'stock') {
          addToEventQueue(parsed);
          setStatus('stocked');
        } else {
          pendingRef.current = parsed;
          localStorage.setItem('pendingParsedEvent', JSON.stringify(parsed));
          setStatus('done');
        }
      })
      .catch(() => {
        const fallback = {
          title: sharedTitle || null,
          date: null, time: null, endDate: null, endTime: null,
          category: null, prefecture: null, locationDetail: null,
          link: null, memo: null, imageUrl: null, sourceUrl: sharedUrl,
        };

        if (mode === 'stock') {
          addToEventQueue(fallback);
          setStatus('stocked');
        } else {
          pendingRef.current = fallback;
          localStorage.setItem('pendingParsedEvent', JSON.stringify(fallback));
          setStatus('error');
        }
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className="flex flex-col items-center justify-center gap-4 px-8"
      style={{ backgroundColor: 'var(--bg-primary)', minHeight: '100dvh' }}
    >
      {status === 'parsing' && (
        <>
          <Loader2 size={36} className="animate-spin" style={{ color: 'var(--accent-color)' }} />
          <p className="text-label-primary font-medium text-sm">AIが解析中…</p>
          <p className="text-label-tertiary text-xs text-center break-all line-clamp-2">{sharedUrl}</p>
        </>
      )}
      {status === 'stocked' && (
        <>
          <Inbox size={36} style={{ color: 'var(--accent-color)' }} />
          <p className="text-label-primary font-medium text-sm">ストックしました</p>
          <p className="text-label-tertiary text-xs text-center">
            続けてXを見るか、カレンダーで確認できます
          </p>
          <div className="flex flex-col gap-2 w-full mt-2">
            <button
              onClick={() => navigate('/calendar?openQueue=1', { replace: true })}
              className="w-full py-3 rounded-xl text-sm font-semibold text-white active:opacity-70"
              style={{ backgroundColor: 'var(--accent-color)' }}
            >
              カレンダーでまとめて確認する
            </button>
            <p className="text-label-tertiary text-[11px] text-center">← スワイプでXに戻れます</p>
          </div>
        </>
      )}
      {status === 'done' && (
        <>
          <CheckCircle size={36} style={{ color: '#34D399' }} />
          <p className="text-label-primary font-medium text-sm">解析完了！</p>
          <p className="text-label-tertiary text-xs text-center">
            続けてXを見るか、カレンダーでフォームを開けます
          </p>
          <div className="flex flex-col gap-2 w-full mt-2">
            <button
              onClick={() => navigate('/calendar', { replace: true, state: { pendingParsedEvent: pendingRef.current } })}
              className="w-full py-3 rounded-xl text-sm font-semibold text-white active:opacity-70"
              style={{ backgroundColor: 'var(--accent-color)' }}
            >
              カレンダーでフォームを開く
            </button>
            <p className="text-label-tertiary text-[11px] text-center">← スワイプでXに戻れます</p>
          </div>
        </>
      )}
      {status === 'error' && (
        <>
          <AlertCircle size={36} style={{ color: '#FBBF24' }} />
          <p className="text-label-secondary text-sm text-center">
            解析できませんでしたが、URLを引き継いでフォームを開けます
          </p>
          <div className="flex flex-col gap-2 w-full mt-2">
            <button
              onClick={() => navigate('/calendar', { replace: true, state: { pendingParsedEvent: pendingRef.current } })}
              className="w-full py-3 rounded-xl text-sm font-semibold text-white active:opacity-70"
              style={{ backgroundColor: 'var(--accent-color)' }}
            >
              カレンダーでフォームを開く
            </button>
            <p className="text-label-tertiary text-[11px] text-center">← スワイプでXに戻れます</p>
          </div>
        </>
      )}
    </div>
  );
}

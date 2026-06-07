import { useEffect, useState } from 'react';
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

  const sharedUrl = searchParams.get('url') || searchParams.get('text') || '';
  const sharedTitle = searchParams.get('title') || '';

  useEffect(() => {
    if (!sharedUrl) {
      navigate('/calendar', { replace: true });
      return;
    }

    const mode = loadShareMode();

    fetch('/api/parse-event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: sharedUrl }),
    })
      .then(res => {
        if (!res.ok) throw new Error('parse failed');
        return res.json();
      })
      .then(raw => {
        const arr = Array.isArray(raw) ? raw : [raw];
        const first = arr[0] ?? {};
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
          sessionStorage.setItem('pendingParsedEvent', JSON.stringify(parsed));
          setStatus('done');
          setTimeout(() => navigate('/calendar', { replace: true }), 800);
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
          sessionStorage.setItem('pendingParsedEvent', JSON.stringify(fallback));
          setStatus('error');
          setTimeout(() => navigate('/calendar', { replace: true }), 1500);
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
          <p className="text-label-primary font-medium text-sm">解析完了！カレンダーへ移動します</p>
        </>
      )}
      {status === 'error' && (
        <>
          <AlertCircle size={36} style={{ color: '#FBBF24' }} />
          <p className="text-label-secondary text-sm text-center">
            解析できませんでしたが、URLを引き継いでフォームを開きます
          </p>
        </>
      )}
    </div>
  );
}

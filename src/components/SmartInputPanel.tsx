import { useState } from 'react';
import { Sparkles, Link2, Loader2, Check } from 'lucide-react';

export type ParsedEvent = {
  title: string | null;
  date: string | null;
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
};

const inputCls =
  'w-full bg-bg-primary rounded-lg px-3 py-2 text-sm text-label-primary caret-label-primary placeholder:text-label-tertiary outline-none border border-faint focus:border-strong';

function fmtEventSummary(ev: ParsedEvent): string {
  const parts: string[] = [];
  if (ev.date) parts.push(ev.date.replace(/^\d{4}-/, '').replace('-', '/'));
  if (ev.time) parts.push(ev.time);
  if (ev.prefecture) parts.push(ev.prefecture);
  return parts.join('  ');
}

export default function SmartInputPanel({ onApply }: { onApply: (parsed: ParsedEvent) => void }) {
  const [urlValue, setUrlValue]           = useState('');
  const [loading, setLoading]             = useState(false);
  const [flashMsg, setFlashMsg]           = useState<string | null>(null);
  const [error, setError]                 = useState<string | null>(null);
  const [pendingEvents, setPendingEvents] = useState<ParsedEvent[] | null>(null);
  const [selected, setSelected]           = useState<Set<number>>(new Set());

  const showFlash = (msg: string) => {
    setFlashMsg(msg);
    setTimeout(() => setFlashMsg(null), 2500);
  };

  const clean = (v: unknown): string | null => {
    if (v === null || v === undefined || v === 'null' || v === '') return null;
    return String(v);
  };

  const rawToEvent = (raw: Record<string, unknown>, linkOverride?: string, sourceUrl?: string): ParsedEvent => ({
    title:          clean(raw.title),
    date:           clean(raw.date),
    time:           clean(raw.time),
    endDate:        clean(raw.endDate),
    endTime:        clean(raw.endTime),
    category:       clean(raw.category),
    prefecture:     clean(raw.prefecture),
    locationDetail: clean(raw.locationDetail),
    link:           linkOverride ?? clean(raw.link),
    memo:           clean(raw.memo),
    imageUrl:       clean(raw.imageUrl),
    sourceUrl:      sourceUrl ?? null,
  });

  const parseAndApply = async (body: object, isUrl = false) => {
    setLoading(true);
    setError(null);
    setPendingEvents(null);

    const MAX_RETRIES = 3;
    let lastEvents: Record<string, unknown>[] | null = null;
    let lastError: string | null = null;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const res = await fetch('/api/parse-event', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          throw new Error(`${res.status}: ${text.slice(0, 400)}`);
        }
        const raw = await res.json();
        const arr: Record<string, unknown>[] = Array.isArray(raw) ? raw : [raw];
        if (arr.some(e => clean(e.title))) {
          lastEvents = arr;
          lastError = null;
          break;
        }
      } catch (e) {
        lastError = e instanceof Error ? e.message : '不明なエラー';
      }
    }

    if (!lastEvents) {
      setError(`解析に失敗しました（${lastError ?? '不明なエラー'}）`);
      setLoading(false);
      return;
    }

    const trimmedUrl = urlValue.trim();
    const isTweet = isUrl && /twitter\.com|x\.com/.test(trimmedUrl);
    const linkOverride = (isUrl && !isTweet) ? trimmedUrl : undefined;
    const sourceUrl = isTweet ? trimmedUrl : undefined;
    const events = lastEvents.map(e => rawToEvent(e, linkOverride, sourceUrl));

    if (events.length === 1) {
      onApply(events[0]);
      if (isUrl) setUrlValue('');
      showFlash('フォームに反映しました');
    } else {
      setPendingEvents(events);
      setSelected(new Set(events.map((_, i) => i)));
      if (isUrl) setUrlValue('');
    }
    setLoading(false);
  };

  const toggleSelect = (i: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  };

  const applySelected = () => {
    if (!pendingEvents) return;
    const toAdd = pendingEvents.filter((_, i) => selected.has(i));
    toAdd.forEach(ev => onApply(ev));
    setPendingEvents(null);
    setSelected(new Set());
    showFlash(`${toAdd.length}件をフォームに反映しました`);
  };

  const handleUrlParse = () => {
    if (!urlValue.trim()) return;
    parseAndApply({ url: urlValue.trim() }, true);
  };

  return (
    <div className="rounded-xl px-4 py-3 flex flex-col gap-3" style={{ border: '1px solid var(--border-faint)', backgroundColor: 'var(--bg-secondary)' }}>
      {/* ヘッダー */}
      <div className="flex items-center gap-2">
        <Sparkles size={15} style={{ color: 'var(--accent-color)' }} />
        <span className="text-sm font-medium text-label-primary">AIスマート入力</span>
      </div>

      {/* URL入力 */}
      {!pendingEvents && (
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <Link2 size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-label-tertiary pointer-events-none" />
            <input
              type="url"
              value={urlValue}
              onChange={e => setUrlValue(e.target.value)}
              placeholder="X(Twitter)のURLや公式サイトのURLを貼り付け"
              className={`${inputCls} pl-8 text-xs`}
              onKeyDown={e => e.key === 'Enter' && handleUrlParse()}
            />
          </div>
          <button
            onClick={handleUrlParse}
            disabled={loading || !urlValue.trim()}
            className="px-3 py-2 rounded-lg text-xs font-semibold flex-shrink-0 active:opacity-70 disabled:opacity-40"
            style={{ backgroundColor: 'var(--accent-color)', color: '#fff' }}
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : '解析'}
          </button>
        </div>
      )}

      {/* 複数予定 選択UI */}
      {pendingEvents && (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium text-label-secondary">
            {pendingEvents.length}件の予定が見つかりました
          </p>
          {pendingEvents.map((ev, i) => (
            <button
              key={i}
              onClick={() => toggleSelect(i)}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-left active:opacity-70"
              style={{ backgroundColor: 'var(--bg-primary)' }}
            >
              <div
                className="w-4 h-4 rounded flex-shrink-0 flex items-center justify-center"
                style={{
                  backgroundColor: selected.has(i) ? 'var(--accent-color)' : 'transparent',
                  border: `1.5px solid ${selected.has(i) ? 'var(--accent-color)' : 'var(--border-default)'}`,
                }}
              >
                {selected.has(i) && <Check size={10} color="#fff" strokeWidth={3} />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-label-primary truncate">
                  {ev.title ?? '（タイトルなし）'}
                </p>
                {fmtEventSummary(ev) && (
                  <p className="text-[10px] text-label-tertiary mt-0.5">{fmtEventSummary(ev)}</p>
                )}
              </div>
            </button>
          ))}
          <div className="flex gap-2">
            <button
              onClick={() => { setPendingEvents(null); setSelected(new Set()); }}
              className="flex-1 py-2 rounded-lg text-xs text-label-tertiary active:opacity-70"
              style={{ backgroundColor: 'var(--bg-primary)' }}
            >
              キャンセル
            </button>
            <button
              onClick={applySelected}
              disabled={selected.size === 0}
              className="flex-2 px-4 py-2 rounded-lg text-xs font-semibold active:opacity-70 disabled:opacity-40"
              style={{ backgroundColor: 'var(--accent-color)', color: '#fff' }}
            >
              {selected.size}件を追加
            </button>
          </div>
        </div>
      )}

      {flashMsg && <p className="text-xs text-center" style={{ color: '#34D399' }}>{flashMsg}</p>}
      {error && <p className="text-xs text-center text-red-400">{error}</p>}
    </div>
  );
}

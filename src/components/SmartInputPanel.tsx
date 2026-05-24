import { useState, useRef } from 'react';
import { Sparkles, Link2, Camera, Loader2, ChevronDown, ChevronUp } from 'lucide-react';

export type ParsedEvent = {
  title: string | null;
  date: string | null;
  time: string | null;
  category: string | null;
  prefecture: string | null;
  locationDetail: string | null;
  link: string | null;
  memo: string | null;
};

type Tab = 'url' | 'image';

const inputCls =
  'w-full bg-bg-primary rounded-lg px-3 py-2 text-sm text-label-primary caret-label-primary placeholder:text-label-tertiary outline-none border border-faint focus:border-strong';

export default function SmartInputPanel({ onApply }: { onApply: (parsed: ParsedEvent) => void }) {
  const [open, setOpen]         = useState(false);
  const [tab, setTab]           = useState<Tab>('url');
  const [urlValue, setUrlValue] = useState('');
  const [loading, setLoading]   = useState(false);
  const [flashMsg, setFlashMsg] = useState<string | null>(null);
  const [error, setError]       = useState<string | null>(null);
  const fileRef                 = useRef<HTMLInputElement>(null);

  const showFlash = (msg: string) => {
    setFlashMsg(msg);
    setTimeout(() => setFlashMsg(null), 2500);
  };

  const parseAndApply = async (body: object) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/parse-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`${res.status}: ${body.slice(0, 120)}`);
      }
      const parsed: ParsedEvent = await res.json();
      onApply(parsed);
      showFlash('フォームに反映しました');
    } catch (e) {
      setError(`解析に失敗しました（${e instanceof Error ? e.message : '不明なエラー'}）`);
    } finally {
      setLoading(false);
    }
  };

  const handleUrlParse = () => {
    if (!urlValue.trim()) return;
    parseAndApply({ url: urlValue.trim() });
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      parseAndApply({ imageBase64: dataUrl.split(',')[1], mimeType: file.type });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border-faint)' }}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-4 py-3 text-left active:opacity-70"
        style={{ backgroundColor: open ? 'var(--bg-secondary)' : 'transparent' }}
      >
        <Sparkles size={15} style={{ color: 'var(--accent-color)' }} />
        <span className="text-sm font-medium text-label-primary flex-1">AIスマート入力</span>
        <span className="text-[10px] text-label-tertiary mr-1">URLや画像から自動入力</span>
        {open
          ? <ChevronUp size={14} className="text-label-tertiary" />
          : <ChevronDown size={14} className="text-label-tertiary" />
        }
      </button>

      {open && (
        <div
          className="px-4 pb-4 flex flex-col gap-3 border-t"
          style={{ borderColor: 'var(--border-faint)', backgroundColor: 'var(--bg-secondary)' }}
        >
          <div className="flex gap-1 mt-3">
            {(['url', 'image'] as Tab[]).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                style={{
                  backgroundColor: tab === t ? 'rgba(255,255,255,0.08)' : 'transparent',
                  color: tab === t ? 'var(--label-primary)' : 'var(--label-tertiary)',
                }}
              >
                {t === 'url' ? <Link2 size={12} /> : <Camera size={12} />}
                {t === 'url' ? 'URLから' : '画像から'}
              </button>
            ))}
          </div>

          {tab === 'url' ? (
            <div className="flex gap-2">
              <input
                type="url"
                value={urlValue}
                onChange={e => setUrlValue(e.target.value)}
                placeholder="X(Twitter)のURLや公式サイトのURLを貼り付け"
                className={`${inputCls} flex-1 text-xs`}
                onKeyDown={e => e.key === 'Enter' && handleUrlParse()}
              />
              <button
                onClick={handleUrlParse}
                disabled={loading || !urlValue.trim()}
                className="px-3 py-2 rounded-lg text-xs font-semibold flex-shrink-0 active:opacity-70 disabled:opacity-40"
                style={{ backgroundColor: 'var(--accent-color)', color: '#fff' }}
              >
                {loading ? <Loader2 size={14} className="animate-spin" /> : '解析'}
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handleImageChange}
              />
              <button
                onClick={() => fileRef.current?.click()}
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-medium border active:opacity-70 disabled:opacity-40"
                style={{ borderColor: 'var(--border-default)', color: 'var(--label-secondary)' }}
              >
                {loading
                  ? <><Loader2 size={15} className="animate-spin" /> 解析中…</>
                  : <><Camera size={15} /> 写真を選ぶ / 撮影する</>
                }
              </button>
              <p className="text-label-tertiary text-[10px] text-center">
                イベントのフライヤーや告知画像を使えます
              </p>
            </div>
          )}

          {flashMsg && (
            <p className="text-xs text-center" style={{ color: '#34D399' }}>{flashMsg}</p>
          )}
          {error && (
            <p className="text-xs text-center text-red-400">{error}</p>
          )}
        </div>
      )}
    </div>
  );
}

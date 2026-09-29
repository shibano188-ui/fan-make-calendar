import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { X, Heart } from 'lucide-react';
import Chip from '../components/ui/Chip';
import { useToast } from '../components/ui/Toast';
import { haptic } from '../lib/haptics';
import { sendFeedback, type FeedbackKind } from '../lib/api';

// バグ・改善の報告（2026-09-30 柴野）。マイページから開く。
// 何でも自由に書いてもらう（バグ・改善案・ほしい機能）。送ったものは運営だけが読む（feedbacks・RLS）。
// 端末の種類とビルドの日時は、調べるときに要るので自動で添える（画面には出さない）。

const KINDS: { key: FeedbackKind; label: string }[] = [
  { key: 'bug', label: 'バグ' },
  { key: 'improve', label: '改善してほしい' },
  { key: 'feature', label: 'ほしい機能' },
  { key: 'other', label: 'その他' },
];

export default function Feedback() {
  const navigate = useNavigate();
  const toast = useToast();
  const [kind, setKind] = useState<FeedbackKind>('bug');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const goBack = () => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) navigate(-1);
    else navigate('/mypage', { replace: true });
  };

  const ready = !!body.trim() && !busy;
  const send = async () => {
    if (!ready) return;
    haptic.select();
    setBusy(true);
    try {
      await sendFeedback(kind, body, { platform: Capacitor.getPlatform(), build: __BUILD_TIME__ });
      setSent(true);
      setBody('');
    } catch {
      toast('送れませんでした。時間をおいてお試しください', 'error');
    }
    setBusy(false);
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <div className="mx-auto w-full max-w-app">
        <div className="sticky top-0 z-20 flex items-center gap-1 px-3 py-2.5 material-bar scroll-edge" style={{ paddingTop: 'calc(var(--sat) + 10px)' }}>
          <button onPointerDown={(e) => e.preventDefault()} onClick={goBack} aria-label="閉じる" className="pressable tap-44 p-1"><X size={22} /></button>
          <span className="font-semibold">バグ・改善の報告</span>
        </div>

        {sent ? (
          <div className="px-6 pt-16 pb-10 flex flex-col items-center text-center">
            <div className="w-16 h-16 rounded-full flex items-center justify-center"
              style={{ backgroundColor: 'color-mix(in srgb, var(--accent-color) 16%, transparent)', color: 'var(--accent-text)' }}>
              <Heart size={28} />
            </div>
            <p className="text-[18px] font-bold mt-4">ありがとうございます！</p>
            <p className="text-[14px] text-label-secondary leading-relaxed mt-2">いただいた声は、運営が全部読んでアプリづくりに活かします。</p>
            <button onClick={() => { haptic.select(); goBack(); }}
              className="pressable w-full mt-8 py-3 rounded-full text-[15px] font-semibold"
              style={{ backgroundColor: 'var(--accent-color)', color: 'var(--accent-on)' }}>
              閉じる
            </button>
            <button onClick={() => { haptic.select(); setSent(false); }} className="pressable mt-3 text-[13px] text-label-secondary">
              続けて送る
            </button>
          </div>
        ) : (
          <div className="px-4 pb-10">
            <p className="text-[13px] text-label-secondary leading-relaxed mt-2">
              うまく動かないところ、こうしてほしいところ、ほしい機能など、何でも教えてください。
            </p>
            <div className="text-[12px] text-label-secondary mb-1 mt-4">種類</div>
            <div className="flex flex-wrap gap-1.5">
              {KINDS.map((k) => <Chip key={k.key} active={kind === k.key} onClick={() => { haptic.select(); setKind(k.key); }}>{k.label}</Chip>)}
            </div>
            <div className="text-[12px] text-label-secondary mb-1 mt-4">内容</div>
            <textarea value={body} onChange={(e) => setBody(e.target.value.slice(0, 2000))} rows={7}
              placeholder={kind === 'bug' ? 'どの画面で、何をしたら、どうなったかを書いてもらえると助かります' : ''}
              className="w-full rounded-[10px] px-3 py-2.5 text-[14px] outline-none resize-none"
              style={{ backgroundColor: 'var(--fill-tertiary)', color: 'var(--input-text)' }} />
            <button onClick={send} disabled={!ready}
              className="pressable w-full mt-5 py-3 rounded-full text-[15px] font-semibold"
              style={ready ? { backgroundColor: 'var(--accent-color)', color: 'var(--accent-on)' } : { backgroundColor: 'var(--fill-tertiary)', color: 'var(--label-tertiary)' }}>
              送る
            </button>
            <p className="text-[11px] text-label-tertiary mt-3 text-center leading-relaxed">
              調べるために、端末の種類とアプリの版を一緒に送ります。
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

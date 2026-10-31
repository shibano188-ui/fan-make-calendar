import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { X, Heart } from 'lucide-react';
import { useToast } from '../components/ui/Toast';
import { haptic } from '../lib/haptics';
import { sendFeedback } from '../lib/api';
import { SURVEY_ID, markSurveyAnswered } from '../lib/survey';

// アプリの中のアンケート（2026-10-31 柴野）。案内は SurveySheet。
// 5段階の2問は必須、自由記述は空でもよい。回答は読みやすい文章にして feedbacks の本文（2000字まで）へ入れる。

const TEXT_MAX = 500;

function Scale({ value, onChange, low, high }: { value: number | null; onChange: (n: number) => void; low: string; high: string }) {
  return (
    <div>
      <div className="grid grid-cols-5 gap-2">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} onClick={() => { haptic.select(); onChange(n); }} aria-pressed={value === n}
            className="pressable h-11 rounded-[10px] text-[15px] font-semibold"
            style={value === n
              ? { backgroundColor: 'var(--accent-color)', color: 'var(--accent-on)' }
              : { backgroundColor: 'var(--fill-tertiary)', color: 'var(--label-primary)' }}>
            {n}
          </button>
        ))}
      </div>
      <div className="flex justify-between mt-1 text-[11px] text-label-tertiary">
        <span>{low}</span><span>{high}</span>
      </div>
    </div>
  );
}

function TextQuestion({ label, value, onChange }: { label: string; value: string; onChange: (s: string) => void }) {
  return (
    <div className="mt-6">
      <div className="text-[14px] font-semibold mb-2">{label}</div>
      <textarea value={value} onChange={(e) => onChange(e.target.value.slice(0, TEXT_MAX))} rows={3}
        className="w-full rounded-[10px] px-3 py-2.5 text-[14px] outline-none resize-none"
        style={{ backgroundColor: 'var(--fill-tertiary)', color: 'var(--input-text)' }} />
    </div>
  );
}

export default function Survey() {
  const navigate = useNavigate();
  const toast = useToast();
  const [usability, setUsability] = useState<number | null>(null);
  const [recommend, setRecommend] = useState<number | null>(null);
  const [complaint, setComplaint] = useState('');
  const [wish, setWish] = useState('');
  const [spread, setSpread] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const goBack = () => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) navigate(-1);
    else navigate('/', { replace: true });
  };

  const ready = usability !== null && recommend !== null && !busy;
  const send = async () => {
    if (!ready) return;
    haptic.select();
    setBusy(true);
    const lines = [
      `【アンケート ${SURVEY_ID}】`,
      `使い心地: ${usability}/5`,
      `すすめたい: ${recommend}/5`,
      complaint.trim() && `不満なところ: ${complaint.trim()}`,
      wish.trim() && `ほしい機能: ${wish.trim()}`,
      spread.trim() && `広めたくなる条件: ${spread.trim()}`,
    ].filter(Boolean);
    try {
      await sendFeedback(['other'], lines.join('\n'), { platform: Capacitor.getPlatform(), build: __BUILD_TIME__, page: `survey:${SURVEY_ID}` });
      markSurveyAnswered();
      setSent(true);
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
          <span className="font-semibold">アンケート</span>
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
          </div>
        ) : (
          <div className="px-4 pb-10">
            <div className="mt-3">
              <div className="text-[14px] font-semibold mb-2">FanHive の使い心地はどうですか？</div>
              <Scale value={usability} onChange={setUsability} low="使いにくい" high="使いやすい" />
            </div>
            <div className="mt-6">
              <div className="text-[14px] font-semibold mb-2">友だちにすすめたいと思いますか？</div>
              <Scale value={recommend} onChange={setRecommend} low="思わない" high="とても思う" />
            </div>
            <TextQuestion label="不満なところ・使いにくいところ" value={complaint} onChange={setComplaint} />
            <TextQuestion label="ほしい機能" value={wish} onChange={setWish} />
            <TextQuestion label="どうなったら人に広めたくなりますか？" value={spread} onChange={setSpread} />
            <button onClick={send} disabled={!ready}
              className="pressable w-full mt-6 py-3 rounded-full text-[15px] font-semibold"
              style={ready ? { backgroundColor: 'var(--accent-color)', color: 'var(--accent-on)' } : { backgroundColor: 'var(--fill-tertiary)', color: 'var(--label-tertiary)' }}>
              送る
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

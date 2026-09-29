import { useEffect, useState, useSyncExternalStore } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Heart, Bell, CalendarCheck } from 'lucide-react';
import { setAdsSuppressed } from '../lib/adSuppress';
import { requestTracking } from '../lib/att';
import { haptic } from '../lib/haptics';
import { useToast } from './ui/Toast';
import { ONBOARDING_KEY, TOUR_STEP_KEY, TOUR_EVENT_KEY, TOUR_EVENT, LIKED_EVENT, BELL_EVENT, FEATURE_PREMIUM } from '../lib/constants';

// オンボーディングの続き: **本物の画面**で、これから使う操作を1回ずつやってもらう（2026-09-29 柴野）。
//   like     … 探すで気になる予定の ♡ を押す
//   calendar … 自動でカレンダーへ移り、いいねした予定がその日に入ったのを見せる
//   bell     … そのままベルを押して通知をONにする（ここで初めて通知の許可を聞く）
// **スキップは無い**。下のタブは押せなくしてある（index.css の body[data-tour-step]）。
// 押してほしいボタン（data-tour="like" / "bell"）は同じ CSS で光らせる。
// 終わったら ONBOARDING_KEY を立て、トラッキングの許可(ATT)を聞く（通知の許可と重ならないよう、そのあと）。
//
// 段階は端末に残す（途中でアプリを閉じても、次の起動で続きから）。

export type TourStep = 'like' | 'calendar' | 'bell';

function readStep(): TourStep | null {
  try {
    const v = localStorage.getItem(TOUR_STEP_KEY);
    return v === 'like' || v === 'calendar' || v === 'bell' ? v : null;
  } catch { return null; }
}

function writeStep(step: TourStep | null): void {
  try {
    if (step) localStorage.setItem(TOUR_STEP_KEY, step);
    else { localStorage.removeItem(TOUR_STEP_KEY); localStorage.removeItem(TOUR_EVENT_KEY); }
  } catch { /* 残せなくても、この起動の間は続けられる */ }
  current = step;
  window.dispatchEvent(new Event(TOUR_EVENT));
}

let current: TourStep | null = readStep();

function subscribe(fn: () => void): () => void {
  window.addEventListener(TOUR_EVENT, fn);
  return () => window.removeEventListener(TOUR_EVENT, fn);
}

/** 今の段階（案内中でなければ null） */
export function useTourStep(): TourStep | null {
  return useSyncExternalStore(subscribe, () => current, () => null);
}

/** 案内の中でいいねした予定の id（カレンダーでその日を開くため） */
export function tourEventId(): string | null {
  try { return localStorage.getItem(TOUR_EVENT_KEY); } catch { return null; }
}

/** 作品を選び終えたら呼ぶ。探すへ移るのは OnboardingTour が段階を見てやる */
export function startTour(): void {
  writeStep('like');
}

// 段階ごとの吹き出し。本文は短く（長いと読まれない）
const COPY: Record<TourStep, { icon: typeof Heart; title: string; body: string }> = {
  like: { icon: Heart, title: '気になる予定に ♡ を押してみよう', body: '♡ を押した予定は、カレンダーに入ります。' },
  calendar: { icon: CalendarCheck, title: 'カレンダーに入りました', body: 'いいねした予定は、この日に入っています。' },
  bell: { icon: Bell, title: 'ベルを押して通知をONにしよう', body: '発売日や締切の前にお知らせします。' },
};

export default function OnboardingTour() {
  const step = useTourStep();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const toast = useToast();
  const [leaving, setLeaving] = useState(false);

  // 光らせる・タブを止めるのは CSS に任せる（どの画面の部品にも手を入れずに済む）
  useEffect(() => {
    if (step) document.body.dataset.tourStep = step;
    else delete document.body.dataset.tourStep;
  }, [step]);

  // 案内の間はバナーを出さない（吹き出しと重なる・押し間違える）
  useEffect(() => {
    if (step) setAdsSuppressed(true);
  }, [step]);

  // 段階に合った画面へ連れていく。予定詳細（/item/…）は開いてよい（詳細の ♡・ベルでも進める）
  useEffect(() => {
    if (!step || pathname.startsWith('/item/')) return;
    const want = step === 'like' ? '/explore' : '/saved';
    if (pathname !== want) navigate(want, { replace: true });
  }, [step, pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  // ♡ を押したら、少し待って（♡ の動きを見せてから）カレンダーへ
  useEffect(() => {
    if (step !== 'like') return;
    const onLiked = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      try { localStorage.setItem(TOUR_EVENT_KEY, id); } catch { /* 無くてもカレンダーは開ける */ }
      setLeaving(true);
      setTimeout(() => { setLeaving(false); writeStep('calendar'); navigate('/saved'); }, 700);
    };
    window.addEventListener(LIKED_EVENT, onLiked);
    return () => window.removeEventListener(LIKED_EVENT, onLiked);
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  // ベルを押して、通知の許可を聞き終えたら終わり（「カレンダーに入りました」の途中で押しても終わる）
  useEffect(() => {
    if (step !== 'calendar' && step !== 'bell') return;
    const onBell = () => { void finish(); };
    window.addEventListener(BELL_EVENT, onBell);
    return () => window.removeEventListener(BELL_EVENT, onBell);
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  const finish = async () => {
    try { localStorage.setItem(ONBOARDING_KEY, '1'); } catch { /* ignore */ }
    writeStep(null);
    setAdsSuppressed(false);
    toast('準備ができました');
    // トラッキングの許可は案内が終わってから（通知の許可のダイアログは閉じ終わっている）
    await requestTracking();
    // 決済が繋がるまでは買えない案内を出さない方針なので FEATURE_PREMIUM で止めてある
    if (FEATURE_PREMIUM) navigate('/premium');
  };

  // 予定詳細では出さない（上の「戻る」に重なる）。詳細の ♡・ベルでも先へ進む
  if (!step || pathname.startsWith('/item/')) return null;
  const { icon: Icon, title, body } = COPY[step];

  return (
    <div className="fixed inset-x-0 top-0 z-[250] max-w-app mx-auto px-3 pointer-events-none"
      style={{ paddingTop: 'calc(var(--sat) + 8px)' }}>
      <div className="pointer-events-auto rounded-[16px] shadow-float px-4 py-3 flex items-center gap-3"
        style={{
          backgroundColor: 'var(--bg-primary)',
          border: '1.5px solid var(--accent-color)',
          opacity: leaving ? 0 : 1,
          transition: 'opacity 0.3s ease',
          animation: 'tourBubbleIn 0.35s cubic-bezier(0.32,0.72,0,1) both',
        }}
        key={step}>
        <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: 'color-mix(in srgb, var(--accent-color) 16%, transparent)' }}>
          <Icon size={20} style={{ color: 'var(--accent-text)' }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-bold leading-snug">{title}</p>
          <p className="text-[12px] text-label-secondary leading-snug mt-0.5">{body}</p>
        </div>
        {step === 'calendar' && (
          <button onClick={() => { haptic.select(); writeStep('bell'); }}
            className="pressable flex-shrink-0 px-3.5 py-2 rounded-full text-[13px] font-semibold"
            style={{ backgroundColor: 'var(--accent-color)', color: 'var(--accent-on)' }}>
            次へ
          </button>
        )}
      </div>
    </div>
  );
}

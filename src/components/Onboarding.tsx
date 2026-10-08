import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { setAdsSuppressed } from '../lib/adSuppress';
import { ONBOARDING_KEY, TOUR_STEP_KEY } from '../lib/constants';
import OnboardingWorkPicker from './OnboardingWorkPicker';
import OnboardingIntro from './OnboardingIntro';
import { startTour } from './OnboardingTour';
import { logScreen } from '../lib/screenLog';

// 初回オンボーディング: ようこそ（OnboardingIntro）→ 推しの作品を選ぶ（2026-09-29 柴野の方針で作り直し）。
//  - **スキップは無い**。1つ選ぶまで「次へ」を押せない。既定の作品を勝手に入れることもしない
//  - 「次へ」のあとは説明のカードではなく、本物の画面で案内する（OnboardingTour）:
//    探すで予定にいいね → カレンダーに入ったのを見る → ベルで通知をON
//  - 前にあった説明カード3枚とAI入力の体験は外した。AI入力の体験は投稿の入口を作り替えてから戻す
//
// 表示条件: 案内を見終えていない（ONBOARDING_KEY が無い）かつ、案内の続き（TOUR_STEP_KEY）にまだ入っていない。
// ホームの上にだけ出す（予定詳細などをリンクから開いた人は、ホームに来たときに出る）。

export default function Onboarding() {
  const [show, setShow] = useState(() => {
    try { return !localStorage.getItem(ONBOARDING_KEY) && !localStorage.getItem(TOUR_STEP_KEY); } catch { return false; }
  });
  // 最初はようこその画面（ロゴのアニメーション・先読み）。「はじめる」で作品選びへ
  const [intro, setIntro] = useState(true);
  const [count, setCount] = useState(0);
  // 1つ目を選んだ瞬間だけ「次へ」を揺らす。数が増えるたびに揺らすとうるさい
  const [nudge, setNudge] = useState(0);
  const prevCount = useRef(0);
  const { pathname } = useLocation();

  const visible = show && pathname === '/';

  // バナー広告はWebViewの外に出るので、この画面を重ねても隠れない。ネイティブ側に伏せてもらう
  useEffect(() => {
    if (visible) setAdsSuppressed(true);
  }, [visible]);

  // どこで離れたかを見るため、案内の段階も画面として記録する
  useEffect(() => {
    if (visible) logScreen(intro ? '/onboarding/intro' : '/onboarding/works');
  }, [visible, intro]);

  const onCountChange = (n: number) => {
    if (prevCount.current === 0 && n > 0) setNudge((k) => k + 1);
    prevCount.current = n;
    setCount(n);
  };

  if (!visible) return null;
  if (intro) return <OnboardingIntro onStart={() => setIntro(false)} />;

  const next = () => {
    if (count === 0) return;
    setShow(false);
    startTour();
  };

  return (
    <div className="fixed inset-0 z-[300] max-w-app mx-auto flex flex-col" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <div className="flex-1 flex flex-col px-6 min-h-0" style={{ paddingTop: 'max(24px, calc(var(--sat) + 16px))' }}>
        <OnboardingWorkPicker onCountChange={onCountChange} />
      </div>

      <div className="px-8 pt-4" style={{ paddingBottom: 'max(40px, env(safe-area-inset-bottom))' }}>
        {/* 選ぶ前は薄く、選んだら濃くなって1回揺れる（文字で「次へを押して」とは書かない） */}
        <button
          key={nudge}
          onClick={next}
          disabled={count === 0}
          className="w-full py-3.5 rounded-full text-[15px] font-semibold pressable"
          style={{
            ...(count > 0
              ? { backgroundColor: 'var(--accent-color)', color: 'var(--accent-on)' }
              : { backgroundColor: 'color-mix(in srgb, var(--accent-color) 15%, transparent)', color: 'var(--accent-text)', opacity: 0.6 }),
            transition: 'background-color 0.25s ease, color 0.25s ease, opacity 0.25s ease',
            animation: nudge > 0 && count > 0 ? 'onboardingNudge 0.7s cubic-bezier(0.34,1.4,0.64,1) both' : undefined,
          }}
        >
          次へ
        </button>
      </div>
    </div>
  );
}

import { useRef, useState } from 'react';
import { CalendarDays, Heart, Bell, Sparkles } from 'lucide-react';

// 初回オンボーディング（現IA: ホーム/探す/＋投稿/カレンダー/マイページ 版）
// 表示条件: フラグ未設定のみ。キーを v2 に更新し、旧カードを見た人にも一度だけ出す
// （「いいね＝カレンダー追加」「通知がある」が伝わっていないため）。

const ONBOARDING_KEY = 'fan_onboarding_done_v2';

// 本文はワンセンテンス厳守（長いと読まれない）。改行は入れず折り返しに任せる。
const CARDS = [
  {
    icon: CalendarDays,
    title: '推しの予定、ぜんぶここに',
    body: 'ファンが見つけたイベントやグッズの予定が「探す」に集まります。',
  },
  {
    icon: Heart,
    title: 'いいねでカレンダーに追加',
    body: '気になる予定は ♡ を押すだけ。「カレンダー」タブに入ります。',
  },
  {
    icon: Bell,
    title: '通知で買い逃しを防ぐ',
    body: '追加した予定の 🔔 をONにすると、発売日や締切の前にお知らせ。',
  },
  {
    icon: Sparkles,
    title: 'Xで見つけたら、共有するだけ',
    body: '共有先に FanHive を選ぶと、AIが予定を自動入力します。',
  },
] as const;

export default function Onboarding() {
  const [show, setShow] = useState(() => !localStorage.getItem(ONBOARDING_KEY));
  const [page, setPage] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  if (!show) return null;

  const finish = () => {
    localStorage.setItem(ONBOARDING_KEY, '1');
    setShow(false);
  };

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    setPage(Math.round(el.scrollLeft / el.clientWidth));
  };

  return (
    <div className="fixed inset-0 z-[300] max-w-app mx-auto flex flex-col" style={{ backgroundColor: 'var(--bg-primary)' }}>
      {/* スキップ */}
      <div className="flex justify-end px-4 pt-4" style={{ paddingTop: 'max(16px, var(--sat))' }}>
        <button onClick={finish} className="text-[13px] text-label-tertiary px-3 py-2 pressable">
          スキップ
        </button>
      </div>

      {/* カード（横スワイプ・scroll-snap） */}
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="flex-1 flex overflow-x-auto"
        style={{ scrollSnapType: 'x mandatory', scrollbarWidth: 'none' }}
      >
        {CARDS.map(({ icon: Icon, title, body }) => (
          <div
            key={title}
            className="flex-shrink-0 w-full flex flex-col items-center justify-center gap-6 px-10 text-center"
            style={{ scrollSnapAlign: 'center' }}
          >
            <div
              className="w-24 h-24 rounded-[28px] flex items-center justify-center"
              style={{ backgroundColor: 'color-mix(in srgb, var(--accent-color) 14%, transparent)' }}
            >
              <Icon size={44} style={{ color: 'var(--accent-text)' }} strokeWidth={1.6} />
            </div>
            <p className="text-[22px] font-bold text-label-primary leading-snug">{title}</p>
            <p className="text-[14px] text-label-secondary leading-relaxed max-w-[280px]">{body}</p>
          </div>
        ))}
      </div>

      {/* ページドット + CTA */}
      <div className="flex flex-col items-center gap-6 pb-10 px-8" style={{ paddingBottom: 'max(40px, env(safe-area-inset-bottom))' }}>
        <div className="flex gap-2">
          {CARDS.map((_, i) => (
            <div
              key={i}
              className="w-2 h-2 rounded-full transition-colors"
              style={{ backgroundColor: i === page ? 'var(--accent-text)' : 'var(--fill-primary)' }}
            />
          ))}
        </div>
        {page === CARDS.length - 1 ? (
          <button
            onClick={finish}
            className="w-full py-3.5 rounded-full text-[15px] font-semibold pressable"
            style={{ backgroundColor: 'var(--accent-color)', color: 'var(--accent-on)' }}
          >
            はじめる
          </button>
        ) : (
          <button
            onClick={() => scrollRef.current?.scrollBy({ left: scrollRef.current.clientWidth, behavior: 'smooth' })}
            className="w-full py-3.5 rounded-full text-[15px] font-semibold pressable"
            style={{ backgroundColor: 'color-mix(in srgb, var(--accent-color) 15%, transparent)', color: 'var(--accent-text)' }}
          >
            次へ
          </button>
        )}
      </div>
    </div>
  );
}

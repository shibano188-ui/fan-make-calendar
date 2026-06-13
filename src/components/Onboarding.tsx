import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarDays, Heart, Share2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { listRecentWorks } from '../lib/api';

// 初回オンボーディング（Phase G-1）
// 表示条件: fan_onboarding_done なし かつ 参加作品 0 件。既存ユーザーには出ない。

const ONBOARDING_KEY = 'fan_onboarding_done';

const CARDS = [
  {
    icon: CalendarDays,
    title: '推しの予定、ぜんぶここに',
    body: 'イベント・グッズ・アニメ・誕生日。\nファンが見つけた予定が、作品ごとのカレンダーに集まります。',
  },
  {
    icon: Heart,
    title: 'いいねで自分のカレンダーへ',
    body: '発見タブでみんなの投稿を眺めて、\n気になる予定はいいねするだけで追加されます。',
  },
  {
    icon: Share2,
    title: 'Xで見つけたら、共有するだけ',
    body: '共有メニューから FanHive を選ぶと、\nAIがポストを読み取って予定を自動入力します。',
  },
] as const;

export default function Onboarding() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [show, setShow] = useState(false);
  const [page, setPage] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (localStorage.getItem(ONBOARDING_KEY)) return;
    if (!user) return;
    listRecentWorks(user.id).then(ws => {
      if (ws.length === 0) setShow(true);
      else localStorage.setItem(ONBOARDING_KEY, '1'); // 既存ユーザーは以後表示しない
    }).catch(() => {});
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!show) return null;

  const finish = (toSelect: boolean) => {
    localStorage.setItem(ONBOARDING_KEY, '1');
    setShow(false);
    if (toSelect) navigate('/select');
  };

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    setPage(Math.round(el.scrollLeft / el.clientWidth));
  };

  return (
    <div className="fixed inset-0 z-[300] max-w-app mx-auto flex flex-col" style={{ backgroundColor: 'var(--bg-primary)' }}>
      {/* スキップ */}
      <div className="flex justify-end px-4 pt-4" style={{ paddingTop: 'max(16px, env(safe-area-inset-top))' }}>
        <button onClick={() => finish(false)} className="text-[13px] text-label-tertiary px-3 py-2 pressable">
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
            <p className="text-[14px] text-label-secondary leading-relaxed whitespace-pre-line">{body}</p>
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
            onClick={() => finish(true)}
            className="w-full py-3.5 rounded-full text-[15px] font-semibold pressable"
            style={{ backgroundColor: 'var(--accent-color)', color: 'var(--accent-on)' }}
          >
            作品を選んではじめる
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

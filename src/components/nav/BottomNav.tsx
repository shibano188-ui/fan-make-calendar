import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Home, Search, CalendarDays, User, Plus, type LucideIcon } from 'lucide-react';
import { haptic } from '../../lib/haptics';
import { useTyping } from '../../hooks/useTyping';
import PostChooser from '../PostChooser';

const tabs: { label: string; icon: LucideIcon; path: string }[] = [
  { label: 'ホーム', icon: Home,     path: '/' },
  { label: '探す',   icon: Search,   path: '/explore' },
  { label: 'カレンダー', icon: CalendarDays, path: '/saved' },
  { label: 'マイページ', icon: User,  path: '/mypage' },
];

function isActive(path: string, pathname: string): boolean {
  return path === '/' ? pathname === '/' : pathname.startsWith(path);
}

/**
 * ホーム / 探す / ＋(投稿) / カレンダー / マイページ。
 * 2026-11-07 デザインの一新（時刻表）: 浮いたガラスの丸バーをやめ、画面の下に貼り付いた平らなバーにした。
 * 上に細い線を1本引くだけ。今いるタブは文字色を濃くするだけで、色は＋（アクセント）にしか使わない。
 */
export default function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const go = (p: string) => { haptic.select(); navigate(p); };
  // ＋は「Xのポストから追加」「情報を送る」を選ぶシートを開く（2026-09-29）
  const [chooser, setChooser] = useState(false);
  // 入力中は隠す（Android はキーボードの分だけ画面が縮み、バーがキーボードの上に乗ってしまう）
  const typing = useTyping();
  const activeIdx = tabs.findIndex((t) => isActive(t.path, location.pathname));

  return (
    <nav
      data-bottom-nav
      className="fixed inset-x-0 bottom-0 z-[100] flex justify-center"
      style={{
        transform: typing ? 'translateY(100%)' : 'none',
        visibility: typing ? 'hidden' : 'visible',
        transition: typing ? 'transform 0.18s ease-in, visibility 0s 0.18s' : 'transform 0.24s ease-out',
      }}
    >
      <div
        data-skin-part="nav"
        className="w-full max-w-app flex items-stretch"
        style={{ backgroundColor: 'var(--bg-primary)', borderTop: '0.5px solid var(--separator)', paddingBottom: 'var(--sab)' }}
      >
        {tabs.slice(0, 2).map((t, i) => (
          <TabButton key={t.path} {...t} idx={i} active={i === activeIdx} onClick={() => go(t.path)} />
        ))}

        {/* 中央＋（投稿） */}
        <div className="flex-1 flex items-center justify-center">
          <button
            onClick={() => { haptic.select(); setChooser(true); }}
            aria-label="情報を追加"
            data-tour="post"
            data-skin-part="nav-add"
            className="pressable w-12 h-9 rounded-full flex items-center justify-center"
            style={{ backgroundColor: 'var(--accent-color)', color: 'var(--accent-on)' }}
          >
            <Plus size={22} strokeWidth={2.6} aria-hidden />
          </button>
        </div>

        {tabs.slice(2).map((t, i) => (
          <TabButton key={t.path} {...t} idx={i + 2} active={i + 2 === activeIdx} onClick={() => go(t.path)} />
        ))}
      </div>
      <PostChooser open={chooser} onClose={() => setChooser(false)} />
    </nav>
  );
}

function TabButton({ label, icon: Icon, active, onClick, path, idx }: {
  label: string; icon: LucideIcon; active: boolean; onClick: () => void; path: string; idx: number;
}) {
  return (
    // data-nav-cal: いいね演出（likeEffect）がカレンダータブへの線の到達点として参照する
    <button
      onClick={onClick}
      data-skin-part="nav-item"
      data-tab-idx={idx}
      data-nav-cal={path === '/saved' ? '' : undefined}
      className="pressable flex-1 flex flex-col items-center justify-center gap-[3px] h-[52px]"
      aria-label={label}
      aria-current={active ? 'page' : undefined}
    >
      <Icon size={22} aria-hidden strokeWidth={active ? 2.4 : 1.7}
        style={{ color: active ? 'var(--label-primary)' : 'var(--label-tertiary)' }} />
      <span className="text-[10px] leading-none whitespace-nowrap"
        style={{ color: active ? 'var(--label-primary)' : 'var(--label-tertiary)', fontWeight: active ? 700 : 500 }}>
        {label}
      </span>
    </button>
  );
}

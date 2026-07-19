import { useLayoutEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Home, Search, CalendarDays, User, Plus, type LucideIcon } from 'lucide-react';
import { haptic } from '../../lib/haptics';
import { spring, prefersReducedMotion, type SpringHandle } from '../../lib/fluid';

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
 * ピボット後の新IA：ホーム / 探す / ＋(投稿) / カレンダー / マイページ。
 * 画面下に浮かぶガラスの丸バー。コンテンツはバーの下を流れ、
 * アクティブ表示はスプリングでタブ間を滑る（X/幅は独立ばね・中断可能）。
 */
export default function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const go = (p: string) => { haptic.select(); navigate(p); };

  const rowRef = useRef<HTMLDivElement>(null);
  const indRef = useRef<HTMLDivElement>(null);
  const pos = useRef({ x: 0, w: 0, sx: null as SpringHandle | null, sw: null as SpringHandle | null, init: false });

  const activeIdx = tabs.findIndex((t) => isActive(t.path, location.pathname));

  useLayoutEffect(() => {
    const row = rowRef.current, ind = indRef.current;
    if (!row || !ind) return;
    const apply = () => {
      ind.style.transform = `translateX(${pos.current.x}px)`;
      ind.style.width = `${pos.current.w}px`;
    };
    const btn = row.querySelector<HTMLElement>(`[data-tab-idx="${activeIdx}"]`);
    if (!btn) { ind.style.opacity = '0'; return; }
    ind.style.opacity = '1';
    const tx = btn.offsetLeft, tw = btn.offsetWidth;
    if (!pos.current.init || prefersReducedMotion()) {
      pos.current.init = true;
      pos.current.x = tx; pos.current.w = tw;
      apply();
      return;
    }
    // 進行中でも現在値・速度から連続的に目標を差し替える
    const vx = pos.current.sx?.running ? pos.current.sx.velocity : 0;
    pos.current.sx?.stop(); pos.current.sw?.stop();
    pos.current.sx = spring({ from: pos.current.x, to: tx, velocity: vx, damping: 1, response: 0.32,
      onUpdate: (v) => { pos.current.x = v; apply(); } });
    pos.current.sw = spring({ from: pos.current.w, to: tw, damping: 1, response: 0.32,
      onUpdate: (v) => { pos.current.w = v; apply(); } });
  }, [activeIdx]);

  return (
    <nav
      className="fixed inset-x-0 z-[100] flex justify-center pointer-events-none"
      style={{ bottom: 'calc(env(safe-area-inset-bottom) + 10px)' }}
    >
      <div
        ref={rowRef}
        className="pointer-events-auto relative flex items-center rounded-full material-bar border border-subtle shadow-float px-1.5 py-1.5"
      >
        {/* アクティブタブの背景ピル（スプリングで追従） */}
        <div
          ref={indRef}
          aria-hidden
          className="absolute top-1.5 bottom-1.5 left-0 rounded-full"
          style={{ backgroundColor: 'var(--fill-tertiary)', width: 0, opacity: 0, willChange: 'transform, width' }}
        />
        {tabs.slice(0, 2).map((t, i) => (
          <TabButton key={t.path} {...t} idx={i} active={i === activeIdx} onClick={() => go(t.path)} />
        ))}

        {/* 中央＋（投稿） */}
        <button
          onClick={() => go('/post')}
          aria-label="投稿"
          className="pressable relative w-11 h-11 mx-1 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: 'var(--accent-color)', color: 'var(--accent-on)', boxShadow: '0 2px 10px rgba(0,0,0,0.25)' }}
        >
          <Plus size={24} strokeWidth={2.4} />
        </button>

        {tabs.slice(2).map((t, i) => (
          <TabButton key={t.path} {...t} idx={i + 2} active={i + 2 === activeIdx} onClick={() => go(t.path)} />
        ))}
      </div>
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
      data-tab-idx={idx}
      data-nav-cal={path === '/saved' ? '' : undefined}
      className="pressable relative flex flex-col items-center justify-center gap-[2px] w-[62px] py-1.5 rounded-full"
      aria-label={label}
      aria-current={active ? 'page' : undefined}
    >
      <Icon
        size={21}
        className={active ? '' : 'text-label-tertiary'}
        style={active ? { color: 'var(--accent-color)' } : {}}
        strokeWidth={active ? 2.5 : 1.8}
      />
      <span
        className={`text-[10px] leading-none whitespace-nowrap ${active ? 'font-semibold' : 'text-label-tertiary'}`}
        style={active ? { color: 'var(--accent-color)' } : {}}
      >
        {label}
      </span>
    </button>
  );
}

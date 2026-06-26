import { useLocation, useNavigate } from 'react-router-dom';
import { Home, Search, CalendarDays, User, Plus, type LucideIcon } from 'lucide-react';
import { haptic } from '../../lib/haptics';

const tabs: { label: string; icon: LucideIcon; path: string }[] = [
  { label: 'ホーム', icon: Home,     path: '/' },
  { label: '探す',   icon: Search,   path: '/explore' },
  { label: 'カレンダー', icon: CalendarDays, path: '/saved' },
  { label: 'マイページ', icon: User,  path: '/mypage' },
];

function isActive(path: string, pathname: string): boolean {
  return path === '/' ? pathname === '/' : pathname.startsWith(path);
}

/** ピボット後の新IA：ホーム / 探す / ＋(投稿) / いいね / マイページ。 */
export default function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const go = (p: string) => { haptic.select(); navigate(p); };

  return (
    <nav
      className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-app border-t border-separator z-[100]"
      style={{
        backgroundColor: 'color-mix(in srgb, var(--bg-primary) 88%, transparent)',
        backdropFilter: 'saturate(180%) blur(20px)',
        WebkitBackdropFilter: 'saturate(180%) blur(20px)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      <div className="flex items-center">
        {tabs.slice(0, 2).map((t) => (
          <TabButton key={t.path} {...t} active={isActive(t.path, location.pathname)} onClick={() => go(t.path)} />
        ))}

        {/* 中央＋（投稿）＝一段持ち上げたアクセントボタン */}
        <div className="flex-1 flex justify-center">
          <button
            onClick={() => go('/post')}
            aria-label="投稿"
            className="pressable -mt-5 w-14 h-14 rounded-full flex items-center justify-center shadow-card"
            style={{ backgroundColor: 'var(--accent-color)', color: 'var(--accent-on)' }}
          >
            <Plus size={26} strokeWidth={2.6} />
          </button>
        </div>

        {tabs.slice(2).map((t) => (
          <TabButton key={t.path} {...t} active={isActive(t.path, location.pathname)} onClick={() => go(t.path)} />
        ))}
      </div>
    </nav>
  );
}

function TabButton({ label, icon: Icon, active, onClick }: { label: string; icon: LucideIcon; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex-1 flex flex-col items-center gap-[3px] py-2 pressable" aria-label={label}>
      <Icon
        size={22}
        className={active ? '' : 'text-label-tertiary'}
        style={active ? { color: 'var(--accent-color)' } : {}}
        strokeWidth={active ? 2.5 : 1.8}
      />
      <span
        className={`text-[10px] leading-none whitespace-nowrap ${active ? '' : 'text-label-tertiary'}`}
        style={active ? { color: 'var(--accent-color)' } : {}}
      >
        {label}
      </span>
    </button>
  );
}

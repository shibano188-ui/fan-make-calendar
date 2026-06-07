import { useLocation, useNavigate } from 'react-router-dom';
import { Search, CalendarDays, Compass, User } from 'lucide-react';

export const BANNER_H = 50;
export const NAV_H = 56;
export const BOTTOM_TOTAL_H = BANNER_H + NAV_H; // 106

const tabs = [
  { label: '作品',       icon: Search,      index: 0 },
  { label: '発見',       icon: Compass,     index: 1 },
  { label: 'カレンダー', icon: CalendarDays, index: 2 },
  { label: 'プロフィール', icon: User,      index: 3 },
];

function getTabPath(index: number): string {
  if (index === 0) return '/select';
  if (index === 1) return '/discover';
  if (index === 2) return '/calendar';
  return '/profile';
}

function isTabActive(index: number, pathname: string): boolean {
  if (index === 0) return pathname === '/select';
  if (index === 1) return pathname === '/discover';
  if (index === 2) return pathname === '/' || pathname.startsWith('/calendar');
  return pathname === '/profile';
}

export default function BottomTab() {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <>
      {/* 広告バナースロット（React Nativeでは AdMob コンポーネントに置き換える） */}
      <div
        className="fixed left-1/2 -translate-x-1/2 w-full max-w-app flex items-center justify-center border-t border-subtle z-[99]"
        style={{ bottom: NAV_H, height: BANNER_H, backgroundColor: 'var(--bg-secondary)' }}
      >
        <span className="text-label-tertiary text-xs">広告</span>
      </div>

      <nav
        className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-app bg-bg-primary border-t border-subtle z-[100]"
        style={{ backgroundColor: 'var(--bg-primary)' }}
      >
        <div className="flex">
          {tabs.map(({ label, icon: Icon, index }) => {
            const active = isTabActive(index, location.pathname);
            return (
              <button
                key={index}
                onClick={() => navigate(getTabPath(index))}
                className="flex-1 flex flex-col items-center gap-1 py-2 transition-colors"
                aria-label={label}
              >
                <Icon
                  size={20}
                  className={active ? '' : 'text-label-tertiary'}
                  style={active ? { color: 'var(--accent-color)' } : {}}
                  strokeWidth={active ? 2 : 1.5}
                />
                <span
                  className={`text-[10px] ${active ? '' : 'text-label-tertiary'}`}
                  style={active ? { color: 'var(--accent-color)' } : {}}
                >
                  {label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
}

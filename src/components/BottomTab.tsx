import { useLocation, useNavigate } from 'react-router-dom';
import { Search, CalendarDays, Compass, User } from 'lucide-react';

const tabs = [
  { label: 'WORKS',    icon: Search,       index: 0 },
  { label: 'DISCOVER', icon: Compass,      index: 1 },
  { label: 'CALENDAR', icon: CalendarDays, index: 2 },
  { label: 'PROFILE',  icon: User,         index: 3 },
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
    <nav
      className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-app z-[100]"
      style={{
        backgroundColor: 'rgba(7,11,16,0.96)',
        borderTop: '1px solid rgba(0,200,255,0.22)',
        boxShadow: '0 -2px 16px rgba(0,0,0,0.6), 0 -1px 0 rgba(0,200,255,0.08)',
      }}
    >
      <div className="flex">
        {tabs.map(({ label, icon: Icon, index }) => {
          const active = isTabActive(index, location.pathname);
          return (
            <button
              key={index}
              onClick={() => navigate(getTabPath(index))}
              className="flex-1 flex flex-col items-center gap-0.5 py-2.5 transition-all active:opacity-60"
              aria-label={label}
            >
              <div
                className="relative flex items-center justify-center"
                style={{
                  filter: active ? 'drop-shadow(0 0 6px rgba(0,200,255,0.8))' : 'none',
                  transition: 'filter 0.2s',
                }}
              >
                <Icon
                  size={20}
                  style={{
                    color: active ? 'var(--accent-color)' : 'var(--label-tertiary)',
                    strokeWidth: active ? 2 : 1.5,
                    transition: 'color 0.2s',
                  }}
                />
              </div>
              <span
                className="text-[9px] tracking-wider"
                style={{
                  fontFamily: "'Rajdhani', sans-serif",
                  fontWeight: active ? 700 : 400,
                  color: active ? 'var(--accent-color)' : 'var(--label-tertiary)',
                  textShadow: active ? '0 0 6px rgba(0,200,255,0.6)' : 'none',
                  letterSpacing: '0.08em',
                  transition: 'color 0.2s',
                }}
              >
                {label}
              </span>
              {active && (
                <div
                  className="absolute bottom-0 w-6 h-px"
                  style={{ background: 'linear-gradient(90deg, transparent, var(--accent-color), transparent)' }}
                />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

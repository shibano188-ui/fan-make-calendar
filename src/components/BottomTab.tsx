import { useLocation, useNavigate } from 'react-router-dom';
import { Search, CalendarDays, Palette } from 'lucide-react';

const tabs = [
  { label: '作品', icon: Search, index: 0 },
  { label: 'カレンダー', icon: CalendarDays, index: 1 },
  { label: '設定', icon: Palette, index: 2 },
];

function getCalendarPath(): string {
  return '/calendar';
}

function getTabPath(index: number): string {
  if (index === 0) return '/select';
  if (index === 1) return getCalendarPath();
  return '/customize';
}

function isTabActive(index: number, pathname: string): boolean {
  if (index === 0) return pathname === '/select';
  if (index === 1) return pathname === '/' || pathname.startsWith('/calendar');
  return pathname === '/customize';
}

export default function BottomTab() {
  const location = useLocation();
  const navigate = useNavigate();

  return (
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
  );
}

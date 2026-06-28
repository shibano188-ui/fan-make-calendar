import { Outlet } from 'react-router-dom';
import BottomNav from './nav/BottomNav';
import { useNotificationScheduler } from '../hooks/useNotificationScheduler';

/** 新IAの共通シェル。コンテンツ(Outlet) + 下部ナビ。 */
export default function AppShell() {
  useNotificationScheduler();
  return (
    <div className="min-h-[100dvh]" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <div className="mx-auto w-full max-w-app min-h-[100dvh] flex flex-col">
        <main className="flex-1 pb-20">
          <Outlet />
        </main>
        <BottomNav />
      </div>
    </div>
  );
}

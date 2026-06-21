import { Outlet } from 'react-router-dom';
import BottomNav from './nav/BottomNav';

/** 新IAの共通シェル。コンテンツ(Outlet) + 下部ナビ。 */
export default function AppShell() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <div className="mx-auto w-full max-w-app min-h-screen flex flex-col">
        <main className="flex-1 pb-20">
          <Outlet />
        </main>
        <BottomNav />
      </div>
    </div>
  );
}

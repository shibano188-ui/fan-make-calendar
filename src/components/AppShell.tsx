import { Outlet } from 'react-router-dom';
import BottomNav from './nav/BottomNav';
import { useNotificationScheduler } from '../hooks/useNotificationScheduler';

/** 新IAの共通シェル。コンテンツ(Outlet) + 下部ナビ。 */
export default function AppShell() {
  useNotificationScheduler();
  return (
    <div className="min-h-[100dvh]" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <div className="mx-auto w-full max-w-app min-h-[100dvh] flex flex-col">
        {/* 下端は浮遊バーの下をコンテンツが流れる。バー高さ+余白ぶんの逃げを確保 */}
        <main className="flex-1 pb-28">
          <Outlet />
        </main>
        <BottomNav />
      </div>
    </div>
  );
}

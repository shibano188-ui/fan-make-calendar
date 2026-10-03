import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import BottomNav from './nav/BottomNav';
import DraftBar from './theme/DraftBar';
import { useNotificationScheduler } from '../hooks/useNotificationScheduler';
import { loadExploreRange } from '../lib/onboardingPreload';
import { loadCachedLarge, EXPLORE_EVENTS_KEY } from '../lib/swrCache';

// ホーム・探すの全予定の一覧を、起動して少ししたら裏で読んでおく（2026-10-04 柴野「カレンダーを開いている間に読み込んでおく」）。
// アプリはカレンダーで起動するので、今まではホーム・探すを開いた時点で初めて数秒の取得が始まっていた。
// 前回の一覧を IndexedDB からメモリへ上げ、続けて最新を取る（api 側が2分覚えているので、画面を開いても取り直さない）。
// カレンダーの読み込みと取り合わないよう、少し待ってから始める
const PREFETCH_DELAY_MS = 800;

/** 新IAの共通シェル。コンテンツ(Outlet) + 下部ナビ。 */
export default function AppShell() {
  useNotificationScheduler();
  useEffect(() => {
    const t = setTimeout(() => {
      void loadCachedLarge(EXPLORE_EVENTS_KEY).then(() => loadExploreRange());
      void import('../pages/Explore').catch(() => {});
      void import('../pages/Home').catch(() => {});
    }, PREFETCH_DELAY_MS);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="min-h-[100dvh]" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <div className="mx-auto w-full max-w-app min-h-[100dvh] flex flex-col">
        {/* 下端は浮遊バーの下をコンテンツが流れる。バー高さ+余白ぶんの逃げを確保 */}
        <main className="flex-1 pb-28">
          <Outlet />
        </main>
        {/* 作りかけのテーマがあるときだけ出る。他の画面で見た目を確かめて戻ってこられる */}
        <DraftBar />
        <BottomNav />
      </div>
    </div>
  );
}

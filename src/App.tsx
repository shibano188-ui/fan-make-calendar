import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom';
import { ThemeProvider } from './contexts/ThemeContext';
import { AuthProvider } from './contexts/AuthContext';
import { ConfirmProvider } from './components/ui/ConfirmDialog';
import { ActionSheetProvider } from './components/ui/ActionSheet';
import { ToastProvider } from './components/ui/Toast';
import PhoneFrame from './components/PhoneFrame';
import Onboarding from './components/Onboarding';
import { Capacitor } from '@capacitor/core';
import { initAdMob } from './lib/admob';
import { SHOW_ONBOARDING } from './lib/constants';

// ピボット後IA（feat/pivot-rebuild）。旧 Calendar 中心の画面は順次置換。
const AppShell        = lazy(() => import('./components/AppShell'));
const Home            = lazy(() => import('./pages/Home'));
const Explore         = lazy(() => import('./pages/Explore'));
const Saved           = lazy(() => import('./pages/Saved'));
const MyPage          = lazy(() => import('./pages/MyPage'));
const PostNew         = lazy(() => import('./pages/PostNew'));
const ItemDetail      = lazy(() => import('./pages/ItemDetail'));
const Customize       = lazy(() => import('./pages/Customize'));
const WidgetCountdown = lazy(() => import('./pages/WidgetCountdown'));
const WidgetToday     = lazy(() => import('./pages/WidgetToday'));
const WidgetMonth     = lazy(() => import('./pages/WidgetMonth'));
const ShareTarget     = lazy(() => import('./pages/ShareTarget'));
const NotFound        = lazy(() => import('./pages/NotFound'));

function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <div
        className="w-6 h-6 rounded-full border-2 animate-spin"
        style={{ borderColor: 'var(--label-tertiary)', borderTopColor: 'var(--label-primary)' }}
      />
    </div>
  );
}

// Capacitorネイティブ上でのシェア受け取り
function AndroidShareHandler() {
  const navigate = useNavigate();
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const handle = async () => {
      try {
        const { SendIntent } = await import('send-intent');
        const result = await SendIntent.checkSendIntentReceived();
        const url  = (result as Record<string, string | undefined>).url  ?? '';
        const text = (result as Record<string, string | undefined>).text ?? '';
        const title = (result as Record<string, string | undefined>).title ?? '';
        if (!url && !text) return;
        const params = new URLSearchParams();
        if (url)   params.set('url',   url);
        if (text)  params.set('text',  text);
        if (title) params.set('title', title);
        navigate(`/post?${params.toString()}`, { replace: true });
      } catch (e) { console.error('[ShareHandler]', e); }
    };

    handle();
    window.addEventListener('sendIntentReceived', handle);
    return () => window.removeEventListener('sendIntentReceived', handle);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

function AdMobController() {
  useEffect(() => { initAdMob(); }, []);
  return null;
}

// Androidの戻る（エッジスワイプ／ハードウェアキー）を購読し、
// 履歴があれば前の画面へ戻る。ルートタブ（ホーム/探す/いいね/マイページ）では
// 戻り先が無いのでアプリを終了する。未購読だと既定で即終了してしまうため必須。
const ROOT_PATHS = ['/', '/explore', '/saved', '/mypage'];
function BackButtonHandler() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let remove: (() => void) | undefined;
    (async () => {
      const { App } = await import('@capacitor/app');
      const handle = await App.addListener('backButton', ({ canGoBack }) => {
        const atRoot = ROOT_PATHS.includes(window.location.pathname);
        if (!atRoot && canGoBack) window.history.back();
        else App.exitApp();
      });
      remove = () => handle.remove();
    })();
    return () => { remove?.(); };
  }, []);
  return null;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ThemeProvider>
        <ConfirmProvider>
        <ActionSheetProvider>
        <ToastProvider>
          <AndroidShareHandler />
          <AdMobController />
          <BackButtonHandler />
          <Suspense fallback={<PageLoader />}>
            <Routes>
              {/* ウィジェット・共有ターゲット（PhoneFrameなし） */}
              <Route path="/widget/countdown/:workId" element={<WidgetCountdown />} />
              <Route path="/widget/today/:workId"     element={<WidgetToday />} />
              <Route path="/widget/month/:workId"     element={<WidgetMonth />} />
              <Route path="/share"                    element={<ShareTarget />} />

              {/* メインアプリ（新IA: ホーム/探す/いいね/マイページ ＋ 中央＋） */}
              <Route path="/*" element={
                <PhoneFrame>
                  {SHOW_ONBOARDING && <Onboarding />}
                  <Routes>
                    <Route element={<AppShell />}>
                      <Route path="/"        element={<Home />} />
                      <Route path="/explore" element={<Explore />} />
                      <Route path="/saved"   element={<Saved />} />
                      <Route path="/mypage"  element={<MyPage />} />
                    </Route>
                    <Route path="/post"     element={<PostNew />} />
                    <Route path="/item/:id" element={<ItemDetail />} />
                    <Route path="/customize" element={<Customize />} />
                    <Route path="*"         element={<NotFound />} />
                  </Routes>
                </PhoneFrame>
              } />
            </Routes>
          </Suspense>
        </ToastProvider>
        </ActionSheetProvider>
        </ConfirmProvider>
        </ThemeProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

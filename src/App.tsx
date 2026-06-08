import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom';
import { ThemeProvider } from './contexts/ThemeContext';
import { AuthProvider } from './contexts/AuthContext';
import PhoneFrame from './components/PhoneFrame';
import { Capacitor } from '@capacitor/core';
import { initAdMob, showBanner } from './lib/admob';

const WorkSelect      = lazy(() => import('./pages/WorkSelect'));
const Calendar        = lazy(() => import('./pages/Calendar'));
const Discover        = lazy(() => import('./pages/Discover'));
const DateDetail      = lazy(() => import('./pages/DateDetail'));
const PostCreate      = lazy(() => import('./pages/PostCreate'));
const Customize       = lazy(() => import('./pages/Customize'));
const Profile         = lazy(() => import('./pages/Profile'));
const Preorders       = lazy(() => import('./pages/Preorders'));
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
        navigate(`/share?${params.toString()}`, { replace: true });
      } catch (e) { console.error('[ShareHandler]', e); }
    };

    handle();
    window.addEventListener('sendIntentReceived', handle);
    return () => window.removeEventListener('sendIntentReceived', handle);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

function AdMobInitializer() {
  useEffect(() => {
    initAdMob().then(() => showBanner());
  }, []);
  return null;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ThemeProvider>
          <AndroidShareHandler />
          <AdMobInitializer />
          <Suspense fallback={<PageLoader />}>
            <Routes>
              {/* ウィジェット・共有ターゲット（PhoneFrameなし） */}
              <Route path="/widget/countdown/:workId" element={<WidgetCountdown />} />
              <Route path="/widget/today/:workId"     element={<WidgetToday />} />
              <Route path="/widget/month/:workId"     element={<WidgetMonth />} />
              <Route path="/share"                    element={<ShareTarget />} />

              {/* メインアプリ */}
              <Route path="/*" element={
                <PhoneFrame>
                  <Routes>
                    <Route path="/"                               element={<Calendar />} />
                    <Route path="/select"                          element={<WorkSelect />} />
                    <Route path="/discover"                        element={<Discover />} />
                    <Route path="/calendar"                       element={<Calendar />} />
                    <Route path="/calendar/:workId"               element={<Calendar />} />
                    <Route path="/calendar/:workId/date/:date"    element={<DateDetail />} />
                    <Route path="/calendar/:workId/post"          element={<PostCreate />} />
                    <Route path="/customize"                      element={<Customize />} />
                    <Route path="/profile"                        element={<Profile />} />
                    <Route path="/preorders"                      element={<Preorders />} />
                    <Route path="*"                               element={<NotFound />} />
                  </Routes>
                </PhoneFrame>
              } />
            </Routes>
          </Suspense>
        </ThemeProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

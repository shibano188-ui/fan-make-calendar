import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from './contexts/ThemeContext';
import { AuthProvider } from './contexts/AuthContext';
import PhoneFrame from './components/PhoneFrame';

const WorkSelect      = lazy(() => import('./pages/WorkSelect'));
const Calendar        = lazy(() => import('./pages/Calendar'));
const DateDetail      = lazy(() => import('./pages/DateDetail'));
const PostCreate      = lazy(() => import('./pages/PostCreate'));
const Customize       = lazy(() => import('./pages/Customize'));
const WidgetCountdown = lazy(() => import('./pages/WidgetCountdown'));
const WidgetToday     = lazy(() => import('./pages/WidgetToday'));
const WidgetMonth     = lazy(() => import('./pages/WidgetMonth'));
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

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ThemeProvider>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              {/* ウィジェット（PhoneFrameなし） */}
              <Route path="/widget/countdown/:workId" element={<WidgetCountdown />} />
              <Route path="/widget/today/:workId"     element={<WidgetToday />} />
              <Route path="/widget/month/:workId"     element={<WidgetMonth />} />

              {/* メインアプリ */}
              <Route path="/*" element={
                <PhoneFrame>
                  <Routes>
                    <Route path="/"                               element={<Calendar />} />
                    <Route path="/select"                          element={<WorkSelect />} />
                    <Route path="/calendar"                       element={<Calendar />} />
                    <Route path="/calendar/:workId"               element={<Calendar />} />
                    <Route path="/calendar/:workId/date/:date"    element={<DateDetail />} />
                    <Route path="/calendar/:workId/post"          element={<PostCreate />} />
                    <Route path="/customize"                      element={<Customize />} />
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

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Capacitor } from '@capacitor/core';
import { Analytics } from '@vercel/analytics/react';
import './index.css';
import App from './App';
import { cleanupLikeSessions } from './lib/constants';

if (new URLSearchParams(window.location.search).get('reset') === 'true') {
  localStorage.clear();
  window.location.replace(window.location.pathname);
}

cleanupLikeSessions();

// 旧IAの「カレンダーごとテーマ」残骸の掃除。このキーが残っていると起動時に
// 旧 cal_settings_<workId>（黒系アクセント等）が全画面に適用されてしまう。
// 新IAはグローバル設定のみ使う（旧 Calendar.tsx は非ルート・WidgetPreviewModal も PhoneFrame の開発用）。
localStorage.removeItem('last_calendar_workId');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    {/* Web（ブラウザ）アクセスのみ計測。ネイティブアプリでは送らない */}
    {!Capacitor.isNativePlatform() && <Analytics />}
  </StrictMode>
);

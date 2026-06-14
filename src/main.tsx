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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    {/* Web（ブラウザ）アクセスのみ計測。ネイティブアプリでは送らない */}
    {!Capacitor.isNativePlatform() && <Analytics />}
  </StrictMode>
);

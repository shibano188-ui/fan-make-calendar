import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Capacitor } from '@capacitor/core';
import { Analytics } from '@vercel/analytics/react';
import './index.css';
import './design/skins.css';
import App from './App';
import { cleanupLikeSessions, ONBOARDING_KEY, SHOW_ONBOARDING, START_PATH } from './lib/constants';

if (new URLSearchParams(window.location.search).get('reset') === 'true') {
  localStorage.clear();
  window.location.replace(window.location.pathname);
}

cleanupLikeSessions();

// 旧IAの「カレンダーごとテーマ」残骸の掃除。このキーが残っていると起動時に
// 旧 cal_settings_<workId>（黒系アクセント等）が全画面に適用されてしまう。
// 新IAはグローバル設定のみ使う（旧 Calendar.tsx は非ルート・WidgetPreviewModal も PhoneFrame の開発用）。
localStorage.removeItem('last_calendar_workId');

// 起動したときの最初の画面をカレンダーにする（カレンダーが主役のアプリなので）。
// 行き先は START_PATH で切り替えられる。
//
// ⚠️ ここでやるのは、**React を描き始める前に URL を決めるため**。
//    アプリの中から navigate() で飛ばすと、react-router が history の購読を
//    始めるより先に書き換わってしまい、URLだけ /saved になって画面はホームのまま、
//    という食い違いが起きる（実測で確認済み）。
// ⚠️ オンボーディングが済んでいない人はホームに残す。案内(Onboarding)は
//    pathname === '/' のときにしか出ないので、飛ばすと初回の説明が丸ごと消える。
// ⚠️ 差し替えるのは素の '/' で開いたときだけ。共有・ウィジェット・直リンクは触らない。
if (
  START_PATH !== '/' &&
  window.location.pathname === '/' &&
  !window.location.search &&
  !(SHOW_ONBOARDING && !localStorage.getItem(ONBOARDING_KEY))
) {
  window.history.replaceState(null, '', START_PATH);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    {/* Web（ブラウザ）アクセスのみ計測。ネイティブアプリでは送らない */}
    {!Capacitor.isNativePlatform() && <Analytics />}
  </StrictMode>
);

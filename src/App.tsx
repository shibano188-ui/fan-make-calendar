import { lazy, Suspense, useEffect, useLayoutEffect } from 'react';
import { BrowserRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { ThemeProvider } from './contexts/ThemeContext';
import { AuthProvider } from './contexts/AuthContext';
import { ConfirmProvider } from './components/ui/ConfirmDialog';
import { ActionSheetProvider } from './components/ui/ActionSheet';
import { ToastProvider } from './components/ui/Toast';
import PhoneFrame from './components/PhoneFrame';
import Onboarding from './components/Onboarding';
import { Capacitor } from '@capacitor/core';
import { initAdMob, showBanner, hideBanner } from './lib/admob';
import { installExternalLinkHandler } from './lib/openExternal';
import { useFeature } from './lib/premium';
import { useAdsSuppressed } from './lib/adSuppress';
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
const ThemeCreate     = lazy(() => import('./pages/ThemeCreate'));
const PriceDrops      = lazy(() => import('./pages/PriceDrops'));
const Follows         = lazy(() => import('./pages/Follows'));
const NotificationSettings = lazy(() => import('./pages/NotificationSettings'));
const Notices         = lazy(() => import('./pages/Notices'));
const Premium         = lazy(() => import('./pages/Premium'));
const PremiumWelcome  = lazy(() => import('./pages/PremiumWelcome'));
const WidgetCountdown = lazy(() => import('./pages/WidgetCountdown'));
const WidgetToday     = lazy(() => import('./pages/WidgetToday'));
const WidgetMonth     = lazy(() => import('./pages/WidgetMonth'));
const ShareTarget     = lazy(() => import('./pages/ShareTarget'));
// web版のデモ（design/panel ブランチ限定・PhoneFrame の外で全画面に描く）
const WebDemo         = lazy(() => import('./pages/WebDemo'));
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

// Capacitorネイティブ上でのシェア受け取り。
// Android は send-intent プラグイン（インテントを直接受ける）、
// iOS は Share Extension が `fanhive://?title=…&url=…` で本体を開くので
// @capacitor/app の appUrlOpen で受ける。出口はどちらも /post で同じ。
//
// iOS で send-intent の iOS 実装を使わないのは、AppDelegate から
// `import SendIntent` が要るが、Capacitor の SPM 構成では App ターゲットから
// その依存を解決できないため（CapApp-SPM 経由の間接依存になる）。
function NativeShareHandler() {
  const navigate = useNavigate();
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const isIOS = Capacitor.getPlatform() === 'ios';

    const goPost = (url: string, text: string, title: string) => {
      if (!url && !text && !title) return;
      const params = new URLSearchParams();
      if (url)   params.set('url',   url);
      if (text)  params.set('text',  text);
      if (title) params.set('title', title);
      navigate(`/post?${params.toString()}`, { replace: true });
    };

    // ── Android: send-intent ──
    const handleAndroid = async () => {
      try {
        const { SendIntent } = await import('send-intent');
        const result = await SendIntent.checkSendIntentReceived();
        const r = result as Record<string, string | undefined>;
        goPost(r.url ?? '', r.text ?? '', r.title ?? '');
      } catch (e) { console.error('[ShareHandler]', e); }
    };

    // ── iOS: Share Extension → fanhive:// ──
    // 拡張機能はURLの共有なら url に、本文だけの共有なら title に入れてくる。
    // 本文だけのときは text として渡す（/post 側は text からURLを拾える）。
    const handleIOSUrl = (rawUrl: string) => {
      try {
        const u = new URL(rawUrl);
        if (u.protocol !== 'fanhive:') return;
        const url = u.searchParams.get('url') ?? '';
        const title = u.searchParams.get('title') ?? '';
        if (url) goPost(url, '', title === url ? '' : title);
        else if (title) goPost('', title, '');
      } catch (e) { console.error('[ShareHandler:ios]', e); }
    };

    if (isIOS) {
      let remove: (() => void) | undefined;
      (async () => {
        const { App: CapApp } = await import('@capacitor/app');
        // 起動中に共有された場合
        const sub = await CapApp.addListener('appUrlOpen', (e) => handleIOSUrl(e.url));
        remove = () => { sub.remove(); };
        // コールドスタート（共有でアプリが起動された）場合はリスナー登録が間に合わない
        const launch = await CapApp.getLaunchUrl();
        if (launch?.url) handleIOSUrl(launch.url);
      })();
      return () => remove?.();
    }

    handleAndroid();
    window.addEventListener('sendIntentReceived', handleAndroid);
    return () => window.removeEventListener('sendIntentReceived', handleAndroid);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

function AdMobController() {
  useEffect(() => { initAdMob(); }, []);
  return null;
}

// 外部リンク（target="_blank"）をネイティブのブラウザで開く。
// Capacitor 標準の横取りは iPad の互換モードで無反応になるため（openExternal.ts のコメント参照）。
function ExternalLinkHandler() {
  useEffect(() => installExternalLinkHandler(), []);
  return null;
}

// バナー広告を出す画面はホームと探すの2つだけ。
//
// ⚠️ 表示の可否は**ここ1か所**で決める。以前は各ページの useAdBanner が出し入れしていたが、
// バナーはWebViewの外側に出るネイティブのビューなので、制御していない画面
// （/premium など）に持ち越される。実際、オンボーディング終了時に
// 「広告抑制の解除」と「ホームの離脱」が同時に起きて show が hide を追い越し、
// プレミアムの案内画面にバナーが残って**×ボタンが押せなく**なっていた。
const AD_PATHS = ['/', '/explore'];

/**
 * バナーを出さない画面へ移る**その瞬間**に消す（Reactの描画を待たない）。
 *
 * 下の AdBannerController は「新しい画面を描き終えて commit したあと」にしか動けない。
 * カレンダーやマイページは描画も初回データ取得も重く、その間バナーはWebViewの外側に
 * 残ったまま次の画面の上に居座る（実機Androidで「移動しても広告がしばらく消えない」の正体）。
 * react-router の遷移は必ず history.pushState / popstate を通るので、そこを捕まえれば
 * 描画より先に、しかもタブに限らずどの遷移でもネイティブへ hide を投げられる。
 *
 * ⚠️ ここで**出す**ことはしない。表示の判断は AdBannerController の一元管理のまま。
 *    早出しすると、昔の「show が hide を追い越して /premium にバナーが残る」に逆戻りする。
 */
function useHideBannerOnLeave(): void {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const hideIfLeaving = (path: string) => { if (!AD_PATHS.includes(path)) hideBanner(); };
    const pathOf = (url: string | URL | null | undefined): string => {
      if (url == null) return window.location.pathname;
      try { return new URL(String(url), window.location.href).pathname; }
      catch { return window.location.pathname; }
    };
    const origPush = window.history.pushState;
    const origReplace = window.history.replaceState;
    window.history.pushState = function (...args) {
      hideIfLeaving(pathOf(args[2]));
      return origPush.apply(this, args);
    };
    window.history.replaceState = function (...args) {
      hideIfLeaving(pathOf(args[2]));
      return origReplace.apply(this, args);
    };
    const onPop = () => hideIfLeaving(window.location.pathname);
    window.addEventListener('popstate', onPop);
    return () => {
      window.history.pushState = origPush;
      window.history.replaceState = origReplace;
      window.removeEventListener('popstate', onPop);
    };
  }, []);
}

function AdBannerController() {
  const { pathname } = useLocation();
  const premiumNoAds = useFeature('noAds');
  const suppressed = useAdsSuppressed();
  const show = Capacitor.isNativePlatform()
    && AD_PATHS.includes(pathname) && !premiumNoAds && !suppressed;
  useHideBannerOnLeave();
  // useEffect（描画後・後回しにされうる）ではなく useLayoutEffect。
  // 消すのが1フレームでも遅れると、次の画面の上にバナーが乗って見える。
  useLayoutEffect(() => {
    // nudge 0 = ステータスバー直下にフル表示（ステータスバーへ食い込ませない）
    if (show) showBanner(0); else hideBanner();
  }, [show]);
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
          <NativeShareHandler />
          <ExternalLinkHandler />
          <AdMobController />
          <AdBannerController />
          <BackButtonHandler />
          <Suspense fallback={<PageLoader />}>
            <Routes>
              {/* ウィジェット・共有ターゲット（PhoneFrameなし） */}
              <Route path="/widget/countdown/:workId" element={<WidgetCountdown />} />
              <Route path="/widget/today/:workId"     element={<WidgetToday />} />
              <Route path="/widget/month/:workId"     element={<WidgetMonth />} />
              <Route path="/share"                    element={<ShareTarget />} />

              {/* web版デモ。スマホの枠を通さず、そのまま画面幅を使う */}
              <Route path="/web"                      element={<WebDemo />} />

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
                    <Route path="/customize/theme" element={<ThemeCreate />} />
                    <Route path="/price-drops" element={<PriceDrops />} />
                    <Route path="/follows" element={<Follows />} />
                    <Route path="/notifications" element={<NotificationSettings />} />
                    <Route path="/notices" element={<Notices />} />
                    <Route path="/premium" element={<Premium />} />
                    <Route path="/premium/welcome" element={<PremiumWelcome />} />
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

import { Capacitor } from '@capacitor/core';
import type { PluginListenerHandle } from '@capacitor/core';
import { AdMob, BannerAdSize, BannerAdPosition, BannerAdPluginEvents, MaxAdContentRating } from '@capacitor-community/admob';
import { waitForTrackingDecision } from './att';

// バナーの広告ユニットはプラットフォームごとに別物。AdMobでは iOS と Android が
// **別々のアプリとして登録**されるので、Androidのユニットを iOS で使っても広告は返らない。
// アプリID側は iOS が Info.plist の GADApplicationIdentifier、Android が AndroidManifest。
const BANNER_AD_ID_ANDROID = 'ca-app-pub-3561970163550872/4318089302';
const BANNER_AD_ID_IOS = 'ca-app-pub-3561970163550872/7738868684';
const BANNER_AD_ID = Capacitor.getPlatform() === 'ios' ? BANNER_AD_ID_IOS : BANNER_AD_ID_ANDROID;

let ready: Promise<void> | null = null;

// ⚠️ 失敗した結果をキャッシュしないこと。
// initialize が失敗したまま showBanner に進むと、Androidのネイティブ側は
// mViewGroup（DecorView）が未設定のまま addView を呼び、**アプリごと落ちる**
// （java.lang.NullPointerException at BannerExecutor.createNewAdView）。
// しかも失敗した Promise を持ち続けると以降ずっと同じ経路を通るので、
// 「アプリを開くたびに繰り返し停止する」状態になる（2026-08-21 実機のcrashログで確認）。
export function initAdMob(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return Promise.resolve();
  // iOS: トラッキング許可(ATT)の回答が出てから広告SDKを起動する。
  // **要求はネイティブ(AppDelegate.swift)が起動直後に出す**。ここから要求してはいけない
  // （プラグインの呼び出しはバックグラウンドスレッドで走り、ダイアログが出ないことがある）。
  // 断られてもパーソナライズされないだけで広告自体は出るので、結果は見ない。→ [[att.ts]]
  if (!ready) {
    ready = (async () => {
      await waitForTrackingDecision();
      // 広告の中身をアプリの年齢制限に合わせる。**未指定のままにしない**こと。
      // App Store の年齢制限は 13+（他人の投稿が出る＝UGCがあるアプリの実質的な下限）。
      // 指定が無いと、それより過激な広告が配信される余地が残る。
      // tagForChildDirectedTreatment=false は「子ども向けアプリではない」という宣言(COPPA)。
      // ⚠️ AdMobの管理画面側にも同じ設定（広告コンテンツのレーティング／子ども向けの有無）が
      //    あるので、片方だけ直しても揃わない。両方合わせること。
      await AdMob.initialize({
        maxAdContentRating: MaxAdContentRating.Teen,
        tagForChildDirectedTreatment: false,
      });
    })().catch((e) => { ready = null; throw e; });   // 次の機会にやり直せるようにする
  }
  return ready;
}

// バナーの出し入れは**必ずここを通す**。やることは2つ。
//
// (1) 直列化して「最後の意思が勝つ」ようにする
//     バナーはWebViewの外側のネイティブビューなので、消し損ねると次の画面のボタンの上に
//     居座ってタップを食う（＝「ボタンが反応しない」の典型）。呼び出し元は
//     AdBannerController・Calendar のタイマー・Discover の rAF と複数あり、
//     さらに show は ATT の回答待ち→initialize を挟むので**後から出した hide を show が追い越す**。
//
// (2) show をまとめる（**これをやらないとバナーが二度と出なくなる**）
//     プラグインの iOS 実装 (BannerExecutor.swift) に地雷がある:
//       func bannerView(_ b: BannerView, didFailToReceiveAdWithError e: Error) {
//           self.removeBannerViewToView()      // → 中で self.bannerView.delegate = nil
//       }
//     `self.bannerView` は**最後に作ったバナー**を指すので、短時間に showBanner を2回呼ぶと、
//     1回目の広告取得が失敗した瞬間に**2回目のバナーの delegate が切られる**。
//     delegate が無いと広告が返っても bannerViewDidReceiveAd が呼ばれず、addSubview されない
//     ＝「一瞬スペースが出て消え、その画面では二度と出ない」。
//     実際、探すへ戻るときだけ AdBannerController と Discover の両方が show を呼んで2回になり、
//     ホーム経由（AdBannerController は show=true のままで発火しない）だと1回で済むため復活していた。
//
// ⚠️ 代わりに「直前と同じ状態なら呼ばない」重複スキップを入れてはいけない。
//    AdMob.showBanner は**広告リクエストを投げた時点で resolve する**（表示は広告が返ってから）。
//    「表示済み」と覚えると、広告が返らなかった回のあと同じ margin での再要求が全部飛ぶ。
const SHOW_COALESCE_MS = 250;

let queue: Promise<void> = Promise.resolve();
let wantVisible = false;
let wantMargin = 0;
let coalesce: ReturnType<typeof setTimeout> | null = null;

// プラグインの呼び出しが**返ってこないこと**への保険。
// @capacitor-community/admob 8.0.0 の BannerExecutor.showBanner は、既にバナーがあるとき
//   if (mAdView != null) { updateExistingAdView(adOptions); return; }
// と **call.resolve() を呼ばずに return する**。await したまま解決しないので、下の待ち行列が
// そこで永久に詰まり、**以後の hideBanner が一度も実行されない**。
// 結果、広告を出さない画面（プレミアムの案内・商品詳細）にバナーが residue して
// ×ボタンや戻るを覆う。ネイティブ側も直したが、**JSだけで復旧できるようにここでも切る**
// （Androidはリモートのwebviewなので、こちらはAPKを出さずに直せる）。
const CALL_TIMEOUT_MS = 3000;
function withTimeout<T>(p: Promise<T>): Promise<T | void> {
  return Promise.race([p, new Promise<void>((r) => setTimeout(r, CALL_TIMEOUT_MS))]);
}

function apply(): void {
  queue = queue.then(async () => {
    // 初期化できていないのに show を投げるとネイティブが落ちる（上の注意）。
    // 失敗したときは今回の表示を諦める。次の画面遷移でまた要求が来る。
    try { await initAdMob(); } catch { return; }
    // 実行時点の最新の意思を読む（途中で hide が来ていたら show はもう実行しない）
    const visible = wantVisible;
    const margin = wantMargin;
    try {
      if (visible) {
        await withTimeout(AdMob.showBanner({
          adId: BANNER_AD_ID,
          adSize: BannerAdSize.ADAPTIVE_BANNER,
          position: BannerAdPosition.TOP_CENTER,
          margin,
          isTesting: false,
        }));
      } else {
        await withTimeout(AdMob.hideBanner());
      }
    } catch { /* 出せなくても致命ではない。次の遷移でまた要求する */ }
  });
}

// ── 広告が取れなかったときの取り直し ──────────────────────────────
//
// プラグインは広告が返らなかったとき onAdFailedToLoad で**バナーを破棄する**
// （mViewGroup.removeView → mAdView.destroy() → mAdView = null。プラグイン本来の動き）。
// AdMob SDK の自動更新もバナーごと消えるので、黙っていると二度と出ない。
// showBanner は「広告のある画面にルートが変わった瞬間」しか呼んでいなかったため、
// ホーム／探すに留まっている限り復活しなかった
// （Android実機で発見・2026-09-14 → [[admob-banner-disappears-android]]）。
//
// ⚠️ **60秒より短くしない。** AdMob は自動更新の間隔より速い要求を嫌う
//    （無効なトラフィック扱いになる恐れがある）。
// ⚠️ **画面が見えていないあいだは要求しない。** 見えない広告を取りに行くことになる。
//    裏に回っているあいだは取り直しを見送り、前面に戻ったときに拾い直す。
const RETRY_MS = [60_000, 120_000, 240_000, 300_000];
let retryIdx = 0;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let failedSinceShow = false;   // 直近の要求が失敗したまま＝出すつもりなのに出ていない
let listenersBound = false;

function clearRetry(): void {
  if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
  retryIdx = 0;
}

function scheduleRetry(): void {
  if (!wantVisible || retryTimer) return;
  const wait = RETRY_MS[Math.min(retryIdx, RETRY_MS.length - 1)];
  retryIdx += 1;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    if (!wantVisible || !failedSinceShow) return;
    // 裏に回っているならここでは出さない。前面に戻ったときの購読が拾う
    if (document.visibilityState !== 'visible') return;
    request(wantMargin, false);
  }, wait);
}

/** バナーの成否を一度だけ購読する。取り直しの起点になる。 */
function bindBannerListeners(): void {
  if (listenersBound || !Capacitor.isNativePlatform()) return;
  listenersBound = true;
  // 失敗 → 後退させながら取り直す
  void onBannerFailed(() => { failedSinceShow = true; scheduleRetry(); });
  // 出せた（高さが返った）→ 後退をやり直しに戻す。h=0 は失敗と hide のときにも来るので見ない
  void onBannerSize((h) => { if (h > 0) { failedSinceShow = false; clearRetry(); } });
  // 前面に戻ったとき、出すつもりなのに出ていないなら待たずに取り直す
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (!wantVisible || !failedSinceShow) return;
    clearRetry();
    request(wantMargin, false);
  });
}

function request(margin: number, fromUi: boolean): void {
  bindBannerListeners();
  wantVisible = true;
  wantMargin = margin;
  // 画面の切り替えで来た要求は「新しい機会」なので後退をやり直す。
  // 取り直し自身の呼び出し（fromUi=false）でここを通すと、後退が効かず60秒ごとに叩き続ける
  if (fromUi) { clearRetry(); failedSinceShow = false; }
  if (coalesce) clearTimeout(coalesce);
  coalesce = setTimeout(() => { coalesce = null; apply(); }, SHOW_COALESCE_MS);
}

/** バナーを出す。近接した複数回の呼び出しは1回にまとめる（上の (2)）。 */
export function showBanner(margin = 0): void {
  if (!Capacitor.isNativePlatform()) return;
  request(margin, true);
}

/**
 * バナーを隠す。**待たせない**（居座るとボタンのタップを食うため）。
 *
 * 消すほうだけは待ち行列を通さず、その場でネイティブへ投げる。
 * 待ち行列は Promise なので、実行は**最短でも次のマイクロタスク**、実際には
 * 直前の show の解決（最大 CALL_TIMEOUT_MS）や、次の画面のReact描画が終わるまで回ってこない。
 * その間バナーはWebViewの外側に残り続け、カレンダー／マイページの上に数秒居座って見える。
 * ネイティブの hideBanner は UIスレッドで setVisibility(GONE) するだけ、
 * まだ一度も出していなければ reject されるだけなので、先に投げても害はない。
 * （直列化そのものは残す。あとから来る show が hide を追い越さないための仕掛けなので、
 *   apply() でも「消す意思」を待ち行列に積んでおく。）
 */
export function hideBanner(): void {
  if (!Capacitor.isNativePlatform()) return;
  wantVisible = false;
  failedSinceShow = false;
  clearRetry();   // 消すと決めたあとに取り直しが走って出戻るのを防ぐ
  if (coalesce) { clearTimeout(coalesce); coalesce = null; }
  try { void AdMob.hideBanner().catch(() => { /* 未表示なら reject。無視してよい */ }); }
  catch { /* ネイティブが居ない環境。次の apply() に任せる */ }
  apply();
}

/** アダプティブバナーの実測高さ(px)を購読する。Web版では何もしない。 */
export async function onBannerSize(
  cb: (height: number) => void,
): Promise<PluginListenerHandle | null> {
  if (!Capacitor.isNativePlatform()) return null;
  return AdMob.addListener(
    BannerAdPluginEvents.SizeChanged,
    (info: { width: number; height: number }) => cb(info.height),
  );
}

/** バナーの読み込み失敗を購読する。Web版では何もしない。
 *  在庫が無い（no fill）ときにも来る。**新しく作った広告ユニットはしばらく配信されない**ので、
 *  これを拾わないと「広告は出ないのに場所だけ空いている」状態が続く。 */
export async function onBannerFailed(
  cb: () => void,
): Promise<PluginListenerHandle | null> {
  if (!Capacitor.isNativePlatform()) return null;
  return AdMob.addListener(BannerAdPluginEvents.FailedToLoad, () => cb());
}

/**
 * ネイティブが実測した「バナー下端の位置（WebView上端からのCSS px）」を購読する。
 * この値をそのままヘッダーの paddingTop に使えば、env(safe-area-inset-top) が
 * 機種によって当てにならなくても（例: Android 15 の一部WebViewで0を返す）確実に
 * バナーとコンテンツが被らない。Web版では何もしない。
 */
export async function onBannerReserveTop(
  cb: (reserveTopPx: number) => void,
): Promise<PluginListenerHandle | null> {
  if (!Capacitor.isNativePlatform()) return null;
  // カスタムイベント名（プラグインの型定義には無いが、実行時は文字列で購読可能）。
  // addListener はイベント名ごとにオーバーロードされているため any で回避する。
  return (AdMob.addListener as unknown as (
    eventName: string,
    cb: (info: { reserveTop: number }) => void,
  ) => Promise<PluginListenerHandle>)(
    'bannerReserveTop',
    (info) => cb(info.reserveTop),
  );
}

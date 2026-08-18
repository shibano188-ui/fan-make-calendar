import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';

// 外部リンクを開く唯一の入口。
//
// なぜ window.open / target="_blank" を直接使わないか（2026-08-18 の審査却下 2.1(a) の原因）:
// Capacitor iOS は外部URLへの遷移を WebViewDelegationHandler で横取りし、
//   if webView.window?.windowScene?.activationState == .foregroundActive {
//       UIApplication.shared.open(navURL, ...)
//   }
//   decisionHandler(.cancel)
// としている。シーンが .foregroundActive でないときは **open が呼ばれないまま cancel だけされる**ため、
// ボタンが完全に無反応になる。審査は iPhone専用アプリ(TARGETED_DEVICE_FAMILY=1)を
// iPad の互換モードウィンドウで動かすので、この判定に落ちて「公式サイトを開く が反応しない」と報告された。
//
// そこで Capacitor の暗黙処理に頼らず、Browser プラグイン（iOS: SFSafariViewController /
// Android: Custom Tabs）でネイティブに開く。シーンの状態に依存しないので互換モードでも確実に開く。
//
// Android の配信アプリはリモートURL(fanhive.jp)を読むため、プラグインを含まない旧ビルドが
// 新しいJSを読む期間がある。isPluginAvailable で判定し、無ければ従来の window.open に落とす
// （Android の window.open は元々動いている）。Web(PWA)も同じくブラウザ任せ。

function isHttpUrl(url: string): boolean {
  try {
    const p = new URL(url).protocol;
    return p === 'http:' || p === 'https:';
  } catch {
    return false;
  }
}

/** 外部サイトを開く。ネイティブでは SFSafariViewController / Custom Tabs、それ以外は新規タブ。 */
export async function openExternal(url: string): Promise<void> {
  if (!url || !isHttpUrl(url)) return;
  if (Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('Browser')) {
    try {
      await Browser.open({ url });
      return;
    } catch {
      /* プラグインが失敗したらブラウザ任せにフォールバック */
    }
  }
  window.open(url, '_blank', 'noopener');
}

/**
 * アプリ内の <a target="_blank"> を全部まとめて openExternal に流す。
 * 個々のリンクに onClick を足して回るより漏れがない（新しいリンクを足しても自動で対象になる）。
 *
 * ⚠️ capture フェーズで拾うこと。React のハンドラ内で stopPropagation() しているリンク
 * （EventTile / SourceBadge 等、タイル本体のタップと分けるため）があり、
 * document のバブリングでは届かないため。
 *
 * ⚠️ iOS だけに限定する。Android は Capacitor の外部リンク処理が元々効いているうえ、
 * リモートURLで読むため index.html のバリューコマース LinkSwitch が生きており、
 * ここで preventDefault すると <a> クリックのアフィリンク変換を潰してしまう。
 * （iOS は dist 同梱＝origin が capacitor://localhost なので、
 *   プロトコル相対の //aml.valuecommerce.com/vcdal.js がそもそも読めず LinkSwitch は動いていない）
 */
export function installExternalLinkHandler(): () => void {
  const onClick = (e: MouseEvent) => {
    if (Capacitor.getPlatform() !== 'ios') return;
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey) return;
    const el = e.target instanceof Element ? e.target.closest('a[target="_blank"]') : null;
    const href = el?.getAttribute('href');
    if (!href || !isHttpUrl(href)) return;
    e.preventDefault();
    void openExternal(href);
  };
  document.addEventListener('click', onClick, true);
  return () => document.removeEventListener('click', onClick, true);
}

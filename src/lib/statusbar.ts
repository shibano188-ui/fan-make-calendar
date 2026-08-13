import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';

/** テーマに合わせてネイティブのステータスバーを同期する（Phase E-4） */
export async function syncStatusBar(isDark: boolean, bgColor: string) {
  if (!Capacitor.isNativePlatform()) return;
  const isIOS = Capacitor.getPlatform() === 'ios';
  try {
    // Android: WebView をステータスバーの下に配置する（Android 15 の edge-to-edge 強制で
    //   コンテンツがステータスバーに潜り込み、検索窓・戻る/閉じるボタンが被るのを防ぐ）。
    //   バーの色は setBackgroundColor でアプリの背景に合わせる。
    // iOS: 逆に潜り込ませる（プラットフォームの既定も true）。iOS は
    //   setBackgroundColor が使えないため overlay:false にすると
    //   **ステータスバー領域が黒いまま残る**。アプリ内の上部バーは既に
    //   var(--sat)（= env(safe-area-inset-top)）ぶん余白を取っているので、
    //   潜り込ませても中身は隠れない。
    await StatusBar.setOverlaysWebView({ overlay: isIOS });
    // Style.Dark = 暗い背景に白文字 / Style.Light = 明るい背景に黒文字
    await StatusBar.setStyle({ style: isDark ? Style.Dark : Style.Light });
    if (!isIOS) {
      await StatusBar.setBackgroundColor({ color: bgColor });
    }
  } catch {
    // プラグイン未対応環境では何もしない
  }
}

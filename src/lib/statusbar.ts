import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';

/** テーマに合わせてネイティブのステータスバーを同期する（Phase E-4） */
export async function syncStatusBar(isDark: boolean, bgColor: string) {
  if (!Capacitor.isNativePlatform()) return;
  try {
    // Style.Dark = 暗い背景に白文字 / Style.Light = 明るい背景に黒文字
    await StatusBar.setStyle({ style: isDark ? Style.Dark : Style.Light });
    if (Capacitor.getPlatform() === 'android') {
      await StatusBar.setBackgroundColor({ color: bgColor });
    }
  } catch {
    // プラグイン未対応環境では何もしない
  }
}

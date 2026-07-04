import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

// 触覚フィードバック（Phase F-3）
// 発火は控えめに: いいね・タブ切替・保存成功・リアクション選択のみ
//
// Android 実装の注意（@capacitor/haptics のソース確認済み）:
// - selectionStart() はフラグを立てるだけで振動しない（＝旧 select は全端末で無動作だった）
// - impact Light は 50ms/振幅110 で、端末によっては知覚できない
// そのため select=Light / light=Medium の実振動にマッピングし直している。

const native = () => Capacitor.isNativePlatform();

// PWA(Android Chrome) 用フォールバック。非対応環境では黙って無視される。
const webVibrate = (ms: number) => { try { navigator.vibrate?.(ms); } catch { /* noop */ } };

/** 隠し診断（マイページの build 表記タップで実行）。振動しない端末の原因切り分け用。
 *  プラグインの有無 → 500msの生バイブ → Web Vibration API の順に試して結果を report で通知する。 */
export async function hapticsDebug(report: (msg: string) => void): Promise<void> {
  report(`platform=${Capacitor.getPlatform()} / plugin=${Capacitor.isPluginAvailable('Haptics') ? 'あり' : 'なし'}`);
  setTimeout(async () => {
    try {
      await Haptics.vibrate({ duration: 500 });
      report('Haptics.vibrate(500ms) 呼び出し成功（今ブルッと来たはず）');
    } catch (e) {
      report(`Haptics.vibrate 失敗: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, 2600);
  setTimeout(() => {
    let ok: boolean | undefined;
    try { ok = navigator.vibrate?.(500); } catch { ok = undefined; }
    report(`navigator.vibrate(500ms) → ${String(ok)}`);
  }, 5200);
}

export const haptic = {
  /** いいね・リアクション選択・重要マークON（しっかり感じる強さ） */
  light: () => {
    if (native()) Haptics.impact({ style: ImpactStyle.Medium }).catch(() => webVibrate(20));
    else webVibrate(20);
  },
  /** タブ切り替え・チップ選択（弱いカチッ） */
  select: () => {
    if (native()) Haptics.impact({ style: ImpactStyle.Light }).catch(() => webVibrate(10));
    else webVibrate(10);
  },
  /** 保存成功・作品参加 */
  success: () => {
    if (native()) Haptics.notification({ type: NotificationType.Success }).catch(() => webVibrate(30));
    else webVibrate(30);
  },
};

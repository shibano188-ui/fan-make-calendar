import { Capacitor } from '@capacitor/core';
import { AdMob } from '@capacitor-community/admob';

// iOSのトラッキング許可(ATT)。
//
// **要求そのものはネイティブ（AppDelegate.swift）が起動直後に主スレッドから出す**。
// JS（AdMobプラグイン）から要求すると、Capacitor がプラグインの呼び出しを
// バックグラウンドスレッドで実行するため、ダイアログが出ないまま完了することがある。
// 2026-08-17 に Guideline 2.1「ATTの許可要求が見つからない」で却下された経路がこれ。
//
// ここが持つのは「その回答が出るまで待つ」だけ。用途は2つ:
//  - 広告SDKの初期化を回答のあとにする（トラッキングに使えるデータを先に集めない）
//  - 通知の許可を聞くのを回答のあとにする（システムのダイアログを重ねると片方が消える）

const isIOS = (): boolean => Capacitor.getPlatform() === 'ios';

let pending: Promise<void> | null = null;

/** ATTの回答（許可/拒否/制限）が出るまで待つ。iOS以外とWeb版では何もせず即座に返る。 */
export function waitForTrackingDecision(timeoutMs = 20_000): Promise<void> {
  if (!Capacitor.isNativePlatform() || !isIOS()) return Promise.resolve();
  if (!pending) pending = poll(timeoutMs);
  return pending;
}

// ネイティブから完了を知らせる口が無いので、状態を見に行く。
// ダイアログが出ている間は notDetermined のままなので、答えた時点で抜ける。
// 端末の「Appからのトラッキング要求を許可」がOFFなら初回から denied で返り、待ちは発生しない。
async function poll(timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const { status } = await AdMob.trackingAuthorizationStatus();
      if (status !== 'notDetermined') return;
    } catch {
      return;   // 状態が取れない環境では待たない（広告も通知も止めない）
    }
    if (Date.now() >= deadline) return;
    await new Promise((r) => { setTimeout(r, 400); });
  }
}

import { Capacitor, registerPlugin } from '@capacitor/core';

// iOSのトラッキング許可(ATT)。
//
// **要求そのものはネイティブ（AppDelegate.swift の TrackingPlugin）が主スレッドから出す**。
// JS（AdMobプラグイン）から要求すると、Capacitor がプラグインの呼び出しを
// バックグラウンドスレッドで実行するため、ダイアログが出ないまま完了することがある。
// 2026-08-17 に Guideline 2.1「ATTの許可要求が見つからない」で却下された経路がこれ。
//
// いつ出すか: **オンボーディングを終えたあと**（2026-09-29 柴野）。前は起動直後にネイティブが出していて、
// オンボーディングの途中に割り込んでいた。案内を見終えた人は起動のたびに requestTracking() を呼ぶ
// （答え済みなら何も出ずに返る）。
//
// ここが持つのは3つ:
//  - requestTracking(): ダイアログを出して回答を待つ
//  - waitForTrackingDecision(): 広告SDKの初期化を回答のあとにする（トラッキングに使えるデータを先に集めない）
//  - waitForTrackingDialog(): 通知の許可を聞く前に、ATTのダイアログが出ていれば閉じるのを待つ
//    （システムのダイアログを重ねると片方が消える）

const isIOS = (): boolean => Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios';

const Tracking = registerPlugin<{ request(): Promise<{ status: string }> }>('Tracking');

let asking: Promise<void> | null = null;
let decided: () => void = () => {};
const decision = new Promise<void>((r) => { decided = r; });

/** ATTのダイアログを出して、回答（許可/拒否/制限）が出るまで待つ。答え済みなら何も出さずに返る。
 *  iOS以外とWeb版では何もしない。 */
export function requestTracking(): Promise<void> {
  if (!isIOS()) return Promise.resolve();
  if (!asking) {
    asking = Tracking.request()
      .then(() => undefined)
      .catch(() => undefined)   // 口が無い・失敗したときも広告と通知は止めない
      .finally(() => decided());
  }
  return asking;
}

/** ATTの回答が出るまで待つ（広告SDKの初期化用）。requestTracking() がまだ呼ばれていなければ、呼ばれて答えが出るまで待つ。
 *  iOS以外とWeb版では即座に返る。 */
export function waitForTrackingDecision(): Promise<void> {
  if (!isIOS()) return Promise.resolve();
  return decision;
}

/** ATTのダイアログが出ている最中なら、閉じるまで待つ（通知の許可を重ねないため）。出ていなければ即座に返る。 */
export function waitForTrackingDialog(): Promise<void> {
  return asking ?? Promise.resolve();
}

import { Capacitor } from '@capacitor/core';
import { Camera } from '@capacitor/camera';

// 写真を選ばせる唯一の入口。
//
// なぜ <input type="file" accept="image/*"> を使わないか（2026-08-19 の審査却下 2.1 の原因）:
// iOS の WKWebView はファイル入力を押すと「Photo Library / Take Photo / Choose File」の3択を出す。
// Take Photo だけを HTML 側から隠す手段は無く、押された時点でカメラが起動する。
// Info.plist に NSCameraUsageDescription が無いと OS がその場でアプリを kill する
// （TCC のプライバシー違反。JS にはエラーも来ない）。
// FanHive はカメラを使わないので、用途説明を足すのではなくカメラ経路そのものを無くす。
// ネイティブでは写真ライブラリだけを開く。
//
// なぜ Camera プラグインの pickImages なのか（他の2つは使えない）:
//   - getPhoto は source を photos にしても、実装が Info.plist の3キー
//     （NSCameraUsageDescription を含む）を全部要求して無ければ reject する。
//   - chooseFromGallery（新API）は PHPicker ではなく ion-ios-camera 独自の SwiftUI 製グリッドを
//     出す。タイトルが英語の "Photo Library" 固定で、日本語アプリの見た目として合わない。
//   - pickImages は iOS 標準の PHPickerViewController（filter = .images）をそのまま出す。
//     非推奨だが v8 では現役。将来のメジャーで消えたら chooseFromGallery に寄せる。
//
// Android の配信アプリはリモートURL(fanhive.jp)を読むため、プラグインを含まない旧ビルドが
// 新しいJSを読む期間がある。isPluginAvailable で判定し、無ければ従来のファイル入力に落とす
// （Android のファイル入力は落ちない。カメラの許可はシステム側のピッカーが持っている）。

/** ネイティブの写真ピッカーが使えるか。使えるならファイル入力は DOM に出さない。 */
export function hasNativePhotoPicker(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('Camera');
}

/** 写真の選択結果。許可しなかったときだけ画面側で案内を出したいので、キャンセルと区別する。 */
export type PickPhotoResult =
  | { status: 'picked'; dataUrl: string }
  | { status: 'cancelled' }
  | { status: 'denied' };

/** 写真を1枚選ばせて data URL で返す。 */
export async function pickPhoto(): Promise<PickPhotoResult> {
  try {
    // 幅と画質を絞る。原寸のまま data URL にすると localStorage の容量を超えて
    // 設定の保存が失敗する（背景はカレンダーの背面に敷くだけなので1600pxで足りる）
    const { photos } = await Camera.pickImages({ limit: 1, width: 1600, quality: 80 });
    const webPath = photos[0]?.webPath;
    if (!webPath) return { status: 'cancelled' };
    const blob = await (await fetch(webPath)).blob();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
    return { status: 'picked', dataUrl };
  } catch (e) {
    // ピッカーの前に写真ライブラリの許可を求めるので、拒否されるとここに来る。
    // 何も起きないと「ボタンが壊れている」に見えるため、キャンセルと区別して呼び出し側に返す。
    const message = e instanceof Error ? e.message : String(e);
    return { status: /denied/i.test(message) ? 'denied' : 'cancelled' };
  }
}

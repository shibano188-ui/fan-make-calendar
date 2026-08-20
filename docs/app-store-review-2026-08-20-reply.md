# 5回目の却下（2.1 「Take Photo」でクラッシュ）への対応（2026-08-20）

審査端末は **iPad Air 11インチ(M3)（`iPad15,3`） / iPadOS 26.6.1（23G83）**、対象は 1.0 **ビルド(5)**。
クラッシュログ3本はすべて同じ内容で、審査員は 07:28〜07:29 の約3分間に3回試している。

---

## 1. 原因

クラッシュログの終了理由がそのまま答えになっている。

```
"exception":   {"type": "EXC_CRASH", "signal": "SIGKILL"}
"termination": {"namespace": "TCC", "details": [
  "This app has crashed because it attempted to access privacy-sensitive data without a usage
   description. The app's Info.plist must contain an NSCameraUsageDescription key with a string
   value explaining to the user how the app uses this data."]}
```

落ちたスレッドも `TCC __TCC_CRASHING_DUE_TO_PRIVACY_VIOLATION__` で、アプリのコードは1フレームも
出てこない。**JSにはエラーが来ないまま、OSがプロセスごと殺している。**

押されたのは投稿画面の「写真から読み取る」。これは `<input type="file" accept="image/*">` で、
iOSのWKWebViewはこれを押すと必ず

    Photo Library / Take Photo / Choose File

の3択を出す。**Take Photo だけをHTML側から消す方法は無い**（`accept` を拡張子指定にしても
画像として扱われる以上カメラは出る）。カメラを使うつもりが無かったので Info.plist に
`NSCameraUsageDescription` を入れておらず、Take Photo を押した瞬間に落ちた。

同じ経路は **カスタマイズ＞カレンダー背景画像** にもあった（`accept="image/*"` の入力）。
審査員はこれから写真まわりを探しに来るので、両方まとめて潰す必要がある。

## 2. 直したこと（ビルド6）

用途説明を足すのではなく、**カメラ経路そのものを無くした**。

### 2-1. 「写真から読み取る」を廃止

`src/pages/PostNew.tsx` からボタン・ファイル入力・`onPickPhoto` を削除。AI入力は
「Xの共有」と「リンク/本文の貼り付け」の2経路になる。
ストアの説明文・スクリーンショット・アプリ内の文言にこの機能への言及は無いので、
メタデータ側の修正は不要（`store-description.md` を確認済み）。

サーバ側（`api/parse-event.ts` の `imageBase64`）はそのまま残してある。入口を消しただけで、
動いているものを壊していない。

### 2-2. 背景画像はネイティブの写真ピッカーで選ぶ

`src/lib/pickPhoto.ts` を追加。`@capacitor/camera` の **`pickImages`** で
iOS標準の `PHPickerViewController`（`filter = .images`、カメラの選択肢が無い）を開く。
`src/pages/Customize.tsx` の「画像をアップロード」「画像を変更」はここを通す。

同じプラグインの他の2つは使えない（ソースを読んで確認した）:

- `getPhoto` は `source: photos` を指定しても、実装が `CameraPropertyListKeys.allCases`
  （`NSCameraUsageDescription` を含む3キー）を全部要求して、無ければ reject する。
  カメラを使わないのに用途説明を入れる羽目になる。
- `chooseFromGallery`（新API）は PHPicker ではなく ion-ios-camera 独自の SwiftUI 製グリッドを
  出す。タイトルが英語の "Photo Library" 固定で、日本語アプリの見た目に合わない。

`pickImages` は非推奨だが v8 では現役。将来のメジャーで消えたら `chooseFromGallery` に寄せる。

iOSでは `hasNativePhotoPicker()` が真になるので、**`<input type="file" accept="image/*">` は
DOMに描画すらしない**。カメラに到達できる導線がアプリ内に一つも無い状態にしてある。

Androidの配信アプリはリモートURLを読むため、プラグインの無い旧APKが新しいJSを読む期間がある。
`Capacitor.isPluginAvailable('Camera')` で判定し、無ければ従来のファイル入力に落とす
（外部リンクのときと同じやり方。Androidはファイル入力でも落ちない）。

### 2-3. 写真の許可を断られたときの案内

`pickImages` はピッカーの前に `PHPhotoLibrary.requestAuthorization` を通す。
「許可しない」を選ぶとプラグインが reject するので、**黙って戻ると「ボタンが効かない」に見える**
（前回の却下がまさにそれ）。キャンセルと拒否を区別して、拒否のときだけ
「設定アプリ ＞ FanHive ＞ 写真 で許可すると、背景画像を選べます。」と出す。

### 2-4. 画像サイズの上限と、設定保存の保護

原寸のまま data URL にすると localStorage の容量を超えて `saveSettings` が例外を投げ、
`setSettings` の中なので**アプリごと白画面**になる（実機で再現した）。

- `pickImages({ limit: 1, width: 1600, quality: 80 })` で幅と画質を絞る
  （背景はカレンダーの背面に敷くだけなので1600pxで足りる）
- `ThemeContext.saveSettings` を try/catch で囲う。保存できなくても表示は続ける

これは今回のピッカー変更だけでなく、従来のファイル入力の経路にもあった穴。

### 2-5. Info.plist

`NSCameraUsageDescription` は**入れない**。入れる＝カメラを開く経路が残っているということなので、
「カメラは一切使いません」と審査に言い切れなくなる。
`NSPhotoLibraryUsageDescription` だけを置いた（許可ダイアログにこの文言がそのまま出る）。

### 2-6. ビルド番号

`CURRENT_PROJECT_VERSION` を 5 → **6**。

---

## 3. シミュレータで確認済み（iPhone 17 / iOS 26.5、新規インストール）

1. 投稿タブ →「AIで入力」に写真のボタンが**無い**
2. カスタマイズ → カレンダー背景画像 →「画像をアップロード」→ 写真の許可ダイアログ
   （文言は Info.plist のもの）→ **iOS標準のピッカーが写真だけを表示。Take Photo は無い**
3. 写真を選ぶ → 切り抜き画面 →「この範囲で設定」→ 背景に反映。**白画面にならない**
4. アプリを再起動しても背景が残る（保存が成功している）
5. 「許可しない」を選んだ場合 → 「写真へのアクセスが必要です」のダイアログが出る（無反応にならない）
6. ビルド後の `App.app/Info.plist` に `NSCameraUsageDescription` が無いこと、
   `CFBundleVersion = 6` であることを確認

**実機のiPadでも同じ手順を1回なぞること**（返信文に端末名を書くため）。

---

## 4. App Review への返信（英語・そのまま貼る）

```
Thank you for the review, and for the crash logs - they identified the cause exactly.

GUIDELINE 2.1 - CRASH AFTER TAPPING "TAKE PHOTO"

Cause. On the "投稿" (Post) screen there was a "写真から読み取る" ("Read it from a photo") button
that opened a standard HTML file input, <input type="file" accept="image/*">. On iOS, WKWebView
always offers three choices for such an input - Photo Library, Take Photo, Choose File - and the
web layer has no way to remove "Take Photo". The app was never meant to use the camera, so its
Info.plist did not contain NSCameraUsageDescription, and the moment "Take Photo" opened the camera
iOS terminated the process:

    Termination Reason: TCC
    "This app has crashed because it attempted to access privacy-sensitive data without a usage
     description. The app's Info.plist must contain an NSCameraUsageDescription key ..."

No error reaches the app's own code, which is why this was not caught earlier.

Fix in build 6. Rather than adding the usage description, we removed the camera from the app
altogether.

1. The "写真から読み取る" feature is gone. AI input on the Post screen now works only from a post
   shared into FanHive from X, or from a link or text pasted into the field.
2. The only other place that used a photo - choosing a background image for the calendar, in
   カスタマイズ (Customize) - no longer uses an HTML file input on iOS. It opens the system photo
   picker (PHPickerViewController, images only) directly through the Capacitor Camera plugin. The
   file input is not rendered at all on iOS, so no control in the app can reach the camera.
3. Info.plist declares no NSCameraUsageDescription, because FanHive does not access the camera. It
   declares NSPhotoLibraryUsageDescription for the background image only.

How to verify in build 6:

1. Open the "投稿" (Post) tab. Under "AIで入力" there is no longer any button that opens a photo
   picker; the camera cannot be reached from this screen.
2. Open the "マイページ" (Profile) tab and tap the palette icon in the header to open カスタマイズ
   (Customize). Under "カレンダー背景画像" tap "画像をアップロード". After the photo library
   permission prompt, the system photo picker opens showing photos only - there is no "Take Photo"
   option. Picking a photo and tapping "この範囲で設定" applies it, and the camera is never
   offered at any point.

Build 6 was verified on <端末とOSをここに書く> as a fresh install after deleting the previously
installed version. The app does not crash, and the camera is never opened.

One more note. Our reply about the previous rejection (2.1(a), "公式サイトを開く" buttons were
unresponsive) was saved as a draft on our side and was never sent. We are sorry for the silence.
For the record: that issue was caused by the framework the app is built on (Capacitor) cancelling
external-link navigations without opening anything while the scene is not .foregroundActive, which
is what happens to an iPhone app running on iPad in compatibility mode. Since build 5, every
external link is opened natively with SFSafariViewController through the Capacitor Browser plugin,
and that fix is unchanged in build 6.

Thank you for your time.
```

### 短縮版（返信欄が入りきらないとき）

```
Thank you for the review, and for the crash logs - they identified the cause exactly.

GUIDELINE 2.1 - CRASH AFTER TAPPING "TAKE PHOTO"

Cause. The "写真から読み取る" ("Read it from a photo") button on the "投稿" (Post) screen opened a
standard HTML file input, <input type="file" accept="image/*">. On iOS, WKWebView always offers
Photo Library / Take Photo / Choose File for such an input, and the web layer cannot remove "Take
Photo". The app was never meant to use the camera, so Info.plist contained no
NSCameraUsageDescription, and iOS terminated the process the moment the camera opened (Termination
Reason: TCC). No error reaches the app's own code.

Fix in build 6. We removed the camera from the app rather than adding the usage description. The
"写真から読み取る" feature is gone - AI input now works only from a post shared from X or from
pasted text. The one remaining photo feature, the calendar background image in カスタマイズ
(Customize), no longer uses an HTML file input on iOS: it opens the system photo picker
(PHPickerViewController, images only) through the Capacitor Camera plugin. Info.plist declares no
NSCameraUsageDescription.

How to verify:

1. "投稿" (Post) tab: under "AIで入力" there is no longer any button that opens a photo picker.
2. "マイページ" (Profile) tab > palette icon in the header > カスタマイズ (Customize) >
   "カレンダー背景画像" > "画像をアップロード": the system photo picker opens with photos only,
   with no "Take Photo" option.

Build 6 was verified on <端末とOSをここに書く> as a fresh install after deleting the previous
version.

Our reply about the previous rejection (2.1(a), unresponsive "公式サイトを開く" buttons) was saved as
a draft on our side and was never sent - we are sorry. For the record: since build 5, every external
link is opened natively with SFSafariViewController through the Capacitor Browser plugin, instead of
the framework path that cancelled the navigation without opening anything when the app's scene was
not .foregroundActive (which is what happens on iPad in compatibility mode). That fix is unchanged
in build 6.

Thank you for your time.
```

### 返信文で意図的にやっていること

- **クラッシュログの終了理由をそのまま引用している。** 2.1 のクラッシュは「原因を特定できたか」で
  決まる。TCC のメッセージは審査員も同じものを見ているので、話が一往復で済む。
- **「用途説明を足しました」と書いていない。** それだと審査員は「ではカメラを使うのか」と
  App Privacy とプライバシーラベルを見に行く。**使わない**と言い切るほうが短い。
- **確認手順で「Take Photo が出ないこと」を見せている。** 直したことの証明が画面上で完結する。

## 5. App Store Connect での手順

1. Xcode で **ビルド6**（`CURRENT_PROJECT_VERSION = 6`）をアーカイブ → アップロード
2. バージョンページでビルドを **6** に差し替える
3. 「App Reviewに返信」に 4. の英文を貼る（`<端末とOSをここに書く>` を埋める）
4. バージョンページ「審査内容を更新」→ 提出詳細の「App Reviewに再提出」

**「提出をキャンセル」は押さない**（サブスク2つとグループも提出し直しになる）。

### 8/18の返信は送信されていなかった（2026-08-20 確認）

スレッドの8/18のメッセージの下に **「下書きを続ける ｜ 下書きを削除」** が出ている。
これは**未送信の下書き**。審査員は 2.1(a) の説明も、添付した録画
（`FanHive-AppReview-2026-08-18.mp4`）も受け取っていない。

- **この下書きは「下書きを削除」で消す。** 本文が「The bug is fixed in build 5, which is attached
  to this submission.」で、そのビルド5が却下された後に送ると噛み合わない。
  文面は `docs/app-store-review-2026-08-18-reply.md` に残っているので消して困らない
- 代わりに、4. の返信文の末尾に「前回の返信が下書きのまま送れていなかった」段落を入れてある。
  外部リンクの修正はビルド5から入っていてビルド6でも変わらない、と1段落で伝わる
- 録画の添付は不要。今回の却下で 2.1(a) は再指摘されていない（＝審査側では解消扱い）。
  ビルド5の画面を今出すとかえって話がややこしくなる

### ⚠️ 送信できたことを必ず確認する

App Store Connect の返信欄は、書いただけでは送られず下書きとして残る。
送信後にスレッドを再読み込みして、**自分の返信の下に「下書きを続ける」が出ていないこと**を見る。
出ていたら送信されていない。

### App Privacy（プライバシーラベル）

変更なし。カメラは使わず、背景画像は端末内で完結していて送信していないので、
収集するデータの申告は増えない。

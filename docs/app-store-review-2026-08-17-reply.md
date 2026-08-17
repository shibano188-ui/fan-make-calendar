# 3回目の却下（5.1.1(v) 課金前の登録 / 2.1 ATT）への対応（2026-08-17）

審査端末は **iPad Air 11インチ(M3) / iPadOS 26.6**、対象は 1.0 **ビルド(2)**。
指摘は2件で、**どちらもビルドの作り直しが要る**（iOSは dist を同梱しているため）。

---

## 1. Guideline 5.1.1(v) — 購入に会員登録を要求している

購入ボタンが「メールアドレスを登録する」になっていて、登録しないと購入に進めなかった。
端末で完結する機能（広告非表示・通知の速さ）の購入に会員登録は要求できない。

### 直したこと（ビルド3）

- `src/pages/Premium.tsx` — 購入ボタンは**常に購入を開始する**。匿名のままでも買える。
  メール登録は購入ボタンの下の小さなリンク（任意）に降格。
- `src/pages/PremiumWelcome.tsx` — 購入後の設定画面に「メールアドレスを登録する（任意）」を追加。
  登録済みならメールアドレスを出すだけにする。
- マイページの「アカウント（データ引き継ぎ）> メールで登録」は従来どおり。いつでも登録できる。

匿名のまま買っても、Supabaseの匿名ユーザーにメールを紐づけると **user_id は変わらない**ので、
あとから登録しても購読はそのまま繋がる。登録しない人は「購入を復元」で戻せる。

## 2. Guideline 2.1 — ATTの許可要求が見つからない

**8/15に送った録画にはATTのダイアログが写っている**（0:03〜0:04 と 0:08〜0:11 の2回）。
1回目が通知の許可ダイアログにすぐ覆われているため、見落とされたと思われる。

実装側にも弱いところが2つあった。ビルド3で作り直した。

- ATTの要求を **JS（AdMobプラグイン）→ ネイティブ（`AppDelegate.swift`）** に移した。
  Capacitor はプラグインの呼び出しを `DispatchQueue(label: "bridge")`＝バックグラウンドスレッドで
  実行する。`ATTrackingManager.requestTrackingAuthorization` は**アプリがactive・主スレッド**で
  呼ばないとダイアログが出ないことがある。
  → `applicationDidBecomeActive` で 0.5秒後に主スレッドから要求。起動ごとに1回だけ。
- **通知の許可とぶつかっていた**のを直した。`src/lib/att.ts` の `waitForTrackingDecision()` で
  ATTの回答を待ってから通知の許可を聞く（`src/lib/push.ts`）。
  広告SDKの初期化（`src/lib/admob.ts`）も回答のあとに回した＝**回答前にトラッキングに使える
  データを取らない**。

---

## 3. App Review への返信（英語・そのまま貼る）

`[ ]` は録画を撮ってから埋める。返信欄の上限は4000字。

```
Thank you for the review. Both items are fixed in build 3, which is attached to this submission.

1. GUIDELINE 5.1.1(v) - REGISTRATION BEFORE PURCHASE

Registration is no longer required in order to purchase.

On the subscription screen ("マイページ" tab > "FanHive プレミアム" banner), the purchase button now
starts the App Store purchase for every user, including a user who has never registered. No
account, email address, or other personal information is requested before or during the purchase.

Registering an email address is optional and is offered only as a way to use the subscription on
another device. It appears as a small link under the purchase button
("メールアドレスを登録する（任意・別の端末でも使えます）"), once more on the screen shown after the
purchase completes, and it is always available from "マイページ" > "アカウント（データ引き継ぎ）" >
"メールで登録".

"購入を復元" (Restore Purchases) is on the subscription screen as well, so a subscription can be
recovered on a new device or after reinstalling without registering at all.

2. GUIDELINE 2.1 - APP TRACKING TRANSPARENCY

The app does request tracking authorization at launch, and the prompt is visible in the recording
we sent on August 15 (physical iPhone SE 3rd generation, iOS 26.6) from 0:03 to 0:04, where it is
covered by the notification permission alert, and again from 0:08 to 0:11. We are sorry that it
was hard to find.

We found two weaknesses in that implementation and rewrote it for build 3.

- The request was issued from the web layer through the AdMob plugin. Capacitor runs plugin calls
  on a background thread, and ATTrackingManager.requestTrackingAuthorization does not reliably
  present its alert unless it is called on the main thread while the app is active. It is now
  called natively in AppDelegate.applicationDidBecomeActive, on the main thread, 0.5 seconds after
  the app becomes active, on every launch while the status is "not determined".
- The notification permission was requested at the same moment, so the two system alerts
  overlapped. The app now waits until the tracking request has been answered before asking for
  notification permission.

No data that could be used to track the user is collected before the answer: the Google Mobile Ads
SDK is initialized only after the tracking status is no longer "not determined", and no ad is
requested before that.

A new screen recording is attached, captured on a physical [ 端末名 ] running [ OS ], after
deleting and reinstalling the app. The App Tracking Transparency prompt appears at [ 0:0X ],
before any ad is loaded, followed by the notification prompt, onboarding, and the subscription
flow described above.

The prompt is only presented while the tracking status of the app is "not determined". If the app
has already been launched on the review device, deleting the app, or turning
Settings > Privacy & Security > Tracking off and on, returns it to that state.

Thank you for your time.
```

## 4. 録画の撮り方

Appleの要求は「**実機**で、**新規インストール（またはトラッキング権限のリセット）から**、
ATTが出て、そのあとの流れが分かること」。長い全機能の録画は8/15に出してあるので、
**今回は短くてよい（2〜3分）**。

### 端末

- **iPhoneを借りられるなら iPhone SE(第3世代)**。8/15と同じ環境で確実。
- 借りられないなら **iPad Air 13インチ(M2)/iPadOS 26.6**。今回の審査がiPadなので、
  「iPadOSで出ている」証拠になるのはむしろ強い。iPhone専用アプリなので互換モード（黒枠つき）になる。
  Xcodeからの直接インストールはデバイスファミリの制約で弾かれることがあるので、
  **ビルド3をApp Store Connectに上げてTestFlightから入れる**のが確実。

### 撮る前

- **アプリを削除してから入れ直す**。一度でも回答した端末では二度と出ない
- 設定 > プライバシーとセキュリティ > トラッキング >「Appからのトラッキング要求を許可」が
  **ONになっていることを確認**（OFFだとダイアログは出ない）
- Sandboxアカウントにサインイン（設定 > デベロッパ > Sandbox Apple Account）

### 撮る順番

1. 収録開始 → ホーム画面のアイコンから起動
2. **ATTのダイアログ → 数秒そのまま映してから「許可」**（すぐ押さない。前回はここが一瞬だった）
3. 通知のダイアログ →「許可」
4. オンボーディング → 作品を選ぶ → ホーム
5. マイページ →「FanHive プレミアム」→ **登録を求められずに購入ボタンが押せること**を見せる
   （価格・期間・利用規約・プライバシーポリシー・購入を復元が同じ画面にあることも数秒映す）
6. 「初月無料で始める」→ Sandboxの購入ダイアログ → 完了 → 購入後の画面
7. 収録停止

**編集で静止区間を詰めない**（前回 freezedetect でダイアログの表示時間が2秒まで削られた）。
容量が大きければ解像度だけ落とす:

```
ffmpeg -i 元.mp4 -vf "scale=-2:1280" -c:v libx264 -crf 28 -preset slow -an 提出用.mp4
```

ATTが何秒に出ているかを確認してから、返信文の `[ 0:0X ]` を埋める:

```
ffmpeg -i 提出用.mp4 -vf "fps=2,scale=150:-1,tile=6x5" -frames:v 1 sheet.png   # 6列×5行=15秒分
```

## 5. App Store Connect での手順

1. Xcode で **ビルド3**（`CURRENT_PROJECT_VERSION = 3`）をアーカイブ → アップロード
2. バージョンページでビルドを 3 に差し替える
3. 「App Reviewに返信」に 3. の英文＋録画を添付
4. App Review情報の**メモ**を更新（下記の2箇所）
5. バージョンページ「審査内容を更新」→ 提出詳細の「App Reviewに再提出」

**「提出をキャンセル」は押さない**（サブスク2つとグループも提出し直しになる）。

### メモ欄の直すところ

- アカウント削除の場所が変わっている（ビルド3から）。
  `My Page ("マイページ") > "カスタマイズ" > "⋮" > "アカウントを削除する"` →
  **`My Page ("マイページ") > the bottom of the settings list > "アカウントを削除する"`**
- 課金の説明にある「購入前にメールアドレスを聞く」の記述を削る。
  `The app asks for an email address only before a subscription purchase, so that ...` →
  **`No registration is required to purchase. An email address can be registered at any time,
  optionally, so that a subscription can be used on another device.`**

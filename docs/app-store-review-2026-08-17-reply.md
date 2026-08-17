# 3回目の却下（5.1.1(v) 課金前の登録 / 2.1 ATT）への対応（2026-08-17）

審査端末は **iPad Air 11インチ(M3) / iPadOS 26.6**、対象は 1.0 **ビルド(2)**。
指摘は2件で、**どちらもビルドの作り直しが要る**（iOSは dist を同梱しているため）。

---

## 1. Guideline 5.1.1(v) — 購入に会員登録を要求している

購入ボタンが「メールアドレスを登録する」になっていて、登録しないと購入に進めなかった。
端末で完結する機能（広告非表示・通知の速さ）の購入に会員登録は要求できない。

### 直したこと（ビルド4）

- `src/pages/Premium.tsx` — 購入ボタンは**常に購入を開始する**。匿名のままでも買える。
  **この画面には登録の入口を一切置かない**（ボタンを1つにして「先に登録するのか」と
  読まれる余地を消す）。
- `src/pages/PremiumWelcome.tsx` — 購入後の設定画面の**一番上**に
  「メールアドレスを登録する（任意）」を置く。登録済みならメールアドレスを出すだけ。
- 加入済みの `/premium` からは「引き継ぎ・通知・カレンダーの設定」で何度でも開ける。
- マイページの「アカウント（データ引き継ぎ）> メールで登録」も従来どおり。いつでも登録できる。

匿名のまま買っても、Supabaseの匿名ユーザーにメールを紐づけると **user_id は変わらない**ので、
あとから登録しても購読はそのまま繋がる。登録しない人は「購入を復元」で戻せる。

## 2. Guideline 2.1 — ATTの許可要求が見つからない

**8/15に送った録画にはATTのダイアログが写っている**（0:03〜0:04 と 0:08〜0:11 の2回）。
1回目が通知の許可ダイアログにすぐ覆われているため、見落とされたと思われる。

実装側にも弱いところが2つあった。ビルド4で作り直した。

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

録画（`~/Desktop/FanHive-AppReview-2026-08-17.mp4`・1.9MB・2分39秒）の時刻を入れ込んだ完成稿。
返信欄の上限は4000字。

```
Thank you for the review. Both items are fixed in build 4, which is attached to this submission.

1. GUIDELINE 5.1.1(v) - REGISTRATION BEFORE PURCHASE

Registration is no longer required in order to purchase.

On the subscription screen ("マイページ" tab > "FanHive プレミアム" banner), the purchase button now
starts the App Store purchase for every user, including a user who has never registered. No
account, email address, or other personal information is requested before or during the purchase.

Registering an email address is optional and is offered only as a way to use the subscription on
another device. The subscription screen has no registration entry at all. The screen shown right
after a purchase offers it as one optional item ("メールアドレスを登録する（任意）"), and it can be
opened at any time from "マイページ" > "アカウント（データ引き継ぎ）" > "メールで登録", or from
"マイページ" > "FanHive プレミアム" > "引き継ぎ・通知・カレンダーの設定".

"購入を復元" (Restore Purchases) is on the subscription screen as well, so a subscription can be
recovered on a new device or after reinstalling without registering at all.

Two related screens changed in build 4 as well: account deletion has been moved out of
"カスタマイズ" > "⋮" and is now the last row of the settings list on My Page ("マイページ"), and the
optional email registration is offered on the screen shown right after a purchase.

2. GUIDELINE 2.1 - APP TRACKING TRANSPARENCY

The app does request tracking authorization at launch, and the prompt is visible in the recording
we sent on August 15 (physical iPhone SE 3rd generation, iOS 26.6) from 0:03 to 0:04, where it is
covered by the notification permission alert, and again from 0:08 to 0:11. We are sorry that it
was hard to find.

We found two weaknesses in that implementation and rewrote it for build 4.

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

A new screen recording is attached, captured on a physical iPad Air 13-inch (M2) running
iPadOS 26.6, where the iPhone app runs in compatibility mode, after deleting and reinstalling the
app. Nothing is trimmed from it.

- 0:06 the App Tracking Transparency prompt appears, before any ad is loaded, and stays on screen
  until it is allowed at 0:11
- 0:12 the notification permission prompt follows, and is allowed at 0:17
- 0:20 onboarding, then Home, Explore, Calendar and My Page
- 0:47 the subscription screen, and 0:53 the purchase in the Sandbox environment. No account,
  email address, or other personal information is requested at any point before this
- 1:05 the screen shown after the purchase, and 1:11 its settings step, where the optional email
  registration is the first item. It is completed between 1:26 and 2:05
- 2:14 account deletion from My Page, confirmed at 2:30

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
  **ビルド4をApp Store Connectに上げてTestFlightから入れる**のが確実。

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

1. Xcode で **ビルド4**（`CURRENT_PROJECT_VERSION = 4`）をアーカイブ → アップロード
2. バージョンページでビルドを **4** に差し替える（3は選ばず放置でよい）
3. 「App Reviewに返信」に 3. の英文＋録画を添付
4. App Review情報の**メモ**を更新（下記の2箇所）
5. バージョンページ「審査内容を更新」→ 提出詳細の「App Reviewに再提出」

**「提出をキャンセル」は押さない**（サブスク2つとグループも提出し直しになる）。

### メモ欄の直すところ

`docs/app-store-review-2.1-reply.md` の 2.（メモ欄用）にある **ACCOUNT の段落を丸ごと**
これに差し替える。アカウント削除の場所と、購入前にメールを聞く記述の両方が変わっている。

```
ACCOUNT
No sign-in is required. Every feature is available right after launch, and no registration is
required to purchase a subscription. Registering an email address is optional: it lets the same
account be used on another device. There is no password. Enter any email address you can receive
mail at; a 6-digit code is sent to it immediately and is entered in the app. It can be registered
at any time from My Page ("マイページ") > "アカウント（データ引き継ぎ）" > "メールで登録", and it is
also offered on the screen shown right after a purchase.
Account deletion: My Page ("マイページ") > the last row of the settings list > "アカウントを削除する".
```

他の段落（IN-APP PURCHASE / EXTERNAL SERVICES / PERMISSIONS など）は変更なし。

### 添付ファイル欄（動画は1つだけ）

8/15の9分の録画が残っているが、**却下された仕様（購入前のメール登録が必須・ATTが一瞬）が
映っている**ので、8/17の録画に差し替える。旧録画は8/15の返信スレッドに残るので失われない。

メモの末尾にこの段落を足しておく。

```
RECORDING
The attached recording (August 17, physical iPad Air 13-inch (M2), iPadOS 26.6, nothing trimmed)
shows, from a fresh install: the App Tracking Transparency prompt at 0:06, the notification prompt
at 0:12, a subscription purchase with no registration of any kind beforehand at 0:47-1:05, the
optional email registration at 1:11-2:05, and account deletion at 2:14-2:30. A longer recording
that also covers posting, reporting, and blocking is attached to our reply of August 15.
```

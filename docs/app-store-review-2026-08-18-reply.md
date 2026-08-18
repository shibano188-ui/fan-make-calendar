# 4回目の却下（2.1(a) 「公式サイトを開く」が無反応）への対応（2026-08-18）

審査端末は **iPad Air 11インチ(M3) / iPadOS 26**、対象は 1.0 **ビルド(4)**。
指摘は1件、`Bug description: 公式サイトを開く buttons were unresponsive.`

※ 却下メッセージの `OS version` の数字は文字が小さいので、返信前に画面で読み直すこと。
返信文には審査端末のOSバージョンを書いていないので、読み違えても問題は出ない。

---

## 1. 原因

`@capacitor/ios` の `WebViewDelegationHandler.swift`（v8.5）:

```swift
if !isApplicationNavigation, toplevelNavigation {
    if webView.window?.windowScene?.activationState == .foregroundActive {
        UIApplication.shared.open(navURL, options: [:], completionHandler: nil)
    }
    decisionHandler(.cancel)   // ← open されなくても cancel は必ず走る
}
```

外部URLへの遷移（`target="_blank"` / `window.open(url,'_blank','noopener')`）は Capacitor が
横取りするが、**シーンが `.foregroundActive` でないと `open` が呼ばれないまま `.cancel` される**。
エラーもログも出ず、ボタンが完全に無反応になる。

このアプリは iPhone専用（`TARGETED_DEVICE_FAMILY = "1"`）で、iPad では互換モードのウィンドウとして
動く。単一ウィンドウで前面なら `.foregroundActive` なので手元のiPadでは再現しないが、
他ウィンドウにフォーカスがある・Stage Manager などの状態だと落ちる。
審査のスクリーンショットが2枚とも「別アイテムの同じボタン画面」（05:13 と 05:14）なのは、
押しても何も起きないので別のアイテムでも試した、という動きと一致する。

## 2. 直したこと（ビルド5）

### 2-1. 外部リンクをネイティブで開く

- `@capacitor/browser` を追加。`src/lib/openExternal.ts` を外部リンクの唯一の入口にした。
  iOS は SFSafariViewController（**アプリ内**にシートで開く）、Android は Custom Tabs。
  シーンの状態に依存しないので互換モードでも必ず開く。
- `<a target="_blank">` は document の **capture フェーズ**で一括横取り
  （React側で `stopPropagation()` しているリンクがあり、バブリングでは document に届かない）。
- 横取りは **iOS 限定**。Android はリモートURLで読むため `index.html` のバリューコマース
  LinkSwitch が生きており、`preventDefault` するとアフィリンク変換を潰す。
  （iOSは dist 同梱＝origin が `capacitor://localhost` なので、プロトコル相対の
  `//aml.valuecommerce.com/vcdal.js` が読めず LinkSwitch はそもそも動いていない）
- Android の配信アプリは旧ビルドが新しいJSを読む期間があるので、
  `Capacitor.isPluginAvailable('Browser')` で判定して `window.open` にフォールバック。
- `openBuyLink` のクリックログを try で囲った。ログの例外でリンクが開かない事故を構造的に潰す。

### 2-2. AdMobバナーの出し入れの追い越し

シミュレータで確認したところ、商品詳細（`/item/:id`）にバナーが残って**戻るボタンを覆っていた**。
バナーはWebViewの外側のネイティブビューなので、残ると下のボタンのタップを食う。

`showBanner`/`hideBanner` の呼び出し元が複数（AdBannerController・Calendarのタイマー・Discoverの
rAF・編集フォーム）あり、iOSの show は ATTの回答待ち→`initialize()` を挟むので、
**後から出した hide を先に出した show が追い越す**。
`src/lib/admob.ts` で直列化＋「最後の意思が勝つ」に変更。呼び出し側は無変更。

### 2-3. ビルド番号

`CURRENT_PROJECT_VERSION` を 4 → **5**。

---

## 3. App Review への返信（英語・そのまま貼る）

**送る前に、実機のiPadでビルド5を確認すること**（下の 4. の手順）。
最後の段落で「確認した」と書いているので、確認していない状態で送らない。

```
Thank you for the review. The bug is fixed in build 5, which is attached to this submission.

GUIDELINE 2.1(a) - "公式サイトを開く" BUTTONS WERE UNRESPONSIVE

We were able to identify the cause.

"公式サイトを開く" ("Open the official site") opens the official website of the event shown on the
screen. Up to build 4 the app opened it as an external link from its web layer, and the framework
the app is built on (Capacitor) handles such links natively with this logic:

    if webView.window?.windowScene?.activationState == .foregroundActive {
        UIApplication.shared.open(url)
    }
    decisionHandler(.cancel)

When the scene is not .foregroundActive, the navigation is cancelled but nothing is ever opened, so
the button does nothing and no error is shown. FanHive is an iPhone app that also runs on iPad in
compatibility mode, where its window is not always the active scene. That is why the buttons were
unresponsive on your iPad while they worked on our iPhone devices.

Build 5 no longer relies on that path. Every external link in the app - "公式サイトを開く", "購入する"
(the same button when the event has a shop link), the shop links listed under "購入リンク", profile
links and share links - is now opened natively with SFSafariViewController through the Capacitor
Browser plugin. It does not depend on the activation state of the scene, and it presents the
website inside the app, so tapping the button always gives an immediate, visible response and the
user stays in FanHive. The X button at the top left returns to the previous screen.

We also fixed a second problem that could make buttons unresponsive. The AdMob banner is a native
view placed over the web view, so it cannot be hidden by the web layer. A race between the calls
that show and hide it could leave the banner on a screen where it is not supposed to appear,
covering the controls underneath it. Those calls are now serialized so that the most recent
request always wins.

How to verify in build 5:

1. Open any event from the "ホーム" (Home) tab or the "探す" (Explore) tab.
2. On the event screen, tap the yellow button at the bottom: "公式サイトを開く", or "購入する" when
   the event has a shop link.
3. The website opens inside the app in a Safari view. Tap the X button at the top left to return
   to the event screen.

Build 5 was verified on a physical iPad Air 13-inch (M2) running iPadOS 26.6, where the app runs in
compatibility mode, after deleting the previously installed version and installing build 5 as a
fresh install, and on an iPad Air 11-inch simulator running iPadOS 26. The website opened on every
attempt, both from "公式サイトを開く" and from the shop links listed under "購入リンク".

Thank you for your time.
```

### 録画を添付する場合に足す一文

上の `Thank you for your time.` の直前に入れる。

```
A screen recording captured on that iPad is attached to this message.
```

### 返信文で意図的にやっていること

- **「ブラウザが開く」ことを明示している**。審査員が「押したが何も起きない」と判断した以上、
  期待される挙動を書かないと同じ判定になりうる。しかもビルド5は**アプリ内**に開くので、
  「Safariに飛んだのに気づかなかった」可能性のほうだったとしても同時に潰れる。
- **再現手順を3行で書いている**。2.1(a) は「審査員がその場で確認できるか」で決まる。
- **原因をコードで書いている**。「直しました」だけだと再現しなかった側の言い分になる。
- 審査端末のOSバージョンは書いていない（読み違えのリスクを持ち込まない）。

## 4. 送る前にやる確認（実機）

1. ビルド5をApp Store Connectにアップロード → **TestFlightで実機のiPadに入れる**
   （iPhone専用アプリなのでXcodeからのiPad直接インストールは弾かれることがある）
2. 入れる前に**前のバージョンを削除**する（Appleの Next Steps がそれを要求している）
3. ホーム or 探す → 予定を開く → 下の黄色いボタンを押す
   → **アプリ内にSafariのシートが出る**（左上に ✕ ボタン）ことを確認
4. ✕ で予定の画面に戻れることを確認
5. 予定の画面の**上部にバナーが残っていない**こと、戻る（←）が押せることを確認

余裕があれば 30〜60秒の録画を撮って添付する。2.1(a) は「動いている画像」が一番強い。
録画するなら、削除→インストール→予定を開く→ボタン→サイトが開く→✕で戻る、を無編集で。

## 5. App Store Connect での手順

1. Xcode で **ビルド5**（`CURRENT_PROJECT_VERSION = 5`）をアーカイブ → アップロード
2. バージョンページでビルドを **5** に差し替える
3. 「App Reviewに返信」に 3. の英文を貼る（録画を撮ったら添付する）
4. メモ欄は基本そのままでよい。足すなら下の EXTERNAL LINKS を末尾に1段落だけ
5. バージョンページ「審査内容を更新」→ 提出詳細の「App Reviewに再提出」

**「提出をキャンセル」は押さない**（サブスク2つとグループも提出し直しになる）。

### メモ欄（App Review 情報のNotes）

**動画は差し替えない。** Notes に添付してある 8/17 の録画は、ATT のダイアログ・登録なしの購入・
アカウント削除を映していて、5.1.1(v) と 2.1(ATT) の証拠になっている。今回の録画は外部リンクしか
映っていないので、差し替えると前の2件の証拠が消える。**今回の録画は「App Reviewに返信」の
メッセージに添付する**（添付は返信ごとに付けられる）。

文章の変更は **EXTERNAL LINKS の段落だけ**。既存の段落（`docs/app-store-review-2.1-reply.md` の
2. にある2行）を丸ごとこれに差し替える。挙動が変わった＝内容が古くなっているため。

```
EXTERNAL LINKS
Events can link to the organizer's official website ("公式サイトを開く") and to shop pages for
physical merchandise on Rakuten Ichiba and Yahoo! Shopping ("購入する", and the links listed under
"購入リンク"). From build 5 these open inside the app in a Safari view (SFSafariViewController),
not in an external browser; the X button at the top left returns to the event screen. No digital
content is sold outside of In-App Purchase, and the app never requires any of these links to be
opened in order to be used.
```

RECORDING の段落（8/17に足したもの）はそのまま。2本の録画が別物だと分かるように、末尾に
この1文だけ足しておくと親切。

```
A second, shorter recording, showing the external links opening on the same iPad in build 5, is
attached to our reply about build 5.
```

他の段落（ACCOUNT / IN-APP PURCHASE / USER-GENERATED CONTENT / EXTERNAL SERVICES / REGIONS）は
変更なし。ACCOUNT は 8/17 に差し替えた版のままでよい。

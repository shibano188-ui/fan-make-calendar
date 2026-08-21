# 3.1.2(c) 却下（2026-08-21・ビルド6）と対応

## 言われたこと

> The purchase screen includes a toggle to add or remove a free trial from the subscription
> purchase. This design is confusing and may prevent users from understanding that they are
> committing to an auto-renewing subscription that will begin charging them after the free
> trial period.
>
> Remove the toggle for adding or removing a free trial from the subscription purchase screen.
> Users should be presented with a clear subscription offer that explicitly states whether a
> free trial is included.

Submission ID `a7a0d62c-50f6-447c-9c08-c221e4114a5f` / Version reviewed 1.0 (6)。

## 直したこと（ビルド8）

`src/pages/Premium.tsx`。**iOSだけ**の分岐で、Playの挙動は変えていない。

1. **「初月無料を使う」トグルをiOSから削除**。iOSは常に初月無料付きの提案ひとつだけ。
   そもそもApp Storeの導入価格はAppleが対象者を判定して自動で当てるので、
   このトグルはiOSでは購入処理に何も影響していなかった（表示だけの飾りだった）。
2. **月/年の両方を最初から表示**（iOSは `allPlans` の初期値を true に）。
   「すべてのプランを見る」の裏に価格を隠さない。
3. **プランの行にも無料お試しの有無を書く**: 「1か月無料、その後¥500/月」。
4. **購入ボタン下の文を、自動更新の定期購読だと分かる言い方に**:
   「最初の1か月は無料。無料期間が終わると月¥500の定期購読に自動で切り替わり、
   月ごとに自動更新されます。いつでも解約できます。」

## スクリーンショットも差し替えが要る

App Storeの1枚目とサブスク2つの審査用スクショが、**却下されたトグル付きの画面のまま**。
新しいものは `~/Desktop/FanHive-screenshots-build8/`。

サブスクの審査用スクショは fastlane が包んでいないので、生のASC APIで差し替える:

```bash
ruby scripts/asc-iap-screenshot.rb list
ruby scripts/asc-iap-screenshot.rb replace ~/Desktop/FanHive-screenshots-build8/03-サブスク審査用.png
```

## 提出手順（ビルド8）

```bash
cd ios/App
fastlane archive          # build/App.ipa（CURRENT_PROJECT_VERSION=8）
fastlane upload           # TestFlightへ。処理完了まで待つ
fastlane screenshots_download
cp ~/Desktop/FanHive-screenshots-build8/01-購入画面.png fastlane/screenshots/ja/   # 1枚目を差し替え
fastlane screenshots_upload
cd ../.. && ruby scripts/asc-iap-screenshot.rb replace ~/Desktop/FanHive-screenshots-build8/03-サブスク審査用.png
cd ios/App && fastlane submit build:8
```

## App Review への返信案

```
Thank you for the review.

We have removed the free trial toggle from the purchase screen in build 8.
The screen now presents a single, explicit offer: the first month is free and the
subscription then auto-renews at ¥500/month (or ¥4,800/year). Both plans and their
prices are shown at all times, each plan row states "1 month free, then ¥500/month",
and the text directly under the purchase button states that the subscription
auto-renews after the free period and can be cancelled at any time.
```

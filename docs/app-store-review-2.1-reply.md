# Guideline 2.1 Information Needed への返信（2026-08-15）

2回目の却下。**バグではなく、新規アプリに定型で送られてくる情報要求**。
ビルドの作り直しは不要。必要なのは「実機で撮った画面録画」と「8項目の文章回答」だけ。

埋めるところは `[ ]` にしてある。

---

## 1. App Review への返信（英語・そのまま貼る）

```
Thank you for the review. Here is the information requested.

1. Screen recording

Attached is a screen recording captured on a physical iPhone [MODEL] running iOS [VERSION].
It starts with launching the app from the Home Screen and covers the typical user flow:
onboarding and following titles, adding an event by sharing a post from X (our AI input),
writing an event to the iOS Calendar, posting an event, reporting a post and blocking a user,
registering an email address (one-time code), the subscription purchase flow in the Sandbox
environment, restoring purchases, and deleting the account. The prompts for notifications,
calendar access, and App Tracking Transparency are shown as they appear.

2. Devices and operating systems tested

- iPhone [MODEL] (physical device), iOS [VERSION]
- iPad Air 13-inch (M2) (physical device), iPadOS [VERSION] - used during development, before
  the app was set to iPhone only
- Simulator: iPhone 17 Pro, iPhone 17 Pro Max, iPhone Air, iOS 26.5

3. Functions and target audience

FanHive is a shared calendar for fans of Japanese anime, manga, and games.

The problem it solves: announcements for character merchandise - the release date, the day
pre-orders open, and the day pre-orders close - are posted one by one on X and on many
different shop pages. Fans who follow several titles cannot track all of them and miss the
pre-order window, which for limited merchandise means they cannot buy the item at all.

In FanHive a user follows the titles they like. Events posted by other fans of the same titles
are collected into one calendar, and the app sends a reminder before a release date or a
pre-order deadline. Events can also be written to the iOS Calendar.

Target audience: consumers in Japan, mainly in their teens to thirties, who buy character
merchandise. All content is in Japanese.

4. Setting up and accessing the main features

No sign-in is required. On first launch the user selects the titles to follow, and every
feature is then available.

- Home (bottom tab "ホーム"): upcoming events for the titles you follow
- Explore (bottom tab "探す"): all posted merchandise and events, filtered by category and region
- Calendar (bottom tab "カレンダー"): month view; tapping an event opens its detail, where it can
  be written to the iOS Calendar (this asks for calendar permission)
- Adding an event with AI: share a post from the X app or Safari into FanHive with the iOS share
  sheet, or paste a URL in the app. Our server reads the post (and its image) and fills in the
  product name, date, and price. The user checks the result and saves it.
- Posting: the "+" button posts an event manually
- Moderation: any post can be reported from its detail screen; a reported post is hidden from
  the reporting user immediately. Tapping the poster's name opens their profile, where they can
  be blocked.
- My Page (bottom tab "マイページ"): notification settings, followed titles, appearance,
  email registration, sign out, and account deletion (My Page > "カスタマイズ" > the "⋮" button
  in the top right > "アカウントを削除する")

Login credentials: none are needed. The only place the app asks for an email address is before
a subscription purchase, so that the subscription can be restored after changing devices.
There is no password: enter any email address you can receive mail at, and a 6-digit code is
sent to it immediately. Enter that code in the app and registration is complete.

5. External services used to deliver the core functionality

- Vercel - hosting for the app's web assets and API endpoints
- Supabase - PostgreSQL database and authentication (email one-time code)
- Anthropic Claude API (claude-haiku-4-5) - reads the post or screenshot the user shares and
  extracts the product name, date, and price
- X public oEmbed and syndication endpoints - retrieve the text and images of the post that the
  user has explicitly shared into the app
- Rakuten Ichiba Item Search API and Yahoo! Shopping API - price, stock, and shop links for
  physical merchandise (we participate in both affiliate programs)
- Apple In-App Purchase, with RevenueCat and App Store Server Notifications for entitlement
- Firebase Cloud Messaging (over APNs) - push notifications
- Google AdMob - banner ads, shown only to users without a subscription. The App Tracking
  Transparency prompt is shown before the advertising identifier is requested.
- Upstash Redis - rate limiting for our API

6. Regional differences

There are none. The app behaves identically in every region where it is available; no feature
is enabled, disabled, or changed by region. The interface and the user-posted content are in
Japanese only. The app is available in 148 countries and is not distributed in the European Union.

7. Regulated industry and third-party material

FanHive does not operate in a regulated industry and does not stream or host licensed media.
Product names, prices, thumbnail images, and shop links are obtained through the official
Rakuten and Yahoo! Shopping affiliate APIs, whose terms permit this use. Titles of anime, manga,
and games appear only as text labels that users choose to follow.

User-generated posts are moderated: every post can be reported from its detail screen and is
hidden from the reporting user immediately, users can block other users from their profile, our
Terms of Use prohibit infringing and inappropriate content, and we act on reports within 24 hours.
Contact for takedown requests: contact@fanhive.jp

8. What the user can buy with In-App Purchase

One product, FanHive Premium, offered as two auto-renewable subscriptions:

- FanHive Premium Monthly (jp.llp.fanhive.premium.monthly) - JPY 500 per month
- FanHive Premium Yearly (jp.llp.fanhive.premium.yearly) - JPY 4,800 per year

Both include a one-month free introductory offer for new subscribers.

A subscription unlocks: an immediate notification when pre-orders open (users without a
subscription receive a digest the next morning), price-drop and restock notifications,
automatic sync to the iOS Calendar, an unlimited number of followed titles (5 without a
subscription), and removal of ads.

How to reach the purchase: bottom tab "マイページ" (My Page) > the "FanHive プレミアム" banner at
the top of that screen > choose the monthly or yearly plan > the purchase button. The price,
the billing period, and the free trial are shown directly above the purchase button, together
with links to the Terms of Use and the Privacy Policy and a "購入を復元" (Restore Purchases)
button. Before payment the app asks for an email address as described in item 4.

Please use a Sandbox account to complete the purchase.
```

## 2. App Review 情報の「メモ」欄に入れる文章（4000字以内・英語）

Apple から「今後の提出のために Notes 欄に入れておけ」と指示があるので、既存のメモを
これに差し替える。

```
FanHive is a shared calendar for fans of Japanese anime, manga, and games. Users follow the
titles they like and see, in one calendar, when merchandise is released and when pre-orders
open and close. Events are posted by users; an event can also be created automatically by
sharing a post from X into the app, which our server parses with the Anthropic Claude API.

ACCOUNT
No sign-in is required. Every feature is available right after launch.
The app asks for an email address only before a subscription purchase, so that the purchase can
be restored after changing devices. There is no password. Enter any email address you can
receive mail at; a 6-digit code is sent to it immediately and is entered in the app.
Account deletion: My Page ("マイページ") > "カスタマイズ" > the "⋮" button in the top right >
"アカウントを削除する".

IN-APP PURCHASE
Two auto-renewable subscriptions for FanHive Premium: JPY 500 per month and JPY 4,800 per year,
both with a one-month free introductory offer. Premium gives immediate pre-order notifications,
price-drop and restock notifications, automatic sync to the iOS Calendar, unlimited followed
titles, and no ads. To reach it: bottom tab "マイページ" > the "FanHive プレミアム" banner at the
top of the screen. Price, period, trial, Terms of Use, Privacy Policy, and Restore Purchases are
all on that screen. Please use a Sandbox account.

EXTERNAL LINKS
Purchase links open the pages of physical merchandise on Rakuten Ichiba and Yahoo! Shopping. No
digital content is sold outside of In-App Purchase.

USER-GENERATED CONTENT
Every post can be reported from its detail screen and is hidden from the reporting user
immediately. A user can be blocked from their profile. Our Terms of Use prohibit inappropriate
and infringing content, and we act on reports within 24 hours. Contact: contact@fanhive.jp

EXTERNAL SERVICES
Vercel (hosting and API), Supabase (database and email one-time code authentication), Anthropic
Claude API (parsing shared posts), X public oEmbed and syndication endpoints (reading a shared
post), Rakuten Ichiba and Yahoo! Shopping APIs (price and stock of physical goods; affiliate
programs), Apple In-App Purchase with RevenueCat, Firebase Cloud Messaging over APNs (push),
Google AdMob (banner ads for users without a subscription; ATT prompt shown first),
Upstash Redis (rate limiting).

REGIONS
The app behaves identically in every region. Interface and content are in Japanese only.
Available in 148 countries; not distributed in the European Union.

PERMISSIONS
Notifications (reminders for release dates and pre-order deadlines), Calendar (writing an event
to the iOS Calendar, at the user's request), App Tracking Transparency (banner ads).
```

## 3. 画面録画の撮り方

Apple の要求は「最新のOSが入った**実機**で、**起動から**主要機能まで」。シミュレータは不可。

### 撮る前の準備

- 借りるiPhoneの **iOSが最新（26.x）か確認**する。Appleは "running the latest operating system"
  と指定している。古ければ設定 > 一般 > ソフトウェアアップデート
- 借りたiPhoneに **TestFlight で 1.0(2) を入れる**（App Store Connect > TestFlight >
  内部テスターにその人のApple IDを追加、またはパブリックリンクを発行）
- **一度アプリを消してから入れ直す**。通知・カレンダー・ATTの許可ダイアログは初回だけ出る
- 課金を撮るので **Sandboxアカウント**を設定（設定 > Developer > Sandbox Apple Account。
  項目が無ければ購入時に出るダイアログでSandboxテスターのIDを入れる）
- Xのアプリ（またはSafariでXのポスト）を1つ開いておく。共有からの取り込みを撮るため
- コントロールセンターに「画面収録」を出しておく

### 撮る順番（3〜6分・音声なしでよい）

1. ホーム画面のアイコンをタップして起動（**必ずここから撮る**）
2. オンボーディング → 作品を選ぶ → ホームが表示される
3. 通知の許可ダイアログ・ATTのダイアログが出たら**画面に写す**（許可を選ぶ）
4. ホームをスクロール → 予定をタップ → 詳細 → 端末カレンダーに追加
   （カレンダーの許可ダイアログ → 追加後に iOS の「カレンダー」アプリを開いて入っていることを見せる）
5. 「探す」タブ → 商品を開く → 購入リンクをタップして販売ページ（楽天/Yahoo!）が開くのを見せて戻る
6. Xに切り替え → ポストを共有 → FanHive → AIが読み取った内容 → 保存 → 予定ができるところまで
7. 「+」から手動で投稿を1件
8. 他人の投稿を開く → 通報 → 消えるのを見せる → 投稿者名 → プロフィール → ブロック
9. マイページ → FanHive プレミアム → 月/年のプラン・価格・初月無料・規約リンクが見えるところ
   → 「メールアドレスを登録する」→ メール入力 → 6桁コード → 登録完了
   → 購入 → **Sandboxの購入ダイアログ** → 完了 → プレミアムが有効になった画面
   → 「購入を復元」もタップして見せる
10. マイページ → カスタマイズ → 右上の⋮ → 下までスクロール → アカウントを削除する → 本当に削除する
    （**最後にやる**。データが消えるので）
11. 収録を停止

### 送り方

App Store Connect の返信に添付する。容量が大きくて弾かれる場合は圧縮する:

```
ffmpeg -i 元.mp4 -vf "scale=-2:1280" -c:v libx264 -crf 28 -preset slow -an 提出用.mp4
```

それでも入らなければ、限定公開のYouTube/Driveのリンクを返信本文に書く。

## 4. App Store Connect での手順

1. 提出詳細ページの「App Reviewに返信」→ 上の文章を貼る＋録画を添付
2. バージョンページ > App Review情報 > メモ を 2. の文章に差し替えて保存
3. バージョンページの「審査内容を更新」→ 提出詳細の「App Reviewに再提出」

**「提出をキャンセル」は押さない**（サブスク2つとグループも提出し直しになる）。

## 次のビルドで直したいこと（今回は不要）

- **アカウント削除がカスタマイズ画面の⋮の中**にあり、5.1.1(v)の「見つけやすい場所」として弱い。
  マイページの一番下に「アカウントを削除する」を置く
- 購入前のメールアドレス登録を必須から任意にする（審査でも実ユーザーでも脱落点になる）
- `ITSAppUsesNonExemptEncryption = false` を Info.plist に入れる

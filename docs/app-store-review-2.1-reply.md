# Guideline 2.1 Information Needed への返信（2026-08-15）

2回目の却下。**バグではなく、新規アプリに定型で送られてくる情報要求**。
ビルドの作り直しは不要。必要なのは「実機で撮った画面録画」と「8項目の文章回答」だけ。

埋めるところは `[ ]` にしてある。

---

## 1. App Review への返信（英語・そのまま貼る）

```
Thank you for the review. Here is the requested information.

1. SCREEN RECORDING
Attached, captured on a physical iPhone SE (3rd generation), iOS 26.6, starting from launching
the app. It covers the whole flow described below, including the ATT, notification and calendar
prompts, reporting and blocking, the Sandbox purchase, and account deletion.

2. DEVICES AND OS TESTED
iPhone SE (3rd generation), iOS 26.6 (physical). iPad Air 13-inch (M2), iPadOS 26.6 (physical,
used before the app was set to iPhone only). Simulators: iPhone 17 Pro and 17 Pro Max, iOS 26.5.

3. FUNCTIONS AND TARGET AUDIENCE
FanHive is a shared calendar for fans of Japanese anime, manga and games. Release dates and the
days pre-orders open and close are scattered across single posts on X and many shop pages, so fans
miss the window and cannot buy limited merchandise at all. Users follow the titles they like, and
events posted by other fans of those titles gather into one calendar with reminders.
Audience: consumers in Japan, mainly teens to thirties, who buy character merchandise.

4. MAIN FEATURES AND HOW TO REACH THEM
No sign-in is required; after choosing titles to follow on first launch, everything is open.
Tabs: "ホーム" Home (events for followed titles), "探す" Explore (everything posted), "カレンダー"
Calendar (month view of saved events), "マイページ" My Page (notifications, followed titles, email
registration, subscription, and account deletion via "カスタマイズ" > "⋮" > "アカウントを削除する").
AI input: share a post from X or Safari into FanHive, or paste a URL; our server fills in the
product name, date and price for the user to confirm.
Moderation: any post can be reported from its detail screen and is then hidden from the reporting
user; a user can be blocked from their profile.
Writing to the iOS Calendar is a subscriber feature; after subscribing the user picks a calendar on
the device, where calendar permission is requested.
Credentials: none. An email address is asked only before a purchase, so it can be restored after
changing devices. There is no password: enter any address you can receive mail at, and a 6-digit
code arrives at once.

5. EXTERNAL SERVICES
Vercel (hosting, API); Supabase (database, email one-time-code authentication); Anthropic Claude
API (reading the shared post or screenshot); X public oEmbed and syndication endpoints (that post's
text); Rakuten Ichiba and Yahoo! Shopping APIs (price, stock and shop links for physical
merchandise; both affiliate programs); Apple In-App Purchase with RevenueCat and App Store Server
Notifications; Firebase Cloud Messaging over APNs; Google AdMob (banners for non-subscribers,
ATT prompt first); Upstash Redis (rate limiting).

6. REGIONAL DIFFERENCES
None. Behavior is identical in every region where the app is available. Interface and user
content are Japanese only. Available in 148 countries, not in the European Union.

7. REGULATED INDUSTRY AND THIRD-PARTY MATERIAL
Not a regulated industry, and no licensed media is hosted. Product names, prices,
thumbnails, and shop links come from the official Rakuten and Yahoo! Shopping affiliate APIs,
whose terms permit this use; titles appear only as text labels users follow. Posts are moderated
as in item 4, our Terms of Use prohibit infringing content, and we act within 24 hours
(contact@fanhive.jp).

8. IN-APP PURCHASE
FanHive Premium, two auto-renewable subscriptions: jp.llp.fanhive.premium.monthly JPY 500/month
and jp.llp.fanhive.premium.yearly JPY 4,800/year, both with a one-month free introductory offer.
It unlocks immediate pre-order notifications (others get a digest next morning), price-drop and
restock notifications, automatic sync to the iOS Calendar, unlimited followed titles (5
otherwise), and no ads. To reach it: bottom tab "マイページ" > the "FanHive プレミアム" banner at the
top > choose monthly or yearly > the purchase button. Price, billing period, free trial, Terms of
Use, Privacy Policy, and "購入を復元" (Restore Purchases) are all on that screen. Please use a
Sandbox account.
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

端末は **iPhone SE（第3世代）/ iOS 26.6**。2026-08-15 に開発ビルドをインストール済み。

- **アプリをまだ開かない**。オンボーディングと通知・ATTの許可ダイアログは初回起動でしか出ない。
  開いてしまったらアプリを削除して入れ直す（`xcrun devicectl device install app` で30秒）
- **Sandboxアカウント**: 設定 > デベロッパ > Sandbox Apple Account に
  `shisoh0501+sandbox@gmail.com` でサインイン
- **Sandboxの購入履歴を消しておく**（App Store Connect > ユーザとアクセス > Sandbox >
  テストアカウントを選択 > 「購入履歴を消去」）。2026-08-14に購入済みのままだと
  **初月無料の対象外になり「初月無料を使う」のトグルが出ない**
- **メールアドレスはFanHiveで未使用のものを使う**。登録は「今の匿名アカウントにメールを紐づける」
  処理なので、過去に使ったアドレスだとエラーで止まる。
  `shisoh0501+fh1@gmail.com` のような Gmail の `+` エイリアスなら、Supabaseからは別アドレス、
  受信は普段の受信箱。撮り直すたびに番号を変えれば何度でも使える
- Xのアプリ（またはSafariでXのポスト）を1つ開いておく。共有からの取り込みを撮るため
- コントロールセンターに「画面収録」を出しておく

### 撮る順番（4〜7分・音声なしでよい）

**端末カレンダーへの書き込みはプレミアム限定**（`src/pages/MyPage.tsx:520`）なので、
購入を先に済ませてからカレンダーを見せる。購入直後の画面に「カレンダーの書き込み先を選ぶ」が
出るので、そのまま繋がる。

1. 収録を開始 → ホーム画面のアイコンをタップして起動（**必ずここから撮る**）
2. オンボーディング → 作品を選ぶ → ホームが表示される
3. 通知の許可ダイアログ・ATTのダイアログが出たら**画面に写す**（どちらも許可を選ぶ）
4. 「探す」タブ → 商品を開く → 購入リンクをタップして販売ページ（楽天/Yahoo!）が開くのを見せて戻る
5. Xに切り替え → ポストを共有 → FanHive → AIが読み取った内容 → 保存 → 予定ができるところまで
6. 「+」から手動で投稿を1件
7. 他人の投稿を開く → 通報する → 消えるのを見せる → 投稿者名 → プロフィール → ブロック
8. マイページ → FanHive プレミアム。**月/年の価格・初月無料・利用規約・プライバシーポリシー・
   購入を復元が1画面に並んでいるところを数秒映す**（購入後は復元ボタンが消えるので、
   押して見せるならここ）
9. 「メールアドレスを登録する」→ `+` エイリアスのアドレス → 届いた6桁コード → 登録完了
10. 「初月無料で始める」→ **Sandboxの購入ダイアログ** → 完了
11. 購入直後の画面で「カレンダーの書き込み先を選ぶ」→ **カレンダーの許可ダイアログ** →
    書き込み先を選ぶ → 「はじめる」
12. iOSの「カレンダー」アプリを開いて、FanHiveの予定が入っているのを見せる → FanHiveに戻る
13. マイページ → カスタマイズ → 右上の⋮ → 下までスクロール → アカウントを削除する → 本当に削除する
    （**最後にやる**。データが消えるので）
14. 収録を停止

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

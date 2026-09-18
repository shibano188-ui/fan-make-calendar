# 使っているサービス

FanHive を動かしている外部サービスの役割と、誰が何をできるか。
**鍵・パスワードはここに書かない**（リポジトリは公開）。必要なら柴野に聞く。

## 全体の地図

```
利用者のスマホ
 ├─ Android アプリ ──→ https://fanhive.jp を表示（Vercel）
 ├─ iOS アプリ ──────→ 画面は同梱。データは api/ と Supabase へ
 └─ ブラウザ ────────→ https://fanhive.jp

fanhive.jp（Vercel）
 ├─ 画面（src/）
 └─ api/ … AI読み取り・商品検索・通知・課金の受け口・ダッシュボード
        ├─ Supabase（DB・ログイン）
        ├─ Anthropic（AI）／楽天・Yahoo（商品検索）
        ├─ Upstash Redis（回数制限）
        ├─ Firebase（プッシュ通知）
        └─ RevenueCat（課金の状態）
```

## メンバー全員が入れるもの

### GitHub — コードの置き場
- `shibano188-ui/fan-make-calendar`（公開リポジトリ）
- **できること**: ブランチ・PR・Issue、main への push（＝本番に出る）
- **できないこと**: force push、main の削除
- 作業の流れは `docs/WORKFLOW.md`

### Supabase — データベースとログイン
- **本番** `fan-make-calender`（`jsgidtwxhueqgtvshdku`）… 利用者の本物のデータ
- **開発用** `fanhive-dev`（`srlxgpodxdvfunyqejav`）… プレビューと手元の開発がつながる。壊してよい
- **できること**（Developer 権限）: 表の閲覧、SQL Editor での実行、データの書き換え
- **できないこと**: プロジェクトの設定・API キーの閲覧・課金・削除
- ⚠️ **本番で SQL を流す前に、必ず開発用で試す。** 本番で流したらコミットか PR に書く
- 画面の左上でプロジェクトを切り替える。**今どちらを開いているか必ず確かめる**
- よく見る場所: Table Editor（表の中身）／SQL Editor／Authentication（ユーザー）

### App Store Connect — iOS アプリの管理
- https://appstoreconnect.apple.com
- **できること**（管理者）: アプリの説明文・スクショ・価格・サブスク、TestFlight、審査への提出、売上とダウンロード数
- ⚠️ **「審査へ提出」「価格の変更」「サブスクの変更」はチャットで一声かけてから。** 利用者に直接見える・取り消しにくい
- アプリのビルドとアップロードは柴野の Mac で行う（署名の鍵があるため）

### Google Play Console — Android アプリの管理
- https://play.google.com/console
- **できること**（管理者）: ストアの説明文・スクショ、テスト版の配布、レビューへの返信、インストール数
- ⚠️ App Store Connect と同じく、公開・価格まわりは一声かけてから
- Android の画面は本番の Web をそのまま表示しているので、**画面の修正は Play に出し直さなくても届く**。
  出し直しが要るのは Capacitor のプラグインを足したときだけ（`docs/GOTCHAS.md`）

## 柴野だけが入れるもの（必要なら頼む）

| サービス | 役割 | 頼むとき |
|---|---|---|
| **Vercel** | `fanhive.jp` の配信、`api/` の実行、プレビューの自動作成、定期実行（Cron） | 環境変数を足す・変える、エラーログを見る、本番を前の版に戻す |
| **ドメイン**（`fanhive.jp`） | 住所。DNS は Vercel で管理 | サブドメインを足す |
| **RevenueCat** | iOS/Android の課金をまとめて、会員状態を `api/revenuecat-webhook` に知らせる | 課金の商品を変える |
| **Firebase**（プロジェクト `zeta-bonsai-433101-e2`） | プッシュ通知の送信（FCM）。Play のレポート読み取りにも同じアカウントを使う | 通知が届かない |
| **AdMob** | 無料ユーザー向けの広告 | 広告の枠を変える |
| **Anthropic** | AI（X の投稿の読み取り・テーマ生成）。回数と金額に上限を付けてある | 上限を変える |
| **楽天・Yahoo のAPI** | 商品検索と購入リンク（アフィリエイト） | — |
| **Upstash Redis** | AI・検索の回数制限の記録（プレビューと本番でキーを分けてある） | — |
| **Apple Developer**（証明書・署名） | iOS のビルドに要る | — |

## 数字を見る

- **チーム用ダッシュボード** … 利用者数・投稿・課金・ストアのダウンロード数。URL はチャットで共有（パスワード入り）
- **App Store Connect / Play Console** … ストアの公式の数字
- **Supabase の表** … 生のデータ（開発用と本番を取り違えない）

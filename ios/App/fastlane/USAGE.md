# fastlane（App Store Connect をブラウザ無しで操作する）

遠隔（スマホから Claude Code を動かす）運用で、Apple ID のブラウザセッションが
切れていても App Store Connect を操作できるようにするための構成。

※ `README.md` は fastlane が実行のたびに自動生成して上書きするので、
   手で書いたドキュメントはこの `USAGE.md` に置く。

## 構成（2026-08-21 セットアップ済み）

| 項目 | 値 |
|---|---|
| Key ID | `W226N9Y2HT`（名前 `FanHive CI` / アクセス App Manager） |
| Issuer ID | `000893ff-c470-4815-a056-d61f61a53695` |
| 秘密鍵 | `~/.appstoreconnect/private_keys/AuthKey_W226N9Y2HT.p8`（600） |
| fastlane 用 JSON | `~/.appstoreconnect/fanhive-asc-key.json`（600） |
| App | FanHive (`6801161205`) / `jp.llp.fanhive` / team `JX3B783DS6` |

どちらもリポジトリ外。`.gitignore` で `*.p8` は元から除外されている。
**App Store Connect の API キーに有効期限はない**（Apple 公式の仕様）。

再構築が必要になったら `~/Desktop/setup-asc-key.sh`。

## 使う

```bash
cd ios/App
fastlane info                  # バージョン・審査ステータス・ビルド一覧
fastlane screenshots_download  # 現在のスクショを fastlane/screenshots/ に取得
fastlane screenshots_upload    # fastlane/screenshots/ を反映
fastlane beta                  # アーカイブ → TestFlight
```

### スクリーンショット差し替えの手順

`deliver` は**ロケール単位で全置換**する。1枚目だけ差し替えることはできないので、
必ず download → 差し替え → upload の順で回す。

```bash
fastlane screenshots_download
cp ~/Desktop/FanHive-screenshots-build6/01-購入画面.png fastlane/screenshots/ja/
cp ~/Desktop/FanHive-screenshots-build6/02-投稿.png     fastlane/screenshots/ja/
# 古い1枚目・2枚目のファイルを消し、並び順どおりのファイル名に整える
fastlane screenshots_upload
```

## 実装メモ

`app_store_connect_api_key` は `api_key_path:` を受け付けない（fastlane 2.238.0）。
受け付けるのは `key_id` / `issuer_id` / `key_filepath` / `key_content` /
`is_key_content_base64` / `duration` / `in_house` / `set_spaceship_token`。
そのため Fastfile 側で JSON を読んで個別に渡している。

## API キーでは代替できないもの

- **サブスク（App内課金）の「審査に関する情報 > スクリーンショット」**
  ASC API に該当エンドポイントはあるが fastlane が包んでいない。
  ここだけはブラウザ操作か生 API 呼び出しが要る。
  （`docs/app-store-review-audit-2026-08-20.md` の「提出中のサブスクは差し替えられない」も参照）
- 証明書の新規発行など、Apple ID の 2FA が要る一部の操作

## ビルドと提出（2026-08-21 追加）

```bash
fastlane archive          # アーカイブだけ（build/App.ipa）
fastlane upload           # 上の ipa を TestFlight へ
fastlane submit build:8   # そのビルドを 1.0 に紐付けて審査に提出
```

`submit` は暗号化・IDFA の回答も一緒に送る（AdMobの広告あり・ATTで許可を取る前提）。
`beta` は archive と upload をまとめてやる従来のレーン。

サブスクの審査用スクリーンショットだけは fastlane では触れないので
`ruby scripts/asc-iap-screenshot.rb list | replace <画像>` を使う。

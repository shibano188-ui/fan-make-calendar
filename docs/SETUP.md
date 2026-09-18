# 動かすまで

メンバーは Windows、柴野は Mac。手順は Windows で書き、Mac で違うところだけ補足する。

## 0. 前もってもらうもの

- GitHub のリポジトリへの招待（メールの「Accept」を押す）
- **`fanhive-env.txt`**（柴野から LINE でもらう）… 開発用 Supabase につなぐための2行。公開して困る値は入っていない
- Claude の有料プラン（Pro 以上）… Claude Code を使うため

Vercel・Supabase のアカウントは無くても作業できる。

## 1. 必要なものを入れる（最初の1回だけ）

以下は **PowerShell** で行う（スタートメニューで「PowerShell」と検索）。1行ずつ貼って Enter。

```
winget install OpenJS.NodeJS.LTS
winget install Git.Git
winget install GitHub.cli
```

「同意しますか」と聞かれたら `Y`。**3つ終わったら PowerShell を閉じて開き直す**（開き直さないと使えない）。

npm を動かすための設定（1回だけ）:

```
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

`Y` を押す。これをしないと `npm` で「このシステムではスクリプトの実行が無効になっている」と出る。

Claude Code:

```
irm https://claude.ai/install.ps1 | iex
```

終わったら PowerShell をもう一度開き直す。

> Mac: Node.js は https://nodejs.org 、Git は `xcode-select --install`、GitHub CLI は `brew install gh`、
> Claude Code は `curl -fsSL https://claude.ai/install.sh | bash`。

## 2. GitHub にログインする

```
gh auth login
```

矢印キーと Enter で「GitHub.com」→「HTTPS」→「Y」→「Login with a web browser」。
画面に出る8桁のコードをブラウザに入れてログインする。これで push できるようになる。

## 3. コードを手元にコピーする

```
cd ~\Desktop
gh repo clone shibano188-ui/fan-make-calendar
cd fan-make-calendar
npm install
```

## 4. `.env.local` を置く

LINE でもらった `fanhive-env.txt` をダウンロードする（「ダウンロード」フォルダのままでよい）。
`fan-make-calendar` フォルダにいる状態で:

```
Move-Item ~\Downloads\fanhive-env.txt .env.local
```

名前を変えながら正しい場所に置ける。「見つからない」と出たら、エクスプローラーで場所と名前を確かめてコマンドを書き換える。

> メモ帳で自分で作ると `.env.local.txt` になって読み込まれないので、この方法で置く。
> `.env.local` を置かずに動かすと**本番の Supabase** につながってしまう（`src/lib/supabase.ts` の既定値）。

## 5. 動くか確かめる

```
npm run dev
```

ブラウザで http://localhost:5173 を開いてアプリが出れば成功。止めるときは PowerShell で Ctrl+C。

**手元では `api/` が動かない**（画面だけが動く）。AI の読み取り・商品検索・通知・アカウント削除など
`/api/...` を呼ぶ機能はエラーになるので、プレビュー（下）で確かめる。鍵は Vercel の中にあるので手元には要らない。

## 6. Claude Code を起動する

```
claude
```

**必ず `fan-make-calendar` フォルダの中で起動する。** 起動すると `CLAUDE.md`（チームのルール）を自動で読む。
最初はブラウザで Claude のアカウントにログインする。最初の一言の例:

> docs の SETUP・WORKFLOW・SERVICES を読んで、このアプリの仕組みと、作業の流れを簡単に説明して

## 次回から

```
cd ~\Desktop\fan-make-calendar
git pull
claude
```

作業の前に `git pull` でほかの人の変更を取り込む。

## 開発用の Supabase

- `fanhive-dev`（`srlxgpodxdvfunyqejav`）。本番と同じテーブル・関数・権限（RLS）が入っている
- 作品マスタ（`works` `work_master` など）は本番からコピー済み。投稿・いいね・ユーザーは空
- 本番と違うもの: 定期実行（pg_cron）は入れていない／`metrics_reader` ロールは無い
- プレビューの API（`api/`）もこちらを見る。AI の回数制限はプレビュー専用に分かれている

## プレビュー（ブラウザで確かめる）

ブランチを push すると Vercel が自動でビルドし、PR に URL が付く。
ブランチごとの固定 URL は `https://fan-make-calendar-git-<ブランチ名>-shibano-s-projects.vercel.app`
（ブランチ名が長いと途中で切られて別の文字が付くので、PR に付く URL を使うのが確実）。
ログインなしで開ける。スマホでもそのまま見られる。

## アプリ（iOS / Android）のビルド

柴野だけがやる（署名の鍵が要るため。iOS は Mac も要る）。Web の修正だけなら不要で、
main に入れれば Android と Web にはすぐ届く。iOS には柴野が次にアプリを更新したときに届く。

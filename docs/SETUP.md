# 動かすまで

## 必要なもの

- Node.js 22 以上
- GitHub アカウント（リポジトリの collaborator に招待してもらう）
- Vercel・Supabase のアカウントは**なくてよい**（プレビューは GitHub に push すれば自動でできる）

## 手元で動かす

```sh
git clone https://github.com/shibano188-ui/fan-make-calendar.git
cd fan-make-calendar
npm install
```

`.env.local` を作る（中身は柴野からもらう。**開発用の Supabase** に向いた値）:

```
VITE_SUPABASE_URL=https://srlxgpodxdvfunyqejav.supabase.co
VITE_SUPABASE_ANON_KEY=（開発用の anon key）
```

```sh
npm run dev   # http://localhost:5173
```

`.env.local` を作らずに動かすと**本番の Supabase** につながる（`src/lib/supabase.ts` の既定値）。
画面を見るだけなら問題ないが、投稿・いいねなどは本番のデータになるので避ける。

## 開発用の Supabase

- `fanhive-dev`（`srlxgpodxdvfunyqejav`）。本番と同じテーブル・関数・権限（RLS）が入っている
- 作品マスタ（`works` `work_master` など）は本番からコピー済み。投稿・いいね・ユーザーは空
- 本番と違うもの: 定期実行（pg_cron）は入れていない／`metrics_reader` ロールは無い
- プレビューの API（`api/`）もこちらを見る。AI の回数制限はプレビュー専用に分かれている

## プレビュー（ブラウザで確かめる）

ブランチを push すると Vercel が自動でビルドし、PR に URL が付く。
ブランチごとの固定 URL は `https://fan-make-calendar-git-<ブランチ名>-shibano-s-projects.vercel.app`。
ログインなしで開ける。スマホでもそのまま見られる。

## アプリ（iOS / Android）のビルド

柴野だけがやる（署名の鍵とストアの権限が要るため）。Web の変更だけなら不要。

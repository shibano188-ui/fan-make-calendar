# FanHive — チーム共通のルール

アニメ・キャラグッズの予定（発売・予約締切・イベント）をファンが投稿し、AIが整理して届けるアプリ。
Web（React + Vite）を Capacitor で包んで iOS / Android に出している。API は Vercel の関数（`api/`）、DB は Supabase。

最初に読むもの: `docs/SETUP.md`（動かすまで）→ `docs/WORKFLOW.md`（作業の流れ）→ `docs/GOTCHAS.md`（ハマりどころ）。
いまの全体像は `docs/STATUS.md`。

## 絶対にやらないこと

- **本番に直接触らない。** `vercel --prod`、本番 Supabase への SQL、ストア（App Store Connect / Play Console）の操作は柴野だけがやる
- **main に直接 push しない。** ブランチを切って PR を出す
- **鍵をコミットしない。** リポジトリは公開（public）。`.env*` `*.p8` `*.p12` は `.gitignore` 済みだが、コードに直接書かない
  （Supabase の anon key と Firebase の設定ファイルは公開前提の値なので入っていてよい）

なぜ厳しいか: **Android アプリは `https://fanhive.jp` をそのまま表示している**。本番の Web を壊すと、配信中の Android アプリが即座に壊れる。

## コードを書くときの前提

- **Android と iOS で届き方が違う**（`capacitor.config.ts`）
  - Android … 本番の Web を開くだけ。Web を直せば即反映
  - iOS … ビルドに Web を同梱。Web を直しても**次の審査が通るまで iOS には届かない**
  - だから `api/` は**古い iOS の画面から呼ばれても壊れないように**変える（引数を消す・意味を変えるのは NG、足すのは OK）
- 使われていない古い画面がある: `src/pages/Calendar.tsx` `Discover.tsx` `Preorders.tsx` はルーティングされていない。
  実際のカレンダーは `src/components/SavedCalendar.tsx`。どこが表示されているかは `src/App.tsx` の Route を見る
- Vercel の無料プランは**関数が12個まで**で、今ちょうど12個。`api/` に新しいファイルを足すとデプロイが落ちる。
  共通部品は `_` で始まる名前にする（`api/_xxx.ts` は関数に数えられない）。新しい入口が要るときは既存の関数に相乗りする
- DB の変更は `sql/YYYY-MM-DD-内容.sql` に書いて PR に入れる。本番への適用は柴野がやる（PR に `needs:prod-sql` ラベル）
- 文言・コメントは日本語。既存のコードの書き方（命名・コメントの量）に合わせる

## PR を出す前に

- `npm run build` が通ること（GitHub Actions でも同じものが走る）
- 画面を変えたら、PR に付くプレビュー URL で実際に触って確かめる
- PR の説明に「何を・なぜ・どう確かめたか」を書く

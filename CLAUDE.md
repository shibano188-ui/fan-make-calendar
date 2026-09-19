# FanHive — チーム共通のルール

アニメ・キャラグッズの予定（発売・予約締切・イベント）をファンが投稿し、AIが整理して届けるアプリ。
Web（React + Vite）を Capacitor で包んで iOS / Android に出している。API は Vercel の関数（`api/`）、DB は Supabase。

最初に読むもの: `docs/SETUP.md`（動かすまで）→ `docs/WORKFLOW.md`（作業の流れ）→ `docs/GOTCHAS.md`（ハマりどころ）。
いまの全体像は `docs/STATUS.md`。使っているサービス（GitHub・Supabase・App Store Connect・Play Console・Vercel など）の
役割と、誰が何をできるかは `docs/SERVICES.md`。

## 本番の出し方と怖さ

- **main に入った時点で本番（`https://fanhive.jp`）に出る。** 4人とも main に push・マージできる
- **Android アプリは `https://fanhive.jp` をそのまま表示している。** 本番の Web を壊すと、配信中の Android アプリが即座に壊れる
- ビルドが通らない変更は Vercel が本番に出さない（前の版のまま動き続ける）。怖いのは**ビルドは通るが画面が壊れる**変更
- だから、main に入れる前に**必ずプレビューで触って確かめる**。壊したら `git revert` して push すれば数分で戻る

## やらないこと

- **鍵をコミットしない。** リポジトリは公開（public）。`.env*` `*.p8` `*.p12` は `.gitignore` 済みだが、コードに直接書かない
  （Supabase の anon key と Firebase の設定ファイルは公開前提の値なので入っていてよい）
- **本番の Supabase で、確かめていない SQL を流さない。** 先に開発用（`fanhive-dev`）で流して動きを見る
- `git push --force` と main の削除はできないようにしてある

## コードを書くときの前提

- **Android と iOS で届き方が違う**（`capacitor.config.ts`）
  - Android … 本番の Web を開くだけ。main に入れば即反映
  - iOS … ビルドに Web を同梱。Web を直しても**次の審査が通るまで iOS には届かない**
  - だから `api/` は**古い iOS の画面から呼ばれても壊れないように**変える（引数を消す・意味を変えるのは NG、足すのは OK）
- 使われていない古い画面がある: `src/pages/Calendar.tsx` `Discover.tsx` `Preorders.tsx` はルーティングされていない。
  実際のカレンダーは `src/components/SavedCalendar.tsx`。どこが表示されているかは `src/App.tsx` の Route を見る
- Vercel の無料プランは**関数が12個まで**で、今ちょうど12個。`api/` に新しいファイルを足すとデプロイが落ちる。
  共通部品は `_` で始まる名前にする（`api/_xxx.ts` は関数に数えられない）。新しい入口が要るときは既存の関数に相乗りする
- DB の変更は `sql/YYYY-MM-DD-内容.sql` に書いてコミットする。**本番に流したら PR かコミットにそう書く**（誰が流したか分からなくなるため）
- 環境変数の追加・変更と Vercel のログは柴野しか触れない（無料プランは1人用）。必要なら `needs:env` を付けて頼む
- 文言・コメントは日本語。既存のコードの書き方（命名・コメントの量）に合わせる

## main に入れる前に

- `npm run build` が通ること
- 画面を変えたら、プレビュー URL を**スマホで**触って確かめる
- **確かめたら、承認を待たずに自分でマージしてよい**（Claude も、作業を頼まれたらそのままマージまで進めてよい）
- 例外は次の4つだけ。PR にして誰か1人に見てもらってからマージする（詳しくは `docs/WORKFLOW.md` の「4. 本番に出す」）
  - 本番の DB のデータや構造を消す・書き換える（足すだけなら当たらない）
  - `api/` の引数を消す・意味を変える
  - お金・ログイン・アカウント削除・通知の配信に触る
  - 環境変数・外部サービスの設定が要る

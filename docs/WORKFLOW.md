# 作業の流れ

4人とも本番に出せる。そのぶん「main に入れる前にプレビューで確かめる」を守る。

## 1. やることを決める — GitHub Issues

- やりたいこと・直したいことは Issue にする
- 自分が手を付けるときは **Assignees に自分を入れる**（＝「触るな」の合図。同じところを二人で直すのを防ぐ）
- 小さく切る。1つの Issue は1〜2日で終わる大きさ

## 2. 直す — ブランチ

```sh
git switch main && git pull
git switch -c fix/投稿画面の文言    # feat/… fix/… chore/… docs/…
# 直す
npm run build                       # 通ることを確かめる
git add -A && git commit -m "fix(post): 投稿画面の文言を直す"
git push -u origin HEAD
```

コミットメッセージは `種類(場所): 何をしたか` を日本語で（`git log` を見ると例がたくさんある）。

## 3. 確かめる — プレビュー

push すると数分で Vercel がプレビューを作る。
`https://fan-make-calendar-git-<ブランチ名>-shibano-s-projects.vercel.app`（PR を作ると URL が自動で付く。ブランチ名が長いと URL が短縮されるので、PR の URL を使うのが確実）。
**スマホで触って確かめる。** プレビューは開発用の DB につながっているので、投稿・いいねを試してよい。

## 4. 本番に出す — main に入れる

**基本は自分でマージしてよい。** `npm run build` が通り、プレビューをスマホで触って確かめたら、誰かの承認を待たずに入れる。
新しい機能・画面の作り直しも、ここに当てはまる。

**次のどれかに当たるときだけ**、PR にして誰か1人に見てもらってからマージする。

- 本番の DB の**データや構造を消す・書き換える**（表や列を消す、既存の行をまとめて更新する、RLS を緩める）。
  表や列を足すだけなら当たらない（ただし「DB を変えるとき」の手順は守る）
- `api/` の**引数を消す・意味を変える**（古い iOS から呼ばれて壊れる。足すのは当たらない）
- **お金・ログイン・アカウント削除・通知の配信**に触る（課金・RevenueCat・会員状態、Supabase の認証、`api/delete-account.ts`、プッシュの送り先）
- **環境変数・外部サービスの設定**が要る（下の `needs:env`）

迷ったら自分でマージしてよい。壊しても下の「壊したら」で数分で戻せる。
- マージした時点で本番に出て、Android にもすぐ届く。**出したら本番（`https://fanhive.jp`）をスマホで開いて確かめる**
- iOS には次のアプリ更新（審査）で届く。アプリのビルドと提出は柴野

### DB を変えるとき
1. `sql/YYYY-MM-DD-内容.sql` を書く
2. 開発用（`fanhive-dev`）の SQL Editor で流して、プレビューで動きを確かめる
3. 本番の SQL Editor で流す → **コミットか PR に「本番に流した」と書く**
4. コードをマージする（列を足すなら、SQL が先・コードが後）

### 環境変数が要るとき
Vercel は柴野しか触れない。PR に `needs:env` を付けて頼む。

## 壊したら

```sh
git switch main && git pull
git revert <壊したコミット>   # マージを戻すときは: git revert -m 1 <マージコミット>
git push
```
数分で本番が元に戻る。慌てず、チャットで一言知らせる。

## LP（ランディングページ）

LP は `public/lp.html`（`https://fanhive.jp/lp.html`）。アプリと同じリポジトリ・同じデプロイで出ている。

- **デザインツールの書き出し（バンドル形式）**。画面の文字・計測・アニメは、末尾の `<script type="__bundler/template">` の JSON 文字列の中にある
- 画像・フォントは `public/lp/`（Service Worker の先読みから外してある）
- 書き出し直したら `node scripts/lp-og-tags.mjs` → `npm run build` の順に流してからコミットする。
  文字だけ直したときも `lp-og-tags.mjs` は流す（`<head>` の `lp-og-tags` の間＝X のカードはここを見る。手で直さない）
  書き出しにフォントが埋め込まれていたら（lp.html が数MBになる）、先に `python scripts/lp-fonts.py` で外す
- **フォントは Zen Maru Gothic の 500 と 900 を、LP で使っている字だけにして自分で配る**（`public/lp/fonts/zen-maru-gothic-*.woff2`）。
  **文言を変えたら `python scripts/lp-fonts-zen.py <元のフォントのフォルダ>` を流し**、表示された `?v=` をテンプレートの `@font-face` に書く
  （流さないと、新しく使った字だけ端末の書体で出る）。Google Fonts には取りに行かない（測ったら約665KB・49本で重かった）。
  `noto-sans-jp-*.woff2` は `press.html` が使っている
- **動き**: 最初の画面は CSS のアニメ（ずっと続くものは、最初の画面が見えていないとき・タブが裏のときは止める）。
  「困りごと」「共有するだけ」はスクロールに合わせて動く。JS は進み具合を場面の `--p` に入れるだけで、動きは CSS で transform と opacity だけを計算する。
  1つの要素に transform の動きを2つ付けない（Chrome が合成で動かせず、毎フレーム計算し直す）。「動きを減らす」設定では止まった形を出す
- **色は `--bg` #ECECEC・`--honey` #EF8F00・`--ink` #5A1F3D の3つだけ**。グラデーション・白・半透明・影は使わない。
  文字は `--ink`、はちみつ色の上の文字は太字12px以上。最初の画面の動きの元は `docs/design/lp-hero-flower.html`
- 見た目の確認は `node scripts/lp-shots/page.mjs --out=<フォルダ>`（390px と 1280px で画面1枚ずつ撮る。`--reduce` で「動きを減らす」設定）
- **計測を壊さない**: `sendEvent`・`track`・`storeClick`・`trackPageViewOnce`・`applyMeta` は残す。ストアのボタンは必ず `storeClick(store, placement)` を通す。
  placement（`hero`/`mid`/`footer`）の意味は変えない。ボタンを足すなら新しい placement にして、ダッシュボードの `LP_PLACE`（`api/_dashboard-html.ts`）にも足す。
  `/lp.html` の名前は変えない（配った `?src=` 付きのリンクが切れる）。仕組みは `sql/2026-09-30-lp-daily.sql`
- 料金・通知の説明は `src/lib/premium.ts` の実装に合わせる。料金欄の表は、アプリの `src/pages/Premium.tsx` の「無料と比べる」と同じ8行・同じ言い回しにしてある（アプリを変えたら LP も）

## 困ったら

- 仕組みのハマりどころ → `docs/GOTCHAS.md`
- 分からないことは Issue にコメントするか、チャットで聞く

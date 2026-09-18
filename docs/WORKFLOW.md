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
`https://fan-make-calendar-git-<ブランチ名>-shibano-s-projects.vercel.app`（PR を作ると URL が自動で付く）。
**スマホで触って確かめる。** プレビューは開発用の DB につながっているので、投稿・いいねを試してよい。

## 4. 本番に出す — main に入れる

- 小さい修正（文言・見た目の微調整）… 自分でマージしてよい
- 大きい変更・DB を変える・`api/` を変える … PR にして誰か1人に見てもらってからマージ
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

アプリとは別のプロジェクトにして `fanhive.jp` の下のパスで出す予定（作ったらここに追記する）。

## 困ったら

- 仕組みのハマりどころ → `docs/GOTCHAS.md`
- 分からないことは Issue にコメントするか、チャットで聞く

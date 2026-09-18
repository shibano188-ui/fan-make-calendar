# ハマりどころ

過去に実際に踏んだものだけを書く。増えたら足す。

## 配信の仕組み

- **Android はリモート、iOS は同梱**（`capacitor.config.ts`）。「Web を直したから全員に届いた」は Android だけの話
- `npx cap sync` はプラットフォームを省かない。`npm run sync:ios` / `npm run sync:android` を使う
  （省くと Android が「本番の Web を開かないアプリ」になり、更新が届かなくなる）
- Capacitor のプラグインを足したときだけ Android も作り直しが要る。古いアプリで呼ばれても落ちないよう
  `Capacitor.isPluginAvailable('X')` で確かめてから使う

## Vercel

- 無料プランは**関数12個まで**（今12個）。`api/_xxx.ts` のように `_` で始めれば数えられない
- 定期実行（Cron）も2本まで（`refresh-offers` と `metrics`）で空きがない。毎日動かしたいものは `api/metrics.ts` の Cron に相乗りする
- コミットの作者メールが GitHub アカウントに紐づいていないと、デプロイが「Blocked」になる。
  `git config user.email` を GitHub に登録したメール（または `<id>+<user>@users.noreply.github.com`）にする

## Supabase

- REST（`supabase.from(...)`）は**1回に最大1000行**しか返さない。全件が要るときは `.range()` でページ送りする
- `revoke ... from public` は service_role の権限も落とす。権限を絞るときはロールを名指しする
- SQL Editor は `$$` が2組ある SQL を壊すことがある。関数の本体は `$fn$` のように名前付きの区切りにする
- 表の列を増やしたら、**古い iOS アプリがその列を知らなくても動くか**を考える（必須にしない・既定値を持たせる）

## 画面（iOS Safari / WebView）

- 下から出るパネルの中をスクロールさせるときは `flex: 1` に頼らない。
  `position: absolute; top: Xpx; bottom: 0; overflow-y: scroll;` で高さを決める
- `lucide-react` の `Map` アイコンは JS の `Map` を上書きする。`import { Map as MapIcon }` と別名にする

# Claude Code プロンプト集

このファイルには、Claude Codeに段階的に投げるプロンプトをまとめています。
上から順番に使ってください。

---

## フェーズ1: ローカル動作版

### プロンプト1-A: プロジェクト初期化

```
このディレクトリに、「Fan Make Calendar」というWebアプリを作ります。
詳細仕様は SPECIFICATION.md を読んでください。
モック画像が mocks/ ディレクトリにあるので、デザインの雰囲気の参考にしてください。
ただしピクセル単位の再現は不要で、仕様書の方針(無彩色・装飾最小・ダークテーマ)を優先してください。

まず以下を行ってください:
1. Vite + React + TypeScript でプロジェクトを初期化
2. Tailwind CSS をセットアップ
3. React Router v6 をインストール
4. 仕様書の5画面に対応するルーティングを設定(まずは空のコンポーネントでOK)
5. README.md を作成して、開発手順を書く

完了したら `npm run dev` で起動できる状態にしてください。
```

### プロンプト1-B: 基本レイアウトとデザインシステム

```
基本のデザインシステムを作ります。

1. tailwind.config.js でカスタムカラーを定義:
   - background.primary: #1a1a1a (ダーク基調)
   - background.secondary: #2a2a2a
   - text.primary: #ffffff
   - text.secondary: #aaaaaa
   - text.tertiary: #666666
   - border: rgba(255,255,255,0.1)
2. src/components/Layout.tsx を作成。スマホ幅(max-w-md程度)で中央寄せ、ダーク背景
3. src/components/BottomTab.tsx を作成。「作品 / カレンダー / 設定」の3タブ、下部固定
4. src/components/Header.tsx を作成。戻るボタン・タイトル・右側アクションの3カラム

アイコンには lucide-react を使ってください。
```

### プロンプト1-C: 作品選択画面

```
作品選択画面(/)を実装してください。

仕様:
- 上部に「作品を選ぶ」見出しと「入りたいカレンダーを検索」のサブ
- 検索ボックス: 検索アイコン + プレースホルダー「作品名で検索」
- 「最近開いた」セクション: localStorage の `recent_works` から読み込み
- 「人気のカレンダー」セクション: 暫定でハードコードしたダミーデータ
- 各項目: 作品名(太字) + 「参加者 N人」(小さくグレー) + 右に > アイコン
- タップで /calendar/:workId に遷移し、recent_works に追加

ダミーデータ:
const popularWorks = [
  { id: 'workA', name: '作品A', count: 1284 },
  { id: 'workB', name: '作品B', count: 482 },
  { id: 'workC', name: '作品C', count: 8912 },
  { id: 'workD', name: '作品D', count: 3156 },
];

localStorage のキー設計:
- `recent_works`: { id, name, last_visited_at }[] のJSON文字列

下部にBottomTabを表示。
```

### プロンプト1-D: カレンダー画面

```
カレンダー画面(/calendar/:workId)を実装してください。

仕様:
- ヘッダー: 戻る / 作品名 + 「2026年 5月」/ 右にカスタマイズボタン(パレットアイコン)
- 月ビュー: 日曜始まり、7列x6行のグリッド
  - 各セルは正方形、日付の数字を中央表示
  - 今日(今日の日付と比較)は塗りつぶしで強調
  - 予定がある日は数字の下に小さなドット
  - 前月・翌月の日付はグレーで薄く表示
  - セルタップで /calendar/:workId/date/:date に遷移
- 「今月の予定」リスト: 各カードに以下を表示
  - 左に日付ボックス(月+日)
  - 中央にタイトル
  - 下に ♡ + いいね数
  - タップで日付詳細へ
- 右下にFAB(浮動アクションボタン): + アイコン、タップで投稿画面へ

データはlocalStorage の `events:${workId}` から読み込み:
type Event = {
  id: string;
  title: string;
  date: string; // 'YYYY-MM-DD'
  time?: string; // 'HH:mm'
  category?: string;
  link?: string;
  memo?: string;
  likes: number;
  likedByMe: boolean;
  createdAt: string;
};

初期表示用のダミーイベントを3つ程度入れておいてください。
```

### プロンプト1-E: 日付詳細画面

```
日付詳細画面(/calendar/:workId/date/:date)を実装してください。

仕様:
- ヘッダー: 戻る / 「5月12日」のような日付表示
- 「この日の予定」セクション
- 該当日のイベントをカードとして縦に並べる
- 各カード:
  - 上: タイトル(太字) と 時間(右寄せ)
  - メモ(あれば)
  - リンクチップ(複数): 角丸ボタン風、外部リンクアイコン + URLのドメインまたはラベル
  - 投稿者情報: 「投稿者 匿名 ・ N日前」(小さくグレー)
  - いいねボタン: 角丸ボーダー、♡ + 数字。タップでトグル(連打防止)
- 該当日のイベントが0件の場合は「この日の予定はまだありません」と表示

データはlocalStorageから。
```

### プロンプト1-F: 投稿作成画面

```
投稿作成画面(/calendar/:workId/post)を実装してください。

仕様:
- ヘッダー: × 閉じる / 「予定を追加」/ 「投稿」ボタン
- 予定カード(複数追加可能):
  - カードのヘッダー: 「予定 N: タイトル」+ × 削除 + ▼ 折りたたみ
  - 折りたたみ時はヘッダーのみ表示
  - 展開時のフォーム:
    - タイトル: text input
    - 日付/時間: 2カラム(date input, time input)
    - カテゴリ: タグボタン(単行本/グッズ/イベント/誕生日/配信)、1つ選択
    - リンク(任意): URL input
    - メモ(任意): textarea
- 「+ 別の予定を追加」ボタン: タップで新規カード追加
- 投稿ボタン: 全カードをlocalStorageに保存してカレンダー画面へ戻る
- カードが1枚の場合は × 削除ボタンを無効化

タイトル変更時、カードヘッダーの「予定 N: ...」の部分も即時更新。
```

### プロンプト1-G: カスタマイズ画面

```
カスタマイズ画面(/customize)を実装してください。

仕様:
- ヘッダー: 戻る / 「カスタマイズ」
- テーマセクション: 3つのカードを横並び(シンプル/ダーク/作品A 公式)
  - 各カードは選択時にボーダーまたは背景色で強調
- フォントセクション: ラジオボタンのリスト
  - システム標準 / 明朝体 / 丸ゴシック / 独自フォント (未設定)
  - 「フォントファイルをアップロード」ボタン
  - .ttf/.otf/.woff を受け付ける input type="file"
  - アップロードしたフォントは @font-face で動的に適用
- アクセントカラー: 6つのカラードット(円形)
  - #2C2C2A / #888780 / #D85A30 / #1D9E75 / #378ADD / #D4537E
  - 選択時はリング(outline)で強調
- 背景画像: 「画像をアップロード」ボタン
  - input type="file" accept="image/*"
- 「このテーマを共有」セクション(フェーズ3で実装するため、UIだけ作成、機能はalert)

設定はlocalStorage の `user_settings` に保存。
適用後は他画面にも反映されるよう、Context APIで管理してください。
```

### プロンプト1-H: フェーズ1 仕上げ

```
フェーズ1の仕上げをしてください。

1. 全画面の動作を確認し、画面遷移がスムーズかチェック
2. 空状態のUI(イベントゼロ、検索結果ゼロなど)を追加
3. ローディング状態は今はなし(全部同期処理なので)
4. レスポンシブ: 480px以上は中央寄せ、両側に余白
5. README.md を更新して、各画面のスクリーンショット撮影手順や開発のヒントを書く

ここまでで、自分用カレンダーアプリとして完全に動作する状態にしてください。
```

---

## フェーズ2: Supabase接続

### 事前作業(あなたが行う)

1. https://supabase.com でアカウント作成、新規プロジェクト作成
2. SPECIFICATION.md の「データモデル」のSQLを SQL Editor で実行
3. Project Settings > API から URL と anon key をコピー
4. プロジェクトルートに .env.local を作成:
   ```
   VITE_SUPABASE_URL=https://xxxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=xxxxx
   ```
5. Authentication > Settings で「Enable anonymous sign-ins」を有効化

### プロンプト2-A: Supabase接続

```
Supabaseと接続します。事前作業で .env.local にURLとキーを設定済みです。

1. @supabase/supabase-js をインストール
2. src/lib/supabase.ts でクライアントを初期化
3. アプリ起動時に匿名サインインを実行する仕組みを作る(useAuth フック)
4. ログイン状態のuser.idを取得できるようにする

匿名認証で取得したuser.idを、各データ操作で使ってください。
```

### プロンプト2-B: 作品とイベントをSupabaseに移行

```
localStorage から Supabase にデータ操作を移行してください。

1. src/lib/api.ts に以下のAPI関数を作成:
   - listWorks(): 全作品リスト
   - searchWorks(query): 作品検索
   - getWorkById(id): 作品取得
   - listEvents(workId, yearMonth): その月のイベント
   - createEvents(workId, events[]): 複数イベントの一括投稿
   - getEvent(eventId): 単一イベント取得
2. 各画面でlocalStorageの代わりに上記APIを呼ぶ
3. データ取得中はローディング状態を表示(シンプルなスケルトンか「読み込み中...」)
4. エラーハンドリング: try/catchでエラーキャッチ、画面下部にトースト表示

参加履歴(recent_works)は participations テーブルに保存。
作品が存在しない場合は新規作成(検索で見つからなくても入力可能にする)。
```

### プロンプト2-C: いいね機能とユーザー設定

```
いいね機能とユーザー設定もSupabaseに移行してください。

1. いいね機能:
   - toggleLike(eventId): いいねの追加/削除
   - likesテーブルに(event_id, user_id)で記録
   - eventsテーブルのlike_countは triggers でリアルタイム更新するか、
     APIで都度集計するか選択(MVPでは後者でOK)
   - 自分がいいねしたかどうかは likes テーブルから取得
2. ユーザー設定:
   - getUserSettings(): 設定取得
   - updateUserSettings(settings): 設定更新
   - カスタマイズ画面と接続
   - 起動時に設定を読み込んで適用
3. 重複投稿の救済(MVP版):
   - 投稿時に同じ(work_id, event_date, title)のイベントを検索
   - 既に存在する場合、新規eventのpoolに現在のpool最大値+1を設定
   - 表示時はuser_idのハッシュでpoolを決定的に選択
   - 表示する代表eventはpool値で振り分けられたもの
```

---

## フェーズ3: 仕上げ

### プロンプト3-A: ウィジェット風ページ

```
ウィジェット風の埋め込みページを追加してください。

1. /widget/countdown/:workId?eventId=xxx
   - 全画面表示、ヘッダー/タブバーなし
   - 中央に大きく残り日数「3 days」
   - 下にイベント名と日付
   - 背景は透明 or ユーザー設定の背景画像
2. /widget/today/:workId
   - 今日の日付を大きく表示
   - 最も近い予定を下に表示
3. /widget/month/:workId
   - 月ビューカレンダーを全画面で表示

これらは iframe で外部サイトに埋め込める想定。
URLパラメータでテーマ(?theme=light など)を指定可能に。
```

### プロンプト3-B: テーマ共有

```
カスタマイズ画面の「このテーマを共有」機能を実装してください。

1. shared_themes テーブルに現在の設定を保存
2. /themes ページで他のユーザーのテーマ一覧を表示
3. 「このテーマを使う」ボタンで自分の設定に適用
4. use_count をインクリメント

共有時、作品との紐付けはoptional(全作品で使える/特定作品向け)。
```

### プロンプト3-C: 最終仕上げ

```
最終仕上げをしてください。

1. PWAサポート: manifest.json と service worker(vite-plugin-pwa)
2. メタタグ: OGP, favicon
3. エラー画面(404)
4. パフォーマンス: 画像の遅延読み込み、React.lazy で画面分割
5. デプロイ手順を README に記載(Vercel または Netlify)
6. アクセシビリティ: aria-label, キーボード操作対応
```

---

## デバッグ・修正用プロンプト例

```
[特定の画面/機能]が[こうなる/期待した動作にならない]。
原因を調べて修正してください。
コードに加えた変更点を最後にまとめてください。
```

```
[ファイルパス]のコードをレビューしてください。
- 型安全性
- パフォーマンス
- 可読性
の観点で改善できる箇所があれば指摘してください。
```

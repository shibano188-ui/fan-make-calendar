# Fan Make Calendar - 仕様書

## 概要

好きな作品のファン同士が集まって、1つの共有カレンダーを協力して作り上げるWebアプリ。
初期ターゲットは漫画・アニメ作品。単独利用でも完成度の高いカレンダーアプリとして成立し、
共有機能はその上に重なる形。

## 技術スタック

- **フロントエンド**: Vite + React 18 + TypeScript
- **スタイリング**: Tailwind CSS
- **状態管理**: React Context + hooks（小規模のためZustand等は不要）
- **ルーティング**: React Router v6
- **データ保存**: Supabase（PostgreSQL + Auth + Realtime）
- **認証**: Supabase Anonymous Auth（匿名認証）
- **デプロイ想定**: Vercel または Netlify

## デザイン原則

- **無彩色ベース**: 白・黒・グレーを基調、デフォルトはシンプルで使いやすいUI
- **装飾は最小限**: 影は控えめ、ボーダーは0.5pxの薄いグレー
- **ダークテーマがデフォルト**: 提供されたモック画像はダークテーマで、これに合わせる
- **AIらしさを消す**: 派手なグラデーション、絵文字の多用、ビビッドな色は避ける
- **タイポグラフィ**: システムフォントが基本。ユーザーが切り替え可能
- **角丸は控えめ**: 8〜12px程度。過度な丸みは避ける

## 画面構成

### 1. 作品選択画面 `/`
- タイトル「作品を選ぶ」
- 検索ボックス「作品名で検索」
- 「最近開いた」セクション(参加履歴のある作品)
- 「人気のカレンダー」セクション(参加者数の多い作品)
- 各項目は作品名と参加者数を表示
- タップで該当作品のカレンダー画面に遷移

### 2. カレンダー画面 `/calendar/:workId`
- ヘッダー: 戻るボタン / 作品名と年月 / カスタマイズボタン
- 月ビューカレンダー(7列、6行)
   - 今日の日付は塗りつぶしで強調
   - 予定がある日にはドット表示
   - 前月・翌月の日付は薄く表示
- 「今月の予定」リスト(下にスクロール)
   - 各予定: 日付ボックス + タイトル + いいね数
   - タップで日付詳細画面へ
- FABボタン(右下): 予定追加 → 投稿作成画面へ
- 下部タブバー: 作品 / カレンダー / 設定

### 3. 日付詳細画面 `/calendar/:workId/date/:date`
- ヘッダー: 戻るボタン / 「5月12日」のような日付表示
- 「この日の予定」セクション
- 予定カード(複数並ぶ)
   - タイトル + 時間
   - メモ
   - リンクチップ(Amazon / 公式X 等、複数並ぶ)
   - 投稿者情報(匿名 ・ N日前)
   - いいねボタン(タップでカウント増減、再度タップで取り消し)

### 4. 投稿作成画面 `/calendar/:workId/post`
- ヘッダー: 閉じる × / 「予定を追加」/ 投稿ボタン
- 予定カード(複数追加可能、各カードは折りたたみ式)
   - タイトル(テキスト)
   - 日付(date input) / 時間(time input) を2カラム
   - カテゴリ(タグ選択: 単行本 / グッズ / イベント / 誕生日 / 配信)
   - リンク(任意、URL入力)
   - メモ(任意、textarea)
- 「+ 別の予定を追加」ボタン: 新規カードを追加
- カードのヘッダー部分タップで折りたたみ
- カードの×ボタンで削除(最後の1枚は削除不可)
- 投稿ボタン: 全カードをまとめて投稿してカレンダー画面へ

### 5. カスタマイズ画面 `/customize`
- ヘッダー: 戻るボタン / 「カスタマイズ」
- **テーマ**: シンプル / ダーク / 作品公式(プリセット選択)
- **フォント**: ラジオボタン
   - システム標準 / 明朝体 / 丸ゴシック / 独自フォント(.ttf/.otf/.woff アップロード)
- **アクセントカラー**: 6色から選択
- **背景画像**: アップロードボタン
- **このテーマを共有**: 他ユーザーが使えるようにする(フェーズ3で実装)

## データモデル

### Supabase テーブル設計

```sql
-- 作品
create table works (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  participant_count int default 0,
  created_at timestamptz default now()
);

-- 予定(イベント)
create table events (
  id uuid primary key default gen_random_uuid(),
  work_id uuid references works(id) on delete cascade,
  title text not null,
  event_date date not null,
  event_time time,
  category text, -- '単行本' | 'グッズ' | 'イベント' | '誕生日' | '配信'
  link_url text,
  memo text,
  author_id uuid not null, -- 匿名ユーザーID(Supabase auth.uid())
  like_count int default 0,
  pool int default 0, -- 重複投稿の救済用、別プール識別子
  created_at timestamptz default now()
);

-- いいね
create table likes (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references events(id) on delete cascade,
  user_id uuid not null,
  created_at timestamptz default now(),
  unique(event_id, user_id)
);

-- 参加(どの作品を見ているかの履歴)
create table participations (
  id uuid primary key default gen_random_uuid(),
  work_id uuid references works(id) on delete cascade,
  user_id uuid not null,
  last_visited_at timestamptz default now(),
  unique(work_id, user_id)
);

-- ユーザー設定(カスタマイズ)
create table user_settings (
  user_id uuid primary key,
  theme text default 'simple', -- 'simple' | 'dark' | custom
  font text default 'system',
  accent_color text default '#2C2C2A',
  background_image_url text,
  custom_font_url text,
  updated_at timestamptz default now()
);

-- 共有テーマ(フェーズ3)
create table shared_themes (
  id uuid primary key default gen_random_uuid(),
  work_id uuid references works(id),
  author_id uuid not null,
  name text,
  theme_data jsonb, -- {theme, font, accent_color, background_image_url, custom_font_url}
  use_count int default 0,
  created_at timestamptz default now()
);
```

### 重要な仕様: 重複投稿の救済

同じ予定を別のユーザーが投稿しても、両方の投稿者にいいねが入る仕組み。
ユーザーには意識させず、裏で処理する。

**実装方針:**
- 投稿時、同じ`work_id`/`event_date`/`title`(類似度)を持つ既存eventを検索
- 似た投稿が既にある場合、新規eventの`pool`に別の値を割り当てる(例: pool=1, 2, 3...)
- カレンダー表示時は`pool=0`(代表)のみ表示、他のpoolは内部的に存在
- いいねは閲覧中のユーザーの`pool`に応じて振り分けて加算する
- 「どのpoolを見るか」はユーザーIDをハッシュして決定的に振り分け

MVPでは類似判定を完全一致で簡略化し、より洗練された実装はフェーズ3以降。

## 動機づけ設計の実装ポイント

- **いいねは「する/しない」の二択のみ**: 低評価ボタンやコメント欄は作らない
- **メッセージのやり取りはなし**: いいね数の数字だけ表示
- **匿名性を維持**: 投稿者は常に「匿名」と表示。ユーザー名やアバターは表示しない
- **同志の存在感**: 「投稿者◯人 / いいね合計◯件」のような数字でうっすら見せる

## カウントダウンウィジェット

Webアプリでは「ウィジェット風の埋め込み用ページ」として実装する。

- ルート: `/widget/countdown/:workId/:eventId`
- 全画面表示、最小限のUIで「あと◯日 / 単行本15巻 / 5月24日 発売」を表示
- iframe等で外部サイトに埋め込める想定

## レスポンシブ

- 基本はスマホファースト(320px〜420px)
- タブレット・PC幅では中央に幅400px程度で表示し、両側に余白
- 実装は max-width: 480px くらいに留めて、中央寄せ

## 将来的な拡張(現時点では実装しない)

- Xポストのコピペで自動的にイベント化(AI解析)
- リアルタイム同期(Supabase Realtime)
- 通知機能
- ネイティブアプリ化(React Native等)

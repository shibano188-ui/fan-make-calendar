# FanHive ピボット 再構築 実装計画

> 設計の全文は Obsidian `Projects/fanhive-pivot-app-structure.md`、数字は `Decisions/2026-06-20-fanhive-arpu-cac.md`。本書は「明日から順に手を動かす」ための実装順序。

## 0. 大方針
- **設計思想と調査したデザイン（メルカリ/Airbnb/Fantastical/Duolingo/Instagram）を最優先**。main の UI/IA には引っ張られない。
- **データ層（Supabase + `src/lib/api.ts` + `api/`）は維持** ＝ 既存の投稿済み・保存済み予定がそのまま使える。
- **UI/IA/デザイン層はクリーンに作り直す**。共通部品を使い回して保守性を上げる。
- 新サーバーは不要（データ保全の観点でも Supabase 継続が最適）。

## 1. アーキテクチャ判断
同一リポジトリ・同一スタック（Vite + React + TS + Tailwind + Supabase + Capacitor8）。レイヤを3つに分ける：
- **keep（無改修で使う）**: `api/*`（parse-event 等）、`src/lib/*`（api, supabase, reactions, achievements, haptics, color, prefectures, url, swrCache, admob）
- **rebuild（作り直す）**: `src/pages/*`、`src/components/*`、ルーティング（App.tsx）、デザインシステム
- **new（新規）**: デザイントークン、探す/ホーム/いいね/詳細/投稿の新画面、アフィリンク変換器、作品名寄せ、通知、（後）共同編集・外部カレンダー連携

## 2. 再利用インベントリ
### 持ってくる
- **データAPI**: `lib/api.ts` ほぼ全部 — works / events / likes / reactions / participation(=フォロー) / userSettings / achievements stats / **findDuplicateEvents(重複検知)** / **reportEvent(モデレーション)**
- **AI**: `api/parse-event.ts`（入口を URL/写真/共有 に拡張、プロンプトのキャッシュ構造は流用）
- **演出**: `hooks/useLikeAnimation`、`lib/haptics`、`lib/reactions`、`lib/achievements`(+recharts レーダー)
- **共有受け取り**: `pages/ShareTarget` + SendIntent（App.tsx の AndroidShareHandler）
- **インフラ**: `lib/supabase`、`lib/admob`、`api/_ratelimit`
### 捨てる / 置換
- Calendar 中心の IA（home=Calendar, `pages/Calendar.tsx`, 月グリッド, widgets 群は MVP 外）
- 旧 `EventTile / Header / Layout / CategoryChips` → 新デザインシステムで作り直し

## 3. データモデル拡張（既存を壊さず）
`sql/` に追記。**既存行が無変更で動くよう default を付ける**。
- `events.type text default 'event'` … 既存約190件は自動で event 扱い＝そのまま「探す」に出る
- `events.price int null` / `events.stock_note text null`（グッズ用）
- `events.retailer text null` / `events.affiliate_url text null` / `events.has_affiliate bool default false`（アフィ）
- `works.aliases text[] default '{}'`（名寄せ／別名は AI で種生成）
- 後フェーズ新規テーブル: `event_edits`(共同編集履歴), `notifications`
- ※「保存(いいね)」は既存 likes で代替可能か Phase1 で確認。足りなければ `saves` を追加。

## 4. デザインシステム（調査結果を実装に）— 最初に作る
`src/design/` に集約。これを先に作れば以後の画面が全部これで組める＝保守性。
- **tokens**: 色（白/淡グレー base + アクセント1 + 状態色5: 青🔵/橙🟠/紫🟣/緑🟢/灰⚪）、余白（メルカリ流に詰める）、角丸（ボタンのみ・画像は四角）、タイポ（価格を最強に）
- **共通コンポーネント**: `ItemCard`(grid/list 両対応), `StatusBadge`, `FilterBar`(Airbnb式・横バー), `FilterSheet`(フルスクリーン・件数表示), `Chip`, `BottomNav`, `ActionBar`, `ReactionBar`, `LikeButton`(burst+haptic= useLikeAnimation 流用), `Skeleton`, `RewardOverlay`(Duolingo式 達成演出), `NLDateInput`(Fantastical式 自然文＋プレビュー)

## 5. 実装順序（明日から順に）
### Phase 0 — 土台
1. デザイントークン（`src/design/tokens.ts` + Tailwind 拡張）
2. 共通コンポーネントの器（上記）をスタブで用意
3. データ層の配線確認（`lib/api.ts` がそのまま叩けるか・型に type/price/stock 追加）
4. ルーティング刷新（App.tsx を 探す/ホーム/いいね/マイページ + 中央＋ の BottomNav に）

### Phase 1 — 探す（収益の本体・最初に見える成果）
- 2列グリッド(グッズ)/1列リスト(イベント)、グッズ⇄イベントトグル
- `FilterBar`(作品/種別/状態) + `FilterSheet`、検索常時固定、折りたたみ
- **今日起点並び**＋過去は上スクロール＋`⤓今日`ボタン、新着順も
- `ItemCard`: 画像四角・価格最強・`StatusBadge`・♡/＋/↗(直リンク)/🙏
- DB マイグレーション(type/price/stock) 適用 → 既存予定が出ることを確認

### Phase 2 — 詳細
- 画像 → 価格(大) → 状態 → **濃色購入CTA(=アフィリンク)** → 在庫 → メモ → 販路ボタン複数 → 投稿者/信頼度 → 関連
- `ReactionBar` + 固定 `ActionBar`(♡/＋)

### Phase 3 — 投稿フォーム + アフィリンク変換器
- 全画面、種別トグル、AI入口4つ(📷/🔗/📋/↗共有)＝ShareTarget/parse-event 流用・拡張
- 複数アイテム分割、画像自動取得、`NLDateInput`、既存機能維持(終日/日付未定/時間)
- 在庫メモ・メモは ＋ で展開、ソフトリンク運用、**投稿で自動フォロー**
- **アフィリンク変換器**(`src/lib/affiliate.ts` + config): ドメイン判定 → Amazon(タグ付与)/楽天(API)/VC(LinkSwitch) / 非対応は has_affiliate=false

### Phase 4 — ホーム（おすすめ）
- 横断検索 + セクション横スク([PR] / もうすぐ受付開始 / フォロー作品の新着 / 近くのイベント / 人気)
- レコメンド軸 = フォロー作品 + 地域 + いいね履歴
- **コールドスタート**: フォロー0人は作品選択オンボーディング(WorkSelect 流用)

### Phase 5 — いいね(保存)タブ + マイページ
- いいね: ウォッチリスト、探すと同じ折りたたみ絞り込み、近い順、自分の投稿は絞り込み1項目
- マイページ: **既存 achievements / recharts レーダーをそのまま**、設定ハブ化(通知/地域/プレミアム/フォロー管理)

### Phase 6 — 通知
- ダイジェスト(1日1回まとめ)、リードタイム一括設定、個別ON/OFF、静かな時間帯、キャップ

### Phase 7+（後フェーズ）
- 共同編集・信頼性(編集履歴+revert / 信頼度ティア / リンク追記の安全装置)
- 外部カレンダー連携(OAuth 双方向 or ICS)
- 作品マージ(名寄せ運用)、イベント↔グッズ紐付けの個別グッズ化

## 6. 保留の技術判断（推奨デフォルトで進める／変えたければ指示）
- **外部カレンダー連携**: 当面「アプリ内 保存」のみ。＋は保存に入れる。OAuth 同期は Phase7。
- **ASP アカウント（取得可否 確認済み 2026-06-21・運営者22歳=18歳以上クリア）**:
  - ✅ **楽天 / A8.net = 今すぐ取れる**（審査なし・サイト無しでも可）。→ Day1から動くアフィリンクを用意。
  - ⚠️ **Amazon（180日3件＋コンテンツ）/ バリューコマース（自己運営サイト＋コンテンツ・会員制/未完成NG）/ アクセストレード = Web公開後に申請**。Phase1 の公開Web「探す」を審査媒体として提出すれば要件を満たす（実装と審査が同方向）。
  - 🔺 リンクシェア（チケットぴあ）/ メーカー直接交渉(B2B送客) = 規模が出てから。LLPなら法人名義申請も選択肢。
  - 変換器は config 駆動で先に作り、取得順（楽天→A8→VC/Amazon）にタグ/IDを差す。無駄にならない。
- **アフィリンク変換の実体**: Web は LinkSwitch(JSタグ)、Capacitor ネイティブは 楽天API / Amazon タグ付与を `api/` 側で。

## 7. 既存予定の保全（明示）
- Supabase `events` はそのまま。`type default 'event'` で既存約190件が新「探す」に出る。
- 既存 preorder/受注フラグ → 新「状態バッジ(予約・受注中 等)」に自動マッピング。
- works 参加 → 新「フォロー」にそのまま。

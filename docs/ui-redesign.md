# FanHive UI リデザイン設計書

> 目的: 現在のUIから「AI感」を排除し、iOSのような洗練された直感的なデザインに刷新する。
> **機能は一切変更しない。** 見た目・操作感のみを変える。
>
> ブランチ: `feature/ios-ui-redesign`（Vercel が自動で Preview デプロイする）
> 実装者へ: フェーズごとにコミット & push し、Preview URL で見た目を確認しながら進めること。

---

## 0. 絶対に守ること（過去の事故から）

1. **既存機能の削除・変更禁止。** スタイルだけを変える。JSXの構造変更は見た目目的のみ可。
   ハンドラ・state・API呼び出し・条件分岐ロジックには触れない。
2. **iOS Safari のスクロール構造を変えない。** ボトムシート/パネル内のスクロールは
   `position: absolute; top: Xpx; bottom: 0; overflow-y: scroll` 方式で実装されている。
   flex方式に書き換えると iOS で壊れる（実績あり）。
3. **z-index 階層を変えない。** BottomTab=100, シート類=200, ピッカー=310/320 など。
4. **テーマシステム（CSS変数）の仕組みは維持。** ユーザーがアクセント色・コミュニティテーマを
   変更できる機能があるため、変数の「デフォルト値の変更」と「変数の追加」のみ行う。
   変数の削除・リネームは禁止（コミュニティテーマ7種が既存キーを上書きする設計のため）。
5. `useLikeAnimation` のパーティクル演出、`createPortal(document.body)` の構造は維持。

---

## 1. 現状の問題点（診断）

| # | 問題 | AI感/使いにくさ | 該当箇所 |
|---|------|----------------|---------|
| 1 | アクセント色が `#888780`（グレーベージュ）。アクティブタブ・選択状態が灰色で視認できない | 使いにくい | `index.css` `--accent-color` |
| 2 | ほぼ全ボタンが「1pxボーダー＋丸ピル」。輪郭線UIの羅列は典型的なAI生成の見た目 | AI感 | 全ページ（いいね・リアクション・リンク・チップ） |
| 3 | 文字サイズが 9/10/11/12/13px と無秩序。iOSの最小可読サイズ(11pt)未満を多用 | 両方 | Discover/Calendar のタイル日付列・バッジ |
| 4 | ヘッダー右に 32px の小ボタンが3連（地図・パレット・⋮）。全タブで重複 | AI感 | Header rightAction（4タブ全部） |
| 5 | `window.confirm` / `window.alert` がネイティブ感を完全に壊す | 両方 | WorkSelect の脱退/削除、Calendar の予定削除 |
| 6 | ダークテーマで `shadow-card`（黒地に黒影）が見えず、カードの階層が出ない | 使いにくい | index.css / 全カード |
| 7 | 「みんなの投稿した予定」など説明文をそのままタイトルにしている | AI感 | Discover ヘッダー |
| 8 | `›` `‹` をテキスト文字で表示（月ナビ・バナー矢印） | AI感 | Calendar ヘッダー、予約バナー |
| 9 | タッチターゲットが 28〜32px と小さい（Apple推奨は44pt） | 使いにくい | 🔔⭐ボタン、チップ内フィルター、ヘッダーボタン |
| 10 | 角丸が lg/xl/2xl/full と無秩序に混在 | AI感 | 全ページ |
| 11 | トグルスイッチが自作の細いもの（w-9 h-5）でiOSと比率が違う | AI感 | 予約トグル・隣接県トグル |
| 12 | 押下フィードバックが `active:opacity-60` のみ。スケールやスプリングがない | AI感 | 全ボタン |
| 13 | 背景が `#1a1a1a / #2a2a2a` の2階層のみ。iOSは3階層で奥行きを作る | AI感 | index.css |

---

## 2. デザイントークン刷新（Phase A・最重要）

### 2-1. カラー（`src/index.css` の `:root` デフォルト値を変更＋変数追加）

iOS Dark Mode のセマンティックカラーに寄せる。**既存変数はキー名を変えず値のみ更新**、新変数は追加。

```css
:root {
  /* 背景 3階層（iOS systemBackground 系） */
  --bg-primary:   #000000;      /* 旧 #1a1a1a → 純黒。OLED映え・iOS標準 */
  --bg-secondary: #1c1c1e;      /* 旧 #2a2a2a → カード・シート */
  --bg-tertiary:  #2c2c2e;      /* ★新規: カード内のネスト要素・入力欄 */

  /* ラベル（iOS label 系の不透明度ベース） */
  --label-primary:   #ffffff;
  --label-secondary: rgba(235,235,245,0.6);   /* 旧 #aaaaaa */
  --label-tertiary:  rgba(235,235,245,0.3);   /* 旧 #666666 */

  /* fill（★新規: ボーダーの代わりに使う塗り。iOS systemFill 系） */
  --fill-primary:   rgba(120,120,128,0.36);
  --fill-secondary: rgba(120,120,128,0.32);
  --fill-tertiary:  rgba(120,120,128,0.24);
  --fill-quaternary:rgba(120,120,128,0.18);

  /* セパレータ（★新規） */
  --separator: rgba(84,84,88,0.6);

  /* アクセント: グレー → iOS systemBlue (dark) */
  --accent-color: #0A84FF;      /* 旧 #888780 */

  /* セマンティック（★新規） */
  --color-destructive: #FF453A; /* 削除・脱退 */
  --color-success:     #30D158;
  --color-warning:     #FF9F0A; /* 締切間近など */
}
```

- 既存の `--border-faint/subtle/default/strong/selected` は**残す**（コミュニティテーマが上書きするため）。
  ただし新規コードでは原則 `--separator` と `--fill-*` を使う。
- `tailwind.config.js` に追加登録:
  ```js
  colors: {
    bg: { primary, secondary, tertiary: 'var(--bg-tertiary)' },
    fill: { 1:'var(--fill-primary)', 2:'var(--fill-secondary)', 3:'var(--fill-tertiary)', 4:'var(--fill-quaternary)' },
    destructive: 'var(--color-destructive)',
    success: 'var(--color-success)',
    warning: 'var(--color-warning)',
  },
  borderColor: { separator: 'var(--separator)' }
  ```
- `ThemeContext.tsx` の simple（ライト）テーマ側も対応値を定義:
  `--bg-primary:#f2f2f7, --bg-secondary:#ffffff, --bg-tertiary:#f2f2f7,`
  `--accent-color:#007AFF, --separator:rgba(60,60,67,0.29), --fill-*: rgba(120,120,128,0.2〜0.08)`。
- コミュニティテーマ7種の `vars` にも `--bg-tertiary` `--separator` `--fill-*` を追加
  （各テーマのトーンに合わせた値。なければフォールバックでデフォルトが効くが、明示推奨）。

### 2-2. タイポグラフィ

iOS Text Styles に合わせた離散スケールのみ使う。**9px/10pxは全廃**:

| 用途 | サイズ/ウェイト | 置き換え対象 |
|------|---------------|-------------|
| Large Title（WorkSelectの見出し） | 28px / bold | text-2xl |
| Title（ヘッダータイトル） | 17px / semibold | text-base font-bold |
| Body（イベントタイトル・本文） | 15px / regular〜semibold | text-base, text-sm 混在 |
| Subhead（メモ・補足） | 13px / regular | text-sm |
| Footnote（メタ情報・by名前） | 12px / regular | text-xs |
| Caption（バッジ・日付ラベル） | 11px / medium | text-[10px], text-[9px] |

- フォントは現行の `'M PLUS 1p', -apple-system, ...` を維持（変更は別判断）。
- 数字（日付・カウント）には `font-variant-numeric: tabular-nums` を適用するユーティリティを追加。

### 2-3. 角丸・影・押下フィードバック

- 角丸は4段階に統一: **10px**（小要素・入力欄）/ **14px**（カード）/ **18px**（シート上端）/ **full**（ピル・円ボタン）。
  Tailwind: `rounded-[10px]` `rounded-[14px]` `rounded-t-[18px]` `rounded-full` のみ使用。
- **ダークテーマでは影を使わない**。カードの階層は `bg-secondary` と `bg-tertiary` の色差で出す。
  `.shadow-card` はライトテーマ用に `0 1px 3px rgba(0,0,0,0.08)` 程度へ弱める
  （`[data-theme="simple"] .shadow-card` のようにテーマスコープ化してもよい）。
- 押下フィードバック共通ユーティリティを `index.css` に追加:
  ```css
  .pressable { transition: transform 0.15s cubic-bezier(0.32,0.72,0,1), opacity 0.15s; }
  .pressable:active { transform: scale(0.96); opacity: 0.8; }
  ```
  主要なタップ要素（カード除く）に付与していく。`active:opacity-60` 単独は段階的に置換。

---

## 3. 共通コンポーネント刷新（Phase A）

### 3-1. ボタン体系（新規 `src/components/ui/Button.tsx` は作らず、クラスパターンで統一）

ボーダーピルを廃止し、iOS の3形態に揃える:

| 形態 | スタイル | 用途 |
|------|---------|------|
| **Filled** | `bg-[var(--accent-color)] text-white rounded-full` | 主アクション（追加・保存・FAB） |
| **Tinted** | `背景: color-mix(in srgb, var(--accent-color) 15%, transparent)` + アクセント文字 | 二次アクション（再追加・予約情報+） |
| **Gray** | `bg-fill-3 text-label-primary rounded-full`（ボーダーなし） | 中立アクション（リアクション・リンク・共有） |

- いいねボタン: ボーダー → **Gray形態**。いいね済みは `color-mix(in srgb, #FF453A 15%, transparent)` 背景 + 赤文字。
- アイコンのみボタンは最小 **44×44px のタップ領域**（視覚は32px円でも、透明パディングで44px確保）。

### 3-2. 確認ダイアログ（★新規 `src/components/ConfirmDialog.tsx`）

`window.confirm` を置き換える iOS 風アラート:

- 中央モーダル: 幅270px、`rounded-[14px]`、`bg-secondary`、backdrop `rgba(0,0,0,0.4)`。
- タイトル17px semibold 中央、メッセージ13px、ボタン行は上ボーダー区切りで横並び
  （キャンセル=アクセント色 regular、破壊的アクション=`--color-destructive` semibold）。
- 置き換え対象（ロジックは変えず、confirm の呼び出しだけ差し替え）:
  - `WorkSelect.tsx` 200行目付近: 脱退確認・削除確認
  - `Calendar.tsx`: 予定削除確認
  - `Discover.tsx`: 長押し削除確認
- 実装は `useState` でメッセージ＋コールバックを持つだけの軽いもので良い。

### 3-3. Header（`src/components/Header.tsx`）

- 高さを 44px 固定（iOS navigation bar）。タイトル 17px / semibold。
- 戻るボタン: `bg-bg-secondary` の角丸四角 → **背景なしの chevron アイコンのみ**（アクセント色、44pxタップ領域）。
- 右アクションの**3連ボタンを2つまでに削減**:
  - 地域フィルター（使用頻度が高いので単独維持。背景なしアイコンボタンに変更）
  - 「⋮」メニュー（既存 SettingsMenuButton）に **「カスタマイズ」項目を統合**
    → パレットボタンを4タブ全てから削除し、メニュー先頭に「🎨 カスタマイズ」行を追加
    （`navigate('/customize')`。機能は失わない、導線が変わるだけ）。
- ヘッダー背景: `bg-bg-primary` に `backdrop-filter: blur(20px)` + `background: color-mix(in srgb, var(--bg-primary) 75%, transparent)` で半透明ブラー化（スクロール時にコンテンツが透ける iOS 風）。
  ※ position構造は変えない。

### 3-4. BottomTab（`src/components/BottomTab.tsx`）

- 背景をブラー化（Headerと同じ手法）。`border-t` は `--separator` に。
- ラベル 10px → **11px**。アクティブ色は新アクセント（#0A84FF）になるので視認性が解決する。
- アイコン: アクティブ時 `fill` 表現に近づけるため `strokeWidth 2.5`、非アクティブ `1.8`。
- 高さ: `py-2` → セーフエリア考慮 `padding-bottom: max(8px, env(safe-area-inset-bottom))` を追加（実機Android/iOSで沈み防止）。

### 3-5. トグルスイッチ

自作トグル2箇所（予約受付トグル・隣接県トグル）を iOS 比率に統一:
- サイズ `w-[51px] h-[31px]`、ノブ 27px、ON色 `var(--color-success)`（iOS標準は緑）。
- 共通クラス or 小コンポーネント `src/components/ui/Toggle.tsx` を新規作成して2箇所から使う。

### 3-6. セグメンテッドコントロール（カレンダー/予定一覧 切替）

下線タブ → **iOS segmented control**:
- コンテナ: `bg-fill-3 rounded-[10px] p-[2px] mx-4 my-2`、内部に2ボタン。
- 選択中: `bg-bg-tertiary rounded-[8px]` + `box-shadow 0 1px 4px rgba(0,0,0,0.2)` + semibold。
- 切替時 `transition: all 0.2s`。

---

## 4. 画面別の改善（Phase B〜D）

### 4-1. 発見タブ `Discover.tsx`（Phase B）

- ヘッダータイトル: 「みんなの投稿した予定」→ **「発見」**（17px semibold）。
- 予約受付バナー: グレー背景+テキスト矢印 →
  **Tintedバナー**（`color-mix(in srgb, var(--color-warning) 12%, transparent)` 背景、
  左に `Clock` アイコン、右に `ChevronRight` の lucide アイコン）。文言・件数・遷移は維持。
- 作品チップ: ボーダーピル → **塗りチップ**。
  - 表示中: `背景 color-mix(作品色 18%) + 作品色文字`、非表示: `bg-fill-4 + label-tertiary`。
  - 内蔵フィルターアイコン(11px)はタップ領域を `py-2 pr-3` に拡大（視覚サイズは13px）。
- イベントカード:
  - `shadow-card` 依存をやめ `bg-secondary rounded-[14px]`（ダークでは影なし）。
  - 左日付列: 幅 w-10→w-12。日付は `17px bold tabular-nums`、月や補足は11px。
    「開催中」は `--color-success`、「予約」期間は `--color-warning` でステータスを色分け。
  - 縦区切り線 `bg-white/10` → `var(--separator)`（テーマ追従していなかったバグ的箇所）。
  - バッジ: 「予約」は `#ef4444` 直書き → `var(--color-destructive)`。
    カテゴリ・県バッジは `bg-fill-4` ボーダーなし 11px。
  - アクション行: ボーダーピル3つ → **Gray/Tinted ボタン**（3-1参照）。
    区切りボーダー `border-t` は `--separator` の **inset**（`mx-4`）に。
  - 「予約情報+」ボタン → Tinted形態、文言「予約情報を追加」だと長いので「＋予約情報」。
- リアクションピッカー: 現在の下部固定グリッドは維持しつつ `rounded-[18px]`、
  出現アニメーション `slideUpIn 0.25s` 適用（既存keyframe再利用）。

### 4-2. 予約ページ `Preorders.tsx`（Phase B）

- Discoverのカード刷新をそのまま適用（タイルデザインは発見タブと完全統一、という既存方針を維持）。
- 「受付中」セクション見出し: 13px → **iOS グループ見出し**（13px uppercase不要・`label-secondary`・`px-4 mb-2`）。
- 締切カウント（赤/オレンジ）: `--color-destructive` / `--color-warning` に置換。

### 4-3. カレンダー `Calendar.tsx`（Phase C・最大の作業）

**グリッド・ボトムシート・投稿フォームのロジックには一切触れない。スタイルのみ。**

- 月ナビ: `‹ ›` テキスト → `ChevronLeft/Right` の lucide アイコンボタン（44pxタップ領域、アクセント色）。
  タイトル「2026年6月」は 17px semibold。**タイトルタップで「今日へ戻る」**は…機能追加になるため今回はやらない。
- カレンダー/予定一覧タブ → セグメンテッドコントロール（3-6）。
- カレンダーグリッド:
  - 今日の日付円: アクセント塗り＋白文字（現在の仕様確認の上、新アクセント色で映えるはず）。
  - 選択日: `bg-fill-3` の円。
  - グリッド線: `--cal-grid-color` の仕組み維持。デフォルト値を `var(--separator)` 相当に。
- ボトムシート: `rounded-t-[18px]`、グラバー `w-9 h-[5px] bg-fill-1 rounded-full`。
- 予定タイル（ボトムシート/一覧共通):
  - 🔔⭐ボタン: 36px → 視覚32px+44pxタップ領域、背景なし（並びすぎてうるさいため）。
    ON状態: ベル=アクセント色塗りアイコン、星=`--color-warning` 塗りアイコン。
  - アクション行のピル群 → Gray形態ボタン（3-1）。
- FAB: `bg-label-primary`（白）→ **アクセント色塗り** `w-14 h-14 shadow-lg`。
  ＋→×の回転は既存維持。
- 投稿フォーム/編集フォーム（380pxパネル）:
  - 入力欄: `bg-bg-tertiary rounded-[10px] px-4 py-3`、フォーカス時 `ring-2 ring-[var(--accent-color)]`、ボーダーなし。
  - カテゴリ選択ピル: 選択中=Tinted、未選択=Gray。
  - 保存ボタン: Filled形態・高さ50px・15px semibold。
- キューバナー「N件のストックがあります」: アクセント塗り維持（新色で映える）。`›` → ChevronRight。

### 4-4. プロフィール `Profile.tsx`（Phase D）

- **inset grouped list** 化: セクション見出し（13px label-secondary）+ `bg-secondary rounded-[14px]` グループ、
  行間セパレータは `--separator` の inset（左16px開始）。
- 統計グリッド: 数字 `22px bold tabular-nums`、ラベル12px。カード個別 → 1グループ内の2列。
- 鉛筆ボタン群: 背景なしの `Pencil` アイコン（label-tertiary）に統一、44pxタップ領域。
- 保存/キャンセル: テキストボタン（アクセント色 semibold / label-secondary）。

### 4-5. 作品選択 `WorkSelect.tsx`（Phase D）

- 見出し「作品を選ぶ」: **Large Title**（28px bold）。説明文は13px label-secondary。
- 検索バー: `bg-fill-3 rounded-[10px] h-9`、虫眼鏡 label-secondary、iOS検索バー比率に。
- 作品リスト行: グループ化リスト（4-4と同じ見た目）、参加人数は `12px label-secondary`、
  右端 ChevronRight（label-tertiary）。
- 「新しく作る」カード: Tinted形態に。

### 4-6. その他（Phase D）

- `DateDetail.tsx` / `UserProfileModal.tsx` / `UserSettingsSheet.tsx` / `PreorderEditSheet.tsx`:
  カード・ボタン・入力欄を上記トークンに揃える（個別の新デザインは不要、機械的に置換）。
- `Customize.tsx`: パレットUIは複雑なので**色トークンの置換のみ**。レイアウト変更しない。
- `NotFound.tsx`: タイトル17px、戻るボタンFilled形態。

---

## 5. 実装フェーズとコミット計画

| Phase | 内容 | 目安 |
|-------|------|------|
| **A** | トークン（index.css / tailwind.config / ThemeContext のテーマ値）＋ Header / BottomTab / ConfirmDialog / Toggle / セグメント | 全画面に効く土台。最初に1コミット |
| **B** | Discover + Preorders のカード・バナー・チップ | 1コミット |
| **C** | Calendar（ヘッダー・グリッド・シート・フォーム・FAB） | 最大。2〜3コミットに分割可 |
| **D** | Profile / WorkSelect / DateDetail / モーダル類 / Customize | 1〜2コミット |

- 各Phase後に `npx tsc --noEmit` と `npm run build` を通すこと。
- Vercel Preview（ブランチpushで自動）で実際の見た目を確認。
- Phase A のアクセント色変更だけで印象が大きく変わるため、**ユーザーに Preview URL で
  Phase A 完了時点の確認を取ってから B 以降に進む**のが安全。

## 6. 判断が必要な点（実装前にユーザー確認推奨）

1. **アクセント色**: 本書は iOS systemBlue (#0A84FF) を提案。
   ブランド色（FanHive ロゴ等）があるならそちらを優先。
   ※ユーザーは Customize でいつでも変更可能なので「デフォルト値」の話。
2. **背景の純黒化** (#000000): OLED映え・iOS風になるが、現行 #1a1a1a の方が柔らかい。
   嫌なら #0e0e10 等の折衷案。
3. **パレットボタンの「⋮」メニューへの統合**（3-3）: 導線が1タップ深くなる。
   カスタマイズを頻繁に使うユーザー層なら現状維持もあり。

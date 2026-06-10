# FanHive UI/UX リデザイン v2 — 「売れるアプリ」への磨き込み設計書

> 目的: v1（`docs/ui-redesign.md`、Phase A〜D 実装済み）で得た iOS 風の土台を、
> **ライト/ダーク完全対応・ネイティブ並みの操作感・初見で価値が伝わる初回体験**まで引き上げ、
> ストアで「手に取りたくなる」品質にする。
>
> ブランチ: `feature/ios-ui-redesign`（このブランチに追加コミットする。main には実装しない）
> フェーズ記号は v1 の A〜D を引き継ぎ **E〜I** とする。

---

## 0. 絶対に守ること

1. **既存機能の削除・変更禁止。** ハンドラ・state・API呼び出し・条件分岐ロジックには触れない。
   見た目とフィードバック（音・振動・アニメーション）の追加のみ。
2. **広告の位置を動かさない・コンテンツと被らせない。**
   - Calendar: `#ad-spacer` の実測位置に `showBanner(margin)` する仕組みは**そのまま**。
     ヘッダー周辺の高さを変える場合も、実測ベースなので自動追従するが、`#ad-spacer` 要素自体は消さない。
   - Discover: `showBanner()`（margin 0 = 最上部）と `paddingTop: 36` のペアを変えない。
   - Preorders / その他: `paddingTop: 36` を維持。
3. **CSS変数のキー名は削除・リネーム禁止**（コミュニティテーマ7種が既存キーを上書きする設計）。
   値の変更と**変数の追加**のみ可。
4. **iOS Safari スクロール構造**（`position: absolute; top: X; bottom: 0; overflow-y: scroll`）と
   **z-index 階層**（BottomTab=100、シート=200、ピッカー=310/320）を変えない。
5. **派手にしない。** グラデーション・ネオン・大きな彩度の演出は使わない。
   余白・階調・タイポグラフィで品質を出す（Things 3 / TimeTree / Apple純正アプリの方向）。
6. `useLikeAnimation` のパーティクル演出と `createPortal(document.body)` 構造は維持。

---

## 1. ゴールと設計原則

| 原則 | 意味 |
|------|------|
| **Calm UI** | 画面の98%は無彩色（bg/label/fill）。色は「状態」を伝えるときだけ使う（アクセント=操作可能、赤=締切/破壊、緑=成功） |
| **Content first** | 飾り枠・影・線を減らし、推し作品の画像とイベント名が主役になる |
| **OSに溶ける** | システムのライト/ダーク設定に追従し、OSダイアログ風の確認、ハプティクス、セーフエリアまで揃える |
| **3秒で価値が分かる** | 初回起動 → 作品を選ぶ → 予定が流れ込む、を3画面以内で体験させる |

---

## 2. 現状診断（v1 完了後に残る課題）

実測値（2026-06-10 時点、`feature/ios-ui-redesign` ブランチ）:

| # | 課題 | 実測 | 影響 |
|---|------|------|------|
| 1 | ハードコードされた白色（`text-white` / `color:'#fff'` / `rgba(255,255,255,…)` / `bg-white/10`） | **78箇所 / 9ファイル** | ライトテーマ（simple）にすると文字が消える・線が見えない。**ライトモードが実質使えない** |
| 2 | `window.confirm` / `alert` | **15箇所** | ブラウザ素のダイアログがネイティブ感を破壊（v1 で計画したが未実装） |
| 3 | テーマがOS設定に追従しない | `ThemeMode = 'simple' \| 'dark'`、デフォルト `'dark'` 固定 | ライト派ユーザーの第一印象が「真っ黒なアプリ」 |
| 4 | アクセント `#FBBF00`（黄）のコントラスト | 白背景に黄文字 ≈ 1.6:1（WCAG AA 4.5:1 未満） | ライトモードでリンク・選択状態が読めない |
| 5 | `shadow-card` がダーク用の濃さ（`rgba(0,0,0,0.3)`） | index.css 固定値 | ライトでは影が重く安っぽい |
| 6 | `theme-color` メタが `#1a1a1a` 固定・StatusBar 未制御 | index.html / Capacitor | ライト時にステータスバーだけ黒く浮く |
| 7 | 空状態がテキスト1行のみ | 各タブ | 初回ユーザーが次に何をすべきか分からない |
| 8 | オンボーディングなし | — | アプリの3本柱（参加→投稿→いいねで追加）が伝わらないまま離脱 |
| 9 | 触覚フィードバックなし | — | Androidネイティブアプリとして物足りない |
| 10 | 作品カラー上の文字が常に白（`color:'#fff'`） | Preorders チェックボタン等 | 明るい作品色（黄・水色）だと文字が読めない |

---

## 3. Phase E: ライト/ダーク完全対応（最重要・最初にやる）

「どちらのモードでもスクリーンショットが映える」状態にする。作業は4段階。

### E-1. テーマモードに `system` を追加

`src/contexts/ThemeContext.tsx`:

```ts
export type ThemeMode = 'simple' | 'dark' | 'system';   // 追加のみ（既存値は維持）

// 解決関数を新設
export function resolveTheme(mode: ThemeMode): 'simple' | 'dark' {
  if (mode !== 'system') return mode;
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'simple' : 'dark';
}
```

- `DEFAULT_SETTINGS.theme` を `'dark'` → `'system'` に変更。
  既存ユーザーは localStorage に保存済みの `'dark' | 'simple'` がそのまま効くので影響なし。
- ThemeProvider に `matchMedia('(prefers-color-scheme: dark)')` の `change` リスナーを追加し、
  `theme === 'system'` のときだけ再適用。
- テーマ適用時に `document.documentElement.dataset.theme = 'light' | 'dark'` を設定する
  （E-3 の影スコープ、E-4 のステータスバー同期が参照する）。
- コミュニティテーマには `dark: boolean` フィールドを**追加**（リネームではないので安全）:
  `sakura: false, ivory: false`、他5種は `true`。適用時に dataset.theme へ反映。
- `Customize.tsx` のテーマ選択に「**システムに合わせる**」ボタンを追加（シンプル/ダークの並びの先頭）。
  表記も「シンプル」→「**ライト**」に変更（保存値 `'simple'` は変えない。表示文言のみ）。

### E-2. アクセントのデュアルトークン化

黄色 `#FBBF00` は塗りには最適だが、ライト背景の文字色には使えない。役割を分離する:

```css
:root {
  --accent-color: #FBBF00;                 /* 既存。塗り（Filled ボタン・FAB・バッジ）専用にする */
  --accent-on:    #1a1a1a;                 /* ★新規: アクセント塗りの上に載せる文字色（黄には常に黒系） */
  --accent-text:  #FBBF00;                 /* ★新規: 文字・アイコン・リンクとして使うアクセント（ダーク時） */
}
[data-theme="light"] {
  --accent-text:  #B8860B;                 /* ライト時は読める濃い琥珀。塗り(--accent-color)は黄のまま */
}
```

- 置換ルール（機械的に適用できる）:
  - アクセント**塗り** + 文字: `color: var(--bg-primary)` の暫定対応 → `color: var(--accent-on)` に統一。
  - アクセント**文字/アイコン**（Tinted ボタン、リンク、アクティブタブ、選択状態）:
    `var(--accent-color)` → `var(--accent-text)`。
  - Tinted 背景の `color-mix(in srgb, var(--accent-color) 12〜15%, transparent)` は**そのまま**
    （薄塗りはライトでも問題ない）。
- ユーザーがアクセント色を変更できる機能（Customize の ACCENT_COLORS）は維持。
  `updateSettings({ accentColor })` 時に `--accent-text` / `--accent-on` も自動算出して設定する:
  - 輝度が高い色（黄・水色など）→ `--accent-on: #1a1a1a`、ライト時の `--accent-text` は 35% 暗くした色。
  - 輝度が低い色 → `--accent-on: #ffffff`、`--accent-text` はそのまま。
  - 算出ヘルパー `getContrastText(hex)` / `darken(hex, ratio)` を `src/lib/color.ts` に新規作成。

### E-3. ハードコード色の全廃（78箇所の監査）

検出コマンド（作業前後で実行して 0 に近づける）:

```bash
grep -rn "text-white\|bg-white\|color: '#fff'\|rgba(255,255,255" src/pages src/components --include="*.tsx" | grep -v "var(--"
```

置換マッピング:

| 現状 | 置換先 | 備考 |
|------|--------|------|
| `bg-white/10`（縦区切り線。Discover/Preorders のタイル内） | `backgroundColor: 'var(--separator)'` | テーマ追従していなかったバグ的箇所 |
| `text-white` / `color:'#fff'`（無彩色背景の上） | `text-label-primary` / `var(--label-primary)` | |
| `color:'#fff'`（**作品色・カテゴリ色の塗りの上**。例: Preorders チェックボタン、ハイライトピル） | `getContrastText(workColor)` | E-2 のヘルパーを使い明るい作品色でも読めるように |
| `style={{ background:'#ef4444', color:'#fff' }}`（予約バッジ） | `background: var(--color-destructive), color: #fff` | 赤は十分濃いので白文字は維持で良いが、色は変数化 |
| `rgba(255,255,255,…)` の枠・薄塗り | `--fill-*` / `--border-*` の近い段階 | |
| `shadow-xl` などの Tailwind 影 | E-3 の影トークン（下記） | |

- **対象9ファイル**: `Discover.tsx` / `Preorders.tsx` / `Calendar.tsx` / `Customize.tsx` /
  `ShareTarget.tsx` / `SmartInputPanel.tsx` / `WidgetPreviewModal.tsx` / `BottomTab.tsx` / `PhoneFrame.tsx`
  - ⚠️ `PhoneFrame.tsx` は PC 表示時のスマホ枠。枠自体の白はデバイスのベゼル表現なので**対象外**
    （中身のコンテンツ部分だけ確認）。
- 影のテーマスコープ化（index.css）:

```css
.shadow-card { box-shadow: 0 1px 3px rgba(0,0,0,0.3), 0 0 1px rgba(0,0,0,0.15); }
[data-theme="light"] .shadow-card { box-shadow: 0 1px 3px rgba(0,0,0,0.08), 0 0 1px rgba(0,0,0,0.04); }
```

- カレンダーの土日色 `--cal-saturday-color` / `--cal-sunday-color` のデフォルトも
  ライト時に濃い値へ切り替え（`[data-theme="light"]` スコープで上書き。ユーザー設定があればそちら優先の既存ロジックは変えない）。
- `WORK_COLORS` / `CATEGORY_COLOR_MAP` はライト/ダーク双方の背景でコントラスト比 3:1 以上あるか目視確認し、
  問題のある色だけ彩度・明度を微調整（パレットの差し替えはしない。色相は維持）。

### E-4. OS・ブラウザクロームとの同期

- `index.html` の `<meta name="theme-color">` を静的値から、テーマ適用時に JS で動的更新
  （`document.querySelector('meta[name=theme-color]').setAttribute('content', bgPrimary)`）。
- Capacitor `@capacitor/status-bar` を導入し、テーマ適用時に:
  - ダーク: `StatusBar.setStyle({ style: Style.Dark })` + 背景 `#0e0e10`
  - ライト: `Style.Light` + 背景 `#f2f2f7`
  - 適用箇所は ThemeContext の「テーマカラーを CSS 変数に反映」useEffect 内に追記（ネイティブのみ実行ガード）。
- PWA `manifest` の `background_color` / `theme_color` も確認・更新（vite.config.ts）。

### E-5. 検証

- Customize で ライト/ダーク/システム/コミュニティ7種 をすべて切り替え、
  **全タブ + Preorders + DateDetail + 投稿フォーム + 各シート** を目視。
- 监査 grep が PhoneFrame の枠と意図的な白（赤バッジ上の白文字など）だけになること。
- `npx tsc --noEmit` && `npm run build`。

---

## 4. Phase F: ネイティブ感の核 — ダイアログ・トースト・ハプティクス

### F-1. ConfirmDialog（`window.confirm` 15箇所の置換）

`src/components/ui/ConfirmDialog.tsx` を新規作成（v1 設計 3-2 をそのまま採用）:

- 中央モーダル: 幅 270px、`rounded-[14px]`、`bg-secondary`、backdrop `rgba(0,0,0,0.4)`、
  出現は `scale(1.05)→1 / opacity` の 0.2s。
- タイトル 17px semibold 中央 / メッセージ 13px / ボタン行は `--separator` 区切りの横並び
  （キャンセル = `--accent-text` regular、破壊的 = `--color-destructive` semibold）。
- 使いやすい hook を同梱:

```tsx
const { confirm, dialog } = useConfirm();
// 旧: if (!window.confirm('削除しますか？')) return;
// 新: if (!(await confirm({ title: '予定を削除', message: 'この操作は元に戻せません。', destructiveLabel: '削除' }))) return;
```

- 置換対象（ロジックは変えず呼び出しだけ差し替え）: `WorkSelect`（脱退・削除）、`Calendar`（予定削除・個人予定削除）、
  `Discover`（長押し削除）、`UserSettingsSheet`（アカウント削除の2段階確認は既存UIを維持し、それ以外）、他 grep で全列挙。
- `alert()`（エラー通知系）は F-2 のトーストへ。

### F-2. Toast（非ブロッキング通知の統一）

`src/components/ui/Toast.tsx` + `useToast()` を新規作成:

- 画面上部（ヘッダー下、広告と被らないよう `top: ad-spacer 高さ + 8px` ではなく **BottomTab 上 8px** に表示。
  上部は広告領域のため**下から出す**）。
- `bg-tertiary` + `rounded-full` + 13px、2.5s で自動消滅、`slideUpIn` 再利用。
- 置換対象: WorkSelect の「参加しました」既存トースト（共通化）、`alert('削除に失敗しました')` 等のエラー通知。
- 成功系は文言＋チェックアイコン、エラー系は `--color-destructive` のアイコンのみ。色背景にしない。

### F-3. ハプティクス（ネイティブのみ）

`@capacitor/haptics` を導入し、`src/lib/haptics.ts` を新規作成:

```ts
export const haptic = {
  light:  () => Capacitor.isNativePlatform() && Haptics.impact({ style: ImpactStyle.Light }),
  select: () => Capacitor.isNativePlatform() && Haptics.selectionStart(),
  success:() => Capacitor.isNativePlatform() && Haptics.notification({ type: NotificationType.Success }),
};
```

発火ポイント（控えめに。全ボタンには付けない）:

| 操作 | 種類 |
|------|------|
| いいねタップ | light（連打が気持ちよくなる） |
| タブ切り替え | select |
| 予定の保存成功・作品参加 | success |
| リアクション選択・重要マーク ON | light |
| 削除の確認ダイアログ表示 | なし（音や振動で脅さない） |

### F-4. プレス感の統一

- `.pressable`（既存: opacity 0.5）を `transform: scale(0.97)` 併用へ強化し、
  カード以外の主要タップ要素（ボタン・チップ・タブ）に統一適用。
- `prefers-reduced-motion: reduce` で全 keyframes・transition を無効化するブロックを index.css に追加:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
}
```

---

## 5. Phase G: 初回体験と空状態 — 「3秒で価値が分かる」

### G-1. オンボーディング（新規 `src/components/Onboarding.tsx`）

- 表示条件: `localStorage fan_onboarding_done` が無い **かつ** 参加作品 0 件のとき、
  初回マウントで全画面表示（既存ユーザーには出ない）。
- 3カード横スワイプ（CSS scroll-snap で実装、ライブラリ不要）:
  1. **「推しの予定、ぜんぶここに」** — カレンダーのスクリーンショット風イラスト
  2. **「みんなが見つけた予定を、いいねで自分のカレンダーへ」** — 発見タブの説明
  3. **「Xでみつけた予定は、共有するだけ」** — スマート入力の説明
- 最後のカードに Filled ボタン「**作品を選んではじめる**」→ `/select` へ遷移 + フラグ保存。
- 右上に「スキップ」（label-tertiary、13px）。
- デザインは bg-primary ベタ + アクセント1色。イラストは絵文字 or 既存アイコンの組み合わせで良い
  （画像アセットを増やさない。後からデザイナー素材に差し替え可能な構造に）。

### G-2. 空状態の刷新（全タブ）

共通コンポーネント `src/components/ui/EmptyState.tsx`（アイコン 48px + 見出し15px + 説明13px + CTA ボタン）:

| 画面 | 現状 | 新しい空状態 |
|------|------|-------------|
| 発見タブ（参加 0） | テキスト1行 | 🔍「まだ作品に参加していません」+ Filled「作品を探す」→ /select |
| 発見タブ（予定 0） | テキスト1行 | 📅「今後の予定はまだありません」+ Tinted「予定を投稿する」→ カレンダーへ |
| カレンダー（参加 0 & 個人予定 0） | 案内カード（既存） | 既存の案内カードを EmptyState スタイルに統一（機能・遷移は維持） |
| Preorders | テキスト1行 | 🛍「受付中の予約はありません」+ 説明「予約・受注情報は自動で検出されます」 |
| 予定一覧（月に予定 0） | テキスト | 「この月の予定はありません」+ Tinted「＋ 予定を追加」（既存FABと同じ動作） |

### G-3. スケルトンの統一

- 既存のパルス矩形を `src/components/ui/Skeleton.tsx` に共通化し、
  実カードと同じ高さ・角丸（`rounded-[14px]`）・内部レイアウト（日付列 + 本文行）に近づける
  （「読み込むとガタッと変わる」のを防ぐ）。
- 適用: Discover / Preorders / Calendar 一覧 / Profile 統計。

---

## 6. Phase H: 操作性・アクセシビリティ磨き込み

### H-1. タッチターゲットの総点検

- すべてのアイコンボタンを「**視覚 28〜32px / タップ領域 44px**」に統一
  （透明パディングで拡張。レイアウトは変えない）。
- 対象: 🔔⭐、チップ内フィルター（11px アイコン）、ヘッダーボタン、シートの×、月ナビ。

### H-2. コントラストとフォーカス

- `--label-tertiary`（30%白）を本文に使っている箇所を点検し、**操作できる要素には secondary 以上**を使う
  （tertiary はプレースホルダー・無効状態専用に）。
- キーボードフォーカス（PWA/デスクトップ用）: `:focus-visible { outline: 2px solid var(--accent-text); outline-offset: 2px; }`
  を index.css に追加。
- 主要ボタンに `aria-label` が無いものを補完（アイコンのみボタン全部）。

### H-3. 操作の摩擦を減らす小改善（機能追加だが既存機能は不変）

| 改善 | 実装 | 場所 |
|------|------|------|
| 月タイトルタップで「今月へ戻る」 | `setYear/setMonth(today)` のみ | Calendar ヘッダー |
| 発見タブ: スクロール位置の保持 | `sessionStorage` にスクロール位置保存・復元 | Discover |
| プルトゥリフレッシュ | overscroll 検知で再フェッチ + スピナー（ライブラリ不要の簡易実装、ネイティブのみで良い） | Discover / Preorders |
| 「追加済み」表示のタップで該当日に飛ぶ | `navigate('/calendar')` + ハイライト（既存の highlightEventId 機構を再利用） | Discover |
| 入力フォームの Enter で次フィールドへ | `enterKeyHint` 属性の付与のみ | 投稿フォーム |

※ どれも既存ロジックの**追加**であり削除・変更はしない。1つずつ独立コミットにし、怪しければ単体で revert できるようにする。

### H-4. 文言の磨き込み（コピーライティング）

- 「データの読み込みに失敗しました」→「読み込めませんでした。**下に引っぱって再読み込み**」（H-3 と連動）
- ボタンは動詞で統一: 「チェック!」→「**サイトを見る**」（既遷移は不変）※ユーザー確認を取ってから
- 敬体/常体の混在を常体寄りの短文に統一（「〜します」→「〜する」はボタンのみ。説明文は敬体維持）

---

## 7. Phase I: パフォーマンス・ストア対応

### I-1. 体感速度

- `Discover` / `Preorders` のカード画像: `loading="lazy"` は導入済み → `decoding="async"` を追加、
  1枚目の画像のみ `fetchpriority="high"`。
- タブ切替時の白フラッシュ対策: 各ページの初期 state を `loading: true` で統一済みか確認し、
  スケルトン（G-3）で隠す。
- `npm run build` のチャンク確認: Calendar.tsx（110KB）は許容範囲。これ以上の分割は今回しない。

### I-2. アプリアイコン・スプラッシュ

- Android のスプラッシュ背景色をテーマと同じ `#0e0e10` に（`android/app/src/main/res/values/`）。
- アイコンの黄色とアクセント `#FBBF00` が一致していることを確認（ブランド一貫性）。
- ダークモード用 `mipmap` は不要（Android 13+ のテーマアイコンは任意。今回は見送り）。

### I-3. ストア掲載素材（実装外・チェックリストのみ)

- スクリーンショット: ライト/ダーク両方で 発見タブ・カレンダー・予約ページ を撮る（E 完了後が映える）。
- 紹介文に3本柱（参加 → 投稿 → いいねで追加）を1行ずつ。

---

## 8. 実装順序とコミット計画

```
Phase E（ライト/ダーク）         ← 最重要。これだけで「売れる見た目」の8割
 ├─ E-1+E-2: テーマシステム拡張＋アクセント分離     … 1コミット
 ├─ E-3: ハードコード色の置換（ファイル単位で分割）  … 2〜3コミット
 └─ E-4: StatusBar/theme-color 同期                 … 1コミット
Phase F（ネイティブ感）
 ├─ F-1: ConfirmDialog ＋ 15箇所置換                … 1〜2コミット
 ├─ F-2: Toast                                      … 1コミット
 └─ F-3+F-4: ハプティクス＋プレス感                 … 1コミット
Phase G（初回体験）
 ├─ G-1: オンボーディング                           … 1コミット
 └─ G-2+G-3: 空状態＋スケルトン                     … 1コミット
Phase H（磨き込み）              ← 1項目 = 1コミット（個別 revert 可能に）
Phase I（仕上げ）                … 1コミット
```

- 各コミット前に `npx tsc --noEmit` && `npm run build`。
- push ごとに Vercel Preview で確認。**Phase E 完了時点でユーザーに Preview URL で確認を取り、
  ライト/ダークの色味を承認してもらってから F 以降へ進む。**
- E-3 の置換は機械的だが量が多い。1ファイルずつ「grep → 置換 → 両テーマで目視」を回す。

## 9. やらないこと（明示）

- ナビゲーション構成の変更（4タブ + Preorders 導線は現状維持）
- 広告の位置・表示タイミングの変更
- 機能の統合・削除（ヘッダー3連ボタンも v1 決定どおり維持）
- グラデーション・ガラスモーフィズム・3D・パララックスなどの装飾
- 外部 UI ライブラリの導入（shadcn/Material 等は世界観が崩れるため不採用。自前トークンで統一）
- フォント変更（M PLUS 1p 維持。変更するなら別判断）
- カレンダーグリッドのレイアウト方式変更（期間イベント表示は現行のオーバーレイバー方式を維持）

## 10. 完了の定義（2026-06-10 実装完了時点）

- [x] ライト/ダーク/システム/コミュニティ全テーマ対応の実装（Preview での全画面目視はユーザー確認待ち）
- [x] ハードコード白の grep 結果が PhoneFrame の枠＋意図的な白（トグルノブ・ウィジェットプレビュー・画像クロップUI）のみ
- [x] `window.confirm` / `alert` が 0 件（ConfirmDialog / Toast に置換済み）
- [x] 初回起動でオンボーディング → 作品選択まで迷いなく到達できる
- [x] 主要アイコンボタン（月ナビ・チップフィルター）のタップ領域 44px（.tap-44）。🔔⭐は36px視覚+既存余白で準拠
- [x] ネイティブビルドでステータスバーがテーマに追従する（@capacitor/status-bar、assembleDebug 通過確認済み）
- [x] `npx tsc --noEmit` / `npm run build` / `gradlew assembleDebug` すべて通過

### 実装メモ（計画との差分）

- H-3「チェック!」→「サイトを見る」の文言変更はユーザー確認待ちのため未実施
- H-1 の 🔔⭐ は視覚36pxのまま（タイル内レイアウトを崩さないため。実用上のタップ領域はほぼ44px）
- I-2 スプラッシュはデフォルト（白+Capacitorロゴ）だったため、#0e0e10 + アプリアイコンのブランド版を11枚生成して差し替え

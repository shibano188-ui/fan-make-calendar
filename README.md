# Fan Make Calendar

好きな作品のファン同士が協力して作る共有カレンダーWebアプリ。

## 技術スタック

- **フロントエンド**: Vite + React 18 + TypeScript
- **スタイリング**: Tailwind CSS
- **ルーティング**: React Router v6
- **アイコン**: lucide-react
- **データ保存**: localStorage（フェーズ1） → Supabase（フェーズ2）

## 開発手順

### セットアップ

```bash
npm install
npm run dev
```

ブラウザで http://localhost:5173 を開く。

### ビルド

```bash
npm run build
npm run preview
```

## 画面構成

| パス | 画面 |
|------|------|
| `/` | 作品選択画面 |
| `/calendar/:workId` | カレンダー画面 |
| `/calendar/:workId/date/:date` | 日付詳細画面 |
| `/calendar/:workId/post` | 投稿作成画面 |
| `/customize` | カスタマイズ画面 |

## フェーズ構成

- **フェーズ1**: ローカル動作版（localStorage）
- **フェーズ2**: Supabase接続（認証・DB・いいね）
- **フェーズ3**: ウィジェット・テーマ共有・PWA

## デザイン原則

- ダークテーマがデフォルト（背景 `#1a1a1a`）
- 無彩色ベース、装飾最小限
- スマホファースト（max-width: 480px、中央寄せ）

## Supabase セットアップ（フェーズ2）

1. [supabase.com](https://supabase.com) でプロジェクト作成
2. `SPECIFICATION.md` のSQLをSQL Editorで実行
3. プロジェクトルートに `.env.local` を作成:

```
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=xxxxx
```

4. Authentication > Settings で「Enable anonymous sign-ins」を有効化

## 開発資料

- `SPECIFICATION.md` — アプリ仕様書（データモデル・画面仕様）
- `PROMPTS.md` — 段階的な開発プロンプト集
- `mocks/` — デザインモック画像

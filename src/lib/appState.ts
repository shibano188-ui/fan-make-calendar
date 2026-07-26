import { supabase } from './supabase';

// 端末ローカルにしか無かったユーザーデータを、アカウント（uid）に紐づけてサーバーに置く。
//
// 背景: 重要マーク・通知ベル・非表示作品・作品ごとの色は localStorage だけに存在していたため、
//   ・別端末でログインしても引き継がれない（連携の「デバイス間引き継ぎ」が片手落ち）
//   ・ログアウトすると復元できない（消えたように見える）
// という2つの問題があった。ここでサーバーを正にすることで「ログインすれば必ず戻る」が成立する。
//
// 方針: localStorage は今まで通り即時の読み書き先（＝速い）。サーバーへは fire-and-forget で追随させ、
//   起動時に一度だけ引き戻す。失敗しても既存動作を壊さない（握りつぶす）。
//
// 注意: キー名はここが正。constants.ts から import すると循環参照になるため、あえて文字列で持つ。

const TABLE = 'user_app_state';

const KEYS = {
  important_event_ids: 'fan_important_event_ids',
  bell_event_ids:      'fan_bell_event_ids',
  notify_event_ids:    'fan_notify_event_ids',
  hidden_work_ids:     'fan_hidden_work_ids',
  work_colors:         'fan_work_colors',
  muted_event_ids:     'fan_muted_event_ids',
  muted_work_ids:      'fan_muted_work_ids',
} as const;

export type AppStateColumn = keyof typeof KEYS;

// 配列で持つもの（それ以外＝work_colors はオブジェクト）
const IS_ARRAY: Record<AppStateColumn, boolean> = {
  important_event_ids: true,
  bell_event_ids:      true,
  notify_event_ids:    true,
  hidden_work_ids:     true,
  work_colors:         false,
  muted_event_ids:     true,
  muted_work_ids:      true,
};

function readLocal(col: AppStateColumn): unknown {
  try {
    const raw = localStorage.getItem(KEYS[col]);
    if (raw == null) return IS_ARRAY[col] ? [] : {};
    return JSON.parse(raw);
  } catch {
    return IS_ARRAY[col] ? [] : {};
  }
}

function writeLocal(col: AppStateColumn, value: unknown): void {
  try { localStorage.setItem(KEYS[col], JSON.stringify(value)); } catch { /* noop */ }
}

function isEmpty(v: unknown): boolean {
  if (Array.isArray(v)) return v.length === 0;
  if (v && typeof v === 'object') return Object.keys(v).length === 0;
  return v == null;
}

let currentUserId: string | null = null;
let synced = false;
let syncEnabled = false;

export function setAppStateUser(userId: string | null): void {
  currentUserId = userId;
}

/**
 * 端末設定のサーバー同期を使えるか（プレミアム）。
 *
 * 線引き: **アカウントのデータ（投稿・いいね・フォロー・行く日）はログインすれば無料で戻る**。
 * ここで有料にしているのは「端末の設定」＝重要マーク・通知ベル・非表示作品・配色・通知ミュートで、
 * 機種変や2台目に持っていけるかどうか。無効のあいだは localStorage だけで完結し、
 * サーバーには一切書かない・読まない（＝今まで通り単体では普通に動く）。
 */
export function setAppStateSync(enabled: boolean): void {
  syncEnabled = enabled;
  if (!enabled) synced = false; // 同期していない＝ログアウト時にローカルを消してはいけない
}

/**
 * アカウント切替時に端末から捨てる。**同期が成功している場合のみ**捨てる。
 * 未同期（SQL未適用・オフライン等）で消すと、サーバーに写しが無いまま失われるため。
 */
export function clearSyncedAppState(): void {
  if (!synced) return;
  for (const key of Object.values(KEYS)) {
    try { localStorage.removeItem(key); } catch { /* noop */ }
  }
}

/** 1項目をサーバーへ反映（fire-and-forget）。ローカル保存の直後に呼ぶ。 */
export function pushAppState(col: AppStateColumn, value: unknown): void {
  if (!currentUserId || !syncEnabled) return;
  void supabase
    .from(TABLE)
    .upsert({ user_id: currentUserId, [col]: value, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
    .then(() => {}, () => {});
}

/**
 * 起動時の同期。サーバーに値があればそれを採用し、無ければ手元の値を初回アップロードする。
 * 「サーバーに列が null＝一度も同期していない」なので、既存ユーザーの端末データが消えることはない。
 */
export async function syncAppState(userId: string): Promise<void> {
  currentUserId = userId;
  if (!syncEnabled) return;
  try {
    // 列は KEYS から組み立てる（列を足したときに書き換え漏れが起きないように）。
    // ただし新しい列のSQLが未適用の環境では select ごと失敗するので、旧列だけで一度だけ retry する
    // （ここで諦めると既存の同期まで止まってしまう）。
    const ALL_COLS = (Object.keys(KEYS) as AppStateColumn[]).join(',');
    const LEGACY_COLS = 'important_event_ids,bell_event_ids,notify_event_ids,hidden_work_ids,work_colors';
    let { data, error } = await supabase.from(TABLE).select(ALL_COLS).eq('user_id', userId).maybeSingle();
    if (error) {
      ({ data, error } = await supabase.from(TABLE).select(LEGACY_COLS).eq('user_id', userId).maybeSingle());
    }
    if (error) return;

    const row = (data ?? null) as Record<string, unknown> | null;
    const upload: Record<string, unknown> = {};

    for (const col of Object.keys(KEYS) as AppStateColumn[]) {
      const server = row ? row[col] : null;
      if (server == null) {
        // 未同期の項目。手元の値をサーバーへ上げる（空なら上げる必要もない）
        const local = readLocal(col);
        if (!isEmpty(local)) upload[col] = local;
      } else {
        writeLocal(col, server);
      }
    }

    if (Object.keys(upload).length > 0) {
      const { error: upErr } = await supabase
        .from(TABLE)
        .upsert({ user_id: userId, ...upload, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
      if (upErr) return;
    }
    synced = true;
  } catch {
    // オフライン・テーブル未作成でもアプリは通常どおり動く（ローカルが正のまま）
  }
}

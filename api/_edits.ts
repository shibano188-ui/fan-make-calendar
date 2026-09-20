import type { SupabaseClient } from '@supabase/supabase-js';

// 共同編集のパッチ（`event_edits.patch`）を、サーバー側でも events の行に重ねるための共通部品。
// アプリ内の一覧・カレンダーは src/lib/api.ts の ensureEventEdits で重ねているが、
// ics の配信と予約開始のプッシュは events を直接読むので、ここで同じことをする。
// （直した締切で通知が飛ばない・外部カレンダーが古い日付のまま、を防ぐ）
// ※ 本式は「承認された修正を events 本体に書く」（第2段）。そこまでの間の重ね方。

/** パッチの項目名 → events の列名。ここに無い項目（販路の取り消し等）はサーバーでは使わない。 */
const COLUMN: Record<string, string> = {
  date: 'event_date',
  dateLabel: 'date_label',
  endDate: 'end_date',
  time: 'event_time',
  isOrderMade: 'is_order_made',
  preorderStart: 'preorder_start_date',
  preorderEnd: 'preorder_end_date',
};

export type RowPatch = Record<string, unknown>;

/**
 * 予定ごとの実効パッチ（古い順に重ねたもの）を、events の列名で返す。
 * eventIds を渡すとその予定だけ読む。
 */
export async function loadEventPatches(
  db: SupabaseClient,
  eventIds?: string[],
): Promise<Map<string, RowPatch>> {
  const out = new Map<string, RowPatch>();
  if (eventIds && eventIds.length === 0) return out;
  let q = db.from('event_edits').select('event_id, patch, created_at').order('created_at', { ascending: true });
  if (eventIds) q = q.in('event_id', eventIds);
  const { data } = await q;
  for (const r of data ?? []) {
    const patch = (r.patch ?? {}) as Record<string, unknown>;
    const eventId = r.event_id as string;
    const cur = out.get(eventId) ?? {};
    for (const [key, column] of Object.entries(COLUMN)) {
      if (key in patch) cur[column] = patch[key] ?? null;
    }
    if (Object.keys(cur).length) out.set(eventId, cur);
  }
  return out;
}

/** 行の配列にパッチを重ねる（行は id を持つこと）。 */
export function applyPatchesToRows<T extends { id: unknown }>(rows: T[], patches: Map<string, RowPatch>): T[] {
  return rows.map((r) => {
    const p = patches.get(String(r.id));
    return p ? { ...r, ...p } : r;
  });
}

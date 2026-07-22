import { supabase } from './supabase';
import type { Work } from './api';

// 作品の表記ゆれ辞書（名寄せ）。sql/2026-07-22-work-aliases.sql とペア。
// 検索・作品作成時に別名を引き、「検索語と違う作品を選んだ」瞬間に別名を貯める。

/** 照合用の正規化: NFKC・小文字・空白と装飾記号を除去（長音ーは保持） */
export function normalizeWorkName(s: string): string {
  return s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s　]/g, '')
    .replace(/[!！?？・:：;；~〜♪☆★‼⁉。、．，'"「」『』()（）\[\]【】]/g, '');
}

type AliasRow = { work_id: string; works: { id: string; name: string; participant_count: number } | null };

/** 別名から作品を検索（部分一致）。works を join して返す。 */
export async function searchWorksByAlias(query: string, limit = 10): Promise<Work[]> {
  const norm = normalizeWorkName(query);
  if (norm.length < 2) return [];
  const { data, error } = await supabase
    .from('work_aliases')
    .select('work_id, works(id, name, participant_count)')
    .ilike('alias_norm', `%${norm}%`)
    .limit(limit);
  if (error || !data) return [];
  const seen = new Set<string>();
  const out: Work[] = [];
  for (const row of data as unknown as AliasRow[]) {
    const w = row.works;
    if (!w || seen.has(w.id)) continue;
    seen.add(w.id);
    out.push({ id: w.id, name: w.name, participantCount: w.participant_count });
  }
  return out;
}

/** 別名の完全一致で作品を1件引く（getOrCreateWork の重複作成防止用）。 */
export async function findWorkByExactAlias(name: string): Promise<Work | null> {
  const norm = normalizeWorkName(name);
  if (norm.length < 2) return null;
  const { data, error } = await supabase
    .from('work_aliases')
    .select('work_id, works(id, name, participant_count)')
    .eq('alias_norm', norm)
    .maybeSingle();
  if (error || !data) return null;
  const w = (data as unknown as AliasRow).works;
  return w ? { id: w.id, name: w.name, participantCount: w.participant_count } : null;
}

/**
 * 「検索語と違う名前の作品を選んだ」ときに別名として収集（fire-and-forget）。
 * 保守的ルール: 2文字以上・作品名に検索語が含まれない（=通常のilike検索では出会えない真の別名）
 * 途中入力（「ちい」→ちいかわ）のようなノイズは弾く。
 */
export function maybeAddWorkAlias(work: Pick<Work, 'id' | 'name'>, query: string): void {
  const q = query.trim();
  const qNorm = normalizeWorkName(q);
  const nameNorm = normalizeWorkName(work.name);
  if (qNorm.length < 2) return;
  if (nameNorm.includes(qNorm)) return; // 部分一致で見つかる語は別名として不要
  void supabase.from('work_aliases').insert({
    work_id: work.id,
    alias: q,
    alias_norm: qNorm,
    source: 'search_pick',
  }).then(() => {}, () => {}); // unique衝突（登録済み）や未認証は握りつぶす
}

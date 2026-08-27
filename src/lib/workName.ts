import { supabase } from './supabase';

// 作品名の表記ゆれを正式表記に直す。
// 辞書は work_master / work_master_alias（sql/2026-08-27-work-master.sql）。
// 正規化はDB側の関数に寄せてあるので、ここでは生の文字列を渡すだけでよい。

export type WorkNameMatch = 'exact' | 'alias' | 'kana' | 'partial' | 'typo';

export type WorkNameCandidate = {
  name: string;
  reading: string | null;
  popularity: number;
  match: WorkNameMatch;
};

// 表示の判断（既にある作品と同じものか）にだけ使う軽い正規化。
// 正のキーはDB側の work_name_norm が作る。ここは近似でよく、ずれても候補が1つ出るか出ないかの差にしかならない。
const KANA_FOLD: [RegExp, string][] = [[/[ヴゔ]ぁ/g, 'ば'], [/[ヴゔ]ぃ/g, 'び'], [/[ヴゔ]ぇ/g, 'べ'], [/[ヴゔ]ぉ/g, 'ぼ'], [/[ヴゔ]/g, 'ぶ']];

function looseKey(s: string): string {
  let t = s.normalize('NFKC').toLowerCase().replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60));
  for (const [re, to] of KANA_FOLD) t = t.replace(re, to);
  return t.replace(/[ー〜~‐‑–—―-]/g, '').replace(/[^\p{Letter}\p{Number}]/gu, '');
}

/** 表記のゆれを無視して同じ作品名か */
export function sameWorkName(a: string, b: string): boolean {
  const ka = looseKey(a);
  return ka.length > 0 && ka === looseKey(b);
}

/** 確信度が高く、黙って正式表記に直してよい当たり方 */
const CERTAIN: WorkNameMatch[] = ['exact', 'alias', 'kana'];

/** 入力に近い作品名を、確信度の高い順に返す。辞書が無い環境では空配列 */
export async function suggestWorkNames(input: string): Promise<WorkNameCandidate[]> {
  const q = input.trim();
  if (q.length < 2) return [];
  const { data, error } = await supabase.rpc('resolve_work_name', { q });
  if (error || !data) return [];
  return (data as { name: string; reading: string | null; popularity: number; match_kind: WorkNameMatch }[])
    .map(d => ({ name: d.name, reading: d.reading, popularity: d.popularity, match: d.match_kind }));
}

/**
 * 自動で置き換えてよい正式表記。無ければ null（＝候補を見せて選ばせる）。
 * 鍵が一致していても、明らかに知名度の高い別候補があるときは自動にしない。
 * 「ガンダム」は記号が落ちて ∀ガンダム と鍵が一致してしまうが、機動戦士ガンダムの方が有名なので確定させない。
 */
export function autoCanonicalName(candidates: WorkNameCandidate[]): string | null {
  const top = candidates[0];
  if (!top || !CERTAIN.includes(top.match)) return null;
  // 比べる相手は「入力を名前に含む作品」だけ。誤字候補まで見ると、
  // たまたま有名な別作品（ぼざろ→ラザロ）に邪魔されて自動にならない
  const rival = candidates.find(
    c => c.match === 'partial' && c.name !== top.name && c.popularity >= Math.max(top.popularity, 1) * 2,
  );
  return rival ? null : top.name;
}

export type WorkNameResolution = {
  /** そのまま使ってよい正式表記。入力と同じならそのまま */
  canonical: string | null;
  /** 選ばせたい候補（canonical が null のときに使う） */
  candidates: WorkNameCandidate[];
};

export async function resolveWorkName(input: string): Promise<WorkNameResolution> {
  const all = await suggestWorkNames(input);
  // 部分一致が取れているなら誤字候補は雑音でしかないので、見せる候補からは外す
  const candidates = all.some(c => c.match === 'partial') ? all.filter(c => c.match !== 'typo') : all;
  return { canonical: autoCanonicalName(all), candidates };
}

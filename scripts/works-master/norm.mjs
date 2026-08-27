// 照合キーの正規化。sql/2026-08-27-work-master.sql の work_name_norm と同じ結果になるようにしてある。
// 取り込み前に重複を落とすためだけに使う（DB側の生成列が正のキーを作る）。
const KANA_FOLD = [[/[ヴゔ]ぁ/g, 'ば'], [/[ヴゔ]ぃ/g, 'び'], [/[ヴゔ]ぇ/g, 'べ'], [/[ヴゔ]ぉ/g, 'ぼ'], [/[ヴゔ]/g, 'ぶ']];

export function nameNorm(s) {
  let t = s.normalize('NFKC').toLowerCase().replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60));
  for (const [re, to] of KANA_FOLD) t = t.replace(re, to);
  return t.replace(/[ー〜~‐‑–—―\-]/g, '').replace(/[^\p{Letter}\p{Number}]/gu, '');
}

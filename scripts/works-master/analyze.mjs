// 集めたデータを統合し、「今のアプリの正規化」と「強めの正規化」でどこまで拾えるかを検証する。
//   node scripts/works-master/analyze.mjs

import { readFileSync } from 'node:fs';

const DIR = 'scripts/.works-master';
const works = readFileSync(`${DIR}/wikidata.jsonl`, 'utf8').trim().split('\n').map(l => JSON.parse(l));
const redir = new Map(readFileSync(`${DIR}/redirects.jsonl`, 'utf8').trim().split('\n').map(l => {
  const r = JSON.parse(l); return [r.article, r];
}));

// ── 正規化 ──────────────────────────────────────────────
// 今アプリに入っているもの（src/lib/workAliases.ts）
export function normStrict(s) {
  return s.normalize('NFKC').toLowerCase()
    .replace(/[\s　]/g, '')
    .replace(/[!！?？・:：;；~〜♪☆★‼⁉。、．，'"「」『』()（）\[\]【】]/g, '');
}

// 強めの案: カタカナをひらがなに畳み、長音・記号を全部落とす
const KANA_FOLD = [[/[ヴゔ]ぁ/g, 'ば'], [/[ヴゔ]ぃ/g, 'び'], [/[ヴゔ]ぇ/g, 'べ'], [/[ヴゔ]ぉ/g, 'ぼ'], [/[ヴゔ]/g, 'ぶ']];
export function normLoose(s) {
  let t = s.normalize('NFKC').toLowerCase()
    .replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60)); // カタカナ→ひらがな
  for (const [re, to] of KANA_FOLD) t = t.replace(re, to);
  return t
    .replace(/[ー〜~‐‑–—―\-]/g, '')                    // 長音・各種ダッシュ
    .replace(/[^\p{Letter}\p{Number}]/gu, '');          // 記号・空白を全部落とす
}

// ── 統合: 作品ごとに「正式名 + 別名すべて」 ────────────
const entries = [];
for (const w of works) {
  const r = redir.get(w.article);
  const names = new Set([w.title, w.article, ...w.aliases, ...(r?.redirects ?? [])]);
  names.delete(w.title);
  entries.push({
    qid: w.qid, title: w.title, kinds: [...new Set(w.kinds)],
    kana: w.kana ?? r?.defaultsort ?? null,
    aliases: [...names].filter(n => n && n !== w.title),
  });
}

const totalAliases = entries.reduce((n, e) => n + e.aliases.length, 0);
console.log(`作品 ${entries.length} 件 / 別名 ${totalAliases} 件 / かな読み ${entries.filter(e => e.kana).length} 件`);

// ── 別名の内訳: 正規化で吸収できるもの / 部分一致で当たるもの / 辞書が要るもの ──
let byNorm = 0, bySubstr = 0, needDict = 0;
const dictSamples = [];
for (const e of entries) {
  const tS = normStrict(e.title), tL = normLoose(e.title);
  for (const a of e.aliases) {
    if (normStrict(a) === tS) { byNorm++; continue; }               // 今の正規化で既に同じ
    if (normLoose(a) === tL) { byNorm++; continue; }                // 強い正規化で同じ
    if (tL.includes(normLoose(a)) && normLoose(a).length >= 2) { bySubstr++; continue; } // 部分一致で当たる
    needDict++;
    if (dictSamples.length < 5000) dictSamples.push([a, e.title]);
  }
}
console.log(`\n別名の内訳`);
console.log(`  正規化だけで一致   : ${byNorm}\t(記号・かなカナの揺れ)`);
console.log(`  部分一致で当たる   : ${bySubstr}\t(「ガッシュ」型。今の検索でも拾えている)`);
console.log(`  辞書が必要         : ${needDict}\t(「ドラクエ」型。辞書がないと絶対に当たらない)`);

// ── 衝突: 別名の正規化キーが複数の作品にぶつかる数 ──
function collisions(norm) {
  const map = new Map();
  for (const e of entries) {
    for (const n of [e.title, ...e.aliases]) {
      const k = norm(n);
      if (k.length < 2) continue;
      if (!map.has(k)) map.set(k, new Set());
      map.get(k).add(e.qid);
    }
  }
  const bad = [...map.entries()].filter(([, s]) => s.size > 1);
  return { keys: map.size, collided: bad.length, sample: bad.slice(0, 8).map(([k, s]) => [k, [...s].length]) };
}
const cS = collisions(normStrict), cL = collisions(normLoose);
console.log(`\n衝突（同じ鍵に別作品がぶつかる）`);
console.log(`  今の正規化 : 鍵 ${cS.keys} 件中 ${cS.collided} 件が衝突（${(cS.collided / cS.keys * 100).toFixed(1)}%）`);
console.log(`  強い正規化 : 鍵 ${cL.keys} 件中 ${cL.collided} 件が衝突（${(cL.collided / cL.keys * 100).toFixed(1)}%）`);

console.log(`\n「辞書が必要」な別名のサンプル（ランダム30件）`);
for (let i = 0; i < 30; i++) {
  const [a, t] = dictSamples[Math.floor(Math.random() * dictSamples.length)];
  console.log(`  ${a}  →  ${t}`);
}

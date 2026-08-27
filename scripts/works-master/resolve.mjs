// 集めた別名を選別して索引を作り、実際の入力が正式名に直せるかを試す。
//   node scripts/works-master/resolve.mjs
//
// 別名の出どころは2つあり、質がまったく違うので扱いを分ける:
//   Wikidata の別名  … 人が手で入れている。精度が高いので無条件で採用
//   Wikipedia のリダイレクト … 量は多いがキャラ名・楽曲名・派生作品が大量に混ざる。
//                            「正式名より短く、文字が同じ順に並ぶ」ものだけ略称とみなす

import { readFileSync, writeFileSync } from 'node:fs';

const DIR = 'scripts/.works-master';
const works = readFileSync(`${DIR}/wikidata.jsonl`, 'utf8').trim().split('\n').map(l => JSON.parse(l));
const redir = new Map(readFileSync(`${DIR}/redirects.jsonl`, 'utf8').trim().split('\n').map(l => {
  const r = JSON.parse(l); return [r.article, r];
}));

// ── 正規化 ────────────────────────────────────────────
const KANA_FOLD = [[/[ヴゔ]ぁ/g, 'ば'], [/[ヴゔ]ぃ/g, 'び'], [/[ヴゔ]ぇ/g, 'べ'], [/[ヴゔ]ぉ/g, 'ぼ'], [/[ヴゔ]/g, 'ぶ']];
/** 照合キー: NFKC・小文字・カタカナ→ひらがな・長音とダッシュ除去・記号と空白を全除去 */
function norm(s) {
  let t = s.normalize('NFKC').toLowerCase().replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60));
  for (const [re, to] of KANA_FOLD) t = t.replace(re, to);
  return t.replace(/[ー〜~‐‑–—―\-]/g, '').replace(/[^\p{Letter}\p{Number}]/gu, '');
}

// かな照合用。WikipediaのDEFAULTSORTは「しゆしゆつかいせん」のように
// 濁点なし・小書きなし・長音は母音に開く決まりなので、入力側も同じ形に潰す
const SMALL = { 'ぁ': 'あ', 'ぃ': 'い', 'ぅ': 'う', 'ぇ': 'え', 'ぉ': 'お', 'っ': 'つ', 'ゃ': 'や', 'ゅ': 'ゆ', 'ょ': 'よ', 'ゎ': 'わ' };
const VOWEL = { あ: 'あ', か: 'あ', さ: 'あ', た: 'あ', な: 'あ', は: 'あ', ま: 'あ', や: 'あ', ら: 'あ', わ: 'あ', い: 'い', き: 'い', し: 'い', ち: 'い', に: 'い', ひ: 'い', み: 'い', り: 'い', う: 'う', く: 'う', す: 'う', つ: 'う', ぬ: 'う', ふ: 'う', む: 'う', ゆ: 'う', る: 'う', え: 'え', け: 'え', せ: 'え', て: 'え', ね: 'え', へ: 'え', め: 'え', れ: 'え', お: 'お', こ: 'お', そ: 'お', と: 'お', の: 'お', ほ: 'お', も: 'お', よ: 'お', ろ: 'お', を: 'お' };
function kanaKey(s) {
  let t = s.normalize('NFKC').toLowerCase()
    .replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60))
    .normalize('NFD').replace(/[゙゚]/g, '').normalize('NFC')  // 濁点・半濁点を落とす
    .replace(/[ぁぃぅぇぉっゃゅょゎ]/g, c => SMALL[c]);
  t = t.replace(/[ー〜~]/g, (_, i) => VOWEL[t[i - 1]] ?? '');            // 長音を母音に開く
  return t.replace(/[^\p{Script=Hiragana}]/gu, '');
}

const stripDisamb = s => s.replace(/\s*[(（][^()（）]*[)）]\s*$/, '').trim();
// Wikipediaの記事名は「ドラゴンクエストシリーズ」のように接尾辞が付く。作品名としては不自然なので落とす
const stripSeries = s => { const t = s.replace(/\s*シリーズ$/, '').trim(); return t.length >= 2 ? t : s; };
function isSubsequence(a, b) { let i = 0; for (const c of b) if (c === a[i] && ++i === a.length) return true; return i === a.length; }

// ── 選別 ──────────────────────────────────────────────
const entries = [];
const stats = { free: 0, wd: 0, redirSub: 0, redirDrop: 0 };
const kept = [], dropped = [];

for (const w of works) {
  const r = redir.get(w.article);
  const kana = w.kana ?? r?.defaultsort ?? null;
  // 正式名は Wikipedia の記事名（曖昧さ回避の括弧だけ落とす）を採る。
  // Wikidataのラベルは誤字が混ざる（例:「Re:ゼロから始める異世界生活」）ので別名側に回す
  const title = stripSeries(stripDisamb(w.article) || w.title);
  const tN = norm(title), tK = kana ? kanaKey(kana) : '';
  const aliases = [];
  const add = (a, why) => {
    const aN = norm(a);
    if (!a || a === title || aN.length < 2) return false;
    if (aN === tN) { stats.free++; return true; }   // 正規化だけで一致＝辞書に載せる必要なし
    aliases.push(a); stats[why]++; kept.push([a, title, why]);
    return true;
  };
  for (const a of [w.title, stripDisamb(w.article), ...w.aliases]) add(stripDisamb(a), 'wd');
  for (const a of (r?.redirects ?? [])) {
    const s = stripDisamb(a), aN = norm(s), aK = kanaKey(s);
    if (!s || s === title || aN.length < 2) continue;
    if (aN === tN) { stats.free++; continue; }
    if (aliases.includes(s)) continue;
    // 正式名の一部か、正式名かかな読みを飛ばし読みした形なら略称とみなす
    const ok = tN.includes(aN)
      || (aN.length < tN.length && isSubsequence(aN, tN))
      || (tK && aK.length >= 2 && aK.length < tK.length && isSubsequence(aK, tK));
    if (ok) add(s, 'redirSub');
    else { stats.redirDrop++; dropped.push([s, title]); }
  }
  entries.push({ qid: w.qid, title, kinds: [...new Set(w.kinds)], sitelinks: w.sitelinks ?? 0, kana, aliases });
}

// 同じ作品がアニメ版・漫画版・フランチャイズで別行になっているのをまとめる。
// FanHive では「呪術廻戦」はひとつのカレンダーなので、ここで1件に畳んでおく
const merged = new Map();
for (const e of entries) {
  const k = norm(e.title);
  const prev = merged.get(k);
  if (!prev) { merged.set(k, { ...e, aliases: [...e.aliases] }); continue; }
  prev.sitelinks = Math.max(prev.sitelinks, e.sitelinks);
  prev.kana = prev.kana ?? e.kana;
  for (const kind of e.kinds) if (!prev.kinds.includes(kind)) prev.kinds.push(kind);
  for (const a of e.aliases) if (!prev.aliases.includes(a)) prev.aliases.push(a);
}
const dupes = entries.length - merged.size;
entries.length = 0;
entries.push(...merged.values());

console.log(`作品 ${entries.length} 件（同一名の統合で ${dupes} 件を吸収）/ かな読み ${entries.filter(e => e.kana).length} 件`);
console.log(`別名の選別`);
console.log(`  正規化で吸収（辞書不要）  : ${stats.free}`);
console.log(`  採用: Wikidataの別名      : ${stats.wd}`);
console.log(`  採用: リダイレクトの略称  : ${stats.redirSub}`);
console.log(`  除外: キャラ名・楽曲・派生: ${stats.redirDrop}`);
console.log(`  → 辞書に載る別名          : ${stats.wd + stats.redirSub}`);

const pick = (a, n) => Array.from({ length: n }, () => a[Math.floor(Math.random() * a.length)]);
console.log(`\n採用サンプル`);
for (const [a, t, why] of pick(kept, 12)) console.log(`  ${a}  →  ${t}   (${why})`);
console.log(`\n除外サンプル`);
for (const [a, t] of pick(dropped, 8)) console.log(`  ${a}  →  ${t}`);

// ── 索引 ──────────────────────────────────────────────
const byNorm = new Map(), byKana = new Map(), collide = [];
// 知名度（何言語に記事があるか）の高い順に入れる。同点なら別名が多い方＝情報が集まっている方
const ranked = [...entries].sort((a, b) => (b.sitelinks - a.sitelinks) || (b.aliases.length - a.aliases.length));
for (const e of ranked) {
  for (const n of [e.title, ...e.aliases]) {
    const k = norm(n);
    if (k.length < 2) continue;
    if (byNorm.has(k)) { if (byNorm.get(k).qid !== e.qid) collide.push([k, byNorm.get(k).title, e.title]); continue; }
    byNorm.set(k, e);
  }
  if (e.kana) { const k = kanaKey(e.kana); if (k.length >= 2 && !byKana.has(k)) byKana.set(k, e); }
}
console.log(`\n索引: 表記 ${byNorm.size} 件 / かな ${byKana.size} 件 / 鍵の衝突 ${collide.length} 件`);
console.log(`衝突サンプル（知名度が高い方が勝つ）`);
for (const [k, a, b] of pick(collide, 5)) console.log(`  ${k}: ${a}  ×  ${b}`);

function lev(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]; let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (cur[j] < best) best = cur[j];
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

/** 関門を上から順に落としていく。auto=true は黙って正式名に直してよいもの */
function resolve(input) {
  const q = norm(input);
  if (q.length < 2) return null;
  const hit = byNorm.get(q);
  if (hit) {
    let rival = null;
    for (const [k, e] of byNorm) {
      if (e.qid === hit.qid || !k.includes(q)) continue;
      if (e.sitelinks >= hit.sitelinks * 2 && (!rival || e.sitelinks > rival.sitelinks)) rival = e;
    }
    if (rival) return { title: hit.title, how: '表記一致だが紛らわしい', auto: false, others: [rival.title] };
    return { title: hit.title, how: '表記一致', auto: true };
  }
  const kq = kanaKey(input);
  if (kq.length >= 2 && byKana.has(kq)) return { title: byKana.get(kq).title, how: 'かな読み一致', auto: true };
  // 部分一致（「ガッシュ」→「金色のガッシュ!!」）。1件だけなら自動、複数なら選ばせる
  const subs = [];
  const push = e => { if (!subs.some(x => x.qid === e.qid)) subs.push(e); };
  for (const [k, e] of byNorm) if (k.includes(q)) { push(e); if (subs.length > 8) break; }
  // かな読みでも拾う。「のぎざか46」は読みが「のきさかふおおていいしつくす」なので前方一致でしか当たらない
  if (subs.length < 8 && kq.length >= 3) for (const [k, e] of byKana) if (k.startsWith(kq)) { push(e); if (subs.length > 8) break; }
  if (subs.length >= 1) {
    subs.sort((a, b) => norm(a.title).length - norm(b.title).length);
    return { title: subs[0].title, how: `部分一致 ${subs.length}件`, auto: false, others: subs.slice(1, 4).map(e => e.title) };
  }
  const max = q.length <= 5 ? 1 : 2;
  let best = null, bestD = max + 1;
  for (const [k, e] of byNorm) {
    if (Math.abs(k.length - q.length) > max) continue;
    const d = lev(q, k, max);
    if (d < bestD) { bestD = d; best = e; if (d === 1) break; }
  }
  return best ? { title: best.title, how: `もしかして(距離${bestD})`, auto: false } : null;
}

const TESTS = [
  ['ガッシュ', '略称'], ['ハイキュー', '記号落ち'], ['ドラクエ', '略称'], ['ぼっちざろっく', '中黒落ち'],
  ['ぼざろ', '略称'], ['呪術回戦', '誤字'], ['まほあこ', '略称'], ['俺ガイル', '略称'], ['リゼロ', '略称'],
  ['あの花', '略称'], ['けいおん', '記号落ち'], ['SAO', '略称'], ['Fate stay night', '記号落ち'],
  ['進撃の巨神', '誤字'], ['じゅじゅつかいせん', 'かな入力'], ['バイオレットエバーガーデン', 'ヴ揺れ'],
  ['鬼滅', '略称'], ['スパイファミリー', 'カナ表記'], ['転スラ', '略称'], ['推しの子', '記号落ち'],
  ['ウマ娘', '略称'], ['ラブライブ', '記号落ち'], ['ポケモン', '略称'], ['あんスタ', '略称'],
  ['ゆるキャン', '記号落ち'], ['プリキュア', 'シリーズ名'], ['ガンダム', 'シリーズ名'],
  // ここから今回広げた範囲
  ['ホロライブ', 'VTuber事務所'], ['にじさんじ', 'VTuber事務所'], ['兎田ぺこら', 'VTuber'],
  ['ぺこら', 'VTuber略称'], ['ぶいすぽ', 'VTuber事務所略称'], ['星街すいせい', 'VTuber'],
  ['乃木坂46', 'アイドル'], ['のぎざか46', 'かな入力'], ['櫻坂', 'アイドル記号落ち'],
  ['ヒゲダン', 'バンド略称'], ['キングヌー', 'バンドかな'], ['ヨルシカ', 'バンド'],
  ['梶裕貴', '声優'], ['花澤香菜', '声優'], ['はなざわかな', '声優かな入力'], ['宝塚歌劇団', '劇団'],
];

console.log(`\n実際に引いてみる`);
let auto = 0, ask = 0, miss = 0;
for (const [q, kind] of TESTS) {
  const r = resolve(q);
  const mark = r ? (r.auto ? '自動' : '確認') : '不明';
  if (!r) miss++; else if (r.auto) auto++; else ask++;
  console.log(`  [${mark}] ${q.padEnd(16)} ${kind.padEnd(7)} → ${r ? r.title : '見つからず'}${r?.others ? `  他: ${r.others.join(' / ')}` : ''}${r ? `  [${r.how}]` : ''}`);
}
console.log(`\n自動 ${auto} / 確認 ${ask} / 不明 ${miss}`);

writeFileSync(`${DIR}/master.jsonl`, entries.map(e => JSON.stringify(e)).join('\n') + '\n');
console.log(`→ ${DIR}/master.jsonl`);

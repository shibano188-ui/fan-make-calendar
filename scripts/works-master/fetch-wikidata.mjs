// Wikidata から「アニメ・漫画・ゲーム作品」の正式名と別名を集める（表記ゆれ辞書の初期値づくり）。
// 日本語版Wikipediaに記事があるものだけに絞る = 実在してある程度知られている作品、かつ
// 次の工程（リダイレクト＝略称集め）で記事名が必要になるため。
//
//   node scripts/works-master/fetch-wikidata.mjs
//   → scripts/.works-master/wikidata.jsonl

import { writeFileSync } from 'node:fs';

const UA = 'FanHive-works-master/1.0 (https://github.com/shibano188-ui/fan-make-calendar; shisoh0501@gmail.com)';
const ENDPOINT = 'https://query.wikidata.org/sparql';
const OUT = 'scripts/.works-master/wikidata.jsonl';
const SEP = '|';

// 種別ごとに分けて投げる。ひとまとめにすると60秒の実行制限に引っかかる。
const TYPES = {
  anime: ['Q63952888', 'Q20650540', 'Q220898', 'Q1107'],    // アニメTVシリーズ / アニメ映画 / OVA / アニメ
  manga: ['Q21198342', 'Q8274', 'Q747381', 'Q104213567'],   // 漫画シリーズ / 漫画 / ライトノベル / ライトノベルシリーズ
  game: ['Q7889', 'Q7058673'],                              // ゲーム / ゲームシリーズ
  // 「作品」としてはこれが本命。ラブライブ! や 呪術廻戦 のように
  // アニメ・漫画・ゲームにまたがるものは、この型に本体がある
  franchise: ['Q196600', 'Q18591554'],                      // メディア・フランチャイズ / メディアミックス
};

function sparql(qids) {
  const values = qids.map(q => `wd:${q}`).join(' ');
  return `
SELECT ?item ?label ?article ?sitelinks (GROUP_CONCAT(DISTINCT ?alias; separator="${SEP}") AS ?aliases) (SAMPLE(?kanaRaw) AS ?kana) WHERE {
  VALUES ?type { ${values} }
  ?item wdt:P31 ?type .
  ?article schema:about ?item ; schema:isPartOf <https://ja.wikipedia.org/> .
  ?item rdfs:label ?label . FILTER(lang(?label) = "ja")
  OPTIONAL { ?item skos:altLabel ?alias . FILTER(lang(?alias) = "ja") }
  OPTIONAL { ?item wdt:P1814 ?kanaRaw . }
  ?item wikibase:sitelinks ?sitelinks .   # 何言語のWikipediaに記事があるか＝知名度の目安。鍵がぶつかったときの優先順位に使う
}
GROUP BY ?item ?label ?article ?sitelinks`;
}

async function run(query, tries = 3) {
  for (let i = 0; i < tries; i++) {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Accept': 'application/sparql-results+json', 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA },
      body: new URLSearchParams({ query }),
    });
    if (res.ok) return (await res.json()).results.bindings;
    const body = await res.text();
    console.error(`  失敗 ${res.status}（${i + 1}/${tries}）: ${body.slice(0, 200)}`);
    await new Promise(r => setTimeout(r, 5000 * (i + 1)));
  }
  throw new Error('SPARQL が3回とも失敗');
}

const rows = new Map(); // qid → row（同じ作品が複数の種別に該当することがあるので統合）

for (const [kind, qids] of Object.entries(TYPES)) {
  process.stderr.write(`${kind} を取得中…\n`);
  const bindings = await run(sparql(qids));
  for (const b of bindings) {
    const qid = b.item.value.replace('http://www.wikidata.org/entity/', '');
    const article = decodeURIComponent(b.article.value.replace('https://ja.wikipedia.org/wiki/', '')).replace(/_/g, ' ');
    const aliases = b.aliases?.value ? b.aliases.value.split(SEP).filter(Boolean) : [];
    const prev = rows.get(qid);
    if (prev) {
      prev.kinds.push(kind);
      for (const a of aliases) if (!prev.aliases.includes(a)) prev.aliases.push(a);
    } else {
      rows.set(qid, { qid, title: b.label.value, article, sitelinks: Number(b.sitelinks?.value ?? 0), kana: b.kana?.value ?? null, aliases, kinds: [kind] });
    }
  }
  process.stderr.write(`  ${bindings.length} 行 → 累計 ${rows.size} 作品\n`);
}

writeFileSync(OUT, [...rows.values()].map(r => JSON.stringify(r)).join('\n') + '\n');

const all = [...rows.values()];
const withAlias = all.filter(r => r.aliases.length > 0);
console.log(`\n作品数: ${all.length}`);
console.log(`別名を持つ作品: ${withAlias.length}（${Math.round(withAlias.length / all.length * 100)}%）`);
console.log(`別名の総数: ${withAlias.reduce((n, r) => n + r.aliases.length, 0)}`);
console.log(`かな読みあり: ${all.filter(r => r.kana).length}`);
console.log(`→ ${OUT}`);

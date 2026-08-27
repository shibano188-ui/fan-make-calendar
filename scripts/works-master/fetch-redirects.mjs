// 日本語版Wikipediaの「リダイレクト」を作品ごとに集める。
// 「ドラクエ」→「ドラゴンクエスト」のような略称は、Wikipedia上ではリダイレクトとして実在する。
// ついでに DEFAULTSORT（記事の並び順キー）を取る＝ほぼそのまま作品のかな読みになる。
//
//   node scripts/works-master/fetch-redirects.mjs
//   → scripts/.works-master/redirects.jsonl（途中で止めても再実行で続きから）

import { readFileSync, appendFileSync, existsSync } from 'node:fs';

const UA = 'FanHive-works-master/1.0 (https://github.com/shibano188-ui/fan-make-calendar; shisoh0501@gmail.com)';
const API = 'https://ja.wikipedia.org/w/api.php';
const IN = 'scripts/.works-master/wikidata.jsonl';
const OUT = 'scripts/.works-master/redirects.jsonl';
const BATCH = 50; // 匿名利用の上限

const articles = readFileSync(IN, 'utf8').trim().split('\n').map(l => JSON.parse(l).article);
const done = existsSync(OUT)
  ? new Set(readFileSync(OUT, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l).article))
  : new Set();
const todo = [...new Set(articles)].filter(a => !done.has(a));
process.stderr.write(`対象 ${todo.length} 件（済 ${done.size} 件）\n`);

async function api(params, tries = 4) {
  const url = `${API}?${new URLSearchParams({ action: 'query', format: 'json', formatversion: '2', ...params })}`;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA } });
      if (res.ok) return await res.json();
      if (res.status === 429) await new Promise(r => setTimeout(r, 10000));
    } catch { /* 通信エラーは黙って再試行 */ }
    await new Promise(r => setTimeout(r, 2000 * (i + 1)));
  }
  return null;
}

for (let i = 0; i < todo.length; i += BATCH) {
  const batch = todo.slice(i, i + BATCH);
  // ページ単位で貯める。リダイレクトが500件を超える記事があるので continue を回す
  const acc = new Map(batch.map(a => [a, { article: a, defaultsort: null, redirects: [] }]));
  let cont = {};
  for (let guard = 0; guard < 10; guard++) {
    const json = await api({
      titles: batch.join('|'),
      prop: 'redirects|pageprops',
      ppprop: 'defaultsort',
      rdlimit: 'max',
      rdnamespace: '0',
      ...cont,
    });
    if (!json) break;
    // normalized: 送ったタイトルがAPI側で正規化された場合の対応表
    const norm = new Map((json.query?.normalized ?? []).map(n => [n.to, n.from]));
    for (const p of json.query?.pages ?? []) {
      const key = norm.get(p.title) ?? (acc.has(p.title) ? p.title : null);
      const row = key ? acc.get(key) : null;
      if (!row) continue;
      if (p.pageprops?.defaultsort) row.defaultsort = p.pageprops.defaultsort;
      for (const r of p.redirects ?? []) row.redirects.push(r.title);
    }
    if (!json.continue) break;
    cont = json.continue;
  }
  appendFileSync(OUT, [...acc.values()].map(r => JSON.stringify(r)).join('\n') + '\n');
  if ((i / BATCH) % 20 === 0) process.stderr.write(`  ${i + batch.length}/${todo.length}\n`);
  await new Promise(r => setTimeout(r, 100));
}

const rows = readFileSync(OUT, 'utf8').trim().split('\n').map(l => JSON.parse(l));
console.log(`\n記事数: ${rows.length}`);
console.log(`リダイレクトを持つ記事: ${rows.filter(r => r.redirects.length > 0).length}`);
console.log(`リダイレクト総数: ${rows.reduce((n, r) => n + r.redirects.length, 0)}`);
console.log(`かな読み(DEFAULTSORT)あり: ${rows.filter(r => r.defaultsort).length}`);

// LP（public/lp.html）の本物の <head> に、OG と twitter のタグを書き込む。
//
// なぜ要るか:
//   lp.html はデザインツールが書き出したバンドル形式で、og:title などのタグは
//   末尾のテンプレート（<script type="__bundler/template"> の JSON 文字列、先頭から約7.3MB）の中にしか無い。
//   JavaScript が動いて初めて <head> に入るので、JS を実行しない X のクローラーには見えず、カードが出なかった。
//   そこで同じ値を、<title> の直後にふつうの HTML として書いておく。
//
// 使い方:
//   デザインツールから lp.html を書き出し直したら、必ずこれを実行してからコミットする。
//     node scripts/lp-og-tags.mjs
//   何度実行しても同じ結果になる（前に書いた分は目印のコメントごと置き換える）。
//
// 値の出どころ:
//   テンプレートの中の meta（description・og:*・twitter:card・canonical）をそのまま写す。
//   文言を変えたいときはデザインツール側で直して書き出し、これを実行し直す（ここに値を書かない）。
//   twitter:title / twitter:description / twitter:image はテンプレートに無いので、og の値から作る。
//
// 確かめ方:
//   curl -s -A Twitterbot https://fanhive.jp/lp.html | head -c 3000
import fs from 'node:fs';

const FILE = 'public/lp.html';
const START = '<!-- lp-og-tags:start（scripts/lp-og-tags.mjs が書く。手で直さない） -->';
const END = '<!-- lp-og-tags:end -->';

const html = fs.readFileSync(FILE, 'utf8');

// テンプレート（JSON 文字列）を取り出して、中の meta を読む
const tm = html.match(/<script type="__bundler\/template">\s*\n(.*)\n\s*<\/script>/);
if (!tm) throw new Error('テンプレート（__bundler/template）が見つからない。書き出しの形式が変わった？');
const template = JSON.parse(tm[1]);

const attr = (tag, name) => tag.match(new RegExp(`${name}="([^"]*)"`))?.[1];
const metas = new Map();
for (const tag of template.match(/<meta [^>]*>/g) ?? []) {
  const key = attr(tag, 'property') ?? attr(tag, 'name');
  const content = attr(tag, 'content');
  if (key && content !== undefined && !metas.has(key)) metas.set(key, content);
}
const canonical = template.match(/<link rel="canonical" href="([^"]*)"/)?.[1];

const need = ['og:title', 'og:description', 'og:type', 'og:image', 'og:url', 'twitter:card'];
const missing = need.filter((k) => !metas.get(k));
if (missing.length) throw new Error(`テンプレートに無い: ${missing.join(', ')}`);
for (const k of ['og:image', 'og:url']) {
  if (!/^https:\/\//.test(metas.get(k))) throw new Error(`${k} が絶対URLではない: ${metas.get(k)}`);
}

// テンプレートの値は HTML の属性値として書かれたものなので、そのまま使える（エスケープ済み）
const lines = [];
if (metas.has('description')) lines.push(`<meta name="description" content="${metas.get('description')}">`);
for (const k of ['og:title', 'og:description', 'og:type', 'og:url', 'og:site_name', 'og:image', 'og:image:width', 'og:image:height']) {
  if (metas.has(k)) lines.push(`<meta property="${k}" content="${metas.get(k)}">`);
}
lines.push(`<meta name="twitter:card" content="${metas.get('twitter:card')}">`);
lines.push(`<meta name="twitter:title" content="${metas.get('twitter:title') ?? metas.get('og:title')}">`);
lines.push(`<meta name="twitter:description" content="${metas.get('twitter:description') ?? metas.get('og:description')}">`);
lines.push(`<meta name="twitter:image" content="${metas.get('twitter:image') ?? metas.get('og:image')}">`);
if (canonical) lines.push(`<link rel="canonical" href="${canonical}">`);

const block = [START, ...lines, END].map((l) => `  ${l}`).join('\n');

// 前に書いた分を消してから、<title> の直後に入れ直す
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
let out = html.replace(new RegExp(`\\n[ \\t]*${escapeRe(START)}[\\s\\S]*?${escapeRe(END)}`), '');
const headEnd = out.indexOf('</head>');
const titleEnd = out.indexOf('</title>');
if (titleEnd < 0 || headEnd < 0 || titleEnd > headEnd) throw new Error('<head> の中に <title> が見つからない');
const at = titleEnd + '</title>'.length;
out = out.slice(0, at) + '\n' + block + out.slice(at);

fs.writeFileSync(FILE, out);
const pos = out.indexOf(END) + END.length;
console.log(`${FILE}: ${lines.length} 個のタグを書いた（先頭から ${Buffer.byteLength(out.slice(0, pos))} バイト以内）`);

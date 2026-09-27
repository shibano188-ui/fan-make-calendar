// 商品の一覧（_listsource.ts）を予定のまとまりに分ける。AIは使わない（本人要望・2026-09-27）。
// まとめるのは「同じ企画の、同じアイテムの、キャラ違い・柄違い」だけ。それ以外は1商品で1件。
// サムネイルには1商品しか出ないので、別のアイテム（クリアファイルとアクスタ）を混ぜると見逃される。
// 名前がほぼ同じでもアイテムが違えば分ける。迷ったら分ける側に倒す。
import { createClient } from '@supabase/supabase-js';
import { stripShopNoise } from './_product-search.js';
import type { ListProduct } from './_listsource.js';

// アイテムを表す語。まとまりの共通部分にこれが入っていれば「同じアイテム」、違いの部分に入っていれば別のアイテム。
// 足りない語があっても、まとまらない（分かれる）だけで混ざりはしない
const ITEM_WORDS = [
  'アクリルスタンド', 'アクスタ', 'アクリルキーホルダー', 'アクキー', 'アクリルチャーム', 'アクリルブロック', 'アクリルパネル',
  'アクリルクリップ', 'キーホルダー', 'キーリング', 'チャーム', 'ストラップ', '缶バッジ', '缶バッチ', 'バッジ',
  'ぬいぐるみ', 'マスコット', 'フィギュア', 'クリアファイル', 'ファイル', 'ステッカー', 'シール', 'ポストカード',
  'ブロマイド', 'カード', '色紙', 'タペストリー', 'ポスター', 'クッション', 'ブランケット', 'タオル', 'ハンカチ',
  'ランチョンマット', 'ポーチ', 'バッグ', 'トート', '巾着', 'マグカップ', 'グラス', 'タンブラー', '湯呑', '茶碗',
  'プレート', '箸置き', 'おちょこ', 'とっくり', 'コースター', 'お守り', 'マグネット', 'のぼり', 'メモ', 'ノート',
  'ボールペン', '下敷き', 'カレンダー', 'Tシャツ', 'パーカー', 'キャップ', 'ソックス', '靴下', 'ルームシューズ',
  'ミラー', '手ぬぐい', 'スタンド', 'パネル', 'ぬい',
].map((w) => w.normalize('NFKC').toLowerCase()).sort((a, b) => b.length - a.length);
const itemWordIn = (s: string) => ITEM_WORDS.find((w) => s.toLowerCase().includes(w)) ?? null;

// カテゴリ（src/lib/constants.ts の GOODS_SUBCATEGORIES）。上から順に当てる
const CATEGORY_RULES: [string, RegExp][] = [
  ['くじ', /くじ/], ['ガチャ', /ガチャ|カプセル/], ['プライズ', /プライズ/],
  // 「グミ」「ガム」は「トレーディングミニ」に当たるので使わない
  ['食玩', /食玩|ウエハース|チョコ/], ['円盤', /blu-?ray|dvd|\bcd\b|サウンドトラック/i],
  // 「オードトワレ＜アクリルスタンド付＞」は香水。付属品のアクスタより先に見る
  ['コスメ', /香水|フレグランス|オードトワレ|オードパルファ|コスメ|(?<!ク)リップ|ネイル|ハンドクリーム/],
  ['フィギュア', /フィギュア|ねんどろいど|figma/i], ['ぬい', /ぬいぐるみ|マスコット|ぬい/],
  ['アクスタ', /アクリルスタンド|アクスタ|スタンド/], ['缶バッジ', /缶バッ|バッジ/],
  ['キーホルダー', /キーホルダー|アクキー|キーリング|チャーム|ストラップ/], ['文房具', /カレンダー|手帳/], ['ステッカー', /ステッカー|シール/],
  ['カード', /カード|ブロマイド|色紙/], ['文房具', /ファイル|ボールペン|ノート|メモ|下敷き|文具|ペンケース/],
  ['アパレル', /tシャツ|パーカー|キャップ|ソックス|靴下|ルームシューズ/i],
  ['ガジェット', /イヤホン|充電|スマホケース|モバイルバッテリー/],
];
export const categoryOf = (title: string) => CATEGORY_RULES.find(([, re]) => re.test(title))?.[0] ?? '雑貨';

const SEP = /[\s・/~〜～＜＞<>()（）【】「」『』[\]、,]/;
// 長音「ー」は落とさない（「ステッカー（うさぎ）」の頭が「ステッカ」になる）
const TRIM = /^[\s・/\-~〜～、,.:：＜＞<>()（）【】「」『』[\]]+|[\s・/\-~〜～、,.:：＜＞<>()（）【】「」『』[\]]+$/g;
const OPEN = /[(（]$/;
const CLOSE = /^[)）]/;
// 弾・期・vol の違いは別の商品（発売も別）。キャラ違いとしてまとめない
const SERIES_NO = /第\s*[\d一二三四五六七八九十]+\s*[弾期]|vol\.?\s*\d|part\.?\s*\d|シーズン\s*\d/i;

/** 切り出しで片方だけ残った括弧を閉じる（「五条悟(戎橋」→「五条悟(戎橋)」） */
const PAIRS: [string, string][] = [['(', ')'], ['【', '】'], ['「', '」'], ['『', '』'], ['<', '>']];
function balance(s: string): string {
  let out = s;
  for (const [o, c] of PAIRS) {
    const n = out.split(o).length - out.split(c).length;
    if (n > 0) out += c.repeat(n);
  }
  return out;
}
/** まとまりの見出しの頭と尻。区切りと、違いの部分を囲んでいた括弧だけ落とす（『呪術廻戦』の』は残す） */
const headPart = (s: string) => s.replace(/[\s・/、,~〜～-]*[(【「『<]?[\s・/、,~〜～-]*$/, '');
const tailPart = (s: string) => s.replace(/^[\s・/、,~〜～-]*[)】」』>]?[\s・/、,~〜～-]*/, '');

/** a と b の共通の頭と尻（区切り文字の位置まで戻す） */
function sharedEnds(a: string, b: string): { pre: number; suf: number } {
  let pre = 0; while (pre < a.length && pre < b.length && a[pre] === b[pre]) pre++;
  let suf = 0; while (suf < a.length - pre && suf < b.length - pre && a[a.length - 1 - suf] === b[b.length - 1 - suf]) suf++;
  while (pre > 0 && !SEP.test(a[pre - 1])) pre--;
  while (suf > 0 && !SEP.test(a[a.length - suf])) suf--;
  return { pre, suf };
}

/** 頭と尻を共有する名前たちが「同じアイテムのキャラ違い・柄違い」か。違いの部分を返す（違えば null） */
function variantLabels(titles: string[]): string[] | null {
  if (titles.length < 2) return null;
  const ends = titles.slice(1).map((t) => sharedEnds(titles[0], t));
  const pre = Math.min(...ends.map((e) => e.pre));
  const suf = Math.min(...ends.map((e) => e.suf));
  const head = titles[0].slice(0, pre);
  const tail = titles[0].slice(titles[0].length - suf);
  if ((head + tail).replace(TRIM, '').length < 4) return null;
  const labels = titles.map((t) => balance(t.slice(pre, t.length - suf).replace(TRIM, '').trim()));
  if (labels.some((l) => !l || l.length > 30 || itemWordIn(l) || SERIES_NO.test(l))) return null;
  if (new Set(labels).size !== labels.length) return null;
  // 共通部分にアイテムの語がある（「アクリルスタンド 虎杖」「アクリルスタンド 伏黒」）か、
  // 違いが括弧の中だけ（「クリアファイル（ハチワレ）」「クリアファイル（うさぎ）」）なら同じアイテム
  const bracketed = OPEN.test(head) && (CLOSE.test(tail) || !tail);
  return itemWordIn(head + tail) || bracketed ? labels : null;
}

export interface ProductGroup { title: string; kind: string; category: string; items: { p: ListProduct; label: string }[] }

/** 一覧を予定のまとまりに分ける。並びは一覧の順（まとまりは最初の商品の位置） */
export function groupProducts(products: ListProduct[]): ProductGroup[] {
  const names = products.map((p) => stripShopNoise(p.title));
  const parent = products.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const sameRelease = (a: ListProduct, b: ListProduct) => !a.release || !b.release || a.release.date === b.release.date;
  for (let i = 0; i < products.length; i++) {
    for (let j = i + 1; j < products.length; j++) {
      if (find(i) === find(j) || !sameRelease(products[i], products[j])) continue;
      if (variantLabels([names[i], names[j]])) parent[find(j)] = find(i);
    }
  }
  const members = new Map<number, number[]>();
  products.forEach((_, i) => members.set(find(i), [...(members.get(find(i)) ?? []), i]));
  const groups: ProductGroup[] = [];
  const emit = (idx: number[]) => {
    const labels = idx.length > 1 ? variantLabels(idx.map((i) => names[i])) : null;
    if (!labels) {
      const t = names[idx[0]];
      groups.push({ title: t, kind: itemWordIn(t) ?? '', category: categoryOf(t), items: [{ p: products[idx[0]], label: '' }] });
      return;
    }
    const first = names[idx[0]];
    const { pre, suf } = idx.slice(1).reduce((acc, i) => {
      const e = sharedEnds(first, names[i]);
      return { pre: Math.min(acc.pre, e.pre), suf: Math.min(acc.suf, e.suf) };
    }, { pre: first.length, suf: first.length });
    const title = balance(`${headPart(first.slice(0, pre))} ${tailPart(first.slice(first.length - suf))}`.trim());
    groups.push({ title, kind: itemWordIn(title) ?? '', category: categoryOf(title), items: idx.map((i, k) => ({ p: products[i], label: labels[k] })) });
  };
  for (const idx of [...members.values()].sort((a, b) => a[0] - b[0])) {
    if (idx.length === 1 || variantLabels(idx.map((i) => names[i]))) { emit(idx); continue; }
    // 2つずつ見てつないだので、全体では成り立たないことがある（A〜B・B〜C は良くても A〜C が別物）。
    // そのときは前から順に、入れても成り立つまとまりにだけ入れていく（混ぜるより分ける）
    const subs: number[][] = [];
    for (const i of idx) {
      const s = subs.find((g) => variantLabels([...g, i].map((k) => names[k])));
      if (s) s.push(i); else subs.push([i]);
    }
    for (const g of subs.sort((a, b) => a[0] - b[0])) emit(g);
  }
  // 並びは一覧の順（まとまりは最初の商品の位置）
  const order = new Map(products.map((p, i) => [p, i]));
  groups.sort((a, b) => order.get(a.items[0].p)! - order.get(b.items[0].p)!);
  return groups;
}

const norm = (s: string) => s.normalize('NFKC').toLowerCase().replace(/[\s!?・/\\\-ー~〜、。,.:;'"「」『』【】[\]()（）《》<>＜＞#＆&+*★☆♪]/g, '');

/** 作品名。登録済みの作品名・別名のうち、一番多くの商品名に入っているもの（同数なら長いほう）。無ければ null */
export async function detectWork(titles: string[], listTitle: string): Promise<string | null> {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || !titles.length) return null;
  const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const cands: { name: string; key: string }[] = [];
  for (let from = 0; from < 10000; from += 1000) {
    const { data } = await db.from('works').select('name').range(from, from + 999);
    for (const w of data ?? []) cands.push({ name: w.name as string, key: norm(w.name as string) });
    if ((data ?? []).length < 1000) break;
  }
  const { data: aliases } = await db.from('work_aliases').select('alias_norm, works(name)').limit(5000);
  for (const a of aliases ?? []) {
    const name = (a.works as { name?: string } | null)?.name;
    if (name) cands.push({ name, key: norm(a.alias_norm as string) });
  }
  const texts = [...titles, listTitle].map(norm);
  let best: { name: string; hits: number; len: number } | null = null;
  for (const c of cands) {
    if (c.key.length < 2) continue;
    const hits = texts.filter((t) => t.includes(c.key)).length;
    if (!hits) continue;
    if (!best || hits > best.hits || (hits === best.hits && c.key.length > best.len)) best = { name: c.name, hits, len: c.key.length };
  }
  return best && best.hits >= Math.max(1, Math.ceil(titles.length * 0.3)) ? best.name : null;
}

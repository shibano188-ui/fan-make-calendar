// 商品の一覧（_listsource.ts）を予定のまとまりに分ける。AIは使わない（本人要望・2026-09-27）。
// まとめるのは「同じ企画の、同じアイテムの、キャラ違い・柄違い」だけ。それ以外は1商品で1件。
// サムネイルには1商品しか出ないので、別のアイテム（クリアファイルとアクスタ）を混ぜると見逃される。
// 名前がほぼ同じでもアイテムが違えば分ける。迷ったら分ける側に倒す。
import { createClient } from '@supabase/supabase-js';
import { stripShopNoise, lookupByUrl } from './_product-search.js';
import type { ListProduct, ProductList } from './_listsource.js';

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
/** 本（コミック・小説・画集など）か。本はグッズではなく「書籍」の予定にする。手帳・カレンダーはグッズ */
export const isBook = (title: string) => /【(?:コミック|小説|書籍|その他\(書籍\)|ムック|画集|雑誌)】|コミックス|ファンブック|画集|ノベライズ|小説/.test(title.normalize('NFKC')) && !/手帳|カレンダー/.test(title);

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
  // アニメイトは頭に【コミック】【Blu-ray】【グッズ-アクリルスタンド】のような分類が付く。見出しからは落とす
  const names = products.map((p) => stripShopNoise(p.title).replace(/^【[^】]*】\s*/, ''));
  const parent = products.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const sameRelease = (a: ListProduct, b: ListProduct) => !a.release || !b.release || a.release.date === b.release.date;
  for (let i = 0; i < products.length; i++) {
    for (let j = i + 1; j < products.length; j++) {
      if (find(i) === find(j) || !sameRelease(products[i], products[j])) continue;
      // コミック・書籍は絶対にまとめない（巻・版の違いを1件にするとおかしくなる。本人指摘・2026-09-27）
      if (isBook(products[i].title) || isBook(products[j].title)) continue;
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
      groups.push({ title: t, kind: itemWordIn(t) ?? '', category: isBook(products[idx[0]].title) ? '書籍' : categoryOf(t), items: [{ p: products[idx[0]], label: '' }] });
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

// ── 一覧 → 予定の形 ─────────────────────────

export interface ListEvent {
  title: string; kind: string | null; work: string | null;
  date: string | null; dateLabel: string | null;
  isOrderMade?: boolean; preorderStart?: string | null; preorderEnd?: string | null;
  categories: string[]; price: number; imageUrl: string | null; link: null;
  offers: { retailer: string; shop?: string; url: string; price: number; inStock?: boolean; stockLabel?: string; official: boolean; pinned: boolean; label?: string }[];
  items: { url: string; title: string; image: string }[];
}

/** 「10月9日発売商品」のようなコレクション名から発売日を取る。今日より2か月以上前なら来年とみなす */
function dateFromCollectionTitle(title: string): string | null {
  const m = title.match(/(?:(\d{4})年)?(\d{1,2})月(\d{1,2})日/);
  if (!m) return null;
  const now = new Date();
  let y = m[1] ? Number(m[1]) : now.getFullYear();
  const md = `${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  if (!m[1] && new Date(`${y}-${md}`).getTime() < now.getTime() - 60 * 86400_000) y++;
  return `${y}-${md}`;
}

/** 画像のURLを、アプリの image_url の形（1枚なら文字列、複数ならJSON配列の文字列）にする。10枚まで */
function imagesJson(urls: string[]): string | null {
  const list = [...new Set(urls.filter(Boolean))].slice(0, 10);
  return list.length === 0 ? null : list.length === 1 ? list[0] : JSON.stringify(list);
}

/** まとまりの発売日。中の商品の発売日のうち一番多いもの（一覧に発売日がある店）。無ければ一覧の名前から */
function groupRelease(items: ProductList['products'], listTitle: string): { date: string | null; dateLabel: string | null } {
  const count = new Map<string, { n: number; r: { date: string; dateLabel: string | null } }>();
  for (const p of items) {
    if (!p.release) continue;
    const k = `${p.release.date}|${p.release.dateLabel ?? ''}`;
    count.set(k, { n: (count.get(k)?.n ?? 0) + 1, r: p.release });
  }
  const top = [...count.values()].sort((a, b) => b.n - a.n)[0]?.r;
  return top ? { date: top.date, dateLabel: top.dateLabel } : { date: dateFromCollectionTitle(listTitle), dateLabel: null };
}

/** 一覧を予定の形（parse-event の返す形・クライアントの ParsedEvent）にする。投稿画面と巡回ボット（_crawl.ts）で使う */
export async function listEvents(col: ProductList, work: string | null): Promise<ListEvent[]> {
  const groups = groupProducts(col.products);
  // 予約で売っている商品（アニメイトの「予約受付中」「予約受付前」など）が入るまとまりは、予定も「予約あり」にする。
  // 一覧に予約期間は無いので、アニメイトは先頭の商品ページから読む（5件ずつ）。前は予約が付かなかった（本人指摘・2026-09-27）
  const isPreorder = (g: typeof groups[number]) => g.items.some(({ p }) => /予約/.test(p.stockLabel ?? ''));
  const periods = new Map<typeof groups[number], { start?: string; end?: string }>();
  const needPeriod = groups.filter((g) => isPreorder(g) && /animate-onlineshop\.jp/.test(g.items[0].p.url));
  for (let i = 0; i < needPeriod.length; i += 5) {
    await Promise.all(needPeriod.slice(i, i + 5).map(async (g) => {
      const hit = await lookupByUrl(g.items[0].p.url).catch(() => null);
      if (hit?.preorderEnd || hit?.preorderStart) periods.set(g, { start: hit.preorderStart, end: hit.preorderEnd });
    }));
  }
  return groups.map((g) => ({
    title: g.title,
    ...(isPreorder(g) ? { isOrderMade: true, preorderStart: periods.get(g)?.start ?? null, preorderEnd: periods.get(g)?.end ?? null } : {}),
    // 画面で複数のまとまりを1つにまとめるとき、リンクの名前を「お守り（ハチワレ）」にするのに使う
    kind: g.kind || null,
    work,
    ...(() => { const r = groupRelease(g.items.map((x) => x.p), col.title); return { date: r.date, dateLabel: r.dateLabel }; })(),
    categories: g.category === '書籍' ? ['書籍'] : ['グッズ', ...(g.category ? [g.category] : [])],
    price: Math.min(...g.items.map((x) => x.p.price)),
    // 画像は全部。複数の商品なら各商品の1枚目、1商品ならその商品の画像を全部（アプリの複数画像の形＝JSON配列）。
    // 前は先頭の商品の1枚目だけだった（本人指摘・2026-09-26）
    imageUrl: imagesJson(g.items.length > 1 ? g.items.map((x) => x.p.image) : g.items[0].p.images),
    link: null,
    // 中の商品を全部、名前付きの購入リンクにする（クライアントの Offer と同じ形）
    offers: g.items.map(({ p, label }) => ({
      retailer: col.retailer, ...(col.shop !== col.retailer ? { shop: col.shop } : {}),
      url: p.url, price: p.price, inStock: p.inStock, ...(p.stockLabel ? { stockLabel: p.stockLabel } : {}), official: true, pinned: true,
      ...(g.items.length > 1 ? { label: label || p.title } : {}),
    })),
    // 投稿画面でリンクを外して1件の予定に戻すとき用の、商品ごとの名前と画像（保存はしない）
    items: g.items.map(({ p }) => ({ url: p.url, title: p.title, image: p.image })),
  }));
}


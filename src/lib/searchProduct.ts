import type { Offer } from '../types';
import { buildOffer } from './affiliate';

export interface ProductCandidate {
  title: string;
  price: number;
  url: string;
  image: string;
  shop: string;
  retailer: string;
  hasAffiliate: boolean;
  shopCode?: string;   // 楽天shopCode / Yahoo!sellerId
  official?: boolean;  // あみあみ・駿河屋等の公式出店店舗（優先表示対象）
  inStock?: boolean;   // false=売切れ。自動添付しない・候補では末尾に回す
  stockLabel?: string; // アニメイトの生の表記（予約受付中・取り寄せ等）
  label?: string;      // 種類違いの名前（キャラ名・番号など）。labelVariants が付ける
}

// 楽天等のショップタイトルからノイズ（送料無料・◯%OFF・【】囲み等）を軽く除去。
export function cleanShopTitle(s: string): string {
  let t = s;
  t = t.replace(/[【［〔].*?[】］〕]/g, ' ');
  t = t.replace(/送料無料|あす楽|即日発送|即納|在庫あり|新品未使用|正規品|ポイント\d+倍|最大\d+%?(OFF|オフ)?|\d+%(OFF|オフ)/gi, ' ');
  t = t.replace(/\s+/g, ' ').trim();
  return t || s;
}

// 入力タイトルが候補タイトルにどれだけ含まれるか（0〜1）。誤商品の登録防止用ガード。
function normForMatch(s: string): string {
  return s.replace(/[\s　]/g, '').toLowerCase();
}
export function titleMatchScore(entered: string, candidate: string): number {
  const a = normForMatch(entered);
  const b = normForMatch(candidate);
  if (a.length < 2 || b.length < 2) return 0;
  const grams = (s: string) => { const set = new Set<string>(); for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2)); return set; };
  const A = grams(a);
  const B = grams(b);
  let inter = 0;
  for (const g of A) if (B.has(g)) inter++;
  return inter / A.size; // 入力(A)が候補(B)にどれだけ含まれるか
}

// セット/BOX/コンプ品か（api/_product-search.ts と同期を保つこと）。「セット」表示で価格の誤解を防ぐ。
// 「ボックス」「まとめ」単体は誤検出(箱型グッズ等)が多いので、セットを示す強い語だけに絞る。
export function isSetTitle(t: string): boolean { return /セット|まとめ(買|売)|コンプ|全\d+種|\d+個(入|セット)|\bBOX\b|1BOX/i.test(t); }

/** 検索キーワードを組み立てる（api/_product-search.ts の searchKeyword と同期を保つこと）。
 * 「作品名 + タイトル」が基本だが、タイトルに既に作品名が入っていると
 * 「ハイキュー!! ハイキュー!! 缶バッジ」と二重になり、アニメイト検索が0件になる。
 * 重複するときは作品名を足さない。 */
export function searchKeyword(workName: string, title: string): string {
  const w = (workName || '').trim();
  const t = (title || '').trim();
  if (!w) return t;
  if (!t) return w;
  // NFKCで全角半角を揃える（作品名「ハイキュー!!」とタイトル内「ハイキュー！！」を同一視する）
  const norm = (s: string) => s.normalize('NFKC').replace(/[\s　]/g, '').toLowerCase();
  return norm(t).includes(norm(w)) ? t : `${w} ${t}`;
}

// 「第二弾」の漢数字を数字にする（十まで。グッズの弾数ならこれで足りる）。
const KANJI_DIGITS = '一二三四五六七八九';
function kanjiNum(s: string): string {
  if (/^\d+$/.test(s)) return s;
  if (s === '十') return '10';
  const [tens, ones] = s.includes('十') ? s.split('十') : ['', s];
  const d = (c: string) => KANJI_DIGITS.indexOf(c) + 1;
  return String((s.includes('十') ? (tens ? d(tens) : 1) * 10 : 0) + (ones ? d(ones) : 0));
}

// タイトルから「種類マーカー」を取り出す（api/_product-search.ts の variantKey と同期を保つこと）。
// 一致度スコアは2文字組の一致率なので vol.2 と vol.3 で0.9超になり見分けられない。
// 楽天は「(1)クリア」、アニメイトは「①クリア」と表記が割れるので同じ `no:N` に正規化する。
export function variantKey(title: string): string[] {
  const out = new Set<string>();
  const push = (k: string, n: string) => out.add(`${k}:${Number(n)}`);
  for (const m of title.matchAll(/vol\.?\s*(\d+)/gi)) push('vol', m[1]);
  for (const m of title.matchAll(/ver\.?\s*(\d+)/gi)) push('ver', m[1]);
  for (const m of title.matchAll(/part\.?\s*(\d+)/gi)) push('part', m[1]);
  for (const m of title.matchAll(/第\s*(\d+|[一二三四五六七八九十]+)\s*([弾期巻話章])/g)) push(m[2], kanjiNum(m[1]));
  for (const m of title.matchAll(/[(（]\s*(\d+)\s*[)）]/g)) push('no', m[1]);
  for (const ch of title) {
    const c = ch.codePointAt(0) ?? 0;
    if (c >= 0x2460 && c <= 0x2473) push('no', String(c - 0x2460 + 1)); // ①〜⑳
  }
  return [...out];
}

/** 入力と候補の種類マーカーが食い違うか。入力に指定が無いときは判定しない。 */
export function variantMismatch(entered: string, candidate: string): boolean {
  const a = variantKey(entered);
  if (!a.length) return false;
  const b = new Set(variantKey(candidate));
  return !a.every((k) => b.has(k));
}

// 種類だけを表す語（src/lib/searchProduct.ts と api/_product-search.ts で同期を保つこと）。
// 「ぬいぐるみ」「缶バッジ」のようにタイトルがこれと作品名だけだと、その語を含む商品が全部
// 一致度1.00になり、別々の商品のリンクが付いてしまう（2026-09-16 本人指摘）。
const GENERIC_GOODS_WORDS = [
  'アクリルスタンド', 'アクリルキーホルダー', 'アクリルブロック', 'アクリルパネル', 'ぬいぐるみマスコット',
  'トレーディング', 'キーホルダー', 'ぬいぐるみ', 'マスコット', 'ブロマイド', 'ポストカード', 'クリアファイル',
  'タペストリー', 'フィギュア', 'ステッカー', 'ボールペン', 'ポーチ', 'バッグ', 'Tシャツ', 'タオル', 'ポスター',
  'カード', 'シール', 'チャーム', 'アクスタ', 'アクキー', '缶バッジ', '缶バッチ', 'バッジ', 'グッズ', '新グッズ',
  'シリーズ', 'コラボ', 'ランダム', '各種', '全種', '新作', '新商品', '商品', '公式', '限定', '予約', '受付',
  '発売', '開始', '決定', '販売', '再販', 'box',
].map((w) => w.normalize('NFKC').toLowerCase()).sort((a, b) => b.length - a.length);

const PUNCT_RE = /[\s!?・/\\\-ー~〜、。,.:;'"「」『』【】\[\]()《》<>＜＞#＃&＆+＋*＊◆◇★☆♪※|]/g;
const SHOP_NOISE_RE = /予約|発売|送料|公式|特典|再販|在庫|ポイント|限定|新品|即納|あす楽|%|off|セット|box|グッズ|店|屋|\d+月/;
const VARIANT_RE = [/vol\.?\s*\d+/gi, /ver\.?\s*\d+/gi, /part\.?\s*\d+/gi, /第\s*[\d一二三四五六七八九十]+\s*[弾期巻話章]/g, /[①-⑳]/g];

/** タイトルから作品名・種類の語・種類マーカー・記号を除いた「その商品だけの部分」。 */
export function productCore(title: string, workName = ''): string {
  let t = title.normalize('NFKC').toLowerCase();
  // ショップが付ける囲み（[ムービック]《12月予約》【送料無料】）は商品名ではない。
  // ただし楽天の【カニ爪唐揚げ】のように【】に種類名が入ることがあるので、【】は宣伝文句のときだけ消す。
  t = t.replace(/\[[^\]]*\]|《[^》]*》/g, ' ');
  t = t.replace(/【([^】]*)】/g, (_m, inner: string) => (SHOP_NOISE_RE.test(inner) ? ' ' : inner));
  const w = workName.normalize('NFKC').toLowerCase().trim();
  if (w) {
    t = t.split(w).join(' ');
    const bare = w.replace(PUNCT_RE, '');
    if (bare.length >= 2) t = t.split(bare).join(' ');
  }
  for (const re of VARIANT_RE) t = t.replace(re, ' ');
  for (const g of GENERIC_GOODS_WORDS) t = t.split(g).join(' ');
  return t.replace(PUNCT_RE, '');
}

const bigrams = (s: string) => { const set = new Set<string>(); for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2)); return set; };

/** 2つの候補が同じ商品を指していそうか。入力にある部分は両方に共通なので除き、
 *  残り（キャラ名・柄など候補ごとの違い）がほとんど重ならなければ別の商品とみなす。
 *  違いが小さい（2文字組が3つ未満）ときは表記揺れ扱いで同じ商品とする。 */
function sameProduct(a: string, b: string, entered: string): boolean {
  const E = bigrams(entered);
  const A = [...bigrams(a)].filter((g) => !E.has(g));
  const B = new Set([...bigrams(b)].filter((g) => !E.has(g)));
  if (A.length < 3 || B.size < 3) return true;
  const inter = A.filter((g) => B.has(g)).length;
  return inter / Math.min(A.length, B.size) >= 0.3;
}

// ── 種類違い（キャラ・色・番号違い）──
// 同じ店の候補どうしで、共通の前後を除いた残りを「種類の名前」にする。括弧に入っているとは限らない
// （アニメイト: 「…＜アクリルスタンド付＞ 02 五条悟 ～水色～」、楽天: 「【天童覚 (N ノーマル) 】 …」）ので、
// 括弧ではなく差分で取る。

/** ショップが付ける宣伝の囲み（【送料無料】《予約》[ムービック]）を外し、空白を揃える。種類名の【】は残す */
function stripShopNoise(t: string): string {
  return t.normalize('NFKC')
    .replace(/\[[^\]]*\]|《[^》]*》/g, ' ')
    .replace(/【([^】]*)】/g, (m, inner: string) => (SHOP_NOISE_RE.test(inner) ? ' ' : m))
    .replace(/\s+/g, ' ').trim();
}
function commonPrefix(a: string, b: string): number { let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++; return i; }
function commonSuffix(a: string, b: string): number { let i = 0; while (i < a.length && i < b.length && a[a.length - 1 - i] === b[b.length - 1 - i]) i++; return i; }
// 共通部分の境目が語の途中（「01 虎杖」「02 五条」の「0」、「～水色～」「～橙色～」の「色」）にならないよう、
// 区切り文字の位置まで戻す
const SEP = /[\s・/~〜～＜＞<>()（）【】「」『』[\]、,]/;
const TRIM_LABEL = /^[\s・/\-ー~〜～、,.:：＜＞<>()（）【】「」『』\[\]]+|[\s・/\-ー~〜～、,.:：＜＞<>()（）【】「」『』\[\]]+$/g;

/** 同じ店の候補を種類違いのまとまりに分け、まとまりに入ったものに種類の名前を付けて返す。
 *  前後の共通部分が短い（半分未満）ものは別の商品として外す。 */
export function labelVariants(items: ProductCandidate[]): Map<ProductCandidate, string> {
  const out = new Map<ProductCandidate, string>();
  const byShop = new Map<string, ProductCandidate[]>();
  for (const c of items) {
    if (isSetTitle(c.title)) continue; // セット品は種類違いではない
    const k = `${c.retailer}:${c.shopCode || c.shop}`;
    byShop.set(k, [...(byShop.get(k) ?? []), c]);
  }
  for (const list of byShop.values()) {
    if (list.length < 2) continue;
    const titles = list.map((c) => stripShopNoise(c.title));
    // 先頭の候補を基準に、前後の共通部分が長いものだけを同じまとまりにする
    const shared = (a: string, b: string) => (commonPrefix(a, b) + commonSuffix(a, b)) / Math.min(a.length, b.length);
    let best: number[] = [];
    for (let i = 0; i < titles.length; i++) {
      const group = titles.map((_, j) => j).filter((j) => j === i || shared(titles[i], titles[j]) >= 0.5);
      if (group.length > best.length) best = group;
    }
    if (best.length < 2) continue;
    const g = best.map((j) => titles[j]);
    let pre = Math.min(...g.slice(1).map((t) => commonPrefix(g[0], t)));
    let suf = Math.min(...g.slice(1).map((t) => commonSuffix(g[0], t)));
    while (pre > 0 && !SEP.test(g[0][pre - 1])) pre--;
    while (suf > 0 && !SEP.test(g[0][g[0].length - suf])) suf--;
    for (const j of best) {
      const t = titles[j];
      let label = t.slice(pre, t.length - suf).replace(TRIM_LABEL, '').trim();
      // 「天童覚 (N ノーマル」のように閉じ括弧だけ共通部分に入ったら補う
      if ((label.match(/\(/g) ?? []).length > (label.match(/\)/g) ?? []).length) label += ')';
      if ((label.match(/（/g) ?? []).length > (label.match(/）/g) ?? []).length) label += '）';
      if (label && label.length <= 30) out.set(list[j], label);
    }
  }
  return out;
}

// 投稿時に「自動添付してよい高信頼候補」だけを絞る。
// 公式店(あみあみ/駿河屋/アニメイト/楽天ブックス)はタイトル一致度0.55以上、
// 非公式店(転売混在の恐れ)はより厳しく0.8以上。誤マッチを避けつつ手間ゼロで収益リンクを付ける。
// 販売サイトごとに1件・最大4件。売切れ・種類違いは自動添付しない（候補としては残るので手動では選べる）。
//
// 2026-08-10: 上限を「サイト＋ショップ」単位から**サイト単位**に変えた。
// 以前は楽天の別ショップ3件で4枠のうち3つが埋まり、提携が無いだけの公式店（アニメイト本店）が
// 最後まで出てこなかった。同じサイトの2件目以降はユーザーにとって選択肢が増えないので、
// 1件に絞って空いた枠を他のサイトに回す。
export function highConfidenceCandidates(enteredTitle: string, items: ProductCandidate[], workName = ''): ProductCandidate[] {
  // 商品を特定できないタイトル（作品名＋「ぬいぐるみ」だけ等）は自動で付けない。候補として出すだけ。
  if (productCore(enteredTitle, workName).length < 3) return [];
  const scored = items
    .map((c) => ({ c, score: titleMatchScore(enteredTitle, c.title) }))
    .filter(({ c, score }) => (c.official ? score >= 0.55 : score >= 0.8))
    .filter(({ c }) => c.inStock !== false)
    .filter(({ c }) => !variantMismatch(enteredTitle, c.title));
  // 種類違い（キャラ・番号違い）がそろって見つかったら、全部に名前を付けて付ける（本人要望・2026-09-26）。
  // 前は「1種類だけ付くのはおかしい」として1件も付けていなかった。
  // 入力に種類の名前が入っている（「…（ハチワレ）」）ときは、その種類だけを付ける。
  const labels = labelVariants(scored.map(({ c }) => c));
  if (labels.size >= 2) {
    const norm = (x: string) => x.normalize('NFKC').replace(/[\s　]/g, '').toLowerCase();
    const entered = norm(enteredTitle);
    const named = [...labels].filter(([, l]) => entered.includes(norm(l)));
    const picked = named.length ? named : [...labels];
    return picked.slice(0, 16).map(([c, label]) => ({ ...c, label }));
  }
  // 入力に種類指定が無いのに候補が複数の種類に分かれているが、名前が取れなかった場合は、
  // どれか1つを自動で貼ると「バリエーションがあるのに1種類だけリンクされる」ので添付しない。
  if (!variantKey(enteredTitle).length) {
    const kinds = new Set(scored.flatMap(({ c }) => variantKey(c.title)));
    if (kinds.size >= 2) return [];
  }
  const ranked = [...scored].sort((a, b) =>
    Number(b.c.hasAffiliate) - Number(a.c.hasAffiliate) ||
    Number(b.c.official ?? false) - Number(a.c.official ?? false) ||
    b.score - a.score);
  const seen = new Set<string>();
  const out: ProductCandidate[] = [];
  for (const { c } of ranked) {
    if (seen.has(c.retailer)) continue;
    seen.add(c.retailer);
    out.push(c);
    if (out.length >= 4) break;
  }
  // 採用した候補どうしが別の商品に見えるなら、どれが正しいか分からないので1件も付けない。
  const cores = out.map((c) => productCore(c.title, workName));
  const enteredCore = productCore(enteredTitle, workName);
  for (let i = 1; i < cores.length; i++) if (!sameProduct(cores[0], cores[i], enteredCore)) return [];
  return out;
}

// 各店の検索結果ページを開くURL（サーバー自動取得できない店は手動でここから探す）。
export function retailerSearchUrls(keyword: string): { retailer: string; url: string }[] {
  const k = encodeURIComponent(keyword);
  return [
    { retailer: 'あみあみ', url: `https://www.amiami.jp/top/search/list?s_keywords=${k}` },  // a8提携先は amiami.jp（.comは成果対象外の恐れ）
    // アニメイトの検索は smt=。search_word= はトップページへリダイレクトされる（＝検索されない）
    { retailer: 'アニメイト', url: `https://www.animate-onlineshop.jp/products/list.php?smt=${k}` },
    { retailer: 'Amazon', url: `https://www.amazon.co.jp/s?k=${k}` },
    { retailer: '楽天', url: `https://search.rakuten.co.jp/search/mall/${k}/` },
  ];
}

/** 検索候補を販路(Offer)に変換する。投稿画面の自動添付・手動選択で共通に使う。 */
export function offerFromCandidate(c: ProductCandidate, fetchedAt = new Date().toISOString()): Offer {
  return {
    retailer: c.retailer || '楽天',
    shop: c.shop || undefined,
    url: c.url,
    affiliateUrl: c.url,
    hasAffiliate: c.hasAffiliate,
    price: c.price,
    fetchedAt,
    official: c.official,
    isSet: isSetTitle(c.title),
    inStock: c.inStock,
    stockLabel: c.stockLabel,
    // 種類違いのリンクは、毎日の更新で商品名検索により別の種類へ付け替えられないよう pinned にする
    ...(c.label ? { label: c.label, pinned: true } : {}),
  };
}

// 商品候補を検索（リンク無し/価格不明の補完用）。サーバー側の楽天検索を叩く。
export async function searchProductCandidates(keyword: string): Promise<ProductCandidate[]> {
  return (await searchProductCandidatesWithMeta(keyword)).items;
}

/** 候補に、アニメイトの総件数（「〜に関する商品はN件あります」）を添えて返す。種類違いの取りこぼし確認用 */
export async function searchProductCandidatesWithMeta(keyword: string): Promise<{ items: ProductCandidate[]; animateTotal: number | null }> {
  const base = (import.meta.env.VITE_API_BASE as string | undefined) ?? '';
  try {
    const r = await fetch(`${base}/api/search-product?keyword=${encodeURIComponent(keyword)}`);
    if (!r.ok) return { items: [], animateTotal: null };
    const d = (await r.json()) as { items?: ProductCandidate[]; animateTotal?: number | null };
    return { items: d.items ?? [], animateTotal: d.animateTotal ?? null };
  } catch {
    return { items: [], animateTotal: null };
  }
}

/** 人が貼ったリンクを販路にする。そのURLの商品の価格・在庫をその場で取り、pinned を付ける
 *  （Cronが商品名検索で別の商品に付け替えないように）。取れない店は値段なしのまま。 */
export async function buildPinnedOffer(rawUrl: string, price?: number): Promise<Offer> {
  const o: Offer = { ...buildOffer(rawUrl, price), pinned: true };
  const base = (import.meta.env.VITE_API_BASE as string | undefined) ?? '';
  try {
    const r = await fetch(`${base}/api/search-product?url=${encodeURIComponent(rawUrl)}`);
    if (!r.ok) return o;
    const { item } = (await r.json()) as { item?: { title?: string; price: number; shop?: string; official?: boolean; inStock?: boolean; stockLabel?: string } | null };
    if (!item) return o;
    return {
      ...o,
      shop: item.shop || o.shop,
      price: item.price,
      fetchedAt: new Date().toISOString(),
      official: item.official,
      isSet: item.title ? isSetTitle(item.title) : undefined,
      inStock: item.inStock,
      stockLabel: item.stockLabel,
    };
  } catch {
    return o;
  }
}

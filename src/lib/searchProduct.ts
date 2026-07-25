import type { Offer } from '../types';

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

// タイトルから「種類マーカー」を取り出す（api/_product-search.ts の variantKey と同期を保つこと）。
// 一致度スコアは2文字組の一致率なので vol.2 と vol.3 で0.9超になり見分けられない。
// 楽天は「(1)クリア」、アニメイトは「①クリア」と表記が割れるので同じ `no:N` に正規化する。
export function variantKey(title: string): string[] {
  const out = new Set<string>();
  const push = (k: string, n: string) => out.add(`${k}:${Number(n)}`);
  for (const m of title.matchAll(/vol\.?\s*(\d+)/gi)) push('vol', m[1]);
  for (const m of title.matchAll(/ver\.?\s*(\d+)/gi)) push('ver', m[1]);
  for (const m of title.matchAll(/part\.?\s*(\d+)/gi)) push('part', m[1]);
  for (const m of title.matchAll(/第\s*(\d+)\s*([弾期巻話章])/g)) push(m[2], m[1]);
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

// 投稿時に「自動添付してよい高信頼候補」だけを絞る。
// 公式店(あみあみ/駿河屋/アニメイト/楽天ブックス)はタイトル一致度0.55以上、
// 非公式店(転売混在の恐れ)はより厳しく0.8以上。誤マッチを避けつつ手間ゼロで収益リンクを付ける。
// 販路(retailer+shop)ごとに1件・最大4件。アフィ対応の販路を先に確保してから、アニメイト本店など
// 非対応の公式店を足す。売切れ・種類違いは自動添付しない（候補としては残るので手動では選べる）。
export function highConfidenceCandidates(enteredTitle: string, items: ProductCandidate[]): ProductCandidate[] {
  const scored = items
    .map((c) => ({ c, score: titleMatchScore(enteredTitle, c.title) }))
    .filter(({ c, score }) => (c.official ? score >= 0.55 : score >= 0.8))
    .filter(({ c }) => c.inStock !== false)
    .filter(({ c }) => !variantMismatch(enteredTitle, c.title));
  // 入力に種類指定が無いのに候補が複数の種類に分かれている（①と②、vol.1とvol.2）場合、
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
    const k = `${c.retailer}:${c.shop || ''}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(c);
    if (out.length >= 4) break;
  }
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
  };
}

// 商品候補を検索（リンク無し/価格不明の補完用）。サーバー側の楽天検索を叩く。
export async function searchProductCandidates(keyword: string): Promise<ProductCandidate[]> {
  const base = (import.meta.env.VITE_API_BASE as string | undefined) ?? '';
  try {
    const r = await fetch(`${base}/api/search-product?keyword=${encodeURIComponent(keyword)}`);
    if (!r.ok) return [];
    const d = (await r.json()) as { items?: ProductCandidate[]; disabled?: boolean };
    return d.items ?? [];
  } catch {
    return [];
  }
}

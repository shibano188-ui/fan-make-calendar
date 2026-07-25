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

// 投稿時に「自動添付してよい高信頼候補」だけを絞る。
// 公式店(あみあみ/駿河屋/アニメイト/楽天ブックス)はタイトル一致度0.55以上、
// 非公式店(転売混在の恐れ)はより厳しく0.8以上。誤マッチを避けつつ手間ゼロで収益リンクを付ける。
// 販路(retailer+shop)ごとに1件・最大4件。アフィ対応の販路を先に確保してから、アニメイト本店など
// 非対応の公式店を足す。曖昧なものは自動添付せず候補提示に回す。
export function highConfidenceCandidates(enteredTitle: string, items: ProductCandidate[]): ProductCandidate[] {
  const scored = items
    .map((c) => ({ c, score: titleMatchScore(enteredTitle, c.title) }))
    .filter(({ c, score }) => (c.official ? score >= 0.55 : score >= 0.8))
    .sort((a, b) =>
      Number(b.c.hasAffiliate) - Number(a.c.hasAffiliate) ||
      Number(b.c.official ?? false) - Number(a.c.official ?? false) ||
      b.score - a.score);
  const seen = new Set<string>();
  const out: ProductCandidate[] = [];
  for (const { c } of scored) {
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

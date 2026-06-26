export interface ProductCandidate {
  title: string;
  price: number;
  url: string;
  image: string;
  shop: string;
  retailer: string;
  hasAffiliate: boolean;
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

// 各店の検索結果ページを開くURL（サーバー自動取得できない店は手動でここから探す）。
export function retailerSearchUrls(keyword: string): { retailer: string; url: string }[] {
  const k = encodeURIComponent(keyword);
  return [
    { retailer: 'あみあみ', url: `https://www.amiami.com/jp/search/list/?s_keywords=${k}` },
    { retailer: 'アニメイト', url: `https://www.animate-onlineshop.jp/products/list.php?search_word=${k}` },
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

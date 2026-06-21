export interface ProductCandidate {
  title: string;
  price: number;
  url: string;
  image: string;
  shop: string;
  hasAffiliate: boolean;
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

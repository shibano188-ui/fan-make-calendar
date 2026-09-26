// 販路（events.offers の1件）の判定と代表価格。毎日の更新（refresh-offers）と、
// 投稿済みの予定の手直し（_enrich.ts）で共有する。_ で始まるので Vercel の関数には数えられない。

const AFFILIATE_HOSTS = ['px.a8.net', 'ck.jp.ap.valuecommerce.com', 'hb.afl.rakuten.co.jp'];
export function hostOf(u: string): string { try { return new URL(u).host.toLowerCase(); } catch { return ''; } }
// src/lib/affiliate.ts の isAffiliateUrl と同じ判定（実際に成果識別子が乗ったURLか）。
export function isAffiliateUrl(u: string): boolean {
  const h = hostOf(u);
  if (!h) return false;
  if (AFFILIATE_HOSTS.includes(h)) return true;
  if (/(^|\.)amazon\.co\.jp$/.test(h)) { try { return new URL(u).searchParams.has('tag'); } catch { return false; } }
  return false;
}

// ECの検索・一覧ページ（商品が特定できないURL）。src/lib/affiliate.ts の isSearchPageUrl と同期を保つこと。
const SEARCH_PAGE_PATTERNS = [
  /animate-onlineshop\.jp\/(?:[^?]*\/)?(animetitle|products\/list)/i,
  /(^|\/\/)search\.rakuten\.co\.jp\//i,
  /shopping\.yahoo\.co\.jp\/search/i,
  /amazon\.co\.jp\/s\?/i,
  /amiami\.jp\/[^?]*\/search/i,
  /suruga-ya\.jp\/search/i,
];
export const isSearchPage = (u: string) => !!u && SEARCH_PAGE_PATTERNS.some((re) => re.test(u));

export interface OfferRow { retailer?: string; shop?: string; url: string; affiliateUrl?: string; hasAffiliate?: boolean; price?: number; fetchedAt?: string; official?: boolean; isSet?: boolean; inStock?: boolean; stockLabel?: string; pinned?: boolean; label?: string; }
export const isAff = (o: OfferRow) => isAffiliateUrl(o.affiliateUrl || o.url) || isAffiliateUrl(o.url);
// src/lib/affiliate.ts の isOfficialOffer と同じ（公式店/公式通販か）。代表選びを揃える。
const OFFICIAL_BRANDS = ['あみあみ', '駿河屋', 'アニメイト', '楽天ブックス'];
export const isOfficial = (o: OfferRow) => !!o.official || OFFICIAL_BRANDS.some((b) => `${o.retailer ?? ''} ${o.shop ?? ''}`.includes(b));

/** 代表価格 = 在庫あり→単品→公式店→最安（クライアントの primaryOffer と揃える）。
 *  アフィ販路が無ければ全販路から選ぶ（アニメイト本店だけのグッズでも価格を出す）。
 *  検索・一覧ページは商品が特定できないので代表にしない（クライアントの primaryOffer と揃える）。
 *  リンクが取り消された予定では、代表に値段が無ければ null（値段なし）にする。今の events.price は
 *  取り消したリンクの値段のことがあり、残すと「リンクを直したのに間違った値段が出続ける」。 */
export function representativePrice(live: OfferRow[], current: number | null, hadRemoval: boolean): number | null {
  const products = live.filter((o) => !isSearchPage(o.url));
  const base = products.length ? products : live;
  const affOffers = base.filter(isAff);
  const rep = [...(affOffers.length ? affOffers : base)].sort((a, b) =>
    (Number(b.inStock !== false) - Number(a.inStock !== false)) ||
    (Number(!!a.isSet) - Number(!!b.isSet)) ||
    (Number(isOfficial(b)) - Number(isOfficial(a))) ||
    ((a.price ?? Infinity) - (b.price ?? Infinity)),
  )[0];
  return rep?.price ?? (hadRemoval ? null : current);
}

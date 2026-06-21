// ドメイン別アフィリンク変換器（ピボットの収益コア）。
// 役割: 購入URLの販路を判定し、(1)アフィ対応なら自分のアフィリンク化、(2)非対応はB2B送客対象として扱う。
// ASPアカウント取得後、AFFILIATE_TAGS にIDを入れるだけで本物のアフィリンクになる（config駆動）。
import type { CalendarEvent, Offer } from '../types';

// 取得後に値を入れる。空のうちは「販路は判定するがタグ未付与」（リンク自体は機能する）。
export const AFFILIATE_TAGS = {
  amazon: '',        // Amazonアソシエイト: ?tag=xxxx-22
  rakutenId: '',     // 楽天アフィリエイトID（本来はAPIで生成、暫定でID付与）
} as const;

type RetailerKind = 'affiliate' | 'b2b' | 'none';

interface Rule {
  name: string;
  kind: RetailerKind;
  test: (host: string) => boolean;
  wrap?: (url: string, u: URL) => string;
}

// アフィ対応の店（既存ASPに乗るだけ・LinkSwitch/タグで成果計測）
const RULES: Rule[] = [
  {
    name: 'Amazon', kind: 'affiliate',
    test: (h) => /(^|\.)amazon\.co\.jp$/.test(h) || /(^|\.)amzn\.(to|asia)$/.test(h),
    wrap: (url, u) => {
      if (!AFFILIATE_TAGS.amazon) return url;
      u.searchParams.set('tag', AFFILIATE_TAGS.amazon);
      return u.toString();
    },
  },
  // 楽天: 正式にはAPIでアフィURL生成。暫定はそのまま（LinkSwitch相当は後段）
  { name: '楽天', kind: 'affiliate', test: (h) => /(^|\.)rakuten\.co\.jp$/.test(h) || /(^|\.)r10\.to$/.test(h) },
  { name: 'アニメイト', kind: 'affiliate', test: (h) => /(^|\.)animate(-onlineshop)?\.(co\.)?jp$/.test(h) },
  { name: 'あみあみ', kind: 'affiliate', test: (h) => /(^|\.)amiami\.(com|jp)$/.test(h) },
  { name: 'Yahoo!ショッピング', kind: 'affiliate', test: (h) => /(^|\.)shopping\.yahoo\.co\.jp$/.test(h) || /(^|\.)store\.shopping\.yahoo\.co\.jp$/.test(h) },
  { name: '駿河屋', kind: 'affiliate', test: (h) => /(^|\.)suruga-ya\.jp$/.test(h) },
  { name: 'チケットぴあ', kind: 'affiliate', test: (h) => /(^|\.)t\.pia\.jp$/.test(h) || /(^|\.)pia\.jp$/.test(h) },

  // アフィ非対応＝B2B送客対象（メーカー直販・くじ・公式通販など）
  { name: 'プレミアムバンダイ', kind: 'b2b', test: (h) => /(^|\.)p-bandai\.jp$/.test(h) || /(^|\.)premiumbandai/.test(h) },
  { name: 'イープラス', kind: 'b2b', test: (h) => /(^|\.)eplus\.jp$/.test(h) },
  { name: 'ローチケ', kind: 'b2b', test: (h) => /(^|\.)l-tike\.com$/.test(h) },
];

function hostOf(url: string): string {
  try { return new URL(url).host.toLowerCase(); } catch { return ''; }
}

export interface AffiliateInfo {
  retailer: string;       // 販路名（不明ならホスト名）
  hasAffiliate: boolean;  // アフィ対応か（false=B2B送客 or 単なるリンク）
  url: string;            // 遷移先（アフィ対応はタグ付与後）
}

/** 単一URLを販路判定してアフィ化情報を返す。 */
export function affiliatize(rawUrl: string): AffiliateInfo {
  const host = hostOf(rawUrl);
  if (!host) return { retailer: '', hasAffiliate: false, url: rawUrl };
  const rule = RULES.find((r) => r.test(host));
  if (!rule) return { retailer: host.replace(/^www\./, ''), hasAffiliate: false, url: rawUrl };
  let url = rawUrl;
  if (rule.wrap) { try { url = rule.wrap(rawUrl, new URL(rawUrl)); } catch { /* keep raw */ } }
  return { retailer: rule.name, hasAffiliate: rule.kind === 'affiliate', url };
}

export type BuyMode = 'cart' | 'link' | 'none';

/** URL（＋価格）から販路(Offer)を作る。ドメイン判定でアフィ化。 */
export function buildOffer(rawUrl: string, price?: number): Offer {
  const info = affiliatize(rawUrl);
  return { retailer: info.retailer, url: rawUrl, affiliateUrl: info.url, hasAffiliate: info.hasAffiliate, price };
}

type BuyFields = Pick<CalendarEvent, 'offers' | 'link' | 'affiliateUrl' | 'hasAffiliate' | 'retailer' | 'price'>;

/** アイテムの販路リストを返す。offers が無ければ旧 link を1販路として後方互換。 */
export function getOffers(e: BuyFields): Offer[] {
  if (e.offers && e.offers.length) return e.offers;
  if (e.link || e.affiliateUrl) {
    return [{ retailer: e.retailer ?? '', url: e.link ?? e.affiliateUrl ?? '', affiliateUrl: e.affiliateUrl, hasAffiliate: e.hasAffiliate, price: e.price }];
  }
  return [];
}

/** 代表の販路を選ぶ：アフィ対応を優先、次に価格が安い、次に先頭。 */
export function primaryOffer(offers: Offer[]): Offer | null {
  if (!offers.length) return null;
  const aff = offers.filter((o) => o.hasAffiliate);
  const pool = aff.length ? aff : offers;
  return [...pool].sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity))[0];
}

/** アイテムの購入導線を解決（代表販路から）。 */
export function resolveBuy(e: BuyFields): { mode: BuyMode; url: string; retailer: string } {
  const p = primaryOffer(getOffers(e));
  if (!p || !p.url) return { mode: 'none', url: '', retailer: '' };
  return { mode: p.hasAffiliate ? 'cart' : 'link', url: p.affiliateUrl || p.url, retailer: p.retailer };
}

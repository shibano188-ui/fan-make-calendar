// ドメイン別アフィリンク変換器（ピボットの収益コア）。
// 役割: 購入URLの販路を判定し、(1)アフィ対応なら自分のアフィリンク化、(2)非対応はB2B送客対象として扱う。
// ASPアカウント取得後、AFFILIATE_TAGS にIDを入れるだけで本物のアフィリンクになる（config駆動）。
import type { CalendarEvent, Offer } from '../types';

// 取得後に値を入れる。空のうちは「販路は判定するがタグ未付与」（リンク自体は機能する）。
export const AFFILIATE_TAGS = {
  amazon: '',        // Amazonアソシエイト: ?tag=xxxx-22
  rakutenId: '',     // 楽天アフィリエイトID（本来はAPIで生成、暫定でID付与）
} as const;

// バリューコマース。sid=サイトID / pid=広告素材ID。どちらも公開リンクに現れる値なので秘匿不要。
// LinkSwitch(index.html)は <a> クリックしか変換しないため、window.open や ics 書き出しの導線は
// ここで明示的に変換する。既にVC経由のURL（Yahoo!商品検索APIの返り値等）は二重変換しない。
const VC_HOST = 'ck.jp.ap.valuecommerce.com';
export const VC = {
  sid: '3776607',
  pid: {
    yahoo: '892664375',   // Yahoo!ショッピング（提携済み）
    // アニメイト: 2026-07-23 にVC・A8とも審査落ち。提携していないプログラムのpidで包むと
    // 成果が付かないうえ無駄なリダイレクトを挟むだけなので変換しない。再申請が通ったら復活させる。
  },
} as const;

function vcLink(url: string, pid: string): string {
  if (!pid || hostOf(url) === VC_HOST) return url;
  return `https://${VC_HOST}/servlet/referral?sid=${VC.sid}&pid=${pid}&vc_url=${encodeURIComponent(url)}`;
}

// A8.net。a8mat=広告主ごとのマテリアルID（公開リンクに現れる値なので秘匿不要）。
// 商品ページへのディープリンクは a8ejpredirect に遷移先を渡す（広告主が「リンク先URL変更」を
// 許可している場合のみ成果計測される）。mat が空のうちは素のURLのまま（リンクは機能する）。
const A8_HOST = 'px.a8.net';
export const A8 = {
  mat: {
    amiami: '4B86H3+BBTY5U+NA2+614CY',  // あみあみ: 2026-07-24 承認・稼働
  },
} as const;

function a8Link(url: string, mat: string): string {
  if (!mat || hostOf(url) === A8_HOST) return url;
  return `https://${A8_HOST}/svt/ejp?a8mat=${mat}&a8ejpredirect=${encodeURIComponent(url)}`;
}

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
  // アニメイト: 現在は未提携（VC・A8とも審査落ち・2026-07-23）。wrap が無いので isAffiliateUrl=false＝成果は付かない。
  // 再申請が通ったら wrap: (url) => vcLink(url, VC.pid.animate) を足すだけで成果化する。
  { name: 'アニメイト', kind: 'affiliate', test: (h) => /(^|\.)animate(-onlineshop)?\.(co\.)?jp$/.test(h) },
  { name: 'あみあみ', kind: 'affiliate', test: (h) => /(^|\.)amiami\.(com|jp)$/.test(h), wrap: (url) => a8Link(url, A8.mat.amiami) },
  { name: 'Yahoo!ショッピング', kind: 'affiliate', test: (h) => /(^|\.)shopping\.yahoo\.co\.jp$/.test(h) || /(^|\.)store\.shopping\.yahoo\.co\.jp$/.test(h), wrap: (url) => vcLink(url, VC.pid.yahoo) },
  // 駿河屋: 直リンク(suruga-ya.jp)はASP案件が無く成果なし。楽天/Yahoo!の駿河屋公式店経由(別ホスト)なら計上される。
  { name: '駿河屋', kind: 'affiliate', test: (h) => /(^|\.)suruga-ya\.jp$/.test(h) },

  // アフィ非対応＝B2B送客対象（メーカー直販・くじ・公式通販・チケット等）。
  // チケット系(ぴあ/イープラス/ローチケ)はアフィリエイトプログラムが無いため b2b に統一。
  { name: 'チケットぴあ', kind: 'b2b', test: (h) => /(^|\.)t\.pia\.jp$/.test(h) || /(^|\.)pia\.jp$/.test(h) },
  { name: 'プレミアムバンダイ', kind: 'b2b', test: (h) => /(^|\.)p-bandai\.jp$/.test(h) || /(^|\.)premiumbandai/.test(h) },
  { name: 'イープラス', kind: 'b2b', test: (h) => /(^|\.)eplus\.jp$/.test(h) },
  { name: 'ローチケ', kind: 'b2b', test: (h) => /(^|\.)l-tike\.com$/.test(h) },
];

function hostOf(url: string): string {
  try { return new URL(url).host.toLowerCase(); } catch { return ''; }
}

// 「実際に自分のアフィリエイト識別子が乗っているURLか」を判定する。
// hasAffiliate をこれで導出することで、未提携/タグ未設定の販路（アニメイト・駿河屋直・Amazonタグ空・
// チケット系）を primaryOffer が誤って代表に選ばない＝稼げない販路を優先しない。
const AFFILIATE_HOSTS = [A8_HOST, VC_HOST, 'hb.afl.rakuten.co.jp'];
export function isAffiliateUrl(url: string): boolean {
  const h = hostOf(url);
  if (!h) return false;
  if (AFFILIATE_HOSTS.includes(h)) return true;
  // Amazon はアソシエイトタグ(AFFILIATE_TAGS.amazon)が付いていれば成果が付く
  if (/(^|\.)amazon\.co\.jp$/.test(h)) {
    try { return new URL(url).searchParams.has('tag'); } catch { return false; }
  }
  return false;
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
  // kind='affiliate' は「アフィ提携の意図がある店」。実際に成果が付くかは変換後URLで判定する。
  return { retailer: rule.name, hasAffiliate: rule.kind === 'affiliate' && isAffiliateUrl(url), url };
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

// 公式出店店舗・公式通販（あみあみ/駿河屋/アニメイト/楽天ブックス）か。
// 転売/中古の混じる一般ショップより信頼できるため、代表販路で優先する（本人方針）。
const OFFICIAL_BRANDS = ['あみあみ', '駿河屋', 'アニメイト', '楽天ブックス'];
export function isOfficialOffer(o: Pick<Offer, 'official' | 'retailer' | 'shop'>): boolean {
  if (o.official) return true;
  const name = `${o.retailer ?? ''} ${o.shop ?? ''}`;
  return OFFICIAL_BRANDS.some((b) => name.includes(b));
}

/** 代表の販路を選ぶ：アフィ対応を最優先 → 単品(非セット) → 公式店 → 価格が安い → 先頭。
 * セットを代表にしない（単品より高く「高すぎ」と誤解されるのを防ぐ。セットはラベル付きで併記）。
 * アフィ対応の判定は保存済み hasAffiliate ではなく変換後の実URLで行う。 */
export function primaryOffer(offers: Offer[]): Offer | null {
  if (!offers.length) return null;
  const aff = offers.filter((o) => isAffiliateUrl(offerUrl(o)));
  const pool = aff.length ? aff : offers;
  return [...pool].sort((a, b) =>
    (Number(!!a.isSet) - Number(!!b.isSet)) ||
    (Number(isOfficialOffer(b)) - Number(isOfficialOffer(a))) ||
    ((a.price ?? Infinity) - (b.price ?? Infinity)),
  )[0];
}

/** 販路の遷移先URL。保存済みの affiliateUrl が素のURLでも、この時点でアフィ変換する。 */
export function offerUrl(o: Pick<Offer, 'url' | 'affiliateUrl'>): string {
  return affiliatize(o.affiliateUrl || o.url).url;
}

/** アイテムの購入導線を解決（代表販路から）。 */
export function resolveBuy(e: BuyFields): { mode: BuyMode; url: string; retailer: string } {
  const p = primaryOffer(getOffers(e));
  if (!p || !p.url) return { mode: 'none', url: '', retailer: '' };
  const url = offerUrl(p);
  return { mode: isAffiliateUrl(url) ? 'cart' : 'link', url, retailer: p.retailer };
}

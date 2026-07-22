import type { VercelRequest, VercelResponse } from '@vercel/node';

// 商品候補検索（購入リンク補完・価格取得）。複数販路を横断して候補を返す。
// 楽天: 2026新API（RAKUTEN_APP_ID＋accessKey）。Yahoo!: 商品検索v3（YAHOO_APP_ID。未設定ならスキップ）。
// あみあみ・駿河屋・アニメイトは楽天/Yahoo!の公式出店店舗経由で価格が取れる → 公式店を優先表示。

interface Candidate {
  title: string; price: number; url: string; image: string; shop: string; retailer: string; hasAffiliate: boolean;
  shopCode?: string; official?: boolean;
}

// 楽天/Yahoo!に公式出店しているホビー系ショップ（優先表示・「公式店」表示の対象）。
// 全体検索だと転売系ショップが上位を埋めて公式店が圏外に沈むため、公式店は shopCode 指定で別途検索する。
const RAKUTEN_OFFICIAL_SHOPS: Record<string, string> = {
  'amiami': 'あみあみ',
  'surugaya-a-too': '駿河屋',
  'acosbyanimate': 'アニメイト',
  'book': '楽天ブックス', // 楽天直営
};
const YAHOO_OFFICIAL_SELLERS: Record<string, string> = {
  'suruga-ya': '駿河屋',
  'amiami': 'あみあみ',
};

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function rakutenRequest(keyword: string, hits: number, shopCode?: string): Promise<Candidate[]> {
  const appId = process.env.RAKUTEN_APP_ID?.trim();
  const accessKey = process.env.RAKUTEN_ACCESS_KEY?.trim();
  if (!appId || !accessKey) return [];
  const affiliateId = (process.env.RAKUTEN_AFFILIATE_ID || '').trim();
  const params = new URLSearchParams({
    applicationId: appId, keyword, hits: String(hits), format: 'json', formatVersion: '2',
    ...(affiliateId ? { affiliateId } : {}),
    ...(shopCode ? { shopCode } : {}),
  });
  const referer = process.env.RAKUTEN_REFERER || 'https://fan-make-calendar.vercel.app/';
  const r = await fetch(`https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260401?${params.toString()}`, {
    headers: { accessKey, Referer: referer, Origin: referer.replace(/\/$/, '') },
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = (await r.json()) as { Items?: any[] };
  return (data.Items ?? []).map((it) => ({
    title: it.itemName as string,
    price: it.itemPrice as number,
    url: (it.affiliateUrl || it.itemUrl) as string,
    image: ((it.mediumImageUrls && it.mediumImageUrls[0]) || (it.smallImageUrls && it.smallImageUrls[0]) || '') as string,
    shop: it.shopName as string,
    retailer: '楽天',
    hasAffiliate: !!affiliateId,
    shopCode: it.shopCode as string | undefined,
    official: !!RAKUTEN_OFFICIAL_SHOPS[(it.shopCode as string) ?? ''],
  }));
}

async function searchRakuten(keyword: string): Promise<Candidate[]> {
  // 全体検索＋公式店ごとのshopCode検索を少しずらして並列実行（レート制限429回避のためスタガー）
  const shopCodes = Object.keys(RAKUTEN_OFFICIAL_SHOPS);
  const jobs = [
    rakutenRequest(keyword, 8),
    ...shopCodes.map((sc, i) => delay(250 * (i + 1)).then(() => rakutenRequest(keyword, 3, sc))),
  ];
  const results = await Promise.all(jobs.map((p) => p.catch(() => [] as Candidate[])));
  // 公式店の結果を優先し、URL重複を除去
  const seen = new Set<string>();
  const merged: Candidate[] = [];
  for (const c of [...results.slice(1).flat(), ...results[0]]) {
    const key = c.url.split('?')[0];
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(c);
  }
  return merged;
}

async function searchYahoo(keyword: string): Promise<Candidate[]> {
  const appId = process.env.YAHOO_APP_ID?.trim();
  if (!appId) return [];
  // バリューコマース連携時: ck.jp.ap.valuecommerce.com/servlet/referral?sid=…&pid=…&vc_url= 形式をそのまま入れる
  const vcAffiliateId = process.env.YAHOO_VC_AFFILIATE_ID?.trim();
  const params = new URLSearchParams({ appid: appId, query: keyword, results: '8' });
  if (vcAffiliateId) { params.set('affiliate_type', 'vc'); params.set('affiliate_id', vcAffiliateId); }
  const r = await fetch(`https://shopping.yahooapis.jp/ShoppingWebService/V3/itemSearch?${params.toString()}`, {
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = (await r.json()) as { hits?: any[] };
  return (data.hits ?? []).map((it) => ({
    title: it.name as string,
    price: it.price as number,
    url: it.url as string,
    image: (it.image?.medium || it.image?.small || '') as string,
    shop: (it.seller?.name || '') as string,
    retailer: 'Yahoo!',
    hasAffiliate: !!vcAffiliateId,
    shopCode: it.seller?.sellerId as string | undefined,
    official: !!YAHOO_OFFICIAL_SELLERS[(it.seller?.sellerId as string) ?? ''],
  }));
}

// 注: あみあみ本店・駿河屋本店はCloudflareでサーバー403、アニメイト本店はAPI無し → 直接取得不可。
// 上記の公式出店店舗（楽天/Yahoo!）経由で取得し、それ以外は「各店で探す」リンクで対応する。

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const keyword = (req.query.keyword as string | undefined)?.trim();
  if (!keyword) return res.status(400).json({ error: 'keyword required' });

  const [rakuten, yahoo] = await Promise.all([
    searchRakuten(keyword).catch(() => [] as Candidate[]),
    searchYahoo(keyword).catch(() => [] as Candidate[]),
  ]);
  // 公式店を先頭に（sortは安定なので同グループ内の順序は維持）
  const items = [...rakuten, ...yahoo]
    .sort((a, b) => Number(b.official ?? false) - Number(a.official ?? false))
    .slice(0, 12);
  return res.status(200).json({ items });
}

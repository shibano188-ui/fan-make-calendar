import type { VercelRequest, VercelResponse } from '@vercel/node';

// 商品候補検索（購入リンク補完・価格取得）。複数販路を横断して候補を返す。
// 楽天: 2026新API（RAKUTEN_APP_ID＋accessKey）。あみあみ: 非公式JSON API（キー不要）。

interface Candidate {
  title: string; price: number; url: string; image: string; shop: string; retailer: string; hasAffiliate: boolean;
}

async function searchRakuten(keyword: string): Promise<Candidate[]> {
  const appId = process.env.RAKUTEN_APP_ID?.trim();
  const accessKey = process.env.RAKUTEN_ACCESS_KEY?.trim();
  if (!appId || !accessKey) return [];
  const affiliateId = (process.env.RAKUTEN_AFFILIATE_ID || '').trim();
  const params = new URLSearchParams({
    applicationId: appId, keyword, hits: '8', format: 'json', formatVersion: '2',
    ...(affiliateId ? { affiliateId } : {}),
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
  }));
}

// 注: あみあみ(Cloudflareでサーバー403)・アニメイト(API無し)はサーバー自動取得不可。
// それらは「各店で探す」検索リンク(クライアント側でブラウザが開く)で対応する。

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const keyword = (req.query.keyword as string | undefined)?.trim();
  if (!keyword) return res.status(400).json({ error: 'keyword required' });

  const items = await searchRakuten(keyword).catch(() => [] as Candidate[]);
  return res.status(200).json({ items });
}

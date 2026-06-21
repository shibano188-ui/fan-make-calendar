import type { VercelRequest, VercelResponse } from '@vercel/node';

// 商品候補検索（リンク無し/価格不明の補完）。楽天市場 商品検索API（無料アプリIDで動く）。
// RAKUTEN_APP_ID 未設定なら disabled で返す（config駆動・取得後に有効化）。
// affiliateId があれば候補URLは楽天アフィリンクで返る。
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  // 2026新API: applicationId(UUID) ＋ accessKey の二重認証が必須
  const appId = process.env.RAKUTEN_APP_ID?.trim();
  const accessKey = process.env.RAKUTEN_ACCESS_KEY?.trim();
  if (!appId || !accessKey) return res.status(200).json({ disabled: true, items: [] });

  const keyword = (req.query.keyword as string | undefined)?.trim();
  if (!keyword) return res.status(400).json({ error: 'keyword required' });

  const affiliateId = (process.env.RAKUTEN_AFFILIATE_ID || '').trim();
  const params = new URLSearchParams({
    applicationId: appId,
    keyword,
    hits: '12',
    format: 'json',
    formatVersion: '2',
    ...(affiliateId ? { affiliateId } : {}),
  });

  try {
    const referer = process.env.RAKUTEN_REFERER || 'https://fan-make-calendar.vercel.app/';
    const r = await fetch(`https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260401?${params.toString()}`, {
      headers: { accessKey, Referer: referer, Origin: referer.replace(/\/$/, '') },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return res.status(200).json({ items: [] });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await r.json()) as { Items?: any[] };
    const items = (data.Items ?? []).map((it) => ({
      title: it.itemName as string,
      price: it.itemPrice as number,
      url: (it.affiliateUrl || it.itemUrl) as string,
      image: ((it.mediumImageUrls && it.mediumImageUrls[0]) || (it.smallImageUrls && it.smallImageUrls[0]) || '') as string,
      shop: it.shopName as string,
      hasAffiliate: !!affiliateId,
    }));
    return res.status(200).json({ items });
  } catch {
    return res.status(200).json({ items: [] });
  }
}

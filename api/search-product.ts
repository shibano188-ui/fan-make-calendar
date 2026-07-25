import type { VercelRequest, VercelResponse } from '@vercel/node';
import { rateLimited } from './_ratelimit.js';
import { searchCandidates } from './_product-search.js';

// 商品候補検索（購入リンク補完・価格取得）。検索ロジック本体は _product-search.ts に集約。
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (await rateLimited('search', req, res)) return;

  const keyword = (req.query.keyword as string | undefined)?.trim();
  if (!keyword) return res.status(400).json({ error: 'keyword required' });

  const items = await searchCandidates(keyword);
  return res.status(200).json({ items });
}

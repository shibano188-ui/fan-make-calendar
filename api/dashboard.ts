import type { VercelRequest, VercelResponse } from '@vercel/node';
import { PAGE } from './_dashboard-html.js';

// チーム用の指標ダッシュボード。/api/dashboard を開くと合言葉を聞かれる。
// データは /api/metrics-data から取る。アプリ本体(SPA)とは別物なので、
// ここを壊してもアプリには影響しない。
export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  return res.status(200).send(PAGE);
}

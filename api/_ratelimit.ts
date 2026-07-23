import type { VercelRequest } from '@vercel/node';
import { Redis } from '@upstash/redis';
import { Ratelimit } from '@upstash/ratelimit';

// Vercel Marketplace (Upstash) が KV_* 名で env を提供するため fromEnv() は使わない
const url = process.env.KV_REST_API_URL;
const token = process.env.KV_REST_API_TOKEN;
const redis = url && token ? new Redis({ url, token }) : null;

// エンドポイントごとの上限。IP単位（分・日）＋全体（日＝分散攻撃時のコスト上限）。
// parse/search は外部API課金、title/delete はDBへの書き込み・破壊操作なので桁を分けている。
const BUCKETS = {
  parse:  { min: 20, day: 150, globalDay: 3000 },  // Claude API
  search: { min: 30, day: 300, globalDay: 5000 },  // 楽天/Yahoo API（投稿1件で複数回叩く）
  title:  { min: 10, day: 60,  globalDay: 1000 },  // events更新（重複時の地名付与のみ）
  delete: { min: 5,  day: 20,  globalDay: 200 },   // アカウント削除（破壊操作）
} as const;

export type RateLimitBucket = keyof typeof BUCKETS;

const cache = new Map<RateLimitBucket, { perMinute: Ratelimit; perDay: Ratelimit; globalDay: Ratelimit }>();

function limitersFor(bucket: RateLimitBucket) {
  if (!redis) return null;
  let l = cache.get(bucket);
  if (!l) {
    const c = BUCKETS[bucket];
    l = {
      perMinute: new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(c.min, '1 m'), prefix: `rl:${bucket}:min` }),
      perDay:    new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(c.day, '1 d'), prefix: `rl:${bucket}:day` }),
      globalDay: new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(c.globalDay, '1 d'), prefix: `rl:${bucket}:all` }),
    };
    cache.set(bucket, l);
  }
  return l;
}

export function getClientIp(req: VercelRequest): string {
  const fwd = req.headers['x-forwarded-for'];
  const first = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(',')[0]?.trim();
  return first || req.socket?.remoteAddress || 'unknown';
}

export async function checkRateLimit(
  bucket: RateLimitBucket,
  ip: string,
): Promise<{ ok: true } | { ok: false; retryAfterSec: number }> {
  const limiters = limitersFor(bucket);
  if (!limiters) return { ok: true };
  try {
    const results = await Promise.all([
      limiters.perMinute.limit(ip),
      limiters.perDay.limit(ip),
      limiters.globalDay.limit('global'),
    ]);
    const blocked = results.filter(r => !r.success);
    if (blocked.length === 0) return { ok: true };
    const reset = Math.max(...blocked.map(r => r.reset));
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((reset - Date.now()) / 1000)) };
  } catch {
    // Redis障害でも機能は止めない（フェイルオープン）
    return { ok: true };
  }
}

/** 既存の呼び出し互換（parse-event用）。 */
export function checkParseRateLimit(ip: string) {
  return checkRateLimit('parse', ip);
}

/** 429を返すところまでの定型。超過時 true を返す。 */
export async function rateLimited(
  bucket: RateLimitBucket,
  req: VercelRequest,
  res: { setHeader: (k: string, v: string) => void; status: (n: number) => { json: (b: unknown) => unknown } },
): Promise<boolean> {
  const rl = await checkRateLimit(bucket, getClientIp(req));
  if (rl.ok) return false;
  res.setHeader('Retry-After', String(rl.retryAfterSec));
  res.status(429).json({ error: 'rate_limited' });
  return true;
}

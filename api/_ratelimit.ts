import type { VercelRequest } from '@vercel/node';
import { Redis } from '@upstash/redis';
import { Ratelimit } from '@upstash/ratelimit';

// Vercel Marketplace (Upstash) が KV_* 名で env を提供するため fromEnv() は使わない
const url = process.env.KV_REST_API_URL;
const token = process.env.KV_REST_API_TOKEN;
const redis = url && token ? new Redis({ url, token }) : null;

// IP単位: 20回/分・150回/日。全体: 3000回/日（分散攻撃時のコスト上限）
const limiters = redis
  ? {
      perMinute: new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(20, '1 m'), prefix: 'rl:parse:min' }),
      perDay:    new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(150, '1 d'), prefix: 'rl:parse:day' }),
      globalDay: new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(3000, '1 d'), prefix: 'rl:parse:all' }),
    }
  : null;

export function getClientIp(req: VercelRequest): string {
  const fwd = req.headers['x-forwarded-for'];
  const first = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(',')[0]?.trim();
  return first || req.socket?.remoteAddress || 'unknown';
}

export async function checkParseRateLimit(
  ip: string,
): Promise<{ ok: true } | { ok: false; retryAfterSec: number }> {
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
    // Redis障害でも解析機能は止めない
    return { ok: true };
  }
}

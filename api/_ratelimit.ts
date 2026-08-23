import type { VercelRequest } from '@vercel/node';
import { Redis } from '@upstash/redis';
import { Ratelimit } from '@upstash/ratelimit';
import type { Identity, Tier } from './_identity.js';

// Vercel Marketplace (Upstash) が KV_* 名で env を提供するため fromEnv() は使わない
const url = process.env.KV_REST_API_URL;
const token = process.env.KV_REST_API_TOKEN;
const redis = url && token ? new Redis({ url, token }) : null;

// エンドポイントごとの上限。IP単位（分・日）＋全体（日＝分散攻撃時のコスト上限）。
// parse/search は外部API課金、title/delete はDBへの書き込み・破壊操作なので桁を分けている。
const BUCKETS = {
  // parse の globalDay は **財布の栓の暫定版**。実測 ¥0.62/回（キャッシュ無し）なので、
  // 3000回/日 = 約¥1,860/日 = 月5万超となり、プリペイド残高(月¥10,000)を軽く超えていた。
  // スマート入力の枠 月¥6,000 ≒ ¥194/日 ≒ 310回/日 に合わせて 400 に絞る。
  // 円で数える本式の栓（ai_usage の月次集計）が入ったら、この行は撤去してよい。
  // ⚠️ owner は checkRateLimitFor で素通りするので、仕込み作業はこの栓に当たらない。
  parse:  { min: 20, day: 150, globalDay: 400 },   // Claude API
  // テーマ生成。1回あたり Sonnet で ¥1〜2（システムはキャッシュが効く長さがある）。
  // 月¥3,000 の枠 ÷ 30日 ÷ ¥2 ≒ 50回/日 を全体の栓に置く。
  // 個人の栓は下の BUCKET_USER_LIMITS で別に切る（回数の桁が parse と違うため）。
  theme:  { min: 6,  day: 40,  globalDay: 50 },    // Claude API（上位モデル）
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

// ok:true 側にも retryAfterSec を（undefined で）持たせる。Vercel は api/ を
// strictNullChecks 無しで型チェックするので、`if (rl.ok) return` による絞り込みが効かず、
// 呼び出し側の rl.retryAfterSec が TS2339 になる（ビルドは通るがログにエラーが出続ける）。
export async function checkRateLimit(
  bucket: RateLimitBucket,
  ip: string,
): Promise<{ ok: true; retryAfterSec?: undefined } | { ok: false; retryAfterSec: number }> {
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

/** 既存の呼び出し互換（parse-event用）。身元不明のときのフォールバック。 */
export function checkParseRateLimit(ip: string) {
  return checkRateLimit('parse', ip);
}

// ── 身元が分かっているときの上限 ────────────────────────────────
// キーがIPからuser_idに変わるので、**桁を上げてよい**。1回あたり¥0.5前後なので、
// 300回/日でも¥150。個人の枠をケチる意味は無い。総額は _aiusage.ts の栓で守る。
// owner は素通り（自分でコンテンツを仕込むときに詰まらせない）。
// new（登録24時間以内）だけきつくする＝悪用の実行部隊はここに現れるため。
const USER_LIMITS: Record<Exclude<Tier, 'owner'>, { min: number; day: number }> = {
  registered: { min: 60, day: 300 },
  anonymous:  { min: 60, day: 100 },
  new:        { min: 20, day: 30 },
};

// エンドポイントごとに桁が違うときの上書き。
// テーマ生成は「気に入るまで作り直す」が普通に起きるので**個人にも1日の栓を付ける**
// （プレミアムは保存数が無制限になるだけで、生成回数は無制限にしない
//   → [[2026-08-22-ai-usage-limits]]）。
const BUCKET_USER_LIMITS: Partial<Record<RateLimitBucket, Record<Exclude<Tier, 'owner'>, { min: number; day: number }>>> = {
  theme: {
    registered: { min: 6, day: 20 },
    anonymous:  { min: 6, day: 10 },
    new:        { min: 4, day: 6 },
  },
};

const userCache = new Map<string, { perMinute: Ratelimit; perDay: Ratelimit }>();

function userLimitersFor(bucket: RateLimitBucket, tier: Exclude<Tier, 'owner'>) {
  if (!redis) return null;
  const key = `${bucket}:${tier}`;
  let l = userCache.get(key);
  if (!l) {
    const c = BUCKET_USER_LIMITS[bucket]?.[tier] ?? USER_LIMITS[tier];
    l = {
      perMinute: new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(c.min, '1 m'), prefix: `rl:${bucket}:u:${tier}:min` }),
      perDay:    new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(c.day, '1 d'), prefix: `rl:${bucket}:u:${tier}:day` }),
    };
    userCache.set(key, l);
  }
  return l;
}

/**
 * 身元が分かっていれば user_id で、分からなければIPで数える。
 * 移行期のための二段構え: まずJWTを送れていない経路が無いかログで確認し、
 * ゼロになってから「JWT必須」に切り替える（いきなり必須にすると、
 * トークンを送れていない画面の解析が丸ごと死ぬ）。
 */
export async function checkRateLimitFor(
  bucket: RateLimitBucket,
  identity: Identity | null,
  ip: string,
): Promise<{ ok: true; retryAfterSec?: undefined } | { ok: false; retryAfterSec: number }> {
  if (!identity) return checkRateLimit(bucket, ip);
  if (identity.tier === 'owner') return { ok: true };   // オーナーは素通り

  const limiters = userLimitersFor(bucket, identity.tier);
  const global = limitersFor(bucket);
  if (!limiters || !global) return { ok: true };
  try {
    const results = await Promise.all([
      limiters.perMinute.limit(identity.userId),
      limiters.perDay.limit(identity.userId),
      global.globalDay.limit('global'),
    ]);
    const blocked = results.filter(r => !r.success);
    if (blocked.length === 0) return { ok: true };
    const reset = Math.max(...blocked.map(r => r.reset));
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((reset - Date.now()) / 1000)) };
  } catch {
    return { ok: true };   // Redis障害でも機能は止めない（フェイルオープン）
  }
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

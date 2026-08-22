import { AsyncLocalStorage } from 'node:async_hooks';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Tier } from './_identity.js';

// AIの利用を **回数ではなく「円」** で数えるための台帳。
//
// 回数で数えると次の3つが見えないまま効いてしまう:
//  ・画像入力はテキストの倍以上かかる
//  ・parse は日付が取れないと1回再試行する＝1リクエストで2回課金される
//  ・テーマ生成は上位モデル＋長いプロンプトで、桁が1〜2つ上がる
// 円で数えれば、上限を緩くしても最悪額が読める。
//
// Anthropic には残高照会APIが無いので、**この台帳が残高計の代わり**になる。
// → [[2026-08-22-ai-usage-limits]]

export type AiCall = {
  model: string;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
};

// 100万トークンあたりのUSD。モデルを増やすときはここに足す。
// 未知のモデルは Haiku より高い前提（安く見積もって取りこぼすより、高く見て止めるほうが安全）。
const PRICES: Record<string, { in: number; out: number; cacheRead: number; cacheWrite: number }> = {
  'claude-haiku-4-5': { in: 1, out: 5, cacheRead: 0.10, cacheWrite: 1.25 },
  'claude-sonnet-5':  { in: 3, out: 15, cacheRead: 0.30, cacheWrite: 3.75 },
  'claude-opus-5':    { in: 5, out: 25, cacheRead: 0.50, cacheWrite: 6.25 },
};
const UNKNOWN_PRICE = PRICES['claude-opus-5'];

const USD_JPY = Number(process.env.USD_JPY ?? 155);

const store = new AsyncLocalStorage<AiCall[]>();

/** 中で走った Anthropic 呼び出しを1リクエスト分まとめて集める。 */
export function withAiUsage<T>(calls: AiCall[], fn: () => Promise<T>): Promise<T> {
  return store.run(calls, fn);
}

/** Anthropic のレスポンスの usage を記録する。withAiUsage の外で呼んでも安全（無視される）。 */
export function noteAiUsage(model: string, usage: unknown): void {
  const calls = store.getStore();
  if (!calls || !usage) return;
  const u = usage as Record<string, number | undefined>;
  calls.push({
    model,
    input: u.input_tokens ?? 0,
    output: u.output_tokens ?? 0,
    cacheRead: u.cache_read_input_tokens ?? 0,
    cacheWrite: u.cache_creation_input_tokens ?? 0,
  });
}

export type UsageTotal = {
  calls: number;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  costUsd: number;
  costJpy: number;
};

export function totalUsage(calls: AiCall[]): UsageTotal {
  const t: UsageTotal = {
    calls: calls.length, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, costUsd: 0, costJpy: 0,
  };
  for (const c of calls) {
    const p = PRICES[c.model] ?? UNKNOWN_PRICE;
    t.input += c.input;
    t.output += c.output;
    t.cacheRead += c.cacheRead;
    t.cacheWrite += c.cacheWrite;
    t.costUsd +=
      (c.input * p.in + c.output * p.out + c.cacheRead * p.cacheRead + c.cacheWrite * p.cacheWrite) / 1_000_000;
  }
  t.costJpy = t.costUsd * USD_JPY;
  return t;
}

let admin: SupabaseClient | null = null;
function adminClient(): SupabaseClient | null {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  if (!admin) {
    admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  }
  return admin;
}

/**
 * 1リクエスト分を台帳に1行書く。**失敗しても握りつぶす**
 * （記録が取れないことより、機能が止まるほうが困る）。
 * 表がまだ無いうちはここで静かに失敗し、SQLを流した時点から貯まりはじめる。
 */
export async function saveAiUsage(opts: {
  endpoint: string;
  userId: string | null;
  tier: Tier | null;
  calls: AiCall[];
}): Promise<void> {
  if (opts.calls.length === 0) return;
  const t = totalUsage(opts.calls);
  // ログにも出す。表を作る前でも、Vercelのログで実額を追える
  console.log(
    `[ai-usage] ${opts.endpoint} tier=${opts.tier ?? 'none'} calls=${t.calls} ` +
    `in=${t.input} out=${t.output} cacheR=${t.cacheRead} cacheW=${t.cacheWrite} jpy=${t.costJpy.toFixed(2)}`,
  );
  const db = adminClient();
  if (!db) return;
  try {
    const { error } = await db.from('ai_usage').insert({
      user_id: opts.userId,
      endpoint: opts.endpoint,
      tier: opts.tier,
      model: opts.calls[0].model,
      calls: t.calls,
      input_tokens: t.input,
      output_tokens: t.output,
      cache_read_tokens: t.cacheRead,
      cache_write_tokens: t.cacheWrite,
      cost_usd: Number(t.costUsd.toFixed(6)),
      cost_jpy: Number(t.costJpy.toFixed(4)),
    });
    // 書けなくても機能は止めない。ただし**黙って落とさない**——
    // 表がまだ無い/権限が違うのに気づけないと、台帳が空のまま日が過ぎる。
    if (error) console.warn(`[ai-usage][insert-failed] ${error.message}`);
  } catch (e) {
    console.warn(`[ai-usage][insert-threw] ${e instanceof Error ? e.message : String(e)}`);
  }
}

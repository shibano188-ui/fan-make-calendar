// 運営のボットの1回ぶん。提案・投稿の確認 → 巡回（_crawl.ts）→ 店の全作品の巡回（_catalog.ts）→ 残りの時間で手直し。
// 2026-11-21 から GitHub Actions（.github/workflows/bot.yml → scripts/bot/run.ts）で10分おきに回す。
// Vercel の無料枠の CPU（月4時間）を、この巡回でほぼ使い切っていたため（柴野）。
// api/metrics.ts の ?task=bot からも同じものを呼べる（古い pg_cron・手で回すとき用）。
// api/ の関数の数に数えないよう `_` で始めている。
import type { SupabaseClient } from '@supabase/supabase-js';
import { autoEnrich } from './_enrich.js';
import { crawlNext } from './_crawl.js';
import { crawlCatalogs } from './_catalog.js';
import { processProposals, processSubmissions } from './_submissions.js';
import { runBotPaced } from './_pace.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any>;

/** everyOther=true のときは、巡回・手直しを毎時0・20・40分台の回だけ進める（10分おきに呼ばれる Vercel 用） */
export async function runBot(client: Db, opts: { everyOther?: boolean } = {}) {
  const started = Date.now();
  // 店への機械的なアクセスの間隔を守る（アニメイトは約20分に1回。_pace.ts）
  // 全部で100秒ほどまで（1回に読む量を抑えて、店に負担をかけない）
  const result = await runBotPaced(client, async () => {
    // 最優先: ＋αの提案の確認と、送られた情報の登録（2026-09-29。_submissions.ts）。
    // テーブルがまだ無い環境（SQL未適用）では空振りするだけ
    const proposals = await processProposals(client, 20_000).catch((e) => ({ error: String(e) }));
    const submissions = await processSubmissions(client, 20_000).catch((e) => ({ error: String(e) }));
    if (opts.everyOther && new Date().getUTCMinutes() % 20 >= 10) {
      const skipped = { skipped: '20分に1回' };
      return { proposals, submissions, crawl: skipped, catalog: skipped, enrich: skipped };
    }
    const crawl = await crawlNext(client).catch((e) => ({ error: String(e) }));
    const catalog = await crawlCatalogs(client, Math.min(40_000, Math.max(0, 85_000 - (Date.now() - started)))).catch((e) => ({ error: String(e) }));
    const enrich = await autoEnrich(client, Math.max(0, 95_000 - (Date.now() - started)));
    return { proposals, submissions, crawl, catalog, enrich };
  });
  // 毎回の結果をログに残す（どの店がどれだけ進んだかを見る）
  console.log('[bot]', JSON.stringify({ tookMs: Date.now() - started, ...result }));
  return result;
}

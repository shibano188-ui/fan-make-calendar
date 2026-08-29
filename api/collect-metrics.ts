import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

// 毎日Cron: ダッシュボード用の指標を metrics_daily に貯める。
// 中身の計算は全部 SQL 側（sql/2026-08-29-metrics-daily.sql の collect_daily_metrics）。
// ここは「日付を決めて呼ぶ」だけにしてある＝指標を足すときにこのファイルを触らなくてよい。
//
// Vercel Cron は CRON_SECRET 設定時に `Authorization: Bearer <secret>` を付けて呼ぶ。
//
// 過去を手で埋めるとき（初回に1回）:
//   curl -H "Authorization: Bearer $CRON_SECRET" \
//        "https://fanhive.jp/api/collect-metrics?from=2026-05-22"

/** 日本時間の「今日」。Cron は 00:35 JST に走るので、前日が締まった直後になる。 */
function todayJst(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.authorization ?? '';
  if (!secret || auth !== `Bearer ${secret}`) return res.status(401).json({ error: 'Unauthorized' });

  const supabaseUrl = process.env.VITE_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!supabaseUrl || !serviceKey) return res.status(500).json({ error: 'Server config error' });
  const db = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

  const today = todayJst();
  const yesterday = addDays(today, -1);

  // 埋め直し（?from=YYYY-MM-DD）。created_at から再現できる指標だけが入る。
  const from = typeof req.query.from === 'string' ? req.query.from : null;
  if (from) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) return res.status(400).json({ error: 'from must be YYYY-MM-DD' });
    const { data, error } = await db.rpc('backfill_daily_metrics', { from_day: from, to_day: yesterday });
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true, backfilled: { from, to: yesterday, rows: data } });
  }

  // 前日 … 24時間ぶんが締まったので確定させる。
  // 課金状態は入れない（「前日に何人が課金中だったか」はもう取れないので、
  // 前日の実行時に記録した値をそのまま残す）。
  const done = await db.rpc('collect_daily_metrics', { target_day: yesterday, include_snapshot: false });
  if (done.error) return res.status(500).json({ error: done.error.message });

  // 当日 … 途中経過と、いまの課金状態。翌日の実行で数字が確定する。
  const now = await db.rpc('collect_daily_metrics', { target_day: today, include_snapshot: true });
  if (now.error) return res.status(500).json({ error: now.error.message });

  return res.status(200).json({ ok: true, days: [yesterday, today] });
}

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

// ダッシュボードが読むデータ。metrics_daily を「1日1行」に畳んで返す。
//
// 合言葉(METRICS_TOKEN)でしか開けない。チーム内で見るだけのものなので、
// ログイン画面は作らず1つの合言葉で足りる。metrics_daily はRLSでクライアントから
// 読めないので、ここが唯一の入口になる。

const METRICS = [
  'signups', 'active_users', 'events_created', 'likes', 'calendar_adds',
  'searches', 'buy_clicks', 'ai_calls', 'ai_cost_jpy',
  'users_total', 'events_total', 'follows_total',
  'paid_active', 'paid_trial', 'paid_monthly', 'paid_yearly',
] as const;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const token = process.env.METRICS_TOKEN;
  const given = (req.query.token as string | undefined) ?? '';
  if (!token || given !== token) return res.status(401).json({ error: 'Unauthorized' });

  const supabaseUrl = process.env.VITE_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!supabaseUrl || !serviceKey) return res.status(500).json({ error: 'Server config error' });
  const db = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

  // 縦持ちのまま取って、ここで畳む。ビューに依存しないので
  // metrics_daily_wide が無くても動く。
  const { data, error } = await db
    .from('metrics_daily')
    .select('day, metric, value')
    .eq('source', 'app')
    .order('day', { ascending: true })
    .limit(20000);
  if (error) return res.status(500).json({ error: error.message });

  const byDay = new Map<string, Record<string, number>>();
  for (const r of data ?? []) {
    const row = byDay.get(r.day) ?? {};
    row[r.metric] = Number(r.value);
    byDay.set(r.day, row);
  }

  const days = [...byDay.keys()].sort();
  const series: Record<string, (number | null)[]> = {};
  for (const m of METRICS) series[m] = days.map((d) => byDay.get(d)?.[m] ?? null);

  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({ days, series, updatedAt: new Date().toISOString() });
}

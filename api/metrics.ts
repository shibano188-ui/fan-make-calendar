import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { loginPage, dashboardPage } from './_dashboard-html.js';

// 指標まわりの入口。Hobbyプランは1デプロイ12関数までで、既に11個あるため
// 「集める・返す・見せる」の3つを1本にまとめてある。呼ばれ方で分岐する:
//
//   Authorization: Bearer <CRON_SECRET>   … 毎日のCron。metrics_daily に貯める
//   POST（pw=…）                          … パスワード確認。合えばCookieを置く
//   GET（Cookieあり）                      … データを埋め込んだダッシュボード
//   GET（Cookieなし）                      … パスワードの入力画面
//
// 画面側からは一切通信しない。Service Worker や sessionStorage の状態で
// 「押しても何も起きない」が起きないようにするため。
//
// 集計の中身は SQL 側（collect_daily_metrics）。指標を足してもここは触らなくてよい。
//
// 過去を手で埋めるとき:
//   curl -H "Authorization: Bearer $CRON_SECRET" \
//        "https://fanhive.jp/api/metrics?from=2026-05-22"

const METRICS = [
  'signups', 'active_users', 'events_created', 'likes', 'calendar_adds',
  'searches', 'buy_clicks', 'ai_calls', 'ai_cost_jpy',
  'users_total', 'users_registered', 'users_engaged',
  'users_app', 'users_ios', 'users_android',
  'events_total', 'follows_total',
  'paid_active', 'paid_trial', 'paid_monthly', 'paid_yearly',
] as const;

/** 日本時間の「今日」。Cronは03:00 JSTに走るので、前日は締まっている。 */
function todayJst(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function db() {
  const url = process.env.VITE_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

/** Cron本体。前日を確定させ、当日は途中経過＋いまの課金状態を入れる。 */
export async function collect(req: VercelRequest, res: VercelResponse) {
  const client = db();
  if (!client) return res.status(500).json({ error: 'Server config error' });

  const today = todayJst();
  const yesterday = addDays(today, -1);

  const from = typeof req.query.from === 'string' ? req.query.from : null;
  if (from) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) return res.status(400).json({ error: 'from must be YYYY-MM-DD' });
    const { data, error } = await client.rpc('backfill_daily_metrics', { from_day: from, to_day: yesterday });
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true, backfilled: { from, to: yesterday, rows: data } });
  }

  const done = await client.rpc('collect_daily_metrics', { target_day: yesterday, include_snapshot: false });
  if (done.error) return res.status(500).json({ error: done.error.message });

  const now = await client.rpc('collect_daily_metrics', { target_day: today, include_snapshot: true });
  if (now.error) return res.status(500).json({ error: now.error.message });

  return res.status(200).json({ ok: true, days: [yesterday, today] });
}

/** 縦持ちの metrics_daily を「1日1行」に畳む。 */
async function series() {
  const client = db();
  if (!client) throw new Error('Server config error');

  // PostgREST は1回の応答が最大1000行（db-max-rows）。指標が16本あると
  // 60日ぶんちょっとで頭打ちになるので、range でページ送りして全部取る。
  const byDay = new Map<string, Record<string, number>>();
  const PAGE_SIZE = 1000;
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await client
      .from('metrics_daily')
      .select('day, metric, value')
      .eq('source', 'app')
      .order('day', { ascending: true })
      .order('metric', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    for (const r of data ?? []) {
      const row = byDay.get(r.day) ?? {};
      row[r.metric] = Number(r.value);
      byDay.set(r.day, row);
    }
    if (!data || data.length < PAGE_SIZE) break;
  }

  const days = [...byDay.keys()].sort();
  const out: Record<string, (number | null)[]> = {};
  for (const m of METRICS) out[m] = days.map((d) => byDay.get(d)?.[m] ?? null);

  return { days, series: out, updatedAt: new Date().toISOString() };
}

/** <script> の中に安全に置ける JSON。`</script>` で抜けられないようにする。 */
function embed(v: unknown): string {
  return JSON.stringify(v).replace(/</g, '\\u003c');
}

function cookieToken(req: VercelRequest): string {
  const raw = req.headers.cookie ?? '';
  const hit = raw.split(';').map((c) => c.trim()).find((c) => c.startsWith('fh_m='));
  return hit ? decodeURIComponent(hit.slice(5)) : '';
}

function html(res: VercelResponse, body: string, status = 200) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  return res.status(status).send(body);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // ① Cron（Vercel が Authorization: Bearer <CRON_SECRET> を付けて呼ぶ）
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && (req.headers.authorization ?? '') === `Bearer ${cronSecret}`) {
    return collect(req, res);
  }

  const pass = process.env.METRICS_TOKEN;
  if (!pass) return html(res, loginPage('サーバー側のパスワードが未設定です'), 500);

  // ② パスワードの送信
  if (req.method === 'POST') {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const given = typeof body.pw === 'string' ? body.pw : '';
    if (given !== pass) return html(res, loginPage('パスワードが違います'), 401);
    // 30日もつ。HttpOnly なので画面側のJavaScriptからは触れない
    res.setHeader('Set-Cookie',
      `fh_m=${encodeURIComponent(pass)}; Path=/api/metrics; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`);
    return render(res);
  }

  // ③ 表示
  if (cookieToken(req) === pass) return render(res);
  return html(res, loginPage(''));
}

async function render(res: VercelResponse) {
  try {
    const data = await series();
    return html(res, dashboardPage(embed(data)));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return html(res, loginPage('データの読み込みに失敗しました: ' + msg), 500);
  }
}

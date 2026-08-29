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

// 指標は metrics_daily にあるものを全部返す（固定の一覧を持たない）。
// RevenueCat 側は名前がぶつからないよう rc_ を頭に付ける。

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

  // ストア側。失敗してもアプリ側の集計は成功扱いにする（片方の障害で全部止めない）
  let rc: { ok: boolean; detail: unknown } = { ok: false, detail: 'skipped' };
  try { rc = await collectRevenueCat(today); } catch (e) { rc = { ok: false, detail: String(e) }; }

  return res.status(200).json({ ok: true, days: [yesterday, today], revenuecat: rc });
}

/** 縦持ちの metrics_daily を「1日1行」に畳む。 */
async function series() {
  const client = db();
  if (!client) throw new Error('Server config error');

  // PostgREST は1回の応答が最大1000行（db-max-rows）。指標の本数×日数はすぐ
  // それを超えるので、range でページ送りして全部取る。
  const byDay = new Map<string, Record<string, number>>();
  const names = new Set<string>();
  const PAGE_SIZE = 1000;
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await client
      .from('metrics_daily')
      .select('day, source, metric, value')
      .order('day', { ascending: true })
      .order('metric', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    for (const r of data ?? []) {
      const key = r.source === 'app' ? r.metric : `${r.source === 'revenuecat' ? 'rc' : r.source}_${r.metric}`;
      const row = byDay.get(r.day) ?? {};
      row[key] = Number(r.value);
      names.add(key);
      byDay.set(r.day, row);
    }
    if (!data || data.length < PAGE_SIZE) break;
  }

  const days = [...byDay.keys()].sort();
  const out: Record<string, (number | null)[]> = {};
  for (const m of names) out[m] = days.map((d) => byDay.get(d)?.[m] ?? null);

  return { days, series: out, updatedAt: new Date().toISOString() };
}

/** RevenueCat から今の数字を取って metrics_daily に入れる。
 *
 *  返ってくる指標の名前を決め打ちしない。overview が返したものを
 *  そのまま metric 名として貯める（増えても減ってもコードを触らずに済む）。
 *  失敗しても呼び出し側は続行する＝アプリ側の集計は止めない。 */
async function collectRevenueCat(day: string): Promise<{ ok: boolean; detail: unknown }> {
  const key = process.env.REVENUECAT_API_KEY;
  const project = process.env.REVENUECAT_PROJECT_ID;
  if (!key || !project) return { ok: false, detail: 'REVENUECAT_API_KEY / REVENUECAT_PROJECT_ID が未設定' };

  const url = `https://api.revenuecat.com/v2/projects/${encodeURIComponent(project)}/metrics/overview`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' } });
  const text = await r.text();
  if (!r.ok) return { ok: false, detail: { status: r.status, body: text.slice(0, 600) } };

  let json: { metrics?: { id?: string; name?: string; value?: unknown; unit?: string }[] };
  try { json = JSON.parse(text); } catch { return { ok: false, detail: { parse: text.slice(0, 300) } }; }

  const list = Array.isArray(json.metrics) ? json.metrics : [];
  const rows = list
    .filter((m) => m && typeof m.id === 'string' && typeof m.value === 'number' && Number.isFinite(m.value))
    .map((m) => ({ day, source: 'revenuecat', metric: m.id as string, value: m.value as number }));
  if (!rows.length) return { ok: false, detail: { metrics: list.slice(0, 8) } };

  const client = db();
  if (!client) return { ok: false, detail: 'Server config error' };
  const { error } = await client.from('metrics_daily').upsert(rows, { onConflict: 'day,source,metric' });
  if (error) return { ok: false, detail: error.message };

  return { ok: true, detail: { saved: rows.length, ids: list.map((m) => ({ id: m.id, name: m.name, unit: m.unit })) } };
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

  // ③ 表示（?rc=1 を付けると RevenueCat の取り込みをその場で走らせて結果を返す。
  //     返ってくる指標の名前を確かめるための確認用。パスワードで守られている）
  if (cookieToken(req) === pass) {
    if (req.query.rc) {
      const day = todayJst();
      let out: { ok: boolean; detail: unknown };
      try { out = await collectRevenueCat(day); } catch (e) { out = { ok: false, detail: String(e) }; }
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({ day, ...out });
    }
    return render(res);
  }
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

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { loadEventPatches } from './_edits';
import { pushAlerts, type Alert } from './_alerts.js';
import { refreshAroundBoundaries } from './_boundary.js';

// 受付開始の即時通知（プレミアムの instantAlerts）。数分おきに叩かれる前提の軽い処理。
//
// 毎日Cron(refresh-offers)と分けている理由: 受付開始は**時刻**に意味がある。
// 人気グッズは開始から数分で売り切れるので、1日1回では通知として成立しない。
//
// 送る条件:
//   - 受付開始日時を過ぎた直後（下の CATCH_UP_MS 以内）。それより古いものは送らない
//     ＝スケジューラが止まっていた日に、深夜に「受付が始まりました」を配るのを防ぐ
//   - 開始**時刻**が入っていない予定は、その日の 9:00 を開始時刻とみなす
//     （0時に通知すると寝ている人を起こすだけ。ローカル通知の朝9時と揃える）
//   - 二重送信は event_alerts_sent（event_id + kind の主キー）で防ぐ
//
// 誰に送るかは api/_alerts.ts（いいね済み → プレミアム → ベルON → 宛先あり）。

/** 開始時刻が入っていない予定を何時のものとして扱うか（JST）。 */
const DEFAULT_START_HOUR = '09:00';
/** 開始からこれ以上経っていたら送らない。 */
const CATCH_UP_MS = 2 * 60 * 60 * 1000;

/** JSTの 'YYYY-MM-DD'。サーバーはUTCなので9時間ずらしてから日付を取る。 */
function jstDate(offsetDays = 0): string {
  const d = new Date(Date.now() + 9 * 60 * 60 * 1000 + offsetDays * 86400000);
  return d.toISOString().slice(0, 10);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = ReturnType<typeof createClient<any>>;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.authorization ?? '';
  if (!secret || auth !== `Bearer ${secret}`) return res.status(401).json({ error: 'Unauthorized' });

  const supabaseUrl = process.env.VITE_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!supabaseUrl || !serviceKey) return res.status(500).json({ error: 'Server config error' });
  const db = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

  // ① 受付開始の通知（時刻が命なので先に）
  const alerts = await sendStartAlerts(db).catch((e: unknown) => ({ error: String(e) }));
  // ② 節目（予約開始・終了・発売）の前後だけ、購入リンクの値段・在庫を取り直す（_boundary.ts）。
  //    5分おきに呼ばれるので、1回あたり45秒までにして次の回と重ならないようにする
  const refresh = await refreshAroundBoundaries(db, 45_000).catch((e: unknown) => ({ error: String(e) }));
  const status = 'error' in alerts ? 500 : 200;
  return res.status(status).json({ ...alerts, refresh });
}

/** 受付開始の通知。応答に載せる結果を返す */
async function sendStartAlerts(db: Db): Promise<Record<string, unknown>> {

  // 昨日と今日だけ見る（JSTの日付境界をまたぐ時間帯でも取りこぼさない最小の範囲）
  const days = [jstDate(-1), jstDate()];
  const cols = 'id, title, work_id, preorder_start_date, preorder_start_time, works(name)';
  const { data: baseRows, error } = await db
    .from('events').select(cols).eq('pool', 0).in('preorder_start_date', days);
  if (error) return { error: error.message };

  // 共同編集で予約開始日が直された予定も拾う（直した日で通知が飛ぶようにする）。
  // 逆に、元の日付が今日でもパッチで先に動いたものは下の実効値で外れる。
  const patches = await loadEventPatches(db);
  const patchedIds = [...patches.entries()]
    .filter(([, p]) => days.includes(p.preorder_start_date as string))
    .map(([id]) => id);
  const known = new Set((baseRows ?? []).map((r) => r.id as string));
  const missing = patchedIds.filter((id) => !known.has(id));
  const extra = missing.length
    ? (await db.from('events').select(cols).eq('pool', 0).in('id', missing)).data ?? []
    : [];
  const rows = [...(baseRows ?? []), ...extra].map((r) => {
    const p = patches.get(r.id as string);
    return p ? { ...r, ...p } : r;
  });

  const now = Date.now();
  const due = rows.filter((r) => {
    const date = r.preorder_start_date as string | null;
    if (!date || !days.includes(date)) return false; // パッチで日付が動いたものはここで外れる
    const time = ((r.preorder_start_time as string | null) ?? DEFAULT_START_HOUR).slice(0, 5);
    const startAt = Date.parse(`${date}T${time}:00+09:00`);
    if (Number.isNaN(startAt)) return false;
    return startAt <= now && now - startAt <= CATCH_UP_MS;
  });
  if (!due.length) return { due: 0, fresh: 0, push: { sent: 0, failed: 0 } };

  // 送信済みの目印を先に取る。**入れられた行だけ**が今回送る対象（同時に2回叩かれても片方しか通らない）。
  const { data: inserted } = await db
    .from('event_alerts_sent')
    .upsert(due.map((r) => ({ event_id: r.id as string, kind: 'preorder_start' })), {
      onConflict: 'event_id,kind',
      ignoreDuplicates: true,
    })
    .select('event_id');
  const fresh = new Set((inserted ?? []).map((r) => r.event_id as string));
  if (!fresh.size) return { due: due.length, fresh: 0, push: { sent: 0, failed: 0 } };

  const alerts: Alert[] = due
    .filter((r) => fresh.has(r.id as string))
    .map((r) => ({
      eventId: r.id as string,
      workId: (r.work_id as string | null) ?? null,
      title: (r.title as string) ?? '',
      workName: ((r.works as { name?: string } | null)?.name) ?? '',
      kind: 'preorder_start' as const,
    }));

  // 送り先の取得に失敗したら応答に出す（pg_cron の net._http_response / Vercelのログで気づけるように）
  const push = await pushAlerts(db, alerts).catch((e: unknown) => ({ sent: 0, failed: 0, error: String(e) }));
  return { due: due.length, fresh: fresh.size, push };
}

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { loadEventPatches } from './_edits.js';
import { pushAlerts, type Alert } from './_alerts.js';
import { refreshAroundBoundaries } from './_boundary.js';
import { runBotPaced } from './_pace.js';

// 受付開始・予約締切の即時通知（プレミアムの instantAlerts）。数分おきに叩かれる前提の軽い処理。
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
// 予約締切も受付開始と同じく**1回だけ**送る（回数を揃える。2026-10-05 柴野）:
//   - 締切の時刻があればその1時間前、無ければ締切日の 18:00（夜の締切に間に合う時間）
//   - 締切を過ぎたもの・**早期終了したもの**は送らない。早期終了は2通りで見る
//     ① 店の「予約受付終了」の表記を見つけると _enrich.ts が締切を昨日に書き直す → 日付で外れる
//     ② 購入リンクに終了の表記がある・在庫の分かるリンクが全部「在庫なし」（下の endedEarly）
//
// 誰に送るかは api/_alerts.ts（いいね済み → プレミアム → ベルON → 宛先あり）。

/** 開始時刻が入っていない予定を何時のものとして扱うか（JST）。 */
const DEFAULT_START_HOUR = '09:00';
/** 開始からこれ以上経っていたら送らない。 */
const CATCH_UP_MS = 2 * 60 * 60 * 1000;
/** 締切の時刻が無い予定に、締切の通知を出す時刻（JST）。 */
const DEFAULT_END_NOTIFY = '18:00';
/** 締切の時刻が無い予定の締切（その日いっぱい）。 */
const DEFAULT_END_HOUR = '23:59';
/** 締切の時刻があるとき、何分前に知らせるか。 */
const END_LEAD_MIN = 60;

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

  // ① 受付開始・予約締切の通知（時刻が命なので先に）
  const alerts = await sendStartAlerts(db).catch((e: unknown) => ({ error: String(e) }));
  const ends = await sendEndAlerts(db).catch((e: unknown) => ({ error: String(e) }));
  // ② 節目（予約開始・終了・発売）の前後だけ、購入リンクの値段・在庫を取り直す（_boundary.ts）。
  //    5分おきに呼ばれるので、1回あたり45秒までにして次の回と重ならないようにする
  //    店への機械的なアクセスの間隔を守る（アニメイトは約20分に1回。_pace.ts）
  const refresh = await runBotPaced(db, () => refreshAroundBoundaries(db, 45_000)).catch((e: unknown) => ({ error: String(e) }));
  const status = 'error' in alerts || 'error' in ends ? 500 : 200;
  return res.status(status).json({ ...alerts, ends, refresh });
}

/** column の日付が days のどれかに当たる予定を、共同編集の直し（パッチ）を当てた実効値で返す。
 *  受付開始と予約締切で同じ読み方をする。 */
async function loadRowsByDate(
  db: Db, column: 'preorder_start_date' | 'preorder_end_date', days: string[],
): Promise<Record<string, unknown>[]> {
  const cols = 'id, title, work_id, offers, preorder_start_date, preorder_start_time, preorder_end_date, preorder_end_time, works(name)';
  const { data: baseRows, error } = await db
    .from('events').select(cols).eq('pool', 0).in(column, days);
  if (error) throw new Error(error.message);

  // 共同編集で日付が直された予定も拾う（直した日で通知が飛ぶようにする）。
  // 逆に、元の日付が今日でもパッチで先に動いたものは、呼び出し側の実効値の判定で外れる。
  const patches = await loadEventPatches(db);
  const patchedIds = [...patches.entries()]
    .filter(([, p]) => days.includes(p[column] as string))
    .map(([id]) => id);
  const known = new Set((baseRows ?? []).map((r) => r.id as string));
  const missing = patchedIds.filter((id) => !known.has(id));
  const extra = missing.length
    ? (await db.from('events').select(cols).eq('pool', 0).in('id', missing)).data ?? []
    : [];
  return [...(baseRows ?? []), ...extra].map((r) => {
    const p = patches.get(r.id as string);
    return (p ? { ...r, ...p } : r) as Record<string, unknown>;
  });
}

/** 送信済みの目印を先に取る。**入れられた行だけ**が今回送る対象（同時に2回叩かれても片方しか通らない）。 */
async function claim(db: Db, ids: string[], kind: 'preorder_start' | 'preorder_end'): Promise<Set<string>> {
  const { data: inserted } = await db
    .from('event_alerts_sent')
    .upsert(ids.map((id) => ({ event_id: id, kind })), { onConflict: 'event_id,kind', ignoreDuplicates: true })
    .select('event_id');
  return new Set((inserted ?? []).map((r) => r.event_id as string));
}

function toAlert(r: Record<string, unknown>, kind: 'preorder_start' | 'preorder_end'): Alert {
  return {
    eventId: r.id as string,
    workId: (r.work_id as string | null) ?? null,
    title: (r.title as string) ?? '',
    workName: ((r.works as { name?: string } | null)?.name) ?? '',
    kind,
  };
}

/** 受付開始の通知。応答に載せる結果を返す */
async function sendStartAlerts(db: Db): Promise<Record<string, unknown>> {
  // 昨日と今日だけ見る（JSTの日付境界をまたぐ時間帯でも取りこぼさない最小の範囲）
  const days = [jstDate(-1), jstDate()];
  const rows = await loadRowsByDate(db, 'preorder_start_date', days);

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

  const fresh = await claim(db, due.map((r) => r.id as string), 'preorder_start');
  if (!fresh.size) return { due: due.length, fresh: 0, push: { sent: 0, failed: 0 } };

  const alerts = due.filter((r) => fresh.has(r.id as string)).map((r) => toAlert(r, 'preorder_start'));

  // 送り先の取得に失敗したら応答に出す（pg_cron の net._http_response / Vercelのログで気づけるように）
  const push = await pushAlerts(db, alerts).catch((e: unknown) => ({ sent: 0, failed: 0, error: String(e) }));
  return { due: due.length, fresh: fresh.size, push };
}

/** 店の表記で、予約がもう終わっているか（_enrich.ts の締切の書き直しと同じ言葉）。 */
const ENDED_LABEL = /予約受付終了|受付終了|販売終了/;

/** 締切の前に早期終了しているか。購入リンクに終了の表記がある、または在庫の分かるリンクが全部「在庫なし」。
 *  リンクが無い・在庫が分からないだけなら終わっていない扱い（受注生産は店のリンクが無いことが多い）。 */
export function endedEarly(offers: unknown): boolean {
  const list = Array.isArray(offers) ? (offers as { inStock?: boolean; stockLabel?: string }[]) : [];
  if (list.some((o) => o.stockLabel && ENDED_LABEL.test(o.stockLabel))) return true;
  const known = list.filter((o) => typeof o.inStock === 'boolean');
  return known.length > 0 && known.every((o) => o.inStock === false);
}

/** 予約締切の通知（直前に1回）。応答に載せる結果を返す */
async function sendEndAlerts(db: Db): Promise<Record<string, unknown>> {
  // 送る時刻が日付をまたぐ（00:30 締切の1時間前は前日の 23:30）ので、今日と明日を見る
  const days = [jstDate(), jstDate(1)];
  const rows = await loadRowsByDate(db, 'preorder_end_date', days);

  const now = Date.now();
  let ended = 0;
  const due = rows.filter((r) => {
    const date = r.preorder_end_date as string | null;
    if (!date || !days.includes(date)) return false; // パッチ・早期終了の書き直しで日付が動いたものはここで外れる
    const time = (r.preorder_end_time as string | null)?.slice(0, 5) ?? null;
    const endAt = Date.parse(`${date}T${time ?? DEFAULT_END_HOUR}:00+09:00`);
    const sendAt = time ? endAt - END_LEAD_MIN * 60_000 : Date.parse(`${date}T${DEFAULT_END_NOTIFY}:00+09:00`);
    if (Number.isNaN(endAt) || Number.isNaN(sendAt)) return false;
    if (!(sendAt <= now && now - sendAt <= CATCH_UP_MS && now < endAt)) return false;
    if (endedEarly(r.offers)) { ended++; return false; }
    return true;
  });
  if (!due.length) return { due: 0, endedEarly: ended, fresh: 0, push: { sent: 0, failed: 0 } };

  const fresh = await claim(db, due.map((r) => r.id as string), 'preorder_end');
  if (!fresh.size) return { due: due.length, endedEarly: ended, fresh: 0, push: { sent: 0, failed: 0 } };

  const alerts = due.filter((r) => fresh.has(r.id as string)).map((r) => ({
    ...toAlert(r, 'preorder_end'),
    endTime: (r.preorder_end_time as string | null)?.slice(0, 5) ?? null,
  }));
  const push = await pushAlerts(db, alerts).catch((e: unknown) => ({ sent: 0, failed: 0, error: String(e) }));
  return { due: due.length, endedEarly: ended, fresh: fresh.size, push };
}

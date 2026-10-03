import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { sendPushes, fcmConfigured, type PushMessage } from './_fcm.js';
import { activePremiumUsers, logNotifications, selectAll } from './_alerts.js';

// フォロー作品の新着まとめ。
//
// 2026-10-04 に見直し（仕様 → Obsidian: Decisions/2026-10-04-fanhive-home-story-premium.md）:
//   無料 … 毎朝9時に1通（2026-08-04 は課金限定にしていたが、ホームのストーリーが無料になったので、
//          通知は毎朝ストーリーを開くきっかけとして全員に送る）
//   課金 … 届き方を選べる（user_app_state.new_events_notify）
//          instant … 30分ごとにまとめて ／ thrice … 9・13・19時 ／ daily（既定）… 9時
//   呼び出し: Supabase の pg_cron。slot なし＝9時の回（全員）、?slot=thrice＝13・19時、?slot=instant＝30分ごと
//
// 他の通知と性格が違う:
//   値下げ・受付開始 … 自分が**いいねしたもの**を見張る。取りこぼすと損なので即時
//   新着まとめ       … **まだ知らないもの**を見つける。1件ずつ即時に来るとうるさいのでまとめる
// 無料でも、いいねした予定のローカル通知（◯日前・当日の朝）は今までどおり届く。
//
// 送らない相手:
//   - 自分が投稿した予定しか無い人（自分の投稿を自分に知らせない）
//   - その作品を非表示(hidden_work_ids)またはミュート(muted_work_ids)にしている人
//   - まとめを止めた人(new_events_digest_off)
//   - プッシュ宛先が無い人
// 重ならないように: 人ごとの「どこまで知らせたか」（new_event_notify_cursor）より後の予定だけを送る。
//   9時の回は、加えて user_alert_digests（user_id + 日付の主キー）で1日1通を保証する。
//   カーソルの表がまだ無い環境（SQL 未適用）では、9時の回だけを今までどおり24時間ぶんで送る。

/** さかのぼる上限。毎朝1回の実行に合わせて24時間（カーソルがもっと古くても、これより前は送らない） */
const WINDOW_MS = 24 * 60 * 60 * 1000;

type Slot = 'daily' | 'thrice' | 'instant';
type Mode = 'instant' | 'thrice' | 'daily';

/** この回に送る相手か。9時の回は全員、13・19時は「1日3回」、30分ごとは「すぐ」の課金の人 */
function inSlot(slot: Slot, mode: Mode): boolean {
  if (slot === 'daily') return true;
  return slot === mode;
}

function jstDate(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function asIdSet(v: unknown): Set<string> {
  return new Set(Array.isArray(v) ? (v as unknown[]).filter((x): x is string => typeof x === 'string') : []);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.authorization ?? '';
  if (!secret || auth !== `Bearer ${secret}`) return res.status(401).json({ error: 'Unauthorized' });

  const supabaseUrl = process.env.VITE_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!supabaseUrl || !serviceKey) return res.status(500).json({ error: 'Server config error' });
  const db = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

  const slot: Slot = req.query.slot === 'thrice' ? 'thrice' : req.query.slot === 'instant' ? 'instant' : 'daily';
  const now = new Date().toISOString();
  const since = new Date(Date.now() - WINDOW_MS).toISOString();
  const { data: fresh, error } = await db
    .from('events')
    .select('id, work_id, author_id, created_at, works(name)')
    .eq('pool', 0)
    .gte('created_at', since);
  if (error) return res.status(500).json({ error: error.message });
  const newEvents = (fresh ?? []).filter((e) => e.work_id);
  const done = (extra: Record<string, unknown> = {}) => res.status(200).json({ slot, newEvents: newEvents.length, sent: 0, failed: 0, ...extra });
  if (!newEvents.length || !fcmConfigured()) return done();

  const workNames = new Map<string, string>();
  const byWork = new Map<string, { id: string; authorId: string | null; createdAt: string }[]>();
  for (const e of newEvents) {
    const wid = e.work_id as string;
    workNames.set(wid, ((e.works as { name?: string } | null)?.name) ?? '');
    const list = byWork.get(wid) ?? [];
    list.push({ id: e.id as string, authorId: (e.author_id as string | null) ?? null, createdAt: e.created_at as string });
    byWork.set(wid, list);
  }

  // 人気作品はフォロワーが1000人を超える（ハイキュー!!は1035人）。上限で切れないように全部取る
  const workIds = [...byWork.keys()];
  const follows = await selectAll<{ user_id: string; work_id: string }>(
    () => db.from('participations').select('user_id, work_id').in('work_id', workIds).order('user_id').order('work_id'),
  );
  if (!follows.length) return done();

  const followers = [...new Set(follows.map((f) => f.user_id as string))];
  const premium = await activePremiumUsers(db, followers);
  // 9時以外の回は課金の人だけ
  const candidates = slot === 'daily' ? followers : followers.filter((u) => premium.has(u));
  if (!candidates.length) return done();

  // 届き方の列（new_events_notify）が無い環境では、旧い列だけで読み直す（全員「1日1回」扱い）
  type StateRow = { user_id: string; hidden_work_ids: unknown; muted_work_ids: unknown; new_events_digest_off: boolean | null; new_events_notify?: string | null };
  const readStates = async (cols: string) => {
    const rows: StateRow[] = [];
    for (let i = 0; i < candidates.length; i += 500) {
      const { data, error: e } = await db.from('user_app_state').select(cols).in('user_id', candidates.slice(i, i + 500));
      if (e) return null;
      rows.push(...((data ?? []) as unknown as StateRow[]));
    }
    return rows;
  };
  const states = (await readStates('user_id, hidden_work_ids, muted_work_ids, new_events_digest_off, new_events_notify'))
    ?? (await readStates('user_id, hidden_work_ids, muted_work_ids, new_events_digest_off'))
    ?? [];
  const hidden = new Map<string, Set<string>>();
  const muted = new Map<string, Set<string>>();
  const off = new Set<string>();
  const mode = new Map<string, Mode>();
  for (const s of states) {
    const uid = s.user_id;
    hidden.set(uid, asIdSet(s.hidden_work_ids));
    muted.set(uid, asIdSet(s.muted_work_ids));
    if (s.new_events_digest_off === true) off.add(uid);
    const m = s.new_events_notify;
    if (m === 'instant' || m === 'thrice' || m === 'daily') mode.set(uid, m);
  }
  // 無料の人は選べない（1日1回）。課金をやめた人が前に選んだ値も、ここで1日1回に戻る
  const modeOf = (uid: string): Mode => (premium.has(uid) ? (mode.get(uid) ?? 'daily') : 'daily');
  const userIds = candidates.filter((u) => !off.has(u) && inSlot(slot, modeOf(u)));
  if (!userIds.length) return done();

  // どこまで知らせたか。表が無ければ、9時の回だけ今までどおり（24時間ぶん）で送り、他の回は送らない
  const cursor = new Map<string, string>();
  let hasCursor = true;
  for (let i = 0; i < userIds.length; i += 500) {
    const { data, error: e } = await db.from('new_event_notify_cursor').select('user_id, notified_until').in('user_id', userIds.slice(i, i + 500));
    if (e) { hasCursor = false; break; }
    for (const r of data ?? []) cursor.set(r.user_id as string, r.notified_until as string);
  }
  if (!hasCursor && slot !== 'daily') return done({ skipped: 'cursor table missing' });

  const tokensByUser = new Map<string, string[]>();
  for (let i = 0; i < userIds.length; i += 500) {
    const { data: tokenRows } = await db.from('push_tokens').select('user_id, token').in('user_id', userIds.slice(i, i + 500));
    for (const t of tokenRows ?? []) {
      const list = tokensByUser.get(t.user_id as string) ?? [];
      list.push(t.token as string);
      tokensByUser.set(t.user_id as string, list);
    }
  }
  if (!tokensByUser.size) return done();

  // ユーザーごとに「知らせる新着」を数える（自分の投稿・前に知らせた分は数えない）
  const targetSet = new Set(userIds);
  const perUser = new Map<string, { count: number; works: Map<string, string> }>();
  for (const f of follows) {
    const uid = f.user_id as string;
    const wid = f.work_id as string;
    // 宛先が無くても数える（プッシュは届かなくても、お知らせ履歴には残す）
    if (!targetSet.has(uid)) continue;
    if (hidden.get(uid)?.has(wid) || muted.get(uid)?.has(wid)) continue;
    const after = cursor.get(uid) ?? since;
    const items = (byWork.get(wid) ?? []).filter((e) => e.authorId !== uid && e.createdAt > after);
    if (!items.length) continue;
    const cur = perUser.get(uid) ?? { count: 0, works: new Map<string, string>() };
    cur.count += items.length;
    cur.works.set(wid, workNames.get(wid) || '');
    perUser.set(uid, cur);
  }
  if (!perUser.size) return done();

  // 9時の回は、その日の分を記録できた人にだけ送る（**入った行だけ**が返るので、二度回っても二重に送らない）
  let targets = new Set(perUser.keys());
  if (slot === 'daily') {
    const { data: inserted } = await db
      .from('user_alert_digests')
      .upsert([...perUser.keys()].map((user_id) => ({ user_id, digest_date: jstDate() })), {
        onConflict: 'user_id,digest_date',
        ignoreDuplicates: true,
      })
      .select('user_id');
    targets = new Set((inserted ?? []).map((r) => r.user_id as string));
    if (!targets.size) return done({ skipped: 'already sent today' });
  }
  // 送る前に進めておく（途中で落ちても、同じ分を次の回にもう一度送らない）
  if (hasCursor) {
    await db.from('new_event_notify_cursor')
      .upsert([...targets].map((user_id) => ({ user_id, notified_until: now })), { onConflict: 'user_id' });
  }

  const messages: PushMessage[] = [];
  const logs: { user_id: string; kind: string; title: string; body: string; path: string; event_id: string | null }[] = [];
  for (const [uid, agg] of perUser) {
    if (!targets.has(uid)) continue;
    const works = [...agg.works.entries()].filter(([, name]) => !!name);
    const title = works.length === 1
      ? `【${works[0][1]}】新しい予定が${agg.count}件`
      : `フォロー中の作品に新しい予定が${agg.count}件`;
    const body = works.length === 1 ? '追加された予定を見る' : works.slice(0, 3).map(([, n]) => n).join(' / ');
    // 押すとホームのストーリーが開く（1作品ならその作品から。?story= は Home.tsx が読む）
    const path = works.length === 1 ? `/?story=${works[0][0]}` : '/';
    logs.push({ user_id: uid, kind: 'new_events', title, body, path, event_id: null });
    for (const token of tokensByUser.get(uid) ?? []) {
      messages.push({ token, title, body, data: { path } });
    }
  }
  await logNotifications(db, logs);

  const { sent, failed, deadTokens } = await sendPushes(messages);
  if (deadTokens.length) await db.from('push_tokens').delete().in('token', deadTokens);
  return res.status(200).json({ slot, newEvents: newEvents.length, users: targets.size, sent, failed });
}

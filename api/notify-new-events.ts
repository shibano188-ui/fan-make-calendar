import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { sendPushes, fcmConfigured, type PushMessage } from './_fcm.js';
import { activePremiumUsers } from './_alerts.js';

// フォロー作品の新着まとめ（毎朝9時・**プレミアム限定**）。
//
// 他の通知と性格が違う:
//   値下げ・受付開始 … 自分が**いいねしたもの**を見張る。取りこぼすと損なので即時
//   新着まとめ       … **まだ知らないもの**を見つける。1件ずつ即時に来るとうるさいのでまとめる
// 有料側に置く判断 → [[2026-08-04-new-event-digest-premium]]（欲しい人が多そうで課金の動機になる）。
// 無料でも、いいねした予定のローカル通知（◯日前・当日の朝）は今までどおり届く。
//
// 送らない相手:
//   - 自分が投稿した予定しか無い人（自分の投稿を自分に知らせない）
//   - その作品を非表示(hidden_work_ids)またはミュート(muted_work_ids)にしている人
//   - まとめを止めた人(new_events_digest_off)
//   - プッシュ宛先が無い人
// 1日1通は user_alert_digests（user_id + 日付の主キー）で保証する。

/** 何時間ぶんを「新着」とするか。毎朝1回の実行に合わせて24時間。 */
const WINDOW_MS = 24 * 60 * 60 * 1000;

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

  const since = new Date(Date.now() - WINDOW_MS).toISOString();
  const { data: fresh, error } = await db
    .from('events')
    .select('id, work_id, author_id, works(name)')
    .eq('pool', 0)
    .gte('created_at', since);
  if (error) return res.status(500).json({ error: error.message });
  const newEvents = (fresh ?? []).filter((e) => e.work_id);
  if (!newEvents.length || !fcmConfigured()) return res.status(200).json({ newEvents: newEvents.length, sent: 0, failed: 0 });

  const workNames = new Map<string, string>();
  const byWork = new Map<string, { id: string; authorId: string | null }[]>();
  for (const e of newEvents) {
    const wid = e.work_id as string;
    workNames.set(wid, ((e.works as { name?: string } | null)?.name) ?? '');
    const list = byWork.get(wid) ?? [];
    list.push({ id: e.id as string, authorId: (e.author_id as string | null) ?? null });
    byWork.set(wid, list);
  }

  const { data: follows } = await db
    .from('participations')
    .select('user_id, work_id')
    .in('work_id', [...byWork.keys()]);
  if (!follows?.length) return res.status(200).json({ newEvents: newEvents.length, sent: 0, failed: 0 });

  const followers = [...new Set(follows.map((f) => f.user_id as string))];
  const premium = await activePremiumUsers(db, followers);
  if (!premium.size) return res.status(200).json({ newEvents: newEvents.length, sent: 0, failed: 0 });
  const userIds = [...premium];

  const { data: states } = await db
    .from('user_app_state')
    .select('user_id, hidden_work_ids, muted_work_ids, new_events_digest_off')
    .in('user_id', userIds);
  const hidden = new Map<string, Set<string>>();
  const muted = new Map<string, Set<string>>();
  const off = new Set<string>();
  for (const s of states ?? []) {
    const uid = s.user_id as string;
    hidden.set(uid, asIdSet(s.hidden_work_ids));
    muted.set(uid, asIdSet(s.muted_work_ids));
    if (s.new_events_digest_off === true) off.add(uid);
  }

  const { data: tokenRows } = await db.from('push_tokens').select('user_id, token').in('user_id', userIds);
  if (!tokenRows?.length) return res.status(200).json({ newEvents: newEvents.length, sent: 0, failed: 0 });
  const tokensByUser = new Map<string, string[]>();
  for (const t of tokenRows) {
    const list = tokensByUser.get(t.user_id as string) ?? [];
    list.push(t.token as string);
    tokensByUser.set(t.user_id as string, list);
  }

  // ユーザーごとに「知らせる新着」を数える（自分の投稿は数えない）
  const perUser = new Map<string, { count: number; works: Set<string> }>();
  for (const f of follows) {
    const uid = f.user_id as string;
    const wid = f.work_id as string;
    if (!premium.has(uid) || off.has(uid) || !tokensByUser.has(uid)) continue;
    if (hidden.get(uid)?.has(wid) || muted.get(uid)?.has(wid)) continue;
    const items = (byWork.get(wid) ?? []).filter((e) => e.authorId !== uid);
    if (!items.length) continue;
    const cur = perUser.get(uid) ?? { count: 0, works: new Set<string>() };
    cur.count += items.length;
    cur.works.add(workNames.get(wid) || '');
    perUser.set(uid, cur);
  }
  if (!perUser.size) return res.status(200).json({ newEvents: newEvents.length, sent: 0, failed: 0 });

  // その日の分を記録できた人にだけ送る（**入った行だけ**が返るので、二度回っても二重に送らない）
  const today = jstDate();
  const { data: inserted } = await db
    .from('user_alert_digests')
    .upsert([...perUser.keys()].map((user_id) => ({ user_id, digest_date: today })), {
      onConflict: 'user_id,digest_date',
      ignoreDuplicates: true,
    })
    .select('user_id');
  const targets = new Set((inserted ?? []).map((r) => r.user_id as string));
  if (!targets.size) return res.status(200).json({ newEvents: newEvents.length, sent: 0, failed: 0, skipped: 'already sent today' });

  const messages: PushMessage[] = [];
  for (const [uid, agg] of perUser) {
    if (!targets.has(uid)) continue;
    const works = [...agg.works].filter(Boolean);
    const title = works.length === 1
      ? `【${works[0]}】新しい予定が${agg.count}件`
      : `フォロー中の作品に新しい予定が${agg.count}件`;
    const body = works.length === 1 ? '追加された予定を見る' : works.slice(0, 3).join(' / ');
    for (const token of tokensByUser.get(uid) ?? []) {
      messages.push({ token, title, body, data: { path: '/' } });
    }
  }

  const { sent, failed, deadTokens } = await sendPushes(messages);
  if (deadTokens.length) await db.from('push_tokens').delete().in('token', deadTokens);
  return res.status(200).json({ newEvents: newEvents.length, users: targets.size, sent, failed });
}

import type { SupabaseClient } from '@supabase/supabase-js';
import { sendPushes, fcmConfigured, type PushMessage } from './_fcm.js';

// 値下げ・再入荷を検知したその場でプッシュする（プレミアムの「値下げ・再入荷アラート」）。
//
// 送る相手の決め方（この順で絞る。**サーバー側だけで完結させる**）:
//   1. そのグッズを**いいね**している人（＝自分のカレンダーに入れた人だけ。全員には送らない）
//   2. **プレミアムが有効**な人（値下げ・再入荷アラートは有料機能）
//   3. そのグッズ・その作品を**ミュートしていない**人（user_app_state の muted_*）
//   4. プッシュ宛先(push_tokens)を持っている人
//
// 1人に複数件たまったときは**1通にまとめる**（通知欄が同じ日に何通も並ぶと、次から開かれなくなる）。

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any>;

export type PriceChange = {
  eventId: string;
  workId: string | null;
  title: string;
  workName: string;
  kind: 'price_drop' | 'restock';
  oldPrice: number | null;
  newPrice: number | null;
};

const yen = (n: number) => `${n.toLocaleString('ja-JP')}円`;

/** 1件だけのときの文面。何が起きて、いくらになったのかを一目で分かるようにする。 */
function oneMessage(c: PriceChange): { title: string; body: string } {
  const tag = c.workName ? `【${c.workName}】` : '';
  if (c.kind === 'restock') {
    return { title: `${tag}再入荷しました`, body: `「${c.title}」が買えるようになりました` };
  }
  const price = c.oldPrice && c.newPrice ? `${yen(c.oldPrice)} → ${yen(c.newPrice)}` : c.newPrice ? yen(c.newPrice) : '';
  return { title: `${tag}過去最安になりました`, body: price ? `「${c.title}」が ${price}` : `「${c.title}」が値下がりしました` };
}

/** プレミアムが今有効か（premium.ts の isPremiumActive と同じ判定をサーバー側に置いたもの）。
 *  'grace'（支払い猶予中）も有効に含める＝解約ではないため。 */
function premiumActive(status: string | null, expiresAt: string | null): boolean {
  if (status !== 'active' && status !== 'grace') return false;
  if (!expiresAt) return true;
  const t = Date.parse(expiresAt);
  return Number.isNaN(t) ? true : t > Date.now();
}

function asIdSet(v: unknown): Set<string> {
  return new Set(Array.isArray(v) ? (v as unknown[]).filter((x): x is string => typeof x === 'string') : []);
}

/** 検知した変化をプッシュする。戻り値は送信数（Cronのレスポンスに出して様子を見るため）。 */
export async function pushPriceAlerts(db: Db, changes: PriceChange[]): Promise<{ sent: number; failed: number }> {
  if (!changes.length || !fcmConfigured()) return { sent: 0, failed: 0 };

  const eventIds = [...new Set(changes.map((c) => c.eventId))];
  const { data: likes } = await db.from('likes').select('user_id, event_id').in('event_id', eventIds);
  if (!likes?.length) return { sent: 0, failed: 0 };

  const userIds = [...new Set(likes.map((l) => l.user_id as string))];

  const { data: subs } = await db
    .from('user_private')
    .select('user_id, subscription_status, subscription_expires_at')
    .in('user_id', userIds);
  const premium = new Set(
    (subs ?? [])
      .filter((s) => premiumActive(s.subscription_status as string | null, s.subscription_expires_at as string | null))
      .map((s) => s.user_id as string),
  );
  if (!premium.size) return { sent: 0, failed: 0 };

  const { data: states } = await db
    .from('user_app_state')
    .select('user_id, muted_event_ids, muted_work_ids')
    .in('user_id', [...premium]);
  const mutedEvents = new Map<string, Set<string>>();
  const mutedWorks = new Map<string, Set<string>>();
  for (const s of states ?? []) {
    mutedEvents.set(s.user_id as string, asIdSet(s.muted_event_ids));
    mutedWorks.set(s.user_id as string, asIdSet(s.muted_work_ids));
  }

  const { data: tokenRows } = await db.from('push_tokens').select('user_id, token').in('user_id', [...premium]);
  if (!tokenRows?.length) return { sent: 0, failed: 0 };
  const tokensByUser = new Map<string, string[]>();
  for (const t of tokenRows) {
    const list = tokensByUser.get(t.user_id as string) ?? [];
    list.push(t.token as string);
    tokensByUser.set(t.user_id as string, list);
  }

  // ユーザーごとに「その人に知らせる変化」を集める
  const byEvent = new Map<string, PriceChange[]>();
  for (const c of changes) {
    const list = byEvent.get(c.eventId) ?? [];
    list.push(c);
    byEvent.set(c.eventId, list);
  }
  const perUser = new Map<string, PriceChange[]>();
  for (const like of likes) {
    const uid = like.user_id as string;
    if (!premium.has(uid) || !tokensByUser.has(uid)) continue;
    for (const c of byEvent.get(like.event_id as string) ?? []) {
      if (mutedEvents.get(uid)?.has(c.eventId)) continue;
      if (c.workId && mutedWorks.get(uid)?.has(c.workId)) continue;
      const list = perUser.get(uid) ?? [];
      list.push(c);
      perUser.set(uid, list);
    }
  }

  const messages: PushMessage[] = [];
  for (const [uid, list] of perUser) {
    const one = list.length === 1 ? oneMessage(list[0]) : null;
    const drops = list.filter((c) => c.kind === 'price_drop').length;
    const many = {
      title: `値下がり・再入荷が${list.length}件あります`,
      body: drops === list.length ? 'いいねしたグッズが過去最安になりました' : 'いいねしたグッズに動きがありました',
    };
    const text = one ?? many;
    // タップ先: 1件ならその商品、複数ならまとめのページ
    const data = one ? { eventId: list[0].eventId } : { path: '/price-drops' };
    for (const token of tokensByUser.get(uid) ?? []) {
      messages.push({ token, title: text.title, body: text.body, data });
    }
  }

  const { sent, failed, deadTokens } = await sendPushes(messages);
  // 失効したトークンは残しても毎回失敗するだけなので消す
  if (deadTokens.length) await db.from('push_tokens').delete().in('token', deadTokens);
  return { sent, failed };
}

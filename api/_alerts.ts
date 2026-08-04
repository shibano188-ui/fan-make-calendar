import type { SupabaseClient } from '@supabase/supabase-js';
import { sendPushes, fcmConfigured, type PushMessage } from './_fcm.js';

// サーバー起点の通知をプッシュで届ける（プレミアムの「値下げ・再入荷アラート」「即時通知」）。
//
// 送る相手の決め方（この順で絞る。**サーバー側だけで完結させる**）:
//   1. その予定を**いいね**している人（＝自分のカレンダーに入れた人だけ。全員には送らない）
//   2. **プレミアムが有効**な人（どちらも有料機能）
//   3. その種類の通知を**その人が受け取る設定**にしている（下の「同意の取り方」）
//   4. プッシュ宛先(push_tokens)を持っている人
//
// 同意の取り方が種類で逆なので、ここは一本化できない（NotifyBell のシートと揃える）:
//   値下げ・再入荷 … オプトアウト。いいね済みは自動で対象で、止めた人だけ muted_* に入る
//   受付開始       … オプトイン。ベルをONにした予定（notify_event_ids）だけ
//
// 1人に複数件たまったときは**1通にまとめる**（通知欄が同じ日に何通も並ぶと、次から開かれなくなる）。

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any>;

export type AlertKind = 'price_drop' | 'restock' | 'preorder_start';

export type Alert = {
  eventId: string;
  workId: string | null;
  title: string;
  workName: string;
  kind: AlertKind;
  oldPrice?: number | null;
  newPrice?: number | null;
};

const yen = (n: number) => `${n.toLocaleString('ja-JP')}円`;

/** 1件だけのときの文面。何が起きたのかを一目で分かるようにする。 */
function oneMessage(c: Alert): { title: string; body: string } {
  const tag = c.workName ? `【${c.workName}】` : '';
  if (c.kind === 'preorder_start') {
    return { title: `${tag}受付が始まりました`, body: `「${c.title}」の予約受付が始まりました` };
  }
  if (c.kind === 'restock') {
    return { title: `${tag}再入荷しました`, body: `「${c.title}」が買えるようになりました` };
  }
  const price = c.oldPrice && c.newPrice ? `${yen(c.oldPrice)} → ${yen(c.newPrice)}` : c.newPrice ? yen(c.newPrice) : '';
  return { title: `${tag}過去最安になりました`, body: price ? `「${c.title}」が ${price}` : `「${c.title}」が値下がりしました` };
}

/** まとめて送るときの文面。件数と「何の話か」だけを伝える。 */
function manyMessage(list: Alert[]): { title: string; body: string } {
  if (list.every((c) => c.kind === 'preorder_start')) {
    return { title: `受付が始まったものが${list.length}件あります`, body: 'いいねした予定の予約受付が始まりました' };
  }
  if (list.every((c) => c.kind === 'price_drop')) {
    return { title: `値下がりが${list.length}件あります`, body: 'いいねしたグッズが過去最安になりました' };
  }
  return { title: `いいねした予定に動きが${list.length}件あります`, body: 'アプリで確認できます' };
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

/** 検知したものをプッシュする。戻り値は送信数（Cronのレスポンスに出して様子を見るため）。 */
export async function pushAlerts(db: Db, alerts: Alert[]): Promise<{ sent: number; failed: number }> {
  if (!alerts.length || !fcmConfigured()) return { sent: 0, failed: 0 };

  const eventIds = [...new Set(alerts.map((c) => c.eventId))];
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
    .select('user_id, muted_event_ids, muted_work_ids, notify_event_ids')
    .in('user_id', [...premium]);
  const mutedEvents = new Map<string, Set<string>>();
  const mutedWorks = new Map<string, Set<string>>();
  const bellOn = new Map<string, Set<string>>();
  for (const s of states ?? []) {
    mutedEvents.set(s.user_id as string, asIdSet(s.muted_event_ids));
    mutedWorks.set(s.user_id as string, asIdSet(s.muted_work_ids));
    bellOn.set(s.user_id as string, asIdSet(s.notify_event_ids));
  }

  const { data: tokenRows } = await db.from('push_tokens').select('user_id, token').in('user_id', [...premium]);
  if (!tokenRows?.length) return { sent: 0, failed: 0 };
  const tokensByUser = new Map<string, string[]>();
  for (const t of tokenRows) {
    const list = tokensByUser.get(t.user_id as string) ?? [];
    list.push(t.token as string);
    tokensByUser.set(t.user_id as string, list);
  }

  /** この人にこの通知を送ってよいか（種類ごとに同意の取り方が逆）。 */
  function wants(uid: string, c: Alert): boolean {
    if (c.kind === 'preorder_start') return !!bellOn.get(uid)?.has(c.eventId); // オプトイン
    if (mutedEvents.get(uid)?.has(c.eventId)) return false;                    // オプトアウト
    if (c.workId && mutedWorks.get(uid)?.has(c.workId)) return false;
    return true;
  }

  const byEvent = new Map<string, Alert[]>();
  for (const c of alerts) {
    const list = byEvent.get(c.eventId) ?? [];
    list.push(c);
    byEvent.set(c.eventId, list);
  }
  const perUser = new Map<string, Alert[]>();
  for (const like of likes) {
    const uid = like.user_id as string;
    if (!premium.has(uid) || !tokensByUser.has(uid)) continue;
    for (const c of byEvent.get(like.event_id as string) ?? []) {
      if (!wants(uid, c)) continue;
      const list = perUser.get(uid) ?? [];
      list.push(c);
      perUser.set(uid, list);
    }
  }

  const messages: PushMessage[] = [];
  for (const [uid, list] of perUser) {
    const text = list.length === 1 ? oneMessage(list[0]) : manyMessage(list);
    // タップ先: 1件ならその商品、複数ならまとめのページ
    const data = list.length === 1 ? { eventId: list[0].eventId } : { path: '/price-drops' };
    for (const token of tokensByUser.get(uid) ?? []) {
      messages.push({ token, title: text.title, body: text.body, data });
    }
  }

  const { sent, failed, deadTokens } = await sendPushes(messages);
  // 失効したトークンは残しても毎回失敗するだけなので消す
  if (deadTokens.length) await db.from('push_tokens').delete().in('token', deadTokens);
  return { sent, failed };
}

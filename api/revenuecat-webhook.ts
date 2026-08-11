import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

// RevenueCat の Webhook を受けて会員状態（user_private）を更新する。
//
// ここが会員状態の**唯一の書き込み口**。クライアントは決済の成否から会員状態を作らない
// （作れてしまうと、レシート検証を通さずに有料になれる）。書けるのは service_role だけ。
//
// 設計上の要点:
//  - **CANCELLATION では権限を落とさない**。解約は「次から更新しない」という意思表示で、
//    期限までは使える。落とすのは EXPIRATION のとき
//  - BILLING_ISSUE は 'grace'。支払いが一度失敗しただけで止めると、カードの再発行や
//    残高不足で正規の会員を締め出すことになる（premium.ts は grace を使わせ続ける）
//  - 同じイベントが複数回届きうる。ここでの更新は「状態を上書きする」だけなので何度来ても同じ結果。
//    ただし**古いイベントが後から届くと巻き戻る**ので、期限の新しい情報だけを採用する
//  - 60秒以内に 200 を返す。返さないと 5/10/20/40/80分 の間隔で5回まで再送される
//
// app_user_id は Supabase の user_id（src/lib/billing.ts の configureBilling で揃えてある）。

type RcEvent = {
  id?: string;
  type?: string;
  app_user_id?: string;
  original_app_user_id?: string;
  product_id?: string;
  expiration_at_ms?: number | null;
  event_timestamp_ms?: number;
  period_type?: string;   // TRIAL / NORMAL / INTRO
  store?: string;
};

type Status = 'active' | 'grace' | 'canceled' | 'free';

/** イベント種別から会員状態を決める。未知の種別は無視する（null）。 */
function statusOf(type: string): Status | null {
  switch (type) {
    case 'INITIAL_PURCHASE':
    case 'RENEWAL':
    case 'PRODUCT_CHANGE':
    case 'UNCANCELLATION':
    case 'SUBSCRIPTION_EXTENDED':
      return 'active';
    case 'BILLING_ISSUE':
      return 'grace';
    // 解約の申し出。期限までは使えるので active のまま。記録だけ残す
    case 'CANCELLATION':
      return 'canceled';
    case 'EXPIRATION':
    case 'SUBSCRIPTION_PAUSED':
    case 'TRANSFER':
      return 'free';
    default:
      return null;   // TEST / NON_RENEWING_PURCHASE など
  }
}

/** Play の商品IDからプラン名を取る。`premium:monthly` 形式（subId:basePlanId）。 */
function planOf(productId: string | undefined): string | null {
  if (!productId) return null;
  const base = productId.includes(':') ? productId.split(':')[1] : productId;
  return base === 'monthly' || base === 'yearly' ? base : base || null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  // RevenueCat のダッシュボードで設定する共有の秘密。sensitive にすると後で読めなくなるので
  // 通常の環境変数として入れること（8/9に CRON_SECRET で同じ失敗をしている）
  // ダッシュボードの入力例が "Bearer xxx" 形式なので、前置きの有無どちらでも通す。
  // ここで弾くと原因が分かりにくい401になるだけで、防御としての意味は無い
  const secret = process.env.REVENUECAT_WEBHOOK_SECRET;
  const auth = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!secret || auth !== secret) return res.status(401).json({ error: 'Unauthorized' });

  const supabaseUrl = process.env.VITE_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!supabaseUrl || !serviceKey) return res.status(500).json({ error: 'Server config error' });
  const db = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

  const event = (req.body as { event?: RcEvent } | undefined)?.event;
  if (!event?.type) return res.status(200).json({ ok: true, skipped: 'no event' });

  const userId = event.app_user_id || event.original_app_user_id;
  const status = statusOf(event.type);
  // 何が来て何をしたかを残す。届いているのに反映されないときの切り分けがこれ無しでは無理
  console.log('[rc]', event.type, '| user:', userId, '| product:', event.product_id, '| status:', status);
  // 未知の種別・匿名IDは何もせず200を返す（再送させない）
  if (!userId || !status) return res.status(200).json({ ok: true, skipped: event.type });

  const expiresAt = event.expiration_at_ms ? new Date(event.expiration_at_ms).toISOString() : null;

  try {
    // 巻き戻り防止: 保存済みの期限より古い情報で上書きしない。
    // 期限が同じか新しいイベントだけを採用する（順序が入れ替わって届くことがある）
    const { data: current } = await db
      .from('user_private')
      .select('subscription_expires_at')
      .eq('user_id', userId)
      .maybeSingle();
    const known = current?.subscription_expires_at ? Date.parse(current.subscription_expires_at) : 0;
    if (expiresAt && known && Date.parse(expiresAt) < known) {
      return res.status(200).json({ ok: true, skipped: 'stale' });
    }

    const { error } = await db
      .from('user_private')
      .upsert({
        user_id: userId,
        subscription_status: status,
        subscription_plan: planOf(event.product_id),
        subscription_expires_at: expiresAt,
        subscription_period_type: event.period_type ?? null,
        payment_provider: event.store ?? 'play_store',
      }, { onConflict: 'user_id' });
    if (error) throw error;
    console.log('[rc] updated', userId, '→', status);
  } catch (e) {
    // 500を返すと再送してくれる。握りつぶすと課金が反映されないまま消える
    console.error('[revenuecat-webhook]', event.type, e);
    return res.status(500).json({ error: 'update failed' });
  }

  return res.status(200).json({ ok: true, type: event.type, status });
}

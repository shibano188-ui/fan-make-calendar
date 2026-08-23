import type { VercelRequest } from '@vercel/node';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// リクエストの主。上限を数えるキーは **IPではなくこれ** を使う。
//
// なぜIPをやめるか:
//  ・携帯回線はCGNATで多数の利用者が同じIPを共有する＝他人の巻き添えで止まる
//  ・悪用する側はIPを変えれば素通りする＝守れていない
//
// アプリは起動時に `signInAnonymously()` を呼ぶ（src/contexts/AuthContext.tsx）ので、
// **メール登録をしていない人も含めて全員がJWTを持っている**。
// つまり「JWT必須」にしても利用者の体験は変わらない。弾かれるのはアプリの外から叩く人だけ。
//
// ⚠️ 匿名アカウントは作り放題なので、これは決定的な防御ではない
//    （anon key はクライアントに埋まっている）。狙いは「curl一発で叩ける穴を塞ぐ」こと。
//    総額の栓（_aiusage.ts）と組み合わせて初めて守りになる。

/** 上限の段。owner は素通り、new（登録24時間以内）が一番きつい。 */
export type Tier = 'owner' | 'registered' | 'anonymous' | 'new';

export type Identity = {
  userId: string;
  tier: Tier;
  /** プレミアム加入中か。生成回数の段を分けるのに使う（保存数だけの差だと課金の理由が弱い） */
  premium: boolean;
};

const NEW_ACCOUNT_MS = 24 * 60 * 60 * 1000;

let userClient: SupabaseClient | null = null;
let adminClient: SupabaseClient | null = null;

function clients(): { user: SupabaseClient; admin: SupabaseClient } | null {
  const url = process.env.VITE_SUPABASE_URL;
  const anon = process.env.VITE_SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !service) return null;
  if (!userClient) userClient = createClient(url, anon);
  if (!adminClient) {
    adminClient = createClient(url, service, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return { user: userClient, admin: adminClient };
}

// 加入状態は user_private が正（書けるのは service_role だけ）。
// 1リクエストごとに問い合わせると遅いので、インスタンス内で短くキャッシュする。
// 短いのは、解約・加入の反映が遅れて「払ったのに増えない」になるのを避けるため。
const premiumCache = new Map<string, { value: boolean; at: number }>();
const PREMIUM_TTL_MS = 60 * 1000;

async function isPremium(admin: SupabaseClient, userId: string): Promise<boolean> {
  const hit = premiumCache.get(userId);
  if (hit && Date.now() - hit.at < PREMIUM_TTL_MS) return hit.value;
  let value = false;
  try {
    const { data } = await admin
      .from('user_private')
      .select('subscription_status, subscription_expires_at')
      .eq('user_id', userId)
      .maybeSingle();
    const status = (data as { subscription_status?: string } | null)?.subscription_status;
    const expires = (data as { subscription_expires_at?: string } | null)?.subscription_expires_at;
    // grace（支払い猶予中）も有効に扱う。期限が無いものは手動付与＝無期限
    const live = status === 'active' || status === 'grace';
    const notExpired = !expires || Date.parse(expires) > Date.now();
    value = live && notExpired;
  } catch {
    value = false;   // 聞けなかったら無料として扱う（栓を緩めない方向に倒す）
  }
  premiumCache.set(userId, { value, at: Date.now() });
  return value;
}

// オーナーの一覧は滅多に変わらないので、インスタンス内で5分キャッシュする。
// （環境変数ではなくテーブルにしたのは、メンバーを増やすのに再デプロイを要らなくするため）
let ownerCache: { ids: Set<string>; at: number } | null = null;
const OWNER_TTL_MS = 5 * 60 * 1000;

async function ownerIds(admin: SupabaseClient): Promise<Set<string>> {
  if (ownerCache && Date.now() - ownerCache.at < OWNER_TTL_MS) return ownerCache.ids;
  try {
    const { data } = await admin.from('app_roles').select('user_id').eq('role', 'owner');
    const ids = new Set<string>((data ?? []).map((r: { user_id: string }) => r.user_id));
    ownerCache = { ids, at: Date.now() };
    return ids;
  } catch {
    // 表が無い/落ちている＝オーナー無しとして扱う（機能は止めない）
    return ownerCache?.ids ?? new Set<string>();
  }
}

/**
 * Authorization: Bearer <supabase access token> を検証して主を返す。
 * トークンが無い・壊れている場合は null（＝呼び出し側でIPにフォールバック）。
 */
export async function getIdentity(req: VercelRequest): Promise<Identity | null> {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) return null;

  const c = clients();
  if (!c) return null;

  try {
    const { data, error } = await c.user.auth.getUser(token);
    const user = data?.user;
    if (error || !user) return null;

    if ((await ownerIds(c.admin)).has(user.id)) return { userId: user.id, tier: 'owner', premium: true };

    const premium = await isPremium(c.admin, user.id);
    const createdAt = user.created_at ? Date.parse(user.created_at) : NaN;
    const isNew = Number.isFinite(createdAt) && Date.now() - createdAt < NEW_ACCOUNT_MS;
    if (isNew) return { userId: user.id, tier: 'new', premium };

    return { userId: user.id, tier: user.is_anonymous ? 'anonymous' : 'registered', premium };
  } catch {
    return null;   // 検証できない＝身元不明として扱う。機能は止めない
  }
}

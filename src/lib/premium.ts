import { useSyncExternalStore } from 'react';
import { supabase } from './supabase';
import { scheduleTrialEndReminder } from './notifications';

// プレミアム（月額サブスク）の会員状態と機能ゲート。
//
// 設計の前提:
//  - 状態の正はサーバー（`user_private`）。書けるのは service_role だけ
//    （sql/2026-07-25-subscription-columns-server-only.sql で列権限を絞った。
//     これを実行するまでは本人が自分をactiveにできてしまうので、ゲートの意味が無い）
//  - **決済方式に依存しない**。Play Billing / Apple IAP / RevenueCat のどれで確定した課金でも、
//    最終的にこの列が 'active' になるだけ。クライアントは決済SDKを知らない
//  - 判定はキャッシュファーストで即答する。起動直後に「無料」と判定してしまうと
//    広告が一瞬出る等のチラつきが起きるため、前回の判定を localStorage に持つ
//
// 有料ゲートに入れる機能は [[2026-07-25-fanhive-premium-mvp]] で確定した6つ＋
// 「フォロー作品の新着まとめ」（2026-08-04 追加 → [[2026-08-04-new-event-digest-premium]]）。

export type SubscriptionStatus = 'free' | 'active' | 'grace' | 'canceled';

export type Subscription = {
  status: SubscriptionStatus;
  plan: string | null;
  /** 期限。null は無期限（手動付与など） */
  expiresAt: string | null;
  provider: string | null;
  /** RevenueCat の period_type（TRIAL / NORMAL / INTRO）。無料お試し中かの判定に使う */
  periodType: string | null;
};

export const FREE_SUBSCRIPTION: Subscription = { status: 'free', plan: null, expiresAt: null, provider: null, periodType: null };

/** 有料ゲートをかける機能。増やすときはここに足してから使う（散らばった文字列判定にしない）。 */
export const PREMIUM_FEATURES = {
  /** 受付開始を検知した時点で即プッシュ */
  instantAlerts: '即時通知',
  /** フォロー作品に予定が追加されたら毎朝まとめて知らせる（2026-08-04 追加・本人判断で有料側へ） */
  newEventDigest: 'フォロー作品の新着まとめ',
  /** 値下げ・再入荷アラート */
  priceAlerts: '値下げ・再入荷アラート',
  /** AdMobバナーを出さない */
  noAds: '広告非表示',
  /** Google/Appleカレンダーへの自動同期（ics購読URL） */
  calendarAutoSync: 'カレンダー自動同期',
  /** フォロー数の上限なし */
  unlimitedFollow: '無制限フォロー',
} as const;

export type PremiumFeature = keyof typeof PREMIUM_FEATURES;

/** 無料プランでフォローできる作品数。
 *  2026-07-26時点の実データは 最大4作品・中央値2・作品マスタ13件なので、5なら**誰も引っかからない**。
 *  作品が増えてから締める前提で、数字はここ1つだけを変える。
 *  **既に上限を超えている人からは絶対に取り上げない**（追加が止まるだけ）。不利益変更にしないため。 */
export const FREE_FOLLOW_LIMIT = 5;

/** 案内画面に出す並び順。効き目の大きい順に置く（上から読まれて途中でやめられる前提）。
 *  PREMIUM_FEATURES に足したらここにも足す（漏れると案内に出ない）。 */
export const PREMIUM_FEATURE_ORDER: PremiumFeature[] = [
  'instantAlerts', 'priceAlerts', 'newEventDigest', 'noAds',
  'calendarAutoSync', 'unlimitedFollow',
];

/** 案内画面に出す一行説明。使う人の言葉で書く（機能名だけでは何が嬉しいか伝わらない）。
 *  FREE_FOLLOW_LIMIT を参照するので、この定義より後ろに置くこと。 */
export const PREMIUM_FEATURE_NOTES: Record<PremiumFeature, string> = {
  instantAlerts: 'いいねしたグッズの予約受付が始まった瞬間に届きます。無料プランは翌朝のまとめになります。',
  priceAlerts: 'いいねしたグッズが過去の最安値を更新したとき、売り切れから在庫が戻ったときに知らせます。',
  newEventDigest: 'フォロー中の作品に追加された予定を、毎朝9時に1通でまとめて届けます。',
  noAds: 'アプリの下に出る広告が消えます。',
  calendarAutoSync: 'いいねした予定と自分の投稿が、Google・Appleのカレンダーに自動で入ります。',
  unlimitedFollow: `フォローできる作品の数が無制限になります（無料プランは${FREE_FOLLOW_LIMIT}作品まで）。`,
};

/** もう1作品フォローできるか。`count` は今フォローしている数。 */
export function canFollowMore(count: number, premium: boolean): boolean {
  return premium || count < FREE_FOLLOW_LIMIT;
}

/** 課金が有効か。'grace'（支払い猶予中）は使わせ続ける＝解約ではないため。 */
export function isPremiumActive(sub: Subscription | null, now: Date = new Date()): boolean {
  if (!sub) return false;
  if (sub.status !== 'active' && sub.status !== 'grace') return false;
  if (!sub.expiresAt) return true;
  const t = Date.parse(sub.expiresAt);
  return Number.isNaN(t) ? true : t > now.getTime();
}

/** 会員状態を取る。**null は「サーバーに聞けなかった」**（無料と区別する。呼び出し側で
 *  前回の判定を維持するため。ここを無料扱いにすると、圏外の有料会員に広告が出る）。
 *  行が無い場合は「聞けた結果として無料」なので FREE を返す。 */
export async function fetchSubscription(userId: string): Promise<Subscription | null> {
  const { data, error } = await supabase
    .from('user_private')
    .select('subscription_status, subscription_plan, subscription_expires_at, payment_provider, subscription_period_type')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) return null;        // 通信失敗・権限エラー → 不明
  if (!data) return FREE_SUBSCRIPTION;  // 行が無い → 無料で確定
  return {
    status: ((data.subscription_status as SubscriptionStatus | null) ?? 'free'),
    plan: (data.subscription_plan as string | null) ?? null,
    expiresAt: (data.subscription_expires_at as string | null) ?? null,
    provider: (data.payment_provider as string | null) ?? null,
    periodType: (data.subscription_period_type as string | null) ?? null,
  };
}

// ── 判定のキャッシュと購読（likeStore と同じ useSyncExternalStore 方式）──

const CACHE_KEY = 'fan_premium_v1';
const listeners = new Set<() => void>();

function readCache(): boolean {
  try { return localStorage.getItem(CACHE_KEY) === '1'; } catch { return false; }
}

let premium = readCache();

function setPremium(next: boolean): void {
  if (premium === next) return;
  premium = next;
  try { localStorage.setItem(CACHE_KEY, next ? '1' : '0'); } catch { /* ignore */ }
  listeners.forEach((l) => l());
}

/** サーバーの会員状態を読み直してキャッシュを更新する。起動時とアプリ復帰時に呼ぶ。
 *  サーバーに聞けなかったときは**前回の判定を維持する**（圏外で特典が消えないように）。 */
export async function refreshPremium(userId: string | null): Promise<boolean> {
  if (!userId) { setPremium(false); return false; }
  const sub = await fetchSubscription(userId);
  if (sub === null) return premium;
  const active = isPremiumActive(sub);
  setPremium(active);
  // 無料お試しの終わりを知らせる通知を組み直す。黙って請求が始まるのを防ぐ
  scheduleTrialEndReminder(sub.expiresAt, active && sub.periodType === 'TRIAL').catch(() => {});
  return active;
}

/** ログアウト時に呼ぶ（別アカウントに有料状態を持ち越さない）。 */
export function clearPremium(): void {
  setPremium(false);
}

/** 購入が成立した直後に、サーバーの反映を待たずに画面を切り替えるためだけに使う。
 *  正はあくまでサーバーで、次の refreshPremium() で必ず上書きされる。
 *  **決済SDK以外から呼ばないこと**（呼べば誰でも有料になるが、サーバー側の機能は動かない）。 */
export function setPremiumOptimistic(): void {
  setPremium(true);
}

/** フック外から今の判定を読む（起動時の同期可否など、Reactの外で要るとき）。
 *  キャッシュ即答なので、サーバー確定前は前回の判定を返す。 */
export function isPremiumCached(): boolean {
  return premium;
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

/** 有料会員か（キャッシュ即答・サーバー確定後に自動で切り替わる）。 */
export function usePremium(): boolean {
  return useSyncExternalStore(subscribe, () => premium, () => premium);
}

/** その機能が使えるか。今は全機能が同一プランなので実質 usePremium と同じだが、
 *  プランを分けたときに呼び出し側を書き換えずに済むよう機能名で問い合わせる形にしておく。 */
export function useFeature(_feature: PremiumFeature): boolean {
  return usePremium();
}

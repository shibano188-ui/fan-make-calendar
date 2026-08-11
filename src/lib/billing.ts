import { Capacitor } from '@capacitor/core';
import { Purchases, type PurchasesPackage, type SubscriptionOption } from '@revenuecat/purchases-capacitor';
import { setPremiumOptimistic } from './premium';

// アプリ内課金の入口。**決済SDKを知っているのはこのファイルだけ**にする。
//
// 分担:
//  - billing.ts（ここ）= 何をいくらで売るか・購入を始める
//  - premium.ts        = 買った結果どうなっているか（サーバーの user_private が正）
//  購入が確定すると RevenueCat の Webhook 経由でサーバーが 'active' になり、
//  次の refreshPremium() で確定する。クライアントが決済結果から会員状態を作らない。
//  （購入直後だけは体感を優先して setPremiumOptimistic でキャッシュを先に立てる。
//    サーバーに聞き直した時点で必ず上書きされるので、嘘が残ることはない）
//
// 方式: Google Play Billing / Apple IAP。**アプリ内のデジタル課金はストア必須**で、
// WebViewにStripeを出すと審査で落ちる。RevenueCat を挟んでいる。
//
// 「5件投稿で初月無料」は**ストア側の無料お試し**で実現する（2026-08-10 本人確定）。
// Play Console 側で各基本プランに「デベロッパー指定」の特典（無料試用30日）を作り、
// タグに `rc-ignore-offer` を付けてある。このタグが無いと SDK が全員に自動で無料試用を
// 適用してしまうため、**対象者にだけこちらから明示的にその特典を指定して購入を開始する**。

export type PlanId = 'monthly' | 'yearly';

export type Plan = {
  id: PlanId;
  label: string;
  /** 請求額 */
  price: number;
  /** 月あたりいくらか（年払いの比較用） */
  perMonth: number;
  note?: string;
};

/** 価格は [[2026-06-05-fanhive-monetization]] の決定（月¥500・年¥4,800）。
 *  ストア側の商品と同じ金額にすること（ここだけ変えても実際の請求は変わらない）。 */
export const PLANS: Plan[] = [
  { id: 'monthly', label: '月払い', price: 500, perMonth: 500 },
  { id: 'yearly', label: '年払い', price: 4800, perMonth: 400, note: '2か月分お得' },
];

export function planOf(id: PlanId): Plan {
  return PLANS.find((p) => p.id === id) ?? PLANS[0];
}

/** 初月無料になる投稿数。ピッチで「5件投稿で初月無料」と言っているので、
 *  変えるときは資料（[[fanhive-pitch-script-shibano]] S22）も直す。 */
export const FREE_TRIAL_POSTS = 5;

/** 初月無料の対象か。数えるのは累計投稿数＝マイページの「投稿」と同じ値。 */
export function trialEligible(posted: number): boolean {
  return posted >= FREE_TRIAL_POSTS;
}

/** ストア決済が使えるか。ブラウザ版では買えないのでアプリ版へ案内する。 */
export function billingSupported(): boolean {
  return Capacitor.isNativePlatform() && !!API_KEY;
}

export type PurchaseResult = 'done' | 'canceled' | 'unavailable' | 'failed';

// ── SDKの初期化 ────────────────────────────────────────────────
// 公開鍵。アプリに埋め込む前提のキーなので秘匿しない（サーバー側の鍵とは別物）。
const API_KEY = (import.meta.env.VITE_REVENUECAT_ANDROID_KEY as string | undefined) ?? '';

/** Play Console の基本プランID。PLANS の id と同じ文字列にしてある。 */
const BASE_PLAN_ID: Record<PlanId, string> = { monthly: 'monthly', yearly: 'yearly' };
/** 無料お試しの特典に付けたタグ。SDKの自動適用を止める意味も兼ねている。 */
const TRIAL_TAG = 'rc-ignore-offer';

let configuredFor: string | null = null;

/** 起動時とログイン時に呼ぶ。**appUserID は Supabase の user_id にする**。
 *  Webhook から `user_private.user_id` に直接引き当てるため、ここがズレると紐付けが壊れる。 */
export async function configureBilling(userId: string | null): Promise<void> {
  if (!Capacitor.isNativePlatform() || !API_KEY || !userId) return;
  if (configuredFor === userId) return;
  try {
    if (configuredFor === null) await Purchases.configure({ apiKey: API_KEY, appUserID: userId });
    else await Purchases.logIn({ appUserID: userId });   // 匿名→メール連携でuidが変わったとき
    configuredFor = userId;
  } catch { /* 失敗しても購入時にもう一度試す */ }
}

// ── 購入 ──────────────────────────────────────────────────────

/** 選んだプランに対応する購入対象を探す。
 *  `trial` が true なら無料お試し付きの特典、false なら基本プランそのものを返す。 */
function pickOption(pkg: PurchasesPackage, trial: boolean): SubscriptionOption | null {
  const options = pkg.product.subscriptionOptions ?? [];
  if (!options.length) return null;
  if (trial) {
    // 無料の期間を持つ特典。タグでも二重に絞る（別の特典を将来足したときの誤爆防止）
    return options.find((o) => !o.isBasePlan && o.freePhase != null && o.tags.includes(TRIAL_TAG))
      ?? options.find((o) => !o.isBasePlan && o.freePhase != null)
      ?? null;
  }
  return options.find((o) => o.isBasePlan) ?? null;
}

function isCanceled(e: unknown): boolean {
  const err = e as { userCancelled?: boolean; code?: string | number; message?: string } | null;
  if (err?.userCancelled === true) return true;
  return typeof err?.message === 'string' && /cancel/i.test(err.message);
}

/** 購入を始める。`trial` は無料お試し付きの特典を使うかどうか。 */
export async function startPurchase(plan: PlanId, opts?: { trial?: boolean }): Promise<PurchaseResult> {
  if (!billingSupported()) return 'unavailable';
  try {
    const { current } = await Purchases.getOfferings();
    if (!current) return 'unavailable';
    // 基本プランIDで引き当てる。Offering の並び順や package 名に依存させない
    const pkg = current.availablePackages.find(
      (p) => p.product.subscriptionOptions?.some((o) => o.id.startsWith(BASE_PLAN_ID[plan])),
    );
    if (!pkg) return 'unavailable';

    const option = pickOption(pkg, opts?.trial === true);
    const result = option
      ? await Purchases.purchaseSubscriptionOption({ subscriptionOption: option })
      : await Purchases.purchasePackage({ aPackage: pkg });

    if (result?.customerInfo) setPremiumOptimistic();
    return 'done';
  } catch (e) {
    if (isCanceled(e)) return 'canceled';
    return 'failed';
  }
}

/** 購入済みの復元（機種変更・入れ直しのとき）。 */
export async function restorePurchase(): Promise<PurchaseResult> {
  if (!billingSupported()) return 'unavailable';
  try {
    const { customerInfo } = await Purchases.restorePurchases();
    const active = Object.keys(customerInfo?.entitlements?.active ?? {}).length > 0;
    if (!active) return 'failed';   // 復元できる購入が無い
    setPremiumOptimistic();
    return 'done';
  } catch {
    return 'failed';
  }
}

export function yen(n: number): string {
  return `¥${n.toLocaleString('ja-JP')}`;
}

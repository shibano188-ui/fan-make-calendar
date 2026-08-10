import { Capacitor } from '@capacitor/core';

// アプリ内課金の入口。**決済SDKを知っているのはこのファイルだけ**にする。
//
// 分担:
//  - billing.ts（ここ）= 何をいくらで売るか・購入を始める
//  - premium.ts        = 買った結果どうなっているか（サーバーの user_private が正）
//  購入が確定するとサーバー側で 'active' になり、refreshPremium() で画面に反映される。
//  クライアントが決済の成否から会員状態を直接いじってはいけない（レシート検証を通さないと嘘がつける）。
//
// 方式: Google Play Billing / Apple IAP。**アプリ内のデジタル課金はストア必須**で、
// WebViewにStripeを出すと審査で落ちる。RevenueCat を挟む前提なので、SDK導入時は
// startPurchase() / restorePurchase() の中身だけを差し替える。
//
// 「5件投稿で初月無料」は**ストア側の無料お試し**で実現する（2026-08-10 本人確定）。
// 期間の管理・解約・二重取りの防止をストアに任せられるため。アプリがやるのは
// 「無料お試し付きの商品を出すかどうか」の判定だけ（trialEligible）。

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
 *  ストア側の商品を作るときも同じ金額にすること（ここだけ変えても実際の請求は変わらない）。 */
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
  return Capacitor.isNativePlatform();
}

export type PurchaseResult = 'done' | 'canceled' | 'unavailable' | 'failed';

/** 購入を始める。`trial` は無料お試し付きの商品を選ぶかどうか。
 *  決済SDKを入れるまでは 'unavailable' を返すだけ（画面側は案内に切り替える）。 */
export async function startPurchase(_plan: PlanId, _opts?: { trial?: boolean }): Promise<PurchaseResult> {
  return 'unavailable';
}

/** 購入済みの復元（機種変更・入れ直しのとき）。同じくSDK導入までは何もしない。 */
export async function restorePurchase(): Promise<PurchaseResult> {
  return 'unavailable';
}

export function yen(n: number): string {
  return `¥${n.toLocaleString('ja-JP')}`;
}

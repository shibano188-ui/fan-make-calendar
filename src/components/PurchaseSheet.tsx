import { useState } from 'react';
import { Check } from 'lucide-react';
import Sheet from './ui/Sheet';
import { useToast } from './ui/Toast';
import { haptic } from '../lib/haptics';
import { PLANS, planOf, billingSupported, startPurchase, restorePurchase, yen, type PlanId } from '../lib/billing';

// 購入の画面。案内ページ（/premium）から開く。
//
// 実際の支払いシートはストア（Google Play / App Store）が出すので、ここでやるのは
// **どのプランを買うかを決めるところまで**。決済SDKが入るまで startPurchase() は
// 'unavailable' を返すので、その場合は文言で「準備中」と伝えて閉じない（選択は残す）。
//
// 表示する金額は billing.ts の PLANS が正。ストア側の商品と食い違うと
// 「書いてある額と請求額が違う」になるので、商品を作るときに突き合わせること。

type Props = {
  open?: boolean;
  onClose: () => void;
  /** 初月無料の対象か（5件投稿済み）。表示と、渡す商品の選択が変わる */
  trial: boolean;
};

export default function PurchaseSheet({ open, onClose, trial }: Props) {
  const toast = useToast();
  const [plan, setPlan] = useState<PlanId>('monthly');
  const [busy, setBusy] = useState(false);
  const selected = planOf(plan);

  const onBuy = async () => {
    haptic.select();
    if (!billingSupported()) {
      toast('購入はアプリ版からお願いします');
      return;
    }
    setBusy(true);
    try {
      const r = await startPurchase(plan, { trial });
      if (r === 'done') { toast('プレミアムを始めました'); onClose(); }
      else if (r === 'canceled') { /* 何も言わない（本人が閉じただけ） */ }
      else if (r === 'unavailable') toast('お支払いの準備をしています。もう少しお待ちください');
      else toast('購入できませんでした。時間をおいてお試しください');
    } finally {
      setBusy(false);
    }
  };

  const onRestore = async () => {
    haptic.select();
    const r = await restorePurchase();
    if (r === 'done') { toast('購入を復元しました'); onClose(); }
    else if (r === 'unavailable') toast('お支払いの準備をしています。もう少しお待ちください');
    else toast('復元できる購入が見つかりませんでした');
  };

  return (
    <Sheet open={open} onClose={onClose} title="プランを選ぶ" ariaLabel="プランを選ぶ">
      <div className="px-4 pb-4">
        {trial && (
          <div className="rounded-[12px] p-3 mb-3" style={{ backgroundColor: 'var(--fill-tertiary)' }}>
            <p className="text-[13px] font-semibold">初月無料が使えます</p>
            <p className="text-[11px] text-label-secondary mt-0.5">
              最初の1か月は請求されません。無料期間のうちに解約すれば、料金はかかりません。
            </p>
          </div>
        )}

        <div className="flex flex-col gap-2">
          {PLANS.map((p) => {
            const on = p.id === plan;
            return (
              <button key={p.id} onClick={() => { haptic.select(); setPlan(p.id); }}
                className="pressable w-full text-left rounded-[12px] p-3 flex items-center gap-3"
                style={{
                  backgroundColor: 'var(--bg-secondary)',
                  border: `1.5px solid ${on ? 'var(--accent-color)' : 'transparent'}`,
                }}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[14px] font-semibold">{p.label}</span>
                    {p.note && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                        style={{ backgroundColor: 'var(--accent-color)', color: 'var(--accent-on)' }}>
                        {p.note}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-label-secondary mt-0.5">
                    {p.id === 'yearly' ? `月あたり${yen(p.perMonth)}` : 'いつでも解約できます'}
                  </p>
                </div>
                <span className="text-[15px] font-bold flex-shrink-0">
                  {yen(p.price)}
                  <span className="text-[11px] font-normal text-label-secondary">
                    {p.id === 'yearly' ? '/年' : '/月'}
                  </span>
                </span>
                {on && <Check size={18} style={{ color: 'var(--accent-color)' }} className="flex-shrink-0" />}
              </button>
            );
          })}
        </div>

        <button onClick={onBuy} disabled={busy}
          className="pressable w-full mt-4 py-3 rounded-full text-[15px] font-bold disabled:opacity-50"
          style={{ backgroundColor: 'var(--accent-color)', color: 'var(--accent-on)' }}>
          {trial ? '初月無料で始める' : `${yen(selected.price)}で始める`}
        </button>

        {!billingSupported() && (
          <p className="text-[11px] text-label-secondary mt-2 text-center">
            ブラウザからは購入できません。アプリ版を開いてお手続きください。
          </p>
        )}

        <p className="text-[11px] text-label-tertiary mt-3 leading-relaxed">
          お支払いはGoogle Play・App Storeを通して行われます。期間が終わるたびに自動で更新され、
          解約するまで続きます。解約はストアの定期購入の画面からいつでもできます。
          {trial && '無料期間中に解約すれば料金はかかりません。'}
        </p>

        <button onClick={onRestore} className="pressable w-full mt-2 py-2 text-[12px] text-label-secondary">
          購入を復元する
        </button>
      </div>
    </Sheet>
  );
}

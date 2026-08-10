import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Check, Crown, Plus } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getUserPublicProfile } from '../lib/api';
import { usePremium, PREMIUM_FEATURES, PREMIUM_FEATURE_ORDER, PREMIUM_FEATURE_NOTES } from '../lib/premium';
import { PLANS, FREE_TRIAL_POSTS, trialEligible, yen } from '../lib/billing';
import PurchaseSheet from '../components/PurchaseSheet';
import { haptic } from '../lib/haptics';

// プレミアムの案内ページ。マイページの「プレミアム」から開く。
//
// 出す順番は「何が良くなるか → いくらか → 買う」。先に価格を見せると読まれずに閉じられる。
// 初月無料（5件投稿）は**投稿を促す仕掛け**でもあるので、達成していない人には
// 残り件数と投稿への導線を出す。達成済みの人にはボタンの文言を変えて背中を押す。
//
// 購入そのものは PurchaseSheet（プラン選択）→ ストアの支払いシート、の順。

export default function Premium() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const premium = usePremium();
  const [posted, setPosted] = useState<number | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    getUserPublicProfile(user.id)
      .then((p) => { if (alive) setPosted(p.postedCount); })
      .catch(() => {});
    return () => { alive = false; };
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const eligible = posted !== null && trialEligible(posted);
  const remain = posted === null ? FREE_TRIAL_POSTS : Math.max(0, FREE_TRIAL_POSTS - posted);
  const monthly = PLANS[0];

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <div className="mx-auto w-full max-w-app flex-1 flex flex-col">
        <div className="sticky top-0 z-20 flex items-center gap-1 px-2 py-2 material-bar scroll-edge" style={{ paddingTop: 'calc(var(--sat) + 8px)' }}>
          <button onClick={() => { haptic.select(); navigate(-1); }} aria-label="戻る" className="pressable tap-44 p-2"><ArrowLeft size={22} /></button>
          <span className="text-[16px] font-bold flex-1">プレミアム</span>
        </div>

        <div className="px-3 pt-3 pb-6 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <Crown size={20} style={{ color: 'var(--accent-color)' }} />
            <h1 className="text-[19px] font-bold">受付開始も、値下げも、逃さない</h1>
          </div>
          <p className="text-[13px] text-label-secondary mb-4">
            {premium
              ? 'いまプレミアムをお使いいただいています。'
              : `気づいたときには売り切れ、をなくすためのプランです。月${yen(monthly.price)}。`}
          </p>

          {/* 利用中の人には状態だけ。解約はストア側でしかできない（アプリから止められない） */}
          {premium && (
            <div className="rounded-[12px] p-3 mb-4" style={{ backgroundColor: 'var(--fill-tertiary)' }}>
              <p className="text-[13px] font-semibold">プレミアムを利用中です</p>
              <p className="text-[11px] text-label-secondary mt-0.5">
                解約や支払い方法の変更は、Google Play・App Storeの定期購入の画面から行えます。
              </p>
            </div>
          )}

          {/* 初月無料の進み具合。投稿を促す仕掛けなので、未達なら投稿への導線を一緒に置く */}
          {!premium && posted !== null && (
            <div className="rounded-[12px] p-3 mb-4" style={{ backgroundColor: 'var(--bg-secondary)' }}>
              {eligible ? (
                <>
                  <p className="text-[14px] font-semibold">初月無料の対象です</p>
                  <p className="text-[12px] text-label-secondary mt-0.5">
                    予定を{posted}件投稿していただいたので、最初の1か月は無料で使えます。
                  </p>
                </>
              ) : (
                <>
                  <p className="text-[14px] font-semibold">あと{remain}件の投稿で初月無料</p>
                  <p className="text-[12px] text-label-secondary mt-0.5">
                    予定を{FREE_TRIAL_POSTS}件投稿すると、最初の1か月が無料になります（いま{posted}件）。
                  </p>
                  <div className="h-1.5 rounded-full mt-2.5 overflow-hidden" style={{ backgroundColor: 'var(--fill-tertiary)' }}>
                    <div className="h-full rounded-full"
                      style={{ width: `${(posted / FREE_TRIAL_POSTS) * 100}%`, backgroundColor: 'var(--accent-color)' }} />
                  </div>
                  <button onClick={() => { haptic.select(); navigate('/post'); }}
                    className="pressable mt-3 inline-flex items-center gap-1 text-[13px] font-semibold px-3.5 py-1.5 rounded-full"
                    style={{ backgroundColor: 'var(--accent-color)', color: 'var(--accent-on)' }}>
                    <Plus size={14} /> 予定を投稿する
                  </button>
                </>
              )}
            </div>
          )}

          {/* できるようになること */}
          <p className="text-[12px] text-label-secondary mb-1.5 px-1">できるようになること</p>
          <div className="rounded-[12px] overflow-hidden" style={{ backgroundColor: 'var(--bg-secondary)' }}>
            {PREMIUM_FEATURE_ORDER.map((f, i) => (
              <div key={f} className={`px-3 py-2.5 ${i > 0 ? 'border-t border-subtle' : ''}`}>
                <div className="flex items-center gap-2">
                  <Check size={16} style={{ color: 'var(--accent-color)' }} className="flex-shrink-0" />
                  <span className="text-[14px] font-medium">{PREMIUM_FEATURES[f]}</span>
                </div>
                <p className="text-[11px] text-label-secondary mt-1 ml-6">{PREMIUM_FEATURE_NOTES[f]}</p>
              </div>
            ))}
          </div>

          <p className="text-[11px] text-label-tertiary mt-3 px-1 leading-relaxed">
            料金は月{yen(PLANS[0].price)}、年払いなら{yen(PLANS[1].price)}（月あたり{yen(PLANS[1].perMonth)}）です。
            お支払いはGoogle Play・App Storeを通して行われ、解約するまで自動で更新されます。
          </p>
        </div>

        {/* 購入への入口。読み終えた位置で押せるよう画面下に固定する */}
        {!premium && (
          <div className="sticky bottom-0 px-3 pt-2 material-bar"
            style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
            <button onClick={() => { haptic.select(); setSheetOpen(true); }}
              className="pressable w-full py-3 rounded-full text-[15px] font-bold"
              style={{ backgroundColor: 'var(--accent-color)', color: 'var(--accent-on)' }}>
              {eligible ? '初月無料で始める' : 'プランを選ぶ'}
            </button>
          </div>
        )}
      </div>

      {sheetOpen && <PurchaseSheet onClose={() => setSheetOpen(false)} trial={eligible} />}
    </div>
  );
}

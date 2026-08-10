import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getUserPublicProfile } from '../lib/api';
import { usePremium, FREE_FOLLOW_LIMIT } from '../lib/premium';
import { PLANS, planOf, FREE_TRIAL_POSTS, trialEligible, billingSupported, startPurchase, restorePurchase, yen, type PlanId } from '../lib/billing';
import { useToast } from '../components/ui/Toast';
import Toggle from '../components/ui/Toggle';
import { haptic } from '../lib/haptics';

// プレミアムの案内＝購入画面。設計は [[fanhive-paywall-design]]。
//
// 作り直しの理由（最初の版は機能を7つ並べて価格を出すだけだった）:
//  - 課金画面の改修事例が揃って「長い画面→短い画面、プラン選択の別画面を消す」方向だった
//  - プラン選択のシートを挟むと購入まで5タップ。1枚に畳んで2タップにする
//  - 機能名の羅列ではなく「無料だとどうなるか」との差で見せる。差が3つを超えると読まれない
//
// 審査要件（これを外すと iOS 3.1.2 で落ちる）:
//  - 金額と請求期間を購入ボタンの**すぐ隣**に、目立つ形で置く
//  - 利用規約とプライバシーポリシーへの機能するリンクを同じ画面に置く。別画面送りは不可
//  - そのリンクはボタンではなくリンクの見た目にする
//
// 塗り面はほとんど使わない。区切りは罫線と余白で作り、色はCTAと見出しのアクセントだけに使う。

export default function Premium() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const toast = useToast();
  const premium = usePremium();

  const [posted, setPosted] = useState<number | null>(null);
  const [watching, setWatching] = useState<{ likes: number; works: number } | null>(null);
  const [plan, setPlan] = useState<PlanId>('monthly');  // 既定は月払い（2026-08-10 本人確定）
  const [allPlans, setAllPlans] = useState(false);
  const [trialOn, setTrialOn] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    getUserPublicProfile(user.id).then((p) => {
      if (!alive) return;
      setPosted(p.postedCount);
      setWatching({ likes: p.likesGiven, works: p.works });
    }).catch(() => {});
    return () => { alive = false; };
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const eligible = posted !== null && trialEligible(posted);
  const remain = posted === null ? FREE_TRIAL_POSTS : Math.max(0, FREE_TRIAL_POSTS - posted);
  const trial = eligible && trialOn;
  const selected = planOf(plan);
  const shown = allPlans ? PLANS : PLANS.filter((p) => p.id === plan);

  // 見出しは本人の数字で出す。ただし始めたばかりの人に0件と出すと逆効果なので汎用へ落とす
  const headline = watching && watching.likes > 0
    ? `いま${watching.likes}件のグッズを見張っています`
    : '推し活を、もっと便利に';
  const subline = watching && watching.likes > 0
    ? `無料プランだと、受付開始のお知らせは翌朝のまとめになります。${watching.works > 0 ? `フォロー中の${watching.works}作品も同じです。` : ''}`
    : '受付開始も値下げも、始まった時点でお知らせします。';

  const onBuy = async () => {
    haptic.select();
    if (!billingSupported()) { toast('購入はアプリ版からお願いします'); return; }
    setBusy(true);
    try {
      const r = await startPurchase(plan, { trial });
      if (r === 'done') { toast('プレミアムを始めました'); navigate(-1); }
      else if (r === 'canceled') { /* 本人が閉じただけ。何も言わない */ }
      else if (r === 'unavailable') toast('お支払いの準備をしています。もう少しお待ちください');
      else toast('購入できませんでした。時間をおいてお試しください');
    } finally { setBusy(false); }
  };

  const onRestore = async () => {
    haptic.select();
    const r = await restorePurchase();
    if (r === 'done') { toast('購入を復元しました'); navigate(-1); }
    else if (r === 'unavailable') toast('お支払いの準備をしています。もう少しお待ちください');
    else toast('復元できる購入が見つかりませんでした');
  };

  // 金額と期間の文。購入ボタンのすぐ下に出す（審査要件）
  const billingLine = trial
    ? `最初の1か月は無料。以降は${selected.id === 'yearly' ? '年' : '月'}${yen(selected.price)}で自動更新されます。`
    : `${selected.id === 'yearly' ? '年' : '月'}${yen(selected.price)}で自動更新されます。`;

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <div className="mx-auto w-full max-w-app flex-1 flex flex-col">
        <div className="flex items-center px-2 py-2" style={{ paddingTop: 'calc(var(--sat) + 8px)' }}>
          <button onClick={() => { haptic.select(); navigate(-1); }} aria-label="閉じる" className="pressable tap-44 p-2">
            <X size={22} />
          </button>
        </div>

        <div className="flex-1 px-5 pb-4">
          <h1 className="text-[24px] font-bold leading-tight">{headline}</h1>
          <p className="text-[13px] text-label-secondary mt-2 leading-relaxed">{subline}</p>

          {premium ? (
            <div className="mt-6 border-t border-subtle pt-4">
              <p className="text-[15px] font-semibold">プレミアムを利用中です</p>
              <p className="text-[12px] text-label-secondary mt-1 leading-relaxed">
                解約や支払い方法の変更は、Google Play・App Storeの定期購入の画面から行えます。
              </p>
            </div>
          ) : (
            <>
              {/* 無料との差。上から効き目の大きい順に並べる（下ほど読まれない） */}
              <div className="mt-6">
                <div className="flex text-[11px] text-label-tertiary pb-1.5 border-b border-subtle">
                  <span className="flex-1" />
                  <span className="w-[68px] text-center">無料</span>
                  <span className="w-[82px] text-center font-semibold" style={{ color: 'var(--accent-text)' }}>プレミアム</span>
                </div>
                {[
                  ['受付開始のお知らせ', '翌朝まとめて', '始まった時点で'],
                  ['値下げ・再入荷', 'なし', 'お知らせ'],
                  ['外部カレンダー連携', '手動', '自動で同期'],
                  ['フォローできる作品', `${FREE_FOLLOW_LIMIT}作品まで`, '無制限'],
                  ['複数の端末で使う', 'できない', 'できる'],
                  ['広告', '表示', '非表示'],
                ].map(([label, free, paid]) => (
                  <div key={label} className="flex items-center py-2.5 border-b border-subtle">
                    <span className="flex-1 text-[13px]">{label}</span>
                    <span className="w-[68px] text-center text-[12px] text-label-tertiary">{free}</span>
                    <span className="w-[82px] text-center text-[12px] font-semibold">{paid}</span>
                  </div>
                ))}
              </div>

              {/* 初月無料までの距離。投稿を促す仕掛けを兼ねる */}
              {posted !== null && !eligible && (
                <button onClick={() => { haptic.select(); navigate('/post'); }}
                  className="pressable w-full text-left mt-4 flex items-center gap-3">
                  <div className="flex-1">
                    <p className="text-[13px] font-semibold">あと{remain}件の投稿で初月無料</p>
                    <div className="h-1 rounded-full mt-1.5 overflow-hidden" style={{ backgroundColor: 'var(--fill-tertiary)' }}>
                      <div className="h-full rounded-full"
                        style={{ width: `${(posted / FREE_TRIAL_POSTS) * 100}%`, backgroundColor: 'var(--accent-color)' }} />
                    </div>
                  </div>
                  <span className="text-[12px] font-semibold flex-shrink-0" style={{ color: 'var(--accent-text)' }}>投稿する</span>
                </button>
              )}

              {/* プラン。既定は年払いだけ見せ、月払いは「すべてのプランを見る」の裏に置く */}
              <div className="mt-5 flex flex-col gap-2">
                {shown.map((p) => {
                  const on = p.id === plan;
                  return (
                    <button key={p.id} onClick={() => { haptic.select(); setPlan(p.id); }}
                      className="pressable w-full text-left rounded-[12px] px-3.5 py-3 flex items-center gap-3"
                      style={{ border: `1.5px solid ${on ? 'var(--accent-color)' : 'var(--separator)'}` }}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[14px] font-semibold">{p.label}</span>
                          {p.note && (
                            <span className="text-[10px] font-bold" style={{ color: 'var(--accent-text)' }}>{p.note}</span>
                          )}
                        </div>
                        <p className="text-[11px] text-label-tertiary mt-0.5">
                          1日あたり約{yen(Math.round(p.perMonth / 30))}
                        </p>
                      </div>
                      <span className="text-[16px] font-bold flex-shrink-0">
                        {yen(p.price)}
                        <span className="text-[11px] font-normal text-label-secondary">{p.id === 'yearly' ? '/年' : '/月'}</span>
                      </span>
                    </button>
                  );
                })}
                {!allPlans && (
                  <button onClick={() => { haptic.select(); setAllPlans(true); }}
                    className="pressable text-[12px] text-label-secondary py-1">
                    すべてのプランを見る
                  </button>
                )}
              </div>

              {/* 初月無料のトグル。対象の人にだけ出す（対象外に出すと取り上げられた感じになる） */}
              {eligible && (
                <div className="flex items-center gap-2 mt-4 py-2">
                  <span className="text-[14px] flex-1">初月無料を使う</span>
                  <Toggle checked={trialOn} onChange={(v) => { haptic.select(); setTrialOn(v); }} />
                </div>
              )}
            </>
          )}
        </div>

        {/* 購入。金額・期間と規約はボタンのすぐ下に置く（別画面に逃がすと審査で落ちる） */}
        {!premium && (
          <div className="px-5 pt-2" style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}>
            <button onClick={onBuy} disabled={busy}
              className="pressable w-full py-3.5 rounded-full text-[15px] font-bold disabled:opacity-50"
              style={{ backgroundColor: 'var(--accent-color)', color: 'var(--accent-on)' }}>
              {trial ? '初月無料で始める' : 'プレミアムを始める'}
            </button>
            <p className="text-[11px] text-label-secondary mt-2 text-center leading-relaxed">
              {billingLine}いつでも解約できます。
              {!billingSupported() && ' 購入はアプリ版からお願いします。'}
            </p>
            <div className="flex items-center justify-center gap-3 mt-2 text-[11px]">
              <a href="/terms.html" className="underline" style={{ color: 'var(--accent-text)' }}>利用規約</a>
              <a href="/privacy.html" className="underline" style={{ color: 'var(--accent-text)' }}>プライバシーポリシー</a>
              <button onClick={onRestore} className="pressable underline" style={{ color: 'var(--accent-text)' }}>購入を復元</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

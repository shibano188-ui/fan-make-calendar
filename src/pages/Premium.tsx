import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { X, Bell, TrendingDown, Sparkles, CalendarSync, Palette, ChevronDown } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { usePremium, freeFollowLimit } from '../lib/premium';
import { PLANS, planOf, trialAvailable, billingSupported, billingNotConfigured, startPurchase, restorePurchase, lastPurchaseError, yen, type PlanId } from '../lib/billing';
import { useToast } from '../components/ui/Toast';
import { haptic } from '../lib/haptics';
import { HeroArt, FollowArt, NoAdsArt } from '../components/premium/PremiumArt';

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
//  - **購入に会員登録を要求しない**（5.1.1(v)）。この画面には登録の入口を置かない。
//    引き継ぎのメール登録は購入後の `/premium/welcome`（加入済みなら「引き継ぎ・通知・
//    カレンダーの設定」から何度でも開ける）とマイページに置く
//
// 塗り面はほとんど使わない。区切りは罫線と余白で作り、色はCTAと見出しのアクセントだけに使う。

export default function Premium() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const toast = useToast();
  const premium = usePremium();

  // 初月無料は**初めて買う人全員**（2026-09-29 柴野。前は Android だけ「5件投稿で初月無料」だった）。
  //  App Store: 導入価格は Apple が「初めての人」を判定して自動で当てる。
  //  Play: 「デベロッパー指定」の特典をアプリから明示的に当てる。買ったことがある人には当てない（trialAvailable）。
  const ios = Capacitor.getPlatform() === 'ios';

  const [plan, setPlan] = useState<PlanId>('monthly');  // 既定は月払い（2026-08-10 本人確定）
  // iOSは価格を隠さない。月/年を最初から両方出す（3.1.2(c)）
  const [allPlans, setAllPlans] = useState(ios);
  const [busy, setBusy] = useState(false);
  // 初月無料が付くか。確かめ終えるまでは付く前提で出す（ほとんどの人は初めて買う）
  const [trial, setTrial] = useState(true);

  // 開いたら一番上から。前の画面（マイページの下の方など）のスクロール位置を引き継ぐと、左上の × が隠れる
  useEffect(() => { window.scrollTo(0, 0); }, []);

  useEffect(() => {
    let alive = true;
    trialAvailable().then((v) => { if (alive) setTrial(v); });
    return () => { alive = false; };
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // 初月無料は**付ける/外すの選択にしない**（iOS・Android とも）。
  //  iOS: Appleが「無料お試しを足したり外したりするトグルは、自動更新の定期購読に入ることを
  //       分かりにくくする」として 3.1.2(c) で却下（2026-08-21 ビルド6）。
  //  Android: 2026-09-21 本人判断。自分で気づいて ON にしないと無料にならない作りは詐欺的。
  //       対象の人には黙って初月無料を当てる。
  const selected = planOf(plan);
  const shown = allPlans ? PLANS : PLANS.filter((p) => p.id === plan);

  // 2026-11-26 柴野: 機能を全部並べた表は文字が多すぎて圧倒される。主役は「フォロー無制限」と「広告なし」の2つにして、
  // 絵つきで大きく見せる。ほかの機能は1行ずつ小さく並べ、無料との細かい差は「無料と比べる」の下に畳む
  const [params] = useSearchParams();
  const fromFollow = params.get('from') === 'follow';
  const [compare, setCompare] = useState(false);
  const limit = freeFollowLimit();
  const headline = fromFollow ? '推しを、いくつでも。' : '推し活を、もっと自由に。';
  const subline = 'プレミアムなら、フォローの上限と広告がなくなります';

  const onBuy = async () => {
    haptic.select();
    if (!billingSupported()) {
      toast(billingNotConfigured()
        ? 'お支払いの準備が整っていません。少し待って再度お試しください'
        : '購入はアプリ版からお願いします');
      return;
    }
    setBusy(true);
    try {
      const r = await startPurchase(plan, { trial });
      // 買って終わりにしない。何が使えるようになったかと、今すぐ効く設定をこの流れで済ませる
      if (r === 'done') { navigate('/premium/welcome', { replace: true }); }
      else if (r === 'canceled') { /* 本人が閉じただけ。何も言わない */ }
      // 失敗の理由は普段は出さない（技術的な文字列を利用者に見せない）。
      // 実機で原因を追うときだけ localStorage.fan_billing_debug='1' で出す
      else {
        let detail = '';
        try { if (localStorage.getItem('fan_billing_debug') === '1') detail = `（${lastPurchaseError()}）`; } catch { /* ignore */ }
        toast(r === 'unavailable'
          ? `お支払いの準備をしています。もう少しお待ちください${detail}`
          : `購入できませんでした。時間をおいてお試しください${detail}`);
      }
    } finally { setBusy(false); }
  };

  // 閉じる/戻る。**戻り先が無いことがある**ので必ずホームへ逃がす。
  //   例: Xから共有 → /post（replace）→ 投稿 → /premium（replace）
  //   共有でアプリが起動したときは履歴が1件しかなく、両方replaceなので
  //   navigate(-1) の行き先が無くなり、この画面から出られなくなる。
  //   React Router は履歴の位置を history.state.idx に持っているので、先頭なら / へ。
  const close = () => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) navigate(-1);
    else navigate('/', { replace: true });
  };

  const onRestore = async () => {
    haptic.select();
    const r = await restorePurchase();
    if (r === 'done') { toast('購入を復元しました'); close(); }
    else if (r === 'unavailable') toast('お支払いの準備をしています。もう少しお待ちください');
    else toast('復元できる購入が見つかりませんでした');
  };

  // 金額と期間の文。購入ボタンのすぐ下に出す（審査要件）
  const per = selected.id === 'yearly' ? '年' : '月';
  const billingLine = trial
    ? `最初の1か月は無料。無料期間が終わると${per}${yen(selected.price)}の定期購読に自動で切り替わり、${per}ごとに自動更新されます。`
    : `${per}${yen(selected.price)}の定期購読です。${per}ごとに自動更新されます。`;

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <div className="mx-auto w-full max-w-app flex-1 flex flex-col">
        {/* 上の絵の帯。はちみつ色をうっすら敷いて、閉じるボタンもこの上に置く */}
        <div className="relative pb-1" style={{ background: 'linear-gradient(180deg, color-mix(in srgb, #FBC000 22%, var(--bg-primary)) 0%, var(--bg-primary) 100%)' }}>
          <div className="flex items-center px-2 py-2" style={{ paddingTop: 'calc(var(--sat) + 8px)' }}>
            <button onClick={() => { haptic.select(); close(); }} aria-label="閉じる" className="pressable tap-44 p-2">
              <X size={22} />
            </button>
          </div>
          <div className="mx-auto max-w-[280px] px-4 -mt-6">
            <HeroArt />
          </div>
          <div className="px-5 text-center">
            <p className="text-[11px] font-bold tracking-[0.2em]" style={{ color: 'var(--accent-text)' }}>FANHIVE PREMIUM</p>
            <h1 className="text-[26px] font-bold leading-tight mt-1">{headline}</h1>
            {!premium && <p className="text-[13px] text-label-secondary mt-2 leading-relaxed">{subline}</p>}
          </div>
        </div>

        {/* 購入ボタンはプランのすぐ下に置く。本文を flex-1 で伸ばすと、画面の一番下まで押し下げられて見つけにくい（2026-09-29 柴野） */}
        <div className="px-5 pb-4">
          {premium ? (
            <div className="mt-6 border-t border-subtle pt-4">
              <p className="text-[15px] font-semibold">プレミアムを利用中です</p>
              <p className="text-[12px] text-label-secondary mt-1 leading-relaxed">
                解約や支払い方法の変更は、Google Play・App Storeの定期購入の画面から行えます。
              </p>
              {/* 加入直後の設定を飛ばした人の受け皿。ここから何度でも開ける */}
              <button onClick={() => { haptic.select(); navigate('/premium/welcome?step=settings'); }}
                className="pressable w-full flex items-center gap-2 mt-4 px-3 py-2.5 rounded-[12px] text-left"
                style={{ backgroundColor: 'var(--bg-secondary)' }}>
                <span className="text-[14px] flex-1">引き継ぎ・通知・カレンダーの設定</span>
                <span className="text-[11px] text-label-tertiary">開く</span>
              </button>
            </div>
          ) : (
            <>
              {/* 主役の2つ。絵と大きな文字だけで伝える */}
              <div className="mt-5 grid grid-cols-2 gap-2.5">
                {[
                  { art: <FollowArt />, big: 'フォロー無制限', small: `無料は${limit}作品まで` },
                  { art: <NoAdsArt />, big: '広告なし', small: '画面の下の広告が消えます' },
                ].map((b) => (
                  <div key={b.big} className="rounded-[16px] px-3 pt-3 pb-3.5" style={{ backgroundColor: 'var(--bg-secondary)' }}>
                    {b.art}
                    <p className="text-[16px] font-bold mt-2 leading-tight">{b.big}</p>
                    <p className="text-[11px] text-label-secondary mt-1">{b.small}</p>
                  </div>
                ))}
              </div>

              {/* ほかにも。1行ずつ、言い切りで */}
              <p className="text-[12px] font-semibold text-label-secondary mt-5 mb-1">ほかにも</p>
              <div className="grid grid-cols-1 gap-y-1">
                {[
                  { icon: Bell, text: '予約の受付が始まった瞬間にお知らせ' },
                  { icon: TrendingDown, text: '値下げ・再入荷をお知らせ' },
                  { icon: Sparkles, text: 'フォロー作品の新着をすぐ見られる' },
                  { icon: CalendarSync, text: 'いつものカレンダーに自動で同期' },
                  { icon: Palette, text: '作ったテーマを何個でも保存' },
                ].map(({ icon: Icon, text }) => (
                  <div key={text} className="flex items-center gap-2.5 py-1">
                    <span className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: 'color-mix(in srgb, #FBC000 22%, var(--bg-primary))' }}>
                      <Icon size={15} style={{ color: 'var(--label-primary)' }} />
                    </span>
                    <span className="text-[13px]">{text}</span>
                  </div>
                ))}
              </div>

              {/* 無料との細かい差。読みたい人だけ開く */}
              <button onClick={() => { haptic.select(); setCompare((v) => !v); }} aria-expanded={compare}
                className="pressable mt-2 flex items-center gap-1 text-[12px] text-label-secondary py-1">
                無料と比べる
                <ChevronDown size={14} style={{ transform: compare ? 'rotate(180deg)' : undefined, transition: 'transform 0.2s' }} />
              </button>
              {compare && (
                <div className="mt-1">
                  <div className="flex text-[11px] text-label-tertiary pb-1.5 border-b border-subtle">
                    <span className="flex-1" />
                    <span className="w-[80px] text-center">無料</span>
                    <span className="w-[82px] text-center font-semibold" style={{ color: 'var(--accent-text)' }}>プレミアム</span>
                  </div>
                  {[
                    // 2026-10-05 に今の動きに合わせて直した（無料の人に届くのは、ベルを押した予定の当日の朝の通知だけ）
                    ['フォローできる作品', `${limit}作品まで`, '無制限'],
                    ['広告', '表示', '非表示'],
                    ['受付開始のお知らせ', '当日の朝', '始まった瞬間'],
                    ['新着のお知らせ', '毎朝9時', 'すぐ・選べる'],
                    ['値下げ・再入荷', 'なし', 'お知らせ'],
                    // 言葉から作るテーマ（2026-08-23）。無料でも作れるが、保存は1つまで
                    ['作れるテーマ', '1つまで', '何個でも'],
                    ['テーマを作れる回数', '1日3回', '1日20回'],
                    // 無料は「手動」ではなく「できない」。1件ずつ追加する導線は
                    // ItemDetail の EXTERNAL_CALENDAR_ENABLED=false で今は出していない
                    ['外部カレンダー連携', 'できない', '自動で同期'],
                  ].map(([label, free, paid]) => (
                    <div key={label} className="flex items-center py-2.5 border-b border-subtle">
                      <span className="flex-1 text-[13px]">{label}</span>
                      <span className="w-[80px] text-center text-[12px] text-label-tertiary">{free}</span>
                      <span className="w-[82px] text-center text-[12px] font-semibold">{paid}</span>
                    </div>
                  ))}
                </div>
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
                          {/* 無料お試しが付くかどうかをプランの行でも明示する（3.1.2(c)） */}
                          {trial
                            ? `1か月無料、その後${yen(p.price)}${p.id === 'yearly' ? '/年' : '/月'}`
                            : `1日あたり約${yen(Math.round(p.perMonth / 30))}`}
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

            </>
          )}
        </div>

        {/* 購入。金額・期間と規約はボタンのすぐ下に置く（別画面に逃がすと審査で落ちる） */}
        {!premium && (
          // 下に貼りつける。絵を足して縦に長くなったので、どこまで読んでもボタンと金額が見えているようにする
          <div className="sticky bottom-0 px-5 pt-3 border-t border-subtle"
            style={{ paddingBottom: 'max(16px, var(--sab))', backgroundColor: 'var(--bg-primary)' }}>
            <button onClick={onBuy} disabled={busy}
              className="pressable w-full py-3.5 rounded-full text-[15px] font-bold disabled:opacity-50"
              style={{ backgroundColor: 'var(--accent-color)', color: 'var(--accent-on)' }}>
              {trial ? '初月無料で始める' : 'プレミアムを始める'}
            </button>
            <p className="text-[11px] text-label-secondary mt-2 text-center leading-relaxed">
              {billingLine}いつでも解約できます。
              {!billingSupported() && (billingNotConfigured()
                ? ' ただいまお支払いの準備中です。'
                : ' 購入はアプリ版からお願いします。')}
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

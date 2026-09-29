import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Heart, Bell, BellRing, BellOff, CalendarCheck, UserRound } from 'lucide-react';
import { notificationPermission } from '../lib/notifications';
import type { CalendarEvent } from '../types';
import { setAdsSuppressed } from '../lib/adSuppress';
import { requestTracking } from '../lib/att';
import { haptic } from '../lib/haptics';
import { ONBOARDING_KEY, TOUR_STEP_KEY, TOUR_EVENT_KEY, TOUR_EVENT, LIKED_EVENT, BELL_EVENT, FEATURE_PREMIUM, loadNotifyLeadDays } from '../lib/constants';

// オンボーディングの続き: **本物の画面**で、これから使う操作を1回ずつやってもらう（2026-09-29 柴野）。
//   like     … 探すで気になる予定の ♡ を押す
//   calendar … 自動でカレンダーへ移り、いいねした予定がその日に入ったのを見せる
//   bell     … そのままベルを押して通知をONにする（ここで初めて通知の許可を聞く）
//   done     … 「これで通知が届きます！」（何日前に届くか・どこで変えられるか）
//   account  … マイページへ移り、アカウント（データ引き継ぎ）の行を光らせて、メールを登録すると引き継げると伝える。
//              登録はさせない（iOS 5.1.1(v)。登録しなくても全部使える）。「次へ」で課金の案内へ
// **スキップは無い**。下のタブは押せなくしてある（index.css の body[data-tour-step]）。
// 押してほしいボタン（data-tour="like" / "bell"）は同じ CSS で光らせる。
// 終わったら ONBOARDING_KEY を立て、トラッキングの許可(ATT)を聞く（通知の許可と重ならないよう、そのあと）。
//
// 段階は端末に残す（途中でアプリを閉じても、次の起動で続きから）。

export type TourStep = 'like' | 'calendar' | 'bell' | 'done' | 'account';

function readStep(): TourStep | null {
  try {
    const v = localStorage.getItem(TOUR_STEP_KEY);
    return v === 'like' || v === 'calendar' || v === 'bell' || v === 'done' || v === 'account' ? v : null;
  } catch { return null; }
}

function writeStep(step: TourStep | null): void {
  try {
    if (step) localStorage.setItem(TOUR_STEP_KEY, step);
    else { localStorage.removeItem(TOUR_STEP_KEY); localStorage.removeItem(TOUR_EVENT_KEY); }
  } catch { /* 残せなくても、この起動の間は続けられる */ }
  current = step;
  window.dispatchEvent(new Event(TOUR_EVENT));
}

let current: TourStep | null = readStep();

function subscribe(fn: () => void): () => void {
  window.addEventListener(TOUR_EVENT, fn);
  return () => window.removeEventListener(TOUR_EVENT, fn);
}

/** 今の段階（案内中でなければ null） */
export function useTourStep(): TourStep | null {
  return useSyncExternalStore(subscribe, () => current, () => null);
}

/** 案内の中でいいねした予定の id（カレンダーでその日を開くため） */
export function tourEventId(): string | null {
  try { return localStorage.getItem(TOUR_EVENT_KEY); } catch { return null; }
}

const FINISH_EVENT = 'fan-tour-finish';
/** 案内をここで終える。いいねできる予定が1件も無いとき（探すが空）の逃げ道。ふだんは使わない */
export function finishTourNow(): void {
  window.dispatchEvent(new Event(FINISH_EVENT));
}

/** いいねの知らせ（LIKED_EVENT）の中身。カードからは予定そのものも付けて、保存の通信を待たずに知らせる */
export type LikedDetail = { id: string; event?: CalendarEvent };

// 案内の中でいいねした予定。カレンダーは保存済みの予定を取り直して描くが、いいねの保存がまだ届いていなくても
// その予定を出せるように持っておく（この起動の間だけ）
let likedEvent: CalendarEvent | null = null;
/** 案内の中でいいねした予定（持っていれば）。カレンダーが取り直しを待たずに出すため */
export function tourLikedEvent(): CalendarEvent | null {
  return likedEvent;
}

/** 作品を選び終えたら呼ぶ。探すへ移るのは OnboardingTour が段階を見てやる */
export function startTour(): void {
  writeStep('like');
}

// 段階ごとの吹き出し。本文は短く（長いと読まれない）
const COPY: Record<TourStep, { icon: typeof Heart; title: string; body?: string }> = {
  like: { icon: Heart, title: '気になる予定に ♡ を押してみよう', body: '♡ を押した予定は、カレンダーに入ります。' },
  calendar: { icon: CalendarCheck, title: 'カレンダーに登録されました！' },
  bell: { icon: Bell, title: 'ベルを押して通知をONにしよう', body: '発売日や締切の前にお知らせします。' },
  // 本文は通知の設定（何日前か）に合わせて Bubble で組み立てる
  done: { icon: BellRing, title: 'これで通知が届きます！' },
  account: { icon: UserRound, title: 'メールを登録しておくと安心です', body: '機種変更やアプリの入れ直しのときも、フォローやカレンダーをそのまま引き継げます。登録はあとからいつでもできます。' },
};

// ベルを押したあと、通知が許可されなかったか（「これで通知が届きます」と言わないため）
let notifyDenied = false;

/** 「これで通知が届きます」の本文。いつ届くかは通知の設定（何日前）に合わせる */
function doneBody(): string {
  const lead = loadNotifyLeadDays();
  const when = lead > 0 ? `${lead}日前と当日の朝` : '当日の朝';
  return `発売日や締切の${when}にお知らせします。マイページの「通知の設定」で細かく設定できます。`;
}

export default function OnboardingTour() {
  const step = useTourStep();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [leaving, setLeaving] = useState(false);

  // 光らせる・タブを止めるのは CSS に任せる（どの画面の部品にも手を入れずに済む）
  useEffect(() => {
    if (step) document.body.dataset.tourStep = step;
    else delete document.body.dataset.tourStep;
  }, [step]);

  // 案内の間はバナーを出さない（吹き出しと重なる・押し間違える）
  useEffect(() => {
    if (step) setAdsSuppressed(true);
  }, [step]);

  // 段階に合った画面へ連れていく。予定詳細（/item/…）は開いてよい（詳細の ♡・ベルでも進める）
  useEffect(() => {
    if (!step || pathname.startsWith('/item/')) return;
    const want = step === 'like' ? '/explore' : step === 'account' ? '/mypage' : '/saved';
    if (pathname !== want) navigate(want, { replace: true });
  }, [step, pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  // ♡ を押したら、少し待って（♡ の動きを見せてから）カレンダーへ
  useEffect(() => {
    if (step !== 'like') return;
    const onLiked = (e: Event) => {
      const { id, event } = (e as CustomEvent<LikedDetail>).detail;
      try { localStorage.setItem(TOUR_EVENT_KEY, id); } catch { /* 無くてもカレンダーは開ける */ }
      if (event) likedEvent = { ...event, likedByMe: true };
      // ♡ の動きが見える分だけ待つ。カード（ItemCard）は保存の通信を待たずに知らせてくるので、ここが待ち時間のすべて
      setLeaving(true);
      setTimeout(() => { setLeaving(false); writeStep('calendar'); navigate('/saved'); }, 400);
    };
    window.addEventListener(LIKED_EVENT, onLiked);
    return () => window.removeEventListener(LIKED_EVENT, onLiked);
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  // ベルを押して、通知の許可を聞き終えたら「これで通知が届きます」へ（「カレンダーに登録されました」の途中で押しても進む）
  useEffect(() => {
    if (step !== 'calendar' && step !== 'bell') return;
    const onBell = () => {
      // 許可されなかった（または端末で切られている）ときは「届きます」と言わない
      notificationPermission().then((p) => { notifyDenied = p === 'denied' || p === 'prompt'; }).catch(() => {})
        .finally(() => writeStep('done'));
    };
    window.addEventListener(BELL_EVENT, onBell);
    return () => window.removeEventListener(BELL_EVENT, onBell);
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!step) return;
    const onFinish = () => { void finish(); };
    window.addEventListener(FINISH_EVENT, onFinish);
    return () => window.removeEventListener(FINISH_EVENT, onFinish);
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  const finish = async () => {
    try { localStorage.setItem(ONBOARDING_KEY, '1'); } catch { /* ignore */ }
    writeStep(null);
    setAdsSuppressed(false);
    // トラッキングの許可は案内が終わってから（通知の許可のダイアログは閉じ終わっている）
    await requestTracking();
    // 決済が繋がるまでは買えない案内を出さない方針なので FEATURE_PREMIUM で止めてある
    if (FEATURE_PREMIUM) navigate('/premium');
  };

  // 予定詳細では出さない（上の「戻る」に重なる）。詳細の ♡・ベルでも先へ進む
  if (!step || pathname.startsWith('/item/')) return null;
  return <TourLayer step={step} leaving={leaving}
    onNext={() => {
      haptic.select();
      if (step === 'calendar') writeStep('bell');
      else if (step === 'done') { writeStep('account'); navigate('/mypage'); }
      else if (step === 'account') void finish();
    }} />;
}

// ── 見せ方 ──────────────────────────────────────────────────────
// 評価の高いアプリの案内（コーチマーク）にならう（NN/g "Instructional Overlays and Coach Marks" ほか）:
//  - 押してほしいところだけを明るく残し、ほかは暗い幕で覆う（後ろの見出し・検索欄が透けて見えない）
//  - 1画面に1つだけ・文は短く・絵（アイコン）を添える
//  - 吹き出しはアプリの部品と見た目を変える（暗い地に白い文字）。部品と見間違えて押されないように
//  - 幕は指を止める。明るく残したところだけ押せる
//
//   like     … 上の見出しと下のタブを幕で覆い、予定の一覧だけ明るく残す（スクロールして選んでもらう）
//   calendar … 同じく見出しとタブを覆い、カレンダー（その日に色が付いている）と日のパネルを見せる。「次へ」で進む
//   bell     … そのカードのベルだけ丸く抜く（ここだけ押せる）

// 後ろの見出し・検索欄が透けて読めない濃さにする（薄いと「後ろが見えていてダサい」）
const DIM = 'rgba(0,0,0,0.8)';

type Rect = { top: number; left: number; width: number; height: number };

/** 目印の要素の位置を毎フレーム追う（シートが下から出てくる・スクロールする・画像で高さが変わる） */
function useRect(find: () => Element | null): Rect | null {
  const [rect, setRect] = useState<Rect | null>(null);
  useEffect(() => {
    let raf = 0;
    let last = '';
    const tick = () => {
      const el = find();
      const r = el?.getBoundingClientRect();
      const next = r && r.width > 0 ? { top: r.top, left: r.left, width: r.width, height: r.height } : null;
      const key = next ? `${Math.round(next.top)},${Math.round(next.left)},${Math.round(next.width)},${Math.round(next.height)}` : '';
      if (key !== last) { last = key; setRect(next); }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [find]);
  return rect;
}

const findHeader = () => document.querySelector('[data-skin-bar="main"]');
const findNav = () => document.querySelector('[data-bottom-nav] > *');
const findAccount = () => document.querySelector('[data-tour="account"]');

function TourLayer({ step, leaving, onNext }: { step: TourStep; leaving: boolean; onNext: () => void }) {
  const id = tourEventId();
  const findBell = useCallback(() => (id ? document.querySelector(`[data-card-id="${CSS.escape(id)}"] [data-tour="bell"]`) : null), [id]);
  const framed = step === 'like' || step === 'calendar' || step === 'done';
  const header = useRect(framed ? findHeader : nothing);
  const nav = useRect(framed ? findNav : nothing);
  const target = useRect(step === 'bell' ? findBell : step === 'account' ? findAccount : nothing);

  // 光らせる行が画面の外にあるとき（マイページのアカウントは下の方）は、真ん中まで送る。出てくるまで少し待つ
  useEffect(() => {
    if (step !== 'account') return;
    let tries = 0;
    const t = setInterval(() => {
      const el = findAccount();
      if (el || ++tries > 30) {
        clearInterval(t);
        el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    }, 100);
    return () => clearInterval(t);
  }, [step]);

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const fade = { opacity: leaving ? 0 : 1, transition: 'opacity 0.3s ease' };

  if (framed) {
    const top = Math.max(header ? header.top + header.height : 0, 0);
    const bottom = nav ? nav.top - 10 : vh;
    return (
      <div className="fixed inset-0 z-[250] pointer-events-none" style={fade}>
        {/* 上の幕。見出し・検索欄・作品の並びを覆い、その上に案内を載せる */}
        <div className="absolute inset-x-0 top-0 pointer-events-auto flex flex-col justify-end px-4 pb-3"
          // 高さは見出しの下端まで。吹き出しの方が高ければ伸ばす（上にはみ出して見出しが切れないように）
          style={{ minHeight: `max(${Math.max(top, 0)}px, calc(var(--sat) + 96px))`, paddingTop: 'calc(var(--sat) + 8px)', backgroundColor: DIM }}>
          <Bubble step={step} arrow={step === 'done' ? undefined : 'down'} onNext={step === 'like' ? undefined : onNext} />
        </div>
        {/* 下の幕。タブを覆う（押せない） */}
        <div className="absolute inset-x-0 bottom-0 pointer-events-auto" style={{ top: bottom, backgroundColor: DIM }} />
      </div>
    );
  }

  // bell: ベルだけを丸く抜く（ここだけ押せる）。account: アカウントの行を抜く（押させない。「次へ」で進む）。
  // 見つかるまで（シートが出てくる途中など）は全体を暗くして吹き出しだけ出す
  const pad = step === 'bell' ? 6 : 2;
  const hole = target && {
    top: target.top - pad, left: target.left - pad,
    width: target.width + pad * 2, height: target.height + pad * 2,
  };
  const radius = step === 'bell' ? 9999 : 12;
  // 吹き出しは、抜いたところの上に余裕があれば上、無ければ下
  const above = hole ? hole.top > 190 : true;
  const arrowX = hole ? hole.left + hole.width / 2 : vw / 2;

  return (
    <div className="fixed inset-0 z-[250] pointer-events-none" style={fade}>
      {hole ? (
        <>
          {/* 暗い幕（抜いた穴のまわりを大きな影で塗る。影は指を通すので、下の4枚で止める） */}
          <div className="absolute" style={{ ...hole, borderRadius: radius, boxShadow: `0 0 0 200vmax ${DIM}`, transition: 'all 0.25s ease' }} />
          <div className="absolute inset-x-0 top-0 pointer-events-auto" style={{ height: Math.max(hole.top, 0) }} />
          <div className="absolute inset-x-0 bottom-0 pointer-events-auto" style={{ top: hole.top + hole.height }} />
          <div className="absolute left-0 pointer-events-auto" style={{ top: hole.top, height: hole.height, width: Math.max(hole.left, 0) }} />
          <div className="absolute right-0 pointer-events-auto" style={{ top: hole.top, height: hole.height, left: hole.left + hole.width }} />
          {step === 'account' && <div className="absolute pointer-events-auto" style={hole} />}
        </>
      ) : (
        <div className="absolute inset-0 pointer-events-auto" style={{ backgroundColor: DIM }} />
      )}
      <div className="absolute inset-x-0 px-4"
        style={hole
          ? (above ? { bottom: vh - hole.top + 12 } : { top: hole.top + hole.height + 12 })
          : { top: 'calc(var(--sat) + 16px)' }}>
        <Bubble step={step} arrow={hole ? (above ? 'down' : 'up') : undefined} arrowX={arrowX} onNext={step === 'account' ? onNext : undefined} />
      </div>
    </div>
  );
}

const nothing = () => null;

/** 案内の吹き出し。アプリの部品と見間違えないよう、暗い地に白い文字で出す */
function Bubble({ step, arrow, arrowX, onNext }: { step: TourStep; arrow?: 'up' | 'down'; arrowX?: number; onNext?: () => void }) {
  const denied = step === 'done' && notifyDenied;
  const { icon: Icon, title } = denied ? { icon: BellOff, title: '通知はあとからONにできます' } : COPY[step];
  const body = denied ? '端末の設定でFanHiveの通知を許可すると届くようになります。' : step === 'done' ? doneBody() : COPY[step].body;
  const ref = useRef<HTMLDivElement>(null);
  // 矢印は目印の真上（真下）に。吹き出しの端からはみ出さないように寄せる
  const [left, setLeft] = useState<number | null>(null);
  useLayoutEffect(() => {
    const r = ref.current?.getBoundingClientRect();
    if (!r || arrowX === undefined) { setLeft(null); return; }
    setLeft(Math.min(Math.max(arrowX - r.left, 24), r.width - 24));
  }, [arrowX]);
  const tip = (dir: 'up' | 'down') => (
    <div className="absolute w-3.5 h-3.5 rotate-45"
      style={{
        backgroundColor: 'var(--label-primary)',
        left: (left ?? 0) - 7,
        visibility: left === null && arrowX !== undefined ? 'hidden' : 'visible',
        ...(dir === 'down' ? { bottom: -6 } : { top: -6 }),
        ...(left === null && arrowX === undefined ? { left: 'calc(50% - 7px)' } : {}),
      }} />
  );
  return (
    <div ref={ref} key={step} className="pointer-events-auto relative rounded-[16px] px-4 py-3.5 shadow-float"
      style={{ backgroundColor: 'var(--label-primary)', color: 'var(--bg-primary)', animation: 'tourBubbleIn 0.35s cubic-bezier(0.32,0.72,0,1) both' }}>
      {arrow === 'up' && tip('up')}
      <div className="flex items-center gap-3">
      <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'var(--accent-color)' }}>
        <Icon size={20} style={{ color: 'var(--accent-on)' }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[15px] font-bold leading-snug">{title}</p>
        {body && <p className="text-[12px] leading-snug mt-0.5" style={{ opacity: 0.75 }}>{body}</p>}
      </div>
      </div>
      {/* 「次へ」は文の下に置く（横に並べると文が細切れに折り返す） */}
      {onNext && (
        <div className="flex justify-end mt-2.5">
          <button onClick={onNext}
            className="pressable px-5 py-2 rounded-full text-[13px] font-bold"
            style={{ backgroundColor: 'var(--accent-color)', color: 'var(--accent-on)' }}>
            次へ
          </button>
        </div>
      )}
      {arrow === 'down' && tip('down')}
    </div>
  );
}

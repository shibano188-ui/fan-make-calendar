import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { useTourStep } from './OnboardingTour';
import { haptic } from '../lib/haptics';
import { ONBOARDING_KEY } from '../lib/constants';
import { loadHintsSeen, markHintsSeen } from '../lib/hintsSeen';

// 場面ごとのヒント（2026-11-07 柴野）。最初の案内（OnboardingTour）は短くし、増えた機能・前からあって分かりにくい機能は、
// 初めてその画面でその部品が見えたときに、小さな吹き出しで1回だけ出す。
//   ・案内の途中・シートが開いているときは出さない
//   ・1つずつ。「OK」で閉じたら、同じ画面に見えている次のヒントをすぐ出す（上にあるものから順に。
//     前は間をあけていたので、終わったと思ったら変な間で次が来ていた・柴野）
//   ・見たものは端末に覚える（lib/hintsSeen.ts）。最初の案内で説明したものは、案内を終えたときに見たことにする
//   ・今使っている人（前の案内しか見ていない人）にも出す

type Hint = {
  id: string;
  /** その画面のパス。'/' で終わるものは前方一致（'/item/' は予定の詳細すべて）、それ以外は一致 */
  path: string;
  /** 指す部品。画面に見えていないときは出さない */
  find: () => Element | null;
  text: string;
};

/** 画面に実際に見えている（真ん中がほかの物に隠れていない・下のナビより上にある）最初の要素 */
const visible = (sel: string) => () => {
  for (const el of document.querySelectorAll(sel)) {
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.top < 0 || r.bottom > window.innerHeight - 100) continue;
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + Math.min(r.height / 2, 24));
    if (hit && el.contains(hit)) return el;
  }
  return null;
};

const HINTS: Hint[] = [
  // カレンダー（ボード）。cal-overview・cal-swipe は最初の案内でも説明する（案内を見た人には出ない）
  { id: 'cal-overview', path: '/saved', find: visible('[data-tour="calendar"]'), text: 'いつ何があるか、ここで見られます' },
  { id: 'cal-swipe', path: '/saved', find: visible('[data-board-day] [data-card-id]'), text: '右へ払うと通知、左へ払うと外せます' },
  { id: 'cal-visit', path: '/saved', find: visible('[data-hint="cal-visit"]'), text: '押すと、行く日を選べます' },
  { id: 'cal-fold', path: '/saved', find: visible('[aria-hidden="false"] > button[aria-label="カレンダーを開く"]'), text: '押すとカレンダーが開きます' },
  { id: 'cal-undated', path: '/saved', find: visible('[data-undated-drop]'), text: '長押しで、好きな場所へ仮置きできます' },
  { id: 'cal-view', path: '/saved', find: visible('button[aria-label="表示を切り替える"]'), text: '月・週・日・リストにも切り替えられます' },
  { id: 'cal-icons', path: '/saved', find: visible('[data-hint="cal-icons"]'), text: 'カレンダーの点を好きな画像にできます' },
  { id: 'cal-custom', path: '/saved', find: visible('button[aria-label="カスタマイズ"]'), text: 'テーマや背景、色を変えられます' },
  // ホーム（前は ✕ で消す案内の帯だった）
  { id: 'home-icon', path: '/', find: visible('button[aria-label="作品アイコンを選ぶ"]'), text: '押すと、推しの画像をアイコンにできます' },
  // 探す
  { id: 'ex-swipe', path: '/explore', find: visible('[data-event-id]'), text: '右へ払うと追加、左へ払うと非表示' },
  { id: 'ex-stamp', path: '/explore', find: visible('[data-hint="ex-stamp"]'), text: 'スタンプを押した予定はここに' },
  { id: 'ex-follow', path: '/explore', find: visible('[data-hint="ex-follow"]'), text: '作品をフォローできます' },
  // 予定の詳細（前は詳細を開いた瞬間に吹き出しが出ていた）
  { id: 'item-share', path: '/item/', find: visible('[data-hint="item-share"]'), text: '気になる予定は X で共有もできます' },
  // マイページ
  { id: 'my-fanstar', path: '/mypage', find: visible('[data-hint="my-fanstar"]'), text: '投稿やいいねで星が育ちます' },
  { id: 'my-ranking', path: '/mypage', find: visible('[data-hint="my-ranking"]'), text: '投稿で点が入り、毎月の順位が決まります' },
  { id: 'my-sync', path: '/mypage', find: visible('[data-hint="my-sync"]'), text: 'いつものカレンダーに予定を入れられます' },
];

const loadSeen = loadHintsSeen;
const markSeen = (id: string) => markHintsSeen(id);

export default function HintLayer() {
  const { pathname } = useLocation();
  const tour = useTourStep();
  const [hint, setHint] = useState<{ h: Hint; el: Element } | null>(null);
  // 「OK」で閉じた直後か（続けて次を出す）
  const chained = useRef(false);

  useEffect(() => { setHint(null); chained.current = false; }, [pathname]);

  // 出せるヒントを探す（画面に部品が見えるまで待つ）。見えているものが複数あれば、上にあるものから
  useEffect(() => {
    if (tour || hint) return;
    let onboarded = false;
    try { onboarded = localStorage.getItem(ONBOARDING_KEY) === '1'; } catch { /* 出さない */ }
    if (!onboarded) return;
    let timer: ReturnType<typeof setTimeout>;
    const look = () => {
      // シート・ダイアログ・案内が開いているときは待つ
      if (document.querySelector('[role="dialog"]') || document.body.dataset.tourStep) { timer = setTimeout(look, 1000); return; }
      const seen = loadSeen();
      const onPath = (h: Hint) => (h.path.length > 1 && h.path.endsWith('/') ? pathname.startsWith(h.path) : h.path === pathname);
      const found = HINTS.filter((h) => onPath(h) && !seen.has(h.id))
        .map((h) => ({ h, el: h.find() }))
        .filter((x): x is { h: Hint; el: Element } => !!x.el)
        .sort((a, b) => a.el.getBoundingClientRect().top - b.el.getBoundingClientRect().top)[0];
      if (found) { setHint(found); return; }
      chained.current = false;
      timer = setTimeout(look, 1000);
    };
    // 開いてすぐは少し待つ（画面を見る間）。「OK」の直後は、見えている次をすぐ出す
    timer = setTimeout(look, chained.current ? 200 : 900);
    return () => clearTimeout(timer);
  }, [pathname, tour, hint]);

  if (!hint || tour) return null;
  return <HintBubble key={hint.h.id} hint={hint.h} el={hint.el} onClose={() => { haptic.select(); markSeen(hint.h.id); chained.current = true; setHint(null); }} />;
}

function HintBubble({ hint, el, onClose }: { hint: Hint; el: Element; onClose: () => void }) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  // 部品の位置を追う。スクロールで見えなくなったら閉じる（覚えないので、次に見えたときにまた出る）
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const r = el.isConnected ? el.getBoundingClientRect() : null;
      setRect((prev) => (r && prev && Math.abs(prev.top - r.top) < 0.5 && Math.abs(prev.left - r.left) < 0.5 ? prev : r));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [el]);
  const ref = useRef<HTMLDivElement>(null);
  const [h, setH] = useState(0);
  useLayoutEffect(() => { setH(ref.current?.offsetHeight ?? 0); }, [rect === null]);
  if (!rect || rect.bottom < 0 || rect.top > window.innerHeight - 90) return null;

  const vw = window.innerWidth;
  // 部品の上に余裕があれば上、無ければ下
  const above = rect.top - h - 14 > 70;
  const top = above ? rect.top - h - 12 : rect.bottom + 12;
  const arrowX = Math.min(Math.max(rect.left + rect.width / 2, 28), vw - 28);
  return createPortal(
    <>
      {/* 指している部品の縁取り（押すのは邪魔しない） */}
      <div className="fixed pointer-events-none rounded-[12px]"
        style={{ zIndex: 240, top: rect.top - 3, left: rect.left - 3, width: rect.width + 6, height: rect.height + 6, boxShadow: '0 0 0 2px var(--accent-color)', animation: 'tourPulse 1.4s ease-out infinite' }} />
      <div ref={ref} className="fixed left-4 right-4 max-w-[360px] mx-auto rounded-[14px] pl-3.5 pr-2 py-2.5 shadow-float flex items-center gap-2"
        style={{ zIndex: 241, top, backgroundColor: 'var(--label-primary)', color: 'var(--bg-primary)', animation: 'tourBubbleIn 0.3s cubic-bezier(0.32,0.72,0,1) both' }}>
        <span className="absolute w-3 h-3 rotate-45"
          style={{ backgroundColor: 'var(--label-primary)', left: `calc(${arrowX}px - 6px - ${ref.current?.getBoundingClientRect().left ?? 16}px)`, ...(above ? { bottom: -5 } : { top: -5 }) }} />
        <p className="flex-1 text-[13px] font-semibold leading-snug">{hint.text}</p>
        <button className="pressable flex-shrink-0 px-3 h-8 rounded-full text-[13px] font-bold" style={{ backgroundColor: 'var(--accent-color)', color: 'var(--accent-on)' }}
          onClick={onClose}>OK</button>
      </div>
    </>,
    document.body,
  );
}

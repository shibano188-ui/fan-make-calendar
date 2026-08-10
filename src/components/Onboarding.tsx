import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { CalendarDays, Heart, Bell, Sparkles } from 'lucide-react';
import { setAdsSuppressed } from '../lib/adSuppress';
import { ONBOARDING_KEY, ONBOARDING_DEMO_KEY, FEATURE_PREMIUM } from '../lib/constants';
import AiDemo from './AiDemo';

// 初回オンボーディング（現IA: ホーム/探す/＋投稿/カレンダー/マイページ 版）
// 表示条件: フラグ未設定のみ。キーを v2 に更新し、旧カードを見た人にも一度だけ出す
// （「いいね＝カレンダー追加」「通知がある」が伝わっていないため）。

// 本文はワンセンテンス厳守（長いと読まれない）。改行は入れず折り返しに任せる。
const CARDS = [
  {
    icon: CalendarDays,
    title: '推しの予定、ぜんぶここに',
    body: 'ファンが見つけたイベントやグッズの予定が「探す」に集まります。',
  },
  {
    icon: Heart,
    title: 'いいねでカレンダーに追加',
    body: '気になる予定は ♡ を押すだけ。「カレンダー」タブに入ります。',
  },
  {
    icon: Bell,
    title: '通知で買い逃しを防ぐ',
    body: '追加した予定の 🔔 をONにすると、発売日や締切の前にお知らせ。',
  },
  {
    icon: Sparkles,
    title: 'Xで見つけたら、共有するだけ',
    body: '共有先に FanHive を選ぶと、AIが予定を自動入力します。',
  },
] as const;

export default function Onboarding() {
  const [show, setShow] = useState(() => !localStorage.getItem(ONBOARDING_KEY));
  // 体験（/post?demo=1）から戻ってきた直後か。最後のカードのボタンが変わる
  const [demoDone, setDemoDone] = useState(() => !!localStorage.getItem(ONBOARDING_DEMO_KEY));
  const [page, setPage] = useState(0);
  const [demo, setDemo] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { pathname } = useLocation();

  // この画面はホームの上にだけ出す。体験で /post?demo=1 へ送っている間に重なったままだと
  // 投稿画面が見えない（＝「飛ばない」ように見える）。戻ってきたらまた出る。
  const onHome = pathname === '/';
  const visible = show && onHome;

  // バナー広告はWebViewの外に出るので、この画面を重ねても隠れない。ネイティブ側に伏せてもらう
  useEffect(() => {
    setAdsSuppressed(visible);
    return () => setAdsSuppressed(false);
  }, [visible]);

  // 体験から戻ってきたかを、ホームに戻るたびに読み直す。
  // このコンポーネントは App 直下でマウントされたままなので、初期値だけ見ていると
  // 投稿画面から戻っても false のままで「自分の推しでやってみる」が出ない
  useEffect(() => {
    if (pathname !== '/') return;
    setDemoDone(!!localStorage.getItem(ONBOARDING_DEMO_KEY));
    // 体験は投稿画面へ移った時点で役目が終わっている。ここを消さないと、ホームに戻ったときに
    // 例のポストの画面がカードの上にまた被さって、次のボタンが見えない
    setDemo(false);
  }, [pathname]);

  // 体験から戻ってきたときは最後のカードから始める（1枚目に巻き戻すと同じ説明を読み直させる）
  // ⚠ フックは早期returnより前に置くこと。後ろに足すとフックの数が変わってアプリごと落ちる
  useEffect(() => {
    if (!visible || !demoDone) return;
    const el = scrollRef.current;
    if (el) el.scrollLeft = el.clientWidth * (CARDS.length - 1);
    setPage(CARDS.length - 1);
  }, [visible, demoDone]);

  const finish = () => {
    localStorage.setItem(ONBOARDING_KEY, '1');
    try { localStorage.removeItem(ONBOARDING_DEMO_KEY); } catch { /* ignore */ }
    setShow(false);
    // スキップした人にもプランの案内は見せる（一番読まれる位置なので）。
    // 決済が繋がるまでは買えない案内を出さない方針なので FEATURE_PREMIUM で止めてある
    if (FEATURE_PREMIUM) navigate('/premium');
  };

  // 自分の推しの告知でやってみてもらう。Xを開いて、あとは本物の共有シートから戻ってくる
  const openX = () => {
    window.open('https://x.com/', '_blank', 'noopener');
    finish();
  };

  if (!visible) return null;

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    setPage(Math.round(el.scrollLeft / el.clientWidth));
  };

  return (
    <div className="fixed inset-0 z-[300] max-w-app mx-auto flex flex-col" style={{ backgroundColor: 'var(--bg-primary)' }}>
      {/* スキップ */}
      <div className="flex justify-end px-4 pt-4" style={{ paddingTop: 'max(16px, var(--sat))' }}>
        <button onClick={finish} className="text-[13px] text-label-tertiary px-3 py-2 pressable">
          スキップ
        </button>
      </div>

      {/* カード（横スワイプ・scroll-snap） */}
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="flex-1 flex overflow-x-auto"
        style={{ scrollSnapType: 'x mandatory', scrollbarWidth: 'none' }}
      >
        {CARDS.map(({ icon: Icon, title, body }) => (
          <div
            key={title}
            className="flex-shrink-0 w-full flex flex-col items-center justify-center gap-6 px-10 text-center"
            style={{ scrollSnapAlign: 'center' }}
          >
            <div
              className="w-24 h-24 rounded-[28px] flex items-center justify-center"
              style={{ backgroundColor: 'color-mix(in srgb, var(--accent-color) 14%, transparent)' }}
            >
              <Icon size={44} style={{ color: 'var(--accent-text)' }} strokeWidth={1.6} />
            </div>
            <p className="text-[22px] font-bold text-label-primary leading-snug">{title}</p>
            <p className="text-[14px] text-label-secondary leading-relaxed max-w-[280px]">{body}</p>
          </div>
        ))}
      </div>

      {/* ページドット + CTA */}
      <div className="flex flex-col items-center gap-6 pb-10 px-8" style={{ paddingBottom: 'max(40px, env(safe-area-inset-bottom))' }}>
        <div className="flex gap-2">
          {CARDS.map((_, i) => (
            <div
              key={i}
              className="w-2 h-2 rounded-full transition-colors"
              style={{ backgroundColor: i === page ? 'var(--accent-text)' : 'var(--fill-primary)' }}
            />
          ))}
        </div>
        {page === CARDS.length - 1 ? (
          /* 最後は「読んで終わり」にしない。共有ひとつで予定になるところを実際に触らせる。
             強制はしない（押さない人はそのまま「はじめる」で抜けられる）。 */
          <div className="w-full flex flex-col gap-2">
            <button
              onClick={demoDone ? openX : () => setDemo(true)}
              className="w-full py-3.5 rounded-full text-[15px] font-semibold pressable"
              style={{ backgroundColor: 'var(--accent-color)', color: 'var(--accent-on)' }}
            >
              {demoDone ? '自分の推しでやってみる' : 'AI入力を使ってみる'}
            </button>
            <button onClick={finish} className="w-full py-2 text-[13px] text-label-secondary pressable">
              はじめる
            </button>
          </div>
        ) : (
          <button
            onClick={() => scrollRef.current?.scrollBy({ left: scrollRef.current.clientWidth, behavior: 'smooth' })}
            className="w-full py-3.5 rounded-full text-[15px] font-semibold pressable"
            style={{ backgroundColor: 'color-mix(in srgb, var(--accent-color) 15%, transparent)', color: 'var(--accent-text)' }}
          >
            次へ
          </button>
        )}
      </div>

      {demo && <AiDemo onSkip={finish} />}
    </div>
  );
}

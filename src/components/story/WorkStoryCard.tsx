import { Fragment, useLayoutEffect, useRef, useState } from 'react';
import { Pencil, Plus, ImageOff } from 'lucide-react';
import type { CalendarEvent } from '../../types';
import type { StoryGroup, NextDate } from '../../lib/story';
import { parseImageUrls } from '../../lib/constants';
import OptImg from '../ui/OptImg';
import WorkBadge from './WorkBadge';
import { haptic } from '../../lib/haptics';

// ホームの作品カード（2026-10-04 柴野）。長方形の上に、半分はみ出した作品の丸（＝ストーリー）。
// 丸を押すとその作品の新着をストーリーで見る。鉛筆で作品アイコンを選ぶ（カレンダーと同じアイコン）。
// 中ほどは「次の予定」: いいねした予定があれば「あなたの予定」、無ければ「この作品の予定」で一番近い節目と、その次の予定の画像

const BADGE = 64;

function md(d: string): string {
  const [, m, day] = d.split('-');
  return `${Number(m)}/${Number(day)}`;
}

function daysText(days: number): string {
  return days === 0 ? '今日' : days === 1 ? '明日' : `あと${days}日`;
}

export function WorkStoryCard({ group, followDays, next, height, onStory, onPickIcon, onNew, onSearch, onOpenEvent }: {
  group: StoryGroup;
  followDays: number | null;
  next: { mine: boolean; main: NextDate | null; after: CalendarEvent[] };
  height: number;
  onStory: () => void;
  onPickIcon: () => void;
  onNew: () => void;
  onSearch: () => void;
  onOpenEvent: (e: CalendarEvent) => void;
}) {
  return (
    <CardFrame height={height}>
      <BadgeSlot>
        <button onClick={() => { haptic.select(); onStory(); }} aria-label={`${group.title}の新着を1件ずつ見る`} className="pressable rounded-full">
          <WorkBadge title={group.title} color={group.color} image={group.image} size={BADGE} ring={group.pages.length ? (group.unseen > 0 ? 'unseen' : 'seen') : undefined} />
        </button>
        <button onClick={() => { haptic.select(); onPickIcon(); }} aria-label="作品アイコンを選ぶ"
          className="pressable absolute -right-1 bottom-0 w-6 h-6 rounded-full flex items-center justify-center border border-subtle"
          style={{ backgroundColor: 'var(--bg-secondary)' }}>
          <Pencil size={12} className="text-label-secondary" />
        </button>
      </BadgeSlot>
      <div className="px-3 pt-1 text-center">
        <FitTitle text={group.title} />
        {followDays != null && <div className="text-[11px] text-label-tertiary mt-0.5">{followDays}日フォロー中</div>}
      </div>

      {/* 次の締切・発売。いいねした予定があればそれ（自分が買う・行くもの）、無ければ作品の全部から一番近いもの。
          文字だけだと何の予定か分からなかったので、予定の画像と「◯◯まで あと◯日」を並べた小さなカードにする */}
      <div className="mx-3 mt-3 pt-2.5 border-t border-subtle flex-1 min-h-0 flex flex-col overflow-hidden">
        <div className="text-[11px] text-label-secondary">次の締切・発売{next.mine && <span className="text-label-tertiary">（いいねした予定）</span>}</div>
        {next.main ? (
          <button onClick={() => { haptic.select(); onOpenEvent(next.main!.event); }} className="pressable text-left mt-1.5">
            <span className="flex items-center gap-2">
              <span className="w-12 h-12 rounded-[8px] overflow-hidden bg-fill-3 flex-shrink-0 flex items-center justify-center">
                <Thumb src={parseImageUrls(next.main.event.imageUrl)[0]} />
              </span>
              <span className="min-w-0 text-[11px] text-label-secondary leading-tight">{next.main.label}まで（{md(next.main.date)}）</span>
            </span>
            {/* 画像の横は狭く「あと135日」が2行に折れていたので、下にカードの幅いっぱいで1行に出す */}
            <span className={`block font-bold leading-tight whitespace-nowrap mt-1 ${next.main.days >= 100 ? 'text-[17px]' : 'text-[20px]'}`} style={{ color: 'var(--accent-text)' }}>
              {daysText(next.main.days)}
            </span>
            <span className="block text-[12px] leading-snug line-clamp-2 mt-0.5">{next.main.event.title}</span>
          </button>
        ) : (
          <div className="text-[12px] text-label-tertiary mt-1">これからの締切・発売はまだありません</div>
        )}
      </div>

      <div className="mx-3 pt-2.5 pb-3 border-t border-subtle mt-2">
        {/* 件数はボタンに入れる（別の行にするとカードの高さを食う） */}
        <button onClick={() => { haptic.select(); onNew(); }} disabled={group.unseen === 0}
          className="pressable relative w-full py-1.5 rounded-full text-[13px] font-semibold whitespace-nowrap"
          style={group.unseen > 0 ? { backgroundColor: 'var(--accent-color)', color: 'var(--accent-on)' } : { backgroundColor: 'var(--fill-tertiary)', color: 'var(--label-secondary)' }}>
          {group.unseen > 0 ? '新着を見る' : '新着なし'}
          {/* 件数は右上の丸に（文字に入れると狭い画面で2行に折れる） */}
          {group.unseen > 0 && (
            <span className="absolute -top-1.5 -right-1 min-w-[20px] h-5 px-1.5 rounded-full flex items-center justify-center text-[11px] font-bold tabular-nums"
              style={{ backgroundColor: 'var(--color-destructive)', color: '#fff' }}>
              {group.unseen > 99 ? '99+' : group.unseen}
            </span>
          )}
        </button>
        <button onClick={() => { haptic.select(); onSearch(); }}
          className="pressable w-full mt-1.5 py-1.5 rounded-full text-[13px] font-semibold"
          style={{ backgroundColor: 'var(--fill-tertiary)' }}>
          この作品を探す
        </button>
      </div>
    </CardFrame>
  );
}

/** 次の締切の小さな画像。読み込めなかったら画像なしの印にする（壊れた画像の「?」を出さない） */
function Thumb({ src }: { src?: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <ImageOff size={16} className="text-label-tertiary" />;
  return <OptImg src={src} w={192} alt="" loading="lazy" className="w-full h-full object-cover" onError={() => setFailed(true)} />;
}

/** 先頭の「今週のまとめ」。ホームの今週発売・受付中・人気の区画だったもの */
export function WeekStoryCard({ group, height, counts, onStory }: {
  group: StoryGroup; height: number; counts: { deadline: number; release: number; popular: number }; onStory: () => void;
}) {
  const rows = [['締切間近', counts.deadline], ['今週発売', counts.release], ['人気', counts.popular]] as const;
  return (
    <CardFrame height={height}>
      <BadgeSlot>
        <button onClick={() => { haptic.select(); onStory(); }} aria-label="今週のまとめを1件ずつ見る" className="pressable rounded-full">
          <WorkBadge title={group.title} color={group.color} size={BADGE} label="今週" ring={group.pages.length ? (group.unseen > 0 ? 'unseen' : 'seen') : undefined} />
        </button>
      </BadgeSlot>
      <div className="px-3 pt-1 text-center text-[15px] font-bold">今週のまとめ</div>
      <div className="mx-3 mt-3 pt-2.5 border-t border-subtle flex-1 flex flex-col gap-2.5">
        {rows.map(([label, n]) => (
          <div key={label} className="flex items-baseline justify-between">
            <span className="text-[13px] text-label-secondary">{label}</span>
            <span className="text-[20px] font-bold tabular-nums" style={{ color: n ? 'var(--accent-text)' : 'var(--label-tertiary)' }}>{n}</span>
          </div>
        ))}
      </div>
      <div className="mx-3 pt-2.5 pb-3 border-t border-subtle mt-2">
        <button onClick={() => { haptic.select(); onStory(); }} disabled={!group.pages.length}
          className="pressable w-full py-2 rounded-full text-[13px] font-semibold"
          style={group.pages.length ? { backgroundColor: 'var(--accent-color)', color: 'var(--accent-on)' } : { backgroundColor: 'var(--fill-tertiary)', color: 'var(--label-tertiary)' }}>
          {group.pages.length ? 'まとめて見る' : '今週はまだありません'}
        </button>
      </div>
    </CardFrame>
  );
}

/** 最後の「作品を追加」 */
export function AddWorkCard({ height, onAdd }: { height: number; onAdd: () => void }) {
  return (
    <button onClick={() => { haptic.select(); onAdd(); }}
      className="pressable snap-start flex-shrink-0 rounded-[16px] border-2 border-dashed flex flex-col items-center justify-center gap-2"
      style={{ width: CARD_W, height: height - BADGE / 2, marginTop: BADGE / 2, borderColor: 'var(--accent-color)', color: 'var(--accent-text)' }}>
      <Plus size={28} />
      <span className="text-[14px] font-semibold">作品を追加</span>
    </button>
  );
}

// ─── 作品名 ─────────────────────────────────────────────────
// 改行されると読みにくい（2026-10-04 柴野）。まず1行に収まるまで文字を小さくし（15→12px）、
// それでも入らない長い名前だけ折る（12〜10px・3行まで。たいていは2行に収まる）。区切りのよいところでだけ折り、行の長さを揃える
const TITLE_SIZES = [15, 14, 13, 12];

/** 折ってよい位置で区切る。「の」「・」「－」「～」・空白の後と、カタカナの切れ目
 *  （僕の｜ヒーローアカデミア、家庭教師ヒットマン｜REBORN!）。ほかの位置では折らない */
function splitParts(text: string): string[] {
  const chars = Array.from(text);
  const kata = (c: string) => /[ァ-ヺー]/.test(c);
  const parts: string[] = [];
  let cur = '';
  chars.forEach((c, i) => {
    const next = chars[i + 1];
    cur += c;
    const after = /[の・\s/／!！?？）)」』】－～〜]/.test(c) && !/[!！?？]/.test(next ?? ''); // 「!!」の途中では折らない
    // カタカナの切れ目。ただしカタカナの後ろがひらがな（ダイの・スライムだった）や記号のときは折らない
    const edge = next !== undefined && kata(c) !== kata(next) && !/[ー・\s!！?？、。」』）)】]/.test(next) && !(kata(c) && /[ぁ-ゖ]/.test(next));
    if (next !== undefined && (after || edge)) { parts.push(cur); cur = ''; }
  });
  if (cur) parts.push(cur);
  return parts;
}

/** 区切りごとにブラウザにも折らせない（記号の後ろで勝手に折る:「カードファイト! ⏎ !ヴァンガード」）。
 *  loose のときは、どうしても入らないかたまりを途中で折れるようにする（切れて読めなくなるよりよい） */
function withBreaks(parts: string[], loose: boolean) {
  return parts.map((p, i) => <Fragment key={i}><span className={loose ? undefined : 'whitespace-nowrap'}>{p}</span>{i < parts.length - 1 && <wbr />}</Fragment>);
}

const WRAP_SIZES = [12, 11, 10];

function FitTitle({ text }: { text: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const parts = splitParts(text);
  const [fit, setFit] = useState<{ size: number; wrap: boolean; loose: boolean }>({ size: TITLE_SIZES[0], wrap: false, loose: false });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // 要素そのものの大きさを書き換えて測ると、React が戻さずに測った値が残る（2行にしたのに1行で切れていた）。
    // 文字の幅は canvas で測り、要素には触らない
    const ctx = document.createElement('canvas').getContext('2d');
    const set = (next: { size: number; wrap: boolean; loose: boolean }) =>
      setFit((f) => (f.size === next.size && f.wrap === next.wrap && f.loose === next.loose ? f : next));
    const measure = () => {
      const width = el.clientWidth;
      if (!ctx || !width) return;
      const cs = getComputedStyle(el);
      const w = (t: string, size: number) => { ctx.font = `${cs.fontWeight} ${size}px ${cs.fontFamily}`; return ctx.measureText(t).width; };
      // 1行に収まる大きさ
      for (const size of TITLE_SIZES) if (w(text, size) <= width) return set({ size, wrap: false, loose: false });
      // 折るときは、一番長いかたまりが1行に入る大きさ（狭い画面で「ヒーローアカデミア」が切れていた）
      // 3行に入る見込みも見る（折る位置で行が余るので、幅の2.6行ぶんまで）
      for (const size of WRAP_SIZES) {
        if (Math.max(...parts.map((p) => w(p, size))) <= width && w(text, size) <= width * 2.6) return set({ size, wrap: true, loose: false });
      }
      set({ size: WRAP_SIZES[WRAP_SIZES.length - 1], wrap: true, loose: true });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [text]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div ref={ref} className={`font-bold leading-snug ${fit.wrap ? 'line-clamp-3' : 'overflow-hidden'}`}
      style={{
        fontSize: fit.size,
        whiteSpace: fit.wrap ? 'normal' : 'nowrap',
        wordBreak: fit.wrap ? 'keep-all' : undefined,
        overflowWrap: fit.loose ? 'anywhere' : undefined,
        textWrap: fit.wrap ? 'balance' : undefined,
      } as React.CSSProperties}>
      {fit.wrap ? withBreaks(parts, fit.loose) : text}
    </div>
  );
}

/** 1画面に2枚と、3枚目の端が少し見える幅（横に続くと分かるように） */
const CARD_W = 'calc((100% - 36px) / 2.14)';

function CardFrame({ height, children }: { height: number; children: React.ReactNode }) {
  return (
    <div className="snap-start flex-shrink-0 relative" style={{ width: CARD_W, height, paddingTop: BADGE / 2 }}>
      <div className="h-full rounded-[16px] border border-subtle flex flex-col" style={{ backgroundColor: 'var(--bg-secondary)', paddingTop: BADGE / 2 }}>
        {children}
      </div>
    </div>
  );
}

/** 丸をカードの上辺の真ん中に、半分はみ出させて置く */
function BadgeSlot({ children }: { children: React.ReactNode }) {
  return <div className="absolute left-1/2 -translate-x-1/2 top-0">{children}</div>;
}

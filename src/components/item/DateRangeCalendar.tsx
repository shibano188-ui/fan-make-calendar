import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { todayStr } from '../../design/tokens';
import { haptic } from '../../lib/haptics';

// 日付を選ぶカレンダー（＋α・日付の修正で使う。2026-11-07 柴野「行く日を選ぶときみたいにカレンダーで」）。
// タップで1日、長押しして引っぱると期間（始まり〜終わり）。月は左右の矢印か、横に払ってめくる。
// 選んだ日は黒い丸、期間のあいだは薄い帯。ほかの日付（予約と発売など）は色の点で添える

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];
const parse = (s: string) => new Date(s + 'T00:00:00');
const addDays = (s: string, n: number) => { const d = parse(s); d.setDate(d.getDate() + n); return todayStr(d); };
const addMonths = (s: string, n: number) => { const d = parse(s); d.setDate(1); d.setMonth(d.getMonth() + n); return todayStr(d); };
const dayColor = (dow: number) => (dow === 0 ? 'var(--cal-sunday-color)' : dow === 6 ? 'var(--cal-saturday-color)' : undefined);
const sorted = (a: string, b: string): [string, string] => (a <= b ? [a, b] : [b, a]);

type Props = {
  start: string | null;
  end: string | null;
  /** 変わったら、その日の月を見せる（選ぶ欄を切り替えたとき） */
  focus?: string | null;
  /** 日 → 添える点の色（ほかの欄の日付） */
  dots?: Record<string, string[]>;
  onTap: (d: string) => void;
  onRange: (a: string, b: string) => void;
  /** 見出しの右（月をめくる矢印の左）に置くもの */
  extra?: ReactNode;
};

export default function DateRangeCalendar({ start, end, focus, dots, onTap, onRange, extra }: Props) {
  const today = todayStr();
  const [month, setMonth] = useState(() => `${(focus || start || today).slice(0, 7)}-01`);
  useEffect(() => { if (focus) setMonth(`${focus.slice(0, 7)}-01`); }, [focus]);
  const flip = (n: number) => { haptic.select(); setMonth((m) => addMonths(m, n)); };

  // 長押しして引っぱっている間の期間（離すまでは見た目だけ）
  const [anchor, setAnchor] = useState<string | null>(null);
  const [preview, setPreview] = useState<[string, string] | null>(null);
  const press = useRef<{ x: number; y: number; pid: number; timer: ReturnType<typeof setTimeout> | null; moved: boolean } | null>(null);
  // 長押しのあとに来る click を、タップとして数えない
  const suppress = useRef(false);

  useEffect(() => {
    if (!anchor) return;
    const pid = press.current?.pid;
    let cur = anchor;
    const move = (e: PointerEvent) => {
      if (e.pointerId !== pid) return;
      const d = (document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-pick-day]') as HTMLElement | null)?.dataset.pickDay;
      if (d && d !== cur) { cur = d; haptic.select(); setPreview(sorted(anchor, d)); }
    };
    const finish = (e: PointerEvent, commit: boolean) => {
      if (e.pointerId !== pid) return;
      press.current = null;
      setAnchor(null);
      setPreview(null);
      if (!commit) return;
      const [a, b] = sorted(anchor, cur);
      if (a === b) onTap(a); else onRange(a, b);
    };
    const up = (e: PointerEvent) => finish(e, true);
    const cancel = (e: PointerEvent) => finish(e, false);
    // 引っぱっている間は、シートがスクロールしないようにする
    const noScroll = (e: TouchEvent) => e.preventDefault();
    window.addEventListener('pointermove', move, true);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('touchmove', noScroll, { passive: false });
    return () => {
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('touchmove', noScroll);
    };
  }, [anchor]); // eslint-disable-line react-hooks/exhaustive-deps

  const first = parse(month);
  const dim = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const cells: (string | null)[] = [...Array(first.getDay()).fill(null), ...Array.from({ length: dim }, (_, i) => addDays(month, i))];
  const [s, t] = preview ?? (start ? sorted(start, end || start) : [null, null]);

  return (
    <div className="select-none">
      <div className="flex items-center h-10">
        <span className="flex items-baseline gap-1">
          <b className="num text-[22px] font-extrabold leading-none">{first.getMonth() + 1}</b>
          <span className="text-[13px] font-bold">月</span>
          {month.slice(0, 4) !== today.slice(0, 4) && <span className="num ml-1 text-[13px] font-bold text-label-secondary">{month.slice(0, 4)}</span>}
        </span>
        <span className="ml-auto flex items-center gap-1">
          {extra}
          <button type="button" aria-label="前の月" onClick={() => flip(-1)}
            className="pressable w-9 h-9 rounded-full flex items-center justify-center"><ChevronLeft size={20} /></button>
          <button type="button" aria-label="次の月" onClick={() => flip(1)}
            className="pressable w-9 h-9 rounded-full flex items-center justify-center"><ChevronRight size={20} /></button>
        </span>
      </div>
      <div className="grid grid-cols-7">
        {WEEKDAYS.map((w, i) => <span key={w} className="text-center text-[11px] font-semibold pb-1" style={{ color: dayColor(i) ?? 'var(--label-secondary)' }}>{w}</span>)}
      </div>
      <div className="grid grid-cols-7" style={{ touchAction: 'pan-y', WebkitTouchCallout: 'none' }}
        onContextMenu={(e) => e.preventDefault()}
        onPointerDown={(e) => {
          suppress.current = false;
          if (!e.isPrimary || anchor) return;
          const d = ((e.target as HTMLElement).closest('[data-pick-day]') as HTMLElement | null)?.dataset.pickDay ?? null;
          press.current = {
            x: e.clientX, y: e.clientY, pid: e.pointerId, moved: false,
            timer: d ? setTimeout(() => {
              if (!press.current || press.current.moved) return;
              suppress.current = true;
              haptic.select();
              setAnchor(d);
              setPreview([d, d]);
            }, 350) : null,
          };
        }}
        onPointerMove={(e) => {
          const p = press.current;
          if (!p || anchor || p.moved || e.pointerId !== p.pid) return;
          if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > 8) { p.moved = true; if (p.timer) clearTimeout(p.timer); }
        }}
        onPointerUp={(e) => {
          const p = press.current;
          if (!p || anchor || e.pointerId !== p.pid) return;
          if (p.timer) clearTimeout(p.timer);
          press.current = null;
          // 横に払ったら前後の月
          const dx = e.clientX - p.x, dy = e.clientY - p.y;
          if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) { suppress.current = true; flip(dx < 0 ? 1 : -1); }
        }}
        onPointerCancel={() => { const p = press.current; if (p?.timer) clearTimeout(p.timer); if (!anchor) press.current = null; }}>
        {cells.map((d, i) => {
          if (!d) return <span key={`b${i}`} className="h-10" />;
          const dow = i % 7;
          const edge = d === s || d === t;
          const within = !!s && !!t && d > s && d < t;
          const ranged = !!s && !!t && s !== t;
          const isToday = d === today;
          return (
            <button key={d} type="button" data-pick-day={d} aria-pressed={edge || within}
              aria-label={`${first.getMonth() + 1}月${parse(d).getDate()}日`}
              onClick={() => { if (suppress.current) { suppress.current = false; return; } haptic.select(); onTap(d); }}
              className="relative h-10 flex items-center justify-center">
              {/* 期間の帯（始まりは右半分・終わりは左半分から） */}
              {ranged && (within || edge) && (
                <span aria-hidden className="absolute inset-y-[4px]" style={{
                  left: d === s ? '50%' : 0, right: d === t ? '50%' : 0, backgroundColor: 'var(--fill-secondary)',
                }} />
              )}
              <span className="num relative w-8 h-8 rounded-full flex items-center justify-center text-[15px] font-bold"
                style={edge
                  ? { backgroundColor: 'var(--label-primary)', color: 'var(--bg-primary)' }
                  : { color: isToday ? 'var(--accent-text)' : d < today ? 'var(--label-tertiary)' : dayColor(dow) ?? 'var(--label-primary)', fontWeight: isToday ? 800 : 700 }}>
                {parse(d).getDate()}
              </span>
              {(dots?.[d]?.length ?? 0) > 0 && (
                <span aria-hidden className="absolute bottom-[1px] flex gap-[2px]">
                  {dots![d].slice(0, 3).map((c, k) => <i key={k} className="w-[5px] h-[5px] rounded-full" style={{ backgroundColor: c }} />)}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

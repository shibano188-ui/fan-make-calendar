import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { haptic } from '../../lib/haptics';
import { useBackToClose } from '../../lib/backStack';
import { printCell, printRecord, hr, MODE_LABEL, type Printed } from '../../lib/print/print';
import { printItemOf, type MyRecord } from '../../lib/records';

// カレンダーのマスに貼られた1枚（2026-11-19 柴野。beta の人だけ）。過ぎた日で記録がある日は、マスがその日の1枚になる。
// 2枚以上の日は後ろの1枚を少しずらして重ねる。数は出さない（柴野「3とかついていると邪魔」）。押すとその月の記録をめくれる。
// 月を開くたびに1枚ずつ貼られ、シールと銀の紙には光が1回走る（動きを減らす設定では出さない）。

const md = (d: string) => `${+d.slice(5, 7)}/${+d.slice(8, 10)}`;
const WD = ['日', '月', '火', '水', '木', '金', '土'];

function useCell(r: MyRecord): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void printCell(printItemOf(r.event, r.work), r).then((u) => { if (alive) setUrl(u); });
    return () => { alive = false; };
  }, [r]);
  return url;
}

function Back({ r, k }: { r: MyRecord; k: number }) {
  const url = useCell(r);
  if (!url) return null;
  return <img src={url} alt="" className="absolute left-0 top-0 w-full h-full"
    style={{ transform: `translate(${(k + 1) * 3}px, ${-(k + 1) * 2}px) rotate(${(hr(r.id) - 0.5) * 12}deg)`, filter: 'drop-shadow(0 .5px .8px rgba(0,0,0,.2))' }} />;
}

/** マスの中身（1枚＋後ろに重なる分）。delay は貼られる順（ミリ秒） */
export function RecordStack({ recs, delay, h }: { recs: MyRecord[]; delay: number; h: number }) {
  const top = recs[recs.length - 1];
  const url = useCell(top);
  const backs = recs.slice(0, -1).slice(-2).reverse();
  const shine = top.mode === 'seal' || top.paper === '銀';
  const w = Math.round((h * 40) / 52);
  return (
    <span className="rec-paste relative block" style={{ width: w, height: h, rotate: `${(hr(top.id + 'r') - 0.5) * 5}deg`, animation: `recPaste .42s cubic-bezier(.2,1.3,.4,1) ${delay}ms both` }}>
      {backs.map((b, k) => <Back key={b.id} r={b} k={k} />)}
      {url && <img src={url} alt="" className="relative block w-full h-full" style={{ filter: 'drop-shadow(0 .8px 1.2px rgba(0,0,0,.28))' }} />}
      {shine && url && (
        <i className="rec-gloss absolute inset-0 rounded-[2px] pointer-events-none" aria-hidden
          style={{ background: 'linear-gradient(115deg, transparent 35%, rgba(255,255,255,.75) 50%, transparent 65%) -60px 0/200% 100% no-repeat', mixBlendMode: 'screen', animation: `recGloss 1.1s ease-out ${delay + 350}ms both` }} />
      )}
    </span>
  );
}

function Big({ r }: { r: MyRecord }) {
  const [p, setP] = useState<Printed | null>(null);
  useEffect(() => {
    let alive = true;
    void printRecord(printItemOf(r.event, r.work), r).then((x) => { if (alive) setP(x); });
    return () => { alive = false; };
  }, [r]);
  return p
    ? <img src={p.url} alt={r.event?.title ?? ''} className="block w-[176px]" style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,.2))' }} />
    : <span className="block w-[176px] h-[240px] rounded-[6px]" style={{ backgroundColor: 'var(--fill-tertiary)' }} />;
}

/** その月の記録を左右にめくる（押した日から） */
export function RecordMonthSheet({ day, recs, onClose, onOpenEvent }: { day: string; recs: MyRecord[]; onClose: () => void; onOpenEvent?: (id: string) => void }) {
  useBackToClose(true, onClose);
  const list = recs.filter((r) => r.day.slice(0, 7) === day.slice(0, 7));
  const scRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const sc = scRef.current, t = sc?.querySelector<HTMLElement>(`[data-rd="${day}"]`);
    if (sc && t) sc.scrollLeft = t.getBoundingClientRect().left - sc.getBoundingClientRect().left - 16;
  }, [day]);
  return createPortal(
    <div className="fixed inset-0 max-w-app mx-auto" style={{ zIndex: 400 }} onClick={onClose}>
      <div role="dialog" aria-label={`${+day.slice(5, 7)}月の記録`}
        className="absolute inset-x-0 bottom-0 rounded-t-[20px] shadow-float border-t border-subtle"
        style={{ backgroundColor: 'var(--bg-primary)', animation: 'slideUpIn 0.26s cubic-bezier(0.32,0.72,0,1) both', paddingBottom: 'max(16px, var(--sab))' }}
        onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-center pt-2.5 pb-1"><div className="w-9 h-[5px] rounded-full" style={{ backgroundColor: 'var(--fill-primary)' }} /></div>
        <div className="px-4 pb-1 flex items-baseline gap-2">
          <span className="text-[17px] font-extrabold">{+day.slice(5, 7)}月</span>
          <span className="print-mono text-[9px] tracking-[.12em] text-label-tertiary">左右にめくる</span>
          <button onClick={() => { haptic.select(); onClose(); }} className="pressable ml-auto text-[13px] font-semibold text-label-secondary">閉じる</button>
        </div>
        <div ref={scRef} className="flex gap-4 overflow-x-auto snap-x snap-mandatory scroll-px-4 px-4 pt-2 pb-3" style={{ scrollbarWidth: 'none' }}>
          {list.map((r) => (
            <div key={r.id} data-rd={r.day} className="snap-start flex-shrink-0 w-[176px]">
              <span className="num block text-[13px] font-extrabold mb-1.5"
                style={r.day === day ? { backgroundColor: 'var(--accent-color)', color: 'var(--accent-on)', display: 'inline-block', padding: '0 6px', borderRadius: 4 } : undefined}>
                {md(r.day)}（{WD[new Date(r.day + 'T00:00:00').getDay()]}）
              </span>
              <button className="pressable block" onClick={() => { if (r.event && onOpenEvent) { haptic.select(); onOpenEvent(r.event.id); } }} aria-label={r.event?.title ?? ''}>
                <Big r={r} />
              </button>
              <span className="print-mono block mt-1.5 text-[9px] tracking-[.08em] text-label-tertiary">No.{String(r.serial).padStart(4, '0')} · {MODE_LABEL[r.mode]}</span>
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}

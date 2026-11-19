import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import type { CalendarEvent } from '../../types';
import { getEventById } from '../../lib/api';
import { supabase } from '../../lib/supabase';
import { haptic } from '../../lib/haptics';
import { useBackToClose } from '../../lib/backStack';
import { useToast } from '../ui/Toast';
import { printRecord, MODE_LABEL, type PrintMode, type RecordKind, type Printed } from '../../lib/print/print';
import { findRecord, printMyRecord, printItemOf } from '../../lib/records';

// 記録にする（2026-11-19 柴野）。買った・行ったを押したあとに下から出る。
// 刷り方（リソ・チェキ・シール）を選んで「印字する」→ 1枚が少しずつ出てくる → 下へ引いてちぎる → カレンダーのそのマスに貼られる。
// 1つの予定に1枚。刷ってあれば、その1枚を見せて終わり（刷り直さない）。文字だけの1枚は、刷り方を選べば1回だけ置き換わる。
// 手本: CapWords（撮る→待つ間の小さな動き→シールが集まる）、(Not Boring) Camera（機械の見た目・1段ごとの振動）。
// 動きを減らす設定のときは、少しずつ出る動きをやめてふっと出す。

const MODES: PrintMode[] = ['riso', 'cheki', 'seal'];
const FEED_W = 176;
const reduced = () => { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };
const md = (d: string) => `${+d.slice(5, 7)}/${+d.slice(8, 10)}`;
const todayJst = () => new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);

type Stage = 'sample' | 'printing' | 'printed' | 'done' | 'had';

export default function PrintSheet({ eventId, event: given, kind, onClose }: { eventId: string; event?: CalendarEvent; kind: RecordKind; onClose: () => void }) {
  useBackToClose(true, onClose);
  const toast = useToast();
  const [event, setEvent] = useState<CalendarEvent | null>(given ?? null);
  const [work, setWork] = useState<string | undefined>();
  const [mode, setMode] = useState<PrintMode>('riso');
  const [stage, setStage] = useState<Stage>(() => { const r = findRecord(eventId, kind); return r && r.mode !== 'plain' ? 'had' : 'sample'; });
  const [shot, setShot] = useState<Printed | null>(null);
  const [y, setY] = useState(0);
  const [tearing, setTearing] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const feedRef = useRef<HTMLDivElement>(null);
  const restRef = useRef(0);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (!given) void getEventById(eventId).then((e) => { if (e) setEvent(e); });
  }, [eventId, given]);
  useEffect(() => {
    if (!event?.workId) return;
    void supabase.from('works').select('name').eq('id', event.workId).maybeSingle().then(({ data }) => setWork((data as { name?: string } | null)?.name));
  }, [event?.workId]);

  // 見本（白い紙・入鋏なし）か、もう刷ってある1枚
  useEffect(() => {
    if (!event || stage === 'printing' || stage === 'printed' || stage === 'done') return;
    let alive = true;
    const had = findRecord(eventId, kind);
    const it = printItemOf(event, work);
    const rec = stage === 'had' && had ? had
      : { id: 'sample', kind, day: todayJst(), serial: 0, paper: '白', punch: '丸', mode, seed: 7, sample: true };
    void printRecord(it, rec).then((p) => { if (alive) { setShot(p); setY(stage === 'had' ? -6 : 0); } });
    return () => { alive = false; };
  }, [event, work, mode, stage, eventId, kind]);

  const close = () => {
    if (closing) return;
    setClosing(true);
    const el = panelRef.current;
    if (el) { el.style.transition = 'transform 0.22s cubic-bezier(0.32,0.72,0,1)'; el.style.transform = 'translateY(110%)'; }
    setTimeout(onClose, 220);
  };

  const print = async () => {
    if (!event || stage !== 'sample') return;
    setStage('printing');
    haptic.select();
    const rec = await printMyRecord(event, kind, mode, work);
    if (!rec) { setStage('sample'); toast('刷れませんでした。通信を確かめてもう一度'); return; }
    const p = await printRecord(printItemOf(event, work), rec);
    setShot(p);
    const feedH = feedRef.current?.clientHeight ?? 300;
    const h = (FEED_W * p.h) / p.w;
    const rest = Math.min(0, feedH - h - 20);
    restRef.current = rest;
    if (reduced()) { setY(rest); setStage('printed'); return; }
    // 少しずつ出てくる（プリンターの紙送り）。3段ごとに軽く振動
    const steps = 14;
    for (let k = 1; k <= steps; k++) {
      setY(-h + ((h + rest) * k) / steps);
      if (k % 3 === 0) haptic.select();
      await new Promise((ok) => setTimeout(ok, 70));
    }
    setStage('printed');
  };

  const tear = () => {
    if (stage !== 'printed') return;
    haptic.light();
    setTearing(true);
    setStage('done');
    setTimeout(() => { haptic.success(); toast(`${md(todayJst())} のマスに貼りました`); close(); }, 520);
  };

  const plain = async () => {
    if (!event || stage !== 'sample') return;
    haptic.select();
    const rec = await printMyRecord(event, kind, 'plain', work);
    if (!rec) { toast('残せませんでした。通信を確かめてもう一度'); return; }
    toast(`${md(rec.day)} のマスに残しました（あとで刷れば絵入りに）`);
    close();
  };

  // 下へ引いてちぎる
  const drag = useRef({ y0: 0, dy: 0, on: false });
  const onDown = (e: ReactPointerEvent) => {
    if (stage !== 'printed') return;
    drag.current = { y0: e.clientY, dy: 0, on: true };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onMove = (e: ReactPointerEvent) => {
    if (!drag.current.on) return;
    drag.current.dy = Math.max(0, e.clientY - drag.current.y0);
    setY(restRef.current + Math.min(drag.current.dy, 90) * 0.8);
  };
  const onUp = () => {
    if (!drag.current.on) return;
    drag.current.on = false;
    if (drag.current.dy > 50) tear(); else setY(restRef.current);
  };

  const had = findRecord(eventId, kind);
  const label = kind === 'bought' ? '買った' : '行った';
  const hint = stage === 'had' ? 'もう刷ってあります' : stage === 'printed' ? '下へ引いてちぎる' : stage === 'printing' ? '印字中…' : stage === 'done' ? '' : '見本';
  const rot = tearing && shot ? (((shot.h * 7) % 24) - 12) : 0;

  return createPortal(
    <div className="fixed inset-0 max-w-app mx-auto" style={{ zIndex: 410, backgroundColor: 'rgba(0,0,0,.18)' }} onClick={close}>
      <div ref={panelRef} role="dialog" aria-label="記録にする"
        className="absolute inset-x-0 bottom-0 rounded-t-[20px] shadow-float border-t border-subtle"
        style={{ backgroundColor: 'var(--bg-primary)', animation: 'slideUpIn 0.26s cubic-bezier(0.32,0.72,0,1) both', paddingBottom: 'max(16px, var(--sab))' }}
        onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-center pt-2.5 pb-1"><div className="w-9 h-[5px] rounded-full" style={{ backgroundColor: 'var(--fill-primary)' }} /></div>
        <div className="px-4 pb-2 flex items-baseline gap-2">
          <span className="text-[17px] font-extrabold">記録にする</span>
          <span className="text-[12px] text-label-secondary truncate flex-1 min-w-0">{label} · {event?.title ?? ''}</span>
        </div>

        {/* 印字機。地は今の画面と同じ。赤い灯は印字中だけ点滅する */}
        <div className="mx-4 relative rounded-[16px] border border-subtle overflow-hidden" style={{ height: 'min(46vh, 360px)', backgroundColor: 'var(--bg-secondary)' }}>
          <div className="absolute left-3 top-2.5 flex items-center gap-1.5 z-[3]" aria-hidden>
            <span className="w-[7px] h-[7px] rounded-full" style={{ backgroundColor: stage === 'printing' ? '#d71921' : 'var(--fill-primary)', animation: stage === 'printing' ? 'printLed .5s steps(2) infinite' : undefined }} />
            <span className="print-mono text-[9px] tracking-[.14em] text-label-tertiary">FANHIVE PRINT</span>
          </div>
          <div className="absolute left-1/2 -translate-x-1/2 top-7 h-[10px] rounded-full z-[3]" style={{ width: FEED_W + 24, backgroundColor: 'var(--label-primary)' }} aria-hidden />
          <div ref={feedRef} className="absolute left-1/2 -translate-x-1/2 bottom-0 overflow-hidden z-[2]" style={{ top: 32, width: FEED_W }}>
            {shot && (
              <div onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
                className="absolute left-0 top-0 w-full select-none"
                style={{
                  touchAction: 'none', cursor: stage === 'printed' ? 'grab' : 'default',
                  transform: tearing ? `translateY(${restRef.current + 320}px) rotate(${rot}deg)` : `translateY(${y}px)`,
                  transition: tearing ? 'transform .45s cubic-bezier(.5,0,.7,.4), opacity .45s' : 'none',
                  opacity: tearing ? 0 : stage === 'sample' ? 0.55 : 1,
                  filter: 'drop-shadow(0 2px 3px rgba(0,0,0,.18))',
                }}>
                <img src={shot.url} alt={event?.title ?? ''} className="block w-full pointer-events-none" draggable={false} />
              </div>
            )}
          </div>
          {hint && (
            <div className="absolute right-3 bottom-3 z-[3] text-right">
              {stage === 'had' && had && <span className="print-mono block text-[9px] tracking-[.1em] text-label-tertiary">{md(had.day)} · {MODE_LABEL[had.mode]}</span>}
              <span className="block text-[12px] font-extrabold">{hint}</span>
            </div>
          )}
        </div>

        {stage === 'had' ? (
          <div className="px-4 pt-3">
            <button onClick={() => { haptic.select(); close(); }} className="pressable w-full h-12 rounded-full text-[15px] font-bold" style={{ backgroundColor: 'var(--fill-tertiary)' }}>閉じる</button>
            <p className="text-[11px] text-label-tertiary text-center mt-2">1つの予定に1枚です</p>
          </div>
        ) : (
          <div className="px-4 pt-3 flex flex-col gap-2">
            <div className="grid grid-cols-3 gap-1 p-1 rounded-full" style={{ backgroundColor: 'var(--fill-tertiary)' }} role="radiogroup" aria-label="刷り方">
              {MODES.map((m) => (
                <button key={m} role="radio" aria-checked={mode === m} disabled={stage !== 'sample'}
                  onClick={() => { haptic.select(); setMode(m); }}
                  className="pressable h-8 rounded-full text-[13px] font-bold"
                  style={mode === m ? { backgroundColor: 'var(--bg-primary)', boxShadow: '0 1px 2px rgba(0,0,0,.12)' } : { color: 'var(--label-secondary)' }}>
                  {MODE_LABEL[m]}
                </button>
              ))}
            </div>
            <button onClick={() => (stage === 'printed' ? tear() : void print())} disabled={!event || stage === 'printing' || stage === 'done'}
              className="pressable w-full h-12 rounded-full text-[15px] font-extrabold disabled:opacity-50"
              style={{ backgroundColor: 'var(--accent-color)', color: 'var(--accent-on)' }}>
              {stage === 'printed' ? 'ちぎる' : stage === 'printing' ? '印字中…' : '印字する'}
            </button>
            {stage === 'sample' && !had && (
              <button onClick={() => void plain()} className="pressable h-9 text-[12px] font-semibold text-label-secondary">絵を入れずに、文字だけで残す</button>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

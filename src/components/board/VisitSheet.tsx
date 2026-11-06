import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import type { CalendarEvent, EventVisit } from '../../types';
import Sheet from '../ui/Sheet';
import { todayStr } from '../../design/tokens';
import { daysBetween } from '../../lib/relativeDay';
import { haptic } from '../../lib/haptics';
import { stripWorkName } from '../../lib/stripWorkName';
import { addEventVisit, removeEventVisit } from '../../lib/api';
import { useToast } from '../ui/Toast';
import { MARKS } from './boardModel';

// ボードのイベントの行を押すと出る「行く日を選ぶ」シート（2026-11-06 柴野: 試作の選び方にしたい）。
// 会期のカレンダーで日付をタップするたびに、行く日を足す・外す（何日でも）。月は横にめくる。
// DB はこれまでどおり event_visits（start〜end の期間）。ここでは1日ずつ足し、期間の途中の日を外すときは前後に分ける

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];
const parse = (s: string) => new Date(s + 'T00:00:00');
const addDays = (s: string, n: number) => { const d = parse(s); d.setDate(d.getDate() + n); return todayStr(d); };
const md = (s: string) => `${Number(s.slice(5, 7))}/${Number(s.slice(8, 10))}`;
/** 長く続くイベント（常設など）で月が並びすぎないよう、めくれるのは半年まで */
const MAX_MONTHS = 6;

type SheetProps = {
  event: CalendarEvent;
  userId: string;
  /** ほかの予定の締切がある日（赤い点を付ける） */
  deadlineDays: Set<string>;
  onChange: (visits: EventVisit[]) => void;
  onOpenDetail: () => void;
  onClose: () => void;
};

export default function VisitSheet({ event: e, userId, deadlineDays, onChange, onOpenDetail, onClose }: SheetProps) {
  return (
    <Sheet onClose={onClose}
      title={<span className="flex flex-col min-w-0">
        <b className="text-[15px] truncate">{stripWorkName(e.title, e.workName)}</b>
        <span className="text-[11px] text-label-secondary truncate">{e.workName}・会期 {e.date ? md(e.date) : ''}{e.endDate ? `〜${md(e.endDate)}` : ''}</span>
      </span>}>
      <div className="px-4 pb-6 flex flex-col gap-3">
        <VisitPicker eventId={e.id} date={e.date} endDate={e.endDate} visits={e.visits ?? []} userId={userId} deadlineDays={deadlineDays} onChange={onChange} />
        <button className="pressable w-full py-2.5 rounded-[12px] text-[13px] font-semibold" style={{ backgroundColor: 'var(--fill-tertiary)' }}
          onClick={() => { haptic.select(); onOpenDetail(); }}>
          詳細を見る
        </button>
      </div>
    </Sheet>
  );
}

type PickerProps = {
  eventId: string;
  date?: string | null;
  endDate?: string | null;
  visits: EventVisit[];
  userId: string;
  /** ほかの予定の締切がある日（赤い点を付ける）。詳細画面では渡さない */
  deadlineDays?: Set<string>;
  onChange: (visits: EventVisit[]) => void;
  /** 選んだ日の一覧の下に、カレンダーをたたむ・開くボタンを出す（詳細画面。最初はたたんでおく） */
  foldable?: boolean;
};

/** 行く日を選ぶ。会期のカレンダーで日付をタップするたびに足す・外す（ボードのシートと詳細画面で共通） */
export function VisitPicker({ eventId, date, endDate, visits, userId, deadlineDays, onChange, foldable }: PickerProps) {
  const today = todayStr();
  const toast = useToast();
  const from = date && date > today ? date : today;
  const to = endDate ?? date ?? today;
  const [open, setOpen] = useState(!foldable);
  const chosen = useMemo(() => {
    const s = new Set<string>();
    for (const v of visits) for (let d = v.start; d <= v.end; d = addDays(d, 1)) s.add(d);
    return s;
  }, [visits]);
  const chosenList = [...chosen].filter((d) => d >= today).sort();

  // 会期の月（今日より前は出さない）
  const months = useMemo(() => {
    const out: string[] = [];
    if (from > to) return out;
    let m = `${from.slice(0, 7)}-01`;
    while (m.slice(0, 7) <= to.slice(0, 7) && out.length < MAX_MONTHS) {
      out.push(m);
      const d = parse(m); d.setMonth(d.getMonth() + 1); m = todayStr(d);
    }
    return out;
  }, [from, to]);

  // 横にめくるページ。最初は選んである最初の日の月
  const pagesRef = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(0);
  useEffect(() => {
    const el = pagesRef.current;
    if (!el) return;
    const first = chosenList[0];
    const i = first ? Math.max(0, months.findIndex((m) => m.slice(0, 7) === first.slice(0, 7))) : 0;
    el.scrollLeft = i * el.clientWidth;
    setPage(i);
  }, [months.length, open]); // eslint-disable-line react-hooks/exhaustive-deps
  const goPage = (i: number) => {
    const el = pagesRef.current;
    if (!el) return;
    haptic.select();
    el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' });
  };

  // 押した日を足す・外す。保存が終わるまで次を受け付けない（同じ日の二重登録を防ぐ）
  const [saving, setSaving] = useState(false);
  const toggle = async (d: string) => {
    if (saving) return;
    haptic.select();
    setSaving(true);
    try {
      const hit = visits.find((v) => v.start <= d && d <= v.end);
      if (!hit) {
        const v = await addEventVisit(eventId, userId, d, d);
        if (!v) throw new Error('add');
        onChange([...visits, v].sort((a, b) => a.start.localeCompare(b.start)));
        toast(`${md(d)}（${WEEKDAYS[parse(d).getDay()]}）を行く日にしました`, 'success');
      } else {
        // 期間の途中の日なら、外した日の前後を残す
        await removeEventVisit(hit.id);
        const rest = visits.filter((v) => v.id !== hit.id);
        const parts: [string, string][] = [];
        if (hit.start < d) parts.push([hit.start, addDays(d, -1)]);
        if (d < hit.end) parts.push([addDays(d, 1), hit.end]);
        for (const [s, t] of parts) {
          const v = await addEventVisit(eventId, userId, s, t);
          if (v) rest.push(v);
        }
        onChange(rest.sort((a, b) => a.start.localeCompare(b.start)));
        toast(`${md(d)}（${WEEKDAYS[parse(d).getDay()]}）を行く日から外しました`);
      }
    } catch {
      toast('保存できませんでした。通信を確かめてください', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline gap-2 pt-1">
        <span className="text-[13px] font-bold">行く日</span>
        <span className="text-[11px] text-label-secondary">{chosenList.length ? `${chosenList.length}日 選んでいます` : open ? 'タップで選ぶ（何日でも）' : '選んだ日だけカレンダーに出ます'}</span>
        {foldable && months.length > 0 && (
          <button className="pressable ml-auto flex items-center gap-0.5 text-[12px] font-semibold self-center" aria-expanded={open}
            onClick={() => { haptic.select(); setOpen((v) => !v); }}>
            {open ? 'たたむ' : chosenList.length ? '変える' : '選ぶ'}
            <ChevronDown size={16} className="text-label-secondary" style={{ transform: open ? 'rotate(180deg)' : undefined, transition: 'transform .25s' }} />
          </button>
        )}
      </div>
      {chosenList.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {chosenList.map((d) => {
            const n = daysBetween(today, d);
            return (
              <span key={d} className="text-[12px] font-semibold rounded-[8px] px-2 py-0.5" style={{ color: '#a07800', boxShadow: `inset 0 0 0 1px ${MARKS['行'].color}` }}>
                {md(d)}（{WEEKDAYS[parse(d).getDay()]}）・{n === 0 ? '今日' : `あと${n}日`}
              </span>
            );
          })}
        </div>
      )}

      {months.length === 0 ? (
        <p className="text-[13px] text-label-secondary py-2">会期は終わっています。</p>
      ) : open && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center">
            <span className="text-[15px] font-bold">{Number(months[page]?.slice(5, 7))}月</span>
            {months.length > 1 && (
              <span className="ml-auto flex gap-1.5">
                <button className="pressable w-9 h-8 rounded-[10px] flex items-center justify-center disabled:opacity-30" style={{ boxShadow: 'inset 0 0 0 0.5px var(--separator)' }}
                  aria-label="前の月" disabled={page <= 0} onClick={() => goPage(page - 1)}><ChevronLeft size={18} /></button>
                <button className="pressable w-9 h-8 rounded-[10px] flex items-center justify-center disabled:opacity-30" style={{ boxShadow: 'inset 0 0 0 0.5px var(--separator)' }}
                  aria-label="次の月" disabled={page >= months.length - 1} onClick={() => goPage(page + 1)}><ChevronRight size={18} /></button>
              </span>
            )}
          </div>
          <div ref={pagesRef} className="flex overflow-x-auto snap-x snap-mandatory no-scrollbar" style={{ overscrollBehaviorX: 'contain' }}
            onScroll={(ev) => { const el = ev.currentTarget; setPage(Math.round(el.scrollLeft / Math.max(1, el.clientWidth))); }}>
            {months.map((m) => <MonthGrid key={m} month={m} from={from} to={to} today={today} chosen={chosen} deadlineDays={deadlineDays} onPick={toggle} />)}
          </div>
          {months.length > 1 && (
            <div className="flex justify-center gap-1.5">
              {months.map((m, i) => <i key={m} className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: i === page ? 'var(--label-primary)' : 'var(--separator)' }} />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MonthGrid({ month, from, to, today, chosen, deadlineDays, onPick }: {
  month: string; from: string; to: string; today: string; chosen: Set<string>; deadlineDays?: Set<string>; onPick: (d: string) => void;
}) {
  const first = parse(month);
  const dim = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const cells: (string | null)[] = [...Array(first.getDay()).fill(null), ...Array.from({ length: dim }, (_, i) => addDays(month, i))];
  return (
    <div className="flex-[0_0_100%] snap-start min-w-0 grid grid-cols-7 gap-0.5 text-center">
      {WEEKDAYS.map((w) => <span key={w} className="text-[10px] text-label-secondary pb-0.5">{w}</span>)}
      {cells.map((d, i) => {
        if (!d) return <span key={`b${i}`} />;
        const ok = d >= from && d <= to;
        const on = chosen.has(d);
        if (!ok) return <span key={d} className="h-9 flex items-center justify-center text-[13px] tabular-nums" style={{ color: 'var(--label-quaternary, var(--separator))' }}>{parse(d).getDate()}</span>;
        return (
          <button key={d} type="button" aria-pressed={on} aria-label={`${md(d)}${on ? '・行く日' : ''}`} onClick={() => onPick(d)}
            className="pressable relative h-9 rounded-[10px] flex items-center justify-center text-[13px] tabular-nums"
            style={{
              backgroundColor: on ? MARKS['行'].color : 'var(--fill-tertiary)',
              color: on ? MARKS['行'].ink : 'var(--label-primary)',
              fontWeight: on || d === today ? 700 : 500,
              textDecoration: d === today ? 'underline' : undefined, textUnderlineOffset: 3,
            }}>
            {parse(d).getDate()}
            {deadlineDays?.has(d) && <span className="absolute bottom-[4px] w-1 h-1 rounded-full" style={{ backgroundColor: MARKS['〆'].color }} />}
          </button>
        );
      })}
    </div>
  );
}

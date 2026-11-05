import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import type { CalendarEvent, EventVisit } from '../../types';
import Sheet from '../ui/Sheet';
import OptImg from '../ui/OptImg';
import { todayStr, deriveItemType } from '../../design/tokens';
import { daysBetween } from '../../lib/relativeDay';
import { haptic } from '../../lib/haptics';
import { parseImageUrls } from '../../lib/constants';
import { stripWorkName } from '../../lib/stripWorkName';
import { buildWorkColorMap } from '../../lib/workColors';
import { MARKS, buildDays, longEvents, undatedEvents, type Mark, type Moment } from './boardModel';
import WorkIconSheet, { type BoardWork } from './WorkIconSheet';
import { useWorkIcons, WorkDot } from './WorkDot';
import VisitSheet from './VisitSheet';

// カレンダーの「ボード」表示（2026-11-06 柴野と試作 → 表示の切り替えに「ボード」として足した）。
// 上に月のカレンダー（下へ進むと今の週だけにたたむ）、下に「あと○日」で並べた日ごとの予定。
// 作品は点で見せ、作品の画像を選んでいればドット絵の点にする。試作: claude.ai の「推し予定ボード」

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];
const parse = (s: string) => new Date(s + 'T00:00:00');
const addDays = (s: string, n: number) => { const d = parse(s); d.setDate(d.getDate() + n); return todayStr(d); };
const addMonths = (s: string, n: number) => { const d = parse(s); d.setDate(1); d.setMonth(d.getMonth() + n); return todayStr(d); };
const md = (s: string) => `${Number(s.slice(5, 7))}/${Number(s.slice(8, 10))}`;
const mdy = (s: string, today: string) => (s.slice(0, 4) === today.slice(0, 4) ? md(s) : `${s.slice(0, 4)}/${md(s)}`);
const dowOf = (s: string) => parse(s).getDay();
const dayColor = (dow: number) => (dow === 0 ? 'var(--cal-sunday-color)' : dow === 6 ? 'var(--cal-saturday-color)' : undefined);

type Props = {
  events: CalendarEvent[];
  /** 表示中の月（月表示と共有。上の「今日」ボタン・見出しのため親が持つ） */
  anchor: string;
  setAnchor: (s: string) => void;
  /** 作品ごとに選んだ画像（workImages.ts） */
  workImages: Record<string, string>;
  /** 上部バーの高さ。カレンダーをその下に貼り付ける */
  stickyTop: number;
  onOpen: (e: CalendarEvent) => void;
  /** 左へスワイプしたとき（いいねを外す＝カレンダーから外す。元に戻すは親がトーストで出す） */
  onRemove: (e: CalendarEvent) => void;
  /** 行く日を選ぶシートで使う。ログイン前は出さない */
  userId?: string;
  /** 行く日を選び直したとき（親の予定の一覧に映す） */
  onVisits: (e: CalendarEvent, visits: EventVisit[]) => void;
};

type SheetState = { kind: 'day'; day: string } | { kind: 'undated' } | { kind: 'icons' } | { kind: 'visit'; id: string } | null;

export default function SavedBoard({ events, anchor, setAnchor, workImages, stickyTop, onOpen, onRemove, userId, onVisits }: Props) {
  const today = todayStr();
  const [onlyMarks, setOnlyMarks] = useState<Set<Mark>>(new Set());
  const [evOpen, setEvOpen] = useState(false);
  const [sheet, setSheet] = useState<SheetState>(null);

  const allDays = useMemo(() => buildDays(events), [events]);
  // 「これから7日」で選んだ種類だけにする（数は選ぶ前のまま出す）
  const days = useMemo(() => {
    if (!onlyMarks.size) return allDays;
    const m = new Map<string, Moment[]>();
    for (const [d, list] of allDays) { const l = list.filter((x) => onlyMarks.has(x.mark)); if (l.length) m.set(d, l); }
    return m;
  }, [allDays, onlyMarks]);
  const future = useMemo(() => [...days.keys()].filter((d) => d > today).sort(), [days, today]);
  const ganttList = useMemo(() => (onlyMarks.size && !onlyMarks.has('イ') && !onlyMarks.has('行') ? [] : longEvents(events, today)), [events, today, onlyMarks]);
  const undated = useMemo(() => (onlyMarks.size ? [] : undatedEvents(events)), [events, onlyMarks]);

  // 作品の色と、点に使う画像（ドット絵）
  const works: BoardWork[] = useMemo(() => {
    const m = new Map<string, BoardWork>();
    for (const e of events) if (e.workId && !m.has(e.workId)) m.set(e.workId, { id: e.workId, name: e.workName || '作品' });
    return [...m.values()];
  }, [events]);
  const colors = useMemo(() => buildWorkColorMap(works), [works]);
  const icons = useWorkIcons(workImages);
  const dot = (workId: string | undefined, size: number) => <WorkDot workId={workId} size={size} color={workId ? colors.get(workId) : undefined} icons={icons} />;

  // ─ カレンダー（下へ進むと今の週だけにたたむ） ─
  const calRef = useRef<HTMLDivElement>(null);
  const [folded, setFolded] = useState(false);
  const [active, setActive] = useState(today);
  const openedAt = useRef<number | null>(null);
  // 下の一覧で今見ている日の月に、上のカレンダーを合わせる（12月の予定まで来たら12月を出す）
  const anchorRef = useRef(anchor);
  anchorRef.current = anchor;
  const activeRef = useRef(today);
  useEffect(() => {
    let last = window.scrollY, raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const y = window.scrollY;
        // 開くのは上へ戻って一番上に来たときだけ。たたむとページが縮んで位置が押し戻されることがあり、
        // それで開くと「たたむ→縮む→開く」を繰り返して、スクロールが跳ね返されていた（2026-11-06）
        if (y < 8 && y < last) { setFolded(false); openedAt.current = null; }
        else if (y > last + 4 && y > 40 && (openedAt.current === null || y - openedAt.current > 160)) { setFolded(true); openedAt.current = null; }
        last = y;
        // 今見ている日（カレンダーの下端より上に来た最後の日）
        const line = stickyTop + (calRef.current?.offsetHeight ?? 0) + 12;
        let cur = today;
        document.querySelectorAll<HTMLElement>('[data-board-day]').forEach((el) => { if (el.getBoundingClientRect().top <= line) cur = el.dataset.boardDay!; });
        setActive(cur);
        if (cur !== activeRef.current) {
          activeRef.current = cur;
          if (cur.slice(0, 7) !== anchorRef.current.slice(0, 7)) setAnchor(cur);
        }
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => { window.removeEventListener('scroll', onScroll); cancelAnimationFrame(raf); };
  }, [stickyTop, today, setAnchor]);
  // カレンダーの高さが変わったとき、ブラウザ（Android の Chrome など）がスクロール位置を勝手に補正しないようにする。
  // 補正されると、たたんだ瞬間に一番上まで押し戻されて、また開いてしまう
  useEffect(() => {
    const els = [document.documentElement, document.body];
    const prev = els.map((el) => el.style.overflowAnchor);
    els.forEach((el) => { el.style.overflowAnchor = 'none'; });
    return () => els.forEach((el, i) => { el.style.overflowAnchor = prev[i]; });
  }, []);

  const monthStart = `${anchor.slice(0, 7)}-01`;
  const weeks = useMemo(() => {
    const first = parse(monthStart);
    const start = addDays(monthStart, -first.getDay());
    const dim = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    return Array.from({ length: Math.ceil((first.getDay() + dim) / 7) }, (_, i) => addDays(start, i * 7));
  }, [monthStart]);
  // たたんだときに残す週: 今見ている日の週（この月に無ければ最初の週）
  const curWeek = weeks.find((w) => active >= w && active <= addDays(w, 6)) ?? weeks[0];
  const visitDays = useMemo(() => {
    const s = new Set<string>();
    for (const list of allDays.values()) for (const m of list) if (m.mark === '行') s.add(m.day);
    return s;
  }, [allDays]);

  const jump = (day: string) => {
    haptic.select();
    const row = document.querySelector<HTMLElement>(`[data-board-day="${day}"]`);
    if (!row || day < today) {
      if (days.get(day)?.length) setSheet({ kind: 'day', day });
      return;
    }
    // 下へ進むとたたむので、たたんだ後の高さで位置を決める。
    // たたむと下の一覧がその分だけ上に詰まるので、行の位置からも引く（前は詰まる分だけ行き過ぎていた）
    const cal = calRef.current;
    const hidden = cal && !folded ? [...cal.querySelectorAll<HTMLElement>('[data-week]')].filter((w) => w.dataset.week !== weekOf(day, weeks)).reduce((s, w) => s + w.offsetHeight, 0) : 0;
    const legend = !folded ? cal?.querySelector<HTMLElement>('[data-legend]')?.offsetHeight ?? 0 : 0;
    const shrink = hidden + legend;
    const calH = (cal?.offsetHeight ?? 0) - shrink;
    // たたんだ週（今見ている日の週）を、押した日の週にする
    activeRef.current = day;
    setActive(day);
    setFolded(true);
    openedAt.current = null;
    window.scrollTo({ top: Math.max(8, window.scrollY + row.getBoundingClientRect().top - shrink - stickyTop - calH - 6), behavior: 'smooth' });
  };

  // カレンダーの上で: 横に払うと前後の月、上下に引くとたたむ・開く
  const touch = useRef<{ x: number; y: number } | null>(null);
  const calTouch = {
    onTouchStart: (e: React.TouchEvent) => { touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; },
    onTouchEnd: (e: React.TouchEvent) => {
      if (!touch.current) return;
      const dx = e.changedTouches[0].clientX - touch.current.x, dy = e.changedTouches[0].clientY - touch.current.y;
      touch.current = null;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) { haptic.select(); setAnchor(addMonths(anchor, dx < 0 ? 1 : -1)); return; }
      if (Math.abs(dy) > 28 && Math.abs(dy) > Math.abs(dx)) { haptic.select(); setFolded(dy < 0); openedAt.current = dy > 0 ? window.scrollY : null; }
    },
  };

  // ─ これから7日 ─
  const week7 = useMemo(() => {
    const c: Partial<Record<Mark, number>> = {};
    for (const [d, list] of allDays) if (d >= today && daysBetween(today, d) <= 6) for (const m of list) c[m.mark] = (c[m.mark] ?? 0) + 1;
    return c;
  }, [allDays, today]);
  const toggleMark = (k: Mark) => { haptic.select(); setOnlyMarks((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; }); };

  const todayList = days.get(today) ?? [];
  const sheetList = sheet?.kind === 'day' ? days.get(sheet.day) ?? allDays.get(sheet.day) ?? [] : [];
  const goingEvents = ganttList.filter((e) => (e.visits ?? []).some((v) => v.end >= today));
  // たたんでいるときに出すイベント。行く日を選んだものがあればそれ、無ければ近い順に3件（何があるかは見えるように）
  const evPreview = goingEvents.length ? goingEvents : ganttList.slice(0, 3);
  const evRest = ganttList.length - evPreview.length;
  // イベントの行を押したら、行く日を選ぶシート（ログイン前は詳細へ）
  const pickVisit = (e: CalendarEvent) => (userId ? setSheet({ kind: 'visit', id: e.id }) : onOpen(e));
  const visitEvent = sheet?.kind === 'visit' ? events.find((e) => e.id === sheet.id) : undefined;
  const deadlineDays = useMemo(() => {
    const s = new Set<string>();
    for (const [d, list] of allDays) if (list.some((m) => m.mark === '〆')) s.add(d);
    return s;
  }, [allDays]);

  return (
    // 予定が少なくても、たたんだ後にまだ下へ進めるだけの高さを持たせる。
    // 足りないと、たたんだ瞬間にページが縮んで一番上に戻り、また開いてしまう
    <div className="pb-6" style={{ minHeight: '100dvh' }}>
      {/* ── 月のカレンダー ── */}
      <div ref={calRef} {...calTouch} className="sticky z-10 -mx-3 px-3 pb-1"
        // 上部バーは下端をぼかしているので、地の色を上へ伸ばして、後ろを通る一覧が透けないようにする
        style={{ top: stickyTop, backgroundColor: 'var(--bg-primary)', borderBottom: '0.5px solid var(--separator)', boxShadow: '0 -24px 0 var(--bg-primary)' }}>
        <div className="grid grid-cols-7 pt-1">
          {WEEKDAYS.map((w, i) => (
            <div key={w} className="text-center text-[11px] font-semibold pb-1" style={{ color: dayColor(i) ?? 'var(--label-secondary)' }}>{w}</div>
          ))}
        </div>
        {weeks.map((w) => {
          const hide = folded && w !== curWeek;
          return (
            <div key={w} data-week={w} className="grid grid-cols-7 overflow-hidden"
              style={{ maxHeight: hide ? 0 : 54, opacity: hide ? 0 : 1, transition: 'max-height .28s ease, opacity .2s ease' }}>
              {Array.from({ length: 7 }, (_, i) => {
                const d = addDays(w, i);
                if (d.slice(0, 7) !== anchor.slice(0, 7)) return <span key={d} />;
                const list = (days.get(d) ?? []).filter((m) => m.mark !== '行');
                const ws = [...new Set(list.map((m) => m.e.workId ?? ''))];
                const deadline = list.some((m) => m.mark === '〆');
                const isToday = d === today, past = d < today;
                return (
                  <button key={d} type="button" onClick={() => jump(d)} aria-label={`${md(d)}${list.length ? `・予定${list.length}件` : ''}${deadline ? '・締切あり' : ''}`}
                    className="pressable relative h-[54px] flex flex-col items-center gap-[3px] pt-[3px] rounded-[10px]"
                    style={{ backgroundColor: d === active && !isToday ? 'var(--fill-tertiary)' : undefined }}>
                    <span className="w-7 h-7 rounded-full flex items-center justify-center text-[14px] font-semibold tabular-nums"
                      style={isToday ? { backgroundColor: 'var(--accent-color)', color: 'var(--accent-on)', fontWeight: 700 }
                        : { color: past ? 'var(--label-tertiary)' : dayColor(i) ?? 'var(--label-primary)', boxShadow: visitDays.has(d) ? `inset 0 0 0 2px ${MARKS['行'].color}` : undefined }}>
                      {parse(d).getDate()}
                    </span>
                    <span className="flex items-center justify-center h-5" style={{ opacity: past ? 0.35 : 1 }}>
                      {ws.slice(0, 3).map((id, k) => <span key={id || k} style={{ marginLeft: k ? -3 : 0 }}>{dot(id || undefined, list.length >= 6 ? 20 : 18)}</span>)}
                      {ws.length > 3 && <span className="text-[10px] font-bold text-label-secondary ml-px">+</span>}
                    </span>
                    {deadline && (
                      <span className="absolute top-0 text-[11px] font-extrabold leading-none px-[2px] rounded-[4px]"
                        style={{ left: 'calc(50% + 9px)', color: MARKS['〆'].color, backgroundColor: 'var(--bg-primary)', opacity: past ? 0.35 : 1 }}>〆</span>
                    )}
                  </button>
                );
              })}
            </div>
          );
        })}
        <div data-legend className="flex items-center gap-x-3 gap-y-1 flex-wrap text-[11px] text-label-secondary overflow-hidden"
          style={{ maxHeight: folded ? 0 : 48, opacity: folded ? 0 : 1, paddingTop: folded ? 0 : 4, transition: 'max-height .28s ease, opacity .2s' }}>
          <span className="flex items-center gap-1">
            <span className="flex">{works.slice(0, 3).map((w, k) => <span key={w.id} style={{ marginLeft: k ? -3 : 0 }}>{dot(w.id, 14)}</span>)}</span>作品
          </span>
          <span className="flex items-center gap-1"><b style={{ color: MARKS['〆'].color }}>〆</b>締切がある日</span>
          <span className="flex items-center gap-1"><i className="w-[10px] h-[10px] rounded-full" style={{ boxShadow: `inset 0 0 0 2px ${MARKS['行'].color}` }} />行く日</span>
          {works.length > 0 && (
            <button className="pressable ml-auto font-semibold text-label-primary" onClick={() => { haptic.select(); setSheet({ kind: 'icons' }); }}>画像を変える ›</button>
          )}
        </div>
        <button type="button" aria-label={folded ? 'カレンダーを開く' : 'カレンダーをたたむ'} className="w-full h-5 flex items-center justify-center"
          onClick={() => { haptic.select(); setFolded((f) => !f); openedAt.current = folded ? window.scrollY : null; }}>
          <span className="w-9 h-1 rounded-full" style={{ backgroundColor: 'var(--fill-secondary)' }} />
        </button>
      </div>

      {/* ── これから7日 ── */}
      <div className="flex items-baseline gap-1.5 pt-3 pb-1.5 text-[12px] font-bold">
        これから7日<span className="text-[11px] font-normal text-label-secondary">{md(today)}〜{md(addDays(today, 6))}</span>
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        {(['〆', '発', '受', '行'] as Mark[]).map((k) => {
          const on = onlyMarks.has(k);
          return (
            <button key={k} onClick={() => toggleMark(k)} aria-pressed={on}
              className="pressable rounded-[12px] py-2 flex flex-col items-center gap-0.5 transition-opacity"
              style={{ backgroundColor: 'var(--bg-secondary)', boxShadow: on ? 'inset 0 0 0 2px var(--label-primary)' : 'inset 0 0 0 0.5px var(--separator)', opacity: onlyMarks.size && !on ? 0.5 : 1 }}>
              <b className="text-[24px] leading-none tabular-nums" style={{ color: k === '行' ? '#a07800' : MARKS[k].color }}>{week7[k] ?? 0}</b>
              <span className="text-[11px] text-label-secondary">{MARKS[k].long}</span>
            </button>
          );
        })}
      </div>

      {/* ── 今日 ── */}
      <DayRow day={today} today={today}>
        {ganttList.length > 0 && (
          <section className="rounded-[14px] overflow-hidden" style={{ backgroundColor: 'var(--bg-secondary)', boxShadow: 'inset 0 0 0 0.5px var(--separator)' }}>
            <button className="pressable w-full flex items-baseline gap-2 px-3 pt-2.5 pb-1.5 text-left" aria-expanded={evOpen}
              onClick={() => { if (!evRest && !evOpen) return; haptic.select(); setEvOpen((v) => !v); }}>
              <span className="text-[13px] font-bold">イベント</span>
              <span className="text-[11px] text-label-secondary">{ganttList.length}件・行く日 {goingEvents.reduce((n, e) => n + (e.visits ?? []).filter((v) => v.end >= today).length, 0)}日</span>
              {(evRest > 0 || evOpen) && <ChevronDown size={16} className="ml-auto self-center text-label-secondary" style={{ transform: evOpen ? 'rotate(180deg)' : undefined, transition: 'transform .25s' }} />}
            </button>
            {evOpen ? (
              <>
                <Gantt list={ganttList} today={today} colors={colors} dot={dot} onOpen={pickVisit} />
                <FootButton onClick={() => setEvOpen(false)}>たたむ</FootButton>
              </>
            ) : (
              <>
                <Gantt list={evPreview} today={today} colors={colors} dot={dot} onOpen={pickVisit} />
                {evRest > 0 && (
                  <FootButton onClick={() => setEvOpen(true)}>{goingEvents.length ? `ほかのイベント ${evRest}件を見る` : `イベント ${ganttList.length}件をすべて見る`}</FootButton>
                )}
              </>
            )}
          </section>
        )}
        {todayList.length > 0 && <Group list={todayList} today={today} dot={dot} onOpen={onOpen} onRemove={onRemove} onAll={() => setSheet({ kind: 'day', day: today })} />}
      </DayRow>

      {/* ── これからの日 ── */}
      {future.map((d, i) => (
        <DayRow key={d} day={d} today={today} last={i === future.length - 1 && undated.length === 0}>
          <Group list={days.get(d)!} today={today} dot={dot} onOpen={onOpen} onRemove={onRemove} onAll={() => setSheet({ kind: 'day', day: d })} />
        </DayRow>
      ))}

      {/* ── 日付未定 ── */}
      {undated.length > 0 && (
        <DayRow day={null} today={today} last>
          <section className="rounded-[14px] overflow-hidden" style={{ backgroundColor: 'var(--bg-secondary)', boxShadow: 'inset 0 0 0 0.5px var(--separator)' }}>
            <div className="flex items-baseline gap-2 px-3 pt-2.5 pb-1">
              <span className="text-[13px] font-bold">日付未定</span><span className="text-[11px] text-label-secondary">決まるとその日に入ります</span>
              <span className="ml-auto text-[11px] text-label-secondary">{undated.length}件</span>
            </div>
            <Thumbs list={undated.map((e) => ({ e }))} dot={dot} onOpen={onOpen} more={() => setSheet({ kind: 'undated' })} />
            <FootButton onClick={() => setSheet({ kind: 'undated' })}>一覧で見る</FootButton>
          </section>
        </DayRow>
      )}

      {!future.length && !todayList.length && !ganttList.length && !undated.length && (
        <p className="text-center text-label-secondary text-[13px] py-14">
          {onlyMarks.size ? 'この種類の予定はありません' : <>これからの予定はありません<br />気になるグッズ・イベントに ♡ を押すとここに並びます</>}
        </p>
      )}

      {/* その日の全部・日付未定の一覧（外をタップするか下へ引くと閉じる） */}
      <Sheet open={sheet?.kind === 'day' || sheet?.kind === 'undated'} onClose={() => setSheet(null)}
        title={sheet?.kind === 'day'
          ? <span className="flex items-baseline gap-2"><b className="text-[16px]" style={{ color: dayColor(dowOf(sheet.day)) }}>{md(sheet.day)}（{WEEKDAYS[dowOf(sheet.day)]}）</b><span className="text-[12px] text-label-secondary">{relLabel(sheet.day, today)}・{sheetList.length}件</span></span>
          : <b className="text-[16px]">日付未定 {undated.length}件</b>}>
        <div className="pb-6">
          {sheet?.kind === 'day' && sheetList.map((m) => <ItemRow key={`${m.e.id}-${m.mark}-${m.label ?? ''}`} m={m} today={today} dot={dot} onOpen={onOpen} onRemove={onRemove} />)}
          {sheet?.kind === 'undated' && undated.map((e) => <ItemRow key={e.id} m={{ day: '', mark: '発', e }} hideMark today={today} dot={dot} onOpen={onOpen} onRemove={onRemove} />)}
        </div>
      </Sheet>
      {sheet?.kind === 'icons' && <WorkIconSheet works={works} colors={colors} icons={icons} onClose={() => setSheet(null)} />}
      {visitEvent && userId && (
        <VisitSheet event={visitEvent} userId={userId} deadlineDays={deadlineDays}
          onChange={(v) => onVisits(visitEvent, v)}
          onOpenDetail={() => { setSheet(null); onOpen(visitEvent); }}
          onClose={() => setSheet(null)} />
      )}
    </div>
  );
}

function weekOf(day: string, weeks: string[]): string | undefined {
  return weeks.find((w) => day >= w && day <= addDays(w, 6));
}

function relLabel(day: string, today: string): string {
  const n = daysBetween(today, day);
  return n === 0 ? '今日' : n > 0 ? `あと${n}日` : `${-n}日前`;
}

// ─ 日ごとの行 ─

/** 左に「あと○日」（大きく）と日付、縦の線でつなぎ、右に中身 */
function DayRow({ day, today, last, children }: { day: string | null; today: string; last?: boolean; children: ReactNode }) {
  const isToday = day === today;
  const n = day ? daysBetween(today, day) : 0;
  const soon = day && !isToday && n <= 3;
  const dow = day ? dowOf(day) : 0;
  return (
    <div data-board-day={day ?? undefined} className="grid" style={{ gridTemplateColumns: '60px 16px minmax(0,1fr)' }}>
      <div className="flex flex-col items-center pt-2 text-center">
        {day === null ? (
          <span className="text-[11px] font-semibold text-label-secondary pt-2 leading-tight">日付<br />未定</span>
        ) : isToday ? (
          <>
            <span className="text-[20px] font-black leading-tight">今日</span>
            <span className="mt-1 text-[11px] font-semibold text-label-secondary tabular-nums">{md(day)}（{WEEKDAYS[dow]}）</span>
          </>
        ) : (
          <>
            <span className="text-[11px] font-bold leading-tight" style={{ color: soon ? MARKS['〆'].color : 'var(--label-secondary)' }}>あと</span>
            <span className="text-[30px] font-black leading-none tabular-nums tracking-tight whitespace-nowrap" style={{ color: soon ? MARKS['〆'].color : 'var(--label-primary)' }}>
              {n}<small className="text-[13px] font-bold ml-px">日</small>
            </span>
            <span className="mt-1 text-[11px] font-semibold text-label-secondary tabular-nums whitespace-nowrap">
              {md(day)}<span style={{ color: dayColor(dow) }}>（{WEEKDAYS[dow]}）</span>
            </span>
          </>
        )}
      </div>
      <div className="relative">
        <span className="absolute left-1/2 -ml-px w-[2px]" style={{ top: isToday ? 26 : 0, bottom: last ? 'auto' : 0, height: last ? 26 : undefined, backgroundColor: 'var(--separator)' }} />
        {day !== null && (
          <span className="absolute left-1/2 rounded-full" style={{
            top: 22, width: isToday ? 12 : 10, height: isToday ? 12 : 10, marginLeft: isToday ? -6 : -5,
            backgroundColor: isToday ? 'var(--accent-color)' : 'var(--bg-primary)', border: '2px solid var(--label-primary)',
          }} />
        )}
      </div>
      <div className="min-w-0 pt-2 pb-3 flex flex-col gap-2.5">{children}</div>
    </div>
  );
}

type DotFn = (workId: string | undefined, size: number) => ReactNode;

/** その日の予定。3件までは全部、4件目からは小さい画像で並べる */
function Group({ list, today, dot, onOpen, onRemove, onAll }: {
  list: Moment[]; today: string; dot: DotFn; onOpen: (e: CalendarEvent) => void; onRemove: (e: CalendarEvent) => void; onAll: () => void;
}) {
  const few = list.length <= 3;
  const head = few ? list : list.slice(0, 2);
  const rest = few ? [] : list.slice(2);
  return (
    <section className="rounded-[14px] overflow-hidden" style={{ backgroundColor: 'var(--bg-secondary)', boxShadow: 'inset 0 0 0 0.5px var(--separator)' }}>
      {head.map((m, i) => (
        <div key={`${m.e.id}-${m.mark}-${m.label ?? ''}`} style={{ borderTop: i ? '0.5px solid var(--separator)' : undefined }}>
          <ItemRow m={m} today={today} dot={dot} onOpen={onOpen} onRemove={onRemove} />
        </div>
      ))}
      {rest.length > 0 && (
        <>
          <div style={{ borderTop: '0.5px solid var(--separator)' }}><Thumbs list={rest} dot={dot} onOpen={onOpen} more={onAll} /></div>
          <FootButton onClick={onAll}>この日の{list.length}件をすべて見る</FootButton>
        </>
      )}
    </section>
  );
}

function FootButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button className="pressable w-full py-2.5 text-[12px] font-semibold" style={{ borderTop: '0.5px solid var(--separator)' }}
      onClick={() => { haptic.select(); onClick(); }}>
      {children}
    </button>
  );
}

function Pic({ e, size }: { e: CalendarEvent; size?: number }) {
  const src = parseImageUrls(e.imageUrl)[0];
  const [err, setErr] = useState(false);
  return (
    <span className="block overflow-hidden rounded-[10px] flex-shrink-0" style={{ width: size, height: size, aspectRatio: size ? undefined : '1', backgroundColor: 'var(--fill-tertiary)' }}>
      {src && !err && <OptImg src={src} w={192} alt="" loading="lazy" className="w-full h-full object-contain" onError={() => setErr(true)} />}
    </span>
  );
}

function MarkChip({ mark, label = true, small }: { mark: Mark; label?: boolean; small?: boolean }) {
  const k = MARKS[mark];
  return (
    <span className="inline-flex items-center gap-1 flex-shrink-0 text-[11px] font-bold whitespace-nowrap">
      <b className="inline-flex items-center justify-center rounded-[5px]"
        style={{ width: small ? 16 : 18, height: small ? 16 : 18, fontSize: small ? 10 : 11, backgroundColor: k.color, color: k.ink }}>{mark}</b>
      {label && <span style={{ color: mark === '行' ? '#a07800' : k.color }}>{k.short}</span>}
    </span>
  );
}

/** 4件目からの小さい画像。押すと詳細 */
function Thumbs({ list, dot, onOpen, more }: { list: { e: CalendarEvent; mark?: Mark }[]; dot: DotFn; onOpen: (e: CalendarEvent) => void; more: () => void }) {
  const cut = list.length > 10 ? 9 : 10;
  return (
    <div className="grid grid-cols-5 gap-1.5 p-3 pt-2">
      {list.slice(0, cut).map(({ e, mark }, i) => (
        <button key={`${e.id}-${mark ?? ''}-${i}`} className="pressable relative" aria-label={e.title} onClick={() => { haptic.select(); onOpen(e); }}>
          <Pic e={e} />
          {mark && <span className="absolute left-[3px] top-[3px]"><MarkChip mark={mark} label={false} small /></span>}
          <span className="absolute right-[2px] bottom-[2px]">{dot(e.workId, 14)}</span>
        </button>
      ))}
      {list.length > cut && (
        <button className="pressable rounded-[9px] flex items-center justify-center text-[13px] font-bold" style={{ backgroundColor: 'var(--fill-tertiary)', aspectRatio: '1' }}
          onClick={() => { haptic.select(); more(); }}>+{list.length - cut}</button>
      )}
    </div>
  );
}

/** 予定1件の行。押すと詳細、左へスワイプでカレンダーから外す */
function ItemRow({ m, today, dot, onOpen, onRemove, hideMark }: {
  m: Moment; today: string; dot: DotFn; onOpen: (e: CalendarEvent) => void; onRemove: (e: CalendarEvent) => void; hideMark?: boolean;
}) {
  const e = m.e;
  const [dx, setDx] = useState(0);
  const [gone, setGone] = useState(false);
  const drag = useRef<{ x: number; y: number; on: boolean } | null>(null);
  const swiped = useRef(false);
  const sub = m.mark === '行' || (m.mark === 'イ' && m.end)
    ? `${m.mark === '行' ? (m.end ? `${md(m.day)}〜${md(m.end)}・` : '') : ''}会期 ${e.date ? mdy(e.date, today) : ''}${e.endDate ? `〜${mdy(e.endDate, today)}` : ''}`
    : null;
  return (
    <div className="relative overflow-hidden" style={{ backgroundColor: MARKS['〆'].color, touchAction: 'pan-y' }}>
      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[12px] font-bold text-white">外す</span>
      <button className="relative w-full flex items-center gap-2.5 px-3 py-2.5 text-left select-none"
        style={{ backgroundColor: 'var(--bg-secondary)', transform: `translateX(${gone ? '-110%' : `${dx}px`})`, transition: drag.current?.on ? 'none' : 'transform .22s ease' }}
        onPointerDown={(ev) => { drag.current = { x: ev.clientX, y: ev.clientY, on: false }; }}
        onPointerMove={(ev) => {
          const d = drag.current; if (!d) return;
          const mx = ev.clientX - d.x, my = ev.clientY - d.y;
          if (!d.on) {
            if (mx < -12 && Math.abs(mx) > Math.abs(my) * 1.3) { d.on = true; try { ev.currentTarget.setPointerCapture(ev.pointerId); } catch { /* noop */ } }
            else if (Math.abs(my) > 12 || mx > 12) { drag.current = null; return; }
          }
          if (d.on) setDx(Math.min(0, mx));
        }}
        onPointerUp={(ev) => {
          const d = drag.current; drag.current = null;
          if (!d?.on) return;
          swiped.current = true; setTimeout(() => { swiped.current = false; }, 80);
          if (dx < -Math.min(110, ev.currentTarget.offsetWidth * 0.35)) { haptic.select(); setGone(true); setTimeout(() => onRemove(e), 200); }
          else setDx(0);
        }}
        onPointerCancel={() => { drag.current = null; setDx(0); }}
        onClick={() => { if (swiped.current) return; haptic.select(); onOpen(e); }}>
        <Pic e={e} size={56} />
        <span className="min-w-0 flex-1 flex flex-col gap-[3px]">
          <span className="flex items-center gap-1.5 min-w-0 text-[11px] text-label-secondary">
            {!hideMark && <MarkChip mark={m.mark} />}
            {m.label && <span className="font-semibold text-label-primary truncate flex-shrink-0 max-w-[40%]">{m.label}</span>}
            <span className="flex items-center gap-1 min-w-0">{dot(e.workId, 15)}<span className="truncate">{e.workName}</span></span>
          </span>
          <span className="text-[13px] font-semibold leading-snug line-clamp-2">{stripWorkName(e.title, e.workName)}</span>
          <span className="text-[12px] tabular-nums">
            {sub ? <span className="text-label-secondary">{sub}</span>
              : e.price ? <b>¥{e.price.toLocaleString('ja-JP')}</b>
              : deriveIsGoods(e) ? <span className="text-label-tertiary text-[11px]">価格未定</span> : null}
          </span>
        </span>
      </button>
    </div>
  );
}

const deriveIsGoods = (e: CalendarEvent) => deriveItemType(e) === 'goods';

/** 会期の帯。全部のイベントを同じ目盛りで並べ、今日の線と行く日の点を重ねる */
function Gantt({ list, today, colors, dot, onOpen }: {
  list: CalendarEvent[]; today: string; colors: Map<string, string>; dot: DotFn; onOpen: (e: CalendarEvent) => void;
}) {
  const g0 = addDays(today, -7), g1 = addDays(today, 75);
  const span = daysBetween(g0, g1);
  const x = (d: string) => (Math.max(0, Math.min(span, daysBetween(g0, d))) / span) * 100;
  const months: string[] = [];
  for (let m = addMonths(g0, 1); m <= g1; m = addMonths(m, 1)) months.push(m);
  return (
    <div className="px-3 pb-2">
      <div className="relative h-4 text-[10px] text-label-tertiary">
        {months.map((m) => <span key={m} className="absolute top-0" style={{ left: `${x(m)}%` }}>{Number(m.slice(5, 7))}月</span>)}
      </div>
      {list.map((e) => {
        const a = x(e.date!), b = x(e.endDate!);
        const visits = (e.visits ?? []).filter((v) => v.end >= today).sort((p, q) => p.start.localeCompare(q.start));
        const rest = e.date! > today ? <><b className="text-label-primary">{daysBetween(today, e.date!)}日後</b>から</> : e.endDate === today ? <b className="text-label-primary">今日まで</b> : <>あと<b className="text-label-primary">{daysBetween(today, e.endDate!)}日</b></>;
        const color = (e.workId && colors.get(e.workId)) || 'var(--accent-color)';
        return (
          <button key={e.id} className="pressable block w-full text-left py-2" style={{ borderTop: '0.5px solid var(--separator)' }} onClick={() => { haptic.select(); onOpen(e); }}>
            <span className="flex items-center gap-1.5">
              {dot(e.workId, 15)}
              <span className="flex-1 min-w-0 truncate text-[12px] font-semibold">{stripWorkName(e.title, e.workName)}</span>
              <span className="text-[11px] text-label-secondary whitespace-nowrap tabular-nums">{rest}</span>
            </span>
            <span className="relative block h-3.5 mt-1.5">
              <span className="absolute inset-x-0 top-[6px] h-[2px]" style={{ backgroundColor: 'var(--fill-tertiary)' }} />
              {months.map((m) => <span key={m} className="absolute inset-y-0 w-px" style={{ left: `${x(m)}%`, backgroundColor: 'var(--separator)' }} />)}
              <span className="absolute top-1 h-1.5 rounded-full" style={{ left: `${a}%`, width: `${Math.max(1.5, b - a)}%`, backgroundColor: color }} />
              <span className="absolute -top-0.5 -bottom-0.5 w-[2px] -ml-px" style={{ left: `${x(today)}%`, backgroundColor: 'var(--label-primary)' }} />
              {visits.map((v) => (
                <span key={v.id} className="absolute top-px w-3 h-3 -ml-1.5 rounded-full"
                  style={{ left: `${x(v.start)}%`, backgroundColor: MARKS['行'].color, border: '2px solid var(--bg-secondary)' }} />
              ))}
            </span>
            <span className="block mt-1 text-[11px]" style={{ color: visits.length ? '#a07800' : 'var(--label-secondary)', fontWeight: visits.length ? 600 : 400 }}>
              {visits.length
                ? `行く日 ${visits.map((v) => `${md(v.start)}（${WEEKDAYS[dowOf(v.start)]}）`).join('・')}`
                : `会期 ${mdy(e.date!, today)}〜${mdy(e.endDate!, today)}・行く日を選ぶ ›`}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// 開いたとき、カレンダーの高さが決まる前に位置がずれないよう、最初の1回だけ測り直す
export function useStickyTop(ref: React.RefObject<HTMLElement>): number {
  const [h, setH] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setH(el.offsetHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return h;
}

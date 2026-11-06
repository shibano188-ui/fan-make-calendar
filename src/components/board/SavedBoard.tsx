import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { CalendarPlus, ChevronDown } from 'lucide-react';
import type { CalendarEvent, EventVisit } from '../../types';
import Sheet from '../ui/Sheet';
import OptImg from '../ui/OptImg';
import { todayStr, deriveItemType } from '../../design/tokens';
import { daysBetween } from '../../lib/relativeDay';
import { haptic } from '../../lib/haptics';
import { parseImageUrls } from '../../lib/constants';
import { stripWorkName } from '../../lib/stripWorkName';
import { buildWorkColorMap } from '../../lib/workColors';
import { MARKS, buildDays, longEvents, undatedMoments, splitTentative, type Mark, type Moment } from './boardModel';
import WorkIconSheet, { type BoardWork } from './WorkIconSheet';
import { useWorkIcons, WorkDot } from './WorkDot';
import VisitSheet from './VisitSheet';
import SwipeRow from '../ui/SwipeRow';
import { useImportant, toggleImportant, IMPORTANT_SIDE } from '../../lib/important';
import { useTentative, setTentative } from '../../lib/tentative';
import { useToast } from '../ui/Toast';
import { useCalDotImages } from '../../lib/calDotImages';

// カレンダーの「ボード」表示（2026-11-06 柴野と試作 → 表示の切り替えに「ボード」として足した）。
// 上に月のカレンダー（下へスクロールすると上部バーの下へ滑り込み、今見ている週の帯だけが残る）、下に「あと○日」で並べた日ごとの予定。
// 作品は点で見せ、作品の画像を選んでいればドット絵の点にする。試作: claude.ai の「推し予定ボード」

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];
const parse = (s: string) => new Date(s + 'T00:00:00');
const addDays = (s: string, n: number) => { const d = parse(s); d.setDate(d.getDate() + n); return todayStr(d); };
const addMonths = (s: string, n: number) => { const d = parse(s); d.setDate(1); d.setMonth(d.getMonth() + n); return todayStr(d); };
const md = (s: string) => `${Number(s.slice(5, 7))}/${Number(s.slice(8, 10))}`;
const mdy = (s: string, today: string) => (s.slice(0, 4) === today.slice(0, 4) ? md(s) : `${s.slice(0, 4)}/${md(s)}`);
const dowOf = (s: string) => parse(s).getDay();
const startOfWeek = (s: string) => addDays(s, -dowOf(s));
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
  /** 見出しの「今日」を押した回数（押したら一番上へ戻る） */
  todayTick?: number;
  /** 自分用の予定を足す（カレンダーが開いているときだけ、カレンダーの右下にボタンを出す） */
  onAddPersonal?: () => void;
};

type SheetState = { kind: 'day'; day: string } | { kind: 'undated' } | { kind: 'icons' } | { kind: 'visit'; id: string } | null;

export default function SavedBoard({ events, anchor, setAnchor, workImages, stickyTop, onOpen, onRemove, userId, onVisits, todayTick = 0, onAddPersonal }: Props) {
  const today = todayStr();
  const toast = useToast();
  const [onlyMarks, setOnlyMarks] = useState<Set<Mark>>(new Set());
  const [evOpen, setEvOpen] = useState(false);
  const [sheet, setSheet] = useState<SheetState>(null);

  // 日付未定（下旬・春頃・日付なし）と、そのうち自分で仮に置いたもの
  const tentative = useTentative();
  const undatedAll = useMemo(() => undatedMoments(events, today), [events, today]);
  const { placed, rest: unplaced } = useMemo(() => splitTentative(undatedAll, tentative, today), [undatedAll, tentative, today]);
  const allDays = useMemo(() => {
    const m = buildDays(events);
    for (const x of placed) { const l = m.get(x.day); if (l) l.push(x); else m.set(x.day, [x]); }
    return m;
  }, [events, placed]);
  // 「これから7日」で選んだ種類だけにする（数は選ぶ前のまま出す）
  const days = useMemo(() => {
    if (!onlyMarks.size) return allDays;
    const m = new Map<string, Moment[]>();
    for (const [d, list] of allDays) { const l = list.filter((x) => !x.tentative && onlyMarks.has(x.mark)); if (l.length) m.set(d, l); }
    return m;
  }, [allDays, onlyMarks]);
  const future = useMemo(() => [...days.keys()].filter((d) => d > today).sort(), [days, today]);
  const ganttList = useMemo(() => (onlyMarks.size && !onlyMarks.has('イ') && !onlyMarks.has('行') ? [] : longEvents(events, today)), [events, today, onlyMarks]);
  const undated = onlyMarks.size ? [] : unplaced;

  // 作品の色と、点に使う画像（ドット絵）
  const works: BoardWork[] = useMemo(() => {
    const m = new Map<string, BoardWork>();
    for (const e of events) if (e.workId && !m.has(e.workId)) m.set(e.workId, { id: e.workId, name: e.workName || '作品' });
    return [...m.values()];
  }, [events]);
  // 作品の色。アイコンの設定で色を変えたら取り直す
  const [colorTick, setColorTick] = useState(0);
  useEffect(() => {
    const on = () => setColorTick((n) => n + 1);
    window.addEventListener('fan-work-colors', on);
    return () => window.removeEventListener('fan-work-colors', on);
  }, []);
  const colors = useMemo(() => buildWorkColorMap(works), [works, colorTick]); // eslint-disable-line react-hooks/exhaustive-deps
  // カレンダーの点の画像（作品のアイコンと同じ／点だけ別の写真／色の点）
  const dotImages = useCalDotImages(workImages);
  const icons = useWorkIcons(dotImages.images);
  const dot = (workId: string | undefined, size: number) => <WorkDot workId={workId} size={size} color={workId ? colors.get(workId) : undefined} icons={icons} />;

  // ─ カレンダー（下へスクロールすると、すぐ今見ている週の帯だけにたたむ） ─
  // 2026-11-07 柴野と4回目。決めごと:
  //   ・下へスクロールしたら、すぐ自動でたたむ（今見ている週の帯だけ残す）
  //   ・上へ戻っただけでは開かない。開くのは、帯のつまみを押す・帯を下へ引く・一番上でさらに下へ引く
  //   ・日付を押すと、たたんでその日の予定まで飛ぶ。「これから7日」を押してもたたむ
  // 作り: たたんでもページの高さは変えない（前は高さを縮めていて、一覧が指の下で跳ぶ・飛び先がずれる、が起きた）。
  //   カレンダーと下の一覧を、月の部分の高さだけ transform で上へずらして見せる。スクロール位置も高さも変わらないので、
  //   指のスクロールとぶつからない
  const BAR = 76; // たたんだときに残る帯（週の7日＋つまみ）の高さ
  const monthRef = useRef<HTMLDivElement>(null);
  const [monthH, setMonthH] = useState(0);
  const [folded, setFolded] = useState(false);
  const foldedRef = useRef(false);
  foldedRef.current = folded;
  const [scrolled, setScrolled] = useState(false);
  const [active, setActive] = useState(today);
  const activeRef = useRef(today);
  const anchorRef = useRef(anchor);
  anchorRef.current = anchor;
  // 帯で前後の週を見ているときのずれ（スクロールで今見ている日が変わると0に戻る）
  const [weekShift, setWeekShift] = useState(0);
  useLayoutEffect(() => {
    const h = monthRef.current?.offsetHeight ?? 0;
    if (h !== monthH) setMonthH(h);
  });

  useEffect(() => {
    let last = window.scrollY, raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const y = window.scrollY;
        if (y > last + 2 && y > 0 && !foldedRef.current) setFolded(true);
        last = y;
        setScrolled(y > 0);
        // 今見ている日（帯の下端より上に来た最後の日）
        const line = stickyTop + BAR + 12;
        let cur = today;
        document.querySelectorAll<HTMLElement>('[data-board-day]').forEach((el) => { if (el.getBoundingClientRect().top <= line) cur = el.dataset.boardDay!; });
        if (cur !== activeRef.current) {
          activeRef.current = cur;
          setActive(cur);
          setWeekShift(0);
          if (cur.slice(0, 7) !== anchorRef.current.slice(0, 7)) setAnchor(cur);
        }
      });
    };
    // 一番上まで戻ったうえで、さらに上へ（指を下へ）80px 引いたら開く。スクロールで戻ってきただけでは開かない。
    // 指を置いたときに一番上でなくても、指を動かしている途中で一番上に着いたら、そこから数える
    let pullY: number | null = null;
    const PULL = 80;
    const onTouchStart = () => { pullY = null; };
    const onTouchMove = (e: TouchEvent) => {
      if (!foldedRef.current) return;
      const y0 = e.touches[0].clientY;
      if (window.scrollY > 0) { pullY = null; return; }
      if (pullY === null || y0 < pullY) pullY = y0; // 一番上に着いた位置（上へ戻したら、そこから数え直す）
      if (y0 - pullY > PULL) { pullY = null; haptic.select(); setFolded(false); }
    };
    // パソコンのホイール: 一番上でさらに上へ回したら開く
    let wheelUp = 0, wheelTimer: ReturnType<typeof setTimeout> | null = null;
    const onWheel = (e: WheelEvent) => {
      if (!foldedRef.current || window.scrollY > 0 || e.deltaY >= 0) { wheelUp = 0; return; }
      wheelUp += -e.deltaY;
      if (wheelTimer) clearTimeout(wheelTimer);
      wheelTimer = setTimeout(() => { wheelUp = 0; }, 400);
      if (wheelUp > 200) { wheelUp = 0; haptic.select(); setFolded(false); }
    };
    window.addEventListener('wheel', onWheel, { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    onScroll();
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('wheel', onWheel);
      cancelAnimationFrame(raf);
    };
  }, [stickyTop, today, setAnchor]);
  // Android の Chrome が、上の要素の変化に合わせてスクロール位置を勝手に補正しないようにする
  useEffect(() => {
    const els = [document.documentElement, document.body];
    const prev = els.map((el) => el.style.overflowAnchor);
    els.forEach((el) => { el.style.overflowAnchor = 'none'; });
    return () => els.forEach((el, i) => { el.style.overflowAnchor = prev[i]; });
  }, []);
  // 見出しの「今日」を押したら、カレンダーを開いて一番上（今日）へ戻る
  useEffect(() => {
    if (!todayTick) return;
    setFolded(false);
    setWeekShift(0);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [todayTick]);

  const fold = () => setFolded(true);
  // たたんだときに、カレンダーと一覧を上へずらす量
  const shift = folded ? monthH : 0;
  const slide = { transform: shift ? `translateY(${-shift}px)` : 'none', transition: 'transform .28s cubic-bezier(0.32,0.72,0,1)' };

  const monthStart = `${anchor.slice(0, 7)}-01`;
  const weeks = useMemo(() => {
    const first = parse(monthStart);
    const start = addDays(monthStart, -first.getDay());
    const dim = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    return Array.from({ length: Math.ceil((first.getDay() + dim) / 7) }, (_, i) => addDays(start, i * 7));
  }, [monthStart]);
  const stripWeek = addDays(startOfWeek(active), weekShift * 7);

  // イベントがある日（始まる日・行く日）。カレンダーで紫の輪
  const eventDays = useMemo(() => {
    const s = new Set<string>();
    for (const [d, list] of allDays) if (list.some((m) => m.mark === 'イ' || m.mark === '行')) s.add(d);
    return s;
  }, [allDays]);

  const jump = (day: string) => {
    haptic.select();
    const row = document.querySelector<HTMLElement>(`[data-board-day="${day}"]`);
    if (!row || day < today) {
      if (days.get(day)?.length) setSheet({ kind: 'day', day });
      return;
    }
    activeRef.current = day;
    setActive(day);
    setWeekShift(0);
    // ページの高さは変わらない。今開いていれば、たたむと一覧が月の高さだけ上へずれるので、その分を引く
    const up = folded ? 0 : monthH;
    setFolded(true);
    window.scrollTo({ top: Math.max(0, window.scrollY + row.getBoundingClientRect().top - up - stickyTop - BAR - 6), behavior: 'smooth' });
  };

  // カレンダーの上で: 横に払うと前後の月（たたんでいるときは前後の週）、上下に引くと 開く・たたむ
  const touch = useRef<{ x: number; y: number } | null>(null);
  const calTouch = {
    onTouchStart: (e: React.TouchEvent) => { touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; },
    onTouchEnd: (e: React.TouchEvent) => {
      if (!touch.current || drag) return;
      const dx = e.changedTouches[0].clientX - touch.current.x, dy = e.changedTouches[0].clientY - touch.current.y;
      touch.current = null;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        haptic.select();
        if (folded) setWeekShift((n) => n + (dx < 0 ? 1 : -1));
        else setAnchor(addMonths(anchor, dx < 0 ? 1 : -1));
        return;
      }
      if (Math.abs(dy) > 28 && Math.abs(dy) > Math.abs(dx)) { haptic.select(); setFolded(dy < 0); }
    },
  };

  // ─ 日付未定の予定を、長押しして好きな日へ運ぶ（仮置き） ─
  const [drag, setDrag] = useState<{ m: Moment; x: number; y: number } | null>(null);
  // 置き先。on＝その日に、between＝2つの日のあいだ（真ん中の日にする）、after＝最後の日より後（1週間後にする）
  const [hot, setHot] = useState<DropTarget | null>(null);
  const hotRef = useRef<DropTarget | null>(null);
  const startDrag = (m: Moment, x: number, y: number) => { haptic.select(); setDrag({ m, x, y }); };
  useEffect(() => {
    if (!drag) return;
    let px = drag.x, py = drag.y, raf = 0;
    const target = () => {
      const t = dropTargetAt(px, py, today, !!drag.m.tentative);
      const prev = hotRef.current;
      if (t?.day !== prev?.day || t?.kind !== prev?.kind) { hotRef.current = t; setHot(t); if (t) haptic.select(); }
    };
    // 画面の上下の端に近づいたら、自動でスクロールする
    const loop = () => {
      // 上は帯の下から 70px、下はナビの上から。広めにして、上の日付未定の欄へも運びやすく
      const top = stickyTop + BAR + 70, bottom = window.innerHeight - 140;
      // 日付未定の欄の上にいるときは止める（戻す先が逃げないように）
      if (hotRef.current?.kind === 'back') { /* 止める */ }
      else if (py < top) window.scrollBy(0, -Math.min(14, (top - py) / 3));
      else if (py > bottom) window.scrollBy(0, Math.min(14, (py - bottom) / 3));
      target();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    const move = (e: PointerEvent) => { px = e.clientX; py = e.clientY; setDrag((d) => (d ? { ...d, x: px, y: py } : d)); };
    const end = () => {
      const t = hotRef.current, m = drag.m;
      hotRef.current = null; setHot(null); setDrag(null);
      if (!t) return;
      const before = tentative[m.e.id] ?? null;
      setTentative(m.e.id, t.kind === 'back' ? null : t.day);
      toast(t.kind === 'back' ? '日付未定に戻しました' : `${t.label}に仮置きしました`, 'success', { label: '元に戻す', onClick: () => setTentative(m.e.id, before) });
    };
    const cancel = () => { hotRef.current = null; setHot(null); setDrag(null); };
    // 運んでいる間は、指の動きでページがスクロールしないようにする
    const noScroll = (e: TouchEvent) => e.preventDefault();
    // 捕捉の段階で受ける（運んでいる間は、行のスワイプへ指の動きを渡さないので）
    window.addEventListener('pointermove', move, true);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('touchmove', noScroll, { passive: false });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('touchmove', noScroll);
    };
  }, [drag?.m.e.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const [undatedOpen, setUndatedOpen] = useState(() => { try { return localStorage.getItem(UNDATED_OPEN_KEY) === '1'; } catch { return false; } });
  const toggleUndated = () => {
    haptic.select();
    setUndatedOpen((v) => { try { localStorage.setItem(UNDATED_OPEN_KEY, v ? '0' : '1'); } catch { /* noop */ } return !v; });
  };

  // ─ これから7日（仮置きは数えない） ─
  const week7 = useMemo(() => {
    const c: Partial<Record<Mark, number>> = {};
    for (const [d, list] of allDays) if (d >= today && daysBetween(today, d) <= 6) for (const m of list) if (!m.tentative) c[m.mark] = (c[m.mark] ?? 0) + 1;
    return c;
  }, [allDays, today]);
  // 押したらカレンダーをたたむ（絞った一覧を広く見られるように）
  const toggleMark = (k: Mark) => { haptic.select(); fold(); setOnlyMarks((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; }); };

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

  const cell = (d: string, i: number, outside: boolean, compact?: boolean) => (
    <DayCell key={d} d={d} dow={i} today={today} list={days.get(d) ?? []} active={d === active} event={eventDays.has(d)}
      outside={outside} compact={compact} hot={hot?.kind === 'on' && hot.day === d} dot={dot} onPick={jump} />
  );
  const handle = (label: string, onClick: () => void) => (
    <button type="button" aria-label={label} className="w-full h-4 flex items-center justify-center flex-shrink-0" onClick={() => { haptic.select(); onClick(); }}>
      <span className="w-9 h-1 rounded-full" style={{ backgroundColor: 'var(--fill-secondary)' }} />
    </button>
  );

  return (
    <div className="pb-6">
      {/* ── 月のカレンダー。高さは変えず、上部バーの下へ滑り込んで「週の帯」だけを残す ── */}
      <div {...calTouch} className="sticky z-10"
        // 地の色は、見えている部分（開いているときは月、たたんだら帯）にだけ塗る。たたんで上へずらした月が、
        // 上の案内などを地の色で隠さないように。スクロール中は、上部バーのぼかしの下から一覧が透けないよう上へ伸ばす
        style={{ ...slide, top: stickyTop }}>
        <div ref={monthRef} className="-mx-3 px-3"
          style={{
            opacity: folded ? 0 : 1, pointerEvents: folded ? 'none' : 'auto', transition: 'opacity .2s ease',
            backgroundColor: 'var(--bg-primary)', boxShadow: scrolled && !folded ? '0 -24px 0 var(--bg-primary)' : undefined,
          }}>
          <div className="grid grid-cols-7 pt-1">
            {WEEKDAYS.map((w, i) => (
              <div key={w} className="text-center text-[11px] font-semibold pb-1" style={{ color: dayColor(i) ?? 'var(--label-secondary)' }}>{w}</div>
            ))}
          </div>
          {weeks.map((w) => (
            <div key={w} className="grid grid-cols-7">{Array.from({ length: 7 }, (_, i) => cell(addDays(w, i), i, addDays(w, i).slice(0, 7) !== anchor.slice(0, 7)))}</div>
          ))}
        </div>
        {/* 下の段（高さ一定）: 開いているときは凡例、たたんだら今見ている週 */}
        <div className="relative -mx-3 px-3"
          style={{ height: BAR, backgroundColor: 'var(--bg-primary)', borderBottom: '0.5px solid var(--separator)', boxShadow: scrolled && folded ? '0 -24px 0 var(--bg-primary)' : undefined }}>
          <div className="absolute inset-y-0 inset-x-3 flex flex-col justify-end" style={{ opacity: folded ? 0 : 1, pointerEvents: folded ? 'none' : 'auto', transition: 'opacity .2s ease' }}>
            <div className="flex-1 flex items-center gap-x-3 gap-y-1 flex-wrap content-center text-[11px] text-label-secondary">
              <span className="flex items-center gap-1"><b style={{ color: MARKS['〆'].color }}>〆</b>締切</span>
              <span className="flex items-center gap-1"><i className="w-[10px] h-[10px] rounded-full" style={{ boxShadow: `inset 0 0 0 2px ${MARKS['イ'].color}` }} />イベント</span>
              {works.length > 0 && (
                <button className="pressable ml-auto font-semibold text-label-primary" onClick={() => { haptic.select(); setSheet({ kind: 'icons' }); }}>アイコンを変える ›</button>
              )}
            </div>
            {handle('カレンダーをたたむ', fold)}
          </div>
          {/* 自分用の予定を足す。カレンダーが開いているときだけ、カレンダーの右下（下の線にかかる位置）に出す。
              前は画面の右下に浮かせていて、位置がずれることがあった（柴野） */}
          {onAddPersonal && (
            <button aria-label="自分の予定を追加"
              className="pressable material-thick absolute right-3 w-12 h-12 rounded-full flex items-center justify-center shadow-float"
              style={{ bottom: -24, color: 'var(--accent-text)', opacity: folded ? 0 : 1, transform: folded ? 'scale(.6)' : 'none', pointerEvents: folded ? 'none' : 'auto', transition: 'opacity .2s, transform .2s', zIndex: 2 }}
              onClick={() => { haptic.select(); onAddPersonal(); }}>
              <CalendarPlus size={22} />
            </button>
          )}
          <div className="absolute inset-y-0 inset-x-3 flex flex-col" style={{ opacity: folded ? 1 : 0, pointerEvents: folded ? 'auto' : 'none', transition: 'opacity .2s ease' }} aria-hidden={!folded}>
            <div className="grid grid-cols-7 pt-0.5">{Array.from({ length: 7 }, (_, i) => cell(addDays(stripWeek, i), i, false, true))}</div>
            {handle('カレンダーを開く', () => setFolded(false))}
          </div>
        </div>
      </div>

      {/* カレンダーより下は、たたんだときにカレンダーと一緒に上へずらす */}
      <div style={slide}>
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

      {/* ── 日付未定（ふだんは1行。開くと画像が並び、長押しで好きな日へ運んで仮に置ける） ── */}
      {(undated.length > 0 || (!onlyMarks.size && placed.length > 0)) && (
        // 仮置きした予定をここへ運ぶと、仮置きをやめて日付未定に戻る
        <section data-undated-drop className="mt-3 rounded-[14px] overflow-hidden transition-colors"
          style={{ backgroundColor: hot?.kind === 'back' ? 'color-mix(in srgb, var(--accent-color) 22%, var(--bg-secondary))' : 'var(--bg-secondary)', boxShadow: 'inset 0 0 0 0.5px var(--separator)' }}>
          <button className="pressable w-full flex items-center gap-2 px-3 py-2 text-left" aria-expanded={undatedOpen} onClick={toggleUndated}>
            <span className="text-[13px] font-bold whitespace-nowrap">日付未定</span>
            <span className="text-[12px] text-label-secondary tabular-nums">{undated.length}件</span>
            {!undatedOpen && (
              <span className="flex ml-1 min-w-0 overflow-hidden">
                {undated.slice(0, 6).map((m, k) => <span key={m.e.id} className="rounded-[7px] overflow-hidden flex-shrink-0" style={{ marginLeft: k ? -6 : 0, boxShadow: '0 0 0 1.5px var(--bg-secondary)' }}><Pic e={m.e} size={26} /></span>)}
              </span>
            )}
            <ChevronDown size={16} className="ml-auto flex-shrink-0 text-label-secondary" style={{ transform: undatedOpen ? 'rotate(180deg)' : undefined, transition: 'transform .25s' }} />
          </button>
          {undatedOpen && (
            <>
              <p className="px-3 -mt-0.5 text-[11px] text-label-secondary">長押しして、好きな場所へ仮置きできます</p>
              <div className="flex gap-2 overflow-x-auto no-scrollbar px-3 pt-2 pb-2">
                {undated.map((m) => (
                  <LongPress key={m.e.id} onLong={(x, y) => startDrag(m, x, y)} onTap={() => onOpen(m.e)}
                    className="flex-shrink-0 w-[64px] text-left" style={{ opacity: drag?.m.e.id === m.e.id ? 0.3 : 1 }} label={m.e.title}>
                    <span className="relative block"><Pic e={m.e} size={64} /><span className="absolute right-[2px] bottom-[2px]">{dot(m.e.workId, 13)}</span></span>
                    <span className="block mt-1 text-[10px] font-bold leading-tight truncate">{m.label?.replace(/^(発売|開催) /, '')}</span>
                  </LongPress>
                ))}
              </div>
              <FootButton onClick={() => setSheet({ kind: 'undated' })}>すべて見る</FootButton>
            </>
          )}
        </section>
      )}

      {/* ── 今日 ── */}
      <DayRow day={today} today={today} hot={hot?.kind === 'on' && hot.day === today}>
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
                <Gantt list={ganttList} today={today} colors={colors} dot={dot} onDetail={onOpen} onVisit={pickVisit} />
              </>
            ) : (
              <>
                <Gantt list={evPreview} today={today} colors={colors} dot={dot} onDetail={onOpen} onVisit={pickVisit} />
                {evRest > 0 && (
                  <FootButton onClick={() => setEvOpen(true)}>{goingEvents.length ? `ほかのイベント ${evRest}件を見る` : `イベント ${ganttList.length}件をすべて見る`}</FootButton>
                )}
              </>
            )}
          </section>
        )}
        {todayList.length > 0 && <Group list={todayList} today={today} dot={dot} onOpen={onOpen} onRemove={onRemove} onDrag={startDrag} onAll={() => setSheet({ kind: 'day', day: today })} />}
      </DayRow>

      {/* ── これからの日 ── */}
      {future.map((d, i) => (
        <DayRow key={d} day={d} today={today} hot={hot?.kind === 'on' && hot.day === d} last={i === future.length - 1}
          guess={days.get(d)!.every((m) => m.tentative)}>
          <Group list={days.get(d)!} today={today} dot={dot} onOpen={onOpen} onRemove={onRemove} onDrag={startDrag} onAll={() => setSheet({ kind: 'day', day: d })} />
        </DayRow>
      ))}

      {!future.length && !todayList.length && !ganttList.length && !undated.length && (
        <p className="text-center text-label-secondary text-[13px] py-14">
          {onlyMarks.size ? 'この種類の予定はありません' : <>これからの予定はありません<br />気になるグッズ・イベントに ♡ を押すとここに並びます</>}
        </p>
      )}
      {/* 最後の日まで、帯のすぐ下へ飛べるように下に余白を足す */}
      <div aria-hidden style={{ height: `max(0px, calc(100dvh - ${stickyTop + BAR + 260}px))` }} />
      </div>

      {/* 運んでいる予定（指の下に出す） */}
      {drag && hot && (hot.kind === 'between' || hot.kind === 'after') && createPortal(
        // 日と日のあいだ・最後の日より後に置くときの線
        <div className="fixed pointer-events-none flex items-center" style={{ left: 60, right: 12, top: hot.y - 1, zIndex: 499 }}>
          <span className="w-2.5 h-2.5 -ml-1 rounded-full" style={{ backgroundColor: 'var(--accent-color)' }} />
          <span className="flex-1 h-[3px] rounded-full" style={{ backgroundColor: 'var(--accent-color)' }} />
        </div>,
        document.body,
      )}
      {drag && createPortal(
        <div className="fixed pointer-events-none" style={{ left: drag.x - 32, top: drag.y - 40, zIndex: 500 }}>
          <div className="rounded-[12px] shadow-float" style={{ transform: 'scale(1.05) rotate(-3deg)' }}><Pic e={drag.m.e} size={64} /></div>
          <div className="mt-1 -ml-8 w-[128px] text-center text-[11px] font-bold rounded-full px-1.5 py-0.5"
            style={{ backgroundColor: hot ? 'var(--label-primary)' : 'var(--fill-secondary)', color: hot ? 'var(--bg-primary)' : 'var(--label-secondary)' }}>
            {hot ? (hot.kind === 'back' ? '日付未定に戻す' : `${hot.label}に置く`) : '置きたい場所で離す'}
          </div>
        </div>,
        document.body,
      )}

      {/* その日の全部・日付未定の一覧（外をタップするか下へ引くと閉じる） */}
      <Sheet open={sheet?.kind === 'day' || sheet?.kind === 'undated'} onClose={() => setSheet(null)}
        title={sheet?.kind === 'day'
          ? <span className="flex items-baseline gap-2"><b className="text-[16px]" style={{ color: dayColor(dowOf(sheet.day)) }}>{md(sheet.day)}（{WEEKDAYS[dowOf(sheet.day)]}）</b><span className="text-[12px] text-label-secondary">{relLabel(sheet.day, today)}・{sheetList.length}件</span></span>
          : <b className="text-[16px]">日付未定 {undatedAll.length}件</b>}>
        <div className="pb-6">
          {sheet?.kind === 'day' && sheetList.map((m) => <ItemRow key={`${m.e.id}-${m.mark}-${m.label ?? ''}`} m={m} today={today} dot={dot} onOpen={onOpen} onRemove={onRemove} />)}
          {sheet?.kind === 'undated' && undatedAll.map((m) => {
            const at = tentative[m.e.id] && tentative[m.e.id] >= today ? tentative[m.e.id] : null;
            return (
              <div key={m.e.id} className="flex items-center gap-2.5 py-2.5" style={{ borderBottom: '0.5px solid var(--separator)' }}>
                <button className="pressable flex items-center gap-2.5 flex-1 min-w-0 text-left" onClick={() => { setSheet(null); onOpen(m.e); }}>
                  <Pic e={m.e} size={48} />
                  <span className="min-w-0">
                    <span className="block text-[11px] font-bold">{m.label}{at && <span className="ml-1.5 text-label-secondary">仮置き {md(at)}</span>}</span>
                    <span className="block text-[13px] font-semibold leading-snug line-clamp-2">{stripWorkName(m.e.title, m.e.workName)}</span>
                  </span>
                </button>
                {at && (
                  <button className="pressable flex-shrink-0 px-2.5 py-1.5 rounded-full text-[12px] font-semibold" style={{ backgroundColor: 'var(--fill-tertiary)' }}
                    onClick={() => { haptic.select(); setTentative(m.e.id, null); }}>仮置きをやめる</button>
                )}
              </div>
            );
          })}
        </div>
      </Sheet>
      {sheet?.kind === 'icons' && <WorkIconSheet works={works} colors={colors} icons={icons} workImages={workImages} own={dotImages.own} onClose={() => setSheet(null)} />}
      {visitEvent && userId && (
        <VisitSheet event={visitEvent} userId={userId} deadlineDays={deadlineDays}
          onChange={(v) => onVisits(visitEvent, v)}
          onOpenDetail={() => { setSheet(null); onOpen(visitEvent); }}
          onClose={() => setSheet(null)} />
      )}
    </div>
  );
}

const UNDATED_OPEN_KEY = 'fan_board_undated_open';

type DropTarget = { kind: 'on' | 'between' | 'after' | 'back'; day: string; label: string; y: number };

/** 指の位置から置き先を決める。カレンダーの日の上＝その日。一覧の日の境目（上下12px）＝2つの日のあいだ（真ん中の日）。
 *  日の行の上＝その日。最後の日の下＝その1週間後 */
function dropTargetAt(px: number, py: number, today: string, placed: boolean): DropTarget | null {
  // 仮置きしたものを日付未定の欄へ戻す
  if (placed && document.elementFromPoint(px, py)?.closest('[data-undated-drop]')) return { kind: 'back', day: '', label: '日付未定', y: py };
  const cell = document.elementFromPoint(px, py)?.closest<HTMLElement>('[data-cal-day]');
  if (cell?.dataset.calDay && cell.dataset.calDay >= today) return { kind: 'on', day: cell.dataset.calDay, label: md(cell.dataset.calDay), y: py };
  const rows = [...document.querySelectorAll<HTMLElement>('[data-board-day]')];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i].getBoundingClientRect(), d = rows[i].dataset.boardDay!;
    if (i > 0 && Math.abs(py - r.top) <= 12) {
      const prev = rows[i - 1].dataset.boardDay!;
      const gap = daysBetween(prev, d);
      const mid = gap > 1 ? addDays(prev, Math.floor(gap / 2)) : prev;
      return { kind: 'between', day: mid, label: `${md(prev)}と${md(d)}のあいだ`, y: r.top };
    }
    if (py > r.top && py < r.bottom) return { kind: 'on', day: d, label: md(d), y: py };
  }
  const last = rows[rows.length - 1];
  if (last) {
    const r = last.getBoundingClientRect();
    if (py >= r.bottom && py <= r.bottom + 90) return { kind: 'after', day: addDays(last.dataset.boardDay!, 7), label: `${md(last.dataset.boardDay!)}より後`, y: r.bottom };
  }
  return null;
}

/** 長押しで運び始める（指を 8px 以上動かすと、ふつうのスクロール・横の並びのスクロールに任せる）。短く押すと onTap */
function LongPress({ onLong, onTap, className, style, label, children }: {
  onLong: (x: number, y: number) => void; onTap: () => void; className?: string; style?: React.CSSProperties; label?: string; children: ReactNode;
}) {
  const t = useRef<{ x: number; y: number; timer: ReturnType<typeof setTimeout> | null; fired: boolean } | null>(null);
  const clear = () => { if (t.current?.timer) clearTimeout(t.current.timer); };
  return (
    <button type="button" aria-label={label} className={`pressable select-none ${className ?? ''}`}
      style={{ ...style, WebkitTouchCallout: 'none' }}
      onContextMenu={(e) => e.preventDefault()}
      onDragStart={(e) => e.preventDefault()}
      onPointerDown={(e) => {
        const x = e.clientX, y = e.clientY;
        t.current = { x, y, fired: false, timer: setTimeout(() => { if (t.current) { t.current.fired = true; onLong(x, y); } }, 380) };
      }}
      onPointerMove={(e) => {
        const c = t.current;
        // 運び始めたら、外側の行のスワイプに指の動きを渡さない
        if (c?.fired) { e.stopPropagation(); return; }
        if (c && Math.hypot(e.clientX - c.x, e.clientY - c.y) > 8) { clear(); t.current = null; }
      }}
      onPointerUp={() => { clear(); }}
      onPointerCancel={() => { clear(); if (!t.current?.fired) t.current = null; }}
      onClick={() => { const fired = t.current?.fired; t.current = null; if (!fired) { haptic.select(); onTap(); } }}>
      {children}
    </button>
  );
}

// ─ カレンダーの部品 ─

/** カレンダーの1日。作品の点（最大3つ）・締切の〆・イベントの紫の輪。compact は週の帯（曜日を中に書く） */
function DayCell({ d, dow, today, list: all, active, event, outside, compact, hot, dot, onPick }: {
  d: string; dow: number; today: string; list: Moment[]; active: boolean; event: boolean; outside: boolean; compact?: boolean; hot?: boolean;
  dot: DotFn; onPick: (d: string) => void;
}) {
  if (outside) return <span className="h-[54px]" />;
  const list = all.filter((m) => m.mark !== '行');
  const ws = [...new Set(list.map((m) => m.e.workId ?? ''))];
  const deadline = list.some((m) => m.mark === '〆');
  const isToday = d === today, past = d < today;
  return (
    <button type="button" data-cal-day={d} onClick={() => onPick(d)} aria-label={`${md(d)}${list.length ? `・予定${list.length}件` : ''}${deadline ? '・締切あり' : ''}`}
      className={`pressable relative flex flex-col items-center gap-[3px] rounded-[10px] ${compact ? 'h-[56px] pt-[2px] gap-[2px]' : 'h-[54px] pt-[3px]'}`}
      style={{ backgroundColor: hot ? 'color-mix(in srgb, var(--accent-color) 30%, transparent)' : active && !isToday ? 'var(--fill-tertiary)' : undefined }}>
      {compact && <span className="text-[10px] font-semibold leading-none" style={{ color: dayColor(dow) ?? 'var(--label-secondary)' }}>{WEEKDAYS[dow]}</span>}
      <span className={`${compact ? 'w-6 h-6 text-[13px]' : 'w-7 h-7 text-[14px]'} rounded-full flex items-center justify-center font-semibold tabular-nums`}
        style={isToday ? { backgroundColor: 'var(--accent-color)', color: 'var(--accent-on)', fontWeight: 700 }
          : { color: past ? 'var(--label-tertiary)' : dayColor(dow) ?? 'var(--label-primary)', boxShadow: event ? `inset 0 0 0 2px ${MARKS['イ'].color}` : undefined }}>
        {parse(d).getDate()}
      </span>
      <span className="flex items-center justify-center h-5" style={{ opacity: past ? 0.35 : 1 }}>
        {ws.slice(0, 3).map((id, k) => <span key={id || k} style={{ marginLeft: k ? -3 : 0 }}>{dot(id || undefined, list.length >= 6 ? 20 : 18)}</span>)}
        {ws.length > 3 && <span className="text-[10px] font-bold text-label-secondary ml-px">+</span>}
      </span>
      {deadline && (
        <span className="absolute text-[11px] font-extrabold leading-none px-[2px] rounded-[4px]"
          style={{ top: compact ? 12 : 0, left: 'calc(50% + 9px)', color: MARKS['〆'].color, backgroundColor: 'var(--bg-primary)', opacity: past ? 0.35 : 1 }}>〆</span>
      )}
    </button>
  );
}

function relLabel(day: string, today: string): string {
  const n = daysBetween(today, day);
  return n === 0 ? '今日' : n > 0 ? `あと${n}日` : `${-n}日前`;
}

// ─ 日ごとの行 ─

/** 左に「あと○日」（大きく）と日付、縦の線でつなぎ、右に中身 */
function DayRow({ day, today, last, hot, guess, children }: { day: string | null; today: string; last?: boolean; hot?: boolean; guess?: boolean; children: ReactNode }) {
  const isToday = day === today;
  const n = day ? daysBetween(today, day) : 0;
  const soon = day && !isToday && n <= 3;
  const dow = day ? dowOf(day) : 0;
  return (
    // hot＝日付未定の予定を運んでいて、この日の上にいる
    <div data-board-day={day ?? undefined} className="grid rounded-[14px] transition-colors" style={{ gridTemplateColumns: '60px 16px minmax(0,1fr)', backgroundColor: hot ? 'color-mix(in srgb, var(--accent-color) 22%, transparent)' : undefined }}>
      <div className="flex flex-col items-center pt-2 text-center">
        {day === null ? (
          <span className="text-[11px] font-semibold text-label-secondary pt-2 leading-tight">日付<br />未定</span>
        ) : guess && !isToday ? (
          // 仮置きだけの日。日付は自分の見立てなので、日付も「あと○日」も出さない
          null
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
            backgroundColor: isToday ? 'var(--accent-color)' : 'var(--bg-primary)', border: guess ? '2px dashed var(--label-tertiary)' : '2px solid var(--label-primary)',
          }} />
        )}
      </div>
      <div className="min-w-0 pt-2 pb-3 flex flex-col gap-2.5">{children}</div>
    </div>
  );
}

type DotFn = (workId: string | undefined, size: number) => ReactNode;

/** その日の予定。3件までは全部、4件目からは小さい画像で並べる */
function Group({ list, today, dot, onOpen, onRemove, onAll, onDrag }: {
  list: Moment[]; today: string; dot: DotFn; onOpen: (e: CalendarEvent) => void; onRemove: (e: CalendarEvent) => void; onAll: () => void;
  onDrag?: (m: Moment, x: number, y: number) => void;
}) {
  // 重要な予定（★）を先に
  const important = useImportant();
  list = [...list].sort((a, b) => Number(important.has(b.e.id)) - Number(important.has(a.e.id)));
  const few = list.length <= 3;
  const head = few ? list : list.slice(0, 2);
  const rest = few ? [] : list.slice(2);
  return (
    <section className="rounded-[14px] overflow-hidden" style={{ backgroundColor: 'var(--bg-secondary)', boxShadow: 'inset 0 0 0 0.5px var(--separator)' }}>
      {head.map((m, i) => (
        <div key={`${m.e.id}-${m.mark}-${m.label ?? ''}`} style={{ borderTop: i ? '0.5px solid var(--separator)' : undefined }}>
          <ItemRow m={m} today={today} dot={dot} onOpen={onOpen} onRemove={onRemove} onDrag={onDrag} />
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
function ItemRow({ m, today, dot, onOpen, onRemove, hideMark, onDrag }: {
  m: Moment; today: string; dot: DotFn; onOpen: (e: CalendarEvent) => void; onRemove: (e: CalendarEvent) => void; hideMark?: boolean;
  onDrag?: (m: Moment, x: number, y: number) => void;
}) {
  const e = m.e;
  const star = useImportant().has(e.id);
  // 仮に置いた日付未定の予定。点線の枠で見分け、長押しで別の日へ・日付未定の欄へ運び直せる。スワイプはほかの行と同じ
  if (m.tentative) {
    return (
      <SwipeRow label="外す" onSwipe={() => onRemove(e)} right={{ ...IMPORTANT_SIDE(star), onSwipe: () => toggleImportant(e.id) }}>
        <LongPress onLong={(x, y) => onDrag?.(m, x, y)} onTap={() => onOpen(e)} label={e.title}
          className="relative w-full flex items-center gap-2.5 px-3 py-2.5 text-left"
          style={{ backgroundColor: star ? 'color-mix(in srgb, #f59e0b 12%, var(--bg-secondary))' : 'var(--bg-secondary)' }}>
          <span aria-hidden className="absolute inset-1 rounded-[10px] pointer-events-none" style={{ border: '1.5px dashed var(--label-tertiary)' }} />
          <Pic e={e} size={56} />
          <span className="min-w-0 flex-1 flex flex-col gap-[3px]">
            <span className="flex items-center gap-1.5 min-w-0 text-[11px] text-label-secondary">
              <b className="inline-flex items-center justify-center w-[18px] h-[18px] rounded-[5px] text-[11px]" style={{ border: '1.5px dashed var(--label-secondary)', color: 'var(--label-primary)' }}>仮</b>
              <MarkChip mark={m.mark} label={false} />
              <span className="font-semibold text-label-primary truncate flex-shrink-0 max-w-[40%]">{m.label?.replace(/^(発売|開催) /, '')}</span>
              <span className="flex items-center gap-1 min-w-0">{dot(e.workId, 15)}<span className="truncate">{e.workName}</span></span>
            </span>
            <span className="text-[13px] font-semibold leading-snug line-clamp-2">
              {star && <span aria-label="重要" className="mr-0.5" style={{ color: '#f59e0b' }}>★</span>}{stripWorkName(e.title, e.workName)}
            </span>
          </span>
        </LongPress>
      </SwipeRow>
    );
  }
  const sub = m.mark === '行' || (m.mark === 'イ' && m.end)
    ? `${m.mark === '行' ? (m.end ? `${md(m.day)}〜${md(m.end)}・` : '') : ''}会期 ${e.date ? mdy(e.date, today) : ''}${e.endDate ? `〜${mdy(e.endDate, today)}` : ''}`
    : null;
  return (
    <SwipeRow label="外す" disabled={e.personal} onSwipe={() => onRemove(e)}
      right={{ ...IMPORTANT_SIDE(star), onSwipe: () => toggleImportant(e.id) }}>
      <button className="relative w-full flex items-center gap-2.5 px-3 py-2.5 text-left select-none"
        style={{ backgroundColor: star ? 'color-mix(in srgb, #f59e0b 12%, var(--bg-secondary))' : 'var(--bg-secondary)' }}
        onClick={() => { haptic.select(); onOpen(e); }}>
        <Pic e={e} size={56} />
        <span className="min-w-0 flex-1 flex flex-col gap-[3px]">
          <span className="flex items-center gap-1.5 min-w-0 text-[11px] text-label-secondary">
            {!hideMark && <MarkChip mark={m.mark} label={false} />}
            {m.label && <span className="font-semibold text-label-primary truncate flex-shrink-0 max-w-[40%]">{m.label}</span>}
            <span className="flex items-center gap-1 min-w-0">{dot(e.workId, 15)}<span className="truncate">{e.workName}</span></span>
          </span>
          <span className="text-[13px] font-semibold leading-snug line-clamp-2">
            {star && <span aria-label="重要" className="mr-0.5" style={{ color: '#f59e0b' }}>★</span>}{stripWorkName(e.title, e.workName)}
          </span>
          <span className="text-[12px] tabular-nums">
            {sub ? <span className="text-label-secondary">{sub}</span>
              : e.price ? <b>¥{e.price.toLocaleString('ja-JP')}</b>
              : deriveIsGoods(e) ? <span className="text-label-tertiary text-[11px]">価格未定</span> : null}
          </span>
        </span>
      </button>
    </SwipeRow>
  );
}

const deriveIsGoods = (e: CalendarEvent) => deriveItemType(e) === 'goods';

/** 会期の帯。全部のイベントを同じ目盛りで並べ、今日の線と行く日の点を重ねる。
 *  画像とイベント名を押すと詳細、帯と「行く日を選ぶ」を押すと行く日のカレンダー（2026-11-07 柴野） */
function Gantt({ list, today, colors, dot, onDetail, onVisit }: {
  list: CalendarEvent[]; today: string; colors: Map<string, string>; dot: DotFn; onDetail: (e: CalendarEvent) => void; onVisit: (e: CalendarEvent) => void;
}) {
  const g0 = addDays(today, -7), g1 = addDays(today, 75);
  const span = daysBetween(g0, g1);
  const x = (d: string) => (Math.max(0, Math.min(span, daysBetween(g0, d))) / span) * 100;
  const months: string[] = [];
  for (let m = addMonths(g0, 1); m <= g1; m = addMonths(m, 1)) months.push(m);
  return (
    <div className="px-3 pb-2">
      <div className="relative h-4 text-[10px] text-label-tertiary" style={{ marginLeft: 52 }}>
        {months.map((m) => <span key={m} className="absolute top-0" style={{ left: `${x(m)}%` }}>{Number(m.slice(5, 7))}月</span>)}
      </div>
      {list.map((e) => {
        const a = x(e.date!), b = x(e.endDate!);
        const visits = (e.visits ?? []).filter((v) => v.end >= today).sort((p, q) => p.start.localeCompare(q.start));
        const rest = e.date! > today ? <><b className="text-label-primary">{daysBetween(today, e.date!)}日後</b>から</> : e.endDate === today ? <b className="text-label-primary">今日まで</b> : <>あと<b className="text-label-primary">{daysBetween(today, e.endDate!)}日</b></>;
        const color = (e.workId && colors.get(e.workId)) || 'var(--accent-color)';
        return (
          <div key={e.id} className="flex gap-2 py-2" style={{ borderTop: '0.5px solid var(--separator)' }}>
            <button className="pressable flex-shrink-0 self-start" aria-label={`${e.title}の詳細`} onClick={() => { haptic.select(); onDetail(e); }}>
              <Pic e={e} size={44} />
            </button>
            <div className="flex-1 min-w-0">
              <button className="pressable w-full flex items-center gap-1.5 text-left" onClick={() => { haptic.select(); onDetail(e); }}>
                {dot(e.workId, 15)}
                <span className="flex-1 min-w-0 truncate text-[12px] font-semibold">{stripWorkName(e.title, e.workName)}</span>
                <span className="text-[11px] text-label-secondary whitespace-nowrap tabular-nums">{rest}</span>
              </button>
              <button className="pressable block w-full text-left" onClick={() => { haptic.select(); onVisit(e); }}>
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
                    ? `行く日 ${visits.map((v) => `${md(v.start)}（${WEEKDAYS[dowOf(v.start)]}）`).join('・')} ›`
                    : `会期 ${mdy(e.date!, today)}〜${mdy(e.endDate!, today)}・行く日を選ぶ ›`}
                </span>
              </button>
            </div>
          </div>
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

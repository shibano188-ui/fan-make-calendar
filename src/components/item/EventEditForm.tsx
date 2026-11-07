import { useEffect, useRef, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import type { CalendarEvent } from '../../types';
import type { EventPatch } from '../../lib/api';
import { todayStr, deriveItemType } from '../../design/tokens';
import { SEASON_LABELS, DATE_LABEL_OPTIONS, ambiguousDate } from '../../lib/ambiguousDate';
import { haptic } from '../../lib/haptics';
import { MARKS, type Mark } from '../board/boardModel';
import DateRangeCalendar from './DateRangeCalendar';

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];
const mdw = (s: string) => `${Number(s.slice(5, 7))}/${Number(s.slice(8, 10))}（${WEEKDAYS[new Date(s + 'T00:00:00').getDay()]}）`;

type Slot = 'main' | 'order';
type Edge = 'start' | 'end';

/** 日時/予約の編集（共同編集用）。実効値を初期値にし、保存でパッチを返す。
 *  2026-11-07 柴野: 日付の入力欄をやめ、カレンダーで選ぶ形にした（行く日を選ぶのと同じ考え）。
 *    上の行で「発売（開催）」か「予約（受付）」を選び、カレンダーでタップすると1日、長押しして引っぱると期間。
 *    終わりの日だけ変えたいとき・月をまたぐ期間は、行の「終わり」を押してからタップする
 *  日付未定は投稿フォームと同じ曖昧日付モデル（dateLabel＋代表日）で保存する。
 *  パネルに埋め込むときは showActions={false} にして、変更を onChange で受け取り
 *  外側の「追加」ボタンでまとめて送る。 */
export default function EventEditForm({ event, onSave, onClose, onChange, showActions = true }: {
  event: CalendarEvent; onSave: (patch: EventPatch) => void; onClose: () => void;
  onChange?: (patch: EventPatch | null) => void; showActions?: boolean;
}) {
  const today = todayStr();
  const goods = deriveItemType(event) === 'goods';
  // 曖昧日付（dateLabel あり）は「日付未定」扱いで初期化する
  const [dateTBD, setDateTBD] = useState(!event.date || !!event.dateLabel);
  const [dateLabel, setDateLabel] = useState(event.dateLabel ?? '');
  const [allDay, setAllDay] = useState(!event.time);
  const [date, setDate] = useState(event.date ?? today);
  const [endDate, setEndDate] = useState(event.endDate ?? event.date ?? today);
  const [time, setTime] = useState(event.time ?? '');
  // 予約の日付が入っていれば、予約ありとして見せる（isOrderMade が付いていない予定がある）
  const [isOrder, setIsOrder] = useState(!!(event.isOrderMade || event.preorderStart || event.preorderEnd));
  const [preStart, setPreStart] = useState(event.preorderStart ?? '');
  const [preEnd, setPreEnd] = useState(event.preorderEnd ?? '');
  // カレンダーで選んでいる欄と、その始まり・終わりのどちらか
  const [slot, setSlot] = useState<Slot>('main');
  const [edge, setEdge] = useState<Edge>('start');

  const year = date ? date.slice(0, 4) : String(new Date().getFullYear());
  const month = date ? date.slice(5, 7) : String(new Date().getMonth() + 1).padStart(2, '0');

  const buildPatch = (): EventPatch => ({
    // 日付未定: 代表日＋dateLabel（投稿フォームと同じモデル）。具体日: dateLabel をクリア
    date: date || null,
    dateLabel: dateTBD ? (dateLabel || null) : null,
    endDate: dateTBD ? null : (endDate || date || null),
    time: allDay || dateTBD ? null : (time || null),
    isOrderMade: isOrder,
    preorderStart: isOrder ? (preStart || undefined) : undefined,
    preorderEnd: isOrder ? (preEnd || undefined) : undefined,
  } as EventPatch);

  const save = () => {
    haptic.select();
    onSave(buildPatch());
  };

  // 埋め込みのときは、**開いたときの値から変わった項目だけ**を外へ渡す。
  // 日付が未定の予定は欄に今日が入るので、丸ごと渡すと触っていない日付まで足してしまう。
  // 触っていない＝差がなければ null（＝送るものが無い）。
  const initial = useRef<Record<string, unknown> | null>(null);
  useEffect(() => {
    const patch = buildPatch() as Record<string, unknown>;
    if (initial.current === null) { initial.current = patch; return; }
    const diff: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(patch)) {
      if (JSON.stringify(v) !== JSON.stringify(initial.current[k])) diff[k] = v;
    }
    onChange?.(Object.keys(diff).length ? (diff as EventPatch) : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateTBD, dateLabel, allDay, date, endDate, time, isOrder, preStart, preEnd]);

  const pick = (s: Slot, e: Edge) => { haptic.select(); setSlot(s); setEdge(e); };

  // カレンダーをタップした日
  const onTap = (d: string) => {
    if (slot === 'main') {
      const wasTBD = dateTBD;
      if (wasTBD) { setDateTBD(false); setDateLabel(''); }
      // 終わりを選んでいるとき: 始まりより前なら1日にする
      if (edge === 'end' && !wasTBD) {
        if (d < date) { setDate(d); setEndDate(d); } else setEndDate(d);
        return;
      }
      // 1日だけの予定は、その日へ動かす。期間のある予定は始まりだけ動かす（終わりより後なら1日に）
      const single = wasTBD || !endDate || endDate === date;
      setDate(d);
      if (single || endDate < d) setEndDate(d);
      return;
    }
    // 予約は期間なので、始まり → 終わりの順に選ぶ
    setIsOrder(true);
    if (edge === 'end') {
      if (preStart && d < preStart) { setPreStart(d); setPreEnd(''); } else setPreEnd(d);
      return;
    }
    setPreStart(d);
    if (preEnd && preEnd < d) setPreEnd('');
    setEdge('end');
  };
  // 長押しして引っぱった期間
  const onRange = (a: string, b: string) => {
    if (slot === 'main') { setDateTBD(false); setDateLabel(''); setDate(a); setEndDate(b); }
    else { setIsOrder(true); setPreStart(a); setPreEnd(b); }
  };

  const mainMark: Mark = goods ? '発' : 'イ';
  const mainColor = MARKS[mainMark].color;
  const calStart = slot === 'main' ? (dateTBD ? null : date) : (isOrder ? preStart || preEnd || null : null);
  const calEnd = slot === 'main' ? (dateTBD ? null : endDate || date) : (isOrder ? preEnd || preStart || null : null);
  // ほかの欄の日付は点で添える（予約の締切と発売の日の並びが見えるように）
  const dots: Record<string, string[]> = {};
  const dot = (d: string | null | undefined, c: string) => { if (d) (dots[d] ??= []).push(c); };
  if (slot === 'main' && isOrder) { dot(preStart, MARKS['受'].color); dot(preEnd, MARKS['〆'].color); }
  if (slot === 'order' && !dateTBD) { dot(date, mainColor); if (endDate && endDate !== date) dot(endDate, mainColor); }

  const tbdText = (() => {
    const y = year !== today.slice(0, 4) ? `${year}年` : '';
    if (SEASON_LABELS.includes(dateLabel)) return `${y}${dateLabel}`;
    if (dateLabel === '中') return `${y}${Number(month)}月`;
    return `${y}${Number(month)}月${dateLabel}`;
  })();

  // 発売・開催は「日にち」か「時期だけ（下旬・春頃など）」。カレンダーの見出しの横に置く（押すたびに切り替え）
  const tbdToggle = (
    <button type="button" aria-pressed={dateTBD}
      onClick={() => {
        haptic.select();
        if (dateTBD) { setDateTBD(false); setDateLabel(''); return; }
        // 時期だけ: 既定で「中旬」。代表日も当月15日にしておく
        const ym = (date || today).slice(0, 7);
        setDateTBD(true); setDateLabel('中旬'); setDate(`${ym}-15`);
      }}
      className="pressable h-8 px-3 rounded-full text-[12px] font-bold whitespace-nowrap"
      style={dateTBD ? { backgroundColor: 'var(--label-primary)', color: 'var(--bg-primary)' } : { backgroundColor: 'var(--fill-tertiary)', color: 'var(--label-secondary)' }}>
      時期だけ
    </button>
  );

  return (
    <div className={showActions ? 'mt-3 rounded-[16px] p-3' : 'mt-1'}
      style={showActions ? { backgroundColor: 'var(--bg-secondary)', boxShadow: 'inset 0 0 0 0.5px var(--separator)' } : undefined}>
      {/* どの日付を選ぶか。押した行（とその始まり・終わり）をカレンダーで選ぶ */}
      <div className="flex flex-col">
        <SlotRow mark={mainMark} label={goods ? '発売' : '開催'} active={slot === 'main'} onPick={() => pick('main', 'start')}>
          {dateTBD ? (
            <Value active={slot === 'main'} onClick={() => pick('main', 'start')}>{tbdText}</Value>
          ) : (
            <>
              <Value active={slot === 'main' && edge === 'start'} onClick={() => pick('main', 'start')}>{mdw(date)}</Value>
              <span className="text-[12px] text-label-tertiary">〜</span>
              <Value active={slot === 'main' && edge === 'end'} onClick={() => pick('main', 'end')}
                placeholder={!endDate || endDate === date ? '終わり' : undefined}>{endDate && endDate !== date ? mdw(endDate) : null}</Value>
            </>
          )}
        </SlotRow>
        <SlotRow mark="受" label={goods ? '予約' : '受付'} active={slot === 'order'} onPick={() => pick('order', 'start')}
          trailing={isOrder && (
            <button type="button" aria-label={`${goods ? '予約' : '受付'}をなしにする`} className="pressable tap-44 text-label-tertiary"
              onClick={() => { haptic.select(); setIsOrder(false); setSlot('main'); setEdge('start'); }}><X size={16} /></button>
          )}>
          {isOrder ? (
            <>
              <Value active={slot === 'order' && edge === 'start'} onClick={() => pick('order', 'start')} placeholder={preStart ? undefined : '始まり'}>{preStart ? mdw(preStart) : null}</Value>
              <span className="text-[12px] text-label-tertiary">〜</span>
              <Value active={slot === 'order' && edge === 'end'} onClick={() => pick('order', 'end')} placeholder={preEnd ? undefined : '締切'}>{preEnd ? mdw(preEnd) : null}</Value>
            </>
          ) : (
            <Value active={slot === 'order'} onClick={() => pick('order', 'start')} placeholder="なし">{null}</Value>
          )}
        </SlotRow>
      </div>

      {slot === 'main' && dateTBD ? (
        /* 曖昧日付（年 / 月 / 時期）。投稿フォームと同じ値 */
        <div className="mt-2 flex flex-col gap-3">
          <div className="flex items-center h-10">
            <span className="text-[13px] font-extrabold">時期</span>
            <span className="ml-auto">{tbdToggle}</span>
          </div>
          <PillRow>
            {[-1, 0, 1, 2].map((o) => {
              const y = String(new Date().getFullYear() + o);
              return <Pill key={y} on={year === y} onClick={() => setDate(ambiguousDate(y, month || '01', dateLabel))}><span className="num">{y}</span>年</Pill>;
            })}
          </PillRow>
          {!SEASON_LABELS.includes(dateLabel) && (
            <div className="grid grid-cols-6 gap-1.5">
              {Array.from({ length: 12 }, (_, i) => {
                const m = String(i + 1).padStart(2, '0');
                return <Pill key={m} on={month === m} wide onClick={() => setDate(ambiguousDate(year, m, dateLabel))}><span className="num">{i + 1}</span>月</Pill>;
              })}
            </div>
          )}
          <PillRow>
            {DATE_LABEL_OPTIONS.map(([label, val]) => (
              <Pill key={val} on={dateLabel === val} onClick={() => { setDateLabel(val); setDate(ambiguousDate(year, month, val)); }}>{label}</Pill>
            ))}
          </PillRow>
        </div>
      ) : (
        <>
          <div className="mt-2">
            <DateRangeCalendar start={calStart} end={calEnd} dots={dots} onTap={onTap} onRange={onRange}
              focus={slot === 'main' ? date : preStart || preEnd || null} extra={slot === 'main' ? tbdToggle : undefined} />
          </div>
          <p className="mt-1 text-[11px] text-label-secondary text-center">
            {slot === 'order' ? `${edge === 'start' ? '始まりの日' : '締切の日'}をタップ・長押しして引っぱると期間` : 'タップで1日・長押しして引っぱると期間'}
          </p>
        </>
      )}

      {/* 時刻（発売・開催の日だけ） */}
      {slot === 'main' && !dateTBD && (
        <div className="mt-3 flex items-center gap-2">
          <span className="text-[12px] font-bold text-label-secondary w-10">時刻</span>
          <Pill on={allDay || !time} onClick={() => { setAllDay(true); setTime(''); }}>終日</Pill>
          {/* 時刻が空のときは「時刻を入れる」の上に透明の入力欄を重ね、押すと端末の時刻の選び方が開く */}
          <label className="pressable relative h-8 rounded-full flex items-center px-3 text-[13px] font-bold"
            style={!allDay && time ? { backgroundColor: 'var(--label-primary)', color: 'var(--bg-primary)' } : { backgroundColor: 'var(--fill-tertiary)' }}>
            {!time && <span>時刻を入れる</span>}
            <input type="time" value={time} aria-label="時刻"
              onChange={(e) => { setTime(e.target.value); setAllDay(!e.target.value); }}
              className={time ? 'num bg-transparent outline-none text-[14px] font-bold w-[84px]' : 'absolute inset-0 w-full h-full opacity-0'}
              style={{ color: 'inherit' }} />
          </label>
        </div>
      )}

      {showActions && (
        <div className="flex gap-2 mt-4">
          <button onClick={onClose} className="pressable flex-1 h-11 rounded-[12px] text-[14px] font-semibold" style={{ backgroundColor: 'var(--fill-tertiary)', color: 'var(--label-primary)' }}>キャンセル</button>
          <button onClick={save} className="pressable flex-1 h-11 rounded-[12px] text-[14px] font-bold" style={{ backgroundColor: 'var(--accent-color)', color: 'var(--accent-on)' }}>保存</button>
        </div>
      )}
    </div>
  );
}

/** 選ぶ日付の1行（〆受発の印・名前・始まり〜終わり）。選んでいる行は薄く塗る */
function SlotRow({ mark, label, active, onPick, trailing, children }: {
  mark: Mark; label: string; active: boolean; onPick: () => void; trailing?: ReactNode; children: ReactNode;
}) {
  const k = MARKS[mark];
  return (
    <div className="flex items-center gap-2 min-h-[48px] px-2 rounded-[12px] transition-colors"
      style={{ backgroundColor: active ? 'var(--fill-quaternary)' : undefined }}>
      <button type="button" onClick={onPick} className="pressable flex items-center gap-1.5 flex-shrink-0 w-[58px]">
        <b className="inline-flex items-center justify-center w-[18px] h-[18px] rounded-[5px] text-[11px]" style={{ backgroundColor: k.color, color: k.ink }}>{mark}</b>
        <span className="text-[13px] font-bold">{label}</span>
      </button>
      <div className="flex-1 min-w-0 flex items-center gap-1.5">{children}</div>
      {trailing}
    </div>
  );
}

/** 日付の値。カレンダーで選んでいる方に下線 */
function Value({ active, onClick, placeholder, children }: { active: boolean; onClick: () => void; placeholder?: string; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active}
      className="pressable relative py-1.5 whitespace-nowrap">
      {children
        ? <span className="num text-[16px] font-extrabold">{children}</span>
        : <span className="text-[13px] font-semibold text-label-tertiary">{placeholder}</span>}
      <span aria-hidden className="absolute inset-x-0 bottom-0 h-[2px] rounded-full transition-opacity"
        style={{ backgroundColor: 'var(--label-primary)', opacity: active ? 1 : 0 }} />
    </button>
  );
}

function PillRow({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap gap-1.5">{children}</div>;
}

/** 選ぶ丸い札。選んでいるものは黒（カレンダーで選んだ日と同じ） */
function Pill({ on, onClick, wide, children }: { on: boolean; onClick: () => void; wide?: boolean; children: ReactNode }) {
  return (
    <button type="button" aria-pressed={on} onClick={() => { haptic.select(); onClick(); }}
      className={`pressable h-8 rounded-full text-[13px] font-bold whitespace-nowrap ${wide ? 'w-full' : 'px-3'}`}
      style={on ? { backgroundColor: 'var(--label-primary)', color: 'var(--bg-primary)' } : { backgroundColor: 'var(--fill-tertiary)', color: 'var(--label-primary)' }}>
      {children}
    </button>
  );
}

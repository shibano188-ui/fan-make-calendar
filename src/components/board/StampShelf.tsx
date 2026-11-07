import { useEffect, useMemo, useState } from 'react';
import { Heart } from 'lucide-react';
import type { CalendarEvent } from '../../types';
import OptImg from '../ui/OptImg';
import { todayStr } from '../../design/tokens';
import { daysBetween } from '../../lib/relativeDay';
import { haptic } from '../../lib/haptics';
import { parseImageUrls } from '../../lib/constants';
import { stripWorkName } from '../../lib/stripWorkName';
import { REACTIONS, stampInfo } from '../../lib/reactions';
import { listMyStampedEvents, type StampedEvent } from '../../lib/api';
import { MARKS, momentsOf, undatedMoments, type Moment } from './boardModel';

// 探すの「スタンプ」（2026-11-07 柴野。はじめカレンダーに置いたが、探しているときに使うので探すへ移した）。♡（カレンダーに入れる）ほどではないけど、とっておきたい予定。
// 押したスタンプの種類で絞って、画像を並べて眺める。近い節目（締切・発売…）があるものから並べ、過ぎたものは下に薄く。
// ♡ を押すとカレンダー（ボード）にも入る

// 開き直すたびに読み込み中を挟まないよう、前回の結果を覚えておく（同じアカウントのときだけ使う）
let memo: { userId: string; list: StampedEvent[] } | null = null;

type Props = {
  userId: string;
  /** カレンダーに入っている予定（♡ の状態） */
  likedIds: Set<string>;
  /** 作品の絞り込み（上の作品の並びで外した作品） */
  excludedWorks: Set<string>;
  onOpen: (e: CalendarEvent) => void;
  /** ♡ を押したとき（カレンダーに入れる・外す） */
  onLike: (e: CalendarEvent) => void;
};

const md = (s: string) => `${Number(s.slice(5, 7))}/${Number(s.slice(8, 10))}`;

/** 次の節目（今日以降で一番近いもの）。無ければ null */
function nextMoment(e: CalendarEvent, today: string): Moment | null {
  const m = momentsOf(e).filter((x) => x.mark !== '行' && (x.end ?? x.day) >= today).sort((a, b) => a.day.localeCompare(b.day))[0];
  if (m) return m;
  // 「11月中旬」など時期だけの予定（まだその時期が過ぎていないもの）。並びは仮の日、表示は時期（label）
  const v = undatedMoments([e], today)[0];
  return v && e.date && e.dateLabel ? { ...v, day: e.date } : null;
}

export default function StampShelf({ userId, likedIds, excludedWorks, onOpen, onLike }: Props) {
  const today = todayStr();
  const [list, setList] = useState<StampedEvent[] | null>(memo?.userId === userId ? memo.list : null);
  const [failed, setFailed] = useState(false);
  const [only, setOnly] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    listMyStampedEvents(userId)
      .then((l) => { memo = { userId, list: l }; if (alive) { setList(l); setFailed(false); } })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [userId]);

  const shown = useMemo(() => (list ?? []).filter((s) => !(s.event.workId && excludedWorks.has(s.event.workId))), [list, excludedWorks]);
  // 種類ごとの数。前の種類（楽しみ・おめでとう…）の札は出さない（2026-11-07 柴野。押した予定は「すべて」に並ぶ）
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const s of shown) for (const k of new Set(s.stamps)) c[k] = (c[k] ?? 0) + 1;
    return c;
  }, [shown]);
  const filtered = useMemo(() => {
    const l = only === null ? shown : shown.filter((s) => s.stamps.includes(only));
    const withNext = l.map((s) => ({ ...s, next: nextMoment(s.event, today) }));
    // これからの節目がある予定は近い順、ないもの（過ぎた・日付未定）は押した新しい順で下に
    const up = withNext.filter((s) => s.next).sort((a, b) => a.next!.day.localeCompare(b.next!.day));
    const rest = withNext.filter((s) => !s.next);
    return { up, rest };
  }, [shown, only, today]);

  if (list === null) {
    return failed
      ? <p className="text-center text-label-secondary text-[13px] py-14">読み込めませんでした。通信を確かめてください</p>
      : <div className="grid grid-cols-3 gap-2 pt-3">{Array.from({ length: 6 }, (_, i) => <div key={i} className="rounded-[12px] aspect-[3/4] animate-pulse" style={{ backgroundColor: 'var(--fill-tertiary)' }} />)}</div>;
  }
  if (!shown.length) {
    return (
      <div className="text-center py-14 px-6">
        <div className="flex justify-center gap-1 mb-3 opacity-80">{REACTIONS.map((r) => <img key={r.type} src={r.image} alt="" className="stamp w-9 h-9" />)}</div>
        <p className="text-[14px] font-semibold">スタンプを押した予定がここにたまります</p>
      </div>
    );
  }

  const chips: { key: string | null; label: string; image?: string; n: number }[] = [
    { key: null, label: 'すべて', n: shown.length },
    ...REACTIONS.filter((r) => counts[r.type]).map((r) => ({ key: r.type, label: r.label, image: r.image, n: counts[r.type] })),
  ];

  return (
    <div className="pb-6">
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-3 px-3 pt-3 pb-2">
        {chips.map((c) => {
          const on = only === c.key;
          return (
            <button key={c.key ?? 'all'} aria-pressed={on} onClick={() => { haptic.select(); setOnly(c.key); }}
              className="pressable flex-shrink-0 h-9 pl-2.5 pr-3 rounded-full flex items-center gap-1 text-[13px] font-semibold"
              style={on ? { backgroundColor: 'var(--label-primary)', color: 'var(--bg-primary)' } : { backgroundColor: 'var(--fill-tertiary)', color: 'var(--label-primary)' }}>
              {c.image ? <img src={c.image} alt={c.label} className="stamp w-6 h-6" /> : <span className="pl-0.5">{c.label}</span>}
              <span className="tabular-nums text-[12px]" style={{ opacity: 0.7 }}>{c.n}</span>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-3 gap-x-2 gap-y-3">
        {filtered.up.map((s) => <StampCard key={s.event.id} s={s} next={s.next} today={today} liked={likedIds.has(s.event.id)} onOpen={onOpen} onLike={onLike} />)}
      </div>
      {filtered.rest.length > 0 && (
        <>
          <div className="text-[12px] font-semibold text-label-secondary pt-5 pb-2">過ぎた予定・日付未定</div>
          <div className="grid grid-cols-3 gap-x-2 gap-y-3 opacity-60">
            {filtered.rest.map((s) => <StampCard key={s.event.id} s={s} next={null} today={today} liked={likedIds.has(s.event.id)} onOpen={onOpen} onLike={onLike} />)}
          </div>
        </>
      )}
    </div>
  );
}

function StampCard({ s, next, today, liked, onOpen, onLike }: {
  s: StampedEvent; next: ReturnType<typeof nextMoment>; today: string; liked: boolean;
  onOpen: (e: CalendarEvent) => void; onLike: (e: CalendarEvent) => void;
}) {
  const e = s.event;
  const src = parseImageUrls(e.imageUrl)[0];
  const [err, setErr] = useState(false);
  // 判子は押した種類のうち、並びが先のもの（前の種類しか無ければそれ）
  const seal = REACTIONS.find((r) => s.stamps.includes(r.type)) ?? stampInfo(s.stamps[0]);
  const n = next ? daysBetween(today, next.day) : 0;
  const soon = next && !next.label && n >= 0 && n <= 3;
  return (
    <div className="relative min-w-0">
      <button className="pressable block w-full text-left" onClick={() => { haptic.select(); onOpen(e); }}>
        <span className="relative block aspect-square rounded-[12px] overflow-hidden" style={{ backgroundColor: 'var(--fill-tertiary)' }}>
          {src && !err && <OptImg src={src} w={384} alt="" loading="lazy" className="w-full h-full object-contain" onError={() => setErr(true)} />}
          {seal && (
            <img src={seal.image} alt={seal.label} className="stamp absolute right-1 bottom-1 w-9 h-9"
              style={{ transform: 'rotate(-8deg)', filter: 'drop-shadow(0 1px 1px rgba(0,0,0,.25))' }} />
          )}
        </span>
        {next ? (
          <span className="flex items-center gap-1 mt-1.5 text-[11px] font-bold whitespace-nowrap" style={{ color: soon ? MARKS['〆'].color : 'var(--label-secondary)' }}>
            <b className="inline-flex items-center justify-center w-4 h-4 rounded-[4px] text-[10px]" style={{ backgroundColor: MARKS[next.mark].color, color: MARKS[next.mark].ink }}>{next.mark}</b>
            {/* 何日か続くイベントの途中なら「開催中」と最終日 */}
            {next.label ? <span className="font-semibold">{next.label.replace(/^(発売|開催) /, '')}</span>
              : n < 0 ? <>開催中<span className="font-semibold text-label-tertiary">〜{md(next.end ?? next.day)}</span></>
              : <>{n === 0 ? '今日' : `あと${n}日`}<span className="font-semibold text-label-tertiary">{md(next.day)}</span></>}
          </span>
        ) : (
          <span className="block mt-1.5 text-[11px] text-label-tertiary">{e.date ? md(e.date) : '日付未定'}</span>
        )}
        <span className="block text-[12px] font-semibold leading-snug line-clamp-2 mt-0.5">{stripWorkName(e.title, e.workName)}</span>
        <span className="block text-[10px] text-label-secondary truncate mt-0.5">{e.workName}</span>
      </button>
      {/* ♡ ＝カレンダーに入れる（ボードに並ぶ）。とっておいた予定を本気で追いかけるとき */}
      {!e.personal && (
        <button aria-label={liked ? 'カレンダーから外す' : 'カレンダーに入れる'} aria-pressed={liked}
          onClick={() => { haptic.select(); onLike(e); }}
          className="pressable absolute left-1 top-1 w-8 h-8 rounded-full flex items-center justify-center"
          style={{ backgroundColor: 'color-mix(in srgb, var(--bg-primary) 82%, transparent)' }}>
          <Heart size={16} fill={liked ? 'var(--accent-color)' : 'none'} style={{ color: liked ? 'var(--accent-color)' : 'var(--label-secondary)' }} />
        </button>
      )}
    </div>
  );
}

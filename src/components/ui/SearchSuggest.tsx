import { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import type { CalendarEvent } from '../../types';
import type { Work } from '../../lib/api';
import { searchWorks } from '../../lib/api';
import { todayStr, itemDateLines } from '../../design/tokens';
import { parseImageUrls } from '../../lib/constants';
import { stripWorkName } from '../../lib/stripWorkName';
import { haptic } from '../../lib/haptics';
import OptImg from './OptImg';
import { WORK_READINGS } from '../../lib/workReadings';

// 検索の候補（2026-11-07 柴野「確定して検索するまで何も出てこない。一手間多い」）。
// 打っている途中から、当たる作品と予定を検索欄の下に出す。かなのまま（変換を確定する前）でも、
// ひらがな・カタカナの違いは無視して当てる（「ぶるーろっく」→ ブルーロック）。漢字・英字の作品名は読み（workReadings.ts）で当てる

/** 照合用: NFKC・小文字・カタカナ → ひらがな・空白と記号を除く */
export function normalizeSearch(s: string): string {
  return s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
    .replace(/[\s　!！?？・:：;；~〜♪☆★‼⁉。、．，'"「」『』()（）[\]【】\-－_／/]/g, '');
}

// 作品名 → 照合用にそろえた読み
let readingIndex: [string, string[]][] | null = null;
const readings = () => (readingIndex ??= Object.entries(WORK_READINGS).map(([name, rs]) => [name, rs.map(normalizeSearch)]));
/** 読みが当たる作品名（2文字から。1文字だと当たりすぎる） */
export function namesByReading(q: string): Set<string> {
  const out = new Set<string>();
  if (q.length < 2) return out;
  for (const [name, rs] of readings()) if (rs.some((r) => r.includes(q))) out.add(name);
  return out;
}

/** 一覧の絞り込み用: 検索語に当たる予定か（名前・作品名・カテゴリ。かなの違いと作品の読みも見る）。
 *  q は normalizeSearch したもの、byReading は namesByReading(q) */
export function matchesSearch(e: CalendarEvent, q: string, byReading: Set<string>): boolean {
  return normalizeSearch(`${e.title} ${e.workName ?? ''} ${e.category ?? ''}`).includes(q) || (!!e.workName && byReading.has(e.workName));
}

/** 候補を作る。予定は手元の一覧から、作品は手元の一覧とサーバー（名前・別名）の両方から。どちらも読みでも当てる */
export function useSearchSuggest(query: string, items: CalendarEvent[] | null | undefined, max = 6) {
  const q = normalizeSearch(query);
  // サーバーの作品検索（名前の部分一致・別名・読み）。打つたびに投げないよう少し待つ
  const byReading = useMemo(() => namesByReading(q), [q]);
  const [remote, setRemote] = useState<Work[]>([]);
  useEffect(() => {
    if (!query.trim()) { setRemote([]); return; }
    let alive = true;
    // 読みで当たった作品は、名前で引き直す（フォローしていない作品も候補に出すため。2つまで）
    const names = [...byReading].slice(0, 2);
    const t = setTimeout(() => {
      Promise.all([searchWorks(query.trim()), ...names.map((n) => searchWorks(n).then((r) => r.filter((w) => w.name === n)))])
        .then((rs) => { if (alive) setRemote(rs.flat()); }).catch(() => {});
    }, 200);
    return () => { alive = false; clearTimeout(t); };
  }, [query, byReading]);

  return useMemo(() => {
    if (!q) return { works: [] as Work[], events: [] as CalendarEvent[] };
    const list = items ?? [];
    // 作品: 手元の予定に出てくる作品で名前が当たるもの＋サーバーで当たったもの
    const local = new Map<string, Work>();
    for (const e of list) {
      if (e.workId && e.workName && !local.has(e.workId) && (normalizeSearch(e.workName).includes(q) || byReading.has(e.workName))) local.set(e.workId, { id: e.workId, name: e.workName, participantCount: 0 });
    }
    const works = [...local.values()];
    for (const w of remote) if (!works.some((x) => x.id === w.id)) works.push(w);
    const workIds = new Set(works.map((w) => w.id));
    // 予定: 名前・作品名に当たるもの、当たった作品の予定。これからのものを近い順に、過ぎたものはそのあと
    const today = todayStr();
    const key = (e: CalendarEvent) => e.preorderEnd && e.preorderEnd >= today ? e.preorderEnd : e.date ?? '9999';
    const events = list
      .filter((e) => (e.workId && workIds.has(e.workId)) || normalizeSearch(`${e.title} ${e.workName ?? ''}`).includes(q))
      .sort((a, b) => {
        const ka = key(a), kb = key(b), fa = ka >= today, fb = kb >= today;
        return fa !== fb ? (fa ? -1 : 1) : fa ? ka.localeCompare(kb) : kb.localeCompare(ka);
      })
      .slice(0, max);
    return { works: works.slice(0, 3), events };
  }, [q, items, remote, max, byReading]);
}

/** 検索欄の下に出す候補の一覧。押したものごとに onWork（作品）・onEvent（予定）・onAll（すべて見る） */
export function SuggestList({ query, works, events, onWork, onEvent, onAll, allLabel }: {
  query: string; works: Work[]; events: CalendarEvent[];
  onWork: (w: Work) => void; onEvent: (e: CalendarEvent) => void; onAll: () => void; allLabel?: string;
}) {
  const line = '0.5px solid var(--separator)';
  return (
    <div className="flex flex-col">
      {works.map((w) => (
        <button key={w.id} type="button" onClick={() => { haptic.select(); onWork(w); }}
          className="pressable flex items-center gap-3 min-h-[48px] px-4 text-left" style={{ borderBottom: line }}>
          <span className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-[11px] font-extrabold"
            style={{ backgroundColor: 'var(--fill-tertiary)', color: 'var(--label-secondary)' }}>作品</span>
          <span className="flex-1 min-w-0 truncate text-[15px] font-bold">{w.name}</span>
        </button>
      ))}
      {events.map((e) => {
        const img = parseImageUrls(e.imageUrl)[0];
        return (
          <button key={e.id} type="button" onClick={() => { haptic.select(); onEvent(e); }}
            className="pressable flex items-center gap-3 min-h-[56px] px-4 py-1.5 text-left" style={{ borderBottom: line }}>
            <span className="w-9 h-9 rounded-[9px] overflow-hidden flex-shrink-0" style={{ backgroundColor: 'var(--fill-quaternary)' }}>
              {img && <OptImg src={img} w={192} alt="" loading="lazy" className="w-full h-full object-contain" />}
            </span>
            <span className="flex-1 min-w-0">
              <span className="block truncate text-[14px] font-semibold">{stripWorkName(e.title, e.workName)}</span>
              <span className="block truncate text-[11px] text-label-secondary">{e.workName ? `${e.workName}・` : ''}{itemDateLines(e).join(' / ')}</span>
            </span>
          </button>
        );
      })}
      <button type="button" onClick={() => { haptic.select(); onAll(); }}
        className="pressable flex items-center gap-3 min-h-[48px] px-4 text-left">
        <span className="w-9 h-9 flex items-center justify-center flex-shrink-0"><Search size={18} className="text-label-secondary" aria-hidden /></span>
        <span className="flex-1 min-w-0 truncate text-[14px] font-semibold" style={{ color: 'var(--accent-text)' }}>
          {allLabel ?? `「${query.trim()}」の結果をすべて見る`}
        </span>
      </button>
    </div>
  );
}

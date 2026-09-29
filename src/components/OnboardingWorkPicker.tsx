import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import type { CalendarEvent } from '../types';
import { searchWorks, getWorksByNames, listExploreEvents, upsertParticipation, leaveCalendar, listAllParticipatedWorks, type Work } from '../lib/api';
import { logSearch } from '../lib/dataLogs';
import { maybeAddWorkAlias } from '../lib/workAliases';
import { getCached, setCached } from '../lib/swrCache';
import { todayStr } from '../design/tokens';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from './ui/Toast';
import { haptic } from '../lib/haptics';
import { usePremium, canFollowMore, FREE_FOLLOW_LIMIT } from '../lib/premium';
import { FOLLOWS_EVENT, ONBOARDING_FEATURED_WORKS } from '../lib/constants';

// オンボーディングの1枚目: 推しの作品を選ぶ。
// 押した時点でフォローする（「選ぶ」と「フォロー」を分けない。WorkFollowSheet と同じ）。
//
// 候補（2026-09-29 柴野）:
//  - SNS で予定表を出している8作品（ONBOARDING_FEATURED_WORKS）は必ず出す
//  - その後ろに、これからの予定が多い作品を多い順に。予定が少ない作品は出さない
//    （次の案内で「探すで予定にいいね」をやってもらうので、予定の無い作品を並べても続かない）
//  - 予定の数はホーム・探すと同じ一覧（listExploreEvents）から数える。案内はホームの上に出るので、同じ取得を使い回せる
// 画面に収まる数だけ出す（端末の高さで収まる数が変わるので、描いてから測って、はみ出す行のチップは隠す）。
//
// 検索で見つからない作品を**ここで作ることはしない**（オンボーディングなので。作品を作るのは投稿から）。
// 検索からフォローしたら検索を閉じて候補の並びに戻し、選んだ作品を先頭に選択中で出す。

/** 候補に出すのに要る、これからの予定の数 */
const MIN_UPCOMING = 5;

// ホーム・探すと同じ範囲（キャッシュのキーも同じにして、取得を1回で済ませる）
function shiftMonths(base: string, n: number): string {
  const d = new Date(base + 'T00:00:00');
  d.setMonth(d.getMonth() + n);
  return todayStr(d);
}

interface Props {
  /** フォロー中の作品の数が変わったとき。「次へ」を押せるかと演出に使う */
  onCountChange: (n: number) => void;
}

export default function OnboardingWorkPicker({ onCountChange }: Props) {
  const { user } = useAuth();
  const toast = useToast();
  const premium = usePremium();
  const [candidates, setCandidates] = useState<Work[] | null>(null);
  const [follows, setFollows] = useState<Work[]>([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Work[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  // 画面に収まるチップの数。測り終えるまでは null（全部隠しておく。一瞬全部出てから消えるのを防ぐ）
  const [fit, setFit] = useState<number | null>(null);
  const chipBoxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    const today = todayStr();
    const from = shiftMonths(today, -12), to = shiftMonths(today, 18);
    const key = `explore-events:${from}_${to}`;
    const events = listExploreEvents(from, to)
      .then((data) => { setCached(key, data); return data; })
      .catch(() => getCached<CalendarEvent[]>(key) ?? []);
    Promise.all([getWorksByNames(ONBOARDING_FEATURED_WORKS).catch(() => [] as Work[]), events]).then(([featured, evs]) => {
      if (!alive) return;
      const counts = new Map<string, { name: string; n: number }>();
      for (const e of evs) {
        if (!e.workId) continue;
        if ((e.endDate || e.date || '') < today && (e.date || e.endDate)) continue; // 終わった予定は数えない（日付未定は数える）
        const c = counts.get(e.workId);
        if (c) c.n++; else counts.set(e.workId, { name: e.workName ?? '', n: 1 });
      }
      // 8作品は決めた順に。名前で引いているので、DB に無い作品は黙って抜ける
      const first = ONBOARDING_FEATURED_WORKS
        .map((name) => featured.find((w) => w.name === name))
        .filter((w): w is Work => !!w);
      const firstIds = new Set(first.map((w) => w.id));
      const rest = [...counts.entries()]
        .filter(([id, c]) => !firstIds.has(id) && c.n >= MIN_UPCOMING && c.name)
        .sort((a, b) => b[1].n - a[1].n)
        .map(([id, c]) => ({ id, name: c.name, participantCount: 0 }) as Work);
      setCandidates([...first, ...rest]);
    });
    return () => { alive = false; };
  }, []);

  // 投稿や予定詳細で先にフォローしてからホームに来た人もいる。その作品は選択中として出す
  useEffect(() => {
    if (!user) return;
    let alive = true;
    listAllParticipatedWorks(user.id).then((ws) => alive && setFollows(ws)).catch(() => {});
    return () => { alive = false; };
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { onCountChange(follows.length); }, [follows.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // 検索（デバウンス）。WorkFollowSheet と同じ
  useEffect(() => {
    const q = query.trim();
    if (!q) { setResults(null); return; }
    let alive = true;
    const t = setTimeout(() => {
      searchWorks(q).then((r) => alive && setResults(r)).catch(() => {});
    }, 250);
    return () => { alive = false; clearTimeout(t); };
  }, [query]);

  // 検索クエリログ。WorkFollowSheet と同じ扱いにする（表記ゆれ辞書の素材がオンボーディングだけ抜けないように）
  useEffect(() => {
    if (results === null) return;
    const q = query.trim();
    if (!q) return;
    const t = setTimeout(() => logSearch('work_follow', q, results.length, user?.id), 800);
    return () => clearTimeout(t);
  }, [results, query]); // eslint-disable-line react-hooks/exhaustive-deps

  const followedIds = new Set(follows.map((w) => w.id));
  const canAdd = canFollowMore(follows.length, premium);
  const searching = !!query.trim();
  // フォロー済みで候補に無い作品（検索で選んだ作品・投稿で作った作品など）は先頭に足す。外せる場所が無くなるため
  const chips = candidates === null ? [] : [
    ...follows.filter((f) => !candidates.some((p) => p.id === f.id)),
    ...candidates,
  ];
  const chipKey = chips.map((w) => w.id).join(',');

  // 収まる数を測る。キーボードが出る・画面が回るなどで高さが変わったら測り直す
  useLayoutEffect(() => {
    const box = chipBoxRef.current;
    if (!box) return;
    const measure = () => {
      const h = box.clientHeight;
      let n = 0;
      for (const el of Array.from(box.children) as HTMLElement[]) {
        // 折り返しは並び順どおりなので、最初にはみ出したチップから後ろは全部はみ出している
        if (el.offsetTop + el.offsetHeight > h) break;
        n++;
      }
      setFit(n);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(box);
    return () => ro.disconnect();
  }, [chipKey, searching]);

  // フォローが確定したら、控えを書き換えてホームに読み直させる。
  // 先に画面だけ変えた時点で知らせると、ホームがまだ反映前のサーバーを読んでしまう
  const commit = (next: Work[]) => {
    if (user) setCached(`follows:${user.id}`, next);
    window.dispatchEvent(new Event(FOLLOWS_EVENT));
  };

  const toggle = async (w: Work) => {
    if (!user || busyId) return;
    const on = followedIds.has(w.id);
    if (!on && !canAdd) return; // 押せないようにしてあるが、連打で上限を越えないように
    haptic.select();
    const fromSearch = searching;
    // 「query と入力して w.name を選んだ」＝表記ゆれ辞書の別名ペア
    if (!on && fromSearch && w.name !== query.trim()) { logSearch('work_follow', query, results?.length ?? null, user.id, w.name); maybeAddWorkAlias(w, query); }
    setBusyId(w.id);
    const prev = follows;
    const next = on ? prev.filter((x) => x.id !== w.id) : [w, ...prev];
    setFollows(next);
    // 検索からフォローしたら候補の並びに戻す（選んだ作品が先頭に選択中で見える）
    if (!on && fromSearch) setQuery('');
    try {
      if (on) await leaveCalendar(w.id, user.id);
      else await upsertParticipation(w.id, user.id);
      commit(next);
    } catch {
      setFollows(prev);
      toast(on ? '解除できませんでした' : 'フォローに失敗しました');
    }
    setBusyId(null);
  };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <p className="text-[22px] font-bold text-label-primary leading-snug text-center">推しの作品を選ぶ</p>
      <p className="mt-2 text-[14px] text-label-secondary leading-relaxed text-center">選んだ作品の予定が、ホームと「探す」に届きます。</p>

      <div className="mt-5 flex items-center gap-2 rounded-[10px] px-3 py-2.5" style={{ backgroundColor: 'var(--fill-tertiary)' }}>
        <Search size={16} className="text-label-tertiary flex-shrink-0" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="作品名で検索"
          className="flex-1 min-w-0 bg-transparent text-[14px] outline-none" style={{ color: 'var(--input-text)' }} />
        {query && <button onClick={() => setQuery('')} aria-label="クリア" className="pressable text-label-tertiary flex-shrink-0"><X size={16} /></button>}
      </div>

      {!canAdd && (
        <p className="mt-2 text-[12px] text-label-tertiary text-center">フォローは{FREE_FOLLOW_LIMIT}作品までです（プレミアムで増やせます）</p>
      )}

      {searching ? (
        <div className="mt-2 flex-1 min-h-0 overflow-y-auto">
          {(results ?? []).map((w) => {
            const on = followedIds.has(w.id);
            return (
              <div key={w.id} className="flex items-center justify-between gap-2 px-1 py-2.5 border-b border-subtle">
                <span className="flex-1 min-w-0 text-[14px] font-medium truncate">{w.name}</span>
                <button onClick={() => toggle(w)} disabled={!on && !canAdd}
                  className="pressable flex-shrink-0 flex items-center gap-1 text-[12px] px-3 py-1.5 rounded-full font-medium disabled:opacity-50"
                  style={on
                    ? { backgroundColor: 'var(--fill-tertiary)', color: 'var(--label-secondary)' }
                    : { backgroundColor: 'var(--accent-color)', color: 'var(--accent-on)' }}>
                  {on ? 'フォロー中' : '＋フォロー'}
                </button>
              </div>
            );
          })}
          {results !== null && results.length === 0 && (
            <p className="px-1 pt-3 text-[12px] text-label-tertiary leading-relaxed">
              見つかりません。略称・正式名でも検索してみてください。<br />
              まだ無い作品は、あとで予定を投稿すると追加できます。
            </p>
          )}
        </div>
      ) : (
        // relative は offsetTop の基準にするため（measure で使う）
        <div ref={chipBoxRef} className="relative mt-4 flex-1 min-h-0 overflow-hidden flex flex-wrap content-start justify-center gap-2">
          {chips.map((w, i) => {
            const on = followedIds.has(w.id);
            return (
              // 保存中（busyId）でも disabled にしない。disabled:opacity-50 で全部のチップが一瞬薄くなり、押すたびに点滅して見える。
              // 二重に押されるのは toggle の先頭で止めている
              <button key={w.id} onClick={() => toggle(w)} disabled={!on && !canAdd} aria-pressed={on}
                className="pressable flex items-center h-9 px-3.5 rounded-full text-[14px] font-medium max-w-full disabled:opacity-50"
                // 選択中は塗りをアクセント色にし、枠も太く濃くする（色だけに頼らない）。
                // 枠は border ではなく内側の影で描く。border は太さが幅に足されるので、太くすると
                // 折り返しがずれて押すたびに他のチップが動く。影なら幅は変わらない（文字の太さも両方同じにしてある）
                style={{
                  ...(on
                    ? { backgroundColor: 'var(--accent-color)', color: 'var(--accent-on)', boxShadow: 'inset 0 0 0 2px var(--label-primary)' }
                    : { backgroundColor: 'var(--fill-tertiary)', color: 'var(--label-primary)', boxShadow: 'inset 0 0 0 1px var(--border-default)' }),
                  visibility: fit !== null && i < fit ? 'visible' : 'hidden',
                }}>
                <span className="truncate">{w.name}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

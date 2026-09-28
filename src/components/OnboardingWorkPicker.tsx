import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Search, X, Plus, Check } from 'lucide-react';
import { listWorks, searchWorks, getOrCreateWork, upsertParticipation, leaveCalendar, listAllParticipatedWorks, type Work } from '../lib/api';
import { logSearch } from '../lib/dataLogs';
import { maybeAddWorkAlias } from '../lib/workAliases';
import { sameWorkName } from '../lib/workName';
import { setCached } from '../lib/swrCache';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from './ui/Toast';
import { haptic } from '../lib/haptics';
import { usePremium, canFollowMore, FREE_FOLLOW_LIMIT } from '../lib/premium';
import { ONBOARDING_WORKS_KEY, FOLLOWS_EVENT } from '../lib/constants';

// オンボーディングの1枚目: 推しの作品を選ぶ。
// 押した時点でフォローする（「選ぶ」と「フォロー」を分けない。WorkFollowSheet と同じ）。
// 1つも選ばずに閉じた人にだけ既定の作品を入れる判断は、Onboarding の finish が持つ。
//
// 候補はフォロー数の多い順に、**画面に収まる数だけ**出す（全部は並べない）。
// 端末の高さで収まる数が変わるので、描いてから測って、はみ出す行のチップは隠す。

// 候補として取ってくる数。小さい画面でも大きい画面でも余るように多めに取り、収まる分だけ出す
const CANDIDATE_LIMIT = 30;

interface Props {
  /** 作品を新しく作ってフォローしたとき。案内を次のカードへ進める */
  onCreated: () => void;
}

export default function OnboardingWorkPicker({ onCreated }: Props) {
  const { user } = useAuth();
  const toast = useToast();
  const premium = usePremium();
  const [popular, setPopular] = useState<Work[] | null>(null);
  const [follows, setFollows] = useState<Work[]>([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Work[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  // 画面に収まるチップの数。測り終えるまでは null（全部隠しておく。一瞬全部出てから消えるのを防ぐ）
  const [fit, setFit] = useState<number | null>(null);
  const chipBoxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    listWorks(CANDIDATE_LIMIT).then((ws) => alive && setPopular(ws)).catch(() => alive && setPopular([]));
    return () => { alive = false; };
  }, []);

  // 投稿や予定詳細で先にフォローしてからホームに来た人もいる。その作品は選択中として出す
  useEffect(() => {
    if (!user) return;
    let alive = true;
    listAllParticipatedWorks(user.id).then((ws) => alive && setFollows(ws)).catch(() => {});
    return () => { alive = false; };
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

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
  // フォロー済みで候補に無い作品（投稿で作った作品など）は先頭に足す。外せる場所が無くなるため
  const chips = popular === null ? [] : [
    ...follows.filter((f) => !popular.some((p) => p.id === f.id)),
    ...popular,
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
  const markPicked = () => {
    try { localStorage.setItem(ONBOARDING_WORKS_KEY, '1'); } catch { /* 立たなくても、フォローが1件以上あれば既定の作品は入らない */ }
  };

  const toggle = async (w: Work) => {
    if (!user || busyId) return;
    const on = followedIds.has(w.id);
    if (!on && !canAdd) return; // 押せないようにしてあるが、連打で上限を越えないように
    haptic.select();
    // 「query と入力して w.name を選んだ」＝表記ゆれ辞書の別名ペア
    if (!on && query.trim() && w.name !== query.trim()) { logSearch('work_follow', query, results?.length ?? null, user.id, w.name); maybeAddWorkAlias(w, query); }
    setBusyId(w.id);
    const prev = follows;
    const next = on ? prev.filter((x) => x.id !== w.id) : [w, ...prev];
    setFollows(next);
    try {
      if (on) await leaveCalendar(w.id, user.id);
      else { await upsertParticipation(w.id, user.id); markPicked(); }
      commit(next);
    } catch {
      setFollows(prev);
      toast(on ? '解除できませんでした' : 'フォローに失敗しました');
    }
    setBusyId(null);
  };

  const createAndFollow = async () => {
    const name = query.trim();
    if (!user || !name || busyId || !canAdd) return;
    haptic.select();
    setBusyId('create');
    try {
      const w = await getOrCreateWork(name);
      await upsertParticipation(w.id, user.id);
      markPicked();
      const next = [w, ...follows.filter((x) => x.id !== w.id)];
      setFollows(next);
      commit(next);
      setQuery('');
      // 別名辞書で既存の作品に寄せられたときは「作った」わけではないので、予定が無いとは言わない
      toast(w.participantCount === 0 ? 'まだ予定が集まっていません。見つけたら共有してください' : `「${w.name}」をフォローしました`);
      onCreated();
    } catch { toast('作成に失敗しました'); }
    setBusyId(null);
  };

  const exactMatch = (results ?? []).some((w) => sameWorkName(w.name, query));

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
                <button onClick={() => toggle(w)} disabled={busyId !== null || (!on && !canAdd)}
                  className="pressable flex-shrink-0 flex items-center gap-1 text-[12px] px-3 py-1.5 rounded-full font-medium disabled:opacity-50"
                  style={on
                    ? { backgroundColor: 'var(--fill-tertiary)', color: 'var(--label-secondary)' }
                    : { backgroundColor: 'var(--accent-color)', color: 'var(--accent-on)' }}>
                  {on ? <><Check size={13} /> フォロー中</> : '＋フォロー'}
                </button>
              </div>
            );
          })}
          {results !== null && !exactMatch && (
            <button onClick={createAndFollow} disabled={busyId !== null || !canAdd}
              className="pressable w-full flex items-center gap-2 px-1 py-3 text-[14px] font-medium text-left disabled:opacity-50"
              style={{ color: 'var(--accent-text)' }}>
              <Plus size={16} className="flex-shrink-0" /> <span className="truncate">「{query.trim()}」を作成してフォロー</span>
            </button>
          )}
          {results !== null && results.length === 0 && (
            <p className="px-1 pt-1 text-[12px] text-label-tertiary">見つかりません。表記ゆれ（略称・正式名）でも検索してみてください。</p>
          )}
        </div>
      ) : (
        // relative は offsetTop の基準にするため（measure で使う）
        <div ref={chipBoxRef} className="relative mt-4 flex-1 min-h-0 overflow-hidden flex flex-wrap content-start justify-center gap-2">
          {chips.map((w, i) => {
            const on = followedIds.has(w.id);
            return (
              <button key={w.id} onClick={() => toggle(w)} disabled={busyId !== null || (!on && !canAdd)} aria-pressed={on}
                className="pressable flex items-center gap-1 h-9 px-3.5 rounded-full text-[14px] font-medium max-w-full disabled:opacity-50"
                style={{
                  ...(on
                    ? { backgroundColor: 'var(--accent-color)', color: 'var(--accent-on)' }
                    : { backgroundColor: 'var(--fill-tertiary)', color: 'var(--label-primary)' }),
                  visibility: fit !== null && i < fit ? 'visible' : 'hidden',
                }}>
                {on && <Check size={14} strokeWidth={3} className="flex-shrink-0" />}
                <span className="truncate">{w.name}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

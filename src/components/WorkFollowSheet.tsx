import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Search, Plus, Check } from 'lucide-react';
import Sheet from './ui/Sheet';
import { logSearch } from '../lib/dataLogs';
import { maybeAddWorkAlias } from '../lib/workAliases';
import { searchWorks, getOrCreateWork, upsertParticipation, leaveCalendar, listAllParticipatedWorks, type Work } from '../lib/api';
import { getCached, setCached } from '../lib/swrCache';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from './ui/Toast';
import { useConfirm } from './ui/ConfirmDialog';
import { haptic } from '../lib/haptics';
import { usePremium, canFollowMore, FREE_FOLLOW_LIMIT } from '../lib/premium';

interface Props {
  open: boolean;
  onClose: () => void;
  /** フォロー状態が変わったとき（呼び出し元の再読込用）。閉じる時ではなく変更の都度呼ぶ */
  onChanged?: () => void;
  /** 指定時、作品行タップでその作品を選択して閉じる（投稿フォームの作品選択用） */
  onPick?: (w: Work) => void;
}

/** 作品のフォロー管理シート: フォロー中一覧＋検索→フォロー、なければ新規作成。 */
export default function WorkFollowSheet({ open, onClose, onChanged, onPick }: Props) {
  const { user } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const [follows, setFollows] = useState<Work[]>([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Work[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const premium = usePremium();
  // 上限に達していたら新規フォローだけ止める。**今フォロー中のものは触らない**（不利益変更にしない）。
  // 止めるだけで終わらせず、その場でプレミアムの案内へ送る（欲しいと思った瞬間が一番効く）
  const blocked = async () => {
    if (canFollowMore(follows.length, premium)) return false;
    const go = await confirm({
      title: `フォローは${FREE_FOLLOW_LIMIT}作品までです`,
      message: 'プレミアムなら作品を無制限にフォローできます。今フォロー中の作品はそのまま使えます。',
      confirmLabel: 'プレミアムを見る',
    });
    if (go) navigate('/premium');
    return true;
  };

  const fkey = user ? `follows:${user.id}` : '';
  const syncCache = (ws: Work[]) => { if (fkey) setCached(fkey, ws); };

  useEffect(() => {
    if (!open || !user) return;
    setQuery(''); setResults(null);
    const cached = getCached<Work[]>(fkey);
    if (cached) setFollows(cached);
    listAllParticipatedWorks(user.id).then((ws) => { setFollows(ws); syncCache(ws); }).catch(() => {});
  }, [open, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // 検索（デバウンス）
  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (!q) { setResults(null); return; }
    let alive = true;
    const t = setTimeout(() => { searchWorks(q).then((r) => alive && setResults(r)).catch(() => {}); }, 250);
    return () => { alive = false; clearTimeout(t); };
  }, [query, open]);

  // 検索クエリログ（データ資産化②の素材）: 入力が落ち着いてからヒット件数つきで記録
  useEffect(() => {
    if (!open || results === null) return;
    const q = query.trim();
    if (!q) return;
    const t = setTimeout(() => logSearch('work_follow', q, results.length, user?.id), 800);
    return () => clearTimeout(t);
  }, [results, query, open]); // eslint-disable-line react-hooks/exhaustive-deps

  const followedIds = new Set(follows.map((w) => w.id));

  const follow = async (w: Work) => {
    if (!user || busyId) return;
    if (!followedIds.has(w.id) && await blocked()) return;
    haptic.select();
    // 「query と入力して w.name を選んだ」＝表記ゆれ辞書の別名ペア
    if (query.trim() && w.name !== query.trim()) { logSearch('work_follow', query, results?.length ?? null, user.id, w.name); maybeAddWorkAlias(w, query); }
    setBusyId(w.id);
    const next = [w, ...follows.filter((x) => x.id !== w.id)];
    setFollows(next); syncCache(next);
    try { await upsertParticipation(w.id, user.id); onChanged?.(); toast(`「${w.name}」をフォローしました`); }
    catch { setFollows(follows); syncCache(follows); toast('フォローに失敗しました'); }
    setBusyId(null);
  };

  const unfollow = async (w: Work) => {
    if (!user || busyId) return;
    haptic.select();
    const ok = await confirm({ title: `「${w.name}」のフォローを解除しますか？`, message: 'ホーム・探すタブにこの作品の予定が表示されなくなります', confirmLabel: '解除する', destructive: true });
    if (!ok) return;
    setBusyId(w.id);
    const next = follows.filter((x) => x.id !== w.id);
    setFollows(next); syncCache(next);
    try { await leaveCalendar(w.id, user.id); onChanged?.(); }
    catch { setFollows(follows); syncCache(follows); }
    setBusyId(null);
  };

  const createAndFollow = async () => {
    const name = query.trim();
    if (!user || !name || busyId) return;
    if (await blocked()) return;
    haptic.select();
    setBusyId('create');
    try {
      const w = await getOrCreateWork(name);
      await upsertParticipation(w.id, user.id);
      const next = [w, ...follows.filter((x) => x.id !== w.id)];
      setFollows(next); syncCache(next);
      onChanged?.();
      toast(`「${w.name}」を作成してフォローしました`);
      setQuery('');
      if (onPick) { onPick(w); onClose(); }
    } catch { toast('作成に失敗しました'); }
    setBusyId(null);
  };

  const pick = (w: Work) => {
    haptic.select();
    if (query.trim() && w.name !== query.trim()) { logSearch('work_follow', query, results?.length ?? null, user?.id, w.name); maybeAddWorkAlias(w, query); }
    onPick?.(w);
    onClose();
  };

  const exactMatch = (results ?? []).some((w) => w.name === query.trim());

  const row = (w: Work, isFollowed: boolean) => (
    <div key={w.id} className="flex items-center justify-between gap-2 px-1 py-2.5 border-b border-subtle">
      {onPick ? (
        <button onClick={() => pick(w)} className="pressable flex-1 min-w-0 text-left text-[14px] font-medium truncate">{w.name}</button>
      ) : (
        <span className="flex-1 min-w-0 text-[14px] font-medium truncate">{w.name}</span>
      )}
      {isFollowed ? (
        <button onClick={() => unfollow(w)} disabled={busyId !== null}
          className="pressable flex-shrink-0 flex items-center gap-1 text-[12px] px-3 py-1.5 rounded-full font-medium"
          style={{ backgroundColor: 'var(--fill-tertiary)', color: 'var(--label-secondary)' }}>
          <Check size={13} /> フォロー中
        </button>
      ) : (
        <button onClick={() => follow(w)} disabled={busyId !== null}
          className="pressable flex-shrink-0 text-[12px] px-3 py-1.5 rounded-full font-medium"
          style={{ backgroundColor: 'var(--accent-color)', color: 'var(--accent-on)' }}>
          ＋フォロー
        </button>
      )}
    </div>
  );

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={onPick ? '作品を選ぶ' : '作品をフォロー'}
      maxHeight="80dvh"
      ariaLabel={onPick ? '作品を選ぶ' : '作品をフォロー'}
      fixed={
        <div className="px-4 pb-2">
          <div className="flex items-center gap-2 rounded-[10px] px-3 py-2.5" style={{ backgroundColor: 'var(--fill-tertiary)' }}>
            <Search size={16} className="text-label-tertiary flex-shrink-0" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="作品名で検索"
              className="flex-1 bg-transparent text-[14px] outline-none" style={{ color: 'var(--input-text)' }} />
            {query && <button onClick={() => setQuery('')} aria-label="クリア" className="pressable text-label-tertiary flex-shrink-0"><X size={16} /></button>}
          </div>
        </div>
      }
      contentClassName="px-4"
    >
      {query.trim() ? (
        <>
          {(results ?? []).map((w) => row(w, followedIds.has(w.id)))}
          {results !== null && !exactMatch && (
            <button onClick={createAndFollow} disabled={busyId !== null}
              className="pressable w-full flex items-center gap-2 px-1 py-3 text-[14px] font-medium"
              style={{ color: 'var(--accent-text)' }}>
              <Plus size={16} /> 「{query.trim()}」を作成してフォロー
            </button>
          )}
          {results !== null && results.length === 0 && (
            <p className="px-1 pt-1 text-[12px] text-label-tertiary">見つかりません。表記ゆれ（略称・正式名）でも検索してみてください。</p>
          )}
        </>
      ) : (
        <>
          <p className="px-1 pb-1 text-[12px] text-label-secondary">フォロー中（{follows.length}）</p>
          {follows.length === 0 ? (
            <p className="px-1 py-6 text-center text-[13px] text-label-tertiary">まだフォローしている作品がありません。<br />上の検索から作品を探してフォローすると、<br />ホームと探すタブに予定が表示されます。</p>
          ) : follows.map((w) => row(w, true))}
        </>
      )}
    </Sheet>
  );
}

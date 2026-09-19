import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Plus, Check, ChevronRight } from 'lucide-react';
import { listAllParticipatedWorks, leaveCalendar, type Work } from '../lib/api';
import { getCached, setCached } from '../lib/swrCache';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../components/ui/Toast';
import { useConfirm } from '../components/ui/ConfirmDialog';
import { haptic } from '../lib/haptics';
import WorkFollowSheet from '../components/WorkFollowSheet';

// フォロー管理ページ。1行 = 作品名（タップでその作品の予定）／フォロー中ボタン。
// 作品ごとの通知の切り替えは、通知の設定ページ（/notifications）に集めた（ここから飛ぶのが手間だったため）。

export default function Follows() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const [params, setParams] = useSearchParams();
  const [follows, setFollows] = useState<Work[] | null>(null);
  const [sheetOpen, setSheetOpen] = useState(params.get('add') === '1');
  const [busyId, setBusyId] = useState<string | null>(null);

  const fkey = user ? `follows:${user.id}` : '';
  const reload = () => {
    if (!user) { setFollows([]); return; }
    const cached = getCached<Work[]>(fkey);
    if (cached) setFollows(cached);
    listAllParticipatedWorks(user.id)
      .then((ws) => { setFollows(ws); setCached(fkey, ws); })
      .catch(() => setFollows((prev) => prev ?? []));
  };
  useEffect(reload, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const openAdd = () => { haptic.select(); setSheetOpen(true); };
  const closeAdd = () => { setSheetOpen(false); if (params.get('add')) { params.delete('add'); setParams(params, { replace: true }); } };

  const unfollow = async (w: Work) => {
    if (!user || busyId) return;
    haptic.select();
    const ok = await confirm({ title: `「${w.name}」のフォローを解除しますか？`, message: 'ホーム・探すタブにこの作品の予定が表示されなくなります', confirmLabel: '解除する', destructive: true });
    if (!ok) return;
    setBusyId(w.id);
    const prev = follows ?? [];
    const next = prev.filter((x) => x.id !== w.id);
    setFollows(next); setCached(fkey, next);
    try { await leaveCalendar(w.id, user.id); }
    catch { setFollows(prev); setCached(fkey, prev); toast('解除できませんでした'); }
    setBusyId(null);
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <div className="mx-auto w-full max-w-app flex-1 flex flex-col">
        <div className="sticky top-0 z-20 flex items-center gap-1 px-2 py-2 material-bar scroll-edge" style={{ paddingTop: 'calc(var(--sat) + 8px)' }}>
          <button onClick={() => { haptic.select(); navigate(-1); }} aria-label="戻る" className="pressable tap-44 p-2"><ArrowLeft size={22} /></button>
          <span className="text-[16px] font-bold flex-1">フォロー中{follows ? `（${follows.length}）` : ''}</span>
          <button onClick={openAdd} aria-label="作品を追加" className="pressable tap-44 flex items-center gap-1 px-2 text-[13px] font-semibold" style={{ color: 'var(--accent-text)' }}>
            <Plus size={16} /> 追加
          </button>
        </div>

        <div className="px-3 pt-2 pb-8">
          {follows === null ? (
            <div className="text-center text-[13px] text-label-tertiary py-16">読み込み中…</div>
          ) : follows.length === 0 ? (
            <div className="text-center py-16">
              <div className="text-[13px] text-label-secondary">まだフォローしている作品がありません</div>
              <button onClick={openAdd} className="pressable mt-3 px-4 py-2 rounded-full text-[13px] font-semibold" style={{ backgroundColor: 'var(--accent-color)', color: 'var(--accent-on)' }}>
                作品を探してフォロー
              </button>
            </div>
          ) : (
            <div className="flex flex-col">
              {follows.map((w) => {
                return (
                  <div key={w.id} className="flex items-center gap-1 py-2.5 border-b border-subtle">
                    <button onClick={() => { haptic.select(); navigate(`/explore?q=${encodeURIComponent(w.name)}`); }}
                      className="pressable flex-1 min-w-0 flex items-center gap-1 text-left">
                      <span className="text-[15px] font-semibold truncate">{w.name}</span>
                      <ChevronRight size={15} className="text-label-tertiary flex-shrink-0" />
                    </button>
                    <button onClick={() => unfollow(w)} disabled={busyId !== null}
                      className="pressable flex-shrink-0 flex items-center gap-1 text-[12px] px-3 py-1.5 rounded-full font-medium"
                      style={{ backgroundColor: 'var(--fill-tertiary)', color: 'var(--label-secondary)' }}>
                      <Check size={13} /> フォロー中
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <WorkFollowSheet open={sheetOpen} onClose={closeAdd} onChanged={reload} />
    </div>
  );
}

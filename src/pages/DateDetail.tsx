import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { ExternalLink, Heart, Plus, Smile, Share2, Trash2 } from 'lucide-react';
import Layout from '../components/Layout';
import Header from '../components/Header';
import { useNavigate } from 'react-router-dom';
import { listEventsByDate, addLikeTap, getReactionData, setReaction, getWorkById, getDisplayName, deleteEvent } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import type { CalendarEvent } from '../types';
import { REACTIONS, type ReactionType } from '../lib/reactions';
import { incrementTotalLikesGiven, ANON_NAME } from '../lib/constants';
import { safeHref } from '../lib/url';
import SourceBadge from '../components/SourceBadge';
import { useLikeAnimation } from '../hooks/useLikeAnimation';
import { useReportedEventIds } from '../hooks/useReportedEventIds';
import UserProfileModal from '../components/UserProfileModal';
import MemoText from '../components/MemoText';
import { useConfirm } from '../components/ui/ConfirmDialog';
import { useToast } from '../components/ui/Toast';
import { haptic } from '../lib/haptics';

// ─── いいねセッション（localStorage）────────────────────────────────

const MAX_TAPS = 10;
const COOLDOWN_MS = 60 * 1_000;

interface LikeSession { tapsUsed: number; resetAt: number; }

function loadSession(eventId: string): LikeSession {
  try {
    const raw = localStorage.getItem(`like_session:${eventId}`);
    if (!raw) return { tapsUsed: 0, resetAt: 0 };
    const s = JSON.parse(raw) as LikeSession;
    if (s.resetAt > 0 && Date.now() >= s.resetAt) return { tapsUsed: 0, resetAt: 0 };
    return s;
  } catch { return { tapsUsed: 0, resetAt: 0 }; }
}

function saveSession(eventId: string, s: LikeSession) {
  localStorage.setItem(`like_session:${eventId}`, JSON.stringify(s));
}

// ─── いいねボタン ──────────────────────────────────────────────────

function LikeButton({
  event,
  userId,
  onTapped,
}: {
  event: CalendarEvent;
  userId: string | undefined;
  onTapped: (newCount: number) => void;
}) {
  const [session, setSession] = useState<LikeSession>(() => loadSession(event.id));
  const [bumped, setBumped] = useState(false);
  const [flash, setFlash] = useState(false);
  const [, forceRender] = useState(0);
  const { trigger: triggerAnim, renderOverlay } = useLikeAnimation();

  const locked = session.tapsUsed >= MAX_TAPS;
  const hasLiked = event.likedByMe || session.tapsUsed > 0;

  // クールダウンのカウントダウン
  useEffect(() => {
    if (!locked || session.resetAt === 0) return;
    const id = setInterval(() => {
      if (Date.now() >= session.resetAt) {
        const reset = { tapsUsed: 0, resetAt: 0 };
        setSession(reset);
        saveSession(event.id, reset);
      } else {
        forceRender(n => n + 1);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [locked, session.resetAt, event.id]);

  const handleTap = async () => {
    if (!userId || locked) return;
    const newTaps = session.tapsUsed + 1;
    const resetAt = newTaps >= MAX_TAPS ? Date.now() + COOLDOWN_MS : 0;
    const next = { tapsUsed: newTaps, resetAt };
    setSession(next);
    saveSession(event.id, next);
    incrementTotalLikesGiven();

    // アニメーション
    setBumped(true);
    setFlash(true);
    setTimeout(() => setBumped(false), 280);
    setTimeout(() => setFlash(false), 180);


    try {
      const newCount = await addLikeTap(event.id, userId);
      onTapped(newCount);
    } catch (e) { console.error(e); }
  };

  return (
    <div className="flex items-center gap-2">
      {renderOverlay()}

      <div className="relative">
        <button
          onClick={e => { handleTap(); triggerAnim(e.currentTarget); }}
          disabled={!userId || locked}
          aria-label={`いいね (${event.likes.toLocaleString('ja-JP')}件)`}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm select-none ${locked ? 'opacity-30' : ''}`}
          style={{
            color: hasLiked ? 'rgb(248,113,113)' : 'var(--label-secondary)',
            background: flash ? 'rgba(248,113,113,0.18)' : hasLiked ? 'rgba(248,113,113,0.12)' : 'var(--fill-tertiary)',
            transform: bumped ? 'scale(1.26)' : 'scale(1)',
            transition: 'transform 0.32s cubic-bezier(0.34, 1.56, 0.64, 1), border-color 0.15s, background 0.2s',
          }}
        >
          <Heart
            size={14}
            style={{
              fill: hasLiked ? 'rgb(248,113,113)' : 'none',
              color: hasLiked ? 'rgb(248,113,113)' : 'var(--label-secondary)',
              filter: hasLiked ? 'drop-shadow(0 0 5px rgba(248,113,113,0.8))' : 'none',
              transform: bumped ? 'scale(1.2)' : 'scale(1)',
              transition: 'all 0.32s cubic-bezier(0.34, 1.56, 0.64, 1)',
            }}
          />
          <span
            style={{
              animation: bumped ? 'countPop 0.3s ease-out both' : undefined,
            }}
          >
            {event.likes.toLocaleString('ja-JP')}
          </span>
        </button>
      </div>
    </div>
  );
}

// ─── ユーティリティ ───────────────────────────────────────────────

function getDomain(url: string): string {
  try {
    const { hostname } = new URL(url);
    if (hostname.includes('amazon')) return 'Amazon';
    if (hostname.includes('twitter.com') || hostname.includes('x.com')) return '公式X';
    if (hostname.includes('kindle')) return 'Kindle';
    if (hostname.includes('bookwalker')) return 'BOOKWALKER';
    return hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function timeAgo(isoStr: string): string {
  const diff = Date.now() - new Date(isoStr).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days === 0) return '今日';
  if (days < 30) return `${days}日前`;
  return `${Math.floor(days / 30)}ヶ月前`;
}

// ─── イベントカード ────────────────────────────────────────────────

type ReactionData = { counts: Record<string, number>; myReaction: string | null };

function EventCard({
  event,
  userId,
  onTapped,
  reactionData,
  onOpenReactionPicker,
  onAuthorClick,
  onDelete,
  workName,
  displayName,
}: {
  event: CalendarEvent;
  userId: string | undefined;
  onTapped: (id: string, newCount: number) => void;
  reactionData?: ReactionData;
  onOpenReactionPicker?: () => void;
  onAuthorClick?: (authorId: string) => void;
  onDelete?: (id: string) => void;
  workName?: string | null;
  displayName?: string | null;
}) {
  const hasReactions = reactionData && Object.values(reactionData.counts).some(c => c > 0);

  const timeLabel = event.endTime ? `${event.time}〜${event.endTime}` : event.time;
  const dateLabel = event.date && event.endDate && event.endDate !== event.date
    ? (() => { const fmt = (d: string) => { const [, m, day] = d.split('-'); return `${parseInt(m)}月${parseInt(day)}日`; }; return `${fmt(event.date)}〜${fmt(event.endDate)}`; })()
    : null;
  return (
    <div className="bg-bg-secondary rounded-[14px] px-4 py-4 flex flex-col gap-3">
      {/* 予約バッジ */}
      {event.isOrderMade && (
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full w-fit" style={{ background: 'var(--color-destructive)', color: '#fff' }}>予約</span>
      )}
      {/* タイトル + 時間 */}
      <div className="flex items-start justify-between gap-2">
        <p className="text-label-primary font-bold text-[15px] leading-snug flex-1">{event.title}</p>
        {timeLabel && (
          <span className="text-label-secondary text-sm flex-shrink-0">{timeLabel}</span>
        )}
      </div>
      {dateLabel && (
        <p className="text-label-secondary text-xs -mt-1">{dateLabel}</p>
      )}

      {/* メモ */}
      {event.memo && (
        <MemoText text={event.memo} className="text-label-secondary text-sm leading-relaxed" />
      )}

      {/* リンクチップ */}
      {event.link && (
        <div className="flex flex-wrap gap-2">
          <a
            href={safeHref(event.link)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 px-3 py-1 rounded-full text-label-secondary text-xs active:opacity-60"
            style={{ backgroundColor: 'var(--fill-tertiary)' }}
          >
            <ExternalLink size={11} />
            <span>{getDomain(event.link)}</span>
          </a>
        </div>
      )}

      {/* いいね + リアクションボタン + Xシェア */}
      <div className="flex items-center gap-2">
        <LikeButton event={event} userId={userId} onTapped={count => onTapped(event.id, count)} />
        {onOpenReactionPicker && (
          <button
            onClick={onOpenReactionPicker}
            className="flex items-center justify-center px-3 py-1.5 rounded-full text-sm active:opacity-60"
            style={{
              backgroundColor: reactionData?.myReaction
                ? 'color-mix(in srgb, var(--accent-color) 15%, transparent)'
                : 'var(--fill-tertiary)',
              color: reactionData?.myReaction ? 'var(--accent-color)' : 'var(--label-secondary)',
              minWidth: '2.5rem',
            }}
          >
            {reactionData?.myReaction
              ? <img src={REACTIONS.find(r => r.type === reactionData.myReaction)?.image} alt="" className="h-4 w-auto" />
              : <Smile size={14} />
            }
          </button>
        )}
        <a
          href={(() => {
            const parts = [`「${event.title}」をカレンダーに登録しました！`];
            if (workName) parts.push(`#${workName.replace(/\s/g, '_')}`);
            if (displayName) parts.push(`by ${displayName}`);
            parts.push(window.location.origin);
            return `https://twitter.com/intent/tweet?text=${encodeURIComponent(parts.join('\n'))}`;
          })()}
          target="_blank" rel="noopener noreferrer"
          className="ml-auto flex items-center justify-center px-3 py-1.5 rounded-full text-sm active:opacity-60"
          style={{ backgroundColor: 'var(--fill-tertiary)', color: 'var(--label-secondary)', minWidth: '2.5rem' }}
        >
          <Share2 size={14} />
        </a>
        {/* 🗑️ 削除（投稿者本人のみ） */}
        {onDelete && userId && event.authorId === userId && (
          <button
            onClick={() => onDelete(event.id)}
            className="flex items-center justify-center px-3 py-1.5 rounded-full text-sm active:opacity-60"
            style={{ backgroundColor: 'var(--fill-tertiary)', color: 'var(--label-tertiary)', minWidth: '2.5rem' }}
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>

      {/* リアクション集計 */}
      {hasReactions && (
        <div className="flex items-center gap-3 flex-wrap">
          {REACTIONS.filter(r => (reactionData?.counts[r.type] ?? 0) > 0).map(r => (
            <span key={r.type} className="flex items-center gap-0.5 text-label-secondary">
              <img src={r.image} alt={r.label} className="h-4 w-auto" />
              <span className="text-xs">{reactionData!.counts[r.type]}</span>
            </span>
          ))}
        </div>
      )}

      {/* 投稿者 */}
      <div className="flex items-center justify-between gap-2">
        <p className="text-label-tertiary text-xs">
          {event.authorId && onAuthorClick ? (
            <button onClick={() => onAuthorClick(event.authorId!)} className="underline underline-offset-2 active:opacity-60">
              {event.authorName ?? ANON_NAME}
            </button>
          ) : (event.authorName ?? ANON_NAME)}
          {' '}・ {timeAgo(event.createdAt)}
        </p>
        <SourceBadge sourceUrl={event.sourceUrl} />
      </div>
    </div>
  );
}

// ─── メイン画面 ────────────────────────────────────────────────────

export default function DateDetail() {
  const { workId = '', date = '' } = useParams<{ workId: string; date: string }>();
  const { user } = useAuth();
  const confirmDialog = useConfirm();
  const showToast = useToast();
  const navigate = useNavigate();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const { reportedEventIds } = useReportedEventIds(user?.id);
  const [loading, setLoading] = useState(true);
  const [eventReactions, setEventReactions] = useState<Record<string, ReactionData>>({});
  const [openReactionPickerId, setOpenReactionPickerId] = useState<string | null>(null);
  const [viewingUserId, setViewingUserId] = useState<string | null>(null);
  const [workName, setWorkName] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);

  useEffect(() => {
    if (workId) getWorkById(workId).then(w => setWorkName(w?.name ?? null));
  }, [workId]);

  useEffect(() => {
    if (user?.id) getDisplayName(user.id).then(setDisplayName);
  }, [user?.id]);

  // イベント取得
  useEffect(() => {
    setLoading(true);
    listEventsByDate(workId, date, user?.id)
      .then(setEvents)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [workId, date, user?.id]);

  // リアクション取得（イベント取得と分離してエラーが独立）
  useEffect(() => {
    if (events.length === 0) return;
    Promise.all(
      events.map(e =>
        getReactionData(e.id, user?.id)
          .then(r => [e.id, r] as const)
          .catch(() => [e.id, { counts: {}, myReaction: null }] as const),
      ),
    ).then(pairs => setEventReactions(Object.fromEntries(pairs)));
  }, [events, user?.id]);

  // 通報済みイベントは通報者には表示しない
  const visibleEvents = events.filter(e => !reportedEventIds.has(e.id));

  const handleTapped = (eventId: string, newCount: number) => {
    setEvents(prev =>
      prev.map(e => e.id === eventId ? { ...e, likes: newCount } : e),
    );
  };

  const handleDelete = async (eventId: string) => {
    const event = events.find(e => e.id === eventId);
    if (!event) return;
    if (!(await confirmDialog({ title: '予定を削除', message: `「${event.title}」を削除しますか？\nこの操作は元に戻せません。`, confirmLabel: '削除', destructive: true }))) return;
    try {
      await deleteEvent(eventId);
      setEvents(prev => prev.filter(e => e.id !== eventId));
    } catch { showToast('削除に失敗しました', 'error'); }
  };

  const handleReaction = async (eventId: string, type: ReactionType) => {
    haptic.light();
    if (!user) return;
    const current = eventReactions[eventId];
    const isToggleOff = current?.myReaction === type;
    const newMyReaction = isToggleOff ? null : type;

    // 楽観的更新
    setEventReactions(prev => {
      const prevData = prev[eventId] ?? { counts: {}, myReaction: null };
      const counts = { ...prevData.counts };
      if (isToggleOff) {
        counts[type] = Math.max(0, (counts[type] ?? 0) - 1);
        if (counts[type] === 0) delete counts[type];
      } else {
        if (prevData.myReaction) {
          const old = prevData.myReaction;
          counts[old] = Math.max(0, (counts[old] ?? 0) - 1);
          if (counts[old] === 0) delete counts[old];
        }
        counts[type] = (counts[type] ?? 0) + 1;
      }
      return { ...prev, [eventId]: { counts, myReaction: newMyReaction } };
    });
    setOpenReactionPickerId(null);

    try {
      await setReaction(eventId, user.id, newMyReaction);
    } catch (e) { console.error(e); }
  };

  // ヘッダータイトル
  const title = (() => {
    if (!date) return '';
    const d = new Date(date + 'T00:00:00');
    return `${d.getMonth() + 1}月${d.getDate()}日`;
  })();

  return (
    <Layout>
      <Header title={title} />

      <div className="px-4 pt-4 pb-6">
        <p className="text-label-secondary text-xs mb-3 px-1">この日の予定</p>

        {loading ? (
          <div className="flex flex-col gap-3">
            {[1, 2].map(i => <div key={i} className="h-32 bg-bg-secondary rounded-[14px] animate-pulse" />)}
          </div>
        ) : visibleEvents.length === 0 ? (
          <p className="text-center text-label-tertiary text-sm py-16">
            この日の予定はまだありません
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {visibleEvents.map(event => (
              <EventCard
                key={event.id}
                event={event}
                userId={user?.id}
                onTapped={handleTapped}
                reactionData={eventReactions[event.id]}
                onOpenReactionPicker={() => setOpenReactionPickerId(prev => prev === event.id ? null : event.id)}
                onAuthorClick={id => setViewingUserId(id)}
                onDelete={handleDelete}
                workName={workName}
                displayName={displayName}
              />
            ))}
          </div>
        )}
      </div>

      {/* リアクションピッカー */}
      {openReactionPickerId && (
        <>
          <div className="fixed inset-0 z-[310]" onClick={() => setOpenReactionPickerId(null)} />
          <div className="fixed inset-x-0 max-w-app mx-auto z-[320]" style={{ bottom: 80 }}>
            <div className="mx-4 bg-bg-primary rounded-[18px] shadow-xl p-3 grid grid-cols-3 gap-1" style={{ animation: 'slideUpIn 0.25s cubic-bezier(0.32, 0.72, 0, 1) both' }}>
              {REACTIONS.map(r => (
                <button
                  key={r.type}
                  onClick={() => handleReaction(openReactionPickerId, r.type)}
                  className="flex flex-col items-center gap-1 px-2 py-2 rounded-[14px] active:opacity-60"
                  style={{
                    background: eventReactions[openReactionPickerId]?.myReaction === r.type
                      ? 'var(--bg-secondary)'
                      : 'transparent',
                  }}
                >
                  <img src={r.image} alt={r.label} className="h-8 w-auto" />
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {/* FAB */}
      <button
        onClick={() => navigate(`/calendar/${workId}`, { state: { openPostDate: date } })}
        className="fixed bottom-[76px] right-4 w-14 h-14 rounded-full flex items-center justify-center shadow-xl z-40 active:opacity-80 transition-opacity"
        style={{ backgroundColor: 'var(--accent-color)', color: 'var(--accent-on)' }}
        aria-label="予定を追加"
      >
        <Plus size={22} strokeWidth={2.5} />
      </button>

      {viewingUserId && (
        <UserProfileModal userId={viewingUserId} onClose={() => setViewingUserId(null)} />
      )}
    </Layout>
  );
}

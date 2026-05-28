import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { ExternalLink, Heart, Plus, Smile } from 'lucide-react';
import Layout from '../components/Layout';
import Header from '../components/Header';
import { useNavigate } from 'react-router-dom';
import { listEventsByDate, addLikeTap, getReactionData, setReaction } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import type { CalendarEvent } from '../types';
import { REACTIONS, type ReactionType } from '../lib/reactions';
import { incrementTotalLikesGiven } from '../lib/constants';
import { useLikeAnimation } from '../hooks/useLikeAnimation';
import UserProfileModal from '../components/UserProfileModal';

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
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm select-none ${locked ? 'opacity-30' : ''}`}
          style={{
            borderColor: flash ? 'rgb(248,113,113)' : hasLiked ? 'rgb(248,113,113)' : 'var(--border-default)',
            color: hasLiked ? 'rgb(248,113,113)' : 'var(--label-secondary)',
            background: flash ? 'rgba(248,113,113,0.12)' : 'transparent',
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
}: {
  event: CalendarEvent;
  userId: string | undefined;
  onTapped: (id: string, newCount: number) => void;
  reactionData?: ReactionData;
  onOpenReactionPicker?: () => void;
  onAuthorClick?: (authorId: string) => void;
}) {
  const hasReactions = reactionData && Object.values(reactionData.counts).some(c => c > 0);

  const timeLabel = event.endTime ? `${event.time}〜${event.endTime}` : event.time;
  const dateLabel = event.endDate && event.endDate !== event.date
    ? (() => { const fmt = (d: string) => { const [, m, day] = d.split('-'); return `${parseInt(m)}月${parseInt(day)}日`; }; return `${fmt(event.date)}〜${fmt(event.endDate)}`; })()
    : null;
  return (
    <div className="bg-bg-secondary rounded-xl px-4 py-4 flex flex-col gap-3 shadow-card">
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
        <p className="text-label-secondary text-sm leading-relaxed">{event.memo}</p>
      )}

      {/* リンクチップ */}
      {event.link && (
        <div className="flex flex-wrap gap-2">
          <a
            href={event.link}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 px-3 py-1 rounded-full border border-default text-label-secondary text-xs active:opacity-60"
          >
            <ExternalLink size={11} />
            <span>{getDomain(event.link)}</span>
          </a>
        </div>
      )}

      {/* いいね + リアクションボタン */}
      <div className="flex items-center gap-2">
        <LikeButton event={event} userId={userId} onTapped={count => onTapped(event.id, count)} />
        {onOpenReactionPicker && (
          <button
            onClick={onOpenReactionPicker}
            className="flex items-center justify-center px-3 py-1.5 rounded-full border text-sm active:opacity-60"
            style={{
              borderColor: reactionData?.myReaction ? 'var(--accent-color)' : 'var(--border-default)',
              color: reactionData?.myReaction ? 'var(--accent-color)' : 'var(--label-secondary)',
              minWidth: '2.5rem',
            }}
          >
            {reactionData?.myReaction
              ? <span className="text-base leading-none">{REACTIONS.find(r => r.type === reactionData.myReaction)?.emoji}</span>
              : <Smile size={14} />
            }
          </button>
        )}
      </div>

      {/* リアクション集計 */}
      {hasReactions && (
        <div className="flex items-center gap-3 flex-wrap">
          {REACTIONS.filter(r => (reactionData?.counts[r.type] ?? 0) > 0).map(r => (
            <span key={r.type} className="flex items-center gap-0.5 text-label-secondary">
              <span className="text-base leading-none">{r.emoji}</span>
              <span className="text-xs">{reactionData!.counts[r.type]}</span>
            </span>
          ))}
        </div>
      )}

      {/* 投稿者 */}
      <p className="text-label-tertiary text-xs">
        {event.authorId && onAuthorClick ? (
          <button onClick={() => onAuthorClick(event.authorId!)} className="underline underline-offset-2 active:opacity-60">
            {event.authorName ?? '匿名'}
          </button>
        ) : (event.authorName ?? '匿名')}
        {' '}・ {timeAgo(event.createdAt)}
      </p>
    </div>
  );
}

// ─── メイン画面 ────────────────────────────────────────────────────

export default function DateDetail() {
  const { workId = '', date = '' } = useParams<{ workId: string; date: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [eventReactions, setEventReactions] = useState<Record<string, ReactionData>>({});
  const [openReactionPickerId, setOpenReactionPickerId] = useState<string | null>(null);
  const [viewingUserId, setViewingUserId] = useState<string | null>(null);

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

  const handleTapped = (eventId: string, newCount: number) => {
    setEvents(prev =>
      prev.map(e => e.id === eventId ? { ...e, likes: newCount } : e),
    );
  };

  const handleReaction = async (eventId: string, type: ReactionType) => {
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
            {[1, 2].map(i => <div key={i} className="h-32 bg-bg-secondary rounded-xl animate-pulse" />)}
          </div>
        ) : events.length === 0 ? (
          <p className="text-center text-label-tertiary text-sm py-16">
            この日の予定はまだありません
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {events.map(event => (
              <EventCard
                key={event.id}
                event={event}
                userId={user?.id}
                onTapped={handleTapped}
                reactionData={eventReactions[event.id]}
                onOpenReactionPicker={() => setOpenReactionPickerId(prev => prev === event.id ? null : event.id)}
                onAuthorClick={id => setViewingUserId(id)}
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
            <div className="mx-4 bg-bg-primary rounded-2xl border border-subtle shadow-xl p-3 flex justify-around">
              {REACTIONS.map(r => (
                <button
                  key={r.type}
                  onClick={() => handleReaction(openReactionPickerId, r.type)}
                  className="flex flex-col items-center gap-1 px-3 py-2 rounded-xl active:opacity-60"
                  style={{
                    background: eventReactions[openReactionPickerId]?.myReaction === r.type
                      ? 'var(--bg-secondary)'
                      : 'transparent',
                  }}
                >
                  <span className="text-2xl">{r.emoji}</span>
                  <span className="text-[10px] text-label-secondary">{r.label}</span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {/* FAB */}
      <button
        onClick={() => navigate(`/calendar/${workId}/post?date=${date}`)}
        className="fixed bottom-[76px] right-4 w-[52px] h-[52px] bg-label-primary text-bg-primary rounded-full flex items-center justify-center shadow-xl z-40 active:opacity-80 transition-opacity"
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

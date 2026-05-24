import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ExternalLink, Heart, Plus } from 'lucide-react';
import Layout from '../components/Layout';
import Header from '../components/Header';
import { listEventsByDate, addLikeTap, setReaction } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import type { CalendarEvent, ReactionType, ReactionCounts } from '../types';

// ─── ハートいいねセッション ────────────────────────────────────────

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

// ─── ハートいいねボタン ────────────────────────────────────────────

interface HeartFloater { id: number; x: number; }

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
  const [floaters, setFloaters] = useState<HeartFloater[]>([]);
  const [, forceRender] = useState(0);

  const locked = session.tapsUsed >= MAX_TAPS;
  const hasLiked = event.likedByMe || session.tapsUsed > 0;

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

    setBumped(true);
    setFlash(true);
    setTimeout(() => setBumped(false), 280);
    setTimeout(() => setFlash(false), 180);

    const count = Math.random() > 0.5 ? 2 : 1;
    const newFloaters: HeartFloater[] = Array.from({ length: count }, (_, i) => ({
      id: Date.now() + i,
      x: Math.floor(Math.random() * 28),
    }));
    setFloaters(prev => [...prev, ...newFloaters]);
    setTimeout(() => {
      setFloaters(prev => prev.filter(f => !newFloaters.some(nf => nf.id === f.id)));
    }, 900);

    try {
      const newCount = await addLikeTap(event.id, userId);
      onTapped(newCount);
    } catch (e) { console.error(e); }
  };

  return (
    <div className="flex items-center gap-2">
      <div className="relative">
        {floaters.map(f => (
          <div
            key={f.id}
            className="absolute pointer-events-none"
            style={{
              bottom: '100%',
              left: `${8 + f.x}px`,
              animation: 'floatHeart 0.9s cubic-bezier(0.22, 1, 0.36, 1) forwards',
              color: 'rgb(248,113,113)',
            }}
          >
            <Heart size={11} style={{ fill: 'rgb(248,113,113)' }} />
          </div>
        ))}

        <button
          onClick={handleTap}
          disabled={!userId || locked}
          aria-label={`いいね (${event.likes.toLocaleString('ja-JP')}件)`}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-sm select-none ${locked ? 'opacity-30' : ''}`}
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
          <span style={{ animation: bumped ? 'countPop 0.3s ease-out both' : undefined }}>
            {event.likes.toLocaleString('ja-JP')}
          </span>
        </button>
      </div>
    </div>
  );
}

// ─── 絵文字リアクションボタン ──────────────────────────────────────

const REACTIONS: { type: ReactionType; emoji: string; label: string }[] = [
  { type: 'like',    emoji: '♡', label: 'いいね' },
  { type: 'want',    emoji: '📅', label: '行きたい' },
  { type: 'hot',     emoji: '🔥', label: 'アツい' },
  { type: 'amazing', emoji: '🎉', label: 'すごい' },
  { type: 'best',    emoji: '👑', label: '最高' },
];

interface EmojiFloater { id: number; x: number; emoji: string; }

function ReactionButton({
  event,
  userId,
  onReactionChange,
}: {
  event: CalendarEvent;
  userId: string | undefined;
  onReactionChange: (id: string, counts: ReactionCounts, reaction: ReactionType | null) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [bumped, setBumped] = useState(false);
  const [flash, setFlash] = useState(false);
  const [floaters, setFloaters] = useState<EmojiFloater[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  const currentReaction = event.userReaction ?? null;
  const hasReaction = currentReaction !== null;
  const displayEmoji = REACTIONS.find(r => r.type === currentReaction)?.emoji ?? '＋';

  const totalReactions = event.reactionCounts
    ? Object.values(event.reactionCounts).reduce((a, b) => a + b, 0)
    : 0;

  useEffect(() => {
    if (!pickerOpen) return;
    const handleClose = (e: Event) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    };
    const tid = setTimeout(() => {
      document.addEventListener('mousedown', handleClose);
      document.addEventListener('touchstart', handleClose, { passive: true });
    }, 0);
    return () => {
      clearTimeout(tid);
      document.removeEventListener('mousedown', handleClose);
      document.removeEventListener('touchstart', handleClose);
    };
  }, [pickerOpen]);

  const triggerAnimation = (emoji: string) => {
    setBumped(true);
    setFlash(true);
    setTimeout(() => setBumped(false), 280);
    setTimeout(() => setFlash(false), 180);
    const count = Math.random() > 0.5 ? 2 : 1;
    const newFloaters: EmojiFloater[] = Array.from({ length: count }, (_, i) => ({
      id: Date.now() + i,
      x: Math.floor(Math.random() * 28),
      emoji,
    }));
    setFloaters(prev => [...prev, ...newFloaters]);
    setTimeout(() => {
      setFloaters(prev => prev.filter(f => !newFloaters.some(nf => nf.id === f.id)));
    }, 900);
  };

  const handleSetReaction = async (reactionType: ReactionType | null) => {
    if (!userId || loading) return;
    setPickerOpen(false);
    setLoading(true);
    const selected = REACTIONS.find(r => r.type === reactionType);
    if (selected) triggerAnimation(selected.emoji);
    try {
      const newCounts = await setReaction(event.id, userId, reactionType);
      onReactionChange(event.id, newCounts, reactionType);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  return (
    <div className="flex flex-col gap-1">
      <div ref={containerRef} className="relative">
        {/* フローティング絵文字 */}
        {floaters.map(f => (
          <div
            key={f.id}
            className="absolute pointer-events-none"
            style={{
              bottom: '100%',
              left: `${8 + f.x}px`,
              animation: 'floatHeart 0.9s cubic-bezier(0.22, 1, 0.36, 1) forwards',
              fontSize: '11px',
              lineHeight: 1,
            }}
          >
            {f.emoji}
          </div>
        ))}

        {/* 絵文字ピッカー */}
        {pickerOpen && (
          <div
            className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 flex gap-1 rounded-2xl px-3 py-2 shadow-lg z-[300]"
            style={{
              backgroundColor: 'var(--bg-secondary)',
              border: '1px solid var(--border-faint)',
              whiteSpace: 'nowrap',
            }}
          >
            {REACTIONS.map(r => (
              <button
                key={r.type}
                type="button"
                onClick={() => handleSetReaction(r.type)}
                className="flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-xl transition-transform active:scale-110"
                style={{
                  background: currentReaction === r.type ? 'rgba(248,113,113,0.12)' : 'transparent',
                }}
              >
                <span className="text-xl leading-none">{r.emoji}</span>
                <span className="text-[9px]" style={{ color: 'var(--label-tertiary)' }}>{r.label}</span>
              </button>
            ))}
            {/* 取り消しボタン（リアクション済みの場合のみ） */}
            {hasReaction && (
              <button
                type="button"
                onClick={() => handleSetReaction(null)}
                className="flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-xl transition-transform active:scale-110"
              >
                <span className="text-xl leading-none">✕</span>
                <span className="text-[9px]" style={{ color: 'var(--label-tertiary)' }}>取消</span>
              </button>
            )}
          </div>
        )}

        {/* メインボタン */}
        <button
          onClick={() => {
            if (!userId || loading) return;
            setPickerOpen(v => !v);
          }}
          disabled={!userId || loading}
          aria-label="リアクションを選ぶ"
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-sm select-none ${loading ? 'opacity-50' : ''}`}
          style={{
            borderColor: flash || hasReaction ? 'rgb(249,168,37)' : 'var(--border-default)',
            color: hasReaction ? 'rgb(234,88,12)' : 'var(--label-secondary)',
            background: flash ? 'rgba(249,168,37,0.12)' : 'transparent',
            transform: bumped ? 'scale(1.26)' : 'scale(1)',
            transition: 'transform 0.32s cubic-bezier(0.34, 1.56, 0.64, 1), border-color 0.15s, background 0.2s',
          }}
        >
          <span
            style={{
              fontSize: '14px',
              lineHeight: 1,
              display: 'inline-block',
              transform: bumped ? 'scale(1.2)' : 'scale(1)',
              transition: 'all 0.32s cubic-bezier(0.34, 1.56, 0.64, 1)',
            }}
          >
            {hasReaction ? displayEmoji : '＋'}
          </span>
          <span style={{ animation: bumped ? 'countPop 0.3s ease-out both' : undefined }}>
            {totalReactions > 0 ? totalReactions.toLocaleString('ja-JP') : 'リアクション'}
          </span>
        </button>
      </div>

      {/* リアクション内訳 */}
      {event.reactionCounts && totalReactions > 0 && (
        <div className="flex gap-2 flex-wrap pl-1">
          {REACTIONS.map(r => {
            const count = event.reactionCounts![r.type];
            if (count === 0) return null;
            return (
              <span
                key={r.type}
                className="text-[10px] flex items-center gap-0.5"
                style={{ color: 'var(--label-tertiary)' }}
              >
                {r.emoji} {count}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── ユーティリティ ────────────────────────────────────────────────

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

function EventCard({
  event,
  userId,
  onTapped,
  onReactionChange,
}: {
  event: CalendarEvent;
  userId: string | undefined;
  onTapped: (id: string, count: number) => void;
  onReactionChange: (id: string, counts: ReactionCounts, reaction: ReactionType | null) => void;
}) {
  return (
    <div className="bg-bg-secondary rounded-xl px-4 py-4 flex flex-col gap-3">
      {/* タイトル + 時間 */}
      <div className="flex items-start justify-between gap-2">
        <p className="text-label-primary font-bold text-[15px] leading-snug flex-1">{event.title}</p>
        {event.time && (
          <span className="text-label-secondary text-sm flex-shrink-0">{event.time}</span>
        )}
      </div>

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

      {/* ハートいいね + 絵文字リアクション */}
      <div className="flex items-start gap-3 flex-wrap">
        <LikeButton event={event} userId={userId} onTapped={count => onTapped(event.id, count)} />
        <div className="w-px self-stretch mt-1.5" style={{ backgroundColor: 'var(--border-faint)' }} />
        <ReactionButton event={event} userId={userId} onReactionChange={onReactionChange} />
      </div>

      {/* 投稿者 */}
      <p className="text-label-tertiary text-xs">
        {event.authorName ? event.authorName : '匿名'} ・ {timeAgo(event.createdAt)}
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

  useEffect(() => {
    setLoading(true);
    listEventsByDate(workId, date, user?.id)
      .then(setEvents)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [workId, date, user?.id]);

  const handleTapped = (eventId: string, newCount: number) => {
    setEvents(prev => prev.map(e => e.id === eventId ? { ...e, likes: newCount } : e));
  };

  const handleReactionChange = (
    eventId: string,
    newCounts: ReactionCounts,
    newReaction: ReactionType | null,
  ) => {
    setEvents(prev =>
      prev.map(e => e.id === eventId ? {
        ...e,
        userReaction: newReaction,
        reactionCounts: newCounts,
      } : e),
    );
  };

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
                onReactionChange={handleReactionChange}
              />
            ))}
          </div>
        )}
      </div>

      {/* FAB */}
      <button
        onClick={() => navigate(`/calendar/${workId}/post?date=${date}`)}
        className="fixed bottom-[76px] right-4 w-[52px] h-[52px] bg-label-primary text-bg-primary rounded-full flex items-center justify-center shadow-xl z-40 active:opacity-80 transition-opacity"
        aria-label="予定を追加"
      >
        <Plus size={22} strokeWidth={2.5} />
      </button>
    </Layout>
  );
}

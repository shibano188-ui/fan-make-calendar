import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { ExternalLink, Heart, Plus } from 'lucide-react';
import Layout from '../components/Layout';
import Header from '../components/Header';
import { useNavigate } from 'react-router-dom';
import { listEventsByDate, addLikeTap } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import type { CalendarEvent } from '../types';

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

interface Floater { id: number; x: number; }

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
  const [floaters, setFloaters] = useState<Floater[]>([]);
  const [, forceRender] = useState(0);

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

    // アニメーション
    setBumped(true);
    setFlash(true);
    setTimeout(() => setBumped(false), 280);
    setTimeout(() => setFlash(false), 180);

    // フローティングハート（1〜2個、ランダムx）
    const count = Math.random() > 0.5 ? 2 : 1;
    const newFloaters: Floater[] = Array.from({ length: count }, (_, i) => ({
      id: Date.now() + i,
      x: Math.floor(Math.random() * 28),
    }));
    setFloaters(prev => [...prev, ...newFloaters]);
    setTimeout(() => {
      setFloaters(prev => prev.filter(f => !newFloaters.find(nf => nf.id === f.id)));
    }, 900);

    try {
      const newCount = await addLikeTap(event.id, userId);
      onTapped(newCount);
    } catch (e) { console.error(e); }
  };

  return (
    <div className="flex items-center gap-2">
      <div className="relative">
        {/* フローティングハート（赤） */}
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
}: {
  event: CalendarEvent;
  userId: string | undefined;
  onTapped: (id: string, newCount: number) => void;
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

      {/* いいねボタン */}
      <LikeButton event={event} userId={userId} onTapped={count => onTapped(event.id, count)} />

      {/* 投稿者 */}
      <p className="text-label-tertiary text-xs">
        投稿者 匿名 ・ {timeAgo(event.createdAt)}
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
    setEvents(prev =>
      prev.map(e => e.id === eventId ? { ...e, likes: newCount } : e),
    );
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
              <EventCard key={event.id} event={event} userId={user?.id} onTapped={handleTapped} />
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

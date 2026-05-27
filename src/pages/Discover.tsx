import { useState, useMemo, useEffect } from 'react';
import {
  Heart, Smile, Pencil, SlidersHorizontal, ExternalLink,
} from 'lucide-react';
import BottomTab from '../components/BottomTab';
import Header from '../components/Header';
import {
  listUpcomingParticipatedEvents, getLikedEventIds, addLikeTap,
  setReaction, getMyReactionsBatch, updateEvent, listRecentWorks,
} from '../lib/api';
import { REACTIONS, type ReactionType } from '../lib/reactions';
import type { Work } from '../lib/api';
import type { CalendarEvent } from '../types';
import { useAuth } from '../contexts/AuthContext';
import {
  POST_CATEGORIES, type PostCategory,
  loadCategoryFilters, saveCategoryFilters,
} from '../lib/constants';
import { WORK_COLORS } from './Calendar';

// ─── localStorage ──────────────────────────────────────────────────

const REACTIONS_KEY = 'fan_reactions';
function loadMyReactions(): Record<string, ReactionType> {
  try { return JSON.parse(localStorage.getItem(REACTIONS_KEY) ?? '{}'); } catch { return {}; }
}
function saveMyReactions(r: Record<string, ReactionType>) {
  localStorage.setItem(REACTIONS_KEY, JSON.stringify(r));
}

// ─── いいねセッション（Calendar.tsxと同じ実装） ──────────────────

const LIKE_MAX_TAPS = 10;
const LIKE_COOLDOWN_MS = 60_000;
interface LikeSession { tapsUsed: number; resetAt: number; }
function loadLikeSession(id: string): LikeSession {
  try {
    const raw = localStorage.getItem(`like_session:${id}`);
    if (!raw) return { tapsUsed: 0, resetAt: 0 };
    const s = JSON.parse(raw) as LikeSession;
    if (s.resetAt > 0 && Date.now() >= s.resetAt) return { tapsUsed: 0, resetAt: 0 };
    return s;
  } catch { return { tapsUsed: 0, resetAt: 0 }; }
}
function saveLikeSession(id: string, s: LikeSession) {
  localStorage.setItem(`like_session:${id}`, JSON.stringify(s));
}

// ─── 作品カラーマップ ─────────────────────────────────────────────

function computeWorkColorMap(works: Work[]): Map<string, string> {
  const saved: Record<string, string> = (() => {
    try { return JSON.parse(localStorage.getItem('fan_work_colors') ?? '{}'); } catch { return {}; }
  })();
  const m = new Map<string, string>();
  works.forEach((w, i) => {
    m.set(w.id, saved[w.id] ?? WORK_COLORS[i % WORK_COLORS.length]);
  });
  return m;
}

// ─── 日付フォーマット ─────────────────────────────────────────────

const DOW = ['日', '月', '火', '水', '木', '金', '土'];

function fmtDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getMonth() + 1}月${d.getDate()}日（${DOW[d.getDay()]}）`;
}
function fmtMD(dateStr: string): string {
  const [, m, d] = dateStr.split('-');
  return `${parseInt(m)}月${parseInt(d)}日`;
}
function formatDateRange(start: string, end?: string): string | null {
  if (!end || end === start) return null;
  return `${fmtMD(start)}〜${fmtMD(end)}`;
}
function formatTimeRange(start?: string, end?: string): string | null {
  if (!start) return null;
  return end ? `${start}〜${end}` : start;
}
function getDomain(url: string): string {
  try {
    const { hostname } = new URL(url);
    if (hostname.includes('amazon')) return 'Amazon';
    if (hostname.includes('twitter.com') || hostname.includes('x.com')) return '公式X';
    return hostname.replace(/^www\./, '');
  } catch { return url; }
}

// ─── スタイル定数 ─────────────────────────────────────────────────

const inputCls =
  'w-full bg-bg-primary rounded-lg px-3 py-2 text-sm text-label-primary caret-label-primary placeholder:text-label-tertiary outline-none border border-faint focus:border-strong';
const BOTTOM_TAB_H = 56;

// ─── 編集フォーム型 ───────────────────────────────────────────────

interface EditForm {
  title: string;
  date: string;
  time: string;
  endDate: string;
  endTime: string;
  category: PostCategory | '';
  customCategory: string;
  prefecture: string;
  locationDetail: string;
  locationMapLink: string;
  link: string;
  memo: string;
}

// ─── メインコンポーネント ─────────────────────────────────────────

export default function Discover() {
  const { user } = useAuth();

  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [participatedWorks, setParticipatedWorks] = useState<Work[]>([]);
  const [hiddenWorkIds, setHiddenWorkIds] = useState<Set<string>>(new Set());
  const [categoryFilters, setCategoryFilters] = useState<Record<string, string[]>>(loadCategoryFilters);
  const [filterPickerWorkId, setFilterPickerWorkId] = useState<string | null>(null);
  const [workColorMap, setWorkColorMap] = useState<Map<string, string>>(new Map());
  const [myReactions, setMyReactions] = useState<Record<string, ReactionType>>(loadMyReactions);
  const [openReactionPickerId, setOpenReactionPickerId] = useState<string | null>(null);

  // いいねロック（セッション上限）
  const [lockedLikeIds, setLockedLikeIds] = useState<Set<string>>(() => {
    const set = new Set<string>();
    try {
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith('like_session:')) {
          const s = JSON.parse(localStorage.getItem(key) ?? '{}') as LikeSession;
          if (s.tapsUsed >= LIKE_MAX_TAPS && (s.resetAt === 0 || Date.now() < s.resetAt)) {
            set.add(key.slice('like_session:'.length));
          }
        }
      }
    } catch {}
    return set;
  });

  // 編集パネル
  const [editEventId, setEditEventId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState('');

  // ─── データ取得 ─────────────────────────────────────────────────

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    setError('');

    (async () => {
      const [works, evts] = await Promise.all([
        listRecentWorks(user.id),
        listUpcomingParticipatedEvents(user.id),
      ]);

      setParticipatedWorks(works);
      setWorkColorMap(computeWorkColorMap(works));

      if (evts.length === 0) {
        setEvents([]);
        setLoading(false);
        return;
      }

      const eventIds = evts.map(e => e.id);
      const [likedSet, batchReactions] = await Promise.all([
        getLikedEventIds(user.id, eventIds),
        getMyReactionsBatch(eventIds, user.id),
      ]);

      setEvents(evts.map(e => ({ ...e, likedByMe: likedSet.has(e.id) })));
      setMyReactions(prev => ({
        ...prev,
        ...(batchReactions as Record<string, ReactionType>),
      }));
    })()
      .catch(() => setError('予定の読み込みに失敗しました'))
      .finally(() => setLoading(false));
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── フィルター ─────────────────────────────────────────────────

  const toggleWorkVisibility = (wId: string) =>
    setHiddenWorkIds(prev => {
      const next = new Set(prev);
      next.has(wId) ? next.delete(wId) : next.add(wId);
      return next;
    });

  const visibleEvents = useMemo(() => {
    let evts = events.filter(e => !e.workId || !hiddenWorkIds.has(e.workId));
    evts = evts.filter(e => {
      const wId = e.workId ?? '';
      if (!wId) return true;
      const cats = categoryFilters[wId];
      if (!cats || cats.length === 0) return true;
      return !cats.includes(e.category ?? '');
    });
    return evts;
  }, [events, hiddenWorkIds, categoryFilters]);

  // ─── いいね（複数タップ可、Calendar.tsxと同じセッション管理） ──

  const handleLike = async (eventId: string) => {
    if (!user) return;
    const session = loadLikeSession(eventId);
    if (session.tapsUsed >= LIKE_MAX_TAPS) return;
    const newTaps = session.tapsUsed + 1;
    const resetAt = newTaps >= LIKE_MAX_TAPS ? Date.now() + LIKE_COOLDOWN_MS : 0;
    saveLikeSession(eventId, { tapsUsed: newTaps, resetAt });
    if (newTaps >= LIKE_MAX_TAPS) {
      setLockedLikeIds(prev => { const next = new Set(prev); next.add(eventId); return next; });
      setTimeout(() => {
        setLockedLikeIds(prev => { const next = new Set(prev); next.delete(eventId); return next; });
      }, LIKE_COOLDOWN_MS);
    }
    try {
      const newCount = await addLikeTap(eventId, user.id);
      setEvents(prev => prev.map(e =>
        e.id === eventId ? { ...e, likes: newCount, likedByMe: true } : e,
      ));
    } catch (err) { console.error(err); }
  };

  // ─── リアクション ───────────────────────────────────────────────

  const handleReaction = (eventId: string, type: ReactionType) => {
    const isOff = myReactions[eventId] === type;
    setMyReactions(prev => {
      const next: Record<string, ReactionType> = { ...prev };
      isOff ? delete next[eventId] : (next[eventId] = type);
      saveMyReactions(next);
      return next;
    });
    setOpenReactionPickerId(null);
    if (user) setReaction(eventId, user.id, isOff ? null : type).catch(console.error);
  };

  // ─── 編集 ───────────────────────────────────────────────────────

  const openEdit = (event: CalendarEvent) => {
    const VALID = POST_CATEGORIES as unknown as string[];
    setEditEventId(event.id);
    setEditError('');
    setEditForm({
      title: event.title,
      date: event.date,
      time: event.time ?? '',
      endDate: event.endDate ?? '',
      endTime: event.endTime ?? '',
      category: VALID.includes(event.category ?? '') ? (event.category as PostCategory) : '',
      customCategory: !VALID.includes(event.category ?? '') && event.category ? event.category : '',
      prefecture: event.prefecture ?? '',
      locationDetail: event.locationDetail ?? '',
      locationMapLink: event.locationMapLink ?? '',
      link: event.link ?? '',
      memo: event.memo ?? '',
    });
  };

  const handleEditSubmit = async () => {
    if (!editEventId || !editForm) return;
    if (!editForm.title.trim() || !editForm.date) {
      setEditError('タイトルと日付は必須です');
      return;
    }
    setEditSubmitting(true);
    setEditError('');
    try {
      const category = editForm.category || editForm.customCategory.trim() || undefined;
      await updateEvent(editEventId, {
        title: editForm.title.trim(),
        date: editForm.date,
        time: editForm.time || undefined,
        endDate: editForm.endDate || undefined,
        endTime: editForm.endTime || undefined,
        category,
        prefecture: editForm.prefecture || undefined,
        locationDetail: editForm.locationDetail || undefined,
        locationMapLink: editForm.locationMapLink || undefined,
        link: editForm.link || undefined,
        memo: editForm.memo.trim() || undefined,
      });
      setEvents(prev => prev.map(e =>
        e.id === editEventId
          ? {
              ...e,
              title: editForm.title.trim(),
              date: editForm.date,
              time: editForm.time || undefined,
              endDate: editForm.endDate || undefined,
              endTime: editForm.endTime || undefined,
              category,
              prefecture: editForm.prefecture || undefined,
              locationDetail: editForm.locationDetail || undefined,
              locationMapLink: editForm.locationMapLink || undefined,
              link: editForm.link || undefined,
              memo: editForm.memo.trim() || undefined,
            }
          : e,
      ));
      setEditEventId(null);
      setEditForm(null);
    } catch {
      setEditError('更新に失敗しました');
    } finally {
      setEditSubmitting(false);
    }
  };

  // ─── レンダリング ────────────────────────────────────────────────

  return (
    <>
      {/* メイン画面 */}
      <div
        className="fixed inset-0 max-w-app mx-auto flex flex-col overflow-hidden"
        style={{ backgroundColor: 'var(--bg-primary)', paddingTop: 44, paddingBottom: BOTTOM_TAB_H }}
      >
        <Header title="発見" />

        {/* 作品チップ + カテゴリフィルター */}
        {participatedWorks.length > 0 && (
          <div
            className="flex-shrink-0 flex items-center gap-2 px-4 py-2 overflow-x-auto border-b"
            style={{ borderColor: 'var(--border-subtle)' }}
          >
            {participatedWorks.map((w, i) => {
              const hidden = hiddenWorkIds.has(w.id);
              const color = workColorMap.get(w.id) ?? WORK_COLORS[i % WORK_COLORS.length];
              const hasCatFilter = (categoryFilters[w.id]?.length ?? 0) > 0;
              return (
                <div
                  key={w.id}
                  className="flex-shrink-0 flex items-center rounded-full border transition-all overflow-hidden"
                  style={{
                    borderColor: hidden ? 'var(--border-subtle)' : color,
                    color: hidden ? 'var(--label-tertiary)' : color,
                    opacity: hidden ? 0.5 : 1,
                  }}
                >
                  <button
                    onClick={() => toggleWorkVisibility(w.id)}
                    className="flex items-center gap-1.5 text-xs pl-3 pr-2 py-1 active:opacity-70"
                  >
                    <span
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ background: hidden ? 'var(--label-tertiary)' : color }}
                    />
                    {w.name}
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); setFilterPickerWorkId(w.id); }}
                    className="pr-2.5 py-1 active:opacity-70"
                    style={{ color: hasCatFilter ? color : 'var(--label-tertiary)' }}
                  >
                    <SlidersHorizontal size={11} strokeWidth={hasCatFilter ? 2.5 : 1.5} />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* イベントフィード */}
        <div className="flex-1 overflow-y-auto px-4 pt-3 pb-4">
          {loading ? (
            <div className="flex flex-col gap-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-36 bg-bg-secondary rounded-2xl animate-pulse" />
              ))}
            </div>
          ) : error ? (
            <p className="text-center text-red-400 text-sm py-10">{error}</p>
          ) : participatedWorks.length === 0 ? (
            <p className="text-center text-label-tertiary text-sm py-10">
              まだ作品に参加していません
            </p>
          ) : visibleEvents.length === 0 ? (
            <p className="text-center text-label-tertiary text-sm py-10">
              これからの予定はありません
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {visibleEvents.map(event => {
                const color = event.workId
                  ? (workColorMap.get(event.workId) ?? 'var(--accent-color)')
                  : 'var(--accent-color)';
                const dateLabel = formatDateRange(event.date, event.endDate);
                const timeLabel = formatTimeRange(event.time, event.endTime);
                const isOwn = !!(event.authorId && user && event.authorId === user.id);
                const myReaction = myReactions[event.id] as ReactionType | undefined;

                return (
                  <div key={event.id} className="bg-bg-secondary rounded-2xl overflow-hidden">

                    {/* ── ヘッダー：作品名 / カテゴリ / 編集ボタン ── */}
                    <div className="flex items-center gap-2 px-4 pt-3 pb-1.5">
                      {event.workName && (
                        <span
                          className="flex items-center gap-1 text-[11px] font-medium flex-shrink-0"
                          style={{ color }}
                        >
                          <span
                            className="w-2 h-2 rounded-full flex-shrink-0"
                            style={{ background: color }}
                          />
                          {event.workName}
                        </span>
                      )}
                      {event.category && (
                        <span className="text-[10px] text-label-tertiary bg-bg-primary rounded-full px-2 py-0.5">
                          {event.category}
                        </span>
                      )}
                      <div className="flex-1" />
                      {isOwn && (
                        <button
                          onClick={() => openEdit(event)}
                          className="w-7 h-7 flex items-center justify-center text-label-tertiary active:opacity-60 rounded-lg"
                          aria-label="編集"
                        >
                          <Pencil size={13} />
                        </button>
                      )}
                    </div>

                    {/* ── タイトル ── */}
                    <p className="px-4 text-label-primary font-bold text-[15px] leading-snug pb-2">
                      {event.title}
                    </p>

                    {/* ── 日付・時間 ── */}
                    <p className="px-4 pb-2 text-label-secondary text-sm">
                      {dateLabel ?? fmtDate(event.date)}
                      {timeLabel && <span className="ml-2 text-label-tertiary text-xs">{timeLabel}</span>}
                    </p>

                    {/* ── 場所 ── */}
                    {event.prefecture && (
                      <div className="flex flex-col gap-1 px-4 pb-2">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[10px] text-label-tertiary bg-bg-primary rounded-full px-2 py-0.5">
                            {event.prefecture}
                          </span>
                          {event.locationDetail && (
                            <span className="text-xs text-label-secondary">{event.locationDetail}</span>
                          )}
                        </div>
                        {event.locationMapLink && (
                          <a
                            href={event.locationMapLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-xs w-fit active:opacity-60"
                            style={{ color: 'var(--accent-color)' }}
                          >
                            <ExternalLink size={10} />地図を開く
                          </a>
                        )}
                      </div>
                    )}

                    {/* ── メモ ── */}
                    {event.memo && (
                      <p className="px-4 pb-2 text-xs text-label-secondary leading-relaxed">
                        {event.memo}
                      </p>
                    )}

                    {/* ── 外部リンク ── */}
                    {event.link && (
                      <div className="px-4 pb-2">
                        <a
                          href={event.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 px-2.5 py-1 rounded-full border border-default text-label-secondary text-xs w-fit active:opacity-60"
                        >
                          <ExternalLink size={10} />
                          {getDomain(event.link)}
                        </a>
                      </div>
                    )}

                    {/* ── 投稿者名 ── */}
                    <p className="px-4 pb-2 text-[11px] text-label-tertiary">
                      By {event.authorName ?? '匿名'}
                    </p>

                    {/* ── アクション行：いいね (=追加) + リアクション ── */}
                    <div
                      className="flex items-center gap-2 px-4 pt-2 pb-3 border-t"
                      style={{ borderColor: 'var(--border-subtle)' }}
                    >
                      {/* いいね（複数タップ可） */}
                      <button
                        onClick={() => handleLike(event.id)}
                        disabled={!user || lockedLikeIds.has(event.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-sm disabled:opacity-40 transition-colors active:opacity-70"
                        style={{
                          borderColor: event.likedByMe ? 'rgb(248,113,113)' : 'var(--border-default)',
                          color: event.likedByMe ? 'rgb(248,113,113)' : 'var(--label-secondary)',
                        }}
                      >
                        <Heart
                          size={13}
                          style={{
                            fill: event.likedByMe ? 'rgb(248,113,113)' : 'none',
                            color: event.likedByMe ? 'rgb(248,113,113)' : 'var(--label-secondary)',
                          }}
                        />
                        <span>{event.likedByMe ? '追加済み' : '追加'}</span>
                        {event.likes > 0 && (
                          <span className="text-xs" style={{ color: 'var(--label-tertiary)' }}>
                            {event.likes}
                          </span>
                        )}
                      </button>

                      {/* リアクションボタン */}
                      <button
                        onClick={() =>
                          setOpenReactionPickerId(prev => prev === event.id ? null : event.id)
                        }
                        className="flex items-center justify-center w-9 h-9 rounded-xl border active:opacity-60 transition-colors"
                        style={{
                          borderColor: myReaction ? 'var(--accent-color)' : 'var(--border-default)',
                          color: myReaction ? 'var(--accent-color)' : 'var(--label-secondary)',
                        }}
                      >
                        {myReaction
                          ? <span className="text-base leading-none">
                              {REACTIONS.find(r => r.type === myReaction)?.emoji}
                            </span>
                          : <Smile size={15} />
                        }
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── リアクションピッカー ── */}
      {openReactionPickerId && (
        <>
          <div className="fixed inset-0 z-[310]" onClick={() => setOpenReactionPickerId(null)} />
          <div
            className="fixed inset-x-0 max-w-app mx-auto z-[320]"
            style={{ bottom: BOTTOM_TAB_H + 8 }}
          >
            <div className="mx-4 bg-bg-primary rounded-2xl border border-subtle shadow-xl p-3 flex justify-around">
              {REACTIONS.map(r => (
                <button
                  key={r.type}
                  onClick={() => handleReaction(openReactionPickerId, r.type)}
                  className="flex flex-col items-center gap-1 px-3 py-2 rounded-xl active:opacity-60"
                  style={{
                    background:
                      myReactions[openReactionPickerId] === r.type
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

      {/* ── カテゴリフィルターピッカー ── */}
      {filterPickerWorkId !== null && (() => {
        const work = participatedWorks.find(w => w.id === filterPickerWorkId);
        if (!work) return null;
        const current = categoryFilters[filterPickerWorkId] ?? [];
        const toggle = (cat: string) => {
          const next = current.includes(cat)
            ? current.filter(c => c !== cat)
            : [...current, cat];
          const updated = { ...categoryFilters, [filterPickerWorkId]: next };
          setCategoryFilters(updated);
          saveCategoryFilters(updated);
        };
        const clearAll = () => {
          const updated = { ...categoryFilters, [filterPickerWorkId]: [] };
          setCategoryFilters(updated);
          saveCategoryFilters(updated);
        };
        const chipColor = workColorMap.get(filterPickerWorkId) ?? 'var(--accent-color)';
        return (
          <>
            <div className="fixed inset-0 z-[180]" onClick={() => setFilterPickerWorkId(null)} />
            <div className="fixed bottom-14 left-0 right-0 z-[190] max-w-app mx-auto px-4 pb-2">
              <div className="bg-bg-secondary rounded-2xl shadow-lg overflow-hidden border border-subtle">
                <div className="flex items-center justify-between px-4 pt-4 pb-2">
                  <span className="text-label-primary text-sm font-semibold">
                    {work.name} の表示カテゴリ
                  </span>
                  <button
                    onClick={clearAll}
                    className="text-xs text-label-tertiary underline active:opacity-60"
                  >
                    すべて表示
                  </button>
                </div>
                <p className="px-4 text-[11px] text-label-tertiary mb-3">
                  色ありが表示中。タップしたカテゴリを非表示にします
                </p>
                <div className="flex flex-wrap gap-2 px-4 pb-4">
                  {POST_CATEGORIES.map(cat => {
                    const hidden = current.includes(cat);
                    return (
                      <button
                        key={cat}
                        onClick={() => toggle(cat)}
                        className="px-3 py-1.5 rounded-full text-xs border transition-colors active:opacity-70"
                        style={
                          hidden
                            ? { borderColor: 'var(--border-default)', color: 'var(--label-tertiary)' }
                            : {
                                borderColor: chipColor,
                                color: chipColor,
                                backgroundColor: `${chipColor}18`,
                              }
                        }
                      >
                        {cat}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </>
        );
      })()}

      {/* ── 編集パネル（投稿者本人のみ） ── */}
      {editEventId && editForm && (
        <div
          className="fixed inset-x-0 max-w-app mx-auto z-[160] rounded-t-2xl overflow-hidden"
          style={{
            bottom: BOTTOM_TAB_H,
            height: '72vh',
            backgroundColor: 'var(--bg-primary)',
            animation: 'slideUpPanel 0.28s cubic-bezier(0.32, 0.72, 0, 1) both',
            position: 'fixed',
          }}
        >
          {/* ヘッダー（絶対配置固定） */}
          <div
            className="absolute inset-x-0 top-0 z-10 rounded-t-2xl"
            style={{ backgroundColor: 'var(--bg-primary)' }}
          >
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full" style={{ backgroundColor: 'var(--border-subtle)' }} />
            </div>
            <div className="px-4 pb-2 flex items-center justify-between">
              <p className="text-label-secondary text-xs">予定を編集</p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { setEditEventId(null); setEditForm(null); }}
                  className="text-xs text-label-tertiary px-3 py-1.5 rounded-lg active:opacity-60"
                >
                  キャンセル
                </button>
                <button
                  onClick={handleEditSubmit}
                  disabled={editSubmitting}
                  className="text-xs font-semibold text-bg-primary bg-label-primary px-4 py-1.5 rounded-lg active:opacity-70 disabled:opacity-40"
                >
                  {editSubmitting ? '更新中…' : '更新'}
                </button>
              </div>
            </div>
            {editError && <p className="text-red-400 text-xs px-4 pb-1">{editError}</p>}
          </div>

          {/* スクロールエリア（iOS Safari対応: absolute方式） */}
          <div
            className="absolute inset-x-0 bottom-0"
            style={{
              top: 60,
              overflowY: 'scroll',
              WebkitOverflowScrolling: 'touch',
            } as React.CSSProperties}
          >
            <div className="px-4 pt-2 pb-8 flex flex-col gap-4">
              {/* タイトル */}
              <div>
                <label className="text-label-tertiary text-xs mb-1.5 block">
                  タイトル <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={editForm.title}
                  onChange={e => setEditForm(f => f ? { ...f, title: e.target.value } : f)}
                  className={inputCls}
                />
              </div>

              {/* 開始日時 */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-label-tertiary text-xs mb-1.5 block">
                    開始日 <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="date"
                    value={editForm.date}
                    onChange={e => setEditForm(f => f ? { ...f, date: e.target.value } : f)}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="text-label-tertiary text-xs mb-1.5 block">開始時間</label>
                  <input
                    type="time"
                    value={editForm.time}
                    onChange={e => setEditForm(f => f ? { ...f, time: e.target.value } : f)}
                    className={inputCls}
                  />
                </div>
              </div>

              {/* 終了日時 */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-label-tertiary text-xs mb-1.5 block">終了日（任意）</label>
                  <input
                    type="date"
                    value={editForm.endDate}
                    min={editForm.date || undefined}
                    onChange={e => setEditForm(f => f ? { ...f, endDate: e.target.value } : f)}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="text-label-tertiary text-xs mb-1.5 block">終了時間</label>
                  <input
                    type="time"
                    value={editForm.endTime}
                    onChange={e => setEditForm(f => f ? { ...f, endTime: e.target.value } : f)}
                    className={inputCls}
                  />
                </div>
              </div>

              {/* カテゴリ */}
              <div>
                <label className="text-label-tertiary text-xs mb-1.5 block">カテゴリ</label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {POST_CATEGORIES.map(cat => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() =>
                        setEditForm(f =>
                          f ? { ...f, category: f.category === cat ? '' : cat, customCategory: '' } : f,
                        )
                      }
                      className={`px-3 py-1 rounded-full text-xs border transition-colors ${
                        editForm.category === cat
                          ? 'border-selected text-label-primary bg-label-primary/10'
                          : 'border-default text-label-secondary'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-label-tertiary text-xs flex-shrink-0">その他：</span>
                  <input
                    type="text"
                    value={editForm.customCategory}
                    onChange={e =>
                      setEditForm(f =>
                        f ? { ...f, customCategory: e.target.value, category: '' } : f,
                      )
                    }
                    placeholder="自由に入力"
                    className="flex-1 bg-bg-primary rounded-lg px-3 py-1.5 text-xs text-label-primary caret-label-primary placeholder:text-label-tertiary outline-none border border-faint focus:border-strong"
                  />
                </div>
              </div>

              {/* 場所 */}
              <div>
                <label className="text-label-tertiary text-xs mb-1.5 block">場所（任意）</label>
                <select
                  value={editForm.prefecture}
                  onChange={e => setEditForm(f => f ? { ...f, prefecture: e.target.value } : f)}
                  className={`${inputCls} appearance-none`}
                >
                  <option value="">全国（指定なし）</option>
                  {[
                    '北海道','青森','岩手','宮城','秋田','山形','福島',
                    '茨城','栃木','群馬','埼玉','千葉','東京','神奈川',
                    '新潟','富山','石川','福井','山梨','長野',
                    '岐阜','静岡','愛知','三重',
                    '滋賀','京都','大阪','兵庫','奈良','和歌山',
                    '鳥取','島根','岡山','広島','山口',
                    '徳島','香川','愛媛','高知',
                    '福岡','佐賀','長崎','熊本','大分','宮崎','鹿児島','沖縄',
                  ].map(p => <option key={p} value={p}>{p}</option>)}
                </select>
                {editForm.prefecture && (
                  <div className="flex flex-col gap-2 mt-2">
                    <input
                      type="text"
                      value={editForm.locationDetail}
                      onChange={e => setEditForm(f => f ? { ...f, locationDetail: e.target.value } : f)}
                      placeholder="詳しい場所・住所"
                      className={inputCls}
                    />
                    <input
                      type="url"
                      value={editForm.locationMapLink}
                      onChange={e => setEditForm(f => f ? { ...f, locationMapLink: e.target.value } : f)}
                      placeholder="Google Maps リンク"
                      className={inputCls}
                    />
                  </div>
                )}
              </div>

              {/* リンク */}
              <div>
                <label className="text-label-tertiary text-xs mb-1.5 block">リンク（任意）</label>
                <input
                  type="url"
                  value={editForm.link}
                  onChange={e => setEditForm(f => f ? { ...f, link: e.target.value } : f)}
                  placeholder="購入先 / 公式ポストなど"
                  className={inputCls}
                />
              </div>

              {/* メモ */}
              <div>
                <label className="text-label-tertiary text-xs mb-1.5 block">メモ（任意）</label>
                <textarea
                  value={editForm.memo}
                  onChange={e => setEditForm(f => f ? { ...f, memo: e.target.value } : f)}
                  placeholder="補足情報"
                  rows={3}
                  className={`${inputCls} resize-none`}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      <BottomTab />
    </>
  );
}

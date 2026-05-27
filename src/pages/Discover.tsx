import { useState, useEffect, useMemo } from 'react';
import {
  Heart, Smile, Pencil, SlidersHorizontal, ExternalLink, ChevronLeft,
} from 'lucide-react';
import BottomTab from '../components/BottomTab';
import Header from '../components/Header';
import {
  listUpcomingParticipatedEvents, listRecentWorks,
  setReaction, getMyReactionsBatch, updateEvent, addLikeTap,
} from '../lib/api';
import type { Work } from '../lib/api';
import type { CalendarEvent } from '../types';
import { REACTIONS, type ReactionType } from '../lib/reactions';
import {
  POST_CATEGORIES, type PostCategory,
  loadCategoryFilters, saveCategoryFilters,
  loadLikedEventIds, addLikedEventId,
  loadCalendarEventIds, addCalendarEventId,
} from '../lib/constants';
import { useAuth } from '../contexts/AuthContext';
import { WORK_COLORS } from './Calendar';

// ─── 定数 ──────────────────────────────────────────────────────────

const BOTTOM_TAB_H = 56;

const REACTIONS_KEY = 'fan_reactions';
function loadMyReactions(): Record<string, ReactionType> {
  try { return JSON.parse(localStorage.getItem(REACTIONS_KEY) ?? '{}'); } catch { return {}; }
}

const inputCls =
  'w-full bg-bg-primary rounded-lg px-3 py-2 text-sm text-label-primary caret-label-primary placeholder:text-label-tertiary outline-none border border-faint focus:border-strong';

function fmtDate(dateStr: string): string {
  const [, m, d] = dateStr.split('-');
  return `${parseInt(m)}月${parseInt(d)}日`;
}
function formatDateRange(startDate: string, endDate?: string): string {
  if (!endDate || endDate === startDate) return fmtDate(startDate);
  return `${fmtDate(startDate)}〜${fmtDate(endDate)}`;
}
function formatTimeRange(startTime?: string, endTime?: string): string | null {
  if (!startTime) return null;
  return endTime ? `${startTime}〜${endTime}` : startTime;
}
function getDomain(url: string): string {
  try {
    const { hostname } = new URL(url);
    if (hostname.includes('amazon')) return 'Amazon';
    if (hostname.includes('twitter.com') || hostname.includes('x.com')) return '公式X';
    return hostname.replace(/^www\./, '');
  } catch { return url; }
}

// ─── コンポーネント ────────────────────────────────────────────────

export default function Discover() {
  const { user } = useAuth();

  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [participatedWorks, setParticipatedWorks] = useState<Work[]>([]);
  const [hiddenWorkIds, setHiddenWorkIds] = useState<Set<string>>(new Set());
  const [categoryFilters, setCategoryFilters] = useState<Record<string, string[]>>(loadCategoryFilters);
  const [filterPickerWorkId, setFilterPickerWorkId] = useState<string | null>(null);

  // ❤️ ソーシャルいいね（削除後も残る）
  const [likedEventIds, setLikedEventIds] = useState<Set<string>>(loadLikedEventIds);
  // カレンダー追加済み（マイカレンダーから削除すると除かれる）
  const [calendarEventIds, setCalendarEventIds] = useState<Set<string>>(loadCalendarEventIds);

  // リアクション
  const [myReactions, setMyReactions] = useState<Record<string, ReactionType>>(loadMyReactions);
  const [openReactionPickerId, setOpenReactionPickerId] = useState<string | null>(null);

  // 編集パネル
  const [editEventId, setEditEventId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{
    title: string; date: string; time: string; endDate: string; endTime: string;
    category: PostCategory | ''; customCategory: string;
    prefecture: string; locationDetail: string; locationMapLink: string; link: string; memo: string;
  } | null>(null);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState('');

  // 作品カラーMap
  const workColorMap = useMemo(() => {
    const saved: Record<string, string> = (() => {
      try { return JSON.parse(localStorage.getItem('fan_work_colors') ?? '{}'); } catch { return {}; }
    })();
    const m = new Map<string, string>();
    participatedWorks.forEach(w => {
      m.set(w.id, saved[w.id] ?? WORK_COLORS[0]);
    });
    return m;
  }, [participatedWorks]);

  // データ取得
  useEffect(() => {
    if (!user) return;
    setLoading(true);
    Promise.all([
      listUpcomingParticipatedEvents(user.id),
      listRecentWorks(user.id),
    ]).then(([evts, works]) => {
      setEvents(evts);
      setParticipatedWorks(works);
    }).catch(() => setError('データの読み込みに失敗しました'))
      .finally(() => setLoading(false));
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // リアクション一括取得
  useEffect(() => {
    if (!user || events.length === 0) return;
    getMyReactionsBatch(events.map(e => e.id), user.id)
      .then(batch => {
        setMyReactions(prev => ({ ...prev, ...(batch as Record<string, ReactionType>) }));
      }).catch(() => {});
  }, [user?.id, events]); // eslint-disable-line react-hooks/exhaustive-deps

  // 表示イベント（作品・カテゴリフィルター・自分の投稿除外）
  const visibleEvents = useMemo(() => {
    let evts = events.filter(e => !e.workId || !hiddenWorkIds.has(e.workId));
    // 自分の投稿は発見タブに表示しない（自分でカレンダーに直接追加済みのため）
    if (user) evts = evts.filter(e => e.authorId !== user.id);
    evts = evts.filter(e => {
      const wId = e.workId ?? '';
      if (!wId) return true;
      const cats = categoryFilters[wId];
      if (!cats || cats.length === 0) return true;
      return !cats.includes(e.category ?? '');
    });
    return evts;
  }, [events, hiddenWorkIds, categoryFilters, user]);

  const toggleWork = (wId: string) =>
    setHiddenWorkIds(prev => {
      const next = new Set(prev);
      if (next.has(wId)) next.delete(wId); else next.add(wId);
      return next;
    });

  // ❤️ いいね（何度でも押せる）＋初回のみカレンダーに追加
  const handleHeartPress = async (event: CalendarEvent) => {
    // DB いいね数インクリメント
    if (user) {
      try {
        const newCount = await addLikeTap(event.id, user.id);
        setEvents(prev => prev.map(e => e.id === event.id ? { ...e, likes: newCount } : e));
      } catch {}
    }
    // ソーシャルいいね記録
    const nextLiked = addLikedEventId(event.id);
    setLikedEventIds(nextLiked);
    // カレンダーに未追加の場合のみ追加
    if (!calendarEventIds.has(event.id)) {
      const nextCal = addCalendarEventId(event.id);
      setCalendarEventIds(nextCal);
    }
  };

  // カレンダーに再追加（削除後の再追加ボタン用）
  const handleReAddToCalendar = (eventId: string) => {
    const nextCal = addCalendarEventId(eventId);
    setCalendarEventIds(nextCal);
  };

  // リアクション
  const handleReaction = (eventId: string, type: ReactionType) => {
    const isToggleOff = myReactions[eventId] === type;
    setMyReactions(prev => {
      const next: Record<string, ReactionType> = { ...prev };
      if (isToggleOff) delete next[eventId]; else next[eventId] = type;
      localStorage.setItem(REACTIONS_KEY, JSON.stringify(next));
      return next;
    });
    setOpenReactionPickerId(null);
    if (user) setReaction(eventId, user.id, isToggleOff ? null : type).catch(() => {});
  };

  // 編集パネルを開く
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
      category: VALID.includes(event.category ?? '') ? event.category as PostCategory : '',
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
    if (!editForm.title.trim() || !editForm.date) { setEditError('タイトルと日付は必須です'); return; }
    setEditSubmitting(true);
    setEditError('');
    try {
      const category = editForm.category || editForm.customCategory.trim() || undefined;
      const patch = {
        title: editForm.title.trim(), date: editForm.date,
        time: editForm.time || undefined, endDate: editForm.endDate || undefined,
        endTime: editForm.endTime || undefined, category,
        prefecture: editForm.prefecture || undefined,
        locationDetail: editForm.locationDetail || undefined,
        locationMapLink: editForm.locationMapLink || undefined,
        link: editForm.link || undefined, memo: editForm.memo.trim() || undefined,
      };
      await updateEvent(editEventId, patch);
      setEvents(prev => prev.map(e => e.id === editEventId ? { ...e, ...patch } : e));
      setEditEventId(null); setEditForm(null);
    } catch { setEditError('更新に失敗しました'); }
    finally { setEditSubmitting(false); }
  };

  return (
    <>
      <div
        className="fixed inset-0 max-w-app mx-auto flex flex-col overflow-hidden"
        style={{ backgroundColor: 'var(--bg-primary)', paddingTop: 44, paddingBottom: BOTTOM_TAB_H }}
      >
        <Header title="発見" />

        {/* 作品チップ */}
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
                    onClick={() => toggleWork(w.id)}
                    className="flex items-center gap-1.5 text-xs pl-3 pr-2 py-1 active:opacity-70"
                  >
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: hidden ? 'var(--label-tertiary)' : color }} />
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

        {/* フィード */}
        <div className="flex-1 overflow-y-auto px-4 pt-3 pb-6">
          {loading ? (
            <div className="flex flex-col gap-3">
              {[1, 2, 3].map(i => <div key={i} className="h-28 bg-bg-secondary rounded-2xl animate-pulse" />)}
            </div>
          ) : error ? (
            <p className="text-center text-red-400 text-sm py-10">{error}</p>
          ) : !user ? (
            <p className="text-center text-label-tertiary text-sm py-10">ログインが必要です</p>
          ) : visibleEvents.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16">
              <p className="text-label-tertiary text-sm">
                {participatedWorks.length === 0
                  ? '作品タブから作品に参加するとイベントが表示されます'
                  : '今後の予定はありません'}
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {visibleEvents.map(event => {
                const color = event.workId ? (workColorMap.get(event.workId) ?? 'var(--accent-color)') : 'var(--accent-color)';
                const isLiked = likedEventIds.has(event.id);
                const isInCalendar = calendarEventIds.has(event.id);
                const showReAdd = isLiked && !isInCalendar;
                const timeLabel = formatTimeRange(event.time, event.endTime);
                return (
                  <div key={event.id} className="bg-bg-secondary rounded-2xl overflow-hidden px-4 pt-4 pb-3 flex flex-col gap-2">
                    {/* バッジ行 */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {event.workName && (
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full"
                          style={{ color, backgroundColor: `${color}20` }}>
                          {event.workName}
                        </span>
                      )}
                      {event.category && (
                        <span className="text-[10px] text-label-tertiary bg-bg-primary rounded-full px-2 py-0.5">
                          {event.category}
                        </span>
                      )}
                    </div>

                    {/* タイトル */}
                    <p className="text-label-primary font-bold text-base leading-snug">{event.title}</p>

                    {/* 日付・時間 */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-label-secondary text-sm">{formatDateRange(event.date, event.endDate)}</span>
                      {timeLabel && <span className="text-label-secondary text-sm">{timeLabel}</span>}
                      {event.prefecture && (
                        <span className="text-[10px] text-label-tertiary bg-bg-primary rounded-full px-2 py-0.5">
                          {event.prefecture}
                        </span>
                      )}
                    </div>

                    {/* メモ */}
                    {event.memo && <p className="text-label-secondary text-sm leading-relaxed">{event.memo}</p>}

                    {/* リンク */}
                    {event.link && (
                      <a href={event.link} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1 px-3 py-1 rounded-full border border-default text-label-secondary text-xs w-fit active:opacity-60">
                        <ExternalLink size={10} />{getDomain(event.link)}
                      </a>
                    )}

                    {/* 投稿者 */}
                    {event.authorName && (
                      <p className="text-label-tertiary text-xs">by {event.authorName}</p>
                    )}

                    {/* アクション行 */}
                    <div className="flex items-center gap-2 pt-1 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
                      {/* ❤️ いいね数（複数回OK） */}
                      <button
                        onClick={() => handleHeartPress(event)}
                        disabled={!user}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-sm disabled:opacity-40 active:opacity-70"
                        style={{
                          borderColor: isLiked ? 'rgb(248,113,113)' : 'var(--border-default)',
                          color: isLiked ? 'rgb(248,113,113)' : 'var(--label-secondary)',
                        }}
                      >
                        <Heart size={14} style={{ fill: isLiked ? 'rgb(248,113,113)' : 'none' }} />
                        <span className="text-xs">{event.likes.toLocaleString('ja-JP')}</span>
                      </button>

                      {/* カレンダー状態ボタン */}
                      {isInCalendar ? (
                        /* 追加済み（タップ無効） */
                        <span
                          className="flex items-center gap-1 px-3 py-1.5 rounded-xl border text-xs text-label-tertiary"
                          style={{ borderColor: 'var(--border-subtle)' }}
                        >
                          追加済み
                        </span>
                      ) : showReAdd ? (
                        /* 再追加ボタン（いいね済みだがカレンダーから削除された） */
                        <button
                          onClick={() => handleReAddToCalendar(event.id)}
                          disabled={!user}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-xl border text-xs font-semibold active:opacity-70 disabled:opacity-40"
                          style={{
                            borderColor: 'var(--accent-color)',
                            color: 'var(--accent-color)',
                            backgroundColor: 'color-mix(in srgb, var(--accent-color) 10%, transparent)',
                          }}
                        >
                          ＋ 再追加
                        </button>
                      ) : null}

                      {/* 😊 リアクション */}
                      <button
                        onClick={() => setOpenReactionPickerId(prev => prev === event.id ? null : event.id)}
                        className="px-3 py-1.5 rounded-xl border text-sm active:opacity-60 flex items-center justify-center"
                        style={{
                          borderColor: myReactions[event.id] ? 'var(--accent-color)' : 'var(--border-default)',
                          color: myReactions[event.id] ? 'var(--accent-color)' : 'var(--label-secondary)',
                          minWidth: '2.5rem',
                        }}
                      >
                        {myReactions[event.id]
                          ? <span className="text-base leading-none">{REACTIONS.find(r => r.type === myReactions[event.id])?.emoji}</span>
                          : <Smile size={14} />
                        }
                      </button>

                      {/* ✏️ 編集（自分の投稿のみ） */}
                      {event.authorId && user && event.authorId === user.id && (
                        <button
                          onClick={() => openEdit(event)}
                          className="px-3 py-1.5 rounded-xl border border-default text-sm active:opacity-60 flex items-center justify-center"
                          style={{ color: 'var(--accent-color)', minWidth: '2.5rem' }}
                        >
                          <Pencil size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* リアクションピッカー */}
      {openReactionPickerId && (
        <>
          <div className="fixed inset-0 z-[310]" onClick={() => setOpenReactionPickerId(null)} />
          <div className="fixed inset-x-0 max-w-app mx-auto z-[320]" style={{ bottom: BOTTOM_TAB_H + 8 }}>
            <div className="mx-4 bg-bg-primary rounded-2xl border border-subtle shadow-xl p-3 flex justify-around">
              {REACTIONS.map(r => (
                <button
                  key={r.type}
                  onClick={() => handleReaction(openReactionPickerId, r.type)}
                  className="flex flex-col items-center gap-1 px-3 py-2 rounded-xl active:opacity-60"
                  style={{ background: myReactions[openReactionPickerId] === r.type ? 'var(--bg-secondary)' : 'transparent' }}
                >
                  <span className="text-2xl">{r.emoji}</span>
                  <span className="text-[10px] text-label-secondary">{r.label}</span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {/* カテゴリフィルターピッカー */}
      {filterPickerWorkId !== null && (() => {
        const work = participatedWorks.find(w => w.id === filterPickerWorkId);
        if (!work) return null;
        const current = categoryFilters[filterPickerWorkId] ?? [];
        const color = workColorMap.get(filterPickerWorkId) ?? 'var(--accent-color)';
        const toggle = (cat: string) => {
          const next = current.includes(cat) ? current.filter(c => c !== cat) : [...current, cat];
          const updated = { ...categoryFilters, [filterPickerWorkId]: next };
          setCategoryFilters(updated);
          saveCategoryFilters(updated);
        };
        return (
          <>
            <div className="fixed inset-0 z-[180]" onClick={() => setFilterPickerWorkId(null)} />
            <div className="fixed bottom-14 left-0 right-0 z-[190] max-w-app mx-auto px-4 pb-2">
              <div className="bg-bg-secondary rounded-2xl shadow-lg overflow-hidden border border-subtle">
                <div className="flex items-center justify-between px-4 pt-4 pb-2">
                  <span className="text-label-primary text-sm font-semibold">{work.name} の表示カテゴリ</span>
                  <button onClick={() => { const u = { ...categoryFilters, [filterPickerWorkId]: [] }; setCategoryFilters(u); saveCategoryFilters(u); }} className="text-xs text-label-tertiary underline active:opacity-60">すべて表示</button>
                </div>
                <p className="px-4 text-[11px] text-label-tertiary mb-3">色ありが表示中。タップしたカテゴリを非表示にします</p>
                <div className="flex flex-wrap gap-2 px-4 pb-4">
                  {POST_CATEGORIES.map(cat => {
                    const hidden = current.includes(cat);
                    return (
                      <button key={cat} onClick={() => toggle(cat)}
                        className="px-3 py-1.5 rounded-full text-xs border transition-colors active:opacity-70"
                        style={hidden
                          ? { borderColor: 'var(--border-default)', color: 'var(--label-tertiary)' }
                          : { borderColor: color, color, backgroundColor: `${color}18` }}>
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

      {/* 編集パネル */}
      {editEventId && editForm && (
        <>
          <div className="fixed inset-0 z-[159] bg-black/40" onClick={() => { setEditEventId(null); setEditForm(null); }} />
          <div
            className="fixed inset-x-0 max-w-app mx-auto z-[160] rounded-t-2xl overflow-hidden"
            style={{ bottom: BOTTOM_TAB_H, height: '80vh', backgroundColor: 'var(--bg-primary)', animation: 'slideUpPanel 0.28s cubic-bezier(0.32, 0.72, 0, 1) both' }}
          >
            <div className="absolute inset-x-0 top-0 z-10 rounded-t-2xl" style={{ backgroundColor: 'var(--bg-primary)' }}>
              <div className="flex justify-center pt-3 pb-1">
                <div className="w-10 h-1 rounded-full" style={{ backgroundColor: 'var(--border-subtle)' }} />
              </div>
              <div className="px-4 pb-2 flex items-center justify-between">
                <button onClick={() => { setEditEventId(null); setEditForm(null); }} className="flex items-center gap-1 text-xs text-label-tertiary active:opacity-60">
                  <ChevronLeft size={14} />キャンセル
                </button>
                <p className="text-label-primary text-sm font-semibold">予定を編集</p>
                <button onClick={handleEditSubmit} disabled={editSubmitting} className="text-xs font-semibold px-3 py-1.5 rounded-lg active:opacity-70 disabled:opacity-40" style={{ color: 'var(--accent-color)' }}>
                  {editSubmitting ? '更新中…' : '保存'}
                </button>
              </div>
              {editError && <p className="text-red-400 text-xs px-4 pb-1">{editError}</p>}
            </div>
            <div className="absolute inset-x-0 bottom-0" style={{ top: 60, overflowY: 'scroll', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}>
              <div className="px-4 pt-2 pb-8 flex flex-col gap-4">
                <div>
                  <label className="text-label-tertiary text-xs mb-1.5 block">タイトル <span className="text-red-400">*</span></label>
                  <input type="text" value={editForm.title} onChange={e => setEditForm(f => f && ({ ...f, title: e.target.value }))} className={inputCls} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="text-label-tertiary text-xs mb-1.5 block">開始日 <span className="text-red-400">*</span></label>
                    <input type="date" value={editForm.date} onChange={e => setEditForm(f => f && ({ ...f, date: e.target.value }))} className={inputCls} /></div>
                  <div><label className="text-label-tertiary text-xs mb-1.5 block">開始時間</label>
                    <input type="time" value={editForm.time} onChange={e => setEditForm(f => f && ({ ...f, time: e.target.value }))} className={inputCls} /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="text-label-tertiary text-xs mb-1.5 block">終了日</label>
                    <input type="date" value={editForm.endDate} onChange={e => setEditForm(f => f && ({ ...f, endDate: e.target.value }))} className={inputCls} /></div>
                  <div><label className="text-label-tertiary text-xs mb-1.5 block">終了時間</label>
                    <input type="time" value={editForm.endTime} onChange={e => setEditForm(f => f && ({ ...f, endTime: e.target.value }))} className={inputCls} /></div>
                </div>
                <div>
                  <label className="text-label-tertiary text-xs mb-1.5 block">カテゴリ</label>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {POST_CATEGORIES.map(cat => (
                      <button key={cat} type="button"
                        onClick={() => setEditForm(f => f && ({ ...f, category: f.category === cat ? '' : cat, customCategory: '' }))}
                        className={`px-3 py-1 rounded-full text-xs border transition-colors ${editForm.category === cat ? 'border-selected text-label-primary bg-label-primary/10' : 'border-default text-label-secondary'}`}>
                        {cat}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-label-tertiary text-xs flex-shrink-0">その他：</span>
                    <input type="text" value={editForm.customCategory}
                      onChange={e => setEditForm(f => f && ({ ...f, customCategory: e.target.value, category: '' }))}
                      placeholder="自由に入力" className="flex-1 bg-bg-primary rounded-lg px-3 py-1.5 text-xs text-label-primary placeholder:text-label-tertiary outline-none border border-faint focus:border-strong" />
                  </div>
                </div>
                <div>
                  <label className="text-label-tertiary text-xs mb-1.5 block">メモ（任意）</label>
                  <textarea value={editForm.memo} onChange={e => setEditForm(f => f && ({ ...f, memo: e.target.value }))} rows={3} className={`${inputCls} resize-none`} />
                </div>
                <div>
                  <label className="text-label-tertiary text-xs mb-1.5 block">リンク（任意）</label>
                  <input type="url" value={editForm.link} onChange={e => setEditForm(f => f && ({ ...f, link: e.target.value }))} className={inputCls} />
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      <BottomTab />
    </>
  );
}

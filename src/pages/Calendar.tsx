import { useState, useMemo, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import {
  Palette, Plus, Heart, MoreVertical, Link2, LogOut, Trash2,
  ChevronDown, ChevronUp, ChevronRight, X, Settings, Map as MapIcon,
} from 'lucide-react';
import BottomTab from '../components/BottomTab';
import Header from '../components/Header';
import {
  listEvents, getWorkById, leaveCalendar, deleteWork,
  createEvents, deleteEvent, getHomePrefecture, saveHomePrefecture,
  getDisplayName, saveDisplayName, listRecentWorks,
  listAllParticipatedWorkEvents,
} from '../lib/api';
import type { Work } from '../lib/api';
import { REGIONS, ADJACENT } from '../lib/prefectures';
import { PrefectureSearch } from '../components/UserSettingsSheet';
import UserSettingsSheet from '../components/UserSettingsSheet';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import SmartInputPanel, { type ParsedEvent } from '../components/SmartInputPanel';
import type { CalendarEvent } from '../types';

export type { CalendarEvent };

// ─── 定数 ──────────────────────────────────────────────────────────

const DAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'];
const POST_CATEGORIES = ['単行本', 'グッズ', 'イベント', '誕生日', '配信'] as const;
type PostCategory = (typeof POST_CATEGORIES)[number];

// 作品ごとの識別カラー（最大8作品まで色分け、以降はループ）
export const WORK_COLORS = [
  '#FF6B6B', '#4FC3F7', '#81C784', '#FFB74D',
  '#BA68C8', '#4DB6AC', '#F06292', '#A1887F',
];


const inputCls =
  'w-full bg-bg-primary rounded-lg px-3 py-2 text-sm text-label-primary caret-label-primary placeholder:text-label-tertiary outline-none border border-faint focus:border-strong';

const BOTTOM_TAB_H = 56;
const SHEET_COLLAPSED_H = 76;
const SHEET_FULL_H = 280;

// ─── カレンダーグリッドのユーティリティ ───────────────────────────

function getCalendarDays(year: number, month: number) {
  const firstDay = new Date(year, month, 1);
  const start = new Date(firstDay);
  start.setDate(1 - firstDay.getDay());
  const days: { date: Date; isCurrentMonth: boolean }[] = [];
  const cur = new Date(start);
  for (let i = 0; i < 42; i++) {
    days.push({ date: new Date(cur), isCurrentMonth: cur.getMonth() === month });
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

export function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ─── インライン投稿カード ───────────────────────────────────────────

interface InlineCard {
  id: string;
  workId: string;
  title: string;
  date: string;
  time: string;
  category: PostCategory | '';
  customCategory: string;
  prefecture: string;
  locationDetail: string;
  locationMapLink: string;
  link: string;
  memo: string;
  collapsed: boolean;
}

function newInlineCard(date: string): InlineCard {
  return {
    id: crypto.randomUUID(),
    workId: '',
    title: '',
    date,
    time: '',
    category: '',
    customCategory: '',
    prefecture: '',
    locationDetail: '',
    locationMapLink: '',
    link: '',
    memo: '',
    collapsed: false,
  };
}

function InlineCardItem({
  card,
  index,
  total,
  participatedWorks,
  onChange,
  onToggle,
  onRemove,
}: {
  card: InlineCard;
  index: number;
  total: number;
  participatedWorks?: Work[];
  onChange: (patch: Partial<InlineCard>) => void;
  onToggle: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="bg-bg-secondary rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 cursor-pointer select-none" onClick={onToggle}>
        <span className="text-label-primary text-sm font-medium truncate flex-1 mr-2">
          予定 {index + 1}{card.title.trim() ? `：${card.title.trim()}` : ''}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={e => { e.stopPropagation(); onRemove(); }}
            disabled={total <= 1}
            className="w-6 h-6 flex items-center justify-center text-label-tertiary disabled:opacity-20 active:opacity-50"
          >
            <X size={14} />
          </button>
          {card.collapsed ? <ChevronDown size={16} className="text-label-tertiary" /> : <ChevronUp size={16} className="text-label-tertiary" />}
        </div>
      </div>

      {!card.collapsed && (
        <div className="px-4 pb-4 flex flex-col gap-4 border-t border-faint">
          {participatedWorks && participatedWorks.length > 0 && (
            <div className="pt-3">
              <label className="text-label-tertiary text-xs mb-1.5 block">保存先</label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => onChange({ workId: '' })}
                  className={`px-3 py-1 rounded-full text-xs border transition-colors ${!card.workId ? 'border-selected text-label-primary bg-label-primary/10' : 'border-default text-label-secondary'}`}
                >
                  個人
                </button>
                {participatedWorks.map(w => (
                  <button
                    key={w.id}
                    type="button"
                    onClick={() => onChange({ workId: w.id })}
                    className={`px-3 py-1 rounded-full text-xs border transition-colors ${card.workId === w.id ? 'border-selected text-label-primary bg-label-primary/10' : 'border-default text-label-secondary'}`}
                  >
                    {w.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className={participatedWorks && participatedWorks.length > 0 ? '' : 'pt-3'}>
            <label className="text-label-tertiary text-xs mb-1.5 block">タイトル <span className="text-red-400">*</span></label>
            <input type="text" value={card.title} onChange={e => onChange({ title: e.target.value })} placeholder="例：単行本 第15巻 発売" className={inputCls} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-label-tertiary text-xs mb-1.5 block">日付 <span className="text-red-400">*</span></label>
              <input type="date" value={card.date} onChange={e => onChange({ date: e.target.value })} className={inputCls} />
            </div>
            <div>
              <label className="text-label-tertiary text-xs mb-1.5 block">時間</label>
              <input type="time" value={card.time} onChange={e => onChange({ time: e.target.value })} className={inputCls} />
            </div>
          </div>

          <div>
            <label className="text-label-tertiary text-xs mb-1.5 block">カテゴリ</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {POST_CATEGORIES.map(cat => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => onChange({ category: card.category === cat ? '' : cat, customCategory: '' })}
                  className={`px-3 py-1 rounded-full text-xs border transition-colors ${card.category === cat ? 'border-selected text-label-primary bg-label-primary/10' : 'border-default text-label-secondary'}`}
                >
                  {cat}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-label-tertiary text-xs flex-shrink-0">その他：</span>
              <input
                type="text"
                value={card.customCategory}
                onChange={e => onChange({ customCategory: e.target.value, category: '' })}
                placeholder="自由に入力"
                className="flex-1 bg-bg-primary rounded-lg px-3 py-1.5 text-xs text-label-primary caret-label-primary placeholder:text-label-tertiary outline-none border border-faint focus:border-strong"
              />
            </div>
          </div>

          <div>
            <label className="text-label-tertiary text-xs mb-1.5 block">場所（任意）</label>
            <select
              value={card.prefecture}
              onChange={e => onChange({ prefecture: e.target.value })}
              className={`${inputCls} appearance-none`}
            >
              <option value="">全国（指定なし）</option>
              {['北海道','青森','岩手','宮城','秋田','山形','福島','茨城','栃木','群馬','埼玉','千葉','東京','神奈川','新潟','富山','石川','福井','山梨','長野','岐阜','静岡','愛知','三重','滋賀','京都','大阪','兵庫','奈良','和歌山','鳥取','島根','岡山','広島','山口','徳島','香川','愛媛','高知','福岡','佐賀','長崎','熊本','大分','宮崎','鹿児島','沖縄'].map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
            {card.prefecture && (
              <div className="flex flex-col gap-2 mt-2">
                <input type="text" value={card.locationDetail} onChange={e => onChange({ locationDetail: e.target.value })} placeholder="詳しい場所・住所" className={inputCls} />
                <input type="url" value={card.locationMapLink} onChange={e => onChange({ locationMapLink: e.target.value })} placeholder="Google Maps リンク" className={inputCls} />
              </div>
            )}
          </div>

          <div>
            <label className="text-label-tertiary text-xs mb-1.5 block">リンク（任意）</label>
            <input type="url" value={card.link} onChange={e => onChange({ link: e.target.value })} placeholder="購入先 / 公式ポストなど" className={inputCls} />
          </div>

          <div>
            <label className="text-label-tertiary text-xs mb-1.5 block">メモ（任意）</label>
            <textarea value={card.memo} onChange={e => onChange({ memo: e.target.value })} placeholder="補足情報" rows={3} className={`${inputCls} resize-none`} />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── 地域フィルターパネル ─────────────────────────────────────────

type FilterMode = 'none' | 'pref' | 'region';

function RegionFilterPanel({
  filterMode, filterValue, includeAdjacent, homePref,
  onApplyPref, onApplyRegion, onClear, onToggleAdjacent, onSetHome, onClose,
}: {
  filterMode: FilterMode; filterValue: string | null; includeAdjacent: boolean; homePref: string | null;
  onApplyPref: (pref: string) => void; onApplyRegion: (region: string) => void;
  onClear: () => void; onToggleAdjacent: () => void; onSetHome: () => void; onClose: () => void;
}) {
  const filterActive = filterMode !== 'none';
  const filterLabel = filterMode === 'pref'
    ? `${filterValue}${includeAdjacent ? '（隣接含む）' : ''}`
    : filterMode === 'region' ? `${filterValue}地方` : '';
  const isOnHomePref = homePref && filterMode === 'pref' && filterValue === homePref && !includeAdjacent;
  const canGoHome = homePref && !isOnHomePref;

  return (
    <div className="fixed inset-0 z-[200] flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div
        className="relative bg-bg-primary rounded-t-2xl"
        style={{ maxHeight: '85vh', display: 'flex', flexDirection: 'column', animation: 'slideUpPanel 0.28s cubic-bezier(0.32, 0.72, 0, 1) both' }}
      >
        <div style={{ flexShrink: 0 }} className="pt-3 px-4 pb-3 border-b border-faint">
          <div className="flex justify-center mb-2">
            <div className="w-10 h-1 rounded-full bg-label-tertiary/50" />
          </div>
          <div className="flex items-center justify-between">
            <p className="text-label-primary font-semibold text-sm">地域で絞り込む</p>
            <button onClick={onClose} className="text-xs text-label-secondary active:opacity-60">閉じる</button>
          </div>
          {filterActive && (
            <div className="mt-2 flex items-center gap-2">
              <span className="text-xs rounded-full px-2.5 py-0.5 border" style={{ color: 'var(--accent-color)', borderColor: 'var(--accent-color)' }}>{filterLabel}</span>
              <button onClick={onClear} className="text-xs text-label-tertiary underline active:opacity-60">解除</button>
            </div>
          )}
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: 'scroll', WebkitOverflowScrolling: 'touch', padding: '16px 16px 40px' } as React.CSSProperties}>
          <div className="mb-5">
            <p className="text-label-tertiary text-xs mb-2">都道府県で選ぶ</p>
            <PrefectureSearch
              value={filterMode === 'pref' ? filterValue ?? '' : ''}
              onChange={pref => { if (pref) onApplyPref(pref); else onClear(); }}
            />
          </div>
          <div className="mb-5">
            <p className="text-label-tertiary text-xs mb-2">地域で選ぶ</p>
            <select
              value={filterMode === 'region' ? filterValue ?? '' : ''}
              onChange={e => { if (e.target.value) onApplyRegion(e.target.value); else onClear(); }}
              className="w-full bg-bg-secondary rounded-xl px-3 py-3 text-sm text-label-primary outline-none border border-subtle appearance-none"
            >
              <option value="">地域を選ぶ</option>
              {REGIONS.map(r => <option key={r.name} value={r.name}>{r.name}地方</option>)}
            </select>
          </div>
          {filterMode === 'pref' && filterValue && (ADJACENT[filterValue]?.length ?? 0) > 0 && (
            <button onClick={onToggleAdjacent} className="w-full flex items-center justify-between px-4 py-3 bg-bg-secondary rounded-xl mb-5">
              <div>
                <p className="text-sm text-label-primary text-left">隣接する県を含む</p>
                {includeAdjacent && <p className="text-[10px] text-label-tertiary text-left mt-0.5">{ADJACENT[filterValue].join('・')}</p>}
              </div>
              <div className="flex-shrink-0 w-11 h-6 rounded-full relative transition-colors ml-3" style={{ background: includeAdjacent ? 'var(--accent-color)' : 'rgba(128,128,128,0.4)' }}>
                <div className="absolute top-1 w-4 h-4 bg-white rounded-full transition-all shadow-sm" style={{ left: includeAdjacent ? 'calc(100% - 20px)' : '4px' }} />
              </div>
            </button>
          )}
          {!homePref && (
            <div className="mb-4 px-4 py-3 bg-bg-secondary rounded-xl border border-faint">
              <p className="text-label-primary text-sm font-medium mb-1">ホーム県を設定する</p>
              <p className="text-label-tertiary text-xs mb-3 leading-relaxed">設定しておくとカレンダーを開いたとき自動で絞り込まれ、毎回選ばずに済みます。</p>
              <button onClick={onSetHome} className="text-xs font-semibold active:opacity-60" style={{ color: 'var(--accent-color)' }}>ユーザー設定で登録する →</button>
            </div>
          )}
          {canGoHome ? (
            <button onClick={() => onApplyPref(homePref!)} className="w-full text-center py-3 rounded-xl text-sm font-medium active:opacity-70" style={{ background: 'var(--accent-color)', color: 'var(--bg-primary)' }}>
              ホーム県（{homePref}）に戻す
            </button>
          ) : filterActive ? (
            <button onClick={onClear} className="w-full text-center py-3 rounded-xl border border-subtle text-sm text-label-secondary active:opacity-60">全国表示（絞り込みなし）</button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ─── 個人予定 ──────────────────────────────────────────────────────

type PersonalEvent = {
  id: string;
  title: string;
  date: string;
  time?: string;
  category?: string;
  prefecture?: string;
  locationDetail?: string;
  locationMapLink?: string;
  link?: string;
  memo?: string;
};
const PERSONAL_EVENTS_KEY = 'fan_personal_events';
function loadPersonalEvents(): PersonalEvent[] {
  try { return JSON.parse(localStorage.getItem(PERSONAL_EVENTS_KEY) ?? '[]'); } catch { return []; }
}
function savePersonalEvents(evts: PersonalEvent[]) {
  localStorage.setItem(PERSONAL_EVENTS_KEY, JSON.stringify(evts));
}

// ─── メイン画面 ────────────────────────────────────────────────────

export default function Calendar() {
  const { workId = '' } = useParams<{ workId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { settings, setCurrentCalendar, calFontFamily } = useTheme();

  const today = new Date();
  const todayStr = toDateStr(today);

  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [workName, setWorkName] = useState('');
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(!!workId);
  const [error, setError] = useState('');
  const [showMenu, setShowMenu] = useState(false);
  const [copyDone, setCopyDone] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const [filterMode, setFilterMode] = useState<FilterMode>('none');
  const [filterValue, setFilterValue] = useState<string | null>(null);
  const [includeAdjacent, setIncludeAdjacent] = useState(false);
  const [showRegionPanel, setShowRegionPanel] = useState(false);

  const [homePref, setHomePref] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [showUserSettings, setShowUserSettings] = useState(false);

  const [participatedWorks, setParticipatedWorks] = useState<Work[]>([]);
  const [hiddenWorkIds, setHiddenWorkIds] = useState<Set<string>>(new Set());

  const [postPanelOpen, setPostPanelOpen] = useState(false);
  const [postDate, setPostDate] = useState(todayStr);
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [personalEvents, setPersonalEvents] = useState<PersonalEvent[]>([]);
  const [topView, setTopView] = useState<'calendar' | 'list'>('calendar');

  // フォームstate（ボトムシート内に統合）
  const [postCards, setPostCards] = useState<InlineCard[]>([newInlineCard(todayStr)]);
  const [postError, setPostError] = useState('');
  const [postSubmitting, setPostSubmitting] = useState(false);

  useEffect(() => {
    if (!user) return;
    Promise.all([getHomePrefecture(user.id), getDisplayName(user.id)])
      .then(([pref, name]) => {
        setHomePref(pref);
        setDisplayName(name);
        if (pref) { setFilterMode('pref'); setFilterValue(pref); }
      });
  }, [user?.id]);

  const handleCopyUrl = async () => {
    const url = `${window.location.origin}/calendar/${workId}`;
    await navigator.clipboard.writeText(url);
    setCopyDone(true);
    setTimeout(() => setCopyDone(false), 2000);
    setShowMenu(false);
  };

  const handleLeave = async () => {
    if (!user) return;
    if (!window.confirm(`「${workName}」のカレンダーから抜けますか？`)) return;
    await leaveCalendar(workId, user.id);
    localStorage.removeItem('last_calendar_workId');
    navigate('/');
  };

  const handleDelete = async () => {
    if (!user) return;
    if (!window.confirm(`「${workName}」のカレンダーをすべてのデータごと完全に削除しますか？\nこの操作は元に戻せません。`)) return;
    setDeleting(true);
    setShowMenu(false);
    try {
      await deleteWork(workId);
      localStorage.removeItem('last_calendar_workId');
      navigate('/');
    } catch {
      setDeleting(false);
      alert('削除に失敗しました。');
    }
  };

  const handleSaveUserSettings = async (newPref: string | null, newName: string) => {
    if (!user) return;
    setHomePref(newPref);
    setDisplayName(newName || null);
    if (newPref) { setFilterMode('pref'); setFilterValue(newPref); setIncludeAdjacent(false); }
    await Promise.all([saveHomePrefecture(user.id, newPref), saveDisplayName(user.id, newName)]);
  };

  useEffect(() => {
    if (!workId) return;
    setCurrentCalendar(workId);
    getWorkById(workId).then(w => {
      if (w) { setWorkName(w.name); localStorage.setItem('last_calendar_work_name', w.name); }
    });
  }, [workId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!workId) return;
    setLoading(true);
    setError('');
    listEvents(workId, year, month)
      .then(setEvents)
      .catch(() => setError('イベントの読み込みに失敗しました'))
      .finally(() => setLoading(false));
  }, [workId, year, month, location.key]);

  useEffect(() => {
    if (workId) return;
    setPersonalEvents(loadPersonalEvents());
  }, [workId]);

  // MyCalendar: 参加中の作品リストを取得
  useEffect(() => {
    if (workId || !user) return;
    listRecentWorks(user.id).then(setParticipatedWorks).catch(console.error);
  }, [workId, user?.id]);

  // MyCalendar: 参加中の全作品のイベントを取得
  useEffect(() => {
    if (workId || !user) return;
    setLoading(true);
    setError('');
    listAllParticipatedWorkEvents(user.id, year, month)
      .then(setEvents)
      .catch(() => setError('イベントの読み込みに失敗しました'))
      .finally(() => setLoading(false));
  }, [workId, user?.id, year, month, location.key]);

  const toggleWorkVisibility = (wId: string) =>
    setHiddenWorkIds(prev => {
      const next = new Set(prev);
      if (next.has(wId)) next.delete(wId);
      else next.add(wId);
      return next;
    });

  const activeFilterPrefs = useMemo((): Set<string> | null => {
    if (filterMode === 'region') {
      const r = REGIONS.find(x => x.name === filterValue);
      return r ? new Set(r.prefectures) : null;
    }
    if (filterMode === 'pref' && filterValue) {
      const set = new Set<string>([filterValue]);
      if (includeAdjacent) ADJACENT[filterValue]?.forEach(p => set.add(p));
      return set;
    }
    return null;
  }, [filterMode, filterValue, includeAdjacent]);

  const calendarDays = useMemo(() => getCalendarDays(year, month), [year, month]);

  const monthEvents = useMemo(
    () => [...events].sort((a, b) => a.date.localeCompare(b.date)),
    [events],
  );

  const filteredEvents = useMemo(() => {
    if (!activeFilterPrefs) return monthEvents;
    return monthEvents.filter(e => !e.prefecture || activeFilterPrefs.has(e.prefecture));
  }, [monthEvents, activeFilterPrefs]);

  // 表示中のイベント（作品非表示フィルター適用済み）
  const visibleEvents = useMemo(() => {
    if (workId) return filteredEvents;
    return filteredEvents.filter(e => !e.workId || !hiddenWorkIds.has(e.workId));
  }, [workId, filteredEvents, hiddenWorkIds]);

  const prevMonth = () => {
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else setMonth(m => m + 1);
  };

  const handleDayClick = (dateStr: string, isCurrentMonth: boolean) => {
    if (!isCurrentMonth) return;
    setSelectedDate(dateStr);
    setSheetOpen(true);
  };

  const deletePersonalEvent = (id: string) => {
    const updated = personalEvents.filter(e => e.id !== id);
    setPersonalEvents(updated);
    savePersonalEvents(updated);
  };

  const handleDeleteEvent = async (eventId: string) => {
    if (!window.confirm('この予定を削除しますか？')) return;
    try {
      await deleteEvent(eventId);
      setEvents(prev => prev.filter(e => e.id !== eventId));
    } catch {
      alert('削除に失敗しました');
    }
  };

  // フォームハンドラー
  const addPostCard = () => {
    const defaultWorkId = !workId && participatedWorks.length > 0 ? participatedWorks[0].id : '';
    setPostCards(prev => [...prev.map(c => ({ ...c, collapsed: true })), { ...newInlineCard(postDate), workId: defaultWorkId }]);
  };
  const updatePostCard = (id: string, patch: Partial<InlineCard>) =>
    setPostCards(prev => prev.map(c => c.id === id ? { ...c, ...patch } : c));
  const togglePostCard = (id: string) =>
    setPostCards(prev => prev.map(c => c.id === id ? { ...c, collapsed: !c.collapsed } : c));
  const removePostCard = (id: string) =>
    setPostCards(prev => prev.filter(c => c.id !== id));

  const applyParsedToPost = (parsed: ParsedEvent) => {
    const VALID_CATS = POST_CATEGORIES as unknown as string[];
    const filled = (c: InlineCard) => c.title.trim() !== '' || c.date !== postDate;
    const parsedCard = (base: InlineCard): InlineCard => ({
      ...base,
      collapsed: false,
      title:          parsed.title          ?? base.title,
      date:           parsed.date           ?? base.date,
      time:           parsed.time           ?? base.time,
      category:       VALID_CATS.includes(parsed.category ?? '')
                        ? (parsed.category as typeof base.category)
                        : base.category,
      customCategory: !VALID_CATS.includes(parsed.category ?? '') && parsed.category
                        ? parsed.category
                        : base.customCategory,
      prefecture:     parsed.prefecture     ?? base.prefecture,
      locationDetail: parsed.locationDetail ?? base.locationDetail,
      link:           parsed.link           ?? base.link,
      memo:           parsed.memo           ?? base.memo,
    });
    const defaultWorkId = !workId && participatedWorks.length > 0 ? participatedWorks[0].id : '';
    setPostCards(prev => {
      const [first, ...rest] = prev;
      if (!filled(first)) {
        return [parsedCard(first), ...rest];
      }
      return [...prev.map(c => ({ ...c, collapsed: true })), parsedCard({ ...newInlineCard(postDate), workId: defaultWorkId })];
    });
  };

  const openPostForm = (date: string) => {
    const defaultWorkId = !workId && participatedWorks.length > 0 ? participatedWorks[0].id : '';
    setPostDate(date);
    setPostCards([{ ...newInlineCard(date), workId: defaultWorkId }]);
    setPostError('');
    setSheetOpen(true);
    setPostPanelOpen(true);
  };

  // Web Share Target から来た場合、sessionStorageの解析済みデータを投稿フォームに展開
  useEffect(() => {
    const raw = sessionStorage.getItem('pendingParsedEvent');
    if (!raw) return;
    sessionStorage.removeItem('pendingParsedEvent');
    try {
      const parsed = JSON.parse(raw);
      const defaultWorkId = !workId && participatedWorks.length > 0 ? participatedWorks[0].id : '';
      const today = new Date().toISOString().slice(0, 10);
      const date = parsed.date ?? today;
      const VALID_CATS = POST_CATEGORIES as unknown as string[];
      setPostDate(date);
      setPostCards([{
        ...newInlineCard(date),
        workId: defaultWorkId,
        title:          parsed.title          ?? '',
        time:           parsed.time           ?? '',
        category:       VALID_CATS.includes(parsed.category ?? '')
                          ? parsed.category as PostCategory
                          : '',
        customCategory: !VALID_CATS.includes(parsed.category ?? '') && parsed.category
                          ? parsed.category : '',
        prefecture:     parsed.prefecture     ?? '',
        locationDetail: parsed.locationDetail ?? '',
        link:           parsed.link           ?? '',
        memo:           parsed.memo           ?? '',
        collapsed: false,
      }]);
      setPostError('');
      setSheetOpen(true);
      setPostPanelOpen(true);
    } catch { /* ignore */ }
  }, [participatedWorks]);
  const closePostForm = () => setPostPanelOpen(false);

  const handlePostSubmit = async () => {
    const invalid = postCards.find(c => !c.title.trim() || !c.date);
    if (invalid) {
      setPostError('すべてのカードにタイトルと日付を入力してください');
      setPostCards(prev => prev.map(c => c.id === invalid.id ? { ...c, collapsed: false } : c));
      return;
    }
    setPostError('');
    setPostSubmitting(true);
    const toEventPayload = (c: InlineCard) => ({
      title: c.title.trim(), date: c.date, time: c.time || undefined,
      category: c.category || c.customCategory.trim() || undefined,
      link: c.link || undefined, memo: c.memo || undefined,
      prefecture: c.prefecture || undefined,
      locationDetail: c.locationDetail || undefined,
      locationMapLink: c.locationMapLink || undefined,
    });
    const toPersonalEvent = (c: InlineCard): PersonalEvent => ({
      id: crypto.randomUUID(), title: c.title.trim(), date: c.date,
      ...(c.time && { time: c.time }),
      ...((c.category || c.customCategory.trim()) && { category: c.category || c.customCategory.trim() }),
      ...(c.prefecture && { prefecture: c.prefecture }),
      ...(c.locationDetail && { locationDetail: c.locationDetail }),
      ...(c.locationMapLink && { locationMapLink: c.locationMapLink }),
      ...(c.link && { link: c.link }),
      ...(c.memo.trim() && { memo: c.memo.trim() }),
    });
    try {
      if (workId && user) {
        await createEvents(workId, postCards.map(toEventPayload), user.id);
        listEvents(workId, year, month).then(setEvents).catch(() => {});
      } else if (user) {
        // MyCalendar: 作品ごとにグループ化して投稿
        const workGroups = new Map<string, InlineCard[]>();
        const personalCards: InlineCard[] = [];
        for (const c of postCards) {
          if (c.workId) {
            const arr = workGroups.get(c.workId) ?? [];
            arr.push(c);
            workGroups.set(c.workId, arr);
          } else {
            personalCards.push(c);
          }
        }
        for (const [wId, cards] of workGroups) {
          await createEvents(wId, cards.map(toEventPayload), user.id);
        }
        if (personalCards.length > 0) {
          const existing = loadPersonalEvents();
          savePersonalEvents([...existing, ...personalCards.map(toPersonalEvent)]);
          setPersonalEvents(loadPersonalEvents());
        }
        if (workGroups.size > 0) {
          listAllParticipatedWorkEvents(user.id, year, month).then(setEvents).catch(() => {});
        }
      } else {
        const existing = loadPersonalEvents();
        savePersonalEvents([...existing, ...postCards.map(toPersonalEvent)]);
        setPersonalEvents(loadPersonalEvents());
      }
      closePostForm();
    } catch {
      setPostError('投稿に失敗しました。もう一度お試しください');
    } finally {
      setPostSubmitting(false);
    }
  };

  const filterActive = filterMode !== 'none';
  const filterLabel = filterMode === 'pref'
    ? `${filterValue}${includeAdjacent ? '＋隣接' : ''}`
    : filterMode === 'region' ? `${filterValue}地方` : '';

  const monthPersonalEvents = useMemo(() => {
    const prefix = `${year}-${String(month + 1).padStart(2, '0')}-`;
    return [...personalEvents.filter(e => e.date.startsWith(prefix))].sort((a, b) => a.date.localeCompare(b.date));
  }, [personalEvents, year, month]);

  // 作品ID → カラーのマップ（localStorage の fan_work_colors を優先）
  const workColorMap = useMemo(() => {
    const saved: Record<string, string> = (() => {
      try { return JSON.parse(localStorage.getItem('fan_work_colors') ?? '{}'); } catch { return {}; }
    })();
    const usedColors = new Set<string>(
      participatedWorks.filter(w => saved[w.id]).map(w => saved[w.id]),
    );
    const updated = { ...saved };
    let hasNew = false;
    const m = new Map<string, string>();
    participatedWorks.forEach(w => {
      if (!updated[w.id]) {
        const color = WORK_COLORS.find(c => !usedColors.has(c)) ?? WORK_COLORS[0];
        updated[w.id] = color;
        usedColors.add(color);
        hasNew = true;
      }
      m.set(w.id, updated[w.id]);
    });
    if (hasNew) localStorage.setItem('fan_work_colors', JSON.stringify(updated));
    return m;
  }, [participatedWorks]);

  // カレンダーセル用: 日付→{title, color}[]
  const cellEventsByDate = useMemo(() => {
    const map = new Map<string, Array<{ title: string; color: string }>>();
    for (const e of visibleEvents) {
      const arr = map.get(e.date) ?? [];
      const color = e.workId
        ? (workColorMap.get(e.workId) ?? 'var(--accent-color)')
        : 'var(--accent-color)';
      arr.push({ title: e.title, color });
      map.set(e.date, arr);
    }
    if (!workId) {
      for (const pe of monthPersonalEvents) {
        const arr = map.get(pe.date) ?? [];
        arr.push({ title: pe.title, color: '#888888' });
        map.set(pe.date, arr);
      }
    }
    return map;
  }, [workId, visibleEvents, monthPersonalEvents, workColorMap]);

  // ボトムシート用: 選択日の作品イベント
  const sheetWorkEvents = useMemo(
    () => visibleEvents.filter(e => e.date === selectedDate),
    [visibleEvents, selectedDate],
  );
  const sheetPersonalEvents = useMemo(
    () => personalEvents.filter(e => e.date === selectedDate),
    [personalEvents, selectedDate],
  );

  // 予定一覧ビュー用: 作品イベント+個人予定を日付順にまとめたリスト
  type ListItem = {
    id: string; date: string; title: string; time?: string;
    category?: string; prefecture?: string; memo?: string;
    tag: string; isPersonal: boolean; workId?: string;
    likes?: number; likedByMe?: boolean;
  };
  const myCalendarListItems = useMemo((): ListItem[] => {
    if (workId) return [];
    const workItems: ListItem[] = visibleEvents.map(e => ({
      id: e.id, date: e.date, title: e.title, time: e.time,
      category: e.category, prefecture: e.prefecture,
      tag: e.workName ?? '', isPersonal: false, workId: e.workId,
      likes: e.likes, likedByMe: e.likedByMe,
    }));
    const personalItems: ListItem[] = monthPersonalEvents.map(pe => ({
      id: pe.id, date: pe.date, title: pe.title, time: pe.time,
      category: pe.category, prefecture: pe.prefecture, memo: pe.memo,
      tag: '個人', isPersonal: true,
    }));
    return [...workItems, ...personalItems].sort((a, b) => a.date.localeCompare(b.date));
  }, [workId, visibleEvents, monthPersonalEvents]);

  const selectedDateLabel = useMemo(() => {
    const d = new Date(selectedDate + 'T00:00:00');
    const m = d.getMonth() + 1;
    const day = d.getDate();
    const dow = DAY_LABELS[d.getDay()];
    return `${m}月${day}日（${dow}）`;
  }, [selectedDate]);

  const sheetEventCount = workId
    ? sheetWorkEvents.length
    : sheetWorkEvents.length + sheetPersonalEvents.length;

  return (
    <>
      {/* フルスクリーンコンテナ */}
      <div
        className="fixed inset-0 max-w-app mx-auto flex flex-col overflow-hidden"
        style={{
          backgroundColor: 'var(--bg-primary)',
          paddingTop: 44,
          paddingBottom: BOTTOM_TAB_H,
        }}
      >
        <Header
          title={workId ? (workName || '…') : 'マイカレンダー'}
          subtitleNode={
            <div className="flex flex-col items-center">
              <span className="text-[10px] text-label-tertiary leading-none">{year}年</span>
              <div className="flex items-center gap-1.5 mt-0.5">
                <button onClick={prevMonth} aria-label="前の月" className="text-label-tertiary text-lg leading-none px-1 active:text-label-primary">‹</button>
                <span className="text-sm font-semibold text-label-primary">{month + 1}月</span>
                <button onClick={nextMonth} aria-label="次の月" className="text-label-tertiary text-lg leading-none px-1 active:text-label-primary">›</button>
              </div>
            </div>
          }
          rightAction={
            <div className="flex items-center gap-1">
              <button onClick={() => navigate('/customize')} className="w-8 h-8 flex items-center justify-center rounded-lg bg-bg-secondary text-label-secondary">
                <Palette size={16} />
              </button>

              {/* 地域フィルター: workId有無に関わらず表示 */}
              <button
                onClick={() => setShowRegionPanel(true)}
                aria-label="地域で絞り込む"
                className="relative w-8 h-8 flex items-center justify-center rounded-lg bg-bg-secondary text-label-secondary active:opacity-60"
              >
                <MapIcon size={16} style={filterActive ? { color: 'var(--accent-color)' } : {}} />
                {filterActive && <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full" style={{ background: 'var(--accent-color)' }} />}
              </button>

              <div className="relative" ref={menuRef}>
                <button onClick={() => setShowMenu(v => !v)} className="w-8 h-8 flex items-center justify-center rounded-lg bg-bg-secondary text-label-secondary">
                  <MoreVertical size={16} />
                </button>
                {showMenu && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
                    <div className="absolute right-0 top-9 z-50 bg-bg-secondary border border-subtle rounded-xl overflow-hidden shadow-lg w-48">
                      {workId && (
                        <>
                          <button onClick={handleCopyUrl} className="w-full flex items-center gap-3 px-4 py-3 text-sm text-label-primary active:opacity-60">
                            <Link2 size={15} className="text-label-secondary" />
                            {copyDone ? 'コピーしました！' : '招待リンクをコピー'}
                          </button>
                          <div className="h-px bg-subtle mx-3" />
                        </>
                      )}
                      <button onClick={() => { setShowMenu(false); setShowUserSettings(true); }} className="w-full flex items-center gap-3 px-4 py-3 text-sm text-label-primary active:opacity-60">
                        <Settings size={15} className="text-label-secondary" />ユーザー設定
                      </button>
                      {workId && (
                        <>
                          <div className="h-px bg-subtle mx-3" />
                          <button onClick={handleLeave} className="w-full flex items-center gap-3 px-4 py-3 text-sm text-red-400 active:opacity-60">
                            <LogOut size={15} />カレンダーから抜ける
                          </button>
                          <div className="h-px bg-subtle mx-3" />
                          <button onClick={handleDelete} disabled={deleting} className="w-full flex items-center gap-3 px-4 py-3 text-sm text-red-400 active:opacity-60 disabled:opacity-40">
                            <Trash2 size={15} />{deleting ? '削除中…' : 'カレンダーを削除'}
                          </button>
                        </>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          }
        />

        {/* 参加中の作品チップ（MyCalendarのみ） */}
        {!workId && participatedWorks.length > 0 && (
          <div
            className="flex-shrink-0 flex items-center gap-2 px-4 py-2 overflow-x-auto border-b"
            style={{ borderColor: 'var(--border-subtle)' }}
          >
            {participatedWorks.map((w, i) => {
              const hidden = hiddenWorkIds.has(w.id);
              const color = workColorMap.get(w.id) ?? WORK_COLORS[i % WORK_COLORS.length];
              return (
                <button
                  key={w.id}
                  onClick={() => toggleWorkVisibility(w.id)}
                  className="flex-shrink-0 flex items-center gap-1.5 text-xs px-3 py-1 rounded-full border transition-all active:opacity-70"
                  style={{
                    borderColor: hidden ? 'var(--border-subtle)' : color,
                    color: hidden ? 'var(--label-tertiary)' : color,
                    opacity: hidden ? 0.5 : 1,
                  }}
                >
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ background: hidden ? 'var(--label-tertiary)' : color }}
                  />
                  {w.name}
                </button>
              );
            })}
          </div>
        )}

        {/* 上部タブ（カレンダー / 予定一覧） */}
        <div className="flex flex-shrink-0 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
          {(['calendar', 'list'] as const).map(v => (
            <button
              key={v}
              onClick={() => setTopView(v)}
              className="flex-1 py-2.5 text-sm font-medium transition-colors relative"
              style={{ color: topView === v ? 'var(--accent-color)' : 'var(--label-tertiary)' }}
            >
              {v === 'calendar' ? 'カレンダー' : '予定一覧'}
              {topView === v && (
                <span className="absolute bottom-0 left-4 right-4 h-0.5 rounded-full" style={{ backgroundColor: 'var(--accent-color)' }} />
              )}
            </button>
          ))}
        </div>

        {/* タブ以下のコンテンツエリア（背景画像はここから） */}
        <div
          className="flex-1 overflow-hidden flex flex-col"
          style={settings.backgroundImageUrl ? {
            backgroundImage: `url(${settings.backgroundImageUrl})`,
            backgroundSize: 'cover',
            backgroundPosition: `${settings.bgImageOffsetX ?? 50}% ${settings.bgImageOffsetY ?? 50}%`,
          } : {}}
        >

        {topView === 'calendar' ? (
          /* ─── カレンダービュー ─── */
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* カレンダーグリッドエリア */}
            <div className="flex-1 overflow-hidden flex flex-col px-3 pt-1" style={{ fontFamily: calFontFamily }}>
              {/* 曜日ラベル */}
              <div className="grid grid-cols-7 mb-0.5 flex-shrink-0">
                {DAY_LABELS.map((label, i) => (
                  <div key={label} className="text-center text-[11px] py-1 font-medium select-none"
                    style={{ color: i === 0 ? 'var(--cal-sunday-color)' : i === 6 ? 'var(--cal-saturday-color)' : 'var(--cal-weekday-color)' }}>
                    {label}
                  </div>
                ))}
              </div>

              {/* 日付グリッド */}
              <div
                className="grid grid-cols-7 flex-1"
                style={{
                  gridTemplateRows: 'repeat(6, 1fr)',
                  borderTop: '1px solid var(--cal-grid-color)',
                  borderLeft: '1px solid var(--cal-grid-color)',
                }}
              >
                {calendarDays.map(({ date, isCurrentMonth }, idx) => {
                  const dateStr = toDateStr(date);
                  const isToday = dateStr === todayStr;
                  const isSelected = dateStr === selectedDate && isCurrentMonth && sheetOpen;
                  const col = idx % 7;
                  const cellItems = isCurrentMonth ? (cellEventsByDate.get(dateStr) ?? []) : [];
                  return (
                    <button
                      key={dateStr + idx}
                      onClick={() => handleDayClick(dateStr, isCurrentMonth)}
                      className="flex flex-col items-center justify-start pt-0.5 active:opacity-50 transition-opacity overflow-hidden"
                      style={{
                        cursor: isCurrentMonth ? 'pointer' : 'default',
                        borderRight: '1px solid var(--cal-grid-color)',
                        borderBottom: '1px solid var(--cal-grid-color)',
                      }}
                    >
                      <div
                        className="w-7 h-7 flex items-center justify-center rounded-full text-[13px] select-none transition-all flex-shrink-0"
                        style={{
                          background: isSelected ? 'var(--accent-color)' : isToday ? 'var(--label-primary)' : undefined,
                          color: isSelected || isToday ? 'var(--bg-primary)' : !isCurrentMonth ? 'var(--cal-other-month-color)' : col === 0 ? 'var(--cal-sunday-color)' : col === 6 ? 'var(--cal-saturday-color)' : 'var(--cal-weekday-color)',
                          fontWeight: isToday || isSelected ? 700 : undefined,
                        }}
                      >
                        {date.getDate()}
                      </div>
                      {cellItems.length > 0 ? (
                        <div className="w-full px-[2px] flex flex-col gap-[1px] mt-[1px] overflow-hidden">
                          {cellItems.slice(0, 2).map((item, ti) => (
                            <div
                              key={ti}
                              className="w-full text-[8px] leading-none truncate rounded-[2px] px-[2px] py-[1px]"
                              style={{
                                background: item.color.startsWith('#') ? item.color + '28' : 'rgba(128,128,128,0.18)',
                                color: item.color,
                              }}
                            >
                              {item.title}
                            </div>
                          ))}
                          {cellItems.length > 2 && (
                            <div
                              className="text-[8px] text-center leading-none py-[1px]"
                              style={{ color: 'var(--label-tertiary)' }}
                            >
                              +{cellItems.length - 2}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="h-[6px]" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ボトムシート（日付タップ） */}
            <div
              className="flex-shrink-0 overflow-hidden border-t"
              style={{
                height: sheetOpen ? SHEET_FULL_H : SHEET_COLLAPSED_H,
                transition: 'height 0.3s cubic-bezier(0.32, 0.72, 0, 1)',
                borderColor: 'var(--border-subtle)',
                backgroundColor: 'var(--bg-primary)',
              }}
            >
              <div className="flex flex-col" style={{ height: SHEET_FULL_H }}>
                {/* ハンドル＋日付ヘッダー */}
                <div
                  className="flex flex-col items-center pt-2 flex-shrink-0 cursor-pointer select-none"
                  style={{ height: SHEET_COLLAPSED_H }}
                  onClick={() => setSheetOpen(v => !v)}
                >
                  <div className="w-10 h-1 rounded-full mb-2" style={{ backgroundColor: 'var(--border-subtle)' }} />
                  <div className="w-full px-4 flex items-center justify-between">
                    <p className="text-label-primary text-sm font-semibold">{selectedDateLabel}</p>
                    <div className="flex items-center gap-2">
                      {sheetEventCount > 0 && <span className="text-label-tertiary text-xs">{sheetEventCount}件</span>}
                      <ChevronDown size={16} className="text-label-tertiary transition-transform duration-300" style={{ transform: sheetOpen ? 'rotate(180deg)' : 'none' }} />
                    </div>
                  </div>
                </div>
                {/* イベントリスト */}
                <div className="flex-1 overflow-y-auto px-4 pb-4">
                  {loading ? (
                    <div className="flex flex-col gap-2">{[1, 2].map(i => <div key={i} className="h-14 bg-bg-secondary rounded-xl animate-pulse" />)}</div>
                  ) : workId ? (
                    sheetWorkEvents.length === 0 ? (
                      <p className="text-center text-label-tertiary text-sm py-6">この日の予定はありません</p>
                    ) : (
                      <div className="flex flex-col gap-2">
                        {sheetWorkEvents.map(event => (
                          <div key={event.id} className="w-full flex items-center bg-bg-secondary rounded-xl overflow-hidden">
                            <button onClick={() => navigate(`/calendar/${workId}/date/${event.date}`)}
                              className="flex-1 flex items-center gap-3 pl-3 py-3 pr-1 text-left active:opacity-70 transition-opacity min-w-0">
                              <div className="flex-1 min-w-0">
                                <p className="text-label-primary text-sm font-medium truncate">{event.title}</p>
                                <div className="flex items-center gap-2 mt-1 flex-wrap">
                                  <div className="flex items-center gap-1">
                                    <Heart size={11} className={event.likedByMe ? 'fill-red-400 text-red-400' : 'text-label-tertiary'} />
                                    <span className="text-label-tertiary text-xs">{event.likes.toLocaleString('ja-JP')}</span>
                                  </div>
                                  {event.prefecture && <span className="text-[10px] text-label-tertiary bg-bg-primary rounded-full px-2 py-0.5">{event.prefecture}</span>}
                                </div>
                              </div>
                              <ChevronRight size={14} className="text-label-tertiary flex-shrink-0" />
                            </button>
                            <button onClick={() => handleDeleteEvent(event.id)} className="w-9 self-stretch flex items-center justify-center text-label-tertiary active:text-red-400 flex-shrink-0">
                              <X size={14} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )
                  ) : (
                    sheetWorkEvents.length === 0 && sheetPersonalEvents.length === 0 ? (
                      <p className="text-center text-label-tertiary text-sm py-6">この日の予定はありません</p>
                    ) : (
                      <div className="flex flex-col gap-2">
                        {sheetWorkEvents.map(event => (
                          <div key={event.id} className="w-full flex items-center bg-bg-secondary rounded-xl overflow-hidden">
                            <button
                              onClick={() => event.workId && navigate(`/calendar/${event.workId}/date/${event.date}`)}
                              className="flex-1 flex items-center gap-3 pl-3 py-3 pr-1 text-left active:opacity-70 transition-opacity min-w-0">
                              <div className="flex-1 min-w-0">
                                <p className="text-label-primary text-sm font-medium truncate">{event.title}</p>
                                <div className="flex items-center gap-2 mt-1 flex-wrap">
                                  {event.workName && <span className="text-[10px] text-label-tertiary bg-bg-primary rounded-full px-2 py-0.5">{event.workName}</span>}
                                  <div className="flex items-center gap-1">
                                    <Heart size={11} className={event.likedByMe ? 'fill-red-400 text-red-400' : 'text-label-tertiary'} />
                                    <span className="text-label-tertiary text-xs">{event.likes.toLocaleString('ja-JP')}</span>
                                  </div>
                                  {event.prefecture && <span className="text-[10px] text-label-tertiary bg-bg-primary rounded-full px-2 py-0.5">{event.prefecture}</span>}
                                </div>
                              </div>
                              <ChevronRight size={14} className="text-label-tertiary flex-shrink-0" />
                            </button>
                            <button onClick={() => handleDeleteEvent(event.id)} className="w-9 self-stretch flex items-center justify-center text-label-tertiary active:text-red-400 flex-shrink-0">
                              <X size={14} />
                            </button>
                          </div>
                        ))}
                        {sheetPersonalEvents.map(pe => (
                          <div key={pe.id} className="flex items-center gap-3 bg-bg-secondary rounded-xl px-3 py-3">
                            <div className="flex-1 min-w-0">
                              <p className="text-label-primary text-sm font-medium truncate">{pe.title}</p>
                              <div className="flex items-center gap-2 mt-1 flex-wrap">
                                <span className="text-[10px] text-label-tertiary bg-bg-primary rounded-full px-2 py-0.5">個人</span>
                                {pe.time && <span className="text-label-tertiary text-xs">{pe.time}</span>}
                                {pe.category && <span className="text-[10px] text-label-tertiary bg-bg-primary rounded-full px-2 py-0.5">{pe.category}</span>}
                                {pe.prefecture && <span className="text-[10px] text-label-tertiary bg-bg-primary rounded-full px-2 py-0.5">{pe.prefecture}</span>}
                              </div>
                              {pe.memo && <p className="text-label-secondary text-xs mt-0.5 truncate">{pe.memo}</p>}
                            </div>
                            <button onClick={() => deletePersonalEvent(pe.id)} className="w-6 h-6 flex items-center justify-center text-label-tertiary active:text-red-400 flex-shrink-0">
                              <X size={14} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* ─── 予定一覧ビュー ─── */
          <div className="flex-1 overflow-y-auto px-4 pt-3 pb-4">
            <p className="text-label-secondary text-xs px-1" style={{ marginBottom: filterActive ? 4 : 12 }}>今月の予定</p>
            {filterActive && (
              <div className="flex items-center gap-2 mb-3">
                <span className="text-[11px] text-label-tertiary">絞り込み：</span>
                <span className="text-[11px] px-2 py-0.5 rounded-full border" style={{ borderColor: 'var(--accent-color)', color: 'var(--accent-color)' }}>{filterLabel}</span>
                <button onClick={() => { setFilterMode('none'); setFilterValue(null); setIncludeAdjacent(false); }} className="text-[11px] text-label-tertiary underline active:opacity-60">解除</button>
              </div>
            )}
            {loading ? (
              <div className="flex flex-col gap-2">{[1, 2, 3].map(i => <div key={i} className="h-16 bg-bg-secondary rounded-xl animate-pulse" />)}</div>
            ) : error ? (
              <p className="text-center text-red-400 text-sm py-10">{error}</p>
            ) : workId ? (
              filteredEvents.length === 0 ? (
                <p className="text-center text-label-tertiary text-sm py-10">{filterActive ? 'この地域の予定はありません' : 'この月の予定はまだありません'}</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {filteredEvents.map(event => {
                    const [, em, ed] = event.date.split('-').map(Number);
                    return (
                      <div key={event.id} className="w-full flex items-center bg-bg-secondary rounded-xl overflow-hidden">
                        <button onClick={() => navigate(`/calendar/${workId}/date/${event.date}`)}
                          className="flex-1 flex items-center gap-3 pl-3 py-3 pr-1 text-left active:opacity-70 transition-opacity min-w-0">
                          <div className="flex-shrink-0 w-10 flex flex-col items-center">
                            <span className="text-[10px] text-label-tertiary leading-none">{em}月</span>
                            <span className="text-xl font-bold text-label-primary leading-snug">{ed}</span>
                          </div>
                          <div className="w-px h-8 bg-white/10 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-label-primary text-sm font-medium truncate">{event.title}</p>
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              <div className="flex items-center gap-1">
                                <Heart size={11} className={event.likedByMe ? 'fill-red-400 text-red-400' : 'text-label-tertiary'} />
                                <span className="text-label-tertiary text-xs">{event.likes.toLocaleString('ja-JP')}</span>
                              </div>
                              {event.prefecture && <span className="text-[10px] text-label-tertiary bg-bg-primary rounded-full px-2 py-0.5">{event.prefecture}</span>}
                            </div>
                          </div>
                        </button>
                        <button onClick={() => handleDeleteEvent(event.id)} className="w-9 self-stretch flex items-center justify-center text-label-tertiary active:text-red-400 flex-shrink-0">
                          <X size={14} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )
            ) : (
              myCalendarListItems.length === 0 ? (
                <p className="text-center text-label-tertiary text-sm py-10">
                  {participatedWorks.length === 0 ? 'まだ作品に参加していません' : 'この月の予定はありません'}
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  {myCalendarListItems.map(item => {
                    const [, im, id] = item.date.split('-').map(Number);
                    return (
                      <div
                        key={item.id}
                        className={`flex items-center gap-3 bg-bg-secondary rounded-xl px-3 py-3 ${!item.isPersonal ? 'cursor-pointer active:opacity-70 transition-opacity' : ''}`}
                        onClick={() => { if (!item.isPersonal && item.workId) navigate(`/calendar/${item.workId}/date/${item.date}`); }}
                      >
                        <div className="flex-shrink-0 w-10 flex flex-col items-center">
                          <span className="text-[10px] text-label-tertiary leading-none">{im}月</span>
                          <span className="text-xl font-bold text-label-primary leading-snug">{id}</span>
                        </div>
                        <div className="w-px h-8 bg-white/10 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-label-primary text-sm font-medium truncate">{item.title}</p>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            {item.tag && <span className="text-[10px] text-label-tertiary bg-bg-primary rounded-full px-2 py-0.5">{item.tag}</span>}
                            {item.time && <span className="text-label-tertiary text-xs">{item.time}</span>}
                            {item.category && <span className="text-[10px] text-label-tertiary bg-bg-primary rounded-full px-2 py-0.5">{item.category}</span>}
                            {item.prefecture && <span className="text-[10px] text-label-tertiary bg-bg-primary rounded-full px-2 py-0.5">{item.prefecture}</span>}
                          </div>
                          {item.memo && <p className="text-label-secondary text-xs mt-0.5 truncate">{item.memo}</p>}
                        </div>
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            item.isPersonal ? deletePersonalEvent(item.id) : handleDeleteEvent(item.id);
                          }}
                          className="w-6 h-6 flex items-center justify-center text-label-tertiary active:text-red-400 flex-shrink-0"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )
            )}
          </div>
        )}

        </div>{/* コンテンツエリア（背景画像ラッパー）閉じ */}
      </div>

      {/* FAB（workId有無に関わらず常に表示） */}
      <button
        onClick={() => {
          if (postPanelOpen) { closePostForm(); }
          else { openPostForm(selectedDate); }
        }}
        className="fixed bottom-[72px] right-4 w-[52px] h-[52px] bg-label-primary text-bg-primary rounded-full flex items-center justify-center shadow-xl z-40 active:opacity-80"
        aria-label={postPanelOpen ? '閉じる' : '予定を追加'}
      >
        <div style={{ transition: 'transform 0.28s cubic-bezier(0.34, 1.56, 0.64, 1)', transform: postPanelOpen ? 'rotate(45deg)' : 'rotate(0deg)' }}>
          <Plus size={22} strokeWidth={2.5} />
        </div>
      </button>

      {/* 予定追加フォームパネル（絶対配置スクロール方式） */}
      {postPanelOpen && (
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
          {/* ヘッダー：絶対配置でtop固定 */}
          <div
            className="absolute inset-x-0 top-0 z-10 rounded-t-2xl"
            style={{ backgroundColor: 'var(--bg-primary)' }}
          >
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full" style={{ backgroundColor: 'var(--border-subtle)' }} />
            </div>
            <div className="px-4 pb-2 flex items-center justify-between">
              <p className="text-label-secondary text-xs">予定を追加</p>
              <div className="flex items-center gap-2">
                <button onClick={closePostForm} className="text-xs text-label-tertiary px-3 py-1.5 rounded-lg active:opacity-60">キャンセル</button>
                <button onClick={handlePostSubmit} disabled={postSubmitting} className="text-xs font-semibold text-bg-primary bg-label-primary px-4 py-1.5 rounded-lg active:opacity-70 disabled:opacity-40">
                  {postSubmitting ? '送信中…' : workId && user ? '投稿' : '保存'}
                </button>
              </div>
            </div>
            {postError && <p className="text-red-400 text-xs px-4 pb-1">{postError}</p>}
          </div>

          {/* スクロールエリア：top:60px から bottom:0 の絶対配置 */}
          <div
            className="absolute inset-x-0 bottom-0"
            style={{
              top: 60,
              overflowY: 'scroll',
              WebkitOverflowScrolling: 'touch',
            } as React.CSSProperties}
          >
            <div className="px-4 pt-2 pb-8 flex flex-col gap-3">
              <SmartInputPanel onApply={applyParsedToPost} />
              {postCards.map((card, i) => (
                <InlineCardItem
                  key={card.id}
                  card={card}
                  index={i}
                  total={postCards.length}
                  participatedWorks={workId ? undefined : participatedWorks}
                  onChange={patch => updatePostCard(card.id, patch)}
                  onToggle={() => togglePostCard(card.id)}
                  onRemove={() => removePostCard(card.id)}
                />
              ))}
              <button onClick={addPostCard} className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-subtle text-label-secondary text-sm active:opacity-60">
                <Plus size={15} />別の予定を追加
              </button>
            </div>
          </div>
        </div>
      )}

      {showRegionPanel && (
        <RegionFilterPanel
          filterMode={filterMode}
          filterValue={filterValue}
          includeAdjacent={includeAdjacent}
          homePref={homePref}
          onApplyPref={pref => { setFilterMode('pref'); setFilterValue(pref); setIncludeAdjacent(false); setShowRegionPanel(false); }}
          onApplyRegion={region => { setFilterMode('region'); setFilterValue(region); setIncludeAdjacent(false); setShowRegionPanel(false); }}
          onClear={() => { setFilterMode('none'); setFilterValue(null); setIncludeAdjacent(false); }}
          onToggleAdjacent={() => setIncludeAdjacent(v => !v)}
          onSetHome={() => { setShowRegionPanel(false); setShowUserSettings(true); }}
          onClose={() => setShowRegionPanel(false)}
        />
      )}

      {showUserSettings && user && (
        <UserSettingsSheet
          homePref={homePref}
          displayName={displayName}
          onSave={handleSaveUserSettings}
          onClose={() => setShowUserSettings(false)}
        />
      )}

      <BottomTab />
    </>
  );
}

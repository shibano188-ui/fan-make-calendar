import { useState, useMemo, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import {
  Palette, Plus, Heart, MoreVertical, Link2, LogOut, Trash2,
  ChevronDown, ChevronUp, X, Settings, Map,
} from 'lucide-react';
import Layout from '../components/Layout';
import Header from '../components/Header';
import {
  listEvents, getWorkById, leaveCalendar, deleteWork,
  createEvents, getHomePrefecture, saveHomePrefecture,
  getDisplayName, saveDisplayName,
} from '../lib/api';
import { REGIONS, ADJACENT } from '../lib/prefectures';
import { PrefectureSearch } from '../components/UserSettingsSheet';
import UserSettingsSheet from '../components/UserSettingsSheet';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import type { CalendarEvent } from '../types';

export type { CalendarEvent };

// ─── 定数 ──────────────────────────────────────────────────────────

const DAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'];
const POST_CATEGORIES = ['単行本', 'グッズ', 'イベント', '誕生日', '配信'] as const;
type PostCategory = (typeof POST_CATEGORIES)[number];

const inputCls =
  'w-full bg-bg-primary rounded-lg px-3 py-2 text-sm text-label-primary caret-label-primary placeholder:text-label-tertiary outline-none border border-faint focus:border-strong';

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
  onChange,
  onToggle,
  onRemove,
}: {
  card: InlineCard;
  index: number;
  total: number;
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
          {/* タイトル */}
          <div className="pt-3">
            <label className="text-label-tertiary text-xs mb-1.5 block">タイトル <span className="text-red-400">*</span></label>
            <input type="text" value={card.title} onChange={e => onChange({ title: e.target.value })} placeholder="例：単行本 第15巻 発売" className={inputCls} autoFocus={index === 0} />
          </div>

          {/* 日付・時間 */}
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

          {/* カテゴリ */}
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

          {/* 場所 */}
          <div>
            <label className="text-label-tertiary text-xs mb-1.5 block">場所（任意）</label>
            <select
              value={card.prefecture}
              onChange={e => onChange({ prefecture: e.target.value })}
              className={`${inputCls} appearance-none`}
            >
              <option value="">全国（指定なし）</option>
              {Array.from({ length: 47 }, (_, i) => {
                const prefs = ['北海道','青森','岩手','宮城','秋田','山形','福島','茨城','栃木','群馬','埼玉','千葉','東京','神奈川','新潟','富山','石川','福井','山梨','長野','岐阜','静岡','愛知','三重','滋賀','京都','大阪','兵庫','奈良','和歌山','鳥取','島根','岡山','広島','山口','徳島','香川','愛媛','高知','福岡','佐賀','長崎','熊本','大分','宮崎','鹿児島','沖縄'];
                return <option key={prefs[i]} value={prefs[i]}>{prefs[i]}</option>;
              })}
            </select>
            {card.prefecture && (
              <div className="flex flex-col gap-2 mt-2">
                <input
                  type="text"
                  value={card.locationDetail}
                  onChange={e => onChange({ locationDetail: e.target.value })}
                  placeholder="詳しい場所・住所"
                  className={inputCls}
                />
                <input
                  type="url"
                  value={card.locationMapLink}
                  onChange={e => onChange({ locationMapLink: e.target.value })}
                  placeholder="Google Maps リンク"
                  className={inputCls}
                />
              </div>
            )}
          </div>

          {/* リンク */}
          <div>
            <label className="text-label-tertiary text-xs mb-1.5 block">リンク（任意）</label>
            <input type="url" value={card.link} onChange={e => onChange({ link: e.target.value })} placeholder="購入先 / 公式ポストなど" className={inputCls} />
          </div>

          {/* メモ */}
          <div>
            <label className="text-label-tertiary text-xs mb-1.5 block">メモ（任意）</label>
            <textarea value={card.memo} onChange={e => onChange({ memo: e.target.value })} placeholder="補足情報" rows={3} className={`${inputCls} resize-none`} />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── インライン投稿フォーム（複数カード対応） ─────────────────────

function InlinePostForm({
  workId,
  userId,
  selectedDate,
  onSuccess,
  onCancel,
}: {
  workId: string;
  userId: string;
  selectedDate: string;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const [cards, setCards] = useState<InlineCard[]>([newInlineCard(selectedDate)]);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setCards(prev => {
      const openIdx = prev.findIndex(c => !c.collapsed);
      if (openIdx === -1) return prev;
      return prev.map((c, i) => i === openIdx ? { ...c, date: selectedDate } : c);
    });
  }, [selectedDate]);

  const updateCard = (id: string, patch: Partial<InlineCard>) =>
    setCards(prev => prev.map(c => c.id === id ? { ...c, ...patch } : c));
  const toggleCard = (id: string) =>
    setCards(prev => prev.map(c => c.id === id ? { ...c, collapsed: !c.collapsed } : c));
  const removeCard = (id: string) =>
    setCards(prev => prev.filter(c => c.id !== id));
  const addCard = () =>
    setCards(prev => [...prev.map(c => ({ ...c, collapsed: true })), newInlineCard(selectedDate)]);

  const handleSubmit = async () => {
    const invalid = cards.find(c => !c.title.trim() || !c.date);
    if (invalid) {
      setError('すべてのカードにタイトルと日付を入力してください');
      setCards(prev => prev.map(c => c.id === invalid.id ? { ...c, collapsed: false } : c));
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      await createEvents(workId, cards.map(c => ({
        title: c.title.trim(),
        date: c.date,
        time: c.time || undefined,
        category: c.category || c.customCategory.trim() || undefined,
        link: c.link || undefined,
        memo: c.memo || undefined,
        prefecture: c.prefecture || undefined,
        locationDetail: c.locationDetail || undefined,
        locationMapLink: c.locationMapLink || undefined,
      })), userId);
      onSuccess();
    } catch {
      setError('投稿に失敗しました。もう一度お試しください');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="px-4 pt-3 pb-6 flex flex-col gap-3"
      style={{ animation: 'slideUpIn 0.38s cubic-bezier(0.34, 1.30, 0.64, 1) both' }}
    >
      {/* ヘッダー行 */}
      <div className="flex items-center justify-between gap-2">
        <p className="text-label-secondary text-xs">予定を追加</p>
        <div className="flex-shrink-0 flex items-center gap-2">
          <button
            onClick={onCancel}
            className="whitespace-nowrap text-xs text-label-tertiary px-3 py-1.5 rounded-lg active:opacity-60"
          >
            キャンセル
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="whitespace-nowrap text-xs font-semibold text-bg-primary bg-label-primary px-4 py-1.5 rounded-lg active:opacity-70 disabled:opacity-40"
          >
            {submitting ? '投稿中…' : '投稿'}
          </button>
        </div>
      </div>

      {error && <p className="text-red-400 text-xs px-1">{error}</p>}

      {cards.map((card, i) => (
        <InlineCardItem
          key={card.id}
          card={card}
          index={i}
          total={cards.length}
          onChange={patch => updateCard(card.id, patch)}
          onToggle={() => toggleCard(card.id)}
          onRemove={() => removeCard(card.id)}
        />
      ))}

      <button
        onClick={addCard}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-subtle text-label-secondary text-sm active:opacity-60"
      >
        <Plus size={15} />
        別の予定を追加
      </button>
    </div>
  );
}

// ─── 地域フィルターパネル ─────────────────────────────────────────

type FilterMode = 'none' | 'pref' | 'region';

function RegionFilterPanel({
  filterMode,
  filterValue,
  includeAdjacent,
  homePref,
  onApplyPref,
  onApplyRegion,
  onClear,
  onToggleAdjacent,
  onSetHome,
  onClose,
}: {
  filterMode: FilterMode;
  filterValue: string | null;
  includeAdjacent: boolean;
  homePref: string | null;
  onApplyPref: (pref: string) => void;
  onApplyRegion: (region: string) => void;
  onClear: () => void;
  onToggleAdjacent: () => void;
  onSetHome: () => void;
  onClose: () => void;
}) {
  const filterActive = filterMode !== 'none';
  const filterLabel = filterMode === 'pref'
    ? `${filterValue}${includeAdjacent ? '（隣接含む）' : ''}`
    : filterMode === 'region' ? `${filterValue}地方` : '';

  const isOnHomePref = homePref && filterMode === 'pref' && filterValue === homePref && !includeAdjacent;
  const canGoHome = homePref && !isOnHomePref;

  return (
    /* z-[200] でBottomTab(z-[100])より上に表示 */
    <div className="fixed inset-0 z-[200] flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div
        className="relative bg-bg-primary rounded-t-2xl"
        style={{
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          animation: 'slideUpPanel 0.28s cubic-bezier(0.32, 0.72, 0, 1) both',
        }}
      >
        {/* 固定ヘッダー */}
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
              <span className="text-xs rounded-full px-2.5 py-0.5 border" style={{ color: 'var(--accent-color)', borderColor: 'var(--accent-color)' }}>
                {filterLabel}
              </span>
              <button onClick={onClear} className="text-xs text-label-tertiary underline active:opacity-60">解除</button>
            </div>
          )}
        </div>

        {/* スクロール可能コンテンツ */}
        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: 'scroll',
            WebkitOverflowScrolling: 'touch',
            padding: '16px 16px 40px',
          } as React.CSSProperties}
        >
          {/* ① 都道府県で選ぶ */}
          <div className="mb-5">
            <p className="text-label-tertiary text-xs mb-2">都道府県で選ぶ</p>
            <PrefectureSearch
              value={filterMode === 'pref' ? filterValue ?? '' : ''}
              onChange={pref => { if (pref) onApplyPref(pref); else onClear(); }}
            />
          </div>

          {/* ② 地域で選ぶ */}
          <div className="mb-5">
            <p className="text-label-tertiary text-xs mb-2">地域で選ぶ</p>
            <select
              value={filterMode === 'region' ? filterValue ?? '' : ''}
              onChange={e => { if (e.target.value) onApplyRegion(e.target.value); else onClear(); }}
              className="w-full bg-bg-secondary rounded-xl px-3 py-3 text-sm text-label-primary outline-none border border-subtle appearance-none"
            >
              <option value="">地域を選ぶ</option>
              {REGIONS.map(r => (
                <option key={r.name} value={r.name}>{r.name}地方</option>
              ))}
            </select>
          </div>

          {/* ③ 隣接する県を含む */}
          {filterMode === 'pref' && filterValue && (ADJACENT[filterValue]?.length ?? 0) > 0 && (
            <button
              onClick={onToggleAdjacent}
              className="w-full flex items-center justify-between px-4 py-3 bg-bg-secondary rounded-xl mb-5"
            >
              <div>
                <p className="text-sm text-label-primary text-left">隣接する県を含む</p>
                {includeAdjacent && (
                  <p className="text-[10px] text-label-tertiary text-left mt-0.5">
                    {ADJACENT[filterValue].join('・')}
                  </p>
                )}
              </div>
              <div
                className="flex-shrink-0 w-11 h-6 rounded-full relative transition-colors ml-3"
                style={{ background: includeAdjacent ? 'var(--accent-color)' : 'rgba(128,128,128,0.4)' }}
              >
                <div
                  className="absolute top-1 w-4 h-4 bg-white rounded-full transition-all shadow-sm"
                  style={{ left: includeAdjacent ? 'calc(100% - 20px)' : '4px' }}
                />
              </div>
            </button>
          )}

          {/* ホーム県未設定 → 設定を促すカード */}
          {!homePref && (
            <div className="mb-4 px-4 py-3 bg-bg-secondary rounded-xl border border-faint">
              <p className="text-label-primary text-sm font-medium mb-1">ホーム県を設定する</p>
              <p className="text-label-tertiary text-xs mb-3 leading-relaxed">
                設定しておくとカレンダーを開いたとき自動で絞り込まれ、毎回選ばずに済みます。
              </p>
              <button
                onClick={onSetHome}
                className="text-xs font-semibold active:opacity-60"
                style={{ color: 'var(--accent-color)' }}
              >
                ユーザー設定で登録する →
              </button>
            </div>
          )}

          {canGoHome ? (
            <button
              onClick={() => onApplyPref(homePref!)}
              className="w-full text-center py-3 rounded-xl text-sm font-medium active:opacity-70"
              style={{ background: 'var(--accent-color)', color: 'var(--bg-primary)' }}
            >
              ホーム県（{homePref}）に戻す
            </button>
          ) : filterActive ? (
            <button
              onClick={onClear}
              className="w-full text-center py-3 rounded-xl border border-subtle text-sm text-label-secondary active:opacity-60"
            >
              全国表示（絞り込みなし）
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ─── メイン画面 ────────────────────────────────────────────────────

export default function Calendar() {
  const { workId = '' } = useParams<{ workId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { setCurrentCalendar } = useTheme();

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

  const [postPanelOpen, setPostPanelOpen] = useState(false);
  const [postDate, setPostDate] = useState(todayStr);

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

  // カレンダー切り替え時に設定を分離して読み込む
  useEffect(() => {
    if (!workId) return;
    setCurrentCalendar(workId);
    getWorkById(workId).then(w => {
      if (w) {
        setWorkName(w.name);
        localStorage.setItem('last_calendar_work_name', w.name);
      }
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

  const filteredEventDates = useMemo(() => new Set(filteredEvents.map(e => e.date)), [filteredEvents]);

  const prevMonth = () => {
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else setMonth(m => m - 1);
  };

  const nextMonth = () => {
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else setMonth(m => m + 1);
  };

  const handleDayClick = (dateStr: string, isCurrentMonth: boolean) => {
    if (!workId) return;
    if (postPanelOpen) { if (isCurrentMonth) setPostDate(dateStr); }
    else navigate(`/calendar/${workId}/date/${dateStr}`);
  };

  const filterActive = filterMode !== 'none';
  const filterLabel = filterMode === 'pref'
    ? `${filterValue}${includeAdjacent ? '＋隣接' : ''}`
    : filterMode === 'region' ? `${filterValue}地方` : '';

  return (
    <Layout>
      <Header
        title={workId ? (workName || '…') : 'カレンダー'}
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

            {workId && (
              <button
                onClick={() => setShowRegionPanel(true)}
                aria-label="地域で絞り込む"
                className="relative w-8 h-8 flex items-center justify-center rounded-lg bg-bg-secondary text-label-secondary active:opacity-60"
              >
                <Map size={16} style={filterActive ? { color: 'var(--accent-color)' } : {}} />
                {filterActive && (
                  <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full" style={{ background: 'var(--accent-color)' }} />
                )}
              </button>
            )}

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
                    <button
                      onClick={() => { setShowMenu(false); setShowUserSettings(true); }}
                      className="w-full flex items-center gap-3 px-4 py-3 text-sm text-label-primary active:opacity-60"
                    >
                      <Settings size={15} className="text-label-secondary" />
                      ユーザー設定
                    </button>
                    {workId && (
                      <>
                        <div className="h-px bg-subtle mx-3" />
                        <button onClick={handleLeave} className="w-full flex items-center gap-3 px-4 py-3 text-sm text-red-400 active:opacity-60">
                          <LogOut size={15} />
                          カレンダーから抜ける
                        </button>
                        <div className="h-px bg-subtle mx-3" />
                        <button onClick={handleDelete} disabled={deleting} className="w-full flex items-center gap-3 px-4 py-3 text-sm text-red-400 active:opacity-60 disabled:opacity-40">
                          <Trash2 size={15} />
                          {deleting ? '削除中…' : 'カレンダーを削除'}
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

      {/* カレンダーグリッド（フォントはカレンダー数字・曜日のみに適用） */}
      <div
        className={`px-3 pt-3 pb-1 transition-colors duration-200 ${postPanelOpen ? 'bg-bg-secondary/30' : ''}`}
        style={{ fontFamily: 'var(--font-family)' }}
      >
        {postPanelOpen && (
          <p className="text-center text-[11px] text-label-tertiary mb-1 animate-pulse">日付をタップして選択</p>
        )}
        <div className="grid grid-cols-7 mb-1">
          {DAY_LABELS.map((label, i) => (
            <div
              key={label}
              className="text-center text-[11px] py-1 font-medium select-none"
              style={{ color: i === 0 ? 'var(--cal-sunday-color)' : i === 6 ? 'var(--cal-saturday-color)' : 'var(--cal-weekday-color)' }}
            >
              {label}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {calendarDays.map(({ date, isCurrentMonth }, idx) => {
            const dateStr = toDateStr(date);
            const isToday = dateStr === todayStr;
            const hasEvent = filteredEventDates.has(dateStr) && isCurrentMonth;
            const isSelectedPost = postPanelOpen && dateStr === postDate;
            const col = idx % 7;
            return (
              <button
                key={dateStr + idx}
                onClick={() => handleDayClick(dateStr, isCurrentMonth)}
                className={`flex flex-col items-center py-[3px] transition-opacity ${workId ? 'active:opacity-50' : 'cursor-default'}`}
              >
                <div
                  className="w-8 h-8 flex items-center justify-center rounded-full text-[13px] select-none transition-all"
                  style={{
                    background: isSelectedPost ? 'var(--accent-color)' : isToday ? 'var(--label-primary)' : undefined,
                    color: isSelectedPost || isToday ? 'var(--bg-primary)' : !isCurrentMonth ? 'var(--cal-other-month-color)' : col === 0 ? 'var(--cal-sunday-color)' : col === 6 ? 'var(--cal-saturday-color)' : 'var(--cal-weekday-color)',
                    fontWeight: isToday || isSelectedPost ? 700 : undefined,
                  }}
                >
                  {date.getDate()}
                </div>
                <div className="h-[6px] flex items-center justify-center">
                  {hasEvent && <div className={`w-[4px] h-[4px] rounded-full ${(isToday || isSelectedPost) ? 'bg-bg-secondary' : 'bg-label-secondary'}`} />}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 今月の予定 / インライン投稿フォーム */}
      <div className="pb-24">
        {!workId ? (
          <div className="flex flex-col items-center gap-5 py-14 text-center px-4">
            <p className="text-label-secondary text-sm">まだカレンダーに参加していません</p>
            <button onClick={() => navigate('/')} className="px-5 py-2.5 bg-label-primary text-bg-primary rounded-xl text-sm font-medium active:opacity-70">
              カレンダーに参加してみましょう
            </button>
          </div>
        ) : postPanelOpen && user ? (
          <InlinePostForm
            workId={workId}
            userId={user.id}
            selectedDate={postDate}
            onSuccess={() => {
              setPostPanelOpen(false);
              setLoading(true);
              listEvents(workId, year, month).then(setEvents).finally(() => setLoading(false));
            }}
            onCancel={() => setPostPanelOpen(false)}
          />
        ) : (
          <div className="px-4 pt-3">
            {filterActive && (
              <div className="flex items-center gap-2 mb-3">
                <span className="text-[11px] text-label-tertiary">絞り込み：</span>
                <span className="text-[11px] px-2 py-0.5 rounded-full border" style={{ borderColor: 'var(--accent-color)', color: 'var(--accent-color)' }}>
                  {filterLabel}
                </span>
                <button onClick={() => { setFilterMode('none'); setFilterValue(null); setIncludeAdjacent(false); }} className="text-[11px] text-label-tertiary underline active:opacity-60">
                  解除
                </button>
              </div>
            )}
            <p className="text-label-secondary text-xs mb-3 px-1">今月の予定</p>
            {loading ? (
              <div className="flex flex-col gap-2">
                {[1, 2, 3].map(i => <div key={i} className="h-16 bg-bg-secondary rounded-xl animate-pulse" />)}
              </div>
            ) : error ? (
              <p className="text-center text-red-400 text-sm py-10">{error}</p>
            ) : filteredEvents.length === 0 ? (
              <p className="text-center text-label-tertiary text-sm py-10">
                {filterActive ? 'この地域の予定はありません' : 'この月の予定はまだありません'}
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {filteredEvents.map(event => {
                  const [, m, d] = event.date.split('-').map(Number);
                  return (
                    <button
                      key={event.id}
                      onClick={() => navigate(`/calendar/${workId}/date/${event.date}`)}
                      className="w-full flex items-center gap-3 bg-bg-secondary rounded-xl px-3 py-3 text-left active:opacity-70 transition-opacity"
                    >
                      <div className="flex-shrink-0 w-10 flex flex-col items-center">
                        <span className="text-[10px] text-label-tertiary leading-none">{m}月</span>
                        <span className="text-xl font-bold text-label-primary leading-snug">{d}</span>
                      </div>
                      <div className="w-px h-8 bg-white/10 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-label-primary text-sm font-medium truncate">{event.title}</p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <div className="flex items-center gap-1">
                            <Heart size={11} className={event.likedByMe ? 'fill-red-400 text-red-400' : 'text-label-tertiary'} />
                            <span className="text-label-tertiary text-xs">{event.likes.toLocaleString('ja-JP')}</span>
                          </div>
                          {event.prefecture && (
                            <span className="text-[10px] text-label-tertiary bg-bg-primary rounded-full px-2 py-0.5">
                              {event.prefecture}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* FAB */}
      {workId && (
        <button
          onClick={() => { if (postPanelOpen) setPostPanelOpen(false); else { setPostDate(todayStr); setPostPanelOpen(true); } }}
          className="fixed bottom-[76px] right-4 w-[52px] h-[52px] bg-label-primary text-bg-primary rounded-full flex items-center justify-center shadow-xl z-40 active:opacity-80"
          aria-label={postPanelOpen ? '閉じる' : '予定を追加'}
        >
          <div style={{ transition: 'transform 0.28s cubic-bezier(0.34, 1.56, 0.64, 1)', transform: postPanelOpen ? 'rotate(45deg)' : 'rotate(0deg)' }}>
            <Plus size={22} strokeWidth={2.5} />
          </div>
        </button>
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
    </Layout>
  );
}

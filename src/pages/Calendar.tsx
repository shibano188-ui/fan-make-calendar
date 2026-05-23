import { useState, useMemo, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import {
  Palette, Plus, Heart, MoreVertical, Link2, LogOut, Trash2,
  Map, ChevronDown, ChevronUp,
} from 'lucide-react';
import Layout from '../components/Layout';
import Header from '../components/Header';
import {
  listEvents, getWorkById, leaveCalendar, deleteWork,
  createEvents, getHomePrefecture, saveHomePrefecture,
} from '../lib/api';
import { PREFECTURES, REGIONS, ADJACENT } from '../lib/prefectures';
import { useAuth } from '../contexts/AuthContext';
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

// ─── インライン投稿フォーム ─────────────────────────────────────────

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
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(selectedDate);
  const [time, setTime] = useState('');
  const [category, setCategory] = useState<PostCategory | ''>('');
  const [customCategory, setCustomCategory] = useState('');
  const [prefecture, setPrefecture] = useState('');
  const [locationDetail, setLocationDetail] = useState('');
  const [link, setLink] = useState('');
  const [memo, setMemo] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { setDate(selectedDate); }, [selectedDate]);

  const handleSubmit = async () => {
    if (!title.trim() || !date) { setError('タイトルと日付を入力してください'); return; }
    setError('');
    setSubmitting(true);
    try {
      await createEvents(workId, [{
        title: title.trim(),
        date,
        time: time || undefined,
        category: category || customCategory.trim() || undefined,
        link: link || undefined,
        memo: memo || undefined,
        prefecture: prefecture || undefined,
        locationDetail: locationDetail || undefined,
      }], userId);
      onSuccess();
    } catch {
      setError('投稿に失敗しました。もう一度お試しください');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="px-4 pt-3 pb-6 flex flex-col gap-4"
      style={{ animation: 'slideUpIn 0.38s cubic-bezier(0.34, 1.30, 0.64, 1) both' }}
    >
      {/* ヘッダー行 */}
      <div className="flex items-center justify-between">
        <p className="text-label-secondary text-xs px-1">予定を追加</p>
        <div className="flex items-center gap-2">
          <button
            onClick={onCancel}
            className="text-xs text-label-tertiary px-3 py-1.5 rounded-lg active:opacity-60"
          >
            キャンセル
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="text-xs font-semibold text-bg-primary bg-label-primary px-4 py-1.5 rounded-lg active:opacity-70 disabled:opacity-40"
          >
            {submitting ? '投稿中…' : '投稿'}
          </button>
        </div>
      </div>

      {error && <p className="text-red-400 text-xs px-1">{error}</p>}

      {/* 日付ヒント */}
      <p className="text-label-tertiary text-[11px] px-1 -mt-2">
        カレンダーの日付をタップすると自動で入力されます
      </p>

      {/* タイトル */}
      <div>
        <label className="text-label-tertiary text-xs mb-1.5 block">
          タイトル <span className="text-red-400">*</span>
        </label>
        <input
          type="text"
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="例：単行本 第15巻 発売"
          className={inputCls}
          autoFocus
        />
      </div>

      {/* 日付・時間 */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-label-tertiary text-xs mb-1.5 block">
            日付 <span className="text-red-400">*</span>
          </label>
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className={inputCls}
          />
        </div>
        <div>
          <label className="text-label-tertiary text-xs mb-1.5 block">時間</label>
          <input
            type="time"
            value={time}
            onChange={e => setTime(e.target.value)}
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
              onClick={() => { setCategory(c => c === cat ? '' : cat); setCustomCategory(''); }}
              className={`px-3 py-1 rounded-full text-xs border transition-colors ${
                category === cat
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
            value={customCategory}
            onChange={e => { setCustomCategory(e.target.value); setCategory(''); }}
            placeholder="自由に入力"
            className="flex-1 bg-bg-primary rounded-lg px-3 py-1.5 text-xs text-label-primary caret-label-primary placeholder:text-label-tertiary outline-none border border-faint focus:border-strong"
          />
        </div>
      </div>

      {/* 場所 */}
      <div>
        <label className="text-label-tertiary text-xs mb-1.5 block">場所（任意）</label>
        <select
          value={prefecture}
          onChange={e => { setPrefecture(e.target.value); if (!e.target.value) setLocationDetail(''); }}
          className={`${inputCls} appearance-none`}
        >
          <option value="">全国（指定なし）</option>
          {PREFECTURES.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        {prefecture && (
          <input
            type="text"
            value={locationDetail}
            onChange={e => setLocationDetail(e.target.value)}
            placeholder="詳しい場所・住所・Google Mapsリンクなど"
            className={`${inputCls} mt-2`}
          />
        )}
      </div>

      {/* リンク */}
      <div>
        <label className="text-label-tertiary text-xs mb-1.5 block">リンク（任意）</label>
        <input
          type="url"
          value={link}
          onChange={e => setLink(e.target.value)}
          placeholder="購入先 / 公式ポストなど"
          className={inputCls}
        />
      </div>

      {/* メモ */}
      <div>
        <label className="text-label-tertiary text-xs mb-1.5 block">メモ（任意）</label>
        <textarea
          value={memo}
          onChange={e => setMemo(e.target.value)}
          placeholder="補足情報"
          rows={3}
          className={`${inputCls} resize-none`}
        />
      </div>
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
  userId,
  onApplyPref,
  onApplyRegion,
  onClear,
  onToggleAdjacent,
  onSetHomePref,
  onClose,
}: {
  filterMode: FilterMode;
  filterValue: string | null;
  includeAdjacent: boolean;
  homePref: string | null;
  userId: string | undefined;
  onApplyPref: (pref: string) => void;
  onApplyRegion: (region: string) => void;
  onClear: () => void;
  onToggleAdjacent: () => void;
  onSetHomePref: (pref: string | null) => void;
  onClose: () => void;
}) {
  const [showPrefGrid, setShowPrefGrid] = useState(false);
  const [showHomeSetting, setShowHomeSetting] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div
        className="relative bg-bg-primary rounded-t-2xl max-h-[78vh] flex flex-col"
        style={{ animation: 'slideUpPanel 0.28s cubic-bezier(0.32, 0.72, 0, 1) both' }}
      >
        {/* ハンドル */}
        <div className="flex-shrink-0 pt-3 pb-1 flex justify-center">
          <div className="w-10 h-1 rounded-full bg-label-tertiary/60" />
        </div>

        <div className="px-4 pb-2 flex-shrink-0 flex items-center justify-between">
          <p className="text-label-primary font-semibold text-sm">地域で絞り込む</p>
          <button onClick={onClose} className="text-label-tertiary text-xs active:opacity-60">閉じる</button>
        </div>

        <div className="overflow-y-auto flex-1 px-4 pb-8">
          {/* 現在のフィルター表示 */}
          {filterMode !== 'none' && (
            <div className="mb-4 p-3 bg-bg-secondary rounded-xl flex items-center justify-between">
              <div>
                <p className="text-[10px] text-label-tertiary">絞り込み中</p>
                <p className="text-sm text-label-primary font-medium">
                  {filterMode === 'pref'
                    ? `${filterValue}${includeAdjacent ? '（隣接含む）' : ''}`
                    : `${filterValue}地方`}
                </p>
              </div>
              <button
                onClick={onClear}
                className="text-xs text-label-secondary px-3 py-1.5 rounded-lg bg-bg-primary border border-subtle active:opacity-60"
              >
                解除
              </button>
            </div>
          )}

          {/* 全表示 */}
          {filterMode !== 'none' && (
            <button
              onClick={onClear}
              className="w-full text-left px-4 py-2.5 rounded-xl text-sm text-label-secondary active:opacity-60 flex items-center gap-2 mb-4 border border-subtle"
            >
              すべて表示（全国）
            </button>
          )}

          {/* 地域ボタン */}
          <p className="text-label-tertiary text-xs mb-2">地域で選ぶ</p>
          <div className="grid grid-cols-3 gap-2 mb-4">
            {REGIONS.map(r => (
              <button
                key={r.name}
                onClick={() => onApplyRegion(r.name)}
                className={`py-2.5 rounded-xl text-xs text-center border transition-colors ${
                  filterMode === 'region' && filterValue === r.name
                    ? 'border-selected bg-label-primary/10 text-label-primary font-semibold'
                    : 'border-subtle text-label-secondary'
                } active:opacity-60`}
              >
                {r.name}
              </button>
            ))}
          </div>

          {/* 隣接する県を含むトグル（単一県選択時のみ） */}
          {filterMode === 'pref' && (
            <button
              onClick={onToggleAdjacent}
              className="w-full flex items-center justify-between px-4 py-3 bg-bg-secondary rounded-xl mb-4"
            >
              <span className="text-sm text-label-primary">隣接する県を含む</span>
              <div
                className="w-11 h-6 rounded-full relative transition-colors"
                style={{ background: includeAdjacent ? 'var(--accent-color)' : 'rgba(128,128,128,0.4)' }}
              >
                <div
                  className="absolute top-1 w-4 h-4 bg-white rounded-full transition-all shadow-sm"
                  style={{ left: includeAdjacent ? 'calc(100% - 20px)' : '4px' }}
                />
              </div>
            </button>
          )}

          {/* 都道府県グリッド */}
          <button
            onClick={() => setShowPrefGrid(v => !v)}
            className="w-full flex items-center justify-between mb-2 active:opacity-60"
          >
            <p className="text-label-tertiary text-xs">都道府県で選ぶ</p>
            {showPrefGrid ? <ChevronUp size={14} className="text-label-tertiary" /> : <ChevronDown size={14} className="text-label-tertiary" />}
          </button>

          {showPrefGrid && (
            <div className="mb-4">
              {REGIONS.map(r => (
                <div key={r.name} className="mb-3">
                  <p className="text-label-tertiary text-[10px] mb-1.5">{r.name}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {r.prefectures.map(p => (
                      <button
                        key={p}
                        onClick={() => onApplyPref(p)}
                        className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                          filterMode === 'pref' && filterValue === p
                            ? 'border-selected bg-label-primary/10 text-label-primary font-semibold'
                            : 'border-subtle text-label-secondary'
                        } active:opacity-60`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ホーム県設定 */}
          {userId && (
            <div className="border-t border-subtle pt-4">
              <button
                onClick={() => setShowHomeSetting(v => !v)}
                className="w-full flex items-center justify-between mb-2 active:opacity-60"
              >
                <div>
                  <p className="text-xs text-label-tertiary text-left">ホーム県</p>
                  <p className="text-xs text-label-secondary text-left">
                    {homePref ? homePref : '未設定'}
                  </p>
                </div>
                {showHomeSetting ? <ChevronUp size={14} className="text-label-tertiary" /> : <ChevronDown size={14} className="text-label-tertiary" />}
              </button>
              {showHomeSetting && (
                <>
                  <p className="text-[10px] text-label-tertiary mb-2">
                    設定するとカレンダーを開いたとき自動で絞り込まれます
                  </p>
                  <select
                    value={homePref ?? ''}
                    onChange={e => onSetHomePref(e.target.value || null)}
                    className="w-full bg-bg-secondary rounded-lg px-3 py-2 text-sm text-label-primary outline-none border border-faint mb-1"
                  >
                    <option value="">設定しない</option>
                    {PREFECTURES.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </>
              )}
            </div>
          )}
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

  const today = new Date();
  const todayStr = toDateStr(today);

  // 基本状態
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

  // 地域フィルター
  const [filterMode, setFilterMode] = useState<FilterMode>('none');
  const [filterValue, setFilterValue] = useState<string | null>(null);
  const [includeAdjacent, setIncludeAdjacent] = useState(false);
  const [showRegionPanel, setShowRegionPanel] = useState(false);
  const [homePref, setHomePref] = useState<string | null>(null);

  // インライン投稿フォーム
  const [postPanelOpen, setPostPanelOpen] = useState(false);
  const [postDate, setPostDate] = useState(todayStr);

  // ホーム県を読み込んで自動フィルター
  useEffect(() => {
    if (!user) return;
    getHomePrefecture(user.id).then(pref => {
      setHomePref(pref);
      if (pref) {
        setFilterMode('pref');
        setFilterValue(pref);
      }
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
      alert('削除に失敗しました。Supabaseの削除ポリシーを確認してください。');
    }
  };

  useEffect(() => {
    if (!workId) return;
    localStorage.setItem('last_calendar_workId', workId);
    getWorkById(workId).then(w => { if (w) setWorkName(w.name); });
  }, [workId]);

  useEffect(() => {
    if (!workId) return;
    setLoading(true);
    setError('');
    listEvents(workId, year, month)
      .then(setEvents)
      .catch(() => setError('イベントの読み込みに失敗しました'))
      .finally(() => setLoading(false));
  }, [workId, year, month, location.key]);

  // フィルター計算
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

  const handleApplyPref = (pref: string) => {
    setFilterMode('pref');
    setFilterValue(pref);
    setIncludeAdjacent(false);
    setShowRegionPanel(false);
  };

  const handleApplyRegion = (region: string) => {
    setFilterMode('region');
    setFilterValue(region);
    setIncludeAdjacent(false);
    setShowRegionPanel(false);
  };

  const handleClearFilter = () => {
    setFilterMode('none');
    setFilterValue(null);
    setIncludeAdjacent(false);
  };

  const handleSetHomePref = async (pref: string | null) => {
    setHomePref(pref);
    if (pref) { setFilterMode('pref'); setFilterValue(pref); setIncludeAdjacent(false); }
    if (user) await saveHomePrefecture(user.id, pref);
  };

  const handleDayClick = (dateStr: string, isCurrentMonth: boolean) => {
    if (!workId) return;
    if (postPanelOpen) {
      if (isCurrentMonth) setPostDate(dateStr);
    } else {
      navigate(`/calendar/${workId}/date/${dateStr}`);
    }
  };

  const filterActive = filterMode !== 'none';

  return (
    <Layout>
      <Header
        title={workId ? (workName || '…') : 'カレンダー'}
        subtitleNode={
          <div className="flex items-center justify-center gap-1">
            <button onClick={prevMonth} aria-label="前の月" className="text-label-tertiary text-lg leading-none px-1.5 active:text-label-primary">‹</button>
            <span className="text-xs text-label-secondary">{year}年 {month + 1}月</span>
            <button onClick={nextMonth} aria-label="次の月" className="text-label-tertiary text-lg leading-none px-1.5 active:text-label-primary">›</button>
            {workId && (
              <button
                onClick={() => setShowRegionPanel(true)}
                aria-label="地域で絞り込む"
                className="relative ml-1 w-7 h-7 flex items-center justify-center rounded-lg text-label-secondary active:opacity-60"
              >
                <Map size={14} style={filterActive ? { color: 'var(--accent-color)' } : {}} />
                {filterActive && (
                  <span
                    className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full"
                    style={{ background: 'var(--accent-color)' }}
                  />
                )}
              </button>
            )}
          </div>
        }
        rightAction={
          <div className="flex items-center gap-1">
            <button
              onClick={() => navigate('/customize')}
              className="w-8 h-8 flex items-center justify-center rounded-lg bg-bg-secondary text-label-secondary"
            >
              <Palette size={16} />
            </button>
            {workId && (
              <div className="relative" ref={menuRef}>
                <button
                  onClick={() => setShowMenu(v => !v)}
                  className="w-8 h-8 flex items-center justify-center rounded-lg bg-bg-secondary text-label-secondary"
                >
                  <MoreVertical size={16} />
                </button>
                {showMenu && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
                    <div className="absolute right-0 top-9 z-50 bg-bg-secondary border border-subtle rounded-xl overflow-hidden shadow-lg w-48">
                      <button
                        onClick={handleCopyUrl}
                        className="w-full flex items-center gap-3 px-4 py-3 text-sm text-label-primary active:opacity-60"
                      >
                        <Link2 size={15} className="text-label-secondary" />
                        {copyDone ? 'コピーしました！' : '招待リンクをコピー'}
                      </button>
                      <div className="h-px bg-subtle mx-3" />
                      <button
                        onClick={handleLeave}
                        className="w-full flex items-center gap-3 px-4 py-3 text-sm text-red-400 active:opacity-60"
                      >
                        <LogOut size={15} />
                        カレンダーから抜ける
                      </button>
                      <div className="h-px bg-subtle mx-3" />
                      <button
                        onClick={handleDelete}
                        disabled={deleting}
                        className="w-full flex items-center gap-3 px-4 py-3 text-sm text-red-400 active:opacity-60 disabled:opacity-40"
                      >
                        <Trash2 size={15} />
                        {deleting ? '削除中…' : 'カレンダーを削除'}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        }
      />

      {/* カレンダーグリッド */}
      <div className={`px-3 pt-3 pb-1 transition-colors duration-200 ${postPanelOpen ? 'bg-bg-secondary/30' : ''}`}>
        {/* 投稿モードのヒント */}
        {postPanelOpen && (
          <p className="text-center text-[11px] text-label-tertiary mb-1 animate-pulse">
            日付をタップして選択
          </p>
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
                  className="w-8 h-8 flex items-center justify-center rounded-full text-[13px] font-medium select-none transition-all"
                  style={{
                    background: isSelectedPost
                      ? 'var(--accent-color)'
                      : isToday
                      ? 'var(--label-primary)'
                      : undefined,
                    color: isSelectedPost || isToday
                      ? 'var(--bg-primary)'
                      : !isCurrentMonth
                      ? 'var(--cal-other-month-color)'
                      : col === 0
                      ? 'var(--cal-sunday-color)'
                      : col === 6
                      ? 'var(--cal-saturday-color)'
                      : 'var(--cal-weekday-color)',
                    fontWeight: isToday || isSelectedPost ? 700 : undefined,
                    boxShadow: isSelectedPost ? '0 0 0 2px var(--accent-color)' : undefined,
                  }}
                >
                  {date.getDate()}
                </div>
                <div className="h-[6px] flex items-center justify-center">
                  {hasEvent && (
                    <div className={`w-[4px] h-[4px] rounded-full ${(isToday || isSelectedPost) ? 'bg-bg-secondary' : 'bg-label-secondary'}`} />
                  )}
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
            <button
              onClick={() => navigate('/')}
              className="px-5 py-2.5 bg-label-primary text-bg-primary rounded-xl text-sm font-medium active:opacity-70"
            >
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
              // イベントを再取得
              setLoading(true);
              listEvents(workId, year, month)
                .then(setEvents)
                .finally(() => setLoading(false));
            }}
            onCancel={() => setPostPanelOpen(false)}
          />
        ) : (
          <div className="px-4 pt-3">
            {/* フィルターバッジ */}
            {filterActive && (
              <div className="flex items-center gap-2 mb-3">
                <span className="text-[11px] text-label-tertiary">絞り込み：</span>
                <span
                  className="text-[11px] px-2 py-0.5 rounded-full border"
                  style={{ borderColor: 'var(--accent-color)', color: 'var(--accent-color)' }}
                >
                  {filterMode === 'pref'
                    ? `${filterValue}${includeAdjacent ? '＋隣接' : ''}`
                    : `${filterValue}地方`}
                </span>
                <button onClick={handleClearFilter} className="text-[11px] text-label-tertiary underline active:opacity-60">
                  解除
                </button>
              </div>
            )}

            <p className="text-label-secondary text-xs mb-3 px-1">今月の予定</p>

            {loading ? (
              <div className="flex flex-col gap-2">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-16 bg-bg-secondary rounded-xl animate-pulse" />
                ))}
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
                            <Heart size={11} className={event.likedByMe ? 'text-red-400 fill-red-400' : 'text-label-tertiary'} />
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
          onClick={() => {
            if (postPanelOpen) {
              setPostPanelOpen(false);
            } else {
              setPostDate(todayStr);
              setPostPanelOpen(true);
            }
          }}
          className="fixed bottom-[76px] right-4 w-[52px] h-[52px] bg-label-primary text-bg-primary rounded-full flex items-center justify-center shadow-xl z-40 active:opacity-80"
          aria-label={postPanelOpen ? '閉じる' : '予定を追加'}
        >
          <div style={{
            transition: 'transform 0.28s cubic-bezier(0.34, 1.56, 0.64, 1)',
            transform: postPanelOpen ? 'rotate(45deg)' : 'rotate(0deg)',
          }}>
            <Plus size={22} strokeWidth={2.5} />
          </div>
        </button>
      )}

      {/* 地域フィルターパネル */}
      {showRegionPanel && (
        <RegionFilterPanel
          filterMode={filterMode}
          filterValue={filterValue}
          includeAdjacent={includeAdjacent}
          homePref={homePref}
          userId={user?.id}
          onApplyPref={handleApplyPref}
          onApplyRegion={handleApplyRegion}
          onClear={() => { handleClearFilter(); setShowRegionPanel(false); }}
          onToggleAdjacent={() => setIncludeAdjacent(v => !v)}
          onSetHomePref={handleSetHomePref}
          onClose={() => setShowRegionPanel(false)}
        />
      )}
    </Layout>
  );
}

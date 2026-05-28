import { useState, useMemo, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import {
  Palette, Plus, Heart, MoreVertical, Link2, LogOut, Trash2,
  ChevronDown, ChevronUp, ChevronLeft, X, Settings, Map as MapIcon, ExternalLink, Smile, SlidersHorizontal, Pencil, Star,
} from 'lucide-react';
import BottomTab from '../components/BottomTab';
import Header from '../components/Header';
import {
  listEvents, getWorkById, leaveCalendar, deleteWork, deleteEvent,
  createEvents, getHomePrefecture, saveHomePrefecture,
  getDisplayName, saveDisplayName, listRecentWorks,
  listAllParticipatedWorkEvents, addLikeTap, setReaction, getReactionData, updateEvent,
} from '../lib/api';
import { REACTIONS, type ReactionType } from '../lib/reactions';
import type { Work } from '../lib/api';
import { REGIONS, ADJACENT } from '../lib/prefectures';
import { PrefectureSearch } from '../components/UserSettingsSheet';
import UserSettingsSheet from '../components/UserSettingsSheet';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import SmartInputPanel, { type ParsedEvent } from '../components/SmartInputPanel';
import type { CalendarEvent } from '../types';

export type { CalendarEvent };

import {
  POST_CATEGORIES, type PostCategory, loadCategoryFilters, saveCategoryFilters,
  loadCalendarEventIds, saveCalendarEventIds, removeCalendarEventId,
  parseLinks, serializeLinks, getCategoryColor,
  loadImportantEventIds, saveImportantEventIds, toggleImportantEventId,
  type FilterMode, saveRegionFilter, loadRegionFilter,
  incrementTotalLikesGiven,
} from '../lib/constants';

// ─── 定数 ──────────────────────────────────────────────────────────

const DAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'];

// 作品ごとの識別カラー（最大8作品まで色分け、以降はループ）
export const WORK_COLORS = [
  '#FF6B6B', '#4FC3F7', '#81C784', '#FFB74D',
  '#BA68C8', '#4DB6AC', '#F06292', '#A1887F',
];

const REACTIONS_KEY = 'fan_reactions';
function loadMyReactions(): Record<string, ReactionType> {
  try { return JSON.parse(localStorage.getItem(REACTIONS_KEY) ?? '{}'); } catch { return {}; }
}

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

function getDomain(url: string): string {
  try {
    const { hostname } = new URL(url);
    if (hostname.includes('amazon')) return 'Amazon';
    if (hostname.includes('twitter.com') || hostname.includes('x.com')) return '公式X';
    if (hostname.includes('kindle')) return 'Kindle';
    if (hostname.includes('bookwalker')) return 'BOOKWALKER';
    return hostname.replace(/^www\./, '');
  } catch { return url; }
}

function fmtMD(dateStr: string): string {
  const [, m, d] = dateStr.split('-');
  return `${parseInt(m)}月${parseInt(d)}日`;
}
function formatDateRange(startDate: string, endDate?: string): string | null {
  if (!endDate || endDate === startDate) return null;
  return `${fmtMD(startDate)}〜${fmtMD(endDate)}`;
}
function formatTimeRange(startTime?: string, endTime?: string): string | null {
  if (!startTime) return null;
  return endTime ? `${startTime}〜${endTime}` : startTime;
}

const inputCls =
  'w-full bg-bg-primary rounded-lg px-3 py-2 text-sm text-label-primary caret-label-primary placeholder:text-label-tertiary outline-none border border-faint focus:border-strong';

const BOTTOM_TAB_H = 56;
const SHEET_COLLAPSED_H = 76;
const SHEET_FULL_H = 280;

// 複数日イベントを単日イベントより先頭に並べるソート比較関数
function multiDayFirst(
  a: { date: string; endDate?: string },
  b: { date: string; endDate?: string },
): number {
  const aMulti = !!(a.endDate && a.endDate > a.date);
  const bMulti = !!(b.endDate && b.endDate > b.date);
  if (aMulti && !bMulti) return -1;
  if (!aMulti && bMulti) return 1;
  return 0;
}

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
  endDate: string;
  endTime: string;
  category: PostCategory | '';
  customCategory: string;
  prefecture: string;
  locationDetail: string;
  locationMapLink: string;
  links: string[];
  memo: string;
  important: boolean;
  collapsed: boolean;
}

function newInlineCard(date: string): InlineCard {
  return {
    id: crypto.randomUUID(),
    workId: '',
    title: '',
    date,
    time: '',
    endDate: '',
    endTime: '',
    category: '',
    customCategory: '',
    prefecture: '',
    locationDetail: '',
    locationMapLink: '',
    links: [''],
    memo: '',
    important: false,
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
          {card.important && (
            <Star size={13} style={{ fill: '#f59e0b', color: '#f59e0b' }} className="flex-shrink-0" />
          )}
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
          {/* 保存先 + ★ 重要ボタン（常に表示） */}
          <div className="pt-3">
            <div className="flex items-center justify-between mb-2">
              {participatedWorks && participatedWorks.length > 0 ? (
                <label className="text-label-tertiary text-xs">保存先</label>
              ) : (
                <span />
              )}
              <button
                type="button"
                onClick={e => { e.stopPropagation(); onChange({ important: !card.important }); }}
                className="w-8 h-8 flex items-center justify-center rounded-full border transition-colors active:opacity-70"
                style={card.important ? {
                  borderColor: '#f59e0b',
                  backgroundColor: 'rgba(245,158,11,0.12)',
                } : {
                  borderColor: 'var(--border-default)',
                }}
              >
                <Star size={16} style={{ fill: card.important ? '#f59e0b' : 'none', color: card.important ? '#f59e0b' : 'var(--label-secondary)' }} />
              </button>
            </div>
            {participatedWorks && participatedWorks.length > 0 && (
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
            )}
          </div>
          <div>
            <label className="text-label-tertiary text-xs mb-1.5 block">タイトル <span className="text-red-400">*</span></label>
            <input type="text" value={card.title} onChange={e => onChange({ title: e.target.value })} placeholder="例：単行本 第15巻 発売" className={inputCls} />
          </div>

          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-label-tertiary text-xs mb-1.5 block">開始日 <span className="text-red-400">*</span></label>
                <input type="date" value={card.date} onChange={e => onChange({ date: e.target.value })} className={inputCls} />
              </div>
              <div>
                <label className="text-label-tertiary text-xs mb-1.5 block">開始時間</label>
                <input type="time" value={card.time} onChange={e => onChange({ time: e.target.value })} className={inputCls} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-label-tertiary text-xs mb-1.5 block">終了日（任意）</label>
                <input type="date" value={card.endDate} min={card.date || undefined} onChange={e => onChange({ endDate: e.target.value })} className={inputCls} />
              </div>
              <div>
                <label className="text-label-tertiary text-xs mb-1.5 block">終了時間</label>
                <input type="time" value={card.endTime} onChange={e => onChange({ endTime: e.target.value })} className={inputCls} />
              </div>
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
            <label className="text-label-tertiary text-xs mb-1.5 block">リンク（任意・複数可）</label>
            <div className="flex flex-col gap-2">
              {card.links.map((lnk, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input type="url" value={lnk}
                    onChange={e => {
                      const next = [...card.links];
                      next[i] = e.target.value;
                      onChange({ links: next });
                    }}
                    placeholder={i === 0 ? '購入先 / 公式ポストなど' : '追加リンク'}
                    className={`${inputCls} flex-1`} />
                  {card.links.length > 1 && (
                    <button type="button"
                      onClick={() => onChange({ links: card.links.filter((_, j) => j !== i) })}
                      className="w-7 h-7 flex items-center justify-center text-label-tertiary active:opacity-60 flex-shrink-0">
                      <X size={14} />
                    </button>
                  )}
                </div>
              ))}
              {card.links.length < 5 && (
                <button type="button"
                  onClick={() => onChange({ links: [...card.links, ''] })}
                  className="flex items-center gap-1 text-xs text-label-tertiary active:opacity-60 mt-0.5 w-fit">
                  <Plus size={12} />リンクを追加
                </button>
              )}
            </div>
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
  endDate?: string;
  endTime?: string;
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

// マイカレンダーから非表示にしたイベントID（localStorageに保存）
const HIDDEN_EVENTS_KEY = 'fan_hidden_event_ids';
function loadHiddenEventIds(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(HIDDEN_EVENTS_KEY) ?? '[]') as string[]); } catch { return new Set(); }
}
function addHiddenEventId(id: string): Set<string> {
  const set = loadHiddenEventIds();
  set.add(id);
  localStorage.setItem(HIDDEN_EVENTS_KEY, JSON.stringify([...set]));
  return set;
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
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const swipeStartX = useRef<number | null>(null);
  const swipeStartY = useRef<number | null>(null);

  const [filterMode, setFilterMode] = useState<FilterMode>(() => loadRegionFilter().filterMode);
  const [filterValue, setFilterValue] = useState<string | null>(() => loadRegionFilter().filterValue);
  const [includeAdjacent, setIncludeAdjacent] = useState(() => loadRegionFilter().includeAdjacent);
  const [showRegionPanel, setShowRegionPanel] = useState(false);

  const [homePref, setHomePref] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [showUserSettings, setShowUserSettings] = useState(false);

  const [participatedWorks, setParticipatedWorks] = useState<Work[]>([]);
  const [hiddenWorkIds, setHiddenWorkIds] = useState<Set<string>>(new Set());
  const [categoryFilters, setCategoryFilters] = useState<Record<string, string[]>>(loadCategoryFilters);
  const [filterPickerWorkId, setFilterPickerWorkId] = useState<string | null>(null);

  const [shareData] = useState<Record<string, string | null> | null>(() => {
    const raw = sessionStorage.getItem('pendingParsedEvent');
    if (!raw) return null;
    try { return JSON.parse(raw) as Record<string, string | null>; } catch { return null; }
  });

  const shareInitDate = shareData?.date ?? todayStr;
  const [postPanelOpen, setPostPanelOpen] = useState(!!shareData);
  const [postDate, setPostDate] = useState(shareInitDate);
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [sheetOpen, setSheetOpen] = useState(!!shareData);
  const [personalEvents, setPersonalEvents] = useState<PersonalEvent[]>([]);
  const [topView, setTopView] = useState<'calendar' | 'list'>(
    () => (sessionStorage.getItem('cal_topView') as 'calendar' | 'list') ?? 'calendar',
  );
  const [sheetDetailEvent, setSheetDetailEvent] = useState<CalendarEvent | null>(null);
  const [sheetDetailReactionData, setSheetDetailReactionData] = useState<{ counts: Record<string, number>; myReaction: string | null } | null>(null);
  const [listDetailEvent, setListDetailEvent] = useState<CalendarEvent | null>(null);
  const [myReactions, setMyReactions] = useState<Record<string, ReactionType>>(() => loadMyReactions());
  const [openReactionPickerId, setOpenReactionPickerId] = useState<string | null>(null);
  const [linkPickerLinks, setLinkPickerLinks] = useState<string[] | null>(null);
  const [hiddenEventIds, setHiddenEventIds] = useState<Set<string>>(loadHiddenEventIds);
  const [calendarEventIds, setCalendarEventIds] = useState<Set<string>>(loadCalendarEventIds);
  const [importantEventIds, setImportantEventIds] = useState<Set<string>>(loadImportantEventIds);

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

  // フォームstate（ボトムシート内に統合）
  const [postCards, setPostCards] = useState<InlineCard[]>(() => {
    if (!shareData) return [newInlineCard(todayStr)];
    const VALID_CATS = POST_CATEGORIES as unknown as string[];
    const date = shareData.date ?? todayStr;
    return [{
      ...newInlineCard(date),
      workId: '',
      title: shareData.title ?? '',
      time: shareData.time ?? '',
      category: VALID_CATS.includes(shareData.category ?? '') ? shareData.category as PostCategory : '',
      customCategory: !VALID_CATS.includes(shareData.category ?? '') && shareData.category ? shareData.category : '',
      prefecture: shareData.prefecture ?? '',
      locationDetail: shareData.locationDetail ?? '',
      link: shareData.link ?? '',
      memo: shareData.memo ?? '',
      collapsed: false,
    }];
  });
  const [postError, setPostError] = useState('');
  const [postSubmitting, setPostSubmitting] = useState(false);

  useEffect(() => {
    if (!user) return;
    // セッション内で既にホーム県フィルターを自動適用済みの場合はスキップ（発見タブで解除した設定を上書きしない）
    const alreadyApplied = sessionStorage.getItem('fan_home_pref_applied') === '1';
    Promise.all([getHomePrefecture(user.id), getDisplayName(user.id)])
      .then(([pref, name]) => {
        setHomePref(pref);
        setDisplayName(name);
        sessionStorage.setItem('fan_home_pref_applied', '1');
        if (!alreadyApplied && pref && loadRegionFilter().filterMode === 'none') {
          setFilterMode('pref'); setFilterValue(pref);
        }
      });
  }, [user?.id]);

  // 地域フィルターをlocalStorageに保存 → Discoverタブと共有
  useEffect(() => {
    saveRegionFilter({ filterMode, filterValue, includeAdjacent });
  }, [filterMode, filterValue, includeAdjacent]);

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

  // 発見タブから戻ったときにカレンダー追加済みIDを再読み込み
  useEffect(() => {
    if (!workId) setCalendarEventIds(loadCalendarEventIds());
  }, [workId, location.key]);

  // 発見タブで変更された地域フィルターを再読み込み
  useEffect(() => {
    const saved = loadRegionFilter();
    setFilterMode(saved.filterMode);
    setFilterValue(saved.filterValue);
    setIncludeAdjacent(saved.includeAdjacent);
  }, [location.key]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // 表示中のイベント（作品非表示・カテゴリフィルター・個人非表示リスト適用済み）
  // Model A: MyCalendarモードでは、発見タブでいいねしたイベントのみ表示
  // categoryFilters[wId] = 非表示にするカテゴリのリスト（空 = 全表示）
  const visibleEvents = useMemo(() => {
    let evts = workId ? filteredEvents : filteredEvents.filter(e => !e.workId || !hiddenWorkIds.has(e.workId));
    // MyCalendarモード: カレンダーに追加済みのイベントのみ（自分の投稿 or ❤️追加済み）
    if (!workId) evts = evts.filter(e => calendarEventIds.has(e.id));
    evts = evts.filter(e => !hiddenEventIds.has(e.id));
    evts = evts.filter(e => {
      const wId = e.workId ?? (workId || '');
      if (!wId) return true;
      const cats = categoryFilters[wId];
      if (!cats || cats.length === 0) return true;
      return !cats.includes(e.category ?? '');
    });
    return evts;
  }, [workId, filteredEvents, hiddenWorkIds, calendarEventIds, hiddenEventIds, categoryFilters]);

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
    setSheetDetailEvent(null);
  };

  const deletePersonalEvent = (id: string) => {
    const updated = personalEvents.filter(e => e.id !== id);
    setPersonalEvents(updated);
    savePersonalEvents(updated);
  };

  // sheetDetailEvent が変わったらリアクションデータをSupabaseから取得
  useEffect(() => {
    const evt = sheetDetailEvent ?? listDetailEvent;
    if (!evt) { setSheetDetailReactionData(null); return; }
    getReactionData(evt.id, user?.id)
      .then(setSheetDetailReactionData)
      .catch(() => setSheetDetailReactionData({ counts: {}, myReaction: null }));
  }, [sheetDetailEvent?.id, listDetailEvent?.id, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSheetEventLike = async (eventId: string) => {
    if (!user) return;
    const session = loadLikeSession(eventId);
    if (session.tapsUsed >= LIKE_MAX_TAPS) return;
    const newTaps = session.tapsUsed + 1;
    const resetAt = newTaps >= LIKE_MAX_TAPS ? Date.now() + LIKE_COOLDOWN_MS : 0;
    saveLikeSession(eventId, { tapsUsed: newTaps, resetAt });
    incrementTotalLikesGiven();
    if (newTaps >= LIKE_MAX_TAPS) {
      setLockedLikeIds(prev => { const next = new Set(prev); next.add(eventId); return next; });
      setTimeout(() => {
        setLockedLikeIds(prev => { const next = new Set(prev); next.delete(eventId); return next; });
      }, LIKE_COOLDOWN_MS);
    }
    try {
      const newCount = await addLikeTap(eventId, user.id);
      setSheetDetailEvent(prev => prev?.id === eventId ? { ...prev, likes: newCount, likedByMe: true } : prev);
      setListDetailEvent(prev => prev?.id === eventId ? { ...prev, likes: newCount, likedByMe: true } : prev);
      setEvents(prev => prev.map(e => e.id === eventId ? { ...e, likes: newCount, likedByMe: true } : e));
    } catch (e) { console.error(e); }
  };

  const handleReaction = (eventId: string, type: ReactionType) => {
    const isToggleOff = myReactions[eventId] === type;
    setMyReactions(prev => {
      const next = { ...prev };
      if (isToggleOff) { delete next[eventId]; } else { next[eventId] = type; }
      localStorage.setItem(REACTIONS_KEY, JSON.stringify(next));
      return next;
    });
    // sheetDetailReactionData の楽観的更新
    if (eventId === sheetDetailEvent?.id || eventId === listDetailEvent?.id) {
      setSheetDetailReactionData(prev => {
        if (!prev) return prev;
        const counts = { ...prev.counts };
        if (isToggleOff) {
          counts[type] = Math.max(0, (counts[type] ?? 0) - 1);
          if (counts[type] === 0) delete counts[type];
        } else {
          if (prev.myReaction) {
            const old = prev.myReaction;
            counts[old] = Math.max(0, (counts[old] ?? 0) - 1);
            if (counts[old] === 0) delete counts[old];
          }
          counts[type] = (counts[type] ?? 0) + 1;
        }
        return { counts, myReaction: isToggleOff ? null : type };
      });
    }
    setOpenReactionPickerId(null);
    if (user) {
      setReaction(eventId, user.id, isToggleOff ? null : type).catch(console.error);
    }
  };

  // イベントを非表示にする
  // - MyCalendar（!workId）: calendarEventIdsから削除 → 発見タブで再追加可能
  // - 作品別カレンダー（workId）: hiddenEventIdsに追加
  const handleHideEvent = (eventId: string) => {
    if (!workId) {
      const next = removeCalendarEventId(eventId);
      setCalendarEventIds(next);
    } else {
      const next = addHiddenEventId(eventId);
      setHiddenEventIds(new Set(next));
    }
    setSheetDetailEvent(prev => prev?.id === eventId ? null : prev);
    setListDetailEvent(prev => prev?.id === eventId ? null : prev);
  };

  // ─── 長押しで完全削除 ────────────────────────────────────────────
  const startLongPress = (callback: () => void) => {
    longPressTimer.current = setTimeout(callback, 700);
  };
  const cancelLongPress = () => {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
  };

  // ─── 左右スワイプで月移動 ───────────────────────────────────────────
  const handleSwipeStart = (e: React.TouchEvent) => {
    swipeStartX.current = e.touches[0].clientX;
    swipeStartY.current = e.touches[0].clientY;
  };
  const handleSwipeEnd = (e: React.TouchEvent) => {
    if (swipeStartX.current === null || swipeStartY.current === null) return;
    const dx = e.changedTouches[0].clientX - swipeStartX.current;
    const dy = e.changedTouches[0].clientY - swipeStartY.current;
    swipeStartX.current = null;
    swipeStartY.current = null;
    // 水平方向が支配的かつ60px以上で月移動（縦スクロールと競合しない）
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    cancelLongPress();
    if (dx < 0) nextMonth(); else prevMonth();
  };
  const handleFullDelete = async (id: string, title: string) => {
    if (!window.confirm(`「${title}」を完全に削除しますか？\nこの操作は元に戻せません。`)) return;
    try {
      await deleteEvent(id);
      setEvents(prev => prev.filter(e => e.id !== id));
      setSheetDetailEvent(prev => prev?.id === id ? null : prev);
      setListDetailEvent(prev => prev?.id === id ? null : prev);
    } catch { alert('削除に失敗しました'); }
  };
  const handleFullDeletePersonal = (id: string, title: string) => {
    if (!window.confirm(`「${title}」を削除しますか？`)) return;
    deletePersonalEvent(id);
  };

  // ─── イベント編集（投稿者本人のみ） ────────────────────────────
  const [editEventId, setEditEventId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<InlineCard> | null>(null);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState('');

  const openEditEvent = (event: CalendarEvent) => {
    const VALID = POST_CATEGORIES as unknown as string[];
    setEditEventId(event.id);
    setEditError('');
    const existingLinks = parseLinks(event.link);
    setEditForm({
      title: event.title,
      date: event.date,
      time: event.time ?? '',
      endDate: event.endDate ?? '',
      endTime: event.endTime ?? '',
      category: VALID.includes(event.category ?? '') ? event.category as typeof POST_CATEGORIES[number] : '',
      customCategory: !VALID.includes(event.category ?? '') && event.category ? event.category : '',
      prefecture: event.prefecture ?? '',
      locationDetail: event.locationDetail ?? '',
      locationMapLink: event.locationMapLink ?? '',
      links: existingLinks.length > 0 ? existingLinks : [''],
      memo: event.memo ?? '',
    });
  };

  const handleEditSubmit = async () => {
    if (!editEventId || !editForm) return;
    if (!editForm.title?.trim() || !editForm.date) { setEditError('タイトルと日付は必須です'); return; }
    setEditSubmitting(true);
    setEditError('');
    try {
      const category = editForm.category || (editForm.customCategory?.trim() ?? '') || undefined;
      const patch = {
        title: editForm.title.trim(),
        date: editForm.date,
        time: editForm.time || undefined,
        endDate: editForm.endDate || undefined,
        endTime: editForm.endTime || undefined,
        category,
        prefecture: editForm.prefecture || undefined,
        locationDetail: editForm.locationDetail || undefined,
        locationMapLink: editForm.locationMapLink || undefined,
        link: serializeLinks(editForm.links ?? []),
        memo: editForm.memo?.trim() || undefined,
      };
      await updateEvent(editEventId, patch);
      setEvents(prev => prev.map(e => e.id === editEventId ? { ...e, ...patch } : e));
      setSheetDetailEvent(prev => prev?.id === editEventId ? { ...prev, ...patch } : prev);
      setListDetailEvent(prev => prev?.id === editEventId ? { ...prev, ...patch } : prev);
      setEditEventId(null);
      setEditForm(null);
    } catch { setEditError('更新に失敗しました'); }
    finally { setEditSubmitting(false); }
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
    const titleLower = (parsed.title ?? '').toLowerCase();
    const matchedWork = participatedWorks.find(w => w.name && titleLower.includes(w.name.toLowerCase()));
    const parsedCard = (base: InlineCard): InlineCard => ({
      ...base,
      collapsed: false,
      workId:         matchedWork ? matchedWork.id : base.workId,
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
      links:          parsed.link ? (parseLinks(parsed.link).length > 0 ? parseLinks(parsed.link) : base.links) : base.links,
      memo:           parsed.memo           ?? base.memo,
    });
    const defaultWorkId = !workId && participatedWorks.length > 0 ? participatedWorks[0].id : '';
    setPostCards(prev => {
      const [first, ...rest] = prev;
      if (!filled(first)) return [parsedCard(first), ...rest];
      return [...prev.map(c => ({ ...c, collapsed: true })), parsedCard({ ...newInlineCard(postDate), workId: defaultWorkId })];
    });
  };

  useEffect(() => {
    sessionStorage.removeItem('pendingParsedEvent');
  }, []);

  // Web Share Target: participatedWorks読み込み後にタイトルから保存先を自動選択
  useEffect(() => {
    if (!shareData || !participatedWorks.length) return;
    setPostCards(prev => prev.map(card => {
      if (card.workId !== '') return card;
      const titleLower = card.title.toLowerCase();
      const match = participatedWorks.find(w => w.name && titleLower.includes(w.name.toLowerCase()));
      return match ? { ...card, workId: match.id } : card;
    }));
  }, [participatedWorks]); // eslint-disable-line react-hooks/exhaustive-deps

  const openPostForm = (date: string) => {
    const defaultWorkId = !workId && participatedWorks.length > 0 ? participatedWorks[0].id : '';
    setPostDate(date);
    setPostCards([{ ...newInlineCard(date), workId: defaultWorkId }]);
    setPostError('');
    setSheetOpen(true);
    setPostPanelOpen(true);
  };
  const closePostForm = () => setPostPanelOpen(false);

  const handlePostSubmit = async () => {
    const invalid = postCards.find(c => !c.title.trim() || !c.date);
    if (invalid) {
      setPostError('すべてのカードにタイトルと日付を入力してください');
      setPostCards(prev => prev.map(c => c.id === invalid.id ? { ...c, collapsed: false } : c));
      return;
    }
    const noCat = postCards.find(c => !c.category && !c.customCategory.trim());
    if (noCat) {
      setPostError('カテゴリを選択してください');
      setPostCards(prev => prev.map(c => c.id === noCat.id ? { ...c, collapsed: false } : c));
      return;
    }
    setPostError('');
    setPostSubmitting(true);
    const toEventPayload = (c: InlineCard) => ({
      title: c.title.trim(), date: c.date, time: c.time || undefined,
      endDate: c.endDate || undefined, endTime: c.endTime || undefined,
      category: c.category || c.customCategory.trim() || undefined,
      link: serializeLinks(c.links), memo: c.memo || undefined,
      prefecture: c.prefecture || undefined,
      locationDetail: c.locationDetail || undefined,
      locationMapLink: c.locationMapLink || undefined,
    });
    const serializedLinks = (c: InlineCard) => serializeLinks(c.links);
    const toPersonalEvent = (c: InlineCard): PersonalEvent => ({
      id: crypto.randomUUID(), title: c.title.trim(), date: c.date,
      ...(c.time && { time: c.time }),
      ...(c.endDate && { endDate: c.endDate }),
      ...(c.endTime && { endTime: c.endTime }),
      ...((c.category || c.customCategory.trim()) && { category: c.category || c.customCategory.trim() }),
      ...(c.prefecture && { prefecture: c.prefecture }),
      ...(c.locationDetail && { locationDetail: c.locationDetail }),
      ...(c.locationMapLink && { locationMapLink: c.locationMapLink }),
      ...(serializedLinks(c) && { link: serializedLinks(c) }),
      ...(c.memo.trim() && { memo: c.memo.trim() }),
    });
    const newImportantIds: string[] = [];
    try {
      if (workId && user) {
        const newIds = await createEvents(workId, postCards.map(toEventPayload), user.id);
        postCards.forEach((c, i) => { if (c.important && newIds[i]) newImportantIds.push(newIds[i]); });
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
        // 新規作成IDを収集（削除済みイベントを復活させないため全ユーザーIDは使わない）
        const allNewIds: string[] = [];
        for (const [wId, cards] of workGroups) {
          const newIds = await createEvents(wId, cards.map(toEventPayload), user.id);
          allNewIds.push(...newIds);
          newIds.forEach((id, i) => { if (cards[i].important) newImportantIds.push(id); });
        }
        if (personalCards.length > 0) {
          const newPersonalEvts = personalCards.map(toPersonalEvent);
          const existing = loadPersonalEvents();
          savePersonalEvents([...existing, ...newPersonalEvts]);
          setPersonalEvents(loadPersonalEvents());
          newPersonalEvts.forEach((pe, i) => { if (personalCards[i].important) newImportantIds.push(pe.id); });
        }
        if (workGroups.size > 0) {
          listAllParticipatedWorkEvents(user.id, year, month).then(evts => {
            setEvents(evts);
            // 新規作成したイベントのみカレンダーに追加
            if (allNewIds.length > 0) {
              const cal = loadCalendarEventIds();
              allNewIds.forEach(id => cal.add(id));
              saveCalendarEventIds(cal);
              setCalendarEventIds(new Set(cal));
            }
          }).catch(() => {});
        }
      } else {
        const newPersonalEvts = postCards.map(toPersonalEvent);
        const existing = loadPersonalEvents();
        savePersonalEvents([...existing, ...newPersonalEvts]);
        setPersonalEvents(loadPersonalEvents());
        newPersonalEvts.forEach((pe, i) => { if (postCards[i].important) newImportantIds.push(pe.id); });
      }
      // 重要フラグを保存
      if (newImportantIds.length > 0) {
        const important = loadImportantEventIds();
        newImportantIds.forEach(id => important.add(id));
        saveImportantEventIds(important);
        setImportantEventIds(new Set(important));
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

  // カレンダーセル用: 日付→{title, color, position?, eventId}[]
  type CellItem = { title: string; color: string; dotColor: string; position?: 'start' | 'middle' | 'end'; eventId: string; important?: boolean };
  const cellEventsByDate = useMemo(() => {
    const map = new Map<string, CellItem[]>();
    const add = (d: string, item: CellItem) => {
      const arr = map.get(d) ?? [];
      arr.push(item);
      map.set(d, arr);
    };
    for (const e of visibleEvents) {
      // タイル色: 作品色、ドット色: カテゴリ色（なければ作品色）
      const workColor = e.workId ? (workColorMap.get(e.workId) ?? 'var(--accent-color)') : 'var(--accent-color)';
      const dotColor = getCategoryColor(e.category) ?? workColor;
      const important = importantEventIds.has(e.id);
      if (e.endDate && e.endDate > e.date) {
        let cur = e.date;
        while (cur <= e.endDate) {
          const pos: CellItem['position'] = cur === e.date ? 'start' : cur === e.endDate ? 'end' : 'middle';
          add(cur, { title: e.title, color: workColor, dotColor, position: pos, eventId: e.id, important });
          const next = new Date(cur + 'T00:00:00');
          next.setDate(next.getDate() + 1);
          cur = toDateStr(next);
        }
      } else {
        add(e.date, { title: e.title, color: workColor, dotColor, eventId: e.id, important });
      }
    }
    if (!workId) {
      for (const pe of monthPersonalEvents) {
        const dotColor = getCategoryColor(pe.category) ?? '#888888';
        const important = importantEventIds.has(pe.id);
        if (pe.endDate && pe.endDate > pe.date) {
          let cur = pe.date;
          while (cur <= pe.endDate) {
            const pos: CellItem['position'] = cur === pe.date ? 'start' : cur === pe.endDate ? 'end' : 'middle';
            add(cur, { title: pe.title, color: '#888888', dotColor, position: pos, eventId: pe.id, important });
            const next = new Date(cur + 'T00:00:00');
            next.setDate(next.getDate() + 1);
            cur = toDateStr(next);
          }
        } else {
          add(pe.date, { title: pe.title, color: '#888888', dotColor, eventId: pe.id, important });
        }
      }
    }
    // 複数日イベント（position あり）を各日付の先頭に並べ直す
    for (const [, items] of map) {
      items.sort((a, b) => {
        const aMulti = !!a.position;
        const bMulti = !!b.position;
        if (aMulti && !bMulti) return -1;
        if (!aMulti && bMulti) return 1;
        return 0;
      });
    }
    return map;
  }, [workId, visibleEvents, monthPersonalEvents, workColorMap, importantEventIds]);

  // 複数日イベント用オーバーレイセグメント（週行をまたいでバーをつなげるための絶対配置データ）
  type MultiDayOverlaySegment = {
    key: string;
    eventId: string;
    weekRow: number;    // 0〜5
    startCol: number;   // 0〜6
    endCol: number;     // 0〜6
    color: string;
    dotColor: string;
    title: string;
    important: boolean;
    isFirstSegment: boolean;  // イベント全体の先頭セグメント（ドット＋タイトル表示）
    isLastSegment: boolean;   // イベント全体の末尾セグメント（右角丸）
    slotIndex: number;        // 同一週行内での縦スタック順
  };
  const multiDayOverlaySegments = useMemo((): MultiDayOverlaySegment[] => {
    type RawEvt = { eventId: string; startDate: string; endDate: string; title: string; color: string; dotColor: string; important: boolean };
    const rawEvts: RawEvt[] = [];
    for (const e of visibleEvents) {
      if (e.endDate && e.endDate > e.date) {
        const workColor = e.workId ? (workColorMap.get(e.workId) ?? 'var(--accent-color)') : 'var(--accent-color)';
        rawEvts.push({ eventId: e.id, startDate: e.date, endDate: e.endDate, title: e.title, color: workColor, dotColor: getCategoryColor(e.category) ?? workColor, important: importantEventIds.has(e.id) });
      }
    }
    if (!workId) {
      for (const pe of monthPersonalEvents) {
        if (pe.endDate && pe.endDate > pe.date) {
          rawEvts.push({ eventId: pe.id, startDate: pe.date, endDate: pe.endDate, title: pe.title, color: '#888888', dotColor: getCategoryColor(pe.category) ?? '#888888', important: importantEventIds.has(pe.id) });
        }
      }
    }

    type TempSeg = RawEvt & { weekRow: number; startCol: number; endCol: number; isFirstSegment: boolean; isLastSegment: boolean };
    const tempSegs: TempSeg[] = [];
    const rowEventOrder = new Map<number, string[]>(); // weekRow → eventId[]（出現順）

    for (const evt of rawEvts) {
      const segs: { weekRow: number; startCol: number; endCol: number }[] = [];
      let curRow: number | null = null;
      let segStartCol = 0;
      let segEndCol = 0;

      for (let idx = 0; idx < calendarDays.length; idx++) {
        const { date, isCurrentMonth } = calendarDays[idx];
        const dateStr = toDateStr(date);
        const weekRow = Math.floor(idx / 7);
        const col = idx % 7;
        const inEvent = isCurrentMonth && dateStr >= evt.startDate && dateStr <= evt.endDate;

        if (inEvent) {
          if (curRow === null) { curRow = weekRow; segStartCol = col; segEndCol = col; }
          else if (weekRow !== curRow) {
            segs.push({ weekRow: curRow, startCol: segStartCol, endCol: segEndCol });
            curRow = weekRow; segStartCol = col; segEndCol = col;
          } else { segEndCol = col; }
        }
      }
      if (curRow !== null) segs.push({ weekRow: curRow, startCol: segStartCol, endCol: segEndCol });

      for (const seg of segs) {
        const order = rowEventOrder.get(seg.weekRow) ?? [];
        if (!order.includes(evt.eventId)) order.push(evt.eventId);
        rowEventOrder.set(seg.weekRow, order);
      }
      segs.forEach((seg, i) => {
        tempSegs.push({ ...evt, weekRow: seg.weekRow, startCol: seg.startCol, endCol: seg.endCol, isFirstSegment: i === 0, isLastSegment: i === segs.length - 1 });
      });
    }

    return tempSegs.map(seg => ({
      key: `${seg.eventId}-${seg.weekRow}`,
      eventId: seg.eventId,
      weekRow: seg.weekRow, startCol: seg.startCol, endCol: seg.endCol,
      color: seg.color, dotColor: seg.dotColor, title: seg.title, important: seg.important,
      isFirstSegment: seg.isFirstSegment, isLastSegment: seg.isLastSegment,
      slotIndex: rowEventOrder.get(seg.weekRow)?.indexOf(seg.eventId) ?? 0,
    }));
  }, [workId, visibleEvents, monthPersonalEvents, workColorMap, importantEventIds, calendarDays]);

  // 各日付ごとにオーバーレイが占有するスロット数（= セル内プレースホルダー数に使用）
  // slotIndexは週行全体の順番なので、その日に存在しないイベントのスロットも空きとして確保する必要がある
  const overlaySlotCountByDate = useMemo(() => {
    const map = new Map<string, number>();
    for (const seg of multiDayOverlaySegments) {
      for (let col = seg.startCol; col <= seg.endCol; col++) {
        const idx = seg.weekRow * 7 + col;
        if (idx < calendarDays.length) {
          const dateStr = toDateStr(calendarDays[idx].date);
          const cur = map.get(dateStr) ?? 0;
          map.set(dateStr, Math.max(cur, seg.slotIndex + 1));
        }
      }
    }
    return map;
  }, [multiDayOverlaySegments, calendarDays]);

  // ボトムシート用: 選択日の作品イベント（複数日イベント対応）
  const sheetWorkEvents = useMemo(
    () => visibleEvents
      .filter(e => {
        const end = e.endDate || e.date;
        return e.date <= selectedDate && selectedDate <= end;
      })
      .sort(multiDayFirst),
    [visibleEvents, selectedDate],
  );
  const sheetPersonalEvents = useMemo(
    () => personalEvents
      .filter(e => {
        const end = e.endDate || e.date;
        return e.date <= selectedDate && selectedDate <= end;
      })
      .sort(multiDayFirst),
    [personalEvents, selectedDate],
  );

  // 予定一覧ビュー用: 作品イベント+個人予定を日付順にまとめたリスト
  type ListItem = {
    id: string; date: string; title: string; time?: string; endDate?: string; endTime?: string;
    category?: string; prefecture?: string; memo?: string; link?: string;
    tag: string; isPersonal: boolean; workId?: string;
    likes?: number; likedByMe?: boolean;
    authorId?: string; authorName?: string;
  };
  const myCalendarListItems = useMemo((): ListItem[] => {
    if (workId) return [];
    const workItems: ListItem[] = visibleEvents.map(e => ({
      id: e.id, date: e.date, title: e.title, time: e.time, endDate: e.endDate, endTime: e.endTime,
      category: e.category, prefecture: e.prefecture, link: e.link,
      tag: e.workName ?? '', isPersonal: false, workId: e.workId,
      likes: e.likes, likedByMe: e.likedByMe,
      authorId: e.authorId, authorName: e.authorName,
    }));
    const personalItems: ListItem[] = monthPersonalEvents.map(pe => ({
      id: pe.id, date: pe.date, title: pe.title, time: pe.time, endDate: pe.endDate, endTime: pe.endTime,
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

        {/* 上部タブ（カレンダー / 予定一覧） */}
        <div className="flex flex-shrink-0 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
          {(['calendar', 'list'] as const).map(v => (
            <button
              key={v}
              onClick={() => { setTopView(v); sessionStorage.setItem('cal_topView', v); }}
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
          <div className="flex-1 flex flex-col overflow-hidden"
            onTouchStart={handleSwipeStart} onTouchEnd={handleSwipeEnd}>
            {/* 地域フィルターインジケーター */}
            {filterActive && (
              <div className="flex-shrink-0 flex items-center gap-2 px-4 py-1.5 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
                <span className="text-[11px] text-label-tertiary">絞り込み：</span>
                <span className="text-[11px] px-2 py-0.5 rounded-full border" style={{ borderColor: 'var(--accent-color)', color: 'var(--accent-color)' }}>{filterLabel}</span>
                <button onClick={() => { setFilterMode('none'); setFilterValue(null); setIncludeAdjacent(false); }} className="text-[11px] text-label-tertiary underline active:opacity-60">解除</button>
              </div>
            )}
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

              {/* 日付グリッド（複数日バーはオーバーレイで描画） */}
              <div className="relative flex-1 overflow-hidden">
                {/* 複数日イベントオーバーレイ: 週行ごとにコンテナを分けて overflow:hidden で行境界内にクリップ。
                    グリッドが縮んでも固定px値のバーが隣行にはみ出さない。 */}
                <div className="absolute inset-0 pointer-events-none">
                  {[0, 1, 2, 3, 4, 5].map(weekRow => {
                    const rowSegs = multiDayOverlaySegments.filter(s => s.weekRow === weekRow);
                    if (rowSegs.length === 0) return null;
                    return (
                      <div
                        key={weekRow}
                        className="absolute overflow-hidden"
                        style={{
                          top: `calc(${weekRow} / 6 * 100%)`,
                          height: `calc(100% / 6)`,
                          left: 0,
                          right: 0,
                        }}
                      >
                        {rowSegs.map(seg => (
                          <div
                            key={seg.key}
                            className="absolute flex items-center overflow-hidden"
                            style={{
                              top: `calc(31px + ${seg.slotIndex} * 11px)`,
                              left: `calc(${seg.startCol} / 7 * 100%)`,
                              width: `calc(${seg.endCol - seg.startCol + 1} / 7 * 100%)`,
                              height: '10px',
                              background: seg.color.startsWith('#') ? seg.color + '28' : 'rgba(128,128,128,0.18)',
                              borderTopLeftRadius:    seg.isFirstSegment ? '3px' : '0',
                              borderBottomLeftRadius: seg.isFirstSegment ? '3px' : '0',
                              borderTopRightRadius:    seg.isLastSegment  ? '3px' : '0',
                              borderBottomRightRadius: seg.isLastSegment  ? '3px' : '0',
                            }}
                          >
                            {seg.isFirstSegment && (
                              seg.important ? (
                                <span className="text-[8px] leading-none flex-shrink-0 ml-[2px]" style={{ color: '#f59e0b' }}>★</span>
                              ) : (
                                <div className="w-[4px] h-[4px] rounded-full flex-shrink-0 ml-[2px]" style={{ backgroundColor: seg.dotColor.startsWith('#') ? seg.dotColor : '#888' }} />
                              )
                            )}
                            {seg.isFirstSegment && (
                              <span className="text-[8px] leading-none truncate ml-[2px]" style={{ color: seg.color }}>
                                {seg.title}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>

                {/* グリッドセル: zIndex:1 で stacking context を生成し overlay より上に描画 */}
                <div
                  className="relative grid grid-cols-7 h-full"
                  style={{
                    gridTemplateRows: 'repeat(6, 1fr)',
                    borderTop: '1px solid var(--cal-grid-color)',
                    borderLeft: '1px solid var(--cal-grid-color)',
                    zIndex: 1,
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
                        {(() => {
                          // オーバーレイが予約するスロット数（週行内のslotIndex順に確保）
                          const oSlots = Math.min(overlaySlotCountByDate.get(dateStr) ?? 0, 3);
                          const singleItems = cellItems.filter(i => !i.position);
                          const maxSingle = 3 - oSlots;
                          const visibleSingle = singleItems.slice(0, maxSingle);
                          const hiddenCount = singleItems.length - visibleSingle.length;
                          const hasAny = oSlots > 0 || singleItems.length > 0;
                          if (!hasAny) return <div className="h-[6px]" />;
                          return (
                            <div className="w-full px-[2px] flex flex-col gap-[1px] mt-[1px]">
                              {/* 複数日バー用プレースホルダー（オーバーレイのslotIndexと一致させる空白） */}
                              {Array.from({ length: oSlots }, (_, i) => (
                                <div key={`ph-${i}`} style={{ height: '10px' }} />
                              ))}
                              {/* 単日イベントタイル */}
                              {visibleSingle.map(item => (
                                <div
                                  key={item.eventId}
                                  className="flex items-center gap-[2px] w-full rounded-[2px] px-[2px] py-[1px]"
                                  style={{ background: item.color.startsWith('#') ? item.color + '28' : 'rgba(128,128,128,0.18)' }}
                                >
                                  {item.important ? (
                                    <span className="text-[8px] leading-none flex-shrink-0" style={{ color: '#f59e0b' }}>★</span>
                                  ) : (
                                    <div className="w-[4px] h-[4px] rounded-full flex-shrink-0" style={{ backgroundColor: item.dotColor.startsWith('#') ? item.dotColor : '#888' }} />
                                  )}
                                  <span className="text-[8px] leading-none truncate" style={{ color: item.color }}>{item.title}</span>
                                </div>
                              ))}
                              {hiddenCount > 0 && (
                                <div className="text-[8px] text-center leading-none py-[1px]" style={{ color: 'var(--label-tertiary)' }}>
                                  +{hiddenCount}
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </button>
                    );
                  })}
                </div>
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
                  onClick={() => { setSheetOpen(v => !v); setSheetDetailEvent(null); setOpenReactionPickerId(null); }}
                >
                  <div className="w-10 h-1 rounded-full mb-2" style={{ backgroundColor: 'var(--border-subtle)' }} />
                  <div className="w-full px-4 flex items-center justify-between">
                    <p className="text-label-primary text-sm font-semibold">{selectedDateLabel}</p>
                    <div className="flex items-center gap-2">
                      {sheetEventCount > 0 && <span className="text-label-tertiary text-xs">{sheetEventCount}件</span>}
                      {sheetOpen && !postPanelOpen && !sheetDetailEvent && (
                        <button
                          onClick={e => { e.stopPropagation(); openPostForm(selectedDate); }}
                          className="w-7 h-7 flex items-center justify-center rounded-full bg-label-primary text-bg-primary active:opacity-70"
                          aria-label="予定を追加"
                        >
                          <Plus size={15} strokeWidth={2.5} />
                        </button>
                      )}
                      <ChevronDown size={16} className="text-label-tertiary transition-transform duration-300" style={{ transform: sheetOpen ? 'rotate(180deg)' : 'none' }} />
                    </div>
                  </div>
                </div>
                {/* イベントリスト / 詳細 */}
                <div className="flex-1 overflow-y-auto px-4 pb-4">
                  {sheetDetailEvent ? (
                    <div className="flex flex-col gap-3">
                      <button
                        onClick={() => setSheetDetailEvent(null)}
                        className="flex items-center gap-1 text-xs text-label-secondary active:opacity-60 -ml-1"
                      >
                        <ChevronLeft size={14} />一覧に戻る
                      </button>
                      {/* バッジ */}
                      {(sheetDetailEvent.workName || sheetDetailEvent.category) && (
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {sheetDetailEvent.workName && (
                          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full"
                            style={{ color: workColorMap.get(sheetDetailEvent.workId ?? '') ?? 'var(--label-tertiary)', backgroundColor: `${workColorMap.get(sheetDetailEvent.workId ?? '') ?? '#888888'}20` }}>
                            {sheetDetailEvent.workName}
                          </span>
                        )}
                          {sheetDetailEvent.category && <span className="text-[10px] text-label-tertiary bg-bg-secondary rounded-full px-2 py-0.5">{sheetDetailEvent.category}</span>}
                        </div>
                      )}
                      {/* タイトル */}
                      <p className="text-label-primary font-bold text-[15px] leading-snug line-clamp-1">{sheetDetailEvent.title}</p>
                      {/* 日付・時間 */}
                      {(formatDateRange(sheetDetailEvent.date, sheetDetailEvent.endDate) || formatTimeRange(sheetDetailEvent.time, sheetDetailEvent.endTime)) && (
                        <div className="flex items-center gap-2 -mt-1">
                          {formatDateRange(sheetDetailEvent.date, sheetDetailEvent.endDate) && (
                            <span className="text-label-secondary text-xs">{formatDateRange(sheetDetailEvent.date, sheetDetailEvent.endDate)}</span>
                          )}
                          {formatTimeRange(sheetDetailEvent.time, sheetDetailEvent.endTime) && (
                            <span className="text-label-secondary text-sm font-medium">{formatTimeRange(sheetDetailEvent.time, sheetDetailEvent.endTime)}</span>
                          )}
                        </div>
                      )}
                      {/* 都道府県・場所 */}
                      {sheetDetailEvent.prefecture && (
                        <div className="flex flex-col gap-1">
                          <span className="text-[10px] text-label-tertiary bg-bg-secondary rounded-full px-2 py-0.5 w-fit">{sheetDetailEvent.prefecture}</span>
                          {sheetDetailEvent.locationDetail && <p className="text-xs text-label-secondary">{sheetDetailEvent.locationDetail}</p>}
                          {sheetDetailEvent.locationMapLink && (
                            <a href={sheetDetailEvent.locationMapLink} target="_blank" rel="noopener noreferrer"
                              className="flex items-center gap-1 text-xs active:opacity-60 w-fit" style={{ color: 'var(--accent-color)' }}>
                              <ExternalLink size={11} />地図を開く
                            </a>
                          )}
                        </div>
                      )}
                      {/* メモ（❤️の前） */}
                      {sheetDetailEvent.memo && <p className="text-label-secondary text-sm leading-relaxed">{sheetDetailEvent.memo}</p>}
                      {/* リンク */}
                      {parseLinks(sheetDetailEvent.link).map((url, i) => (
                        <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-1 px-3 py-1.5 rounded-full border border-default text-label-secondary text-xs w-fit active:opacity-60">
                          <ExternalLink size={11} /><span>{getDomain(url)}</span>
                        </a>
                      ))}
                      {/* ❤️いいね + 😊リアクション + ★重要 */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          onClick={() => handleSheetEventLike(sheetDetailEvent.id)}
                          disabled={!user || lockedLikeIds.has(sheetDetailEvent.id)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-sm disabled:opacity-40"
                          style={{
                            borderColor: sheetDetailEvent.likedByMe ? 'rgb(248,113,113)' : 'var(--border-default)',
                            color: sheetDetailEvent.likedByMe ? 'rgb(248,113,113)' : 'var(--label-secondary)',
                          }}
                        >
                          <Heart size={14} style={{ fill: sheetDetailEvent.likedByMe ? 'rgb(248,113,113)' : 'none', color: sheetDetailEvent.likedByMe ? 'rgb(248,113,113)' : 'var(--label-secondary)' }} />
                          <span>{sheetDetailEvent.likes.toLocaleString('ja-JP')}</span>
                        </button>
                        <button
                          onClick={() => setOpenReactionPickerId(prev => prev === sheetDetailEvent.id ? null : sheetDetailEvent.id)}
                          className="flex items-center justify-center px-3 py-1.5 rounded-xl border text-sm active:opacity-60"
                          style={{
                            borderColor: (sheetDetailReactionData?.myReaction ?? myReactions[sheetDetailEvent.id]) ? 'var(--accent-color)' : 'var(--border-default)',
                            color: (sheetDetailReactionData?.myReaction ?? myReactions[sheetDetailEvent.id]) ? 'var(--accent-color)' : 'var(--label-secondary)',
                            minWidth: '2.5rem',
                          }}
                        >
                          {(sheetDetailReactionData?.myReaction ?? myReactions[sheetDetailEvent.id])
                            ? <span className="text-base leading-none">{REACTIONS.find(r => r.type === (sheetDetailReactionData?.myReaction ?? myReactions[sheetDetailEvent.id]))?.emoji}</span>
                            : <Smile size={14} />
                          }
                        </button>
                        {/* ★ 重要トグル */}
                        <button
                          onClick={() => setImportantEventIds(toggleImportantEventId(sheetDetailEvent.id))}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-sm active:opacity-60"
                          style={{
                            borderColor: importantEventIds.has(sheetDetailEvent.id) ? '#f59e0b' : 'var(--border-default)',
                            color: importantEventIds.has(sheetDetailEvent.id) ? '#f59e0b' : 'var(--label-secondary)',
                          }}
                        >
                          <Star size={14} style={{ fill: importantEventIds.has(sheetDetailEvent.id) ? '#f59e0b' : 'none' }} />
                          {importantEventIds.has(sheetDetailEvent.id) ? '重要' : '重要に設定'}
                        </button>
                      </div>
                      {/* リアクション集計 */}
                      {sheetDetailReactionData && Object.values(sheetDetailReactionData.counts).some(c => c > 0) && (
                        <div className="flex items-center gap-3 flex-wrap">
                          {REACTIONS.filter(r => (sheetDetailReactionData.counts[r.type] ?? 0) > 0).map(r => (
                            <span key={r.type} className="flex items-center gap-0.5 text-label-secondary">
                              <span className="text-base leading-none">{r.emoji}</span>
                              <span className="text-xs">{sheetDetailReactionData.counts[r.type]}</span>
                            </span>
                          ))}
                        </div>
                      )}
                      {/* by + 編集（最下行） */}
                      {(sheetDetailEvent.authorName || (sheetDetailEvent.authorId && user && sheetDetailEvent.authorId === user.id)) && (
                        <div className="flex items-center justify-between">
                          {sheetDetailEvent.authorName && (
                            <p className="text-label-tertiary text-xs">by {sheetDetailEvent.authorName}</p>
                          )}
                          {sheetDetailEvent.authorId && user && sheetDetailEvent.authorId === user.id && (
                            <button
                              onClick={() => openEditEvent(sheetDetailEvent)}
                              className="flex items-center gap-1 text-xs active:opacity-60 ml-auto"
                              style={{ color: 'var(--accent-color)' }}
                            >
                              <Pencil size={12} />編集
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  ) : loading ? (
                    <div className="flex flex-col gap-2">{[1, 2].map(i => <div key={i} className="h-14 bg-bg-secondary rounded-xl animate-pulse" />)}</div>
                  ) : workId ? (
                    sheetWorkEvents.length === 0 ? (
                      <p className="text-center text-label-tertiary text-sm py-6">この日の予定はありません</p>
                    ) : (
                      <div className="flex flex-col gap-2">
                        {sheetWorkEvents.map(event => {
                          const dateLabel = formatDateRange(event.date, event.endDate);
                          const timeLabel = formatTimeRange(event.time, event.endTime);
                          const catColor = getCategoryColor(event.category);
                          return (
                            <div key={event.id} className="w-full bg-bg-secondary select-none ds-panel rounded-sm"
                              style={{ borderLeft: catColor ? `3px solid ${catColor}` : undefined, borderRight: importantEventIds.has(event.id) ? '3px solid #f59e0b' : undefined }}
                              onTouchStart={() => startLongPress(() => handleFullDelete(event.id, event.title))}
                              onTouchEnd={cancelLongPress} onTouchCancel={cancelLongPress} onTouchMove={cancelLongPress}
                              onMouseDown={() => startLongPress(() => handleFullDelete(event.id, event.title))}
                              onMouseUp={cancelLongPress} onMouseLeave={cancelLongPress}
                            >
                              {/* 1行目: タイトル */}
                              <button onClick={() => setSheetDetailEvent(event)}
                                className="w-full px-3 pt-3 pb-1 text-left active:opacity-70 transition-opacity">
                                <div className="flex items-center gap-1">
                                  {importantEventIds.has(event.id) && <span className="text-[11px] leading-none flex-shrink-0" style={{ color: '#f59e0b' }}>★</span>}
                                  <p className="text-label-primary text-sm font-medium truncate">{event.title}</p>
                                </div>
                              </button>
                              {/* 2行目: カテゴリ → 地域 → ♥ → 😊 → 🔗 → > → × */}
                              <div className="flex items-center px-3 pb-2 gap-1">
                                {event.category && <span className="text-[10px] text-label-tertiary bg-bg-primary rounded-full px-2 py-0.5">{event.category}</span>}
                                {event.prefecture && <span className="text-[10px] text-label-tertiary bg-bg-primary rounded-full px-2 py-0.5">{event.prefecture}</span>}
                                <div className="flex-1" />
                                <button
                                  onClick={e => { e.stopPropagation(); handleSheetEventLike(event.id); }}
                                  disabled={!user || lockedLikeIds.has(event.id)}
                                  className="flex items-center gap-0.5 px-2 h-7 text-xs disabled:opacity-30"
                                  style={{ color: event.likedByMe ? 'rgb(248,113,113)' : 'var(--label-tertiary)' }}
                                >
                                  <Heart size={12} style={{ fill: event.likedByMe ? 'rgb(248,113,113)' : 'none' }} />
                                  <span>{event.likes}</span>
                                </button>
                                <button
                                  onClick={e => { e.stopPropagation(); setOpenReactionPickerId(prev => prev === event.id ? null : event.id); }}
                                  className="px-1.5 h-7 flex items-center active:opacity-60"
                                  style={{ color: myReactions[event.id] ? 'var(--accent-color)' : 'var(--label-tertiary)', opacity: myReactions[event.id] ? 1 : 0.5 }}
                                >
                                  {myReactions[event.id]
                                    ? <span className="text-sm leading-none">{REACTIONS.find(r => r.type === myReactions[event.id])?.emoji}</span>
                                    : <Smile size={14} />
                                  }
                                </button>
                                {parseLinks(event.link).length === 1 ? (
                                  <a href={parseLinks(event.link)[0]} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                                    className="px-1 h-7 flex items-center active:opacity-60 text-label-tertiary">
                                    <ExternalLink size={12} />
                                  </a>
                                ) : parseLinks(event.link).length > 1 ? (
                                  <button onClick={e => { e.stopPropagation(); setLinkPickerLinks(parseLinks(event.link)); }}
                                    className="px-1 h-7 flex items-center active:opacity-60 text-label-tertiary">
                                    <ExternalLink size={12} />
                                  </button>
                                ) : null}
                                {event.authorId && user && event.authorId === user.id && (
                                  <button
                                    onClick={e => { e.stopPropagation(); openEditEvent(event); }}
                                    className="px-1 h-7 flex items-center active:opacity-60"
                                    style={{ color: 'var(--accent-color)' }}
                                  >
                                    <Pencil size={13} />
                                  </button>
                                )}
                                <button onClick={() => handleHideEvent(event.id)} className="w-8 h-7 flex items-center justify-center text-label-tertiary active:text-red-400">
                                  <X size={14} />
                                </button>
                              </div>
                              {/* 3行目: 日付範囲・時間（どちらかあれば表示） */}
                              {(dateLabel || timeLabel) && (
                                <div className="flex items-center gap-2 px-3 pb-2 -mt-1">
                                  {dateLabel && <span className="text-label-tertiary text-xs">{dateLabel}</span>}
                                  {timeLabel && <span className="text-label-tertiary text-xs">{timeLabel}</span>}
                                </div>
                              )}
                              {event.authorName && (
                                <div className="px-3 pb-2 -mt-1">
                                  <span className="text-[10px] text-label-tertiary">by {event.authorName}</span>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )
                  ) : (
                    sheetWorkEvents.length === 0 && sheetPersonalEvents.length === 0 ? (
                      <p className="text-center text-label-tertiary text-sm py-6">この日の予定はありません</p>
                    ) : (
                      <div className="flex flex-col gap-2">
                        {sheetWorkEvents.map(event => {
                          const dateLabel = formatDateRange(event.date, event.endDate);
                          const timeLabel = formatTimeRange(event.time, event.endTime);
                          const catColor = getCategoryColor(event.category);
                          return (
                            <div key={event.id} className="w-full bg-bg-secondary select-none ds-panel rounded-sm"
                              style={{ borderLeft: catColor ? `3px solid ${catColor}` : undefined, borderRight: importantEventIds.has(event.id) ? '3px solid #f59e0b' : undefined }}
                              onTouchStart={() => startLongPress(() => handleFullDelete(event.id, event.title))}
                              onTouchEnd={cancelLongPress} onTouchCancel={cancelLongPress} onTouchMove={cancelLongPress}
                              onMouseDown={() => startLongPress(() => handleFullDelete(event.id, event.title))}
                              onMouseUp={cancelLongPress} onMouseLeave={cancelLongPress}
                            >
                              {/* 1行目: タイトル */}
                              <button onClick={() => event.workId && setSheetDetailEvent(event)}
                                className="w-full px-3 pt-3 pb-1 text-left active:opacity-70 transition-opacity">
                                <div className="flex items-center gap-1">
                                  {importantEventIds.has(event.id) && <span className="text-[11px] leading-none flex-shrink-0" style={{ color: '#f59e0b' }}>★</span>}
                                  <p className="text-label-primary text-sm font-medium truncate">{event.title}</p>
                                </div>
                              </button>
                              {/* 2行目: 作品名 → カテゴリ → 地域 → ♥ → 😊 → 🔗 → > → × */}
                              <div className="flex items-center px-3 pb-2 gap-1">
                                {event.workName && <span className="text-[10px] font-medium px-2 py-0.5 rounded-full max-w-[72px] truncate"
                                  style={{ color: workColorMap.get(event.workId ?? '') ?? 'var(--label-tertiary)', backgroundColor: `${workColorMap.get(event.workId ?? '') ?? '#888888'}20` }}>
                                  {event.workName}
                                </span>}
                                {event.category && <span className="text-[10px] text-label-tertiary bg-bg-primary rounded-full px-2 py-0.5">{event.category}</span>}
                                {event.prefecture && <span className="text-[10px] text-label-tertiary bg-bg-primary rounded-full px-2 py-0.5">{event.prefecture}</span>}
                                <div className="flex-1" />
                                <button
                                  onClick={e => { e.stopPropagation(); handleSheetEventLike(event.id); }}
                                  disabled={!user || lockedLikeIds.has(event.id)}
                                  className="flex items-center gap-0.5 px-2 h-7 text-xs disabled:opacity-30"
                                  style={{ color: event.likedByMe ? 'rgb(248,113,113)' : 'var(--label-tertiary)' }}
                                >
                                  <Heart size={12} style={{ fill: event.likedByMe ? 'rgb(248,113,113)' : 'none' }} />
                                  <span>{event.likes}</span>
                                </button>
                                <button
                                  onClick={e => { e.stopPropagation(); setOpenReactionPickerId(prev => prev === event.id ? null : event.id); }}
                                  className="px-1.5 h-7 flex items-center active:opacity-60"
                                  style={{ color: myReactions[event.id] ? 'var(--accent-color)' : 'var(--label-tertiary)', opacity: myReactions[event.id] ? 1 : 0.5 }}
                                >
                                  {myReactions[event.id]
                                    ? <span className="text-sm leading-none">{REACTIONS.find(r => r.type === myReactions[event.id])?.emoji}</span>
                                    : <Smile size={14} />
                                  }
                                </button>
                                {parseLinks(event.link).length === 1 ? (
                                  <a href={parseLinks(event.link)[0]} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                                    className="px-1 h-7 flex items-center active:opacity-60 text-label-tertiary">
                                    <ExternalLink size={12} />
                                  </a>
                                ) : parseLinks(event.link).length > 1 ? (
                                  <button onClick={e => { e.stopPropagation(); setLinkPickerLinks(parseLinks(event.link)); }}
                                    className="px-1 h-7 flex items-center active:opacity-60 text-label-tertiary">
                                    <ExternalLink size={12} />
                                  </button>
                                ) : null}
                                {event.authorId && user && event.authorId === user.id && (
                                  <button
                                    onClick={e => { e.stopPropagation(); openEditEvent(event); }}
                                    className="px-1 h-7 flex items-center active:opacity-60"
                                    style={{ color: 'var(--accent-color)' }}
                                  >
                                    <Pencil size={13} />
                                  </button>
                                )}
                                <button onClick={() => handleHideEvent(event.id)} className="w-8 h-7 flex items-center justify-center text-label-tertiary active:text-red-400">
                                  <X size={14} />
                                </button>
                              </div>
                              {/* 3行目: 日付範囲・時間（どちらかあれば表示） */}
                              {(dateLabel || timeLabel) && (
                                <div className="flex items-center gap-2 px-3 pb-2 -mt-1">
                                  {dateLabel && <span className="text-label-tertiary text-xs">{dateLabel}</span>}
                                  {timeLabel && <span className="text-label-tertiary text-xs">{timeLabel}</span>}
                                </div>
                              )}
                              {event.authorName && (
                                <div className="px-3 pb-2 -mt-1">
                                  <span className="text-[10px] text-label-tertiary">by {event.authorName}</span>
                                </div>
                              )}
                            </div>
                          );
                        })}
                        {sheetPersonalEvents.map(pe => {
                          const dateLabel = formatDateRange(pe.date, pe.endDate);
                          const timeLabel = formatTimeRange(pe.time, pe.endTime);
                          const catColor = getCategoryColor(pe.category);
                          return (
                            <div key={pe.id} className="w-full bg-bg-secondary select-none ds-panel rounded-sm"
                              style={{ borderLeft: catColor ? `3px solid ${catColor}` : undefined, borderRight: importantEventIds.has(pe.id) ? '3px solid #f59e0b' : undefined }}
                              onTouchStart={() => startLongPress(() => handleFullDeletePersonal(pe.id, pe.title))}
                              onTouchEnd={cancelLongPress} onTouchCancel={cancelLongPress} onTouchMove={cancelLongPress}
                              onMouseDown={() => startLongPress(() => handleFullDeletePersonal(pe.id, pe.title))}
                              onMouseUp={cancelLongPress} onMouseLeave={cancelLongPress}
                            >
                              {/* 1行目: タイトル */}
                              <div className="px-3 pt-3 pb-1">
                                <div className="flex items-center gap-1">
                                  {importantEventIds.has(pe.id) && <span className="text-[11px] leading-none flex-shrink-0" style={{ color: '#f59e0b' }}>★</span>}
                                  <p className="text-label-primary text-sm font-medium truncate">{pe.title}</p>
                                </div>
                              </div>
                              {/* 2行目: 個人 → カテゴリ → 地域 → × */}
                              <div className="flex items-center px-3 pb-2 gap-1">
                                <span className="text-[10px] text-label-tertiary bg-bg-primary rounded-full px-2 py-0.5">個人</span>
                                {pe.category && <span className="text-[10px] text-label-tertiary bg-bg-primary rounded-full px-2 py-0.5">{pe.category}</span>}
                                {pe.prefecture && <span className="text-[10px] text-label-tertiary bg-bg-primary rounded-full px-2 py-0.5">{pe.prefecture}</span>}
                                <div className="flex-1" />
                                <button onClick={() => deletePersonalEvent(pe.id)} className="w-8 h-7 flex items-center justify-center text-label-tertiary active:text-red-400">
                                  <X size={14} />
                                </button>
                              </div>
                              {/* 3行目: 日付範囲・時間 */}
                              {(dateLabel || timeLabel) && (
                                <div className="flex items-center gap-2 px-3 pb-2 -mt-1">
                                  {dateLabel && <span className="text-label-tertiary text-xs">{dateLabel}</span>}
                                  {timeLabel && <span className="text-label-tertiary text-xs">{timeLabel}</span>}
                                </div>
                              )}
                              {pe.memo && <p className="text-label-secondary text-xs px-3 pb-2 truncate">{pe.memo}</p>}
                            </div>
                          );
                        })}
                      </div>
                    )
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* ─── 予定一覧ビュー ─── */
          <div className="flex-1 overflow-y-auto px-4 pt-3 pb-24"
            onTouchStart={handleSwipeStart} onTouchEnd={handleSwipeEnd}>
          {listDetailEvent ? (
            /* 予定詳細 */
            <div className="flex flex-col gap-3">
              <button
                onClick={() => setListDetailEvent(null)}
                className="flex items-center gap-1 text-xs text-label-secondary active:opacity-60 -ml-1"
              >
                <ChevronLeft size={14} />一覧に戻る
              </button>
              {/* バッジ */}
              {(listDetailEvent.workName || listDetailEvent.category) && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  {listDetailEvent.workName && (
              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full"
                style={{ color: workColorMap.get(listDetailEvent.workId ?? '') ?? 'var(--label-tertiary)', backgroundColor: `${workColorMap.get(listDetailEvent.workId ?? '') ?? '#888888'}20` }}>
                {listDetailEvent.workName}
              </span>
            )}
                  {listDetailEvent.category && <span className="text-[10px] text-label-tertiary bg-bg-secondary rounded-full px-2 py-0.5">{listDetailEvent.category}</span>}
                </div>
              )}
              {/* タイトル */}
              <p className="text-label-primary font-bold text-[15px] leading-snug line-clamp-1">{listDetailEvent.title}</p>
              {/* 日付・時間 */}
              {(formatDateRange(listDetailEvent.date, listDetailEvent.endDate) || formatTimeRange(listDetailEvent.time, listDetailEvent.endTime)) && (
                <div className="flex items-center gap-2 -mt-1">
                  {formatDateRange(listDetailEvent.date, listDetailEvent.endDate) && (
                    <span className="text-label-secondary text-xs">{formatDateRange(listDetailEvent.date, listDetailEvent.endDate)}</span>
                  )}
                  {formatTimeRange(listDetailEvent.time, listDetailEvent.endTime) && (
                    <span className="text-label-secondary text-sm font-medium">{formatTimeRange(listDetailEvent.time, listDetailEvent.endTime)}</span>
                  )}
                </div>
              )}
              {/* 都道府県・場所 */}
              {listDetailEvent.prefecture && (
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] text-label-tertiary bg-bg-secondary rounded-full px-2 py-0.5 w-fit">{listDetailEvent.prefecture}</span>
                  {listDetailEvent.locationDetail && <p className="text-xs text-label-secondary">{listDetailEvent.locationDetail}</p>}
                  {listDetailEvent.locationMapLink && (
                    <a href={listDetailEvent.locationMapLink} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs active:opacity-60 w-fit" style={{ color: 'var(--accent-color)' }}>
                      <ExternalLink size={11} />地図を開く
                    </a>
                  )}
                </div>
              )}
              {/* メモ（❤️の前） */}
              {listDetailEvent.memo && <p className="text-label-secondary text-sm leading-relaxed">{listDetailEvent.memo}</p>}
              {/* リンク */}
              {parseLinks(listDetailEvent.link).map((url, i) => (
                <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 px-3 py-1.5 rounded-full border border-default text-label-secondary text-xs w-fit active:opacity-60">
                  <ExternalLink size={11} /><span>{getDomain(url)}</span>
                </a>
              ))}
              {/* ❤️いいね + 😊リアクション + ★重要 */}
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => handleSheetEventLike(listDetailEvent.id)}
                  disabled={!user || lockedLikeIds.has(listDetailEvent.id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-sm disabled:opacity-40"
                  style={{
                    borderColor: listDetailEvent.likedByMe ? 'rgb(248,113,113)' : 'var(--border-default)',
                    color: listDetailEvent.likedByMe ? 'rgb(248,113,113)' : 'var(--label-secondary)',
                  }}
                >
                  <Heart size={14} style={{ fill: listDetailEvent.likedByMe ? 'rgb(248,113,113)' : 'none', color: listDetailEvent.likedByMe ? 'rgb(248,113,113)' : 'var(--label-secondary)' }} />
                  <span>{listDetailEvent.likes.toLocaleString('ja-JP')}</span>
                </button>
                <button
                  onClick={() => setOpenReactionPickerId(prev => prev === listDetailEvent.id ? null : listDetailEvent.id)}
                  className="flex items-center justify-center px-3 py-1.5 rounded-xl border text-sm active:opacity-60"
                  style={{
                    borderColor: (sheetDetailReactionData?.myReaction ?? myReactions[listDetailEvent.id]) ? 'var(--accent-color)' : 'var(--border-default)',
                    color: (sheetDetailReactionData?.myReaction ?? myReactions[listDetailEvent.id]) ? 'var(--accent-color)' : 'var(--label-secondary)',
                    minWidth: '2.5rem',
                  }}
                >
                  {(sheetDetailReactionData?.myReaction ?? myReactions[listDetailEvent.id])
                    ? <span className="text-base leading-none">{REACTIONS.find(r => r.type === (sheetDetailReactionData?.myReaction ?? myReactions[listDetailEvent.id]))?.emoji}</span>
                    : <Smile size={14} />
                  }
                </button>
              {/* ★ 重要トグル */}
              <button
                onClick={() => setImportantEventIds(toggleImportantEventId(listDetailEvent.id))}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-sm active:opacity-60"
                style={{
                  borderColor: importantEventIds.has(listDetailEvent.id) ? '#f59e0b' : 'var(--border-default)',
                  color: importantEventIds.has(listDetailEvent.id) ? '#f59e0b' : 'var(--label-secondary)',
                }}
              >
                <Star size={14} style={{ fill: importantEventIds.has(listDetailEvent.id) ? '#f59e0b' : 'none' }} />
                {importantEventIds.has(listDetailEvent.id) ? '重要' : '重要に設定'}
              </button>
              </div>
              {/* リアクション集計 */}
              {sheetDetailReactionData && Object.values(sheetDetailReactionData.counts).some(c => c > 0) && (
                <div className="flex items-center gap-3 flex-wrap">
                  {REACTIONS.filter(r => (sheetDetailReactionData.counts[r.type] ?? 0) > 0).map(r => (
                    <span key={r.type} className="flex items-center gap-0.5 text-label-secondary">
                      <span className="text-base leading-none">{r.emoji}</span>
                      <span className="text-xs">{sheetDetailReactionData.counts[r.type]}</span>
                    </span>
                  ))}
                </div>
              )}
              {/* by + 編集（最下行） */}
              {(listDetailEvent.authorName || (listDetailEvent.authorId && user && listDetailEvent.authorId === user.id)) && (
                <div className="flex items-center justify-between">
                  {listDetailEvent.authorName && (
                    <p className="text-label-tertiary text-xs">by {listDetailEvent.authorName}</p>
                  )}
                  {listDetailEvent.authorId && user && listDetailEvent.authorId === user.id && (
                    <button
                      onClick={() => openEditEvent(listDetailEvent)}
                      className="flex items-center gap-1 text-xs active:opacity-60 ml-auto"
                      style={{ color: 'var(--accent-color)' }}
                    >
                      <Pencil size={12} />編集
                    </button>
                  )}
                </div>
              )}
            </div>
          ) : (
            <><p className="text-label-secondary text-xs px-1" style={{ marginBottom: filterActive ? 4 : 12 }}>今月の予定</p>
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
                    const catColor = getCategoryColor(event.category);
                    return (
                      <div key={event.id} className="w-full flex items-center bg-bg-secondary overflow-hidden select-none ds-panel rounded-sm"
                        style={{ borderLeft: catColor ? `3px solid ${catColor}` : undefined, borderRight: importantEventIds.has(event.id) ? '3px solid #f59e0b' : undefined }}
                        onTouchStart={() => startLongPress(() => handleFullDelete(event.id, event.title))}
                        onTouchEnd={cancelLongPress} onTouchCancel={cancelLongPress} onTouchMove={cancelLongPress}
                        onMouseDown={() => startLongPress(() => handleFullDelete(event.id, event.title))}
                        onMouseUp={cancelLongPress} onMouseLeave={cancelLongPress}
                      >
                        <button onClick={() => setListDetailEvent(event)}
                          className="flex-1 flex items-center gap-3 pl-3 py-3 pr-1 text-left active:opacity-70 transition-opacity min-w-0">
                          <div className="flex-shrink-0 w-10 flex flex-col items-center">
                            <span className="text-[10px] text-label-tertiary leading-none">{em}月</span>
                            <span className="text-xl font-bold text-label-primary leading-snug">{ed}</span>
                          </div>
                          <div className="w-px h-8 bg-white/10 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-label-primary text-sm font-medium leading-snug">{event.title}</p>
                            {event.prefecture && (
                              <div className="flex items-center mt-1">
                                <span className="text-[10px] text-label-tertiary bg-bg-primary rounded-full px-2 py-0.5">{event.prefecture}</span>
                              </div>
                            )}
                            {event.authorName && <p className="text-[10px] text-label-tertiary mt-0.5">by {event.authorName}</p>}
                          </div>
                        </button>
                        <button
                          onClick={e => { e.stopPropagation(); handleSheetEventLike(event.id); }}
                          disabled={!user || lockedLikeIds.has(event.id)}
                          className="flex items-center gap-0.5 px-2 self-stretch text-xs disabled:opacity-30"
                          style={{ color: event.likedByMe ? 'rgb(248,113,113)' : 'var(--label-tertiary)' }}
                        >
                          <Heart size={12} style={{ fill: event.likedByMe ? 'rgb(248,113,113)' : 'none' }} />
                          <span>{event.likes}</span>
                        </button>
                        <button
                          onClick={e => { e.stopPropagation(); setOpenReactionPickerId(prev => prev === event.id ? null : event.id); }}
                          className="px-1.5 self-stretch flex items-center text-base leading-none active:opacity-60"
                          style={{ color: myReactions[event.id] ? 'var(--accent-color)' : 'var(--label-tertiary)', opacity: myReactions[event.id] ? 1 : 0.5 }}
                        >
                          {myReactions[event.id]
                            ? <span className="text-sm leading-none">{REACTIONS.find(r => r.type === myReactions[event.id])?.emoji}</span>
                            : <Smile size={14} />
                          }
                        </button>
                        {parseLinks(event.link).length === 1 ? (
                          <a href={parseLinks(event.link)[0]} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                            className="w-8 self-stretch flex items-center justify-center text-label-tertiary active:opacity-60 flex-shrink-0">
                            <ExternalLink size={13} />
                          </a>
                        ) : parseLinks(event.link).length > 1 ? (
                          <button onClick={e => { e.stopPropagation(); setLinkPickerLinks(parseLinks(event.link)); }}
                            className="w-8 self-stretch flex items-center justify-center text-label-tertiary active:opacity-60 flex-shrink-0">
                            <ExternalLink size={13} />
                          </button>
                        ) : null}
                        {event.authorId && user && event.authorId === user.id && (
                          <button
                            onClick={e => { e.stopPropagation(); openEditEvent(event); }}
                            className="w-9 self-stretch flex items-center justify-center active:opacity-60 flex-shrink-0"
                            style={{ color: 'var(--accent-color)' }}
                          >
                            <Pencil size={13} />
                          </button>
                        )}
                        <button onClick={() => handleHideEvent(event.id)} className="w-9 self-stretch flex items-center justify-center text-label-tertiary active:text-red-400 flex-shrink-0">
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
                  {participatedWorks.length === 0
                    ? 'まだ作品に参加していません'
                    : '発見タブで❤️した予定がここに表示されます'}
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  {myCalendarListItems.map(item => {
                    const [, im, id] = item.date.split('-').map(Number);
                    const catColor = getCategoryColor(item.category);
                    return (
                      <div key={item.id} className="w-full flex items-center bg-bg-secondary overflow-hidden select-none ds-panel rounded-sm"
                        style={{ borderLeft: catColor ? `3px solid ${catColor}` : undefined, borderRight: importantEventIds.has(item.id) ? '3px solid #f59e0b' : undefined }}
                        onTouchStart={() => startLongPress(() => item.isPersonal ? handleFullDeletePersonal(item.id, item.title) : handleFullDelete(item.id, item.title))}
                        onTouchEnd={cancelLongPress} onTouchCancel={cancelLongPress} onTouchMove={cancelLongPress}
                        onMouseDown={() => startLongPress(() => item.isPersonal ? handleFullDeletePersonal(item.id, item.title) : handleFullDelete(item.id, item.title))}
                        onMouseUp={cancelLongPress} onMouseLeave={cancelLongPress}
                      >
                        <button
                          onClick={() => {
                            if (!item.isPersonal && item.workId) {
                              const evt = visibleEvents.find(e => e.id === item.id);
                              if (evt) setListDetailEvent(evt);
                            }
                          }}
                          className={`flex-1 flex items-center gap-3 pl-3 py-3 pr-1 text-left min-w-0 ${!item.isPersonal ? 'active:opacity-70 transition-opacity' : 'cursor-default'}`}
                        >
                          <div className="flex-shrink-0 w-10 flex flex-col items-center">
                            <span className="text-[10px] text-label-tertiary leading-none">{im}月</span>
                            <span className="text-xl font-bold text-label-primary leading-snug">{id}</span>
                          </div>
                          <div className="w-px h-8 bg-white/10 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start gap-1">
                              {importantEventIds.has(item.id) && <span className="text-[11px] leading-none flex-shrink-0 mt-[2px]" style={{ color: '#f59e0b' }}>★</span>}
                              <p className="text-label-primary text-sm font-medium leading-snug">{item.title}</p>
                            </div>
                            {/* バッジ行: タグ・カテゴリ・都道府県 */}
                            {(item.tag || item.category || item.prefecture) && (
                              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                {item.tag && !item.isPersonal && (
                                  <span className="text-[10px] font-medium px-2 py-0.5 rounded-full"
                                    style={{ color: item.workId ? (workColorMap.get(item.workId) ?? 'var(--label-tertiary)') : 'var(--label-tertiary)', backgroundColor: `${item.workId ? (workColorMap.get(item.workId) ?? '#888888') : '#888888'}20` }}>
                                    {item.tag}
                                  </span>
                                )}
                                {item.isPersonal && item.tag && <span className="text-[10px] text-label-tertiary bg-bg-primary rounded-full px-2 py-0.5">{item.tag}</span>}
                                {item.category && <span className="text-[10px] text-label-tertiary bg-bg-primary rounded-full px-2 py-0.5">{item.category}</span>}
                                {item.prefecture && <span className="text-[10px] text-label-tertiary bg-bg-primary rounded-full px-2 py-0.5">{item.prefecture}</span>}
                              </div>
                            )}
                            {/* 日付・時間 */}
                            {(formatDateRange(item.date, item.endDate) || formatTimeRange(item.time, item.endTime)) && (
                              <div className="flex items-center gap-2 mt-0.5">
                                {formatDateRange(item.date, item.endDate) && <span className="text-label-tertiary text-xs">{formatDateRange(item.date, item.endDate)}</span>}
                                {formatTimeRange(item.time, item.endTime) && <span className="text-label-tertiary text-xs">{formatTimeRange(item.time, item.endTime)}</span>}
                              </div>
                            )}
                            {item.authorName && <p className="text-[10px] text-label-tertiary mt-0.5">by {item.authorName}</p>}
                            {item.memo && <p className="text-label-secondary text-xs mt-0.5 truncate">{item.memo}</p>}
                          </div>
                        </button>
                        {!item.isPersonal && (
                          <button
                            onClick={e => { e.stopPropagation(); handleSheetEventLike(item.id); }}
                            disabled={!user || lockedLikeIds.has(item.id)}
                            className="flex items-center gap-0.5 px-2 self-stretch text-xs disabled:opacity-30"
                            style={{ color: item.likedByMe ? 'rgb(248,113,113)' : 'var(--label-tertiary)' }}
                          >
                            <Heart size={12} style={{ fill: item.likedByMe ? 'rgb(248,113,113)' : 'none' }} />
                            <span>{item.likes ?? 0}</span>
                          </button>
                        )}
                        {!item.isPersonal && (
                          <button
                            onClick={e => { e.stopPropagation(); setOpenReactionPickerId(prev => prev === item.id ? null : item.id); }}
                            className="px-1.5 self-stretch flex items-center text-base leading-none active:opacity-60"
                            style={{ color: myReactions[item.id] ? 'var(--accent-color)' : 'var(--label-tertiary)', opacity: myReactions[item.id] ? 1 : 0.5 }}
                          >
                            {myReactions[item.id]
                              ? <span className="text-sm leading-none">{REACTIONS.find(r => r.type === myReactions[item.id])?.emoji}</span>
                              : <Smile size={14} />
                            }
                          </button>
                        )}
                        {parseLinks(item.link).length === 1 ? (
                          <a href={parseLinks(item.link)[0]} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                            className="w-8 self-stretch flex items-center justify-center text-label-tertiary active:opacity-60 flex-shrink-0">
                            <ExternalLink size={13} />
                          </a>
                        ) : parseLinks(item.link).length > 1 ? (
                          <button onClick={e => { e.stopPropagation(); setLinkPickerLinks(parseLinks(item.link)); }}
                            className="w-8 self-stretch flex items-center justify-center text-label-tertiary active:opacity-60 flex-shrink-0">
                            <ExternalLink size={13} />
                          </button>
                        ) : null}
                        {!item.isPersonal && item.authorId && user && item.authorId === user.id && (
                          <button
                            onClick={e => { e.stopPropagation(); const ev = visibleEvents.find(x => x.id === item.id); if (ev) openEditEvent(ev); }}
                            className="w-9 self-stretch flex items-center justify-center active:opacity-60 flex-shrink-0"
                            style={{ color: 'var(--accent-color)' }}
                          >
                            <Pencil size={13} />
                          </button>
                        )}
                        <button
                          onClick={e => { e.stopPropagation(); item.isPersonal ? deletePersonalEvent(item.id) : handleHideEvent(item.id); }}
                          className="w-9 self-stretch flex items-center justify-center text-label-tertiary active:text-red-400 flex-shrink-0"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )
            )}
            </>
          )}
          </div>
        )}

        </div>{/* コンテンツエリア（背景画像ラッパー）閉じ */}
      </div>

      {/* FAB（シート展開中・詳細ビュー表示中は非表示。投稿フォームが開いているときは×ボタンとして表示） */}
      {(!sheetOpen || postPanelOpen) && !sheetDetailEvent && !listDetailEvent && (
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
      )}

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

      {/* リンクピッカー（複数リンクがある時） */}
      {linkPickerLinks && (
        <>
          <div className="fixed inset-0 z-[310]" onClick={() => setLinkPickerLinks(null)} />
          <div className="fixed inset-x-0 max-w-app mx-auto z-[320]" style={{ bottom: BOTTOM_TAB_H + 8 }}>
            <div className="mx-4 bg-bg-primary rounded-2xl border border-subtle shadow-xl overflow-hidden">
              <p className="text-label-tertiary text-xs px-4 pt-3 pb-2">リンクを選択</p>
              {linkPickerLinks.map((url, i) => (
                <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                  onClick={() => setLinkPickerLinks(null)}
                  className="flex items-center gap-3 px-4 py-3 border-t text-sm text-label-primary active:opacity-60"
                  style={{ borderColor: 'var(--border-subtle)' }}>
                  <ExternalLink size={14} className="text-label-tertiary flex-shrink-0" />
                  <span className="truncate">{getDomain(url)}</span>
                </a>
              ))}
              <div className="h-2" />
            </div>
          </div>
        </>
      )}

      {/* 予定追加フォームパネル（絶対配置スクロール方式） */}
      {postPanelOpen && (
        <div
          className="fixed inset-x-0 max-w-app mx-auto z-[160] rounded-t-2xl overflow-hidden"
          style={{
            bottom: BOTTOM_TAB_H,
            height: 280,
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

      {/* 予定編集フォームパネル（投稿者本人のみ） */}
      {editEventId && editForm && (
        <>
          <div className="fixed inset-0 z-[159] bg-black/40" onClick={() => { setEditEventId(null); setEditForm(null); }} />
          <div
            className="fixed inset-x-0 max-w-app mx-auto z-[160] rounded-t-2xl overflow-hidden"
            style={{
              bottom: BOTTOM_TAB_H,
              height: '80vh',
              backgroundColor: 'var(--bg-primary)',
              animation: 'slideUpPanel 0.28s cubic-bezier(0.32, 0.72, 0, 1) both',
            }}
          >
            {/* ヘッダー */}
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
                  <button onClick={() => { setEditEventId(null); setEditForm(null); }} className="text-xs text-label-tertiary px-3 py-1.5 rounded-lg active:opacity-60">キャンセル</button>
                  <button onClick={handleEditSubmit} disabled={editSubmitting} className="text-xs font-semibold text-bg-primary bg-label-primary px-4 py-1.5 rounded-lg active:opacity-70 disabled:opacity-40">
                    {editSubmitting ? '更新中…' : '保存'}
                  </button>
                </div>
              </div>
              {editError && <p className="text-red-400 text-xs px-4 pb-1">{editError}</p>}
            </div>
            {/* スクロールエリア */}
            <div
              className="absolute inset-x-0 bottom-0"
              style={{ top: 60, overflowY: 'scroll', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
            >
              <div className="px-4 pt-2 pb-8 flex flex-col gap-4">
                {/* タイトル */}
                <div>
                  <label className="text-label-tertiary text-xs mb-1.5 block">タイトル <span className="text-red-400">*</span></label>
                  <input type="text" value={editForm.title ?? ''} onChange={e => setEditForm(f => ({ ...f!, title: e.target.value }))} placeholder="タイトル" className={inputCls} />
                </div>
                {/* 日時 */}
                <div className="flex flex-col gap-2">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-label-tertiary text-xs mb-1.5 block">開始日 <span className="text-red-400">*</span></label>
                      <input type="date" value={editForm.date ?? ''} onChange={e => setEditForm(f => ({ ...f!, date: e.target.value }))} className={inputCls} />
                    </div>
                    <div>
                      <label className="text-label-tertiary text-xs mb-1.5 block">開始時間</label>
                      <input type="time" value={editForm.time ?? ''} onChange={e => setEditForm(f => ({ ...f!, time: e.target.value }))} className={inputCls} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-label-tertiary text-xs mb-1.5 block">終了日（任意）</label>
                      <input type="date" value={editForm.endDate ?? ''} onChange={e => setEditForm(f => ({ ...f!, endDate: e.target.value }))} className={inputCls} />
                    </div>
                    <div>
                      <label className="text-label-tertiary text-xs mb-1.5 block">終了時間</label>
                      <input type="time" value={editForm.endTime ?? ''} onChange={e => setEditForm(f => ({ ...f!, endTime: e.target.value }))} className={inputCls} />
                    </div>
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
                        onClick={() => setEditForm(f => ({ ...f!, category: f?.category === cat ? '' : cat, customCategory: '' }))}
                        className={`px-3 py-1 rounded-full text-xs border transition-colors ${editForm.category === cat ? 'border-selected text-label-primary bg-label-primary/10' : 'border-default text-label-secondary'}`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-label-tertiary text-xs flex-shrink-0">その他：</span>
                    <input
                      type="text"
                      value={editForm.customCategory ?? ''}
                      onChange={e => setEditForm(f => ({ ...f!, customCategory: e.target.value, category: '' }))}
                      placeholder="自由に入力"
                      className="flex-1 bg-bg-primary rounded-lg px-3 py-1.5 text-xs text-label-primary caret-label-primary placeholder:text-label-tertiary outline-none border border-faint focus:border-strong"
                    />
                  </div>
                </div>
                {/* 場所 */}
                <div>
                  <label className="text-label-tertiary text-xs mb-1.5 block">場所（任意）</label>
                  <select
                    value={editForm.prefecture ?? ''}
                    onChange={e => setEditForm(f => ({ ...f!, prefecture: e.target.value }))}
                    className={`${inputCls} appearance-none`}
                  >
                    <option value="">全国（指定なし）</option>
                    {['北海道','青森','岩手','宮城','秋田','山形','福島','茨城','栃木','群馬','埼玉','千葉','東京','神奈川','新潟','富山','石川','福井','山梨','長野','岐阜','静岡','愛知','三重','滋賀','京都','大阪','兵庫','奈良','和歌山','鳥取','島根','岡山','広島','山口','徳島','香川','愛媛','高知','福岡','佐賀','長崎','熊本','大分','宮崎','鹿児島','沖縄'].map(p => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                  {editForm.prefecture && (
                    <div className="flex flex-col gap-2 mt-2">
                      <input type="text" value={editForm.locationDetail ?? ''} onChange={e => setEditForm(f => ({ ...f!, locationDetail: e.target.value }))} placeholder="詳しい場所・住所" className={inputCls} />
                      <input type="url" value={editForm.locationMapLink ?? ''} onChange={e => setEditForm(f => ({ ...f!, locationMapLink: e.target.value }))} placeholder="Google Maps リンク" className={inputCls} />
                    </div>
                  )}
                </div>
                {/* リンク（複数可） */}
                <div>
                  <label className="text-label-tertiary text-xs mb-1.5 block">リンク（任意・複数可）</label>
                  <div className="flex flex-col gap-2">
                    {(editForm.links ?? ['']).map((lnk, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <input type="url" value={lnk}
                          onChange={e => {
                            const next = [...(editForm.links ?? [''])];
                            next[i] = e.target.value;
                            setEditForm(f => ({ ...f!, links: next }));
                          }}
                          placeholder={i === 0 ? '購入先 / 公式ポストなど' : '追加リンク'}
                          className={`${inputCls} flex-1`} />
                        {(editForm.links ?? ['']).length > 1 && (
                          <button type="button"
                            onClick={() => setEditForm(f => ({ ...f!, links: (f?.links ?? ['']).filter((_, j) => j !== i) }))}
                            className="w-7 h-7 flex items-center justify-center text-label-tertiary active:opacity-60 flex-shrink-0">
                            <X size={14} />
                          </button>
                        )}
                      </div>
                    ))}
                    {(editForm.links ?? ['']).length < 5 && (
                      <button type="button"
                        onClick={() => setEditForm(f => ({ ...f!, links: [...(f?.links ?? ['']), ''] }))}
                        className="flex items-center gap-1 text-xs text-label-tertiary active:opacity-60 mt-0.5 w-fit">
                        <Plus size={12} />リンクを追加
                      </button>
                    )}
                  </div>
                </div>
                {/* メモ */}
                <div>
                  <label className="text-label-tertiary text-xs mb-1.5 block">メモ（任意）</label>
                  <textarea value={editForm.memo ?? ''} onChange={e => setEditForm(f => ({ ...f!, memo: e.target.value }))} placeholder="補足情報" rows={3} className={`${inputCls} resize-none`} />
                </div>
              </div>
            </div>
          </div>
        </>
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

      {/* カテゴリフィルターピッカー */}
      {filterPickerWorkId !== null && (() => {
        const work = participatedWorks.find(w => w.id === filterPickerWorkId);
        if (!work) return null;
        const current = categoryFilters[filterPickerWorkId] ?? [];
        const toggle = (cat: string) => {
          const next = current.includes(cat) ? current.filter(c => c !== cat) : [...current, cat];
          const updated = { ...categoryFilters, [filterPickerWorkId]: next };
          setCategoryFilters(updated);
          saveCategoryFilters(updated);
        };
        const clearAll = () => {
          const updated = { ...categoryFilters, [filterPickerWorkId]: [] };
          setCategoryFilters(updated);
          saveCategoryFilters(updated);
        };
        return (
          <>
            <div className="fixed inset-0 z-[180]" onClick={() => setFilterPickerWorkId(null)} />
            <div className="fixed bottom-14 left-0 right-0 z-[190] max-w-app mx-auto px-4 pb-2">
              <div className="bg-bg-secondary overflow-hidden ds-panel rounded-sm">
                <div className="flex items-center justify-between px-4 pt-4 pb-2">
                  <span className="text-label-primary text-sm font-semibold">{work.name} の表示カテゴリ</span>
                  <button onClick={clearAll} className="text-xs text-label-tertiary underline active:opacity-60">すべて表示</button>
                </div>
                <p className="px-4 text-[11px] text-label-tertiary mb-3">色ありが表示中。タップしたカテゴリを非表示にします</p>
                <div className="flex flex-wrap gap-2 px-4 pb-4">
                  {POST_CATEGORIES.map(cat => {
                    const hidden = current.includes(cat);
                    return (
                      <button
                        key={cat}
                        onClick={() => toggle(cat)}
                        className="px-3 py-1.5 rounded-full text-xs border transition-colors active:opacity-70"
                        style={hidden ? {
                          borderColor: 'var(--border-default)',
                          color: 'var(--label-tertiary)',
                        } : {
                          borderColor: workColorMap.get(filterPickerWorkId) ?? 'var(--accent-color)',
                          color: workColorMap.get(filterPickerWorkId) ?? 'var(--accent-color)',
                          backgroundColor: `${workColorMap.get(filterPickerWorkId) ?? 'var(--accent-color)'}18`,
                        }}
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

      <BottomTab />
    </>
  );
}

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { showBanner, hideBanner } from '../lib/admob';
import { useLikeAnimation } from '../hooks/useLikeAnimation';
import { useReportedEventIds } from '../hooks/useReportedEventIds';
import UserProfileModal from '../components/UserProfileModal';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import {
  Palette, Plus, MoreVertical, Link2, LogOut,
  ChevronDown, ChevronUp, ChevronLeft, ChevronRight, X, Settings, Map as MapIcon, ExternalLink, SlidersHorizontal, Star, Inbox, Check, Clock,
} from 'lucide-react';
import BottomTab from '../components/BottomTab';
import Header from '../components/Header';
import {
  listEvents, getWorkById, leaveCalendar, deleteEvent,
  createEvents, getHomePrefecture, saveHomePrefecture,
  getDisplayName, saveDisplayName,
  listAllParticipatedWorkEvents, listAllParticipatedWorks, addLikeTap, setReaction, updateEvent,
  findDuplicateEvents, type DuplicateMatch, listPreorderEvents,
} from '../lib/api';
import { REACTIONS, type ReactionType } from '../lib/reactions';
import type { Work } from '../lib/api';
import { REGIONS, ADJACENT } from '../lib/prefectures';
import { PrefectureSearch } from '../components/UserSettingsSheet';
import UserSettingsSheet from '../components/UserSettingsSheet';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { useTheme } from '../contexts/ThemeContext';
import SmartInputPanel, { type ParsedEvent } from '../components/SmartInputPanel';
import PreorderEditSheet from '../components/PreorderEditSheet';
import EventTile from '../components/EventTile';
import type { CalendarEvent } from '../types';

export type { CalendarEvent };

import {
  POST_CATEGORIES, GOODS_PARENT, GOODS_SUBCATEGORIES, isGoodsSubcategory, normalizeGoodsCategories,
  loadCategoryFilters, saveCategoryFilters,
  loadCalendarEventIds, saveCalendarEventIds, removeCalendarEventId,
  parseLinks, serializeLinks, getPrimaryCategoryColor,
  parseCategories, serializeCategories,
  loadImportantEventIds, saveImportantEventIds, toggleImportantEventId,
  type FilterMode, saveRegionFilter, loadRegionFilter,
  incrementTotalLikesGiven,
  loadEventQueue, removeFromEventQueue, type QueuedEvent,
  loadImageVisibility,
  loadHiddenWorkIds, saveHiddenWorkIds,
} from '../lib/constants';
import { getCached, setCached } from '../lib/swrCache';
import { safeHref } from '../lib/url';
import { useConfirm } from '../components/ui/ConfirmDialog';
import { useActionSheet } from '../components/ui/ActionSheet';
import { useToast } from '../components/ui/Toast';
import { haptic } from '../lib/haptics';

// ─── 定数 ──────────────────────────────────────────────────────────

const DAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'];

// 作品ごとの識別カラー（先頭8色は従来通り。9作品目以降の同色衝突を避けるため追加色を後ろに足す）
export const WORK_COLORS = [
  '#FF6B6B', '#4FC3F7', '#81C784', '#FFB74D',
  '#BA68C8', '#4DB6AC', '#F06292', '#A1887F',
  '#7986CB', '#9CCC65', '#FF8A65', '#4DD0E1',
  '#DCE775', '#BA8FD0', '#90A4AE', '#F48FB1',
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

function buildTweetUrl(title: string, workName: string | null | undefined, displayName: string | null): string {
  const parts = [`「${title}」をカレンダーに登録しました！`];
  if (workName) parts.push(`#${workName.replace(/\s/g, '_')}`);
  if (displayName) parts.push(`by ${displayName}`);
  parts.push(window.location.origin);
  return `https://twitter.com/intent/tweet?text=${encodeURIComponent(parts.join('\n'))}`;
}

const inputCls =
  'w-full bg-bg-primary rounded-lg px-3 py-2 text-sm text-label-primary caret-label-primary placeholder:text-label-tertiary outline-none border border-faint focus:border-strong';

const BOTTOM_TAB_H = 56;
const SHEET_COLLAPSED_H = 76;
const SHEET_FULL_H = 280;

// ソート: 重要 > 複数日 > 通常
function makePriorityComparator(importantIds: Set<string>) {
  return (a: { id: string; date: string | null; endDate?: string }, b: { id: string; date: string | null; endDate?: string }) => {
    const aImp = importantIds.has(a.id);
    const bImp = importantIds.has(b.id);
    if (aImp !== bImp) return aImp ? -1 : 1;
    const aMulti = !!(a.endDate && a.date && a.endDate > a.date);
    const bMulti = !!(b.endDate && b.date && b.endDate > b.date);
    if (aMulti !== bMulti) return aMulti ? -1 : 1;
    return 0;
  };
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
  dateLabel: string; // '上旬'|'中旬'|'下旬'|'中'|'' (空=具体的な日付)
  time: string;
  endDate: string;
  endTime: string;
  categories: string[];
  prefecture: string;
  locationDetail: string;
  locationMapLink: string;
  links: string[];
  memo: string;
  imageUrl: string;
  sourceUrl: string;
  important: boolean;
  collapsed: boolean;
  isOrderMade: boolean;
  preorderStart: string;
  preorderEnd: string;
}

function newInlineCard(date: string): InlineCard {
  return {
    id: crypto.randomUUID(),
    workId: '',
    title: '',
    date,
    dateLabel: '',
    time: '',
    endDate: '',
    endTime: '',
    categories: [],
    prefecture: '',
    locationDetail: '',
    locationMapLink: '',
    links: [''],
    memo: '',
    imageUrl: '',
    sourceUrl: '',
    important: false,
    collapsed: false,
    isOrderMade: false,
    preorderStart: '',
    preorderEnd: '',
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
  const [customInput, setCustomInput] = useState('');
  const customCats = card.categories.filter(c => !(POST_CATEGORIES as readonly string[]).includes(c) && !isGoodsSubcategory(c));
  const toggleCategory = (cat: string) => {
    let next: string[];
    if (card.categories.includes(cat)) {
      next = card.categories.filter(c => c !== cat);
      if (cat === GOODS_PARENT) next = next.filter(c => !isGoodsSubcategory(c)); // グッズ解除で種別も外す
    } else {
      next = [...card.categories, cat];
    }
    onChange({ categories: normalizeGoodsCategories(next) });
  };
  const toggleSubcategory = (sub: string) => {
    const next = card.categories.includes(sub)
      ? card.categories.filter(c => c !== sub)
      : [...card.categories, sub];
    onChange({ categories: normalizeGoodsCategories(next) });
  };
  const addCustomCategory = () => {
    const v = customInput.trim();
    if (!v) return;
    if (!card.categories.includes(v)) onChange({ categories: [...card.categories, v] });
    setCustomInput('');
  };
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
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={e => { e.stopPropagation(); onChange({ important: !card.important }); }}
                  className="w-8 h-8 flex items-center justify-center rounded-full border transition-colors active:opacity-70"
                  style={card.important ? { borderColor: '#f59e0b', backgroundColor: 'rgba(245,158,11,0.12)' } : { borderColor: 'var(--border-default)' }}
                >
                  <Star size={16} style={{ fill: card.important ? '#f59e0b' : 'none', color: card.important ? '#f59e0b' : 'var(--label-secondary)' }} />
                </button>
              </div>
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
            <input type="text" value={card.title} onChange={e => onChange({ title: e.target.value })} placeholder="例：単行本 第15巻 発売" enterKeyHint="next" className={inputCls} />
          </div>

          <div className="flex flex-col gap-2">
            {/* 開始日ヘッダー + 日付未定トグル */}
            <div className="flex items-center justify-between">
              <label className="text-label-tertiary text-xs">
                開始日{!card.dateLabel && <span className="text-red-400"> *</span>}
              </label>
              <button
                type="button"
                onClick={() => {
                  if (card.dateLabel) {
                    onChange({ dateLabel: '' });
                  } else {
                    const ym = card.date ? card.date.slice(0, 7) : new Date().toISOString().slice(0, 7);
                    onChange({ dateLabel: '中旬', date: `${ym}-15` });
                  }
                }}
                className="text-xs px-2 py-0.5 rounded-full border transition-colors"
                style={card.dateLabel
                  ? { borderColor: 'var(--accent-color)', color: 'var(--accent-color)' }
                  : { borderColor: 'var(--border-default)', color: 'var(--label-tertiary)' }}
              >
                日付未定
              </button>
            </div>
            {card.dateLabel ? (
              /* 曖昧日付UI */
              <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                  <select
                    value={card.date ? card.date.slice(0, 4) : ''}
                    onChange={e => {
                      const year = e.target.value;
                      const seasonMonth: Record<string, string> = { '春頃': '04', '夏頃': '08', '秋頃': '11', '冬頃': '02' };
                      const labelDay: Record<string, string> = { '上旬': '05', '中旬': '15', '下旬': '25' };
                      const month = card.date ? card.date.slice(5, 7) : String(new Date().getMonth() + 1).padStart(2, '0');
                      const mm = seasonMonth[card.dateLabel] ?? month;
                      const day = seasonMonth[card.dateLabel] ? '15'
                        : card.dateLabel === '中' ? String(new Date(parseInt(year), parseInt(mm), 0).getDate()).padStart(2, '0')
                        : (labelDay[card.dateLabel] ?? '15');
                      onChange({ date: year ? `${year}-${mm}-${day}` : '' });
                    }}
                    className={inputCls}
                  >
                    {[0, 1, 2].map(off => { const y = new Date().getFullYear() + off; return <option key={y} value={String(y)}>{y}年</option>; })}
                  </select>
                  {!['春頃', '夏頃', '秋頃', '冬頃'].includes(card.dateLabel) && (
                    <select
                      value={card.date ? card.date.slice(5, 7) : ''}
                      onChange={e => {
                        const month = e.target.value;
                        const year = card.date ? card.date.slice(0, 4) : String(new Date().getFullYear());
                        const labelDay: Record<string, string> = { '上旬': '05', '中旬': '15', '下旬': '25' };
                        const day = card.dateLabel === '中' && month
                          ? String(new Date(parseInt(year), parseInt(month), 0).getDate()).padStart(2, '0')
                          : (labelDay[card.dateLabel] ?? '15');
                        onChange({ date: month ? `${year}-${month}-${day}` : '' });
                      }}
                      className={inputCls}
                    >
                      {Array.from({ length: 12 }, (_, i) => {
                        const m = String(i + 1).padStart(2, '0');
                        return <option key={m} value={m}>{i + 1}月</option>;
                      })}
                    </select>
                  )}
                </div>
                <select
                  value={card.dateLabel}
                  onChange={e => {
                    const val = e.target.value;
                    const year = card.date ? card.date.slice(0, 4) : String(new Date().getFullYear());
                    const seasonMonth: Record<string, string> = { '春頃': '04', '夏頃': '08', '秋頃': '11', '冬頃': '02' };
                    const labelDay: Record<string, string> = { '上旬': '05', '中旬': '15', '下旬': '25' };
                    if (seasonMonth[val]) {
                      onChange({ dateLabel: val, date: `${year}-${seasonMonth[val]}-15` });
                    } else {
                      const month = card.date ? card.date.slice(5, 7) : String(new Date().getMonth() + 1).padStart(2, '0');
                      const day = val === '中'
                        ? String(new Date(parseInt(year), parseInt(month), 0).getDate()).padStart(2, '0')
                        : (labelDay[val] ?? '15');
                      onChange({ dateLabel: val, date: `${year}-${month}-${day}` });
                    }
                  }}
                  className={inputCls}
                >
                  {[['上旬','上旬'],['中旬','中旬'],['下旬','下旬'],['月のみ','中'],['春頃','春頃'],['夏頃','夏頃'],['秋頃','秋頃'],['冬頃','冬頃']].map(([label, val]) => (
                    <option key={val} value={val}>{label}</option>
                  ))}
                </select>
              </div>
            ) : (
              /* 通常の日付ピッカー */
              <input type="date" value={card.date} onChange={e => onChange({ date: e.target.value })} className={inputCls} />
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-label-tertiary text-xs mb-1.5 block">開始時間</label>
                <input type="time" value={card.time} onChange={e => onChange({ time: e.target.value })} className={inputCls} />
              </div>
              <div>
                <label className="text-label-tertiary text-xs mb-1.5 block">終了時間</label>
                <input type="time" value={card.endTime} onChange={e => onChange({ endTime: e.target.value })} className={inputCls} />
              </div>
            </div>
            {!card.dateLabel && (
              <div>
                <label className="text-label-tertiary text-xs mb-1.5 block">終了日（任意）</label>
                <input type="date" value={card.endDate} min={card.date || undefined} onChange={e => onChange({ endDate: e.target.value })} className={inputCls} />
              </div>
            )}
          </div>

          <div>
            <label className="text-label-tertiary text-xs mb-1.5 block">カテゴリ（複数選択可）</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {POST_CATEGORIES.map(cat => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => toggleCategory(cat)}
                  className={`px-3 py-1 rounded-full text-xs border transition-colors ${card.categories.includes(cat) ? 'border-selected text-label-primary bg-label-primary/10' : 'border-default text-label-secondary'}`}
                >
                  {cat}
                </button>
              ))}
              {customCats.map(cat => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => toggleCategory(cat)}
                  className="px-3 py-1 rounded-full text-xs border border-selected text-label-primary bg-label-primary/10 flex items-center gap-1"
                >
                  {cat}<X size={11} />
                </button>
              ))}
            </div>
            {/* グッズの種類（グッズ選択時のみ・任意） */}
            {card.categories.includes(GOODS_PARENT) && (
              <div className="mb-2 pl-3 border-l-2 border-faint">
                <label className="text-label-tertiary text-[11px] mb-1.5 block">グッズの種類（任意・複数可）</label>
                <div className="flex flex-wrap gap-2">
                  {GOODS_SUBCATEGORIES.map(sub => (
                    <button
                      key={sub}
                      type="button"
                      onClick={() => toggleSubcategory(sub)}
                      className={`px-3 py-1 rounded-full text-xs border transition-colors ${card.categories.includes(sub) ? 'border-selected text-label-primary bg-label-primary/10' : 'border-default text-label-secondary'}`}
                    >
                      {sub}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="flex items-center gap-2">
              <span className="text-label-tertiary text-xs flex-shrink-0">その他：</span>
              <input
                type="text"
                value={customInput}
                onChange={e => setCustomInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustomCategory(); } }}
                onBlur={addCustomCategory}
                placeholder="自由に入力（Enterで追加）"
                className="flex-1 bg-bg-primary rounded-lg px-3 py-1.5 text-xs text-label-primary caret-label-primary placeholder:text-label-tertiary outline-none border border-faint focus:border-strong"
              />
            </div>
            {/* 予約あり トグル */}
            <div className="flex items-center justify-between mt-3">
              <span className="text-xs text-label-secondary">予約あり</span>
              <button
                type="button"
                onClick={() => {
                  const next = !card.isOrderMade;
                  const today = new Date().toISOString().slice(0, 10);
                  onChange({
                    isOrderMade: next,
                    preorderStart: next && !card.preorderStart ? today : card.preorderStart,
                  });
                }}
                className="flex-shrink-0 w-9 h-5 rounded-full relative transition-colors"
                style={{ background: card.isOrderMade ? 'var(--color-destructive)' : 'var(--fill-primary)' }}
              >
                <div className="absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all shadow-sm"
                  style={{ left: card.isOrderMade ? 'calc(100% - 18px)' : '2px' }} />
              </button>
            </div>
            {card.isOrderMade && (
              <div className="flex gap-2 mt-2">
                <div className="flex-1">
                  <label className="text-[10px] text-label-tertiary block mb-1">予約開始日</label>
                  <input type="date" value={card.preorderStart} onChange={e => onChange({ preorderStart: e.target.value })}
                    className="w-full bg-bg-primary rounded-lg px-2 py-1.5 text-xs text-label-primary outline-none border border-faint focus:border-strong" />
                </div>
                <div className="flex-1">
                  <label className="text-[10px] text-label-tertiary block mb-1">予約終了日</label>
                  <input type="date" value={card.preorderEnd} min={card.preorderStart || undefined} onChange={e => onChange({ preorderEnd: e.target.value })}
                    className="w-full bg-bg-primary rounded-lg px-2 py-1.5 text-xs text-label-primary outline-none border border-faint focus:border-strong" />
                </div>
              </div>
            )}
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
              <p className="text-label-tertiary text-xs mb-3 leading-relaxed">設定しておくと、ワンタップでホーム県に絞り込めます。</p>
              <button onClick={onSetHome} className="text-xs font-semibold active:opacity-60" style={{ color: 'var(--accent-color)' }}>ユーザー設定で登録する →</button>
            </div>
          )}
          {canGoHome ? (
            <button onClick={() => onApplyPref(homePref!)} className="w-full text-center py-3 rounded-xl text-sm font-medium active:opacity-70" style={{ background: 'var(--accent-color)', color: 'var(--accent-on)' }}>
              ホーム県（{homePref}）で絞り込む
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
  dateLabel?: string;
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
  const { reportedEventIds } = useReportedEventIds(user?.id);
  const confirmDialog = useConfirm();
  const actionSheet = useActionSheet();
  const showToast = useToast();
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
  const menuRef = useRef<HTMLDivElement>(null);

  const { trigger: triggerLike, renderOverlay: renderLikeOverlay } = useLikeAnimation();
  const [viewingUserId, setViewingUserId] = useState<string | null>(null);
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
  const [hiddenWorkIds, setHiddenWorkIds] = useState<Set<string>>(loadHiddenWorkIds);
  const [categoryFilters, setCategoryFilters] = useState<Record<string, string[]>>(loadCategoryFilters);
  const [filterPickerWorkId, setFilterPickerWorkId] = useState<string | null>(null);
  const [filterGoodsOpen, setFilterGoodsOpen] = useState(false);

  const [shareData] = useState<Record<string, string | null> | null>(() => {
    // router state が最優先（ShareTarget から navigate の state で直接渡す）
    const fromRouter = (location.state as { pendingParsedEvent?: Record<string, string | null> } | null)?.pendingParsedEvent;
    if (fromRouter) return fromRouter;
    // localStorage をバックアップとして確認
    const raw = localStorage.getItem('pendingParsedEvent') ?? sessionStorage.getItem('pendingParsedEvent');
    if (!raw) return null;
    try { return JSON.parse(raw) as Record<string, string | null>; } catch { return null; }
  });

  const [showImagesList] = useState(() => loadImageVisibility().list);

  const [eventQueue, setEventQueue]         = useState<QueuedEvent[]>(() => loadEventQueue());
  const [queueSheetOpen, setQueueSheetOpen] = useState(() => new URLSearchParams(location.search).get('openQueue') === '1');
  const [queueSelected, setQueueSelected]   = useState<Set<number>>(() => {
    const q = loadEventQueue();
    return new URLSearchParams(location.search).get('openQueue') === '1'
      ? new Set(q.map((_, i) => i))
      : new Set();
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
  const [listDetailEvent, setListDetailEvent] = useState<CalendarEvent | null>(null);
  const [preorderEditEvent, setPreorderEditEvent] = useState<CalendarEvent | null>(null);
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
    const date = shareData.date ?? todayStr;
    return [{
      ...newInlineCard(date),
      workId: '',
      title: shareData.title ?? '',
      time: shareData.time ?? '',
      categories: parseCategories(shareData.category),
      prefecture: shareData.prefecture ?? '',
      locationDetail: shareData.locationDetail ?? '',
      link: shareData.link ?? '',
      memo: shareData.memo ?? '',
      sourceUrl: shareData.sourceUrl ?? '',
      collapsed: false,
    }];
  });
  const [postError, setPostError] = useState('');
  const [postSubmitting, setPostSubmitting] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState<{ cardId: string; existingEvent: DuplicateMatch; kind: 'url' | 'title' | 'dateKeyword' } | null>(null);
  const [locationSuffixMsg, setLocationSuffixMsg] = useState<string | null>(null);
  // 「別の予定として投稿」で重複チェックをスキップするカードID
  const ignoredDupCardIdsRef = useRef<Set<string>>(new Set());
  // 入力中のリアルタイム重複警告（cardId → 既存イベント）
  const [liveDups, setLiveDups] = useState<Record<string, DuplicateMatch>>({});
  const liveDupCheckedSigRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    if (!user) return;
    Promise.all([getHomePrefecture(user.id), getDisplayName(user.id)])
      .then(([pref, name]) => {
        setHomePref(pref);
        setDisplayName(name);
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
    if (!(await confirmDialog({ title: 'カレンダーから抜ける', message: `「${workName}」のカレンダーから抜けますか？`, confirmLabel: '抜ける', destructive: true }))) return;
    await leaveCalendar(workId, user.id);
    localStorage.removeItem('last_calendar_workId');
    navigate('/');
  };

  const handleSaveUserSettings = async (newPref: string | null, newName: string) => {
    if (!user) return;
    setHomePref(newPref);
    setDisplayName(newName || null);
    await Promise.all([saveHomePrefecture(user.id, newPref), saveDisplayName(user.id, newName)]);
  };

  useEffect(() => {
    if (!locationSuffixMsg) return;
    const t = setTimeout(() => setLocationSuffixMsg(null), 4000);
    return () => clearTimeout(t);
  }, [locationSuffixMsg]);

  useEffect(() => {
    if (!workId) return;
    setCurrentCalendar(workId);
    getWorkById(workId).then(w => {
      if (w) { setWorkName(w.name); localStorage.setItem('last_calendar_work_name', w.name); }
    });
  }, [workId]); // eslint-disable-line react-hooks/exhaustive-deps

  // いいね・投稿・削除などのローカル変更をタブ離脱時にキャッシュへ反映
  const eventsCacheKeyRef = useRef<string | null>(null);
  const eventsRef = useRef<CalendarEvent[]>([]);
  eventsRef.current = events;
  useEffect(() => () => {
    if (eventsCacheKeyRef.current) setCached(eventsCacheKeyRef.current, eventsRef.current);
  }, []);

  useEffect(() => {
    if (!workId) return;
    const key = `cal-events:${workId}:${year}-${month}`;
    const cached = getCached<CalendarEvent[]>(key);
    if (cached) {
      // キャッシュを即表示し、裏で再取得して最新化
      setEvents(cached);
      eventsCacheKeyRef.current = key;
      setLoading(false);
      setError('');
    } else {
      setLoading(true);
      setError('');
    }
    listEvents(workId, year, month)
      .then(evts => {
        setEvents(evts);
        setCached(key, evts);
        eventsCacheKeyRef.current = key;
      })
      .catch(() => { if (!getCached(key)) setError('イベントの読み込みに失敗しました'); })
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

  // MyCalendar: 参加中の作品リストを取得（全作品、limit(10)なし）
  useEffect(() => {
    if (workId || !user) return;
    const cached = getCached<Work[]>(`works:${user.id}`);
    if (cached) setParticipatedWorks(cached);
    listAllParticipatedWorks(user.id).then(works => {
      setParticipatedWorks(works);
      setCached(`works:${user.id}`, works);
    }).catch(console.error);
  }, [workId, user?.id]);

  // MyCalendar: 予約受付中イベント
  const [preorderEvents, setPreorderEvents] = useState<CalendarEvent[]>(
    () => (workId ? [] : getCached<CalendarEvent[]>('preorder-banner') ?? [])
  );
  useEffect(() => {
    if (workId || participatedWorks.length === 0) { setPreorderEvents([]); return; }
    listPreorderEvents(participatedWorks.map(w => w.id)).then(evts => {
      setPreorderEvents(evts);
      setCached('preorder-banner', evts);
    }).catch(() => {});
  }, [workId, participatedWorks]); // eslint-disable-line react-hooks/exhaustive-deps

  // MyCalendar: 参加中の全作品のイベントを取得
  useEffect(() => {
    if (workId || !user) return;
    const key = `mycal-events:${user.id}:${year}-${month}`;
    const cached = getCached<CalendarEvent[]>(key);
    if (cached) {
      // キャッシュを即表示し、裏で再取得して最新化
      setEvents(cached);
      eventsCacheKeyRef.current = key;
      setLoading(false);
      setError('');
    } else {
      setLoading(true);
      setError('');
    }
    listAllParticipatedWorkEvents(user.id, year, month)
      .then(evts => {
        setEvents(evts);
        setCached(key, evts);
        eventsCacheKeyRef.current = key;
      })
      .catch(() => { if (!getCached(key)) setError('イベントの読み込みに失敗しました'); })
      .finally(() => setLoading(false));
  }, [workId, user?.id, year, month, location.key]);

  // 広告バナー: レイアウト確定後に ad-spacer の位置を計測して表示
  // paddingTop(36) + compact header(~32) ≈ 68 CSS px をフォールバックとして使用
  const AD_MARGIN_FALLBACK = 96; // paddingTop(36) + compact header(48) + header-banner gap(12)
  const adMarginRef = useRef(0);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const show = () => {
      const spacer = document.getElementById('ad-spacer');
      const top = spacer ? spacer.getBoundingClientRect().top : 0;
      adMarginRef.current = top > 0 ? Math.round(top) : AD_MARGIN_FALLBACK;
      showBanner(adMarginRef.current);
    };
    timer = setTimeout(show, 150);
    return () => {
      clearTimeout(timer);
      hideBanner();
    };
  }, []);

  useEffect(() => {
    if (postPanelOpen) {
      hideBanner();
    } else {
      showBanner(adMarginRef.current);
    }
  }, [postPanelOpen]);

  const toggleWorkVisibility = (wId: string) =>
    setHiddenWorkIds(prev => {
      const next = new Set(prev);
      if (next.has(wId)) next.delete(wId);
      else next.add(wId);
      saveHiddenWorkIds(next);
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
    () => [...events].sort((a, b) => (a.date ?? '').localeCompare(b.date ?? '')),
    [events],
  );

  const filteredEvents = useMemo(() => {
    // 通報済みイベントは通報者には表示しない
    let evts = monthEvents.filter(e => !reportedEventIds.has(e.id));
    if (activeFilterPrefs) {
      evts = evts.filter(e => {
        if (!e.prefecture) return true;
        const pref = e.prefecture.replace(/[都府県]$/, '');
        return activeFilterPrefs.has(pref);
      });
    }
    return evts;
  }, [monthEvents, activeFilterPrefs, reportedEventIds]);

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
      const evCats = parseCategories(e.category);
      return evCats.length === 0 ? true : !evCats.some(c => cats.includes(c));
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
    if (postPanelOpen) {
      setPostCards(prev => prev.map((c, i) => i === 0 ? { ...c, date: dateStr } : c));
      setSelectedDate(dateStr);
      return;
    }
    setSelectedDate(dateStr);
    setSheetOpen(true);
    setSheetDetailEvent(null);
  };

  const deletePersonalEvent = (id: string) => {
    const updated = personalEvents.filter(e => e.id !== id);
    setPersonalEvents(updated);
    savePersonalEvents(updated);
  };

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
    haptic.light();
    const isToggleOff = myReactions[eventId] === type;
    setMyReactions(prev => {
      const next = { ...prev };
      if (isToggleOff) { delete next[eventId]; } else { next[eventId] = type; }
      localStorage.setItem(REACTIONS_KEY, JSON.stringify(next));
      return next;
    });
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
    if (dx < 0) nextMonth(); else prevMonth();
  };

  // 自分の投稿の「消す」：非表示（自分のカレンダーから隠す）か完全削除かを選ばせる
  const removeOwnEvent = async (id: string, title: string) => {
    const choice = await actionSheet({
      message: `「${title}」`,
      options: [
        { id: 'hide', label: '自分の表示から隠す' },
        { id: 'delete', label: '完全に削除（みんなのカレンダーからも消える）', destructive: true },
      ],
    });
    if (choice === 'hide') {
      handleHideEvent(id);
    } else if (choice === 'delete') {
      try {
        await deleteEvent(id);
        setEvents(prev => prev.filter(e => e.id !== id));
      } catch { showToast('削除に失敗しました', 'error'); }
    }
  };

  // ─── イベント編集（投稿者本人のみ） ────────────────────────────
  const [editEventId, setEditEventId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<InlineCard> | null>(null);

  // 編集フォーム表示中はバナー広告を隠す（キーボード表示でフォームがバナーに被るため）
  const editWasOpenRef = useRef(false);
  useEffect(() => {
    const open = editEventId !== null;
    if (open && !editWasOpenRef.current) hideBanner();
    if (!open && editWasOpenRef.current) showBanner(adMarginRef.current);
    editWasOpenRef.current = open;
  }, [editEventId]); // eslint-disable-line react-hooks/exhaustive-deps
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState('');
  const [editIsPersonal, setEditIsPersonal] = useState(false);
  const [editCustomInput, setEditCustomInput] = useState('');

  const openEditEvent = (event: CalendarEvent) => {
    setEditIsPersonal(false);
    setEditEventId(event.id);
    setEditError('');
    const existingLinks = parseLinks(event.link);
    setEditForm({
      title: event.title,
      date: event.date ?? '',
      dateLabel: event.dateLabel ?? '',
      time: event.time ?? '',
      endDate: event.endDate ?? '',
      endTime: event.endTime ?? '',
      categories: parseCategories(event.category),
      prefecture: event.prefecture ?? '',
      locationDetail: event.locationDetail ?? '',
      locationMapLink: event.locationMapLink ?? '',
      links: existingLinks.length > 0 ? existingLinks : [''],
      memo: event.memo ?? '',
      isOrderMade: event.isOrderMade ?? false,
      preorderStart: event.preorderStart ?? '',
      preorderEnd: event.preorderEnd ?? '',
    });
  };

  const openEditPersonalEvent = (pe: PersonalEvent) => {
    setEditIsPersonal(true);
    setEditEventId(pe.id);
    setEditError('');
    const existingLinks = parseLinks(pe.link);
    setEditForm({
      workId: '',
      title: pe.title,
      date: pe.date ?? '',
      dateLabel: pe.dateLabel ?? '',
      time: pe.time ?? '',
      endDate: pe.endDate ?? '',
      endTime: pe.endTime ?? '',
      categories: parseCategories(pe.category),
      prefecture: pe.prefecture ?? '',
      locationDetail: pe.locationDetail ?? '',
      locationMapLink: pe.locationMapLink ?? '',
      links: existingLinks.length > 0 ? existingLinks : [''],
      memo: pe.memo ?? '',
      isOrderMade: false,
    });
  };

  const handleEditSubmit = async () => {
    if (!editEventId || !editForm) return;
    if (!editForm.title?.trim() || (!editForm.date && !editForm.dateLabel)) { setEditError('タイトルと日付は必須です'); return; }
    if (editIsPersonal) {
      const category = serializeCategories(editForm.categories ?? []);
      const updated = personalEvents.map(pe => pe.id === editEventId ? {
        ...pe,
        title: editForm.title!.trim(),
        date: editForm.date!,
        dateLabel: editForm.dateLabel || undefined,
        time: editForm.time || undefined,
        endDate: editForm.endDate || undefined,
        endTime: editForm.endTime || undefined,
        category,
        prefecture: editForm.prefecture || undefined,
        locationDetail: editForm.locationDetail || undefined,
        locationMapLink: editForm.locationMapLink || undefined,
        link: serializeLinks(editForm.links ?? []),
        memo: editForm.memo?.trim() || undefined,
      } : pe);
      setPersonalEvents(updated);
      savePersonalEvents(updated);
      setEditIsPersonal(false);
      setEditEventId(null);
      setEditForm(null);
      return;
    }
    setEditSubmitting(true);
    setEditError('');
    try {
      const category = serializeCategories(editForm.categories ?? []);
      const patch = {
        title: editForm.title.trim(),
        date: editForm.date ?? null,
        dateLabel: editForm.dateLabel || undefined,
        time: editForm.time || undefined,
        endDate: editForm.endDate || undefined,
        endTime: editForm.endTime || undefined,
        category,
        prefecture: editForm.prefecture || undefined,
        locationDetail: editForm.locationDetail || undefined,
        locationMapLink: editForm.locationMapLink || undefined,
        link: serializeLinks(editForm.links ?? []),
        memo: editForm.memo?.trim() || undefined,
        isOrderMade: editForm.isOrderMade ?? false,
        preorderStart: editForm.preorderStart || undefined,
        preorderEnd: editForm.preorderEnd || undefined,
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
    const filled = (c: InlineCard) => c.title.trim() !== '' || c.date !== postDate;
    const titleLower = (parsed.title ?? '').toLowerCase();
    const matchedWork = participatedWorks.find(w => w.name && titleLower.includes(w.name.toLowerCase()));
    const parsedCard = (base: InlineCard): InlineCard => ({
      ...base,
      collapsed: false,
      workId:         matchedWork ? matchedWork.id : base.workId,
      title:          parsed.title          ?? base.title,
      date:           parsed.date           ?? base.date,
      dateLabel:      parsed.dateLabel      ?? base.dateLabel,
      time:           parsed.time           ?? base.time,
      endDate:        parsed.endDate        ?? base.endDate,
      endTime:        parsed.endTime        ?? base.endTime,
      categories:     normalizeGoodsCategories([...new Set([...base.categories, ...parseCategories(parsed.category)])]),
      prefecture:     parsed.prefecture     ?? base.prefecture,
      locationDetail: parsed.locationDetail ?? base.locationDetail,
      links:          parsed.link ? (parseLinks(parsed.link).length > 0 ? parseLinks(parsed.link) : base.links) : base.links,
      memo:           parsed.memo           ?? base.memo,
      imageUrl:       parsed.imageUrl       ?? base.imageUrl,
      sourceUrl:      parsed.sourceUrl      ?? base.sourceUrl,
      isOrderMade:    parsed.isOrderMade    ?? base.isOrderMade,
      preorderStart:  parsed.preorderStart  ?? base.preorderStart,
      preorderEnd:    parsed.preorderEnd    ?? base.preorderEnd,
    });
    const defaultWorkId = !workId && participatedWorks.length > 0 ? participatedWorks[0].id : '';
    setPostCards(prev => {
      const [first, ...rest] = prev;
      if (!filled(first)) return [parsedCard(first), ...rest];
      return [...prev.map(c => ({ ...c, collapsed: true })), parsedCard({ ...newInlineCard(postDate), workId: defaultWorkId })];
    });
  };

  useEffect(() => {
    localStorage.removeItem('pendingParsedEvent');
    sessionStorage.removeItem('pendingParsedEvent');
  }, []);

  const applyQueueSelected = () => {
    const indices = Array.from(queueSelected);
    indices.forEach(i => {
      if (eventQueue[i]) applyParsedToPost(eventQueue[i]);
    });
    removeFromEventQueue(indices);
    const next = loadEventQueue();
    setEventQueue(next);
    setQueueSelected(new Set());
    if (next.length === 0) setQueueSheetOpen(false);
    if (!postPanelOpen) { setPostPanelOpen(true); setSheetOpen(true); }
  };

  const dismissQueue = (indices: number[]) => {
    removeFromEventQueue(indices);
    const next = loadEventQueue();
    setEventQueue(next);
    setQueueSelected(prev => {
      const s = new Set(prev);
      indices.forEach(i => s.delete(i));
      return s;
    });
    if (next.length === 0) setQueueSheetOpen(false);
  };

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
    ignoredDupCardIdsRef.current.clear();
    liveDupCheckedSigRef.current.clear();
    setLiveDups({});
    setPostPanelOpen(true);
  };
  const closePostForm = () => {
    setPostPanelOpen(false);
    setDuplicateWarning(null);
    ignoredDupCardIdsRef.current.clear();
    liveDupCheckedSigRef.current.clear();
    setLiveDups({});
  };

  // DateDetail の＋ボタンから遷移してきたとき、その日付で投稿フォームを開く
  useEffect(() => {
    const openDate = (location.state as { openPostDate?: string } | null)?.openPostDate;
    if (!openDate) return;
    const d = new Date(openDate);
    if (!isNaN(d.getTime())) {
      setYear(d.getFullYear());
      setMonth(d.getMonth());
      setSelectedDate(openDate);
    }
    openPostForm(openDate);
    // 戻る操作などでの再オープンを防ぐため state をクリア
    navigate(location.pathname, { replace: true, state: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 入力中のリアルタイム重複チェック（600msデバウンス・投稿前に気づけるように）
  useEffect(() => {
    if (!postPanelOpen || !user) return;
    const timer = setTimeout(() => {
      for (const card of postCards) {
        const targetWorkId = workId || card.workId;
        const title = card.title.trim();
        if (!targetWorkId || title.length < 2) {
          setLiveDups(prev => {
            if (!prev[card.id]) return prev;
            const next = { ...prev };
            delete next[card.id];
            return next;
          });
          continue;
        }
        const cardCategorySig = serializeCategories(card.categories) ?? '';
        const sig = [title, card.date, card.endDate, card.sourceUrl, cardCategorySig, card.prefecture, targetWorkId].join('|');
        if (liveDupCheckedSigRef.current.get(card.id) === sig) continue;
        liveDupCheckedSigRef.current.set(card.id, sig);
        const cardCategory = serializeCategories(card.categories) ?? null;
        const cardWorkName = workId ? workName : (participatedWorks.find(w => w.id === card.workId)?.name ?? null);
        findDuplicateEvents(targetWorkId, title, card.sourceUrl, cardCategory,
          { date: card.date || null, endDate: card.endDate || null, workName: cardWorkName, prefecture: card.prefecture || null })
          .then(({ byUrl, byTitle, byDateKeyword }) => {
            const normPref = card.prefecture || null;
            // 都道府県が異なるbyTitleは投稿時に自動で地名サフィックスが付くので警告しない
            const titleDup = byTitle.find(m => !m.prefecture || !normPref || m.prefecture === normPref) ?? null;
            const match = byUrl[0] ?? titleDup ?? byDateKeyword[0] ?? null;
            setLiveDups(prev => {
              if (match) return { ...prev, [card.id]: match };
              if (!prev[card.id]) return prev;
              const next = { ...prev };
              delete next[card.id];
              return next;
            });
          })
          .catch(() => { /* チェック失敗は無視 */ });
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [postCards, postPanelOpen, user, workId, workName, participatedWorks]);

  const handlePostSubmit = async () => {
    const invalid = postCards.find(c => !c.title.trim());
    if (invalid) {
      setPostError('タイトルを入力してください');
      setPostCards(prev => prev.map(c => c.id === invalid.id ? { ...c, collapsed: false } : c));
      return;
    }
    const noCat = postCards.find(c => c.categories.length === 0 && (workId || c.workId));
    if (noCat) {
      setPostError('カテゴリを選択してください');
      setPostCards(prev => prev.map(c => c.id === noCat.id ? { ...c, collapsed: false } : c));
      return;
    }
    const noDate = postCards.find(c => !c.date && !c.dateLabel);
    if (noDate) {
      setPostError('日付を入力してください');
      setPostCards(prev => prev.map(c => c.id === noDate.id ? { ...c, collapsed: false } : c));
      return;
    }
    setPostError('');
    setDuplicateWarning(null);
    setPostSubmitting(true);

    // ─── 重複検知（作品カレンダーへの投稿カードのみ） ───
    const titleSuffixes = new Map<string, string>();
    if (user) {
      for (const card of postCards) {
        const targetWorkId = workId || card.workId;
        if (!targetWorkId) continue; // 個人予定はスキップ
        if (ignoredDupCardIdsRef.current.has(card.id)) continue; // 「別の予定として投稿」済み
        const cardCategory = serializeCategories(card.categories) ?? null;
        const cardWorkName = workId ? workName : (participatedWorks.find(w => w.id === card.workId)?.name ?? null);
        try {
          const { byUrl, byTitle, byDateKeyword } = await findDuplicateEvents(targetWorkId, card.title.trim(), card.sourceUrl, cardCategory,
            { date: card.date || null, endDate: card.endDate || null, workName: cardWorkName, prefecture: card.prefecture || null });
          if (byUrl.length > 0) {
            setDuplicateWarning({ cardId: card.id, existingEvent: byUrl[0], kind: 'url' });
            setPostSubmitting(false);
            return;
          }
          if (byDateKeyword.length > 0) {
            setDuplicateWarning({ cardId: card.id, existingEvent: byDateKeyword[0], kind: 'dateKeyword' });
            setPostSubmitting(false);
            return;
          }
          if (byTitle.length > 0) {
            const normNewPref = card.prefecture || null;
            const baseTitle = card.title.trim().replace(/　/g, ' ').toLowerCase();
            const trueDup = byTitle.find(m => !m.prefecture || !normNewPref || m.prefecture === normNewPref);
            if (trueDup) {
              setDuplicateWarning({ cardId: card.id, existingEvent: trueDup, kind: 'title' });
              setPostSubmitting(false);
              return;
            }
            const suffix = normNewPref ? ` ${normNewPref}` : '';
            if (suffix) {
              titleSuffixes.set(card.id, suffix);
              // 既存イベント全件を走査し、まだ地名が付いていないものだけ更新
              const { data: { session } } = await supabase.auth.getSession();
              for (const match of byTitle) {
                if (!match.prefecture) continue;
                const matchNorm = match.title.trim().replace(/　/g, ' ').toLowerCase();
                // タイトルが元のまま（まだサフィックスなし）の場合のみ更新
                if (matchNorm !== baseTitle) continue;
                const newExistingTitle = `${match.title.trim()} ${match.prefecture}`;
                try {
                  if (match.authorId === user.id) {
                    await updateEvent(match.id, { title: newExistingTitle });
                  } else if (session?.access_token) {
                    await fetch('/api/update-event-title', {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${session.access_token}`,
                      },
                      body: JSON.stringify({ event_id: match.id, title: newExistingTitle }),
                    });
                  }
                } catch { /* 失敗しても続行 */ }
              }
              setLocationSuffixMsg(`タイトルに地名を追加しました（${byTitle.length}件の既存予定と区別）`);
            }
          }
        } catch {
          // 重複チェック失敗は無視して続行
        }
      }
    }

    const toEventPayload = (c: InlineCard) => ({
      title: c.title.trim() + (titleSuffixes.get(c.id) ?? ''), date: c.date || null, dateLabel: c.dateLabel || undefined, time: c.time || undefined,
      endDate: c.endDate || undefined, endTime: c.endTime || undefined,
      category: serializeCategories(c.categories),
      link: serializeLinks(c.links), memo: c.memo || undefined,
      prefecture: c.prefecture || undefined,
      locationDetail: c.locationDetail || undefined,
      locationMapLink: c.locationMapLink || undefined,
      imageUrl: c.imageUrl || undefined,
      sourceUrl: c.sourceUrl || undefined,
      isOrderMade: c.isOrderMade || false,
      preorderStart: c.preorderStart || undefined,
      preorderEnd: c.preorderEnd || undefined,
    });
    const serializedLinks = (c: InlineCard) => serializeLinks(c.links);
    const toPersonalEvent = (c: InlineCard): PersonalEvent => ({
      id: crypto.randomUUID(), title: c.title.trim(), date: c.date,
      ...(c.time && { time: c.time }),
      ...(c.endDate && { endDate: c.endDate }),
      ...(c.endTime && { endTime: c.endTime }),
      ...(serializeCategories(c.categories) && { category: serializeCategories(c.categories) }),
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
        postCards.forEach((c, i) => {
          if (c.important && newIds[i]) newImportantIds.push(newIds[i]);
        });
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
          newIds.forEach((id, i) => {
            if (cards[i].important) newImportantIds.push(id);
          });
        }
        if (personalCards.length > 0) {
          const newPersonalEvts = personalCards.map(toPersonalEvent);
          const existing = loadPersonalEvents();
          savePersonalEvents([...existing, ...newPersonalEvts]);
          setPersonalEvents(loadPersonalEvents());
          newPersonalEvts.forEach((pe, i) => {
            if (personalCards[i].important) newImportantIds.push(pe.id);
          });
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
      haptic.success();
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
  type CellItem = { title: string; color: string; dotColor: string; position?: 'start' | 'middle' | 'end'; eventId: string; important?: boolean; fuzzy?: boolean };
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
      const dotColor = getPrimaryCategoryColor(e.category) ?? workColor;
      const important = importantEventIds.has(e.id);
      if (e.dateLabel) continue;
      if (e.date && e.endDate && e.endDate > e.date) {
        let cur = e.date;
        while (cur <= e.endDate!) {
          const pos: CellItem['position'] = cur === e.date ? 'start' : cur === e.endDate ? 'end' : 'middle';
          add(cur, { title: e.title, color: workColor, dotColor, position: pos, eventId: e.id, important });
          const next = new Date(cur + 'T00:00:00');
          next.setDate(next.getDate() + 1);
          cur = toDateStr(next);
        }
      } else if (e.date) {
        add(e.date, { title: e.title, color: workColor, dotColor, eventId: e.id, important });
      }
    }
    if (!workId) {
      for (const pe of monthPersonalEvents) {
        if (pe.dateLabel) continue;
        const dotColor = getPrimaryCategoryColor(pe.category) ?? '#888888';
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
    // 重要 > 複数日 > 通常 の順に並べ直す
    for (const [, items] of map) {
      items.sort((a, b) => {
        if (a.important !== b.important) return a.important ? -1 : 1;
        const aMulti = !!a.position;
        const bMulti = !!b.position;
        if (aMulti !== bMulti) return aMulti ? -1 : 1;
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
      if (e.date && e.endDate && e.endDate > e.date) {
        const workColor = e.workId ? (workColorMap.get(e.workId) ?? 'var(--accent-color)') : 'var(--accent-color)';
        rawEvts.push({ eventId: e.id, startDate: e.date, endDate: e.endDate, title: e.title, color: workColor, dotColor: getPrimaryCategoryColor(e.category) ?? workColor, important: importantEventIds.has(e.id) });
      }
    }
    if (!workId) {
      for (const pe of monthPersonalEvents) {
        if (pe.endDate && pe.endDate > pe.date) {
          rawEvts.push({ eventId: pe.id, startDate: pe.date, endDate: pe.endDate, title: pe.title, color: '#888888', dotColor: getPrimaryCategoryColor(pe.category) ?? '#888888', important: importantEventIds.has(pe.id) });
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
        if (!e.date) return false;
        const end = e.endDate || e.date;
        return e.date <= selectedDate && selectedDate <= end;
      })
      .sort(makePriorityComparator(importantEventIds)),
    [visibleEvents, selectedDate, importantEventIds],
  );
  const sheetPersonalEvents = useMemo(
    () => personalEvents
      .filter(e => {
        const end = e.endDate || e.date;
        return e.date <= selectedDate && selectedDate <= end;
      })
      .sort(makePriorityComparator(importantEventIds)),
    [personalEvents, selectedDate, importantEventIds],
  );

  // 予定一覧ビュー用: 作品イベント+個人予定を日付順にまとめたリスト
  type ListItem = {
    id: string; date: string | null; dateLabel?: string | null; title: string; time?: string; endDate?: string; endTime?: string;
    category?: string; prefecture?: string; memo?: string; link?: string; imageUrl?: string;
    tag: string; isPersonal: boolean; workId?: string;
    likes?: number; likedByMe?: boolean;
    authorId?: string; authorName?: string; sourceUrl?: string;
    isOrderMade?: boolean; preorderStart?: string; preorderEnd?: string;
  };
  const myCalendarListItems = useMemo((): ListItem[] => {
    if (workId) return [];
    const workItems: ListItem[] = visibleEvents.map(e => ({
      id: e.id, date: e.date, dateLabel: e.dateLabel, title: e.title, time: e.time, endDate: e.endDate, endTime: e.endTime,
      category: e.category, prefecture: e.prefecture, link: e.link, imageUrl: e.imageUrl, memo: e.memo,
      tag: e.workName ?? '', isPersonal: false, workId: e.workId,
      likes: e.likes, likedByMe: e.likedByMe,
      authorId: e.authorId, authorName: e.authorName, sourceUrl: e.sourceUrl,
      isOrderMade: e.isOrderMade, preorderStart: e.preorderStart, preorderEnd: e.preorderEnd,
    }));
    const personalItems: ListItem[] = monthPersonalEvents.map(pe => ({
      id: pe.id, date: pe.date, title: pe.title, time: pe.time, endDate: pe.endDate, endTime: pe.endTime,
      category: pe.category, prefecture: pe.prefecture, memo: pe.memo,
      tag: '個人', isPersonal: true,
    }));
    return [...workItems, ...personalItems].sort((a, b) => {
      const aImp = importantEventIds.has(a.id);
      const bImp = importantEventIds.has(b.id);
      if (aImp !== bImp) return aImp ? -1 : 1;
      return (a.date ?? '').localeCompare(b.date ?? '');
    });
  }, [workId, visibleEvents, monthPersonalEvents, importantEventIds]);

  // workIdモード一覧用: 重要優先 → 日付順
  const sortedListEvents = useMemo(
    () => [...filteredEvents].sort((a, b) => {
      const aImp = importantEventIds.has(a.id);
      const bImp = importantEventIds.has(b.id);
      if (aImp !== bImp) return aImp ? -1 : 1;
      return (a.date ?? '').localeCompare(b.date ?? '');
    }),
    [filteredEvents, importantEventIds],
  );

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
      {/* 地名追加トースト */}
      {locationSuffixMsg && (
        <div
          className="fixed top-4 inset-x-0 z-[300] flex justify-center pointer-events-none px-4"
        >
          <div className="bg-label-primary text-bg-primary text-xs font-medium px-4 py-2.5 rounded-xl shadow-lg max-w-sm text-center">
            {locationSuffixMsg}
          </div>
        </div>
      )}
      {/* フルスクリーンコンテナ */}
      <div
        className="fixed inset-0 max-w-app mx-auto flex flex-col overflow-hidden"
        style={{
          backgroundColor: 'var(--bg-primary)',
          paddingTop: 36,
          paddingBottom: postPanelOpen ? BOTTOM_TAB_H + 380 : BOTTOM_TAB_H,
          transition: 'padding-bottom 0.28s cubic-bezier(0.32, 0.72, 0, 1)',
        }}
      >
        <Header
          compact
          leftNode={
            <div className="flex items-center gap-1">
              <button onClick={prevMonth} aria-label="前の月" className="w-8 h-8 flex items-center justify-center rounded-lg pressable tap-44" style={{ color: 'var(--accent-color)' }}><ChevronLeft size={20} /></button>
              <button onClick={() => { const t = new Date(); setYear(t.getFullYear()); setMonth(t.getMonth()); }} aria-label="今月へ戻る" className="text-base font-bold text-label-primary pressable">{year}年{month + 1}月</button>
              <button onClick={nextMonth} aria-label="次の月" className="w-8 h-8 flex items-center justify-center rounded-lg pressable tap-44" style={{ color: 'var(--accent-color)' }}><ChevronRight size={20} /></button>
            </div>
          }
          rightAction={
            <div className="flex items-center gap-1">
              {/* 地域フィルター: workId有無に関わらず表示 */}
              <button
                onClick={() => setShowRegionPanel(true)}
                aria-label="地域で絞り込む"
                className="relative w-8 h-8 flex items-center justify-center rounded-lg bg-bg-secondary text-label-secondary active:opacity-60"
              >
                <MapIcon size={16} style={filterActive ? { color: 'var(--accent-color)' } : {}} />
                {filterActive && <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full" style={{ background: 'var(--accent-color)' }} />}
              </button>

              <button onClick={() => navigate('/customize')} className="w-8 h-8 flex items-center justify-center rounded-lg bg-bg-secondary text-label-secondary">
                <Palette size={16} />
              </button>

              <div className="relative" ref={menuRef}>
                {/* MyCalendarはメニュー項目がユーザー設定のみなので直接開く */}
                <button onClick={() => { if (workId) setShowMenu(v => !v); else setShowUserSettings(true); }} className="w-8 h-8 flex items-center justify-center rounded-lg bg-bg-secondary text-label-secondary">
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
                        </>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          }
        />

        {/* 広告バナースロット */}
        {!postPanelOpen && (
          <>
            <div className="flex-shrink-0" style={{ height: 12 }} />
            <div id="ad-spacer" className="flex-shrink-0" style={{ height: 76 }} />
          </>
        )}


        {/* 予約受付中バナー（MyCalendarのみ） */}
        {!workId && preorderEvents.length > 0 && (() => {
          const todayStr = new Date().toISOString().slice(0, 10);
          const activeCount = preorderEvents.filter(e => { const s = e.preorderStart ?? e.date; return !s || s <= todayStr; }).length;
          const upcomingCount = preorderEvents.length - activeCount;
          return (
            <button
              onClick={() => navigate('/preorders')}
              className="flex-shrink-0 flex items-center gap-2 px-4 py-2.5 border-b active:opacity-70"
              style={{ backgroundColor: 'color-mix(in srgb, var(--color-warning) 12%, transparent)', borderColor: 'var(--separator)' }}
            >
              <Clock size={14} style={{ color: 'var(--color-warning)', flexShrink: 0 }} />
              <div className="flex items-center gap-2 flex-1 min-w-0">
                {activeCount > 0 && (
                  <span className="text-xs font-semibold" style={{ color: 'var(--color-warning)' }}>
                    受付中 {activeCount}件
                  </span>
                )}
                {upcomingCount > 0 && (
                  <span className="text-xs text-label-secondary">
                    予約開始予定 {upcomingCount}件
                  </span>
                )}
              </div>
              <ChevronRight size={14} className="text-label-tertiary flex-shrink-0" />
            </button>
          );
        })()}

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
                    aria-label={`${w.name} のカテゴリで絞り込む`}
                    className="pr-2.5 py-1 active:opacity-70 tap-44"
                    style={{ color: hasCatFilter ? color : 'var(--label-tertiary)' }}
                  >
                    <SlidersHorizontal size={11} strokeWidth={hasCatFilter ? 2.5 : 1.5} />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* 上部タブ（カレンダー / 予定一覧） — iOS セグメントコントロール */}
        <div className="flex-shrink-0 px-4 py-2">
          <div
            className="flex rounded-[10px] p-[2px]"
            style={{ backgroundColor: 'var(--fill-tertiary)' }}
          >
            {(['calendar', 'list'] as const).map(v => (
              <button
                key={v}
                onClick={() => { setTopView(v); sessionStorage.setItem('cal_topView', v); }}
                className="flex-1 py-[5px] text-[13px] font-medium rounded-[8px] transition-all duration-200 pressable"
                style={topView === v
                  ? { backgroundColor: 'var(--bg-secondary)', color: 'var(--label-primary)', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }
                  : { backgroundColor: 'transparent', color: 'var(--label-secondary)' }
                }
              >
                {v === 'calendar' ? 'カレンダー' : '予定一覧'}
              </button>
            ))}
          </div>
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

        {/* ─── キューバナー ─── */}
        {eventQueue.length > 0 && !queueSheetOpen && (
          <button
            onClick={() => { setQueueSheetOpen(true); setQueueSelected(new Set(eventQueue.map((_, i) => i))); }}
            className="mx-3 mt-2 flex items-center gap-2 px-3 py-2.5 rounded-xl active:opacity-70"
            style={{ backgroundColor: 'var(--accent-color)' }}
          >
            <Inbox size={15} color="var(--accent-on)" />
            <span className="text-xs font-semibold flex-1 text-left" style={{ color: 'var(--accent-on)' }}>
              {eventQueue.length}件のストックがあります
            </span>
            <ChevronRight size={14} color="var(--accent-on)" opacity={0.7} />
          </button>
        )}

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
            <div className="flex-1 overflow-hidden flex flex-col px-1 pt-0" style={{ fontFamily: calFontFamily }}>
              {/* 曜日ラベル */}
              <div className="grid grid-cols-7 mb-0.5 flex-shrink-0">
                {DAY_LABELS.map((label, i) => (
                  <div key={label} className="text-center text-[11px] py-0.5 font-medium select-none"
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
                    const isSelected = dateStr === selectedDate && isCurrentMonth && (sheetOpen || postPanelOpen);
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
                                  ) : item.fuzzy ? (
                                    <div className="w-[5px] h-[5px] rounded-full flex-shrink-0" style={{ border: `1.5px solid ${item.dotColor.startsWith('#') ? item.dotColor : '#888'}` }} />
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
              className="flex-shrink-0 overflow-hidden"
              style={{
                height: sheetOpen ? SHEET_FULL_H : 0,
                transition: 'height 0.3s cubic-bezier(0.32, 0.72, 0, 1)',
                borderTop: sheetOpen ? '1px solid var(--border-subtle)' : 'none',
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
                  <div className="w-9 h-[5px] rounded-full mb-2" style={{ backgroundColor: 'var(--fill-primary)' }} />
                  <div className="w-full px-4 flex items-center justify-between">
                    <p className="text-label-primary text-sm font-semibold">{selectedDateLabel}</p>
                    <div className="flex items-center gap-2">
                      {sheetEventCount > 0 && <span className="text-label-tertiary text-xs">{sheetEventCount}件</span>}
                      {sheetOpen && !postPanelOpen && !sheetDetailEvent && (
                        <button
                          onClick={e => { e.stopPropagation(); openPostForm(selectedDate); }}
                          className="w-7 h-7 flex items-center justify-center rounded-full active:opacity-70"
                          style={{ backgroundColor: 'var(--accent-color)', color: 'var(--accent-on)' }}
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
                  {loading ? (
                    <div className="flex flex-col gap-2">{[1, 2].map(i => <div key={i} className="h-14 bg-bg-secondary rounded-xl animate-pulse" />)}</div>
                  ) : workId ? (
                    sheetWorkEvents.length === 0 ? (
                      <p className="text-center text-label-tertiary text-sm py-6">この日の予定はありません</p>
                    ) : (
                      <div className="flex flex-col gap-2">
                        {sheetWorkEvents.map(event => {
                          const isOwn = !!user && event.authorId === user.id;
                          const canEditInfo = !!event.workId && participatedWorks.some(w => w.id === event.workId);
                          return (
                            <EventTile
                              key={event.id}
                              event={event}
                              density="compact"
                              showImages={false}
                              workColor={event.workId ? (workColorMap.get(event.workId) ?? 'var(--accent-color)') : 'var(--accent-color)'}
                              liked={event.likedByMe}
                              likeLocked={lockedLikeIds.has(event.id) || !user}
                              onLike={el => { handleSheetEventLike(event.id); triggerLike(el); }}
                              myReaction={myReactions[event.id] ?? null}
                              onReact={() => setOpenReactionPickerId(prev => prev === event.id ? null : event.id)}
                              important={importantEventIds.has(event.id)}
                              onToggleImportant={() => setImportantEventIds(toggleImportantEventId(event.id))}
                              shareUrl={buildTweetUrl(event.title, workName, displayName)}
                              isOwn={isOwn}
                              onEdit={() => openEditEvent(event)}
                              onDelete={() => removeOwnEvent(event.id, event.title)}
                              onInfoEdit={canEditInfo ? () => setPreorderEditEvent(event) : undefined}
                              onHide={isOwn ? undefined : () => handleHideEvent(event.id)}
                              onAuthorClick={event.authorId ? () => setViewingUserId(event.authorId!) : undefined}
                            />
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
                          const isOwn = !!user && event.authorId === user.id;
                          const canEditInfo = !!event.workId && participatedWorks.some(w => w.id === event.workId);
                          return (
                            <EventTile
                              key={event.id}
                              event={event}
                              density="compact"
                              showImages={false}
                              workColor={event.workId ? (workColorMap.get(event.workId) ?? 'var(--accent-color)') : 'var(--accent-color)'}
                              liked={event.likedByMe}
                              likeLocked={lockedLikeIds.has(event.id) || !user}
                              onLike={el => { handleSheetEventLike(event.id); triggerLike(el); }}
                              myReaction={myReactions[event.id] ?? null}
                              onReact={() => setOpenReactionPickerId(prev => prev === event.id ? null : event.id)}
                              important={importantEventIds.has(event.id)}
                              onToggleImportant={() => setImportantEventIds(toggleImportantEventId(event.id))}
                              shareUrl={buildTweetUrl(event.title, event.workName ?? workName, displayName)}
                              isOwn={isOwn}
                              onEdit={() => openEditEvent(event)}
                              onDelete={() => removeOwnEvent(event.id, event.title)}
                              onInfoEdit={canEditInfo ? () => setPreorderEditEvent(event) : undefined}
                              onHide={isOwn ? undefined : () => handleHideEvent(event.id)}
                              onAuthorClick={event.authorId ? () => setViewingUserId(event.authorId!) : undefined}
                            />
                          );
                        })}
                        {sheetPersonalEvents.map(pe => {
                          const ev: CalendarEvent = {
                            id: pe.id, title: pe.title, date: pe.date, time: pe.time, endDate: pe.endDate, endTime: pe.endTime,
                            category: pe.category, prefecture: pe.prefecture, memo: pe.memo, link: pe.link,
                            workName: '個人', likes: 0, likedByMe: false, createdAt: '',
                          };
                          return (
                            <EventTile
                              key={pe.id}
                              event={ev}
                              density="compact"
                              showImages={false}
                              workColor="var(--label-tertiary)"
                              important={importantEventIds.has(pe.id)}
                              onToggleImportant={() => setImportantEventIds(toggleImportantEventId(pe.id))}
                              isOwn
                              onEdit={() => openEditPersonalEvent(pe)}
                              onDelete={() => deletePersonalEvent(pe.id)}
                            />
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
          {(
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
              sortedListEvents.length === 0 ? (
                <p className="text-center text-label-tertiary text-sm py-10">{filterActive ? 'この地域の予定はありません' : 'この月の予定はまだありません'}</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {sortedListEvents.map(event => {
                    const isOwn = !!user && event.authorId === user.id;
                    const canEditInfo = !!event.workId && participatedWorks.some(w => w.id === event.workId);
                    return (
                      <EventTile
                        key={event.id}
                        event={event}
                        density="compact"
                        workColor={event.workId ? (workColorMap.get(event.workId) ?? 'var(--accent-color)') : 'var(--accent-color)'}
                        showImages={showImagesList}
                        liked={event.likedByMe}
                        likeLocked={lockedLikeIds.has(event.id) || !user}
                        onLike={el => { handleSheetEventLike(event.id); triggerLike(el); }}
                        myReaction={myReactions[event.id] ?? null}
                        onReact={() => setOpenReactionPickerId(prev => prev === event.id ? null : event.id)}
                        important={importantEventIds.has(event.id)}
                        onToggleImportant={() => setImportantEventIds(toggleImportantEventId(event.id))}
                        shareUrl={buildTweetUrl(event.title, workName, displayName)}
                        isOwn={isOwn}
                        onEdit={() => openEditEvent(event)}
                        onDelete={() => removeOwnEvent(event.id, event.title)}
                        onInfoEdit={canEditInfo ? () => setPreorderEditEvent(event) : undefined}
                        onHide={isOwn ? undefined : () => handleHideEvent(event.id)}
                        onAuthorClick={event.authorId ? () => setViewingUserId(event.authorId!) : undefined}
                      />
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
                <div className="flex flex-col gap-3">
                  {myCalendarListItems.map(item => {
                    const ev: CalendarEvent = {
                      id: item.id, title: item.title, date: item.date, dateLabel: item.dateLabel,
                      time: item.time, endDate: item.endDate, endTime: item.endTime,
                      category: item.category, prefecture: item.prefecture, memo: item.memo,
                      link: item.link, imageUrl: item.imageUrl, workId: item.workId,
                      workName: item.tag || undefined, authorId: item.authorId, authorName: item.authorName,
                      sourceUrl: item.sourceUrl,
                      isOrderMade: item.isOrderMade, preorderStart: item.preorderStart, preorderEnd: item.preorderEnd,
                      likes: item.likes ?? 0, likedByMe: item.likedByMe ?? false, createdAt: '',
                    };
                    if (item.isPersonal) {
                      return (
                        <EventTile
                          key={item.id}
                          event={ev}
                          density="compact"
                          workColor="var(--label-tertiary)"
                          showImages={showImagesList}
                          important={importantEventIds.has(item.id)}
                          onToggleImportant={() => setImportantEventIds(toggleImportantEventId(item.id))}
                          isOwn
                          onEdit={() => { const pe = personalEvents.find(p => p.id === item.id); if (pe) openEditPersonalEvent(pe); }}
                          onDelete={() => deletePersonalEvent(item.id)}
                        />
                      );
                    }
                    const isOwn = !!user && item.authorId === user.id;
                    const canEditInfo = !!item.workId && participatedWorks.some(w => w.id === item.workId);
                    return (
                      <EventTile
                        key={item.id}
                        event={ev}
                        density="compact"
                        workColor={item.workId ? (workColorMap.get(item.workId) ?? 'var(--accent-color)') : 'var(--accent-color)'}
                        showImages={showImagesList}
                        liked={ev.likedByMe}
                        likeLocked={lockedLikeIds.has(item.id) || !user}
                        onLike={el => { handleSheetEventLike(item.id); triggerLike(el); }}
                        myReaction={myReactions[item.id] ?? null}
                        onReact={() => setOpenReactionPickerId(prev => prev === item.id ? null : item.id)}
                        important={importantEventIds.has(item.id)}
                        onToggleImportant={() => setImportantEventIds(toggleImportantEventId(item.id))}
                        shareUrl={buildTweetUrl(item.title, item.tag || null, displayName)}
                        isOwn={isOwn}
                        onEdit={() => { const evt = visibleEvents.find(e => e.id === item.id); if (evt) openEditEvent(evt); }}
                        onDelete={() => removeOwnEvent(item.id, item.title)}
                        onInfoEdit={canEditInfo ? () => { const evt = visibleEvents.find(e => e.id === item.id); if (evt) setPreorderEditEvent(evt); } : undefined}
                        onHide={isOwn ? undefined : () => handleHideEvent(item.id)}
                        onAuthorClick={item.authorId ? () => setViewingUserId(item.authorId!) : undefined}
                      />
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
          className="fixed bottom-[72px] right-4 w-14 h-14 rounded-full flex items-center justify-center shadow-xl z-40 active:opacity-80"
          style={{ backgroundColor: 'var(--accent-color)', color: 'var(--accent-on)' }}
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
            <div className="mx-4 bg-bg-primary rounded-[18px] shadow-xl p-3 grid grid-cols-3 gap-1"
              style={{ animation: 'slideUpIn 0.25s cubic-bezier(0.32, 0.72, 0, 1) both' }}>
              {REACTIONS.map(r => (
                <button
                  key={r.type}
                  onClick={() => handleReaction(openReactionPickerId, r.type)}
                  className="flex flex-col items-center gap-1 px-2 py-2 rounded-xl active:opacity-60"
                  style={{ background: myReactions[openReactionPickerId] === r.type ? 'var(--bg-secondary)' : 'transparent' }}
                >
                  <img src={r.image} alt={r.label} className="h-8 w-auto" />
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
            <div className="mx-4 bg-bg-primary rounded-[18px] shadow-xl overflow-hidden"
              style={{ animation: 'slideUpIn 0.25s cubic-bezier(0.32, 0.72, 0, 1) both' }}>
              <p className="text-label-tertiary text-xs px-4 pt-3 pb-2">リンクを選択</p>
              {linkPickerLinks.map((url, i) => (
                <a key={i} href={safeHref(url)} target="_blank" rel="noopener noreferrer"
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
          className="fixed inset-x-0 max-w-app mx-auto z-[160] rounded-t-[18px] overflow-hidden"
          style={{
            bottom: BOTTOM_TAB_H,
            height: 380,
            backgroundColor: 'var(--bg-primary)',
            animation: 'slideUpPanel 0.28s cubic-bezier(0.32, 0.72, 0, 1) both',
            position: 'fixed',
          }}
        >
          {/* ヘッダー：絶対配置でtop固定 */}
          <div
            className="absolute inset-x-0 top-0 z-10 rounded-t-[18px]"
            style={{ backgroundColor: 'var(--bg-primary)' }}
          >
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-9 h-[5px] rounded-full" style={{ backgroundColor: 'var(--fill-primary)' }} />
            </div>
            <div className="px-4 pb-2 flex items-center justify-between">
              <p className="text-label-secondary text-xs">予定を追加</p>
              <div className="flex items-center gap-2">
                <button onClick={closePostForm} className="text-xs text-label-tertiary px-3 py-1.5 rounded-lg active:opacity-60">キャンセル</button>
                <button onClick={() => void handlePostSubmit()} disabled={postSubmitting || !!duplicateWarning} className="text-xs font-semibold px-4 py-1.5 rounded-lg active:opacity-70 disabled:opacity-40" style={{ backgroundColor: 'var(--accent-color)', color: 'var(--accent-on)' }}>
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
              {duplicateWarning && (
                <div className="rounded-xl border border-orange-400/40 bg-orange-400/10 p-3">
                  <p className="text-orange-400 text-xs font-semibold mb-0.5">
                    {duplicateWarning.kind === 'dateKeyword' ? '同じ日に似た予定があります' : '同じ予定がすでに登録されています'}
                  </p>
                  <p className="text-label-secondary text-xs mb-2 line-clamp-1">
                    「{duplicateWarning.existingEvent.title}」{duplicateWarning.existingEvent.prefecture ? `（${duplicateWarning.existingEvent.prefecture}）` : ''} {duplicateWarning.existingEvent.date}
                  </p>
                  <button
                    onClick={async () => {
                      if (!user) return;
                      const dw = duplicateWarning;
                      setDuplicateWarning(null);
                      try { await addLikeTap(dw.existingEvent.id, user.id); } catch { /* いいね失敗でも続行 */ }
                      const remaining = postCards.filter(c => c.id !== dw.cardId);
                      if (remaining.length === 0) {
                        closePostForm();
                      } else {
                        setPostCards(remaining);
                      }
                      showToast('予定を追加しました');
                    }}
                    className="w-full py-2 text-xs font-semibold rounded-lg active:opacity-70 mb-1.5"
                    style={{ backgroundColor: 'var(--accent-color)', color: 'var(--accent-on)' }}
                  >
                    この予定を追加
                  </button>
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => {
                        const ev = duplicateWarning.existingEvent;
                        setDuplicateWarning(null);
                        closePostForm();
                        // 自分の投稿 or 現在の作品カレンダー上のイベント → カレンダーシートへ
                        if (workId || ev.authorId === user?.id) {
                          const d = new Date(ev.date);
                          setYear(d.getFullYear());
                          setMonth(d.getMonth());
                          setSelectedDate(ev.date);
                          setSheetOpen(true);
                        } else {
                          // 他ユーザーの投稿 → 発見タブにスクロール
                          navigate('/discover', { state: { highlightEventId: ev.id } });
                        }
                      }}
                      className="flex-1 py-1.5 text-xs rounded-lg border active:opacity-70"
                      style={{ borderColor: 'var(--border-default)', color: 'var(--label-secondary)' }}
                    >
                      既存の予定を見る
                    </button>
                    <button
                      onClick={() => {
                        ignoredDupCardIdsRef.current.add(duplicateWarning.cardId);
                        setDuplicateWarning(null);
                        void handlePostSubmit();
                      }}
                      className="flex-1 py-1.5 text-xs rounded-lg border active:opacity-70"
                      style={{ borderColor: 'var(--border-default)', color: 'var(--label-secondary)' }}
                    >
                      別の予定として投稿
                    </button>
                  </div>
                </div>
              )}
              <SmartInputPanel onApply={applyParsedToPost} />
              {postCards.map((card, i) => (
                <div key={card.id} className="flex flex-col gap-1.5">
                  {liveDups[card.id] && duplicateWarning?.cardId !== card.id && (
                    <div className="rounded-lg border border-orange-400/40 bg-orange-400/10 px-3 py-2">
                      <p className="text-orange-400 text-[11px] font-semibold">似た予定がすでにあります</p>
                      <p className="text-label-secondary text-[11px] line-clamp-1">
                        「{liveDups[card.id].title}」{liveDups[card.id].prefecture ? `（${liveDups[card.id].prefecture}）` : ''} {liveDups[card.id].date}
                      </p>
                    </div>
                  )}
                  <InlineCardItem
                    card={card}
                    index={i}
                    total={postCards.length}
                    participatedWorks={workId ? undefined : participatedWorks}
                    onChange={patch => updatePostCard(card.id, patch)}
                    onToggle={() => togglePostCard(card.id)}
                    onRemove={() => removePostCard(card.id)}
                  />
                </div>
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
            className="fixed inset-x-0 max-w-app mx-auto z-[160] rounded-t-[18px] overflow-hidden"
            style={{
              bottom: BOTTOM_TAB_H,
              height: 380,
              backgroundColor: 'var(--bg-primary)',
              animation: 'slideUpPanel 0.28s cubic-bezier(0.32, 0.72, 0, 1) both',
            }}
          >
            {/* ヘッダー */}
            <div
              className="absolute inset-x-0 top-0 z-10 rounded-t-[18px]"
              style={{ backgroundColor: 'var(--bg-primary)' }}
            >
              <div className="flex justify-center pt-3 pb-1">
                <div className="w-9 h-[5px] rounded-full" style={{ backgroundColor: 'var(--fill-primary)' }} />
              </div>
              <div className="px-4 pb-2 flex items-center justify-between">
                <p className="text-label-secondary text-xs">予定を編集</p>
                <div className="flex items-center gap-2">
                  <button onClick={() => { setEditEventId(null); setEditForm(null); }} className="text-xs text-label-tertiary px-3 py-1.5 rounded-lg active:opacity-60">キャンセル</button>
                  <button onClick={handleEditSubmit} disabled={editSubmitting} className="text-xs font-semibold px-4 py-1.5 rounded-lg active:opacity-70 disabled:opacity-40" style={{ backgroundColor: 'var(--accent-color)', color: 'var(--accent-on)' }}>
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
                  <input type="text" value={editForm.title ?? ''} onChange={e => setEditForm(f => ({ ...f!, title: e.target.value }))} placeholder="タイトル" enterKeyHint="next" className={inputCls} />
                </div>
                {/* 日時 */}
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <label className="text-label-tertiary text-xs">
                      開始日{!(editForm.dateLabel) && <span className="text-red-400"> *</span>}
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        if (editForm.dateLabel) {
                          setEditForm(f => ({ ...f!, dateLabel: '' }));
                        } else {
                          const ym = editForm.date ? editForm.date.slice(0, 7) : new Date().toISOString().slice(0, 7);
                          setEditForm(f => ({ ...f!, dateLabel: '中旬', date: `${ym}-15` }));
                        }
                      }}
                      className="text-xs px-2 py-0.5 rounded-full border transition-colors"
                      style={editForm.dateLabel
                        ? { borderColor: 'var(--accent-color)', color: 'var(--accent-color)' }
                        : { borderColor: 'var(--border-default)', color: 'var(--label-tertiary)' }}
                    >
                      日付未定
                    </button>
                  </div>
                  {editForm.dateLabel ? (
                    <div className="flex flex-col gap-2">
                      <div className="flex gap-2">
                        <select
                          value={editForm.date ? editForm.date.slice(0, 4) : ''}
                          onChange={e => {
                            const year = e.target.value;
                            const seasonMonth: Record<string, string> = { '春頃': '04', '夏頃': '08', '秋頃': '11', '冬頃': '02' };
                            const labelDay: Record<string, string> = { '上旬': '05', '中旬': '15', '下旬': '25' };
                            const month = editForm.date ? editForm.date.slice(5, 7) : String(new Date().getMonth() + 1).padStart(2, '0');
                            const dl = editForm.dateLabel ?? '';
                            const mm = seasonMonth[dl] ?? month;
                            const day = seasonMonth[dl] ? '15'
                              : dl === '中' ? String(new Date(parseInt(year), parseInt(mm), 0).getDate()).padStart(2, '0')
                              : (labelDay[dl] ?? '15');
                            setEditForm(f => ({ ...f!, date: year ? `${year}-${mm}-${day}` : '' }));
                          }}
                          className={inputCls}
                        >
                          {[0, 1, 2].map(off => { const y = new Date().getFullYear() + off; return <option key={y} value={String(y)}>{y}年</option>; })}
                        </select>
                        {!['春頃', '夏頃', '秋頃', '冬頃'].includes(editForm.dateLabel ?? '') && (
                          <select
                            value={editForm.date ? editForm.date.slice(5, 7) : ''}
                            onChange={e => {
                              const month = e.target.value;
                              const year = editForm.date ? editForm.date.slice(0, 4) : String(new Date().getFullYear());
                              const labelDay: Record<string, string> = { '上旬': '05', '中旬': '15', '下旬': '25' };
                              const dl = editForm.dateLabel ?? '';
                              const day = dl === '中' && month
                                ? String(new Date(parseInt(year), parseInt(month), 0).getDate()).padStart(2, '0')
                                : (labelDay[dl] ?? '15');
                              setEditForm(f => ({ ...f!, date: month ? `${year}-${month}-${day}` : '' }));
                            }}
                            className={inputCls}
                          >
                            {Array.from({ length: 12 }, (_, i) => {
                              const m = String(i + 1).padStart(2, '0');
                              return <option key={m} value={m}>{i + 1}月</option>;
                            })}
                          </select>
                        )}
                      </div>
                      <select
                        value={editForm.dateLabel ?? ''}
                        onChange={e => {
                          const val = e.target.value;
                          const year = editForm.date ? editForm.date.slice(0, 4) : String(new Date().getFullYear());
                          const seasonMonth: Record<string, string> = { '春頃': '04', '夏頃': '08', '秋頃': '11', '冬頃': '02' };
                          const labelDay: Record<string, string> = { '上旬': '05', '中旬': '15', '下旬': '25' };
                          if (seasonMonth[val]) {
                            setEditForm(f => ({ ...f!, dateLabel: val, date: `${year}-${seasonMonth[val]}-15` }));
                          } else {
                            const month = editForm.date ? editForm.date.slice(5, 7) : String(new Date().getMonth() + 1).padStart(2, '0');
                            const day = val === '中'
                              ? String(new Date(parseInt(year), parseInt(month), 0).getDate()).padStart(2, '0')
                              : (labelDay[val] ?? '15');
                            setEditForm(f => ({ ...f!, dateLabel: val, date: `${year}-${month}-${day}` }));
                          }
                        }}
                        className={inputCls}
                      >
                        {[['上旬','上旬'],['中旬','中旬'],['下旬','下旬'],['月のみ','中'],['春頃','春頃'],['夏頃','夏頃'],['秋頃','秋頃'],['冬頃','冬頃']].map(([label, val]) => (
                          <option key={val} value={val}>{label}</option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <input type="date" value={editForm.date ?? ''} onChange={e => setEditForm(f => ({ ...f!, date: e.target.value }))} className={inputCls} />
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-label-tertiary text-xs mb-1.5 block">開始時間</label>
                      <input type="time" value={editForm.time ?? ''} onChange={e => setEditForm(f => ({ ...f!, time: e.target.value }))} className={inputCls} />
                    </div>
                    <div>
                      <label className="text-label-tertiary text-xs mb-1.5 block">終了時間</label>
                      <input type="time" value={editForm.endTime ?? ''} onChange={e => setEditForm(f => ({ ...f!, endTime: e.target.value }))} className={inputCls} />
                    </div>
                  </div>
                  {!editForm.dateLabel && (
                    <div>
                      <label className="text-label-tertiary text-xs mb-1.5 block">終了日（任意）</label>
                      <input type="date" value={editForm.endDate ?? ''} min={editForm.date || undefined} onChange={e => setEditForm(f => ({ ...f!, endDate: e.target.value }))} className={inputCls} />
                    </div>
                  )}
                </div>
                {/* カテゴリ（複数選択可） */}
                <div>
                  <label className="text-label-tertiary text-xs mb-1.5 block">カテゴリ（複数選択可）</label>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {POST_CATEGORIES.map(cat => {
                      const selected = (editForm.categories ?? []).includes(cat);
                      return (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => setEditForm(f => {
                            const cats = f?.categories ?? [];
                            let next: string[];
                            if (cats.includes(cat)) {
                              next = cats.filter(c => c !== cat);
                              if (cat === GOODS_PARENT) next = next.filter(c => !isGoodsSubcategory(c));
                            } else {
                              next = [...cats, cat];
                            }
                            return { ...f!, categories: normalizeGoodsCategories(next) };
                          })}
                          className={`px-3 py-1 rounded-full text-xs border transition-colors ${selected ? 'border-selected text-label-primary bg-label-primary/10' : 'border-default text-label-secondary'}`}
                        >
                          {cat}
                        </button>
                      );
                    })}
                    {(editForm.categories ?? []).filter(c => !(POST_CATEGORIES as readonly string[]).includes(c) && !isGoodsSubcategory(c)).map(cat => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setEditForm(f => ({ ...f!, categories: (f?.categories ?? []).filter(c => c !== cat) }))}
                        className="px-3 py-1 rounded-full text-xs border border-selected text-label-primary bg-label-primary/10 flex items-center gap-1"
                      >
                        {cat}<X size={11} />
                      </button>
                    ))}
                  </div>
                  {/* グッズの種類（グッズ選択時のみ・任意） */}
                  {(editForm.categories ?? []).includes(GOODS_PARENT) && (
                    <div className="mb-2 pl-3 border-l-2 border-faint">
                      <label className="text-label-tertiary text-[11px] mb-1.5 block">グッズの種類（任意・複数可）</label>
                      <div className="flex flex-wrap gap-2">
                        {GOODS_SUBCATEGORIES.map(sub => (
                          <button
                            key={sub}
                            type="button"
                            onClick={() => setEditForm(f => {
                              const cats = f?.categories ?? [];
                              const next = cats.includes(sub) ? cats.filter(c => c !== sub) : [...cats, sub];
                              return { ...f!, categories: normalizeGoodsCategories(next) };
                            })}
                            className={`px-3 py-1 rounded-full text-xs border transition-colors ${(editForm.categories ?? []).includes(sub) ? 'border-selected text-label-primary bg-label-primary/10' : 'border-default text-label-secondary'}`}
                          >
                            {sub}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <span className="text-label-tertiary text-xs flex-shrink-0">その他：</span>
                    <input
                      type="text"
                      value={editCustomInput}
                      onChange={e => setEditCustomInput(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          const v = editCustomInput.trim();
                          if (v) setEditForm(f => ({ ...f!, categories: (f?.categories ?? []).includes(v) ? (f?.categories ?? []) : [...(f?.categories ?? []), v] }));
                          setEditCustomInput('');
                        }
                      }}
                      onBlur={() => {
                        const v = editCustomInput.trim();
                        if (v) setEditForm(f => ({ ...f!, categories: (f?.categories ?? []).includes(v) ? (f?.categories ?? []) : [...(f?.categories ?? []), v] }));
                        setEditCustomInput('');
                      }}
                      placeholder="自由に入力（Enterで追加）"
                      className="flex-1 bg-bg-primary rounded-lg px-3 py-1.5 text-xs text-label-primary caret-label-primary placeholder:text-label-tertiary outline-none border border-faint focus:border-strong"
                    />
                  </div>
                  {/* 予約あり トグル */}
                  <div className="flex items-center justify-between mt-3">
                    <span className="text-xs text-label-secondary">予約あり</span>
                    <button
                      type="button"
                      onClick={() => {
                        const next = !editForm.isOrderMade;
                        const today = new Date().toISOString().slice(0, 10);
                        setEditForm(f => ({
                          ...f!,
                          isOrderMade: next,
                          preorderStart: next && !f?.preorderStart ? today : f?.preorderStart ?? '',
                        }));
                      }}
                      className="flex-shrink-0 w-9 h-5 rounded-full relative transition-colors"
                      style={{ background: editForm.isOrderMade ? 'var(--color-destructive)' : 'var(--fill-primary)' }}
                    >
                      <div className="absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all shadow-sm"
                        style={{ left: editForm.isOrderMade ? 'calc(100% - 18px)' : '2px' }} />
                    </button>
                  </div>
                  {editForm.isOrderMade && (
                    <div className="flex gap-2 mt-2">
                      <div className="flex-1">
                        <label className="text-[10px] text-label-tertiary block mb-1">予約開始日</label>
                        <input type="date" value={editForm.preorderStart ?? ''} onChange={e => setEditForm(f => ({ ...f!, preorderStart: e.target.value }))}
                          className="w-full bg-bg-primary rounded-lg px-2 py-1.5 text-xs text-label-primary outline-none border border-faint focus:border-strong" />
                      </div>
                      <div className="flex-1">
                        <label className="text-[10px] text-label-tertiary block mb-1">予約終了日</label>
                        <input type="date" value={editForm.preorderEnd ?? ''} min={editForm.preorderStart || undefined} onChange={e => setEditForm(f => ({ ...f!, preorderEnd: e.target.value }))}
                          className="w-full bg-bg-primary rounded-lg px-2 py-1.5 text-xs text-label-primary outline-none border border-faint focus:border-strong" />
                      </div>
                    </div>
                  )}
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
              <div className="bg-bg-secondary rounded-xl shadow-card overflow-hidden">
                <div className="flex items-center justify-between px-4 pt-4 pb-2">
                  <span className="text-label-primary text-sm font-semibold">{work.name} の表示カテゴリ</span>
                  <button onClick={clearAll} className="text-xs text-label-tertiary underline active:opacity-60">すべて表示</button>
                </div>
                <p className="px-4 text-[11px] text-label-tertiary mb-3">色ありが表示中。タップしたカテゴリを非表示にします</p>
                <div className="flex flex-wrap gap-2 px-4 pb-2">
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
                {/* グッズの種類で絞る（▾展開） */}
                <div className="px-4 pb-4">
                  <button onClick={() => setFilterGoodsOpen(o => !o)} className="text-[11px] text-label-tertiary active:opacity-60">
                    グッズの種類で絞る {filterGoodsOpen ? '▴' : '▾'}
                  </button>
                  {filterGoodsOpen && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {GOODS_SUBCATEGORIES.map(sub => {
                        const hidden = current.includes(sub);
                        return (
                          <button
                            key={sub}
                            onClick={() => toggle(sub)}
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
                            {sub}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        );
      })()}

      {preorderEditEvent && (
        <PreorderEditSheet
          event={preorderEditEvent}
          onClose={() => setPreorderEditEvent(null)}
          onSaved={updated => {
            setEvents(prev => prev.map(e => e.id === preorderEditEvent.id ? { ...e, ...updated } : e));
            setSheetDetailEvent(prev => prev?.id === preorderEditEvent.id ? { ...prev, ...updated } : prev);
            setListDetailEvent(prev => prev?.id === preorderEditEvent.id ? { ...prev, ...updated } : prev);
          }}
        />
      )}

      <BottomTab />

      {/* ─── キューレビューシート ─── */}
      {queueSheetOpen && (
        <>
          <div className="fixed inset-0 z-[180] bg-black/50" onClick={() => setQueueSheetOpen(false)} />
          <div
            className="fixed inset-x-0 max-w-app mx-auto z-[181] rounded-t-2xl overflow-hidden"
            style={{ bottom: BOTTOM_TAB_H, maxHeight: '75vh', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--bg-primary)', animation: 'slideUpPanel 0.28s cubic-bezier(0.32, 0.72, 0, 1) both' }}
          >
            <div style={{ flexShrink: 0, borderColor: 'var(--border-faint)' }} className="pt-3 px-4 pb-3 border-b">
              <div className="flex justify-center mb-2">
                <div className="w-10 h-1 rounded-full" style={{ backgroundColor: 'var(--border-subtle)' }} />
              </div>
              <div className="flex items-center justify-between">
                <p className="text-label-primary font-semibold text-sm">ストック済み予定</p>
                <button onClick={() => setQueueSheetOpen(false)} className="text-xs text-label-tertiary active:opacity-60">閉じる</button>
              </div>
            </div>
            <div style={{ flex: 1, minHeight: 0, overflowY: 'scroll', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}>
              <div className="px-4 pt-3 pb-4 flex flex-col gap-2">
                {eventQueue.map((ev, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
                    style={{ backgroundColor: 'var(--bg-secondary)' }}
                  >
                    <button
                      onClick={() => setQueueSelected(prev => { const s = new Set(prev); s.has(i) ? s.delete(i) : s.add(i); return s; })}
                      className="w-5 h-5 rounded flex-shrink-0 flex items-center justify-center"
                      style={{
                        backgroundColor: queueSelected.has(i) ? 'var(--accent-color)' : 'transparent',
                        border: `1.5px solid ${queueSelected.has(i) ? 'var(--accent-color)' : 'var(--border-default)'}`,
                      }}
                    >
                      {queueSelected.has(i) && <Check size={11} color="var(--accent-on)" strokeWidth={3} />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-label-primary truncate">{ev.title ?? '（タイトルなし）'}</p>
                      <p className="text-[10px] text-label-tertiary mt-0.5">
                        {[ev.date?.replace(/^\d{4}-/, '').replace('-', '/'), ev.time, ev.prefecture].filter(Boolean).join('  ')}
                      </p>
                    </div>
                    <button onClick={() => dismissQueue([i])} className="text-label-tertiary active:opacity-60 flex-shrink-0">
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ flexShrink: 0, borderColor: 'var(--border-faint)' }} className="px-4 pb-5 pt-2 flex gap-2 border-t">
              <button
                onClick={() => dismissQueue(Array.from(queueSelected))}
                disabled={queueSelected.size === 0}
                className="flex-1 py-2.5 rounded-xl text-xs text-label-tertiary active:opacity-70 disabled:opacity-40"
                style={{ backgroundColor: 'var(--bg-secondary)' }}
              >
                選択を削除
              </button>
              <button
                onClick={applyQueueSelected}
                disabled={queueSelected.size === 0}
                className="flex-2 px-5 py-2.5 rounded-xl text-xs font-semibold active:opacity-70 disabled:opacity-40"
                style={{ backgroundColor: 'var(--accent-color)', color: 'var(--accent-on)' }}
              >
                {queueSelected.size}件をカレンダーに追加
              </button>
            </div>
          </div>
        </>
      )}

      {renderLikeOverlay()}

      {viewingUserId && (
        <UserProfileModal userId={viewingUserId} onClose={() => setViewingUserId(null)} />
      )}
    </>
  );
}

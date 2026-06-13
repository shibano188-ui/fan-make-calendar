import { useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronDown, ChevronUp, X, Plus, Star } from 'lucide-react';
import Layout from '../components/Layout';
import Header from '../components/Header';
import SmartInputPanel, { type ParsedEvent } from '../components/SmartInputPanel';
import { createEvents } from '../lib/api';
import { PREFECTURES } from '../lib/prefectures';
import { parseLinks, serializeLinks, serializeCategories, loadImportantEventIds, saveImportantEventIds } from '../lib/constants';
import { useAuth } from '../contexts/AuthContext';
import type { CalendarEvent } from '../types';

// ─── 型定義 ────────────────────────────────────────────────────────

const CATEGORIES = ['単行本', 'グッズ', 'イベント', '誕生日', '配信'] as const;

interface PostCard {
  id: string;
  title: string;
  date: string;
  dateLabel: string;
  time: string;
  endDate: string;
  endTime: string;
  categories: string[];
  prefecture: string;
  locationDetail: string;
  locationMapLink: string;
  links: string[];
  memo: string;
  important: boolean;
  collapsed: boolean;
}

// ─── ユーティリティ ────────────────────────────────────────────────

function newCard(): PostCard {
  return {
    id: crypto.randomUUID(),
    title: '',
    date: '',
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
    important: false,
    collapsed: false,
  };
}

type EventInput = Pick<CalendarEvent, 'title' | 'date' | 'dateLabel' | 'time' | 'category' | 'link' | 'memo' | 'prefecture' | 'locationDetail' | 'locationMapLink'>;

function toEventInput(card: PostCard): EventInput {
  return {
    title: card.title,
    date: card.date || null,
    dateLabel: card.dateLabel || undefined,
    time: card.time || undefined,
    category: serializeCategories(card.categories),
    link: serializeLinks(card.links),
    memo: card.memo || undefined,
    prefecture: card.prefecture || undefined,
    locationDetail: card.locationDetail || undefined,
    locationMapLink: card.locationMapLink || undefined,
  };
}

// 入力フィールドの共通クラス
const inputCls =
  'w-full bg-bg-primary rounded-lg px-3 py-2 text-sm text-label-primary caret-label-primary placeholder:text-label-tertiary outline-none border border-faint focus:border-strong';

// ─── 単一カード ────────────────────────────────────────────────────

function PostCardItem({
  card,
  index,
  total,
  onChange,
  onToggle,
  onRemove,
}: {
  card: PostCard;
  index: number;
  total: number;
  onChange: (patch: Partial<PostCard>) => void;
  onToggle: () => void;
  onRemove: () => void;
}) {
  const [customInput, setCustomInput] = useState('');
  const customCats = card.categories.filter(c => !(CATEGORIES as readonly string[]).includes(c));
  const toggleCategory = (cat: string) => {
    onChange({
      categories: card.categories.includes(cat)
        ? card.categories.filter(c => c !== cat)
        : [...card.categories, cat],
    });
  };
  const addCustomCategory = () => {
    const v = customInput.trim();
    if (!v) return;
    if (!card.categories.includes(v)) onChange({ categories: [...card.categories, v] });
    setCustomInput('');
  };
  const hasPrefecture = card.prefecture.length > 0;

  return (
    <div className="bg-bg-secondary rounded-xl overflow-hidden">
      {/* カードヘッダー */}
      <div
        className="flex items-center justify-between px-4 py-3 cursor-pointer select-none"
        onClick={onToggle}
      >
        <span className="text-label-primary text-sm font-medium truncate flex-1 mr-2">
          予定 {index + 1}{card.title.trim() ? `：${card.title.trim()}` : ''}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={e => { e.stopPropagation(); onRemove(); }}
            disabled={total <= 1}
            className="w-6 h-6 flex items-center justify-center text-label-tertiary disabled:opacity-20 active:opacity-50"
            aria-label="削除"
          >
            <X size={14} />
          </button>
          {card.collapsed
            ? <ChevronDown size={16} className="text-label-tertiary" />
            : <ChevronUp size={16} className="text-label-tertiary" />
          }
        </div>
      </div>

      {/* フォーム */}
      {!card.collapsed && (
        <div className="px-4 pb-4 flex flex-col gap-4 border-t border-faint">
          {/* タイトル */}
          <div className="pt-3">
            <label className="text-label-tertiary text-xs mb-1.5 block">タイトル</label>
            <input
              type="text"
              value={card.title}
              onChange={e => onChange({ title: e.target.value })}
              placeholder="例：単行本 第15巻 発売"
              className={inputCls}
            />
          </div>

          {/* 日付・時間 */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label className="text-label-tertiary text-xs">日付</label>
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
              <input type="date" value={card.date} onChange={e => onChange({ date: e.target.value })} className={inputCls} />
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-label-tertiary text-xs mb-1.5 block">時間</label>
                <input type="time" value={card.time} onChange={e => onChange({ time: e.target.value })} className={inputCls} />
              </div>
            </div>
          </div>

          {/* カテゴリ（複数選択可） */}
          <div>
            <label className="text-label-tertiary text-xs mb-1.5 block">カテゴリ（複数選択可）</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {CATEGORIES.map(cat => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => toggleCategory(cat)}
                  className={`px-3 py-1 rounded-full text-xs border transition-colors ${
                    card.categories.includes(cat)
                      ? 'border-selected text-label-primary bg-label-primary/10'
                      : 'border-default text-label-secondary'
                  }`}
                >
                  {cat}
                </button>
              ))}
              {/* 選択済みのカスタムカテゴリ（×で除去） */}
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
            {/* カスタムカテゴリ追加 */}
            <div className="flex items-center gap-2">
              <span className="text-label-tertiary text-xs flex-shrink-0">その他：</span>
              <input
                type="text"
                value={customInput}
                onChange={e => setCustomInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustomCategory(); } }}
                onBlur={addCustomCategory}
                placeholder="自由に入力（Enterで追加）"
                className="flex-1 bg-bg-primary rounded-lg px-3 py-1.5 text-xs text-label-primary caret-label-primary placeholder:text-label-tertiary outline-none border border-faint focus:border-strong transition-colors"
              />
            </div>
          </div>

          {/* 場所（都道府県） */}
          <div>
            <label className="text-label-tertiary text-xs mb-1.5 block">場所（任意）</label>
            <select
              value={card.prefecture}
              onChange={e => onChange({ prefecture: e.target.value, locationDetail: e.target.value ? card.locationDetail : '', locationMapLink: e.target.value ? card.locationMapLink : '' })}
              className={`${inputCls} appearance-none`}
            >
              <option value="">全国（指定なし）</option>
              {PREFECTURES.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            {hasPrefecture && (
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

          {/* リンク（複数可） */}
          <div>
            <label className="text-label-tertiary text-xs mb-1.5 block">リンク（任意・複数可）</label>
            <div className="flex flex-col gap-2">
              {card.links.map((lnk, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type="url"
                    value={lnk}
                    onChange={e => {
                      const next = [...card.links];
                      next[i] = e.target.value;
                      onChange({ links: next });
                    }}
                    placeholder={i === 0 ? '購入先 / 公式ポストなど' : '追加リンク'}
                    className={`${inputCls} flex-1`}
                  />
                  {card.links.length > 1 && (
                    <button
                      type="button"
                      onClick={() => onChange({ links: card.links.filter((_, j) => j !== i) })}
                      className="w-7 h-7 flex items-center justify-center text-label-tertiary active:opacity-60 flex-shrink-0"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              ))}
              {card.links.length < 5 && (
                <button
                  type="button"
                  onClick={() => onChange({ links: [...card.links, ''] })}
                  className="flex items-center gap-1 text-xs text-label-tertiary active:opacity-60 mt-0.5 w-fit"
                >
                  <Plus size={12} />リンクを追加
                </button>
              )}
            </div>
          </div>

          {/* メモ */}
          <div>
            <label className="text-label-tertiary text-xs mb-1.5 block">メモ（任意）</label>
            <textarea
              value={card.memo}
              onChange={e => onChange({ memo: e.target.value })}
              placeholder="補足情報"
              rows={3}
              className={`${inputCls} resize-none`}
            />
          </div>

        </div>
      )}
    </div>
  );
}

// ─── メイン画面 ────────────────────────────────────────────────────

export default function PostCreate() {
  const { workId = '' } = useParams<{ workId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const initialDate = searchParams.get('date') ?? '';
  const [cards, setCards] = useState<PostCard[]>([{ ...newCard(), date: initialDate }]);
  const [isImportant, setIsImportant] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const updateCard = (id: string, patch: Partial<PostCard>) =>
    setCards(prev => prev.map(c => c.id === id ? { ...c, ...patch } : c));

  const toggleCard = (id: string) =>
    setCards(prev => prev.map(c => c.id === id ? { ...c, collapsed: !c.collapsed } : c));

  const removeCard = (id: string) =>
    setCards(prev => prev.filter(c => c.id !== id));

  const addCard = () =>
    setCards(prev => [...prev.map(c => ({ ...c, collapsed: true })), newCard()]);

  const applyParsed = (parsed: ParsedEvent) => {
    const filled = (c: PostCard) => c.title.trim() !== '' || c.date !== '';
    const parsedCard = (base: PostCard): PostCard => ({
      ...base,
      collapsed: false,
      title:          parsed.title          ?? base.title,
      date:           parsed.date           ?? base.date,
      dateLabel:      parsed.dateLabel      ?? base.dateLabel,
      time:           parsed.time           ?? base.time,
      endDate:        parsed.endDate        ?? base.endDate,
      endTime:        parsed.endTime        ?? base.endTime,
      categories:     parsed.category && !base.categories.includes(parsed.category)
                        ? [...base.categories, parsed.category]
                        : base.categories,
      prefecture:     parsed.prefecture     ?? base.prefecture,
      locationDetail: parsed.locationDetail ?? base.locationDetail,
      links:          parsed.link ? parseLinks(parsed.link).length > 0 ? parseLinks(parsed.link) : base.links : base.links,
      memo:           parsed.memo           ?? base.memo,
    });
    setCards(prev => {
      const [first, ...rest] = prev;
      if (!filled(first)) return [parsedCard(first), ...rest];
      return [...prev.map(c => ({ ...c, collapsed: true })), parsedCard({ ...newCard() })];
    });
  };

  const handleSubmit = async () => {
    if (!user) { setError('認証エラーです。リロードしてください'); return; }
    const invalid = cards.find(c => !c.title.trim());
    if (invalid) {
      setError('タイトルを入力してください');
      setCards(prev => prev.map(c => c.id === invalid.id ? { ...c, collapsed: false } : c));
      return;
    }
    const noCat = cards.find(c => c.categories.length === 0);
    if (noCat) {
      setError('カテゴリを選択してください');
      setCards(prev => prev.map(c => c.id === noCat.id ? { ...c, collapsed: false } : c));
      return;
    }
    const noDate = cards.find(c => !c.date && !c.dateLabel);
    if (noDate) {
      setError('日付を入力してください');
      setCards(prev => prev.map(c => c.id === noDate.id ? { ...c, collapsed: false } : c));
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      const createdIds = await createEvents(workId, cards.map(toEventInput), user.id);
      // 重要フラグをlocalStorageに保存
      if (isImportant) {
        const importantIds = loadImportantEventIds();
        createdIds.forEach(id => importantIds.add(id));
        saveImportantEventIds(importantIds);
      }
      navigate(`/calendar/${workId}`);
    } catch {
      setError('投稿に失敗しました。もう一度お試しください');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Layout>
      <Header
        title="予定を追加"
        closeMode
        rightAction={
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsImportant(v => !v)}
              className="w-8 h-8 flex items-center justify-center rounded-full border active:opacity-70"
              style={isImportant ? { borderColor: '#f59e0b', backgroundColor: 'rgba(245,158,11,0.12)' } : { borderColor: 'var(--border-default)' }}
            >
              <Star size={15} style={{ fill: isImportant ? '#f59e0b' : 'none', color: isImportant ? '#f59e0b' : 'var(--label-secondary)' }} />
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="text-sm font-medium text-label-primary px-3 py-1 rounded-lg bg-bg-secondary whitespace-nowrap active:opacity-70 disabled:opacity-40"
            >
              {submitting ? '投稿中…' : '投稿'}
            </button>
          </div>
        }
      />

      <div className="px-4 pt-4 pb-6 flex flex-col gap-3">
        <SmartInputPanel onApply={applyParsed} />

        {error && <p className="text-red-400 text-xs px-1">{error}</p>}

        {cards.map((card, i) => (
          <PostCardItem
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

        <p className="text-center text-label-tertiary text-xs mt-1">
          一度に複数の予定をまとめて投稿できます。
        </p>
      </div>
    </Layout>
  );
}

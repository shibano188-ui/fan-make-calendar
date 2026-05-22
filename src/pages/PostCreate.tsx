import { useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronDown, ChevronUp, X, Plus } from 'lucide-react';
import Layout from '../components/Layout';
import Header from '../components/Header';
import { createEvents } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import type { CalendarEvent } from '../types';

// ─── 型定義 ────────────────────────────────────────────────────────

const CATEGORIES = ['単行本', 'グッズ', 'イベント', '誕生日', '配信'] as const;
type Category = (typeof CATEGORIES)[number];

interface PostCard {
  id: string;
  title: string;
  date: string;
  time: string;
  category: Category | '';
  customCategory: string;
  link: string;
  memo: string;
  collapsed: boolean;
}

// ─── ユーティリティ ────────────────────────────────────────────────

function newCard(): PostCard {
  return {
    id: crypto.randomUUID(),
    title: '',
    date: '',
    time: '',
    category: '',
    customCategory: '',
    link: '',
    memo: '',
    collapsed: false,
  };
}

type EventInput = Pick<CalendarEvent, 'title' | 'date' | 'time' | 'category' | 'link' | 'memo'>;

function toEventInput(card: PostCard): EventInput {
  return {
    title: card.title,
    date: card.date,
    time: card.time || undefined,
    category: card.category || card.customCategory.trim() || undefined,
    link: card.link || undefined,
    memo: card.memo || undefined,
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
  const isCustomActive = !card.category && card.customCategory.trim().length > 0;

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
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-label-tertiary text-xs mb-1.5 block">日付</label>
              <input
                type="date"
                value={card.date}
                onChange={e => onChange({ date: e.target.value })}
                className={inputCls}
              />
            </div>
            <div>
              <label className="text-label-tertiary text-xs mb-1.5 block">時間</label>
              <input
                type="time"
                value={card.time}
                onChange={e => onChange({ time: e.target.value })}
                className={inputCls}
              />
            </div>
          </div>

          {/* カテゴリ */}
          <div>
            <label className="text-label-tertiary text-xs mb-1.5 block">カテゴリ</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {CATEGORIES.map(cat => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => onChange({ category: card.category === cat ? '' : cat, customCategory: '' })}
                  className={`px-3 py-1 rounded-full text-xs border transition-colors ${
                    card.category === cat
                      ? 'border-selected text-label-primary bg-label-primary/10'
                      : 'border-default text-label-secondary'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
            {/* カスタムカテゴリ */}
            <div className="flex items-center gap-2">
              <span className="text-label-tertiary text-xs flex-shrink-0">その他：</span>
              <input
                type="text"
                value={card.customCategory}
                onChange={e => onChange({ customCategory: e.target.value, category: '' })}
                placeholder="自由に入力"
                className={`flex-1 bg-bg-primary rounded-lg px-3 py-1.5 text-xs text-label-primary caret-label-primary placeholder:text-label-tertiary outline-none border transition-colors ${
                  isCustomActive ? 'border-default' : 'border-faint focus:border-strong'
                }`}
              />
            </div>
          </div>

          {/* リンク */}
          <div>
            <label className="text-label-tertiary text-xs mb-1.5 block">リンク（任意）</label>
            <input
              type="url"
              value={card.link}
              onChange={e => onChange({ link: e.target.value })}
              placeholder="購入先 / 公式ポストなど"
              className={inputCls}
            />
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

  const handleSubmit = async () => {
    if (!user) { setError('認証エラーです。リロードしてください'); return; }
    const invalid = cards.find(c => !c.title.trim() || !c.date);
    if (invalid) {
      setError('すべてのカードにタイトルと日付を入力してください');
      setCards(prev => prev.map(c => c.id === invalid.id ? { ...c, collapsed: false } : c));
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      await createEvents(workId, cards.map(toEventInput), user.id);
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
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="text-sm font-medium text-label-primary px-3 py-1 rounded-lg bg-bg-secondary whitespace-nowrap active:opacity-70 disabled:opacity-40"
          >
            {submitting ? '投稿中…' : '投稿'}
          </button>
        }
      />

      <div className="px-4 pt-4 pb-6 flex flex-col gap-3">
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

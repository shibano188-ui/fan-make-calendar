import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { CalendarEvent } from '../types';
import ItemCard from '../components/item/ItemCard';
import Chip from '../components/ui/Chip';
import SavedCalendar from '../components/SavedCalendar';
import { SkeletonList } from '../components/ui/Skeleton';
import { todayStr } from '../design/tokens';
import { listSavedEvents, toggleLike, toggleCalendarAdd } from '../lib/api';
import { resolveBuy } from '../lib/affiliate';
import { addToCalendar } from '../lib/googleCalendar';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../components/ui/Toast';
import { haptic } from '../lib/haptics';

type Tab = 'all' | 'liked' | 'mine';
type View = 'list' | 'month' | 'week' | 'day';

const VIEWS: { key: View; label: string }[] = [
  { key: 'month', label: '月' },
  { key: 'week', label: '週' },
  { key: 'day', label: '日' },
  { key: 'list', label: 'リスト' },
];

export default function Saved() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const toast = useToast();
  const [items, setItems] = useState<CalendarEvent[] | null>(null);
  const [tab, setTab] = useState<Tab>('all');
  const [view, setView] = useState<View>('month');
  const today = todayStr();
  const rootRef = useRef<HTMLDivElement>(null);

  // 開いたら最上部から表示
  useEffect(() => {
    let el = rootRef.current?.parentElement as HTMLElement | null;
    while (el) {
      const oy = getComputedStyle(el).overflowY;
      if (oy === 'auto' || oy === 'scroll') el.scrollTop = 0;
      el = el.parentElement;
    }
    window.scrollTo(0, 0);
  }, [items]);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    listSavedEvents(user.id).then((d) => alive && setItems(d)).catch(() => alive && setItems([]));
    return () => { alive = false; };
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // いいねトグル: 解除したら（自分の投稿でなければ）一覧から外す
  const onLike = async (e: CalendarEvent) => {
    haptic.select();
    if (!user) return;
    const r = await toggleLike(e.id, user.id);
    setItems((prev) => {
      if (!prev) return prev;
      return prev.flatMap((it) => {
        if (it.id !== e.id) return [it];
        if (!r.liked && it.authorId !== user.id) return [];
        return [{ ...it, likedByMe: r.liked, likes: r.count }];
      });
    });
  };

  const visible = useMemo(() => {
    let list = items ?? [];
    if (tab === 'liked') list = list.filter((e) => e.likedByMe);
    if (tab === 'mine') list = list.filter((e) => e.authorId === user?.id);
    // 近い順: これから(昇順) → 過去(降順)
    const ref = (e: CalendarEvent) => e.endDate || e.date || '';
    const up = list.filter((e) => !ref(e) || ref(e) >= today).sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999'));
    const past = list.filter((e) => ref(e) && ref(e) < today).sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
    return [...up, ...past];
  }, [items, tab, user?.id, today]);

  const onBuy = (e: CalendarEvent) => { haptic.select(); const { url } = resolveBuy(e); if (url) window.open(url, '_blank', 'noopener'); };
  const onCalendar = async (e: CalendarEvent) => {
    haptic.select();
    const r = await addToCalendar(e);
    if (r !== 'fail' && user) toggleCalendarAdd(e.id, user.id).catch(() => {});
    toast(r === 'google' ? 'Googleカレンダーに追加しました' : r === 'ics' ? 'カレンダーに追加しました' : '日付未定のため追加できません');
  };

  return (
    <div ref={rootRef} className="px-3 pt-3">
      {/* 表示切替: リスト / 月 / 週 / 日 */}
      <div className="sticky top-0 z-20 py-1" style={{ backgroundColor: 'var(--bg-primary)' }}>
        <div className="flex p-0.5 rounded-[10px] mb-2" style={{ backgroundColor: 'var(--fill-tertiary)' }}>
          {VIEWS.map((v) => (
            <button key={v.key} onClick={() => { haptic.select(); setView(v.key); }}
              className="flex-1 text-[13px] font-semibold py-1.5 rounded-[8px] pressable transition-colors"
              style={view === v.key
                ? { backgroundColor: 'var(--bg-primary)', color: 'var(--label-primary)', boxShadow: '0 1px 2px rgba(0,0,0,0.12)' }
                : { color: 'var(--label-secondary)' }}>
              {v.label}
            </button>
          ))}
        </div>
        {view === 'list' && (
          <div className="flex gap-2 pb-1">
            <Chip active={tab === 'all'} onClick={() => { haptic.select(); setTab('all'); }}>すべて</Chip>
            <Chip active={tab === 'liked'} onClick={() => { haptic.select(); setTab('liked'); }}>いいね</Chip>
            <Chip active={tab === 'mine'} onClick={() => { haptic.select(); setTab('mine'); }}>自分の投稿</Chip>
          </div>
        )}
      </div>

      {items === null ? (
        <SkeletonList count={4} />
      ) : view !== 'list' ? (
        items.length === 0 ? (
          <p className="text-center text-label-secondary text-[13px] py-20">
            まだ保存がありません<br />
            気になるグッズ・イベントに ♡ を押すとここに溜まります
          </p>
        ) : (
          <SavedCalendar events={items} scope={view}
            onOpen={(e) => navigate(`/item/${e.id}`)} onLike={onLike} onCalendar={onCalendar} onBuy={onBuy} />
        )
      ) : visible.length === 0 ? (
        <p className="text-center text-label-secondary text-[13px] py-20">
          {tab === 'mine' ? 'まだ投稿がありません' : 'まだ保存がありません'}<br />
          気になるグッズ・イベントに ♡ を押すとここに溜まります
        </p>
      ) : (
        <div className="flex flex-col gap-2 pb-4">
          {visible.map((e) => (
            <ItemCard key={e.id} event={e} layout="list" likedInit={e.likedByMe}
              onOpen={() => navigate(`/item/${e.id}`)} onLike={() => onLike(e)} onCalendar={() => onCalendar(e)} onBuy={() => onBuy(e)} />
          ))}
        </div>
      )}
    </div>
  );
}

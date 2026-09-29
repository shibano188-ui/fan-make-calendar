import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { X, Trash2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../components/ui/Toast';
import { useConfirm } from '../components/ui/ConfirmDialog';
import Chip from '../components/ui/Chip';
import { haptic } from '../lib/haptics';
import { POST_CATEGORIES } from '../lib/constants';
import { getCached, setCached } from '../lib/swrCache';
import { updateSaved } from '../lib/savedStore';
import {
  listAllParticipatedWorks, createPersonalEvent, updatePersonalEvent, deletePersonalEvent, getPersonalEvent,
  type Work, type PersonalEventInput,
} from '../lib/api';

// 自分用の予定（2026-09-29 投稿の方法の作り直し）。カレンダーの右下の「＋」と、日のパネルの「＋」から開く。
// 本人のカレンダーにだけ入る。必須はフォロー中の作品とタイトルだけで、ほかは全部任意。
// **重複の検知はしない**（自分のメモなので邪魔になるだけ。柴野）。
//   /personal/new?date=YYYY-MM-DD … 新しく作る（日付は押した日を入れておく）
//   /personal/:id                  … 直す・消す

const inputCls = 'w-full rounded-[10px] px-3 py-2.5 text-[14px] outline-none';
const dateCls = 'flex-1 min-w-0 rounded-[10px] px-3 py-2.5 text-[14px] outline-none';
const inputStyle = { backgroundColor: 'var(--fill-tertiary)', color: 'var(--input-text)' };
const labelCls = 'text-[12px] text-label-secondary mb-1 mt-4';

export default function PersonalEventForm() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [params] = useSearchParams();
  const { user } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const editing = !!id && id !== 'new';

  const [works, setWorks] = useState<Work[]>(() => (user ? getCached<Work[]>(`follows:${user.id}`) ?? [] : []));
  const [workId, setWorkId] = useState<string>('');
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(params.get('date') ?? '');
  const [endDate, setEndDate] = useState('');
  const [time, setTime] = useState('');
  const [category, setCategory] = useState<string>('');
  const [memo, setMemo] = useState('');
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);

  const goBack = () => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) navigate(-1);
    else navigate('/saved', { replace: true });
  };

  useEffect(() => {
    if (!user) return;
    listAllParticipatedWorks(user.id).then((ws) => { setWorks(ws); setCached(`follows:${user.id}`, ws); }).catch(() => {});
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // フォローが1つだけなら最初から選んでおく
  useEffect(() => { if (!editing && !workId && works.length === 1) setWorkId(works[0].id); }, [works]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!editing) return;
    getPersonalEvent(id!).then((e) => {
      if (!e) { toast('予定が見つかりませんでした', 'error'); goBack(); return; }
      setWorkId(e.workId ?? ''); setTitle(e.title); setDate(e.date ?? ''); setEndDate(e.endDate ?? '');
      setTime(e.time ?? ''); setCategory(e.category ?? ''); setMemo(e.memo ?? ''); setLink(e.link ?? '');
    }).catch(() => {});
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const ready = !!workId && !!title.trim() && !busy;
  const input = (): PersonalEventInput => ({ workId, title, date: date || null, endDate: endDate || null, time: time || null, category: category || null, memo, link });

  const save = async () => {
    if (!ready || !user) return;
    haptic.select();
    setBusy(true);
    try {
      if (editing) {
        await updatePersonalEvent(id!, input());
        toast('保存しました');
      } else {
        const ev = await createPersonalEvent(input());
        // カレンダーに戻ったとき、取り直しを待たずに出す
        updateSaved(user.id, (list) => [...list, ev]);
        toast('カレンダーに追加しました');
      }
      goBack();
    } catch {
      toast('保存できませんでした', 'error');
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!editing || !user) return;
    if (!(await confirm({ title: 'この予定を消しますか？', confirmLabel: '消す', destructive: true }))) return;
    haptic.select();
    try {
      await deletePersonalEvent(id!);
      updateSaved(user.id, (list) => list.filter((e) => e.id !== id));
      toast('消しました');
      goBack();
    } catch { toast('消せませんでした', 'error'); }
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <div className="mx-auto w-full max-w-app">
        <div className="sticky top-0 z-20 flex items-center justify-between px-3 py-2.5 material-bar scroll-edge" style={{ paddingTop: 'calc(var(--sat) + 10px)' }}>
          <div className="flex items-center gap-1 min-w-0">
            <button onPointerDown={(e) => { e.preventDefault(); goBack(); }} aria-label="閉じる" className="pressable tap-44 p-1"><X size={22} /></button>
            <span className="font-semibold truncate">{editing ? '自分の予定を直す' : '自分の予定を追加'}</span>
          </div>
          <button onClick={save} disabled={!ready}
            className="pressable px-4 py-1.5 rounded-full text-[14px] font-semibold"
            style={ready ? { backgroundColor: 'var(--accent-color)', color: 'var(--accent-on)' } : { backgroundColor: 'var(--fill-tertiary)', color: 'var(--label-tertiary)' }}>
            保存
          </button>
        </div>

        <div className="px-4 pb-10">
          <p className="text-[12px] text-label-tertiary mt-2">あなたのカレンダーにだけ入ります。ほかの人には見えません。</p>

          <div className={labelCls}>作品 <span style={{ color: 'var(--color-destructive)' }}>*</span></div>
          {works.length === 0 ? (
            <p className="text-[13px] text-label-secondary">フォロー中の作品がありません。先に作品をフォローしてください。</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {works.map((w) => <Chip key={w.id} active={workId === w.id} onClick={() => { haptic.select(); setWorkId(w.id); }}>{w.name}</Chip>)}
            </div>
          )}

          <div className={labelCls}>タイトル <span style={{ color: 'var(--color-destructive)' }}>*</span></div>
          <input value={title} onChange={(e) => setTitle(e.target.value.slice(0, 200))} placeholder="例: 友だちとコラボカフェ" className={inputCls} style={inputStyle} />

          <div className={labelCls}>日付</div>
          <div className="flex items-center gap-2">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={dateCls} style={inputStyle} />
            <span className="text-label-tertiary text-[13px]">〜</span>
            <input type="date" value={endDate} min={date || undefined} onChange={(e) => setEndDate(e.target.value)} disabled={!date} className={dateCls} style={inputStyle} />
          </div>

          <div className={labelCls}>時刻</div>
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} disabled={!date} className={inputCls} style={inputStyle} />

          <div className={labelCls}>カテゴリ</div>
          <div className="flex flex-wrap gap-1.5">
            {POST_CATEGORIES.map((c) => <Chip key={c} active={category === c} onClick={() => { haptic.select(); setCategory(category === c ? '' : c); }}>{c}</Chip>)}
          </div>

          <div className={labelCls}>メモ</div>
          <textarea value={memo} onChange={(e) => setMemo(e.target.value.slice(0, 2000))} rows={3}
            className={`${inputCls} resize-none`} style={inputStyle} />

          <div className={labelCls}>リンク</div>
          <input value={link} onChange={(e) => setLink(e.target.value)} inputMode="url" placeholder="https://" className={inputCls} style={inputStyle} />

          {editing && (
            <button onClick={remove} className="pressable mt-8 flex items-center gap-1.5 text-[14px]" style={{ color: 'var(--color-destructive)' }}>
              <Trash2 size={16} /> この予定を消す
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

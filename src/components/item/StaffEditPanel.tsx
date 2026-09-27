// 運営（staff.role = 'admin'）と投稿者が、予定をほぼ全部直せるパネル（本人要望・2026-09-27）。
// 巡回ボットが入れた予定を、各自の担当の作品で直してもらう前提。
// タイトル・説明・カテゴリ・画像（1枚ずつ外せる）を直接書き換え、予定ごと消すこともできる。
// 日付・購入リンクは今までどおり詳細ページの「日付を修正」「修正」から（編集履歴に残る）。
import { useState } from 'react';
import { X } from 'lucide-react';
import type { CalendarEvent } from '../../types';
import { POST_CATEGORIES, GOODS_SUBCATEGORIES, parseCategories, serializeCategories, normalizeGoodsCategories, parseImageUrls, serializeImageUrls } from '../../lib/constants';
import { updateEvent, deleteEvent } from '../../lib/api';
import { useConfirm } from '../ui/ConfirmDialog';
import { useToast } from '../ui/Toast';
import { haptic } from '../../lib/haptics';

export default function StaffEditPanel({ event, onSaved, onDeleted, onClose }: {
  event: CalendarEvent;
  onSaved: (patch: Pick<CalendarEvent, 'title' | 'memo' | 'category' | 'imageUrl'>) => void;
  onDeleted: () => void;
  onClose: () => void;
}) {
  const confirm = useConfirm();
  const toast = useToast();
  const [title, setTitle] = useState(event.title);
  const [memo, setMemo] = useState(event.memo ?? '');
  const [cats, setCats] = useState<string[]>(parseCategories(event.category));
  const [images, setImages] = useState<string[]>(parseImageUrls(event.imageUrl));
  const [saving, setSaving] = useState(false);

  const toggle = (c: string) => { haptic.select(); setCats((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c])); };

  const onSave = async () => {
    if (!title.trim()) { toast('タイトルを入れてください'); return; }
    setSaving(true);
    const patch = {
      title: title.trim(),
      memo: memo.trim() || undefined,
      category: serializeCategories(normalizeGoodsCategories(cats)),
      imageUrl: serializeImageUrls(images),
    };
    try {
      await updateEvent(event.id, patch);
      onSaved(patch);
      toast('直しました');
    } catch { toast('直せませんでした'); }
    setSaving(false);
  };

  const onDelete = async () => {
    if (!(await confirm({ title: 'この予定を消しますか？', message: '元に戻せません', confirmLabel: '消す', destructive: true }))) return;
    try { await deleteEvent(event.id); toast('消しました'); onDeleted(); }
    catch { toast('消せませんでした'); }
  };

  const chip = (c: string) => (
    <button key={c} onClick={() => toggle(c)} className="pressable text-[12px] px-2.5 py-1 rounded-full"
      style={cats.includes(c) ? { backgroundColor: 'var(--accent-color)', color: 'var(--accent-on)' } : { backgroundColor: 'var(--fill-tertiary)', color: 'var(--label-secondary)' }}>{c}</button>
  );
  const inputStyle = { backgroundColor: 'var(--fill-tertiary)', color: 'var(--input-text)' };

  return (
    <div className="mt-3 rounded-[12px] p-3 flex flex-col gap-3" style={{ border: '1px solid var(--separator, rgba(120,120,128,0.3))' }}>
      <label className="flex flex-col gap-1">
        <span className="text-[12px] text-label-secondary">タイトル</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} className="rounded-[10px] px-3 py-2 text-[14px] outline-none" style={inputStyle} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-[12px] text-label-secondary">説明</span>
        <textarea value={memo} onChange={(e) => setMemo(e.target.value)} rows={3} className="rounded-[10px] px-3 py-2 text-[14px] outline-none resize-none" style={inputStyle} />
      </label>
      <div className="flex flex-col gap-1.5">
        <span className="text-[12px] text-label-secondary">カテゴリ</span>
        <div className="flex flex-wrap gap-1.5">{POST_CATEGORIES.map(chip)}</div>
        {cats.includes('グッズ') && <div className="flex flex-wrap gap-1.5">{GOODS_SUBCATEGORIES.map(chip)}</div>}
      </div>
      {images.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[12px] text-label-secondary">画像（× で外す）</span>
          <div className="flex flex-wrap gap-2">
            {images.map((src) => (
              <div key={src} className="relative w-[72px] h-[72px] rounded-[8px] overflow-hidden" style={{ backgroundColor: 'var(--fill-tertiary)' }}>
                <img src={src} alt="" className="w-full h-full object-cover" />
                <button onClick={() => { haptic.select(); setImages((prev) => prev.filter((x) => x !== src)); }} aria-label="この画像を外す"
                  className="pressable absolute top-0.5 right-0.5 w-6 h-6 rounded-full flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.6)', color: '#fff' }}>
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="flex gap-2">
        <button onClick={onSave} disabled={saving} className="pressable flex-1 py-2 rounded-[10px] text-[13px] font-semibold" style={{ backgroundColor: 'var(--accent-color)', color: 'var(--accent-on)' }}>保存</button>
        <button onClick={onClose} className="pressable px-4 py-2 rounded-[10px] text-[13px]" style={{ backgroundColor: 'var(--fill-tertiary)', color: 'var(--label-primary)' }}>閉じる</button>
      </div>
      <button onClick={onDelete} className="pressable text-left text-[13px] font-semibold" style={{ color: 'var(--color-destructive)' }}>この予定を消す</button>
    </div>
  );
}

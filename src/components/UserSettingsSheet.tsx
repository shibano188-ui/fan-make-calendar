import { useState, useMemo } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { PREFECTURES } from '../lib/prefectures';

const inputCls =
  'w-full bg-bg-primary rounded-lg px-3 py-2 text-sm text-label-primary caret-label-primary placeholder:text-label-tertiary outline-none border border-faint focus:border-strong';

// ─── 都道府県選択（クリックで展開・親がスクロール） ────────────────

export function PrefectureSearch({
  value,
  onChange,
  placeholder = '都道府県を検索',
}: {
  value: string;
  onChange: (pref: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const filtered = useMemo(
    () => (query ? PREFECTURES.filter(p => p.includes(query)) : PREFECTURES),
    [query],
  );

  const close = () => { setOpen(false); setQuery(''); };

  return (
    <div className="flex flex-col gap-1.5">
      {/* トリガーボタン */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-2.5 text-sm bg-bg-secondary border border-faint rounded-xl active:opacity-70"
      >
        <span className={value ? 'text-label-primary font-medium' : 'text-label-tertiary'}>
          {value || '都道府県を選択...'}
        </span>
        {open
          ? <ChevronUp size={14} className="text-label-tertiary flex-shrink-0" />
          : <ChevronDown size={14} className="text-label-tertiary flex-shrink-0" />
        }
      </button>

      {/* 展開リスト（maxHeight・内部スクロールなし → 親コンテナがスクロール） */}
      {open && (
        <div className="bg-bg-secondary border border-faint rounded-xl overflow-hidden">
          {/* 検索欄 */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-faint">
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={placeholder}
              className="flex-1 text-sm bg-transparent outline-none text-label-primary placeholder:text-label-tertiary caret-label-primary"
              autoFocus
            />
            <button
              type="button"
              onClick={close}
              className="text-xs text-label-tertiary whitespace-nowrap active:opacity-60"
            >
              閉じる
            </button>
          </div>

          {/* 選択肢（スクロールなし・インライン展開） */}
          <button
            type="button"
            onClick={() => { onChange(''); close(); }}
            className={`w-full text-left px-3 py-2.5 text-sm border-b border-faint ${!value ? 'text-label-primary font-medium' : 'text-label-tertiary'}`}
          >
            指定なし
          </button>
          {filtered.map((p, i) => (
            <button
              key={p}
              type="button"
              onClick={() => { onChange(p); close(); }}
              className={`w-full text-left px-3 py-2.5 text-sm active:opacity-60 ${
                i < filtered.length - 1 ? 'border-b border-faint' : ''
              } ${value === p ? 'text-label-primary font-semibold bg-label-primary/5' : 'text-label-secondary'}`}
            >
              {p}
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="px-3 py-3 text-xs text-label-tertiary">見つかりません</p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── ユーザー設定シート ────────────────────────────────────────────

export default function UserSettingsSheet({
  homePref,
  displayName,
  onSave,
  onClose,
}: {
  homePref: string | null;
  displayName: string | null;
  onSave: (homePref: string | null, displayName: string) => Promise<void>;
  onClose: () => void;
}) {
  const [pref, setPref] = useState(homePref ?? '');
  const [name, setName] = useState(displayName ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await onSave(pref || null, name);
    setSaving(false);
    setSaved(true);
    setTimeout(() => { setSaved(false); onClose(); }, 700);
  };

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
            <p className="text-label-primary font-semibold text-sm">ユーザー設定</p>
            <button onClick={onClose} className="text-xs text-label-secondary active:opacity-60">閉じる</button>
          </div>
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
          {/* 表示名 */}
          <div className="mb-5">
            <label className="text-label-tertiary text-xs mb-1.5 block">表示名（任意）</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="匿名"
              className={inputCls}
              maxLength={20}
            />
            <p className="text-label-tertiary text-[10px] mt-1 px-1">投稿者として表示されます（今後対応予定）</p>
          </div>

          {/* ホーム県 */}
          <div className="mb-6">
            <label className="text-label-tertiary text-xs mb-1.5 block">ホーム県</label>
            <p className="text-label-tertiary text-[10px] mb-2 px-1">
              設定するとカレンダーを開いたとき自動で絞り込まれます
            </p>
            <PrefectureSearch
              value={pref}
              onChange={setPref}
              placeholder="都道府県を検索"
            />
          </div>

          {/* 保存ボタン */}
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full py-3 rounded-xl bg-label-primary text-bg-primary font-semibold text-sm active:opacity-70 disabled:opacity-40"
          >
            {saved ? '保存しました ✓' : saving ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}

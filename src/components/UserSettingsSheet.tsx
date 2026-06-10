import { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { PREFECTURES } from '../lib/prefectures';
import { loadImageVisibility, saveImageVisibility, type ImageVisibility } from '../lib/constants';
import { supabase } from '../lib/supabase';
import { useToast } from './ui/Toast';

const inputCls =
  'w-full bg-bg-primary rounded-lg px-3 py-2 text-sm text-label-primary caret-label-primary placeholder:text-label-tertiary outline-none border border-separator focus:border-strong';

// ─── 都道府県選択（検索欄 + ドロップダウンボタン分離） ─────────────

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

  const select = (pref: string) => {
    onChange(pref);
    setOpen(false);
    setQuery('');
  };

  return (
    <div className="flex flex-col gap-1.5">
      {/* ① 検索入力欄（常時表示） */}
      <input
        type="text"
        value={query}
        onChange={e => { setQuery(e.target.value); if (e.target.value) setOpen(true); }}
        placeholder={placeholder}
        className={inputCls}
      />

      {/* ② ドロップダウントリガーボタン（常時表示） */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-2.5 text-sm bg-bg-secondary border border-separator rounded-[14px] active:opacity-70"
      >
        <span className={value ? 'text-label-primary font-medium' : 'text-label-tertiary'}>
          {value || '都道府県を選択...'}
        </span>
        {open
          ? <ChevronUp size={14} className="text-label-tertiary flex-shrink-0" />
          : <ChevronDown size={14} className="text-label-tertiary flex-shrink-0" />
        }
      </button>

      {/* ③ 選択肢リスト（内部スクロールなし・親コンテナがスクロール） */}
      {open && (
        <div className="bg-bg-secondary border border-separator rounded-[14px] overflow-hidden">
          <button
            type="button"
            onClick={() => select('')}
            className={`w-full text-left px-3 py-2.5 text-sm border-b border-separator ${!value ? 'text-label-primary font-medium' : 'text-label-tertiary'}`}
          >
            指定なし
          </button>
          {filtered.map((p, i) => (
            <button
              key={p}
              type="button"
              onClick={() => select(p)}
              className={`w-full text-left px-3 py-2.5 text-sm active:opacity-60 ${
                i < filtered.length - 1 ? 'border-b border-separator' : ''
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
  const [pref, setPref]           = useState(homePref ?? '');
  const [name, setName]           = useState(displayName ?? '');
  const [saving, setSaving]       = useState(false);
  const showToast = useToast();
  const [saved, setSaved]         = useState(false);
  const [imgVis, setImgVis]       = useState<ImageVisibility>(() => loadImageVisibility());
  const [delConfirm, setDelConfirm] = useState(false);
  const [deleting, setDeleting]   = useState(false);

  const handleDeleteAccount = async () => {
    setDeleting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error('no session');
      const res = await fetch('/api/delete-account', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('failed');
      await supabase.auth.signOut();
      window.location.href = '/';
    } catch {
      showToast('削除に失敗しました。しばらくして再試行してください', 'error');
      setDeleting(false);
      setDelConfirm(false);
    }
  };
  const handleSave = async () => {
    setSaving(true);
    await onSave(pref || null, name);
    setSaving(false);
    setSaved(true);
    setTimeout(() => { setSaved(false); onClose(); }, 700);
  };

  // Header の backdrop-filter が fixed の基準になる（Chromium）ため body 直下に描画する
  return createPortal(
    <div className="fixed inset-0 z-[200] max-w-app mx-auto flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div
        className="relative bg-bg-primary rounded-t-[18px]"
        style={{
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          animation: 'slideUpPanel 0.28s cubic-bezier(0.32, 0.72, 0, 1) both',
        }}
      >
        {/* 固定ヘッダー */}
        <div style={{ flexShrink: 0 }} className="pt-3 px-4 pb-3 border-b border-separator">
          <div className="flex justify-center mb-2">
            <div className="w-9 h-[5px] rounded-full" style={{ backgroundColor: 'var(--fill-primary)' }} />
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
            <p className="text-label-tertiary text-[10px] mt-1 px-1">投稿したイベントに表示されます</p>
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

          {/* 画像表示 */}
          <div className="mb-6">
            <label className="text-label-tertiary text-xs mb-2 block">画像表示</label>
            <div className="flex flex-col gap-2">
              {([
                { key: 'discover' as const, label: '発見タブ' },
                { key: 'list' as const, label: '予定一覧' },
              ] as { key: keyof ImageVisibility; label: string }[]).map(({ key, label }) => {
                const on = imgVis[key];
                return (
                  <button
                    key={key}
                    onClick={() => { const next = { ...imgVis, [key]: !on }; setImgVis(next); saveImageVisibility(next); }}
                    className="flex items-center justify-between px-4 py-3 rounded-[14px] bg-bg-secondary active:opacity-70"
                  >
                    <span className="text-sm text-label-primary">{label}に画像を表示</span>
                    <div className="relative w-10 h-6 rounded-full transition-colors flex-shrink-0"
                      style={{ backgroundColor: on ? 'var(--accent-color)' : 'var(--border-default)' }}>
                      <div className="absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform"
                        style={{ transform: on ? 'translateX(18px)' : 'translateX(2px)' }} />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 保存ボタン */}
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full py-3 rounded-[14px] font-semibold text-sm active:opacity-70 disabled:opacity-40"
            style={{ backgroundColor: 'var(--accent-color)', color: 'var(--accent-on)' }}
          >
            {saved ? '保存しました ✓' : saving ? '保存中…' : '保存'}
          </button>

          {/* アカウント削除 */}
          <div className="mt-8 pt-6 border-t border-separator">
            {!delConfirm ? (
              <button
                onClick={() => setDelConfirm(true)}
                className="w-full py-2.5 rounded-[14px] text-sm active:opacity-70"
                style={{ color: 'var(--color-destructive)', backgroundColor: 'var(--fill-tertiary)' }}
              >
                アカウントを削除する
              </button>
            ) : (
              <div className="flex flex-col gap-2">
                <p className="text-xs text-label-secondary text-center">すべてのデータが削除されます。この操作は取り消せません。</p>
                <button
                  onClick={handleDeleteAccount}
                  disabled={deleting}
                  className="w-full py-2.5 rounded-[14px] text-sm font-semibold active:opacity-70 disabled:opacity-40"
                  style={{ backgroundColor: 'var(--color-destructive)', color: '#ffffff' }}
                >
                  {deleting ? '削除中…' : '本当に削除する'}
                </button>
                <button
                  onClick={() => setDelConfirm(false)}
                  className="w-full py-2.5 rounded-[14px] text-sm text-label-secondary active:opacity-70"
                >
                  キャンセル
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

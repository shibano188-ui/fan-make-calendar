import { useCallback } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTheme, resolveTheme } from '../../contexts/ThemeContext';
import { usePremium } from '../../lib/premium';
import { useToast } from '../ui/Toast';
import { useConfirm } from '../ui/ConfirmDialog';
import SpecPreview from './SpecPreview';
import { deleteUserTheme, FREE_THEME_LIMIT } from '../../lib/userThemes';

// カスタマイズ画面に出す「自分のテーマ」。
// ここは**並べて選ぶだけ**。作るのは専用ページ（/customize/theme）でやる
// ——プリセットを改造して作るのではなく、言葉（と参考画像）から丸ごと作るものなので、
// 軸を並べた操作面をここに置くと入口を取り違えさせる。

export default function ThemeList() {
  const { settings, userThemes, userThemeId, selectUserTheme, reloadUserThemes } = useTheme();
  const premium = usePremium();
  const toast = useToast();
  const confirmDialog = useConfirm();
  const navigate = useNavigate();
  const dark = resolveTheme(settings.theme) === 'dark';

  const remove = useCallback(async (id: string) => {
    const ok = await confirmDialog({
      title: 'このテーマを削除しますか？',
      message: '元に戻せません。',
      confirmLabel: '削除',
      destructive: true,
    });
    if (!ok) return;
    if (!await deleteUserTheme(id)) { toast('削除できませんでした', 'error'); return; }
    localStorage.removeItem(`fan_theme_tweaks_${id}`);
    await reloadUserThemes();
    toast('削除しました');
  }, [confirmDialog, reloadUserThemes, toast]);

  return (
    <section>
      <p className="text-label-tertiary text-xs mb-3">自分のテーマ</p>
      <div className="grid grid-cols-3 gap-2">
        {userThemes.map(t => {
          const on = userThemeId === t.id;
          return (
            <div key={t.id}>
              <button
                onClick={() => selectUserTheme(t.id)}
                aria-pressed={on}
                className={`w-full rounded-xl overflow-hidden border-2 transition-colors ${on ? '' : 'border-subtle'}`}
                style={on ? { borderColor: 'var(--accent-color)' } : undefined}
              >
                <SpecPreview spec={t.spec} dark={dark} />
                <div className="bg-bg-secondary py-1.5">
                  <p className="text-xs text-label-primary text-center truncate px-1">{t.spec.name}</p>
                </div>
              </button>
              <div className="flex justify-center gap-3 pt-1">
                <button onClick={() => navigate(`/customize/theme?edit=${t.id}`)} className="text-[11px] text-label-secondary pressable">
                  手直し
                </button>
                <button onClick={() => remove(t.id)} className="text-[11px] text-label-tertiary pressable" aria-label="削除">
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          );
        })}
        <button
          onClick={() => navigate('/customize/theme')}
          className="rounded-xl border-2 border-dashed border-subtle flex flex-col items-center justify-center gap-1 py-4"
        >
          <Plus size={18} className="text-label-secondary" />
          <span className="text-[11px] text-label-secondary text-center leading-tight px-1">作る</span>
        </button>
      </div>
      {!premium && (
        <p className="text-label-tertiary text-xs mt-2 px-1 leading-relaxed">
          無料で保存できるのは{FREE_THEME_LIMIT}つまで。
          <button onClick={() => navigate('/premium')} className="underline" style={{ color: 'var(--accent-color)' }}>
            プレミアム
          </button>
          ならいくつでも保存して切り替えられます。
        </p>
      )}
    </section>
  );
}

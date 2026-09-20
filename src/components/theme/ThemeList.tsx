import { useCallback } from 'react';
import { Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTheme, resolveTheme } from '../../contexts/ThemeContext';
import { useToast } from '../ui/Toast';
import { useConfirm } from '../ui/ConfirmDialog';
import SpecPreview from './SpecPreview';
import { deleteUserTheme } from '../../lib/userThemes';

// 作ったテーマの札。カスタマイズ画面の「テーマ」の並びに、デフォルトと一緒に並べる。
// 作る枚数や手直しの回数の案内は、作る画面（/customize/theme）側に書く。

export default function ThemeList() {
  const { settings, userThemes, userThemeId, selectUserTheme, reloadUserThemes } = useTheme();
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
    <>
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
    </>
  );
}

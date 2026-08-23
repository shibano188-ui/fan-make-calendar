import { useLocation, useNavigate } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';

// 作りかけのテーマがあるあいだ、どの画面にいても出る細い帯。
//
// テーマは**アプリ全体に当たって**初めて良し悪しが分かるので、作っている途中に
// 他の画面を見に行けないと意味がない。行った先で「今は下書きを当てている最中だ」と
// 分かり、1タップで作る画面に戻れるようにする。
// （下書きは画面ではなく ThemeContext が持っているので、移動しても消えない）

export default function DraftBar() {
  const { draft } = useTheme();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  if (!draft || pathname.startsWith('/customize/theme')) return null;

  return (
    <div
      className="fixed inset-x-0 z-[110] flex justify-center px-4 pointer-events-none"
      style={{ bottom: 'calc(env(safe-area-inset-bottom) + 78px)' }}
    >
      <button
        onClick={() => navigate('/customize/theme')}
        className="material-thick pointer-events-auto flex items-center gap-2 px-4 py-2 rounded-full shadow-card"
      >
        <Sparkles size={13} style={{ color: 'var(--accent-color)' }} />
        <span className="text-[12px] text-label-primary">
          「{draft.spec.name}」を試しています
        </span>
        <span className="text-[12px] font-medium" style={{ color: 'var(--accent-color)' }}>編集に戻る</span>
      </button>
    </div>
  );
}

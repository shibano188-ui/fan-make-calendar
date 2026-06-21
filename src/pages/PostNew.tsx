import { useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';

/** 投稿フォーム（全画面）。Phase 3 で AI入力4経路・複数分割・NL日時・アフィリンク変換を実装。 */
export default function PostNew() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen px-4 pt-3" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <div className="flex items-center justify-between">
        <button onClick={() => navigate(-1)} aria-label="閉じる" className="pressable tap-44">
          <X size={24} />
        </button>
        <span className="font-semibold">投稿</span>
        <span className="w-6" />
      </div>
      <p className="text-[13px] text-label-secondary mt-6">Phase 3 で実装：種別トグル / AI入力（写真・URL・テキスト・共有）/ 複数分割 / 自動画像 / 自然文日時 / アフィリンク。</p>
    </div>
  );
}

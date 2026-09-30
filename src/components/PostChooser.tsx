import { useNavigate } from 'react-router-dom';
import { AtSign, Send, ChevronRight, type LucideIcon } from 'lucide-react';
import Sheet from './ui/Sheet';
import { haptic } from '../lib/haptics';

// 下の「＋」から開く、みんなに公開する情報の入口（2026-09-29 投稿の方法の作り直し）。
//   Xのポストから追加 … 今の投稿画面（AIがポストを読んでフォームに入れる）
//   情報を送る        … 作品名・URL・一言だけ送る。中身の読み取りと公開はボットがやる
// 自分用の予定はここではなく、カレンダーの右下の「＋」から作る（みんなの予定と入口を分ける）。

const CHOICES: { path: string; icon: LucideIcon; title: string; body: string }[] = [
  { path: '/post', icon: AtSign, title: 'Xのポストから追加', body: 'ポストのリンクを貼ると、AIが予定を読み取ります' },
  { path: '/submit', icon: Send, title: '情報を送る', body: '作品名とURLを送るだけ。内容の確認と登録はFanHiveが行います' },
];

export default function PostChooser({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  return (
    <Sheet open={open} onClose={onClose} title="情報を追加" ariaLabel="情報を追加" maxHeight="50dvh">
      <div className="px-4 pb-4 flex flex-col gap-2">
        {CHOICES.map(({ path, icon: Icon, title, body }) => (
          <button key={path} onClick={() => { haptic.select(); onClose(); navigate(path); }}
            className="pressable w-full flex items-center gap-3 rounded-[14px] px-3.5 py-3.5 text-left"
            style={{ backgroundColor: 'var(--bg-secondary)' }}>
            <span className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: 'color-mix(in srgb, var(--accent-color) 16%, transparent)', color: 'var(--accent-text)' }}>
              <Icon size={19} />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-[15px] font-semibold">{title}</span>
              <span className="block text-[12px] text-label-secondary leading-snug mt-0.5">{body}</span>
            </span>
            <ChevronRight size={16} className="text-label-tertiary flex-shrink-0" />
          </button>
        ))}
        <p className="text-[11px] text-label-tertiary text-center mt-1">自分だけの予定は、カレンダーの右下の「＋」から作れます</p>
      </div>
    </Sheet>
  );
}

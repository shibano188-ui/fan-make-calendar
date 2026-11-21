import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { X } from 'lucide-react';
import { sendFeedback } from '../lib/api';
import { haptic } from '../lib/haptics';

// フォローした作品に予定が1件も無いときの案内（探すの一覧の上に1つだけ）。
// ボットはフォロワーのいる作品しか巡回しないので、新しくフォローされた作品はしばらく空のことがある（2026-11-21 柴野）。
// 「投稿をリクエスト」で運営に知らせつつ、X の共有から AI 入力ですぐ足せることを伝えて、みんなで予定を増やしてもらう。
// ×で閉じた作品・リクエスト済みの作品は、この端末では二度と出さない（うるさくしない）。

const KEY = 'fh_empty_work_nudge';

function load(): Record<string, 'closed' | 'requested'> {
  try { const v = JSON.parse(localStorage.getItem(KEY) ?? '{}'); return v && typeof v === 'object' ? v : {}; } catch { return {}; }
}
function save(id: string, v: 'closed' | 'requested') {
  try { localStorage.setItem(KEY, JSON.stringify({ ...load(), [id]: v })); } catch { /* noop */ }
}

export default function EmptyWorkNudge({ works }: { works: { id: string; name: string }[] }) {
  const navigate = useNavigate();
  const [state, setState] = useState(load);
  const [sent, setSent] = useState<string | null>(null);
  const w = works.find((x) => !state[x.id] || x.id === sent);
  if (!w) return null;

  const close = () => { haptic.select(); save(w.id, 'closed'); setState(load()); setSent(null); };
  const request = async () => {
    haptic.select();
    setSent(w.id);
    save(w.id, 'requested');
    await sendFeedback(['feature'], `投稿のリクエスト: ${w.name}`, { platform: Capacitor.getPlatform(), build: __BUILD_TIME__, page: '/explore' }).catch(() => {});
  };

  return (
    <div className="mt-2 relative rounded-[12px] border border-subtle px-3 py-2.5" style={{ backgroundColor: 'var(--bg-secondary)' }}>
      <button onClick={close} aria-label="閉じる" className="pressable absolute top-1.5 right-1.5 p-1 text-label-tertiary"><X size={14} /></button>
      <p className="text-[13px] font-semibold pr-6 truncate">「{w.name}」の予定はまだありません</p>
      <p className="mt-1 text-[12px] text-label-secondary leading-relaxed">
        Xで告知を見つけたら、共有から FanHive を選ぶだけで AI が予定にします。みんなで増やしましょう
      </p>
      <div className="mt-2 flex items-center gap-2">
        {sent === w.id ? (
          <span className="text-[12px] font-medium" style={{ color: 'var(--accent-text)' }}>リクエストしました</span>
        ) : (
          <button onClick={request} className="pressable h-7 px-3 rounded-full text-[12px] font-semibold border"
            style={{ borderColor: 'var(--accent-color)', color: 'var(--accent-text)' }}>
            投稿をリクエスト
          </button>
        )}
        <button onClick={() => { haptic.select(); navigate('/post'); }} className="pressable h-7 px-3 rounded-full text-[12px] font-semibold"
          style={{ backgroundColor: 'var(--accent-color)', color: 'var(--accent-on)' }}>
          予定を投稿する
        </button>
      </div>
    </div>
  );
}

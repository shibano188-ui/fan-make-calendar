import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageCircle } from 'lucide-react';
import Sheet from './ui/Sheet';
import { useAuth } from '../contexts/AuthContext';
import { listSupportNotices, type Notice } from '../lib/api';
import { openExternal } from '../lib/openExternal';
import { haptic } from '../lib/haptics';
import { ONBOARDING_KEY } from '../lib/constants';

// 運営からのお知らせ（問い合わせへの返事など）を、アプリを開いたときに下からのカードで出す。
// プッシュの許可が無い人も多く、お知らせ欄だけだと気づかれないため（2026-10-24 柴野「絶対気づいてもらえるように」）。
// 1つのお知らせは1回だけ出す（閉じたら、この端末では二度と出さない）。お知らせ欄には残る。

const SHOWN_KEY = 'fan_support_shown_v1';
// 起動直後の読み込み・案内と重ならないよう、少し待ってから出す
const DELAY_MS = 1500;

function shownIds(): string[] {
  try { return JSON.parse(localStorage.getItem(SHOWN_KEY) ?? '[]'); } catch { return []; }
}

function markShown(id: string): void {
  try { localStorage.setItem(SHOWN_KEY, JSON.stringify([...shownIds(), id].slice(-50))); } catch { /* 次の起動でもう一度出るだけ */ }
}

/** 行き先のボタンの文言。ストアならレビュー、それ以外は「開く」 */
function actionLabel(path: string): string {
  if (/play\.google\.com|apps\.apple\.com/.test(path)) return 'レビューを書く';
  return '開く';
}

export default function SupportNoticeSheet() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [notice, setNotice] = useState<Notice | null>(null);

  useEffect(() => {
    if (!user) return;
    // 初めての人は案内（オンボーディング）が先
    try { if (!localStorage.getItem(ONBOARDING_KEY)) return; } catch { return; }
    let cancelled = false;
    const t = setTimeout(() => {
      listSupportNotices(user.id).then((ns) => {
        if (cancelled) return;
        const shown = shownIds();
        // 古いものから1つずつ出す
        const unseen = ns.filter((n) => !shown.includes(n.id));
        if (unseen.length) setNotice(unseen[unseen.length - 1]);
      }).catch(() => {});
    }, DELAY_MS);
    return () => { cancelled = true; clearTimeout(t); };
  }, [user]);

  if (!notice) return null;

  const close = () => { markShown(notice.id); setNotice(null); };
  const go = () => {
    haptic.select();
    const path = notice.path;
    close();
    if (/^https:\/\//.test(path)) openExternal(path);
    else if (path !== '/') navigate(path);
  };

  return (
    <Sheet onClose={close} showClose={false} ariaLabel="運営からのお知らせ">
      <div className="px-5 pt-2 pb-[calc(var(--sab)+20px)] flex flex-col">
        <div className="flex items-center gap-1.5 text-[12px] font-bold" style={{ color: 'var(--accent-text)' }}>
          <MessageCircle size={14} />
          運営から
        </div>
        <h2 className="mt-2 text-[17px] font-bold leading-snug">{notice.title}</h2>
        {notice.body && <p className="mt-2 text-[14px] text-label-secondary leading-relaxed whitespace-pre-wrap">{notice.body}</p>}
        {notice.path !== '/' && (
          <button onClick={go} className="pressable mt-5 w-full py-3 rounded-[12px] font-semibold text-[15px]"
            style={{ backgroundColor: 'var(--accent-color)', color: 'var(--accent-on)' }}>
            {actionLabel(notice.path)}
          </button>
        )}
        <button onClick={close} className="pressable mt-3 self-center text-[13px] text-label-secondary">閉じる</button>
      </div>
    </Sheet>
  );
}

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageCircle } from 'lucide-react';
import Sheet from './ui/Sheet';
import { useAuth } from '../contexts/AuthContext';
import { markSurveyShown, shouldAskSurvey } from '../lib/survey';
import { IS_AUTOMATED } from '../lib/screenLog';
import { haptic } from '../lib/haptics';

// アンケートの案内。アプリを開いたときに下からのカードで出す（いつ出すかは lib/survey.ts）。
// お知らせのカード（SupportNoticeSheet）のあとで見て、ほかのカードやストーリーが開いていたら今回は出さない

const DELAY_MS = 4000;

export default function SurveySheet() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!user || IS_AUTOMATED || !shouldAskSurvey(user.created_at)) return;
    const t = setTimeout(() => {
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      markSurveyShown();
      setOpen(true);
    }, DELAY_MS);
    return () => clearTimeout(t);
  }, [user]);

  if (!open) return null;

  return (
    <Sheet onClose={() => setOpen(false)} showClose={false} ariaLabel="アンケートのお願い">
      <div className="px-5 pt-2 pb-[calc(var(--sab)+20px)] flex flex-col">
        <div className="flex items-center gap-1.5 text-[12px] font-bold" style={{ color: 'var(--accent-text)' }}>
          <MessageCircle size={14} />
          運営から
        </div>
        <h2 className="mt-2 text-[17px] font-bold leading-snug">アンケートにご協力ください！</h2>
        <p className="mt-2 text-[14px] text-label-secondary leading-relaxed">
          FanHive をもっと使いやすくするために、使ってみた感想を聞かせてください。1分ほどで終わります。
        </p>
        <button onClick={() => { haptic.select(); setOpen(false); navigate('/survey'); }}
          className="pressable mt-5 w-full py-3 rounded-[12px] font-semibold text-[15px]"
          style={{ backgroundColor: 'var(--accent-color)', color: 'var(--accent-on)' }}>
          答える
        </button>
        <button onClick={() => { haptic.select(); setOpen(false); }} className="pressable mt-3 self-center text-[13px] text-label-secondary">あとで</button>
      </div>
    </Sheet>
  );
}

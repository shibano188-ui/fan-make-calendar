import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, TrendingDown, PackageCheck, BellRing, Sparkles } from 'lucide-react';
import { listNotices, type Notice, type NoticeKind } from '../lib/api';
import { getNoticesSeenAt, markNoticesSeen } from '../lib/notices';
import { useAuth } from '../contexts/AuthContext';
import { haptic } from '../lib/haptics';
import { SkeletonList } from '../components/ui/Skeleton';

// これまでに送ったお知らせの一覧。端末の通知欄は一度消すと戻せないので、見返す場所をアプリに持つ。
// 記録しているのはサーバー（Cron）で、ここは読むだけ。

const META: Record<NoticeKind, { icon: typeof TrendingDown; label: string; color: string }> = {
  price_drop:     { icon: TrendingDown, label: '値下がり',   color: 'var(--color-success)' },
  restock:        { icon: PackageCheck, label: '再入荷',     color: 'var(--accent-text)' },
  preorder_start: { icon: BellRing,     label: '受付開始',   color: 'var(--accent-text)' },
  new_events:     { icon: Sparkles,     label: '新着まとめ', color: 'var(--label-secondary)' },
};

/** 日付の見出し。今日・昨日は文字にする（一覧を上から追うときに効く）。 */
function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const diff = Math.floor((Date.parse(today.toDateString()) - Date.parse(d.toDateString())) / 86400000);
  if (diff === 0) return '今日';
  if (diff === 1) return '昨日';
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export default function Notices() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [notices, setNotices] = useState<Notice[] | null>(null);
  // 「どこから未読だったか」は開いた瞬間に固定する（見ている最中に線が動くと分からなくなる）
  const [seenAt] = useState(getNoticesSeenAt);

  useEffect(() => {
    if (!user) { setNotices([]); return; }
    listNotices(user.id)
      .then((ns) => { setNotices(ns); markNoticesSeen(); })
      .catch(() => setNotices([]));
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  let lastDay = '';

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <div className="mx-auto w-full max-w-app flex-1 flex flex-col">
        <div className="sticky top-0 z-20 flex items-center gap-1 px-2 py-2 material-bar scroll-edge" style={{ paddingTop: 'calc(var(--sat) + 8px)' }}>
          <button onClick={() => { haptic.select(); navigate(-1); }} aria-label="戻る" className="pressable tap-44 p-2"><ArrowLeft size={22} /></button>
          <span className="text-[16px] font-bold flex-1">お知らせ</span>
        </div>

        <div className="px-3 pt-2 pb-8 flex flex-col gap-2">
          {notices === null ? (
            <SkeletonList count={5} />
          ) : notices.length === 0 ? (
            <p className="px-1 py-10 text-center text-[13px] text-label-tertiary">
              まだお知らせはありません。<br />
              値下がり・再入荷・受付開始・フォロー作品の新着が、ここに残ります。
            </p>
          ) : notices.map((n) => {
            const { icon: Icon, label, color } = META[n.kind] ?? META.new_events;
            const day = dayLabel(n.createdAt);
            const head = day !== lastDay ? day : null;
            lastDay = day;
            const unread = n.createdAt > seenAt;
            return (
              <div key={n.id}>
                {head && <p className="text-[11px] text-label-tertiary px-1 pt-2 pb-1">{head}</p>}
                <button onClick={() => { haptic.select(); navigate(n.path); }}
                  className="pressable w-full text-left rounded-[12px] border border-subtle bg-bg-secondary p-3">
                  <div className="flex items-center gap-1.5 text-[11px] font-bold" style={{ color }}>
                    <Icon size={13} />
                    {label}
                    {unread && <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: 'var(--accent-color)' }} />}
                    <span className="flex-1" />
                    <span className="text-[11px] font-normal text-label-tertiary">
                      {new Date(n.createdAt).toTimeString().slice(0, 5)}
                    </span>
                  </div>
                  <div className="text-[14px] font-semibold leading-snug mt-0.5">{n.title}</div>
                  {n.body && <div className="text-[12px] text-label-secondary leading-snug mt-0.5">{n.body}</div>}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

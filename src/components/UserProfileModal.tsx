import { useState, useEffect } from 'react';
import { X, ExternalLink } from 'lucide-react';
import { getUserPublicProfile } from '../lib/api';

interface Profile {
  displayName: string | null;
  xUrl: string | null;
  postedCount: number;
  receivedLikes: number;
}

export default function UserProfileModal({
  userId,
  onClose,
}: {
  userId: string;
  onClose: () => void;
}) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getUserPublicProfile(userId)
      .then(setProfile)
      .catch(() => setProfile(null))
      .finally(() => setLoading(false));
  }, [userId]);

  const name = profile?.displayName ?? '匿名';
  const initials = name.slice(0, 2).toUpperCase();

  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center px-6">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div
        className="relative w-full max-w-sm rounded-2xl overflow-hidden shadow-xl"
        style={{
          backgroundColor: 'var(--bg-primary)',
          animation: 'slideUpIn 0.2s ease-out both',
        }}
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-full text-label-tertiary active:opacity-60"
          style={{ backgroundColor: 'var(--bg-secondary)' }}
        >
          <X size={16} />
        </button>

        {loading ? (
          <div className="p-10 flex justify-center">
            <div
              className="w-6 h-6 rounded-full border-2 animate-spin"
              style={{ borderColor: 'var(--label-tertiary)', borderTopColor: 'var(--label-primary)' }}
            />
          </div>
        ) : (
          <div className="p-6 pt-5">
            {/* アバター＋名前 */}
            <div className="flex flex-col items-center gap-3 mb-5">
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center text-xl font-bold"
                style={{ backgroundColor: 'var(--accent-color)', color: 'var(--bg-primary)' }}
              >
                {initials}
              </div>
              <p className="text-label-primary font-semibold text-lg leading-tight">{name}</p>
              {profile?.xUrl && (
                <a
                  href={profile.xUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-4 py-2 rounded-full border text-sm active:opacity-60"
                  style={{ borderColor: 'var(--border-default)', color: 'var(--label-secondary)' }}
                >
                  <ExternalLink size={13} />X でフォロー
                </a>
              )}
            </div>

            {/* 統計 */}
            <div className="grid grid-cols-2 gap-3">
              <div
                className="rounded-xl px-4 py-4 shadow-card flex flex-col gap-1"
                style={{ backgroundColor: 'var(--bg-secondary)' }}
              >
                <span className="text-label-tertiary text-[11px]">投稿した予定</span>
                <span className="text-label-primary text-2xl font-bold leading-tight">
                  {profile?.postedCount ?? 0}
                  <span className="text-label-tertiary text-xs font-normal ml-0.5">件</span>
                </span>
              </div>
              <div
                className="rounded-xl px-4 py-4 shadow-card flex flex-col gap-1"
                style={{ backgroundColor: 'var(--bg-secondary)' }}
              >
                <span className="text-label-tertiary text-[11px]">もらったいいね</span>
                <span className="text-label-primary text-2xl font-bold leading-tight">
                  {profile?.receivedLikes ?? 0}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

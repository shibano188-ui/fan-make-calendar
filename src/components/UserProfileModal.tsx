import { useState, useEffect } from 'react';
import { X, ExternalLink, Crown, Ban } from 'lucide-react';
import { getUserPublicProfile, getProfileExtras, type ProfileExtras } from '../lib/api';
import { calcTitle, calcGrade, calcRadarData, type AchievementStats } from '../lib/achievements';
import FanStarChart from './FanStarChart';
import { safeHref } from '../lib/url';
import { useAuth } from '../contexts/AuthContext';
import { useHiddenContent } from '../hooks/useHiddenContent';
import { useConfirm } from './ui/ConfirmDialog';
import { useToast } from './ui/Toast';

interface Profile {
  displayName: string | null;
  xUrl: string | null;
  avatarEmoji: string | null;
  postedCount: number;
  receivedLikes: number;
  likesGiven: number;
  reactionsGiven: number;
  works: number;
  birthdayPosts: number;
}

export default function UserProfileModal({
  userId,
  onClose,
  onBlocked,
}: {
  userId: string;
  onClose: () => void;
  /** ブロックが成立したとき。開いていた投稿はもう見えないので、呼び出し側で画面を離れる */
  onBlocked?: () => void;
}) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [extras, setExtras] = useState<ProfileExtras | null>(null);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const { isBlocked, block, unblock } = useHiddenContent(user?.id);
  const confirm = useConfirm();
  const toast = useToast();
  const [working, setWorking] = useState(false);
  const isSelf = !!user && user.id === userId;
  const blocked = isBlocked(userId);

  useEffect(() => {
    getUserPublicProfile(userId)
      .then(setProfile)
      .catch(() => setProfile(null))
      .finally(() => setLoading(false));
    getProfileExtras(userId).then(setExtras).catch(() => {});
  }, [userId]);

  const name = profile?.displayName ?? '匿名';
  const initials = name.slice(0, 2).toUpperCase();

  const achStats: AchievementStats | null = profile
    ? {
        posted: profile.postedCount,
        received: profile.receivedLikes,
        likesGiven: profile.likesGiven,
        reactionsGiven: profile.reactionsGiven,
        works: profile.works,
        birthdayPosts: profile.birthdayPosts,
      }
    : null;

  const title = achStats ? calcTitle(achStats) : null;
  const grade = achStats ? calcGrade(achStats) : null;
  const radar = achStats ? calcRadarData(achStats) : null;

  const onToggleBlock = async () => {
    if (!user || working) return;
    if (blocked) {
      setWorking(true);
      const ok = await unblock(userId).then(() => true).catch(() => false);
      setWorking(false);
      toast(ok ? `${name}さんのブロックを解除しました` : '解除できませんでした。通信状況を確認してください');
      return;
    }
    const ok = await confirm({
      title: `${name}さんをブロックしますか？`,
      message: 'この人の投稿があなたの画面に出てこなくなります。相手には知らされません。マイページからいつでも解除できます',
      confirmLabel: 'ブロックする',
      destructive: true,
    });
    if (!ok) return;
    setWorking(true);
    const done = await block(userId).then(() => true).catch(() => false);
    setWorking(false);
    if (!done) {
      // 成功したように見せてはいけない（相手の投稿は消えていない）
      toast('ブロックできませんでした。通信状況を確認してください');
      return;
    }
    toast(`${name}さんをブロックしました`);
    onBlocked?.();
  };

  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center px-6">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} style={{ animation: 'fadeIn 0.2s ease both' }} />
      <div
        className="relative w-full max-w-sm rounded-[16px] overflow-hidden shadow-xl"
        style={{
          backgroundColor: 'var(--bg-primary)',
          animation: 'confirmIn 0.24s cubic-bezier(0.34,1.2,0.64,1) both',
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
            {/* アバター（＋一言の吹き出し）＋名前 */}
            <div className="flex flex-col items-center gap-2 mb-4">
              <div className={`flex items-center gap-3 ${extras?.bio ? 'self-stretch justify-center' : ''}`}>
                <div
                  className="w-16 h-16 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: 'var(--accent-color)' }}
                >
                  {profile?.avatarEmoji ? (
                    <span className="text-3xl leading-none">{profile.avatarEmoji}</span>
                  ) : (
                    <span className="text-xl font-bold" style={{ color: 'var(--accent-on)' }}>{initials}</span>
                  )}
                </div>
                {/* 一言コメント: アイコンから生える吹き出し */}
                {extras?.bio && (
                  <div className="relative min-w-0 rounded-[14px] px-3 py-2"
                    style={{ backgroundColor: 'var(--fill-tertiary)' }}>
                    <span className="absolute top-1/2 -left-[5px] -translate-y-1/2 w-2.5 h-2.5 rotate-45"
                      style={{ backgroundColor: 'var(--fill-tertiary)' }} />
                    <p className="relative text-[12px] leading-snug text-label-primary break-words">{extras.bio}</p>
                  </div>
                )}
              </div>
              <p className="text-label-primary font-semibold text-lg leading-tight">{name}</p>

              {/* 称号バッジ＋グレード */}
              {title && (
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[13px] font-bold"
                    style={{ background: 'linear-gradient(135deg, var(--accent-color), color-mix(in srgb, var(--accent-color) 55%, #ff8a00))', color: 'var(--accent-on)', boxShadow: '0 1px 6px color-mix(in srgb, var(--accent-color) 45%, transparent)' }}>
                    <Crown size={13} strokeWidth={2.5} /> {title}
                  </span>
                  {grade !== null && <span className="text-[12px] text-label-tertiary">Gr.{grade}</span>}
                </div>
              )}

              {/* 推し・好きな作品 */}
              {(extras?.oshi || extras?.favWorks) && (
                <div className="flex flex-wrap justify-center gap-1.5">
                  {extras?.oshi && <span className="px-2 py-0.5 rounded-full text-[11px]" style={{ backgroundColor: 'color-mix(in srgb, var(--accent-color) 16%, transparent)', color: 'var(--accent-text)' }}>推し: {extras.oshi}</span>}
                  {extras?.favWorks && <span className="px-2 py-0.5 rounded-full text-[11px]" style={{ backgroundColor: 'var(--fill-tertiary)', color: 'var(--label-secondary)' }}>好きな作品: {extras.favWorks}</span>}
                </div>
              )}

              {profile?.xUrl && (
                <a
                  href={safeHref(profile.xUrl)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm active:opacity-60"
                  style={{ backgroundColor: 'var(--fill-tertiary)', color: 'var(--label-secondary)' }}
                >
                  <ExternalLink size={13} />X でフォロー
                </a>
              )}
            </div>

            {/* ファンスター */}
            {radar && (
              <div className="rounded-[14px] mb-3 px-1 mx-auto w-full" style={{ backgroundColor: 'var(--bg-secondary)', maxWidth: 220 }}>
                <FanStarChart data={radar} size={190} />
              </div>
            )}

            {/* 統計 */}
            <div className="grid grid-cols-2 gap-3">
              <div
                className="rounded-[14px] px-4 py-4 flex flex-col gap-1"
                style={{ backgroundColor: 'var(--bg-secondary)' }}
              >
                <span className="text-label-tertiary text-[11px]">投稿した予定</span>
                <span className="text-label-primary text-2xl font-bold leading-tight">
                  {profile?.postedCount ?? 0}
                  <span className="text-label-tertiary text-xs font-normal ml-0.5">件</span>
                </span>
              </div>
              <div
                className="rounded-[14px] px-4 py-4 flex flex-col gap-1"
                style={{ backgroundColor: 'var(--bg-secondary)' }}
              >
                <span className="text-label-tertiary text-[11px]">もらったいいね</span>
                <span className="text-label-primary text-2xl font-bold leading-tight">
                  {profile?.receivedLikes ?? 0}
                </span>
              </div>
            </div>

            {/* ブロック（自分のプロフィールには出さない） */}
            {!isSelf && user && (
              <div className="mt-4 flex justify-center">
                <button
                  onClick={onToggleBlock}
                  disabled={working}
                  className="pressable inline-flex items-center gap-1.5 text-[12px] disabled:opacity-50"
                  style={{ color: blocked ? 'var(--label-secondary)' : 'var(--color-destructive)' }}
                >
                  <Ban size={13} />
                  {blocked ? 'ブロックを解除する' : 'この人をブロックする'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { Settings } from 'lucide-react';
import Header from '../components/Header';
import Layout from '../components/Layout';
import TitleBadge from '../components/TitleBadge';
import UserSettingsSheet from '../components/UserSettingsSheet';
import { getTitleTier, getNextTier, getProgress, TITLE_TIERS } from '../lib/titles';
import { getUserPoints, getUserStats, ACHIEVEMENTS } from '../lib/points';
import {
  getDisplayName, getHomePrefecture,
  saveDisplayName, saveHomePrefecture,
} from '../lib/api';
import { useAuth } from '../contexts/AuthContext';

export default function Profile() {
  const { user } = useAuth();
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [homePref, setHomePref]       = useState<string | null>(null);
  const [points, setPoints]           = useState({ points: 0, total_earned: 0 });
  const [stats, setStats]             = useState({ postCount: 0, reactionsReceived: 0 });
  const [loading, setLoading]         = useState(true);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    Promise.all([
      getDisplayName(user.id),
      getHomePrefecture(user.id),
      getUserPoints(user.id),
      getUserStats(user.id),
    ]).then(([name, pref, pts, st]) => {
      setDisplayName(name);
      setHomePref(pref);
      setPoints(pts);
      setStats(st);
    }).finally(() => setLoading(false));
  }, [user?.id]);

  const handleSave = async (newPref: string | null, newName: string) => {
    if (!user) return;
    setDisplayName(newName || null);
    setHomePref(newPref);
    await Promise.all([
      saveDisplayName(user.id, newName),
      saveHomePrefecture(user.id, newPref),
    ]);
  };

  const totalEarned = points.total_earned;
  const tier        = getTitleTier(totalEarned);
  const nextTier    = getNextTier(totalEarned);
  const progress    = getProgress(totalEarned);
  const name        = displayName ?? '匿名';
  const initial     = name.charAt(0).toUpperCase();

  if (!user) {
    return (
      <Layout>
        <Header title="プロフィール" />
        <p className="text-center text-label-tertiary text-sm py-16">ログインが必要です</p>
      </Layout>
    );
  }

  return (
    <Layout>
      <Header
        title="プロフィール"
        rightAction={
          <button
            onClick={() => setShowSettings(true)}
            className="w-8 h-8 flex items-center justify-center rounded-lg bg-bg-secondary text-label-secondary"
            aria-label="設定を変更"
          >
            <Settings size={16} />
          </button>
        }
      />

      <div className="px-4 pt-5 pb-8 flex flex-col gap-5">
        {loading ? (
          <div className="flex flex-col gap-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-24 bg-bg-secondary rounded-xl animate-pulse" />
            ))}
          </div>
        ) : (
          <>
            {/* ユーザー情報 */}
            <div className="flex flex-col items-center gap-2 pt-2">
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold text-white"
                style={{ backgroundColor: tier.rainbow ? '#A78BFA' : tier.color }}
              >
                {initial}
              </div>
              <div className="text-center">
                <p className="text-label-primary font-bold text-lg">{name}</p>
                {homePref && (
                  <p className="text-label-tertiary text-xs mt-0.5">{homePref}</p>
                )}
                <div className="mt-2">
                  <TitleBadge totalEarned={totalEarned} size="lg" />
                </div>
              </div>
            </div>

            {/* ポイントカード */}
            <div className="bg-bg-secondary rounded-xl px-4 py-4 flex justify-around">
              <div className="flex flex-col items-center gap-1">
                <span className="text-label-tertiary text-[11px]">現在のポイント</span>
                <span className="text-label-primary text-2xl font-bold">
                  {points.points.toLocaleString('ja-JP')}
                </span>
                <span className="text-label-tertiary text-[10px]">pt</span>
              </div>
              <div className="w-px" style={{ backgroundColor: 'var(--border-faint)' }} />
              <div className="flex flex-col items-center gap-1">
                <span className="text-label-tertiary text-[11px]">累計獲得</span>
                <span className="text-label-primary text-2xl font-bold">
                  {totalEarned.toLocaleString('ja-JP')}
                </span>
                <span className="text-label-tertiary text-[10px]">pt</span>
              </div>
            </div>

            {/* 称号プログレスバー */}
            <div className="bg-bg-secondary rounded-xl px-4 py-4 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-label-secondary text-xs">称号レベル</span>
                {nextTier ? (
                  <span className="text-label-tertiary text-[11px]">
                    次の称号まであと {(nextTier.minPoints - totalEarned).toLocaleString('ja-JP')} pt
                  </span>
                ) : (
                  <span className="text-label-tertiary text-[11px]">最高称号達成！</span>
                )}
              </div>

              {/* 進捗バー */}
              <div className="relative h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--border-faint)' }}>
                <div
                  className="absolute inset-y-0 left-0 rounded-full transition-all duration-700"
                  style={{
                    width: `${progress * 100}%`,
                    backgroundColor: tier.rainbow ? '#A78BFA' : tier.color,
                  }}
                />
              </div>

              {/* 称号ロードマップ */}
              <div className="flex justify-between mt-1">
                {TITLE_TIERS.map((t, i) => {
                  const reached = totalEarned >= t.minPoints;
                  return (
                    <div key={i} className="flex flex-col items-center gap-0.5">
                      <div
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: reached ? t.color : 'var(--border-default)' }}
                      />
                      <span
                        className="text-[8px] leading-tight text-center"
                        style={{ color: reached ? t.color : 'var(--label-tertiary)' }}
                      >
                        {t.label.slice(0, 3)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 実績バッジ */}
            <div className="bg-bg-secondary rounded-xl px-4 py-4 flex flex-col gap-3">
              <p className="text-label-secondary text-xs">実績バッジ</p>
              <div className="grid grid-cols-3 gap-3">
                {ACHIEVEMENTS.map(badge => {
                  const earned = badge.check(stats);
                  return (
                    <div
                      key={badge.id}
                      className="flex flex-col items-center gap-1.5 p-3 rounded-xl"
                      style={{
                        backgroundColor: earned ? 'rgba(255,255,255,0.04)' : 'transparent',
                        border: `1px solid ${earned ? 'var(--border-default)' : 'var(--border-faint)'}`,
                        opacity: earned ? 1 : 0.4,
                      }}
                    >
                      <span className="text-2xl">{badge.emoji}</span>
                      <span className="text-label-primary text-[10px] font-bold text-center leading-tight">
                        {badge.label}
                      </span>
                      <span className="text-label-tertiary text-[9px] text-center leading-tight">
                        {badge.condition}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 統計 */}
            <div className="bg-bg-secondary rounded-xl px-4 py-4 flex justify-around">
              <div className="flex flex-col items-center gap-1">
                <span className="text-label-primary text-xl font-bold">
                  {stats.postCount.toLocaleString('ja-JP')}
                </span>
                <span className="text-label-tertiary text-[11px]">投稿数</span>
              </div>
              <div className="w-px" style={{ backgroundColor: 'var(--border-faint)' }} />
              <div className="flex flex-col items-center gap-1">
                <span className="text-label-primary text-xl font-bold">
                  {stats.reactionsReceived.toLocaleString('ja-JP')}
                </span>
                <span className="text-label-tertiary text-[11px]">もらったリアクション</span>
              </div>
            </div>
          </>
        )}
      </div>

      {/* 設定シート */}
      {showSettings && user && (
        <UserSettingsSheet
          homePref={homePref}
          displayName={displayName}
          onSave={handleSave}
          onClose={() => setShowSettings(false)}
        />
      )}
    </Layout>
  );
}

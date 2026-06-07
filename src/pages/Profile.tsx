import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Pencil, Check, X, ChevronRight, Palette, Map as MapIcon } from 'lucide-react';
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer } from 'recharts';
import BottomTab from '../components/BottomTab';
import Header from '../components/Header';
import { useAuth } from '../contexts/AuthContext';
import {
  getHomePrefecture, saveHomePrefecture,
  getDisplayName, saveDisplayName,
  getXUrl, saveXUrl,
  getAvatarEmoji, saveAvatarEmoji,
  listRecentWorks, countUserPostedEvents, getTotalReceivedLikes,
  countUserLikesGiven, countUserReactionsGiven, countUserEventsByCategory,
} from '../lib/api';

const ANIMAL_AVATARS = [
  '🦊','🐱','🐼','🐻','🐰','🐨','🐯','🐶',
  '🦁','🐮','🐷','🐸','🦋','🐝','🐬','🐧',
  '🦄','🐙','🦜','🦅','🦖','🐳','🦓','🐢',
];
import { loadRegionFilter, saveRegionFilter, type FilterMode } from '../lib/constants';
import { PrefectureSearch } from '../components/UserSettingsSheet';
import { REGIONS, ADJACENT } from '../lib/prefectures';

const BOTTOM_TAB_H = 56;

// ─── 称号・実績ロジック ────────────────────────────────────────────

type AchievementStats = {
  posted: number;
  received: number;
  likesGiven: number;
  reactionsGiven: number;
  works: number;
  birthdayPosts: number;
  collabPosts: number;
};

const TITLE_TIERS = [
  { label: '推し活レジェンド', check: (s: AchievementStats) => s.posted >= 200 && s.received >= 1000 },
  { label: 'カリスマファン',   check: (s: AchievementStats) => s.posted >= 100 && s.received >= 500 },
  { label: 'ファン記者',       check: (s: AchievementStats) => s.posted >= 50  && s.received >= 200 },
  { label: '現地勢',           check: (s: AchievementStats) => s.posted >= 30  || s.received >= 100 },
  { label: '情報屋',           check: (s: AchievementStats) => s.posted >= 10 },
  { label: '見習いファン',     check: (s: AchievementStats) => s.posted >= 1 },
];
function calcTitle(s: AchievementStats) {
  return TITLE_TIERS.find(t => t.check(s))?.label ?? 'ルーキー';
}

const BADGES = [
  { emoji: '🌱', label: 'はじめの一歩', desc: '初投稿',         check: (s: AchievementStats) => s.posted >= 1 },
  { emoji: '📅', label: '百投の達人',   desc: '投稿100件',       check: (s: AchievementStats) => s.posted >= 100 },
  { emoji: '❤️', label: 'いいね職人',   desc: 'いいね100回',     check: (s: AchievementStats) => s.likesGiven >= 100 },
  { emoji: '🌟', label: '愛されファン', desc: 'いいね100もらう', check: (s: AchievementStats) => s.received >= 100 },
  { emoji: '🎭', label: '多推し勢',     desc: '3作品以上参加',   check: (s: AchievementStats) => s.works >= 3 },
  { emoji: '😊', label: 'リアクション王', desc: 'リアクション50回', check: (s: AchievementStats) => s.reactionsGiven >= 50 },
  { emoji: '🎂', label: '誕生日マスター', desc: '誕生日投稿5件', check: (s: AchievementStats) => s.birthdayPosts >= 5 },
  { emoji: '🤝', label: 'コラボハンター', desc: 'コラボ投稿3件', check: (s: AchievementStats) => s.collabPosts >= 3 },
];

function calcRadarData(s: AchievementStats) {
  const sc = (val: number, max: number) => Math.max(5, Math.min(100, Math.round((val / max) * 100)));
  return [
    { axis: '投稿力', value: sc(s.posted, 100) },
    { axis: '影響力', value: sc(s.received, 500) },
    { axis: '応援力', value: sc(s.likesGiven, 200) },
    { axis: '収集力', value: sc(s.reactionsGiven, 50) },
    { axis: '開拓力', value: sc(s.works, 10) },
  ];
}

const CustomTick = ({ x, y, payload }: { x?: number; y?: number; payload?: { value: string } }) => (
  <text x={x} y={y} textAnchor="middle" dominantBaseline="central" style={{ fill: 'var(--label-secondary)', fontSize: 10 }}>
    {payload?.value}
  </text>
);

// ─── メイン ────────────────────────────────────────────────────────
export default function Profile() {
  const navigate = useNavigate();
  const { user } = useAuth();

  // プロフィール編集
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [homePref, setHomePref] = useState<string | null>(null);
  const [xUrl, setXUrl] = useState<string | null>(null);
  const [avatarEmoji, setAvatarEmoji] = useState<string | null>(null);
  type EditingField = 'avatar' | 'name' | 'pref' | 'x' | null;
  const [editingField, setEditingField] = useState<EditingField>(null);
  const [editName, setEditName] = useState('');
  const [editPref, setEditPref] = useState<string | null>(null);
  const [editXUrl, setEditXUrl] = useState('');
  const [editAvatarEmoji, setEditAvatarEmoji] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);

  // 統計（アクティビティ表示用）
  const [postedCount, setPostedCount] = useState<number | null>(null);
  const [receivedLikes, setReceivedLikes] = useState<number | null>(null);
  const [worksCount, setWorksCount] = useState<number | null>(null);

  // 称号・実績・レーダー用（全てSupabaseから取得・改ざん不可）
  const [likesGiven, setLikesGiven] = useState<number | null>(null);
  const [reactionsGiven, setReactionsGiven] = useState<number | null>(null);
  const [birthdayPosts, setBirthdayPosts] = useState<number | null>(null);
  const [collabPosts, setCollabPosts] = useState<number | null>(null);

  // 地域フィルター（Calendar/Discoverと共有）
  const [filterMode, setFilterMode] = useState<FilterMode>(() => loadRegionFilter().filterMode);
  const [filterValue, setFilterValue] = useState<string | null>(() => loadRegionFilter().filterValue);
  const [includeAdjacent, setIncludeAdjacent] = useState(() => loadRegionFilter().includeAdjacent);
  const [showRegionPanel, setShowRegionPanel] = useState(false);

  const filterActive = filterMode !== 'none';
  const filterLabel = filterMode === 'pref' ? filterValue ?? '' : filterMode === 'region' ? `${filterValue}地方` : '';

  useEffect(() => {
    if (!user) return;
    Promise.all([
      getDisplayName(user.id),
      getHomePrefecture(user.id),
      getXUrl(user.id),
      getAvatarEmoji(user.id),
      countUserPostedEvents(user.id),
      getTotalReceivedLikes(user.id),
      listRecentWorks(user.id),
      countUserLikesGiven(user.id),
      countUserReactionsGiven(user.id),
      countUserEventsByCategory(user.id, '誕生日'),
      countUserEventsByCategory(user.id, 'コラボ'),
    ]).then(([name, pref, x, emoji, posted, likes, works, likesGv, reactionsGv, birthday, collab]) => {
      setDisplayName(name);
      setHomePref(pref);
      setXUrl(x);
      setAvatarEmoji(emoji);
      setPostedCount(posted);
      setReceivedLikes(likes);
      setWorksCount(works.length);
      setLikesGiven(likesGv);
      setReactionsGiven(reactionsGv);
      setBirthdayPosts(birthday);
      setCollabPosts(collab);
    }).catch(() => {});
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const initials = (displayName ?? '匿名').slice(0, 2).toUpperCase();

  const startFieldEdit = (field: NonNullable<EditingField>) => {
    setEditName(displayName ?? '');
    setEditPref(homePref);
    setEditXUrl(xUrl ?? '');
    setEditAvatarEmoji(avatarEmoji);
    setEditingField(field);
  };

  const cancelFieldEdit = () => setEditingField(null);

  const saveSingleField = async (field: NonNullable<EditingField>) => {
    if (!user) return;
    setSavingProfile(true);
    try {
      if (field === 'name') {
        await saveDisplayName(user.id, editName.trim());
        setDisplayName(editName.trim() || null);
      } else if (field === 'pref') {
        await saveHomePrefecture(user.id, editPref);
        setHomePref(editPref);
      } else if (field === 'x') {
        await saveXUrl(user.id, editXUrl.trim() || null);
        setXUrl(editXUrl.trim() || null);
      } else if (field === 'avatar') {
        await saveAvatarEmoji(user.id, editAvatarEmoji);
        setAvatarEmoji(editAvatarEmoji);
      }
      setEditingField(null);
    } catch { /* ignore */ }
    finally { setSavingProfile(false); }
  };

  // 称号・実績計算（全データ揃ったときのみ）
  const statsReady = postedCount !== null && receivedLikes !== null && worksCount !== null
    && likesGiven !== null && reactionsGiven !== null && birthdayPosts !== null && collabPosts !== null;

  const achStats: AchievementStats = {
    posted: postedCount ?? 0,
    received: receivedLikes ?? 0,
    likesGiven: likesGiven ?? 0,
    reactionsGiven: reactionsGiven ?? 0,
    works: worksCount ?? 0,
    birthdayPosts: birthdayPosts ?? 0,
    collabPosts: collabPosts ?? 0,
  };
  const title = statsReady ? calcTitle(achStats) : null;
  const radarData = statsReady ? calcRadarData(achStats) : null;

  return (
    <>
      <div
        className="fixed inset-0 max-w-app mx-auto flex flex-col overflow-hidden"
        style={{ backgroundColor: 'var(--bg-primary)', paddingTop: 44, paddingBottom: BOTTOM_TAB_H }}
      >
        <Header
          leftNode={<span className="text-base font-bold text-label-primary">プロフィール</span>}
          rightAction={
            <div className="flex items-center gap-1">
              <button
                onClick={() => setShowRegionPanel(true)}
                aria-label="地域で絞り込む"
                className="relative w-8 h-8 flex items-center justify-center rounded-lg bg-bg-secondary text-label-secondary active:opacity-60"
              >
                <MapIcon size={16} style={filterActive ? { color: 'var(--accent-color)' } : {}} />
                {filterActive && <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full" style={{ background: 'var(--accent-color)' }} />}
              </button>
              <button
                onClick={() => navigate('/customize')}
                aria-label="カスタマイズ"
                className="w-8 h-8 flex items-center justify-center rounded-lg bg-bg-secondary text-label-secondary active:opacity-60"
              >
                <Palette size={16} />
              </button>
            </div>
          }
        />

        <div className="flex-1 overflow-y-auto px-4 pt-4 pb-8 flex flex-col gap-6">

          {/* ── プロフィール ───────────────────────── */}
          <section>
            <p className="text-label-tertiary text-xs mb-3">プロフィール</p>
            <div className="rounded-xl overflow-hidden shadow-card" style={{ backgroundColor: 'var(--bg-secondary)' }}>

              {/* アバター＋名前＋称号 */}
              <div className="flex items-center gap-4 px-5 pt-5 pb-4">
                <button
                  onClick={() => editingField === 'avatar' ? undefined : startFieldEdit('avatar')}
                  className="w-16 h-16 rounded-full flex items-center justify-center flex-shrink-0 relative active:opacity-80"
                  style={{ backgroundColor: 'var(--accent-color)' }}
                >
                  {(editingField === 'avatar' ? editAvatarEmoji : avatarEmoji) ? (
                    <span className="text-3xl leading-none">{editingField === 'avatar' ? editAvatarEmoji : avatarEmoji}</span>
                  ) : (
                    <span className="text-xl font-bold" style={{ color: 'var(--bg-primary)' }}>{initials}</span>
                  )}
                  {editingField !== 'avatar' && (
                    <span className="absolute bottom-0 right-0 w-5 h-5 rounded-full flex items-center justify-center" style={{ backgroundColor: 'var(--bg-primary)' }}>
                      <Pencil size={10} style={{ color: 'var(--label-secondary)' }} />
                    </span>
                  )}
                </button>

                <div className="flex-1 min-w-0">
                  {editingField === 'name' ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="text" value={editName} onChange={e => setEditName(e.target.value)}
                        placeholder="表示名" autoFocus
                        className="flex-1 min-w-0 bg-bg-primary rounded-lg px-3 py-1.5 text-sm text-label-primary placeholder:text-label-tertiary outline-none border border-faint focus:border-strong"
                      />
                      <button onClick={cancelFieldEdit} className="w-7 h-7 flex items-center justify-center rounded-full active:opacity-60" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                        <X size={13} className="text-label-secondary" />
                      </button>
                      <button onClick={() => saveSingleField('name')} disabled={savingProfile} className="w-7 h-7 flex items-center justify-center rounded-full active:opacity-70 disabled:opacity-40" style={{ backgroundColor: 'var(--accent-color)' }}>
                        <Check size={13} style={{ color: 'var(--bg-primary)' }} />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-label-primary font-semibold text-base truncate">{displayName ?? '匿名'}</p>
                      <button onClick={() => startFieldEdit('name')} className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-full active:opacity-60" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                        <Pencil size={12} className="text-label-secondary" />
                      </button>
                    </div>
                  )}
                  {/* 称号バッジ */}
                  {title && (
                    <div className="mt-1.5 inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold"
                      style={{ backgroundColor: 'color-mix(in srgb, var(--accent-color) 15%, transparent)', color: 'var(--accent-color)' }}>
                      ⭐ {title}
                    </div>
                  )}
                </div>
              </div>

              {/* アバターピッカー */}
              {editingField === 'avatar' && (
                <div className="px-5 pb-4 border-t" style={{ borderColor: 'var(--border-faint)' }}>
                  <div className="flex items-center justify-between pt-3 mb-2">
                    <p className="text-label-tertiary text-xs">アバター</p>
                    <div className="flex items-center gap-2">
                      <button onClick={cancelFieldEdit} className="text-xs text-label-secondary active:opacity-60">キャンセル</button>
                      <button onClick={() => saveSingleField('avatar')} disabled={savingProfile} className="text-xs font-semibold active:opacity-70 disabled:opacity-40" style={{ color: 'var(--accent-color)' }}>
                        {savingProfile ? '保存中…' : '保存'}
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-8 gap-1.5">
                    {ANIMAL_AVATARS.map(emoji => (
                      <button key={emoji} type="button" onClick={() => setEditAvatarEmoji(editAvatarEmoji === emoji ? null : emoji)}
                        className="w-full aspect-square rounded-xl flex items-center justify-center text-xl active:opacity-70 transition-all"
                        style={{ backgroundColor: editAvatarEmoji === emoji ? 'color-mix(in srgb, var(--accent-color) 20%, transparent)' : 'var(--bg-primary)', border: editAvatarEmoji === emoji ? '2px solid var(--accent-color)' : '2px solid transparent' }}>
                        {emoji}
                      </button>
                    ))}
                  </div>
                  {editAvatarEmoji && (
                    <button onClick={() => setEditAvatarEmoji(null)} className="text-[11px] text-label-tertiary mt-2 active:opacity-60 underline">
                      選択を解除（イニシャル表示に戻す）
                    </button>
                  )}
                </div>
              )}

              {/* ホーム県 */}
              <div className="px-5 py-3 border-t" style={{ borderColor: 'var(--border-faint)' }}>
                {editingField === 'pref' ? (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <p className="text-label-tertiary text-xs">ホーム県</p>
                      <div className="flex items-center gap-2">
                        <button onClick={cancelFieldEdit} className="text-xs text-label-secondary active:opacity-60">キャンセル</button>
                        <button onClick={() => saveSingleField('pref')} disabled={savingProfile} className="text-xs font-semibold active:opacity-70 disabled:opacity-40" style={{ color: 'var(--accent-color)' }}>
                          {savingProfile ? '保存中…' : '保存'}
                        </button>
                      </div>
                    </div>
                    <PrefectureSearch value={editPref ?? ''} onChange={pref => setEditPref(pref || null)} />
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-label-tertiary text-xs">ホーム県:</span>
                      <span className="text-label-primary text-sm">{homePref ?? '未設定'}</span>
                    </div>
                    <button onClick={() => startFieldEdit('pref')} className="w-7 h-7 flex items-center justify-center rounded-full active:opacity-60" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                      <Pencil size={12} className="text-label-secondary" />
                    </button>
                  </div>
                )}
              </div>

              {/* X */}
              <div className="px-5 py-3 border-t" style={{ borderColor: 'var(--border-faint)' }}>
                {editingField === 'x' ? (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <p className="text-label-tertiary text-xs">X (Twitter) URL</p>
                      <div className="flex items-center gap-2">
                        <button onClick={cancelFieldEdit} className="text-xs text-label-secondary active:opacity-60">キャンセル</button>
                        <button onClick={() => saveSingleField('x')} disabled={savingProfile} className="text-xs font-semibold active:opacity-70 disabled:opacity-40" style={{ color: 'var(--accent-color)' }}>
                          {savingProfile ? '保存中…' : '保存'}
                        </button>
                      </div>
                    </div>
                    <input type="url" value={editXUrl} onChange={e => setEditXUrl(e.target.value)}
                      placeholder="https://x.com/username" autoFocus
                      className="w-full bg-bg-primary rounded-lg px-3 py-1.5 text-sm text-label-primary placeholder:text-label-tertiary outline-none border border-faint focus:border-strong" />
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <div className="flex items-baseline gap-1.5 min-w-0">
                      <span className="text-label-tertiary text-xs flex-shrink-0">X:</span>
                      {xUrl ? (
                        <a href={xUrl} target="_blank" rel="noopener noreferrer" className="text-sm truncate active:opacity-60" style={{ color: 'var(--accent-color)' }}>
                          {xUrl.replace(/^https?:\/\/(www\.)?(x\.com|twitter\.com)\//, '@')}
                        </a>
                      ) : (
                        <span className="text-label-tertiary text-sm">未設定</span>
                      )}
                    </div>
                    <button onClick={() => startFieldEdit('x')} className="ml-2 flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-full active:opacity-60" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                      <Pencil size={12} className="text-label-secondary" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* ── ファンスター ───────────────────────── */}
          <section>
            <p className="text-label-tertiary text-xs mb-3">ファンスター</p>
            <div className="rounded-xl shadow-card px-2 py-4" style={{ backgroundColor: 'var(--bg-secondary)' }}>
              {radarData ? (
                <ResponsiveContainer width="100%" height={200}>
                  <RadarChart data={radarData} margin={{ top: 10, right: 30, bottom: 10, left: 30 }}>
                    <PolarGrid stroke="var(--border-subtle)" />
                    <PolarAngleAxis dataKey="axis" tick={CustomTick as React.FC} />
                    <Radar dataKey="value" stroke="var(--accent-color)" fill="var(--accent-color)" fillOpacity={0.35} strokeWidth={2} />
                  </RadarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[200px] flex items-center justify-center">
                  <p className="text-label-tertiary text-sm">読み込み中…</p>
                </div>
              )}
            </div>
          </section>

          {/* ── 実績バッジ ─────────────────────────── */}
          <section>
            <p className="text-label-tertiary text-xs mb-3">実績</p>
            <div className="rounded-xl shadow-card px-4 py-4" style={{ backgroundColor: 'var(--bg-secondary)' }}>
              <div className="grid grid-cols-4 gap-3">
                {BADGES.map(badge => {
                  const unlocked = statsReady && badge.check(achStats);
                  return (
                    <div key={badge.label} className="flex flex-col items-center gap-1" style={{ opacity: unlocked ? 1 : 0.3, filter: unlocked ? 'none' : 'grayscale(1)' }}>
                      <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl"
                        style={{ backgroundColor: unlocked ? 'color-mix(in srgb, var(--accent-color) 12%, transparent)' : 'var(--bg-primary)' }}>
                        {badge.emoji}
                      </div>
                      <p className="text-[10px] text-label-secondary text-center leading-tight">{badge.label}</p>
                      <p className="text-[9px] text-label-tertiary text-center leading-tight">{badge.desc}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          {/* ── アクティビティ ─────────────────────── */}
          <section>
            <p className="text-label-tertiary text-xs mb-3">アクティビティ</p>
            <button
              onClick={() => navigate('/select')}
              className="w-full flex items-center justify-between px-5 py-4 rounded-xl shadow-card active:opacity-70"
              style={{ backgroundColor: 'var(--bg-secondary)' }}
            >
              <span className="text-label-primary text-sm">参加している作品</span>
              <div className="flex items-center gap-1.5">
                <span className="text-label-primary text-base font-bold">
                  {worksCount === null ? '…' : worksCount}
                  <span className="text-label-tertiary text-xs font-normal ml-0.5">件</span>
                </span>
                <ChevronRight size={14} className="text-label-tertiary" />
              </div>
            </button>
            <div className="grid grid-cols-2 gap-3 mt-3">
              {[
                { label: '投稿した予定', value: postedCount, unit: '件' },
                { label: 'いいねした', value: likesGiven, unit: '回' },
                { label: 'もらったいいね', value: receivedLikes, unit: '' },
                { label: 'リアクションした', value: reactionsGiven, unit: '回' },
              ].map(({ label, value, unit }) => (
                <div key={label} className="rounded-xl px-4 py-4 shadow-card flex flex-col gap-1" style={{ backgroundColor: 'var(--bg-secondary)' }}>
                  <span className="text-label-tertiary text-[11px] leading-none">{label}</span>
                  <span className="text-label-primary text-2xl font-bold leading-tight">
                    {value === null ? '…' : value}
                    {value !== null && unit && <span className="text-label-tertiary text-xs font-normal ml-0.5">{unit}</span>}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>

      {/* 地域フィルターパネル */}
      {showRegionPanel && (
        <div className="fixed inset-0 z-[200] flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowRegionPanel(false)} />
          <div className="relative bg-bg-primary rounded-t-2xl"
            style={{ maxHeight: '85vh', display: 'flex', flexDirection: 'column', animation: 'slideUpPanel 0.28s cubic-bezier(0.32, 0.72, 0, 1) both' }}>
            <div style={{ flexShrink: 0 }} className="pt-3 px-4 pb-3 border-b border-faint">
              <div className="flex justify-center mb-2"><div className="w-10 h-1 rounded-full bg-label-tertiary/50" /></div>
              <div className="flex items-center justify-between">
                <p className="text-label-primary font-semibold text-sm">地域で絞り込む</p>
                <button onClick={() => setShowRegionPanel(false)} className="text-xs text-label-secondary active:opacity-60">閉じる</button>
              </div>
              {filterActive && (
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-xs rounded-full px-2.5 py-0.5 border" style={{ color: 'var(--accent-color)', borderColor: 'var(--accent-color)' }}>{filterLabel}</span>
                  <button onClick={() => { setFilterMode('none'); setFilterValue(null); setIncludeAdjacent(false); saveRegionFilter({ filterMode: 'none', filterValue: null, includeAdjacent: false }); }} className="text-xs text-label-tertiary underline active:opacity-60">解除</button>
                </div>
              )}
            </div>
            <div style={{ flex: 1, minHeight: 0, overflowY: 'scroll', WebkitOverflowScrolling: 'touch', padding: '16px 16px 40px' } as React.CSSProperties}>
              <div className="mb-5">
                <p className="text-label-tertiary text-xs mb-2">都道府県で選ぶ</p>
                <PrefectureSearch
                  value={filterMode === 'pref' ? filterValue ?? '' : ''}
                  onChange={pref => {
                    if (pref) { setFilterMode('pref'); setFilterValue(pref); setIncludeAdjacent(false); saveRegionFilter({ filterMode: 'pref', filterValue: pref, includeAdjacent: false }); setShowRegionPanel(false); }
                    else { setFilterMode('none'); setFilterValue(null); setIncludeAdjacent(false); saveRegionFilter({ filterMode: 'none', filterValue: null, includeAdjacent: false }); }
                  }}
                />
              </div>
              <div className="mb-5">
                <p className="text-label-tertiary text-xs mb-2">地域で選ぶ</p>
                <select value={filterMode === 'region' ? filterValue ?? '' : ''}
                  onChange={e => {
                    if (e.target.value) { setFilterMode('region'); setFilterValue(e.target.value); setIncludeAdjacent(false); saveRegionFilter({ filterMode: 'region', filterValue: e.target.value, includeAdjacent: false }); setShowRegionPanel(false); }
                    else { setFilterMode('none'); setFilterValue(null); saveRegionFilter({ filterMode: 'none', filterValue: null, includeAdjacent: false }); }
                  }}
                  className="w-full bg-bg-secondary rounded-xl px-3 py-3 text-sm text-label-primary outline-none border border-subtle appearance-none">
                  <option value="">地域を選ぶ</option>
                  {REGIONS.map(r => <option key={r.name} value={r.name}>{r.name}地方</option>)}
                </select>
              </div>
              {filterMode === 'pref' && filterValue && (ADJACENT[filterValue]?.length ?? 0) > 0 && (
                <button onClick={() => { setIncludeAdjacent(v => !v); saveRegionFilter({ filterMode, filterValue, includeAdjacent: !includeAdjacent }); }}
                  className="w-full flex items-center justify-between px-4 py-3 bg-bg-secondary rounded-xl mb-5">
                  <div>
                    <p className="text-sm text-label-primary text-left">隣接する県を含む</p>
                    {includeAdjacent && <p className="text-[10px] text-label-tertiary text-left mt-0.5">{ADJACENT[filterValue].join('・')}</p>}
                  </div>
                  <div className="flex-shrink-0 w-11 h-6 rounded-full relative transition-colors ml-3" style={{ background: includeAdjacent ? 'var(--accent-color)' : 'rgba(128,128,128,0.4)' }}>
                    <div className="absolute top-1 w-4 h-4 bg-white rounded-full transition-all shadow-sm" style={{ left: includeAdjacent ? 'calc(100% - 20px)' : '4px' }} />
                  </div>
                </button>
              )}
              {!homePref && (
                <div className="mb-4 px-4 py-3 bg-bg-secondary rounded-xl border border-faint">
                  <p className="text-label-primary text-sm font-medium mb-1">ホーム県を設定する</p>
                  <p className="text-label-tertiary text-xs mb-3 leading-relaxed">設定しておくと、ワンタップでホーム県に絞り込めます。</p>
                  <button onClick={() => { setShowRegionPanel(false); startFieldEdit('pref'); }} className="text-xs font-semibold active:opacity-60" style={{ color: 'var(--accent-color)' }}>プロフィールで登録する →</button>
                </div>
              )}
              {homePref && !(filterMode === 'pref' && filterValue === homePref) && (
                <button onClick={() => { setFilterMode('pref'); setFilterValue(homePref); setIncludeAdjacent(false); saveRegionFilter({ filterMode: 'pref', filterValue: homePref, includeAdjacent: false }); setShowRegionPanel(false); }}
                  className="w-full text-center py-3 rounded-xl text-sm font-medium active:opacity-70 mb-3"
                  style={{ background: 'var(--accent-color)', color: 'var(--bg-primary)' }}>
                  ホーム県（{homePref}）で絞り込む
                </button>
              )}
              {filterActive && (
                <button onClick={() => { setFilterMode('none'); setFilterValue(null); setIncludeAdjacent(false); saveRegionFilter({ filterMode: 'none', filterValue: null, includeAdjacent: false }); setShowRegionPanel(false); }} className="w-full text-center py-3 rounded-xl border border-subtle text-sm text-label-secondary active:opacity-60">全国表示（絞り込みなし）</button>
              )}
            </div>
          </div>
        </div>
      )}

      <BottomTab />
    </>
  );
}

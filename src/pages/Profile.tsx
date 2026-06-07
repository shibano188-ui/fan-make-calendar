import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Pencil, Check, X, ChevronRight, Palette, Map as MapIcon } from 'lucide-react';
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

import { type AchievementStats, calcTitle, calcRadarData, calcGrade } from '../lib/achievements';

const BADGES = [
  // 投稿系
  { emoji: '🌱', label: 'はじめの一歩',   desc: '初投稿',           check: (s: AchievementStats) => s.posted >= 1 },
  { emoji: '📝', label: 'じゅうまい',     desc: '投稿10件',         check: (s: AchievementStats) => s.posted >= 10 },
  { emoji: '📅', label: '百投の達人',     desc: '投稿100件',        check: (s: AchievementStats) => s.posted >= 100 },
  { emoji: '💯', label: 'センタイ',       desc: '投稿200件',        check: (s: AchievementStats) => s.posted >= 200 },
  // いいね（した）系
  { emoji: '❤️', label: 'いいね職人',     desc: 'いいね50回',       check: (s: AchievementStats) => s.likesGiven >= 50 },
  { emoji: '💝', label: 'いいね狂い',     desc: 'いいね200回',      check: (s: AchievementStats) => s.likesGiven >= 200 },
  { emoji: '🫶', label: 'いいね魔人',     desc: 'いいね500回',      check: (s: AchievementStats) => s.likesGiven >= 500 },
  { emoji: '💖', label: 'いいね神',       desc: 'いいね1000回',     check: (s: AchievementStats) => s.likesGiven >= 1000 },
  // いいね（もらった）系
  { emoji: '🌟', label: '愛されファン',   desc: 'いいね50もらう',   check: (s: AchievementStats) => s.received >= 50 },
  { emoji: '⭐', label: 'スター',         desc: 'いいね200もらう',  check: (s: AchievementStats) => s.received >= 200 },
  { emoji: '👑', label: 'カリスマ',       desc: 'いいね500もらう',  check: (s: AchievementStats) => s.received >= 500 },
  { emoji: '🏆', label: 'レジェンド',     desc: 'いいね1000もらう', check: (s: AchievementStats) => s.received >= 1000 },
  // リアクション + 作品系
  { emoji: '😊', label: 'リアクション王', desc: 'リアクション50回', check: (s: AchievementStats) => s.reactionsGiven >= 50 },
  { emoji: '🎊', label: 'リアクション神', desc: 'リアクション200回', check: (s: AchievementStats) => s.reactionsGiven >= 200 },
  { emoji: '🎭', label: '多推し勢',       desc: '3作品以上参加',    check: (s: AchievementStats) => s.works >= 3 },
  { emoji: '🌐', label: '全方位ファン',   desc: '10作品以上参加',   check: (s: AchievementStats) => s.works >= 10 },
  // 特殊カテゴリ
  { emoji: '🎂', label: '誕生日マスター', desc: '誕生日投稿5件',   check: (s: AchievementStats) => s.birthdayPosts >= 5 },
  { emoji: '🎉', label: '誕生日神',       desc: '誕生日投稿20件',  check: (s: AchievementStats) => s.birthdayPosts >= 20 },
  { emoji: '🤝', label: 'コラボハンター', desc: 'コラボ投稿3件',   check: (s: AchievementStats) => s.collabPosts >= 3 },
  { emoji: '🔗', label: 'コラボマスター', desc: 'コラボ投稿10件',  check: (s: AchievementStats) => s.collabPosts >= 10 },
];

// ─── カスタムSVGスターレーダーチャート ─────────────────────────────
const STAR_CX = 150;
const STAR_CY = 150;
const STAR_MAX_R = 85;
const STAR_INNER_RATIO = 0.42;
const STAR_LABEL_R = STAR_MAX_R * 1.42;
const N_AXES = 5;

function toRad(deg: number) { return (deg * Math.PI) / 180; }
function axisAngle(i: number) { return toRad(-90 + (360 / N_AXES) * i); }
function innerAngle(i: number) { return toRad(-90 + (360 / N_AXES) * i + 180 / N_AXES); }
function axisXY(i: number, frac: number) {
  return { x: STAR_CX + Math.cos(axisAngle(i)) * STAR_MAX_R * frac, y: STAR_CY + Math.sin(axisAngle(i)) * STAR_MAX_R * frac };
}
function innerXY(i: number, frac: number) {
  return { x: STAR_CX + Math.cos(innerAngle(i)) * STAR_MAX_R * STAR_INNER_RATIO * frac, y: STAR_CY + Math.sin(innerAngle(i)) * STAR_MAX_R * STAR_INNER_RATIO * frac };
}
function starPath(frac: number) {
  const pts: string[] = [];
  for (let i = 0; i < N_AXES; i++) {
    const a = axisXY(i, frac); pts.push(`${a.x.toFixed(1)},${a.y.toFixed(1)}`);
    const b = innerXY(i, frac); pts.push(`${b.x.toFixed(1)},${b.y.toFixed(1)}`);
  }
  return `M ${pts.join(' L ')} Z`;
}

const STAR_MIN_FRAC = 0.15;

function StarRadarChart({ data }: { data: { axis: string; value: number }[] }) {
  // 偏りがあっても常に星形を保つため、データポリゴンも軸点+谷点で構成する
  const fracs = data.map(d => Math.max(STAR_MIN_FRAC, d.value / 100));
  const n = fracs.length;
  const dataStarPts: string[] = [];
  for (let i = 0; i < n; i++) {
    const outer = axisXY(i, fracs[i]);
    dataStarPts.push(`${outer.x.toFixed(1)},${outer.y.toFixed(1)}`);
    const avgFrac = (fracs[i] + fracs[(i + 1) % n]) / 2;
    const ir = STAR_MAX_R * STAR_INNER_RATIO * avgFrac;
    const angle = innerAngle(i);
    dataStarPts.push(`${(STAR_CX + Math.cos(angle) * ir).toFixed(1)},${(STAR_CY + Math.sin(angle) * ir).toFixed(1)}`);
  }
  const dataPath = dataStarPts.join(' L ');

  return (
    <svg viewBox="0 0 300 300" width="100%" style={{ display: 'block' }}>
      {/* グリッドスター */}
      {[0.25, 0.5, 0.75, 1].map(f => (
        <path key={f} d={starPath(f)} fill="none" style={{ stroke: 'var(--border-subtle)' }} strokeWidth={1} />
      ))}
      {/* 軸線 */}
      {data.map((_, i) => {
        const tip = axisXY(i, 1);
        return <line key={i} x1={STAR_CX} y1={STAR_CY} x2={tip.x} y2={tip.y} style={{ stroke: 'var(--border-subtle)' }} strokeWidth={1} />;
      })}
      {/* データポリゴン */}
      <path d={`M ${dataPath} Z`} fill="#F59E0B" fillOpacity={0.5} stroke="#FCD34D" strokeWidth={2} strokeLinejoin="round" />
      {/* 軸ラベル（スコア + 軸名） */}
      {data.map((d, i) => {
        const angle = axisAngle(i);
        const lx = STAR_CX + Math.cos(angle) * STAR_LABEL_R;
        const ly = STAR_CY + Math.sin(angle) * STAR_LABEL_R;
        const anchor = lx < STAR_CX - 10 ? 'end' : lx > STAR_CX + 10 ? 'start' : 'middle';
        return (
          <g key={i}>
            <text x={lx} y={ly - 7} textAnchor={anchor} fill="#FCD34D" fontSize={13} fontWeight="bold">{d.value}</text>
            <text x={lx} y={ly + 8} textAnchor={anchor} fill="#F59E0B" fontSize={10}>{d.axis}</text>
          </g>
        );
      })}
    </svg>
  );
}

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

  // バッジタップ表示
  const [selectedBadge, setSelectedBadge] = useState<number | null>(null);

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
  const grade = statsReady ? calcGrade(achStats) : null;

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

          {/* ── ファンスター & 実績バッジ ──────────── */}
          <section>
            <div className="rounded-xl shadow-card px-3 pt-4 pb-4" style={{ backgroundColor: 'var(--bg-secondary)' }}>

              {/* 称号行 */}
              <div className="flex items-center gap-3 px-1 mb-4">
                <span className="text-3xl leading-none">{avatarEmoji ?? '👤'}</span>
                <p className="flex-1 font-bold text-sm truncate" style={{ color: '#FCD34D' }}>
                  {title ?? '…'}
                </p>
                {grade !== null && (
                  <div className="text-right flex-shrink-0">
                    <p style={{ color: '#F59E0B', fontSize: 10 }}>グレード</p>
                    <p style={{ color: '#FCD34D', fontWeight: 'bold', fontSize: 18, lineHeight: 1.1 }}>
                      {grade}<span style={{ color: '#D97706', fontSize: 11, fontWeight: 'normal' }}>/500</span>
                    </p>
                  </div>
                )}
              </div>

              {/* 区切り */}
              <div className="border-t mb-3" style={{ borderColor: 'var(--border-subtle)' }} />

              {/* ファンスター見出し */}
              <p className="text-xs px-1 mb-2" style={{ color: '#F59E0B' }}>ファンスター</p>

              {/* スターレーダー */}
              {radarData ? (
                <StarRadarChart data={radarData} />
              ) : (
                <div className="h-[240px] flex items-center justify-center">
                  <p className="text-sm" style={{ color: '#F59E0B' }}>読み込み中…</p>
                </div>
              )}

              {/* 区切り */}
              <div className="my-4 border-t" style={{ borderColor: 'var(--border-subtle)' }} />

              {/* 実績見出し */}
              <p className="text-xs px-1 mb-3" style={{ color: '#F59E0B' }}>実績</p>

              {/* バッジグリッド（20個・4行5列） */}
              <div className="grid grid-cols-5 gap-2 px-1">
                {BADGES.map((badge, i) => {
                  const unlocked = statsReady && badge.check(achStats);
                  const active = selectedBadge === i;
                  return (
                    <button
                      key={badge.label}
                      onClick={() => setSelectedBadge(active ? null : i)}
                      className="flex flex-col items-center active:scale-90 transition-transform"
                    >
                      <div
                        className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl"
                        style={{
                          opacity: unlocked ? 1 : 0.25,
                          filter: unlocked ? 'none' : 'grayscale(1)',
                          backgroundColor: active ? 'rgba(245,158,11,0.22)' : 'var(--bg-primary)',
                          border: active ? '1.5px solid #F59E0B' : '1.5px solid transparent',
                        }}
                      >
                        {badge.emoji}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* バッジ詳細（タップで表示） */}
              {selectedBadge !== null && (() => {
                const b = BADGES[selectedBadge];
                const unlocked = statsReady && b.check(achStats);
                return (
                  <div className="mt-4 px-3 py-3 rounded-xl flex items-center gap-3" style={{ backgroundColor: 'var(--bg-primary)' }}>
                    <span className="text-2xl">{b.emoji}</span>
                    <div>
                      <p className="text-sm font-semibold" style={{ color: unlocked ? '#F59E0B' : 'var(--label-tertiary)' }}>{b.label}</p>
                      <p className="text-xs mt-0.5 text-label-tertiary">{b.desc}{!unlocked && ' （未解除）'}</p>
                    </div>
                  </div>
                );
              })()}
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

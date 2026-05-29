import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Pencil, Check, X, ChevronRight, Users } from 'lucide-react';
import BottomTab from '../components/BottomTab';
import Header from '../components/Header';
import { useTheme, COMMUNITY_THEMES } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import {
  getHomePrefecture, saveHomePrefecture,
  getDisplayName, saveDisplayName,
  getXUrl, saveXUrl,
  getAvatarEmoji, saveAvatarEmoji,
  listRecentWorks, countUserPostedEvents, getTotalReceivedLikes,
} from '../lib/api';

const ANIMAL_AVATARS = [
  '🦊','🐱','🐼','🐻','🐰','🐨','🐯','🐶',
  '🦁','🐮','🐷','🐸','🦋','🐝','🐬','🐧',
  '🦄','🐙','🦜','🦅','🦖','🐳','🦓','🐢',
];
import { ExternalLink } from 'lucide-react';
import { loadCalendarEventIds, loadTotalLikesGiven } from '../lib/constants';
import { PrefectureSearch } from '../components/UserSettingsSheet';

const BOTTOM_TAB_H = 56;

function themeButtonClass(active: boolean) {
  return `flex-1 rounded-xl overflow-hidden border-2 transition-all ${active ? 'border-accent' : 'border-subtle'} active:opacity-70`;
}

// ─── コミュニティテーマモーダル（適用のみ、共有なし）─────────────────────
function CommunityThemePicker({
  currentId,
  onSelect,
  onClose,
}: {
  currentId: string;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[200] flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div
        className="relative rounded-t-2xl"
        style={{
          backgroundColor: 'var(--bg-primary)',
          maxHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
          animation: 'slideUpPanel 0.28s cubic-bezier(0.32, 0.72, 0, 1) both',
        }}
      >
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-10 h-1 rounded-full" style={{ backgroundColor: 'var(--border-subtle)' }} />
        </div>
        <div className="px-4 pb-3 flex items-center justify-between flex-shrink-0">
          <p className="text-label-primary font-semibold text-base">みんなのテーマ</p>
          <button onClick={onClose} className="text-xs text-label-secondary active:opacity-60">閉じる</button>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: 'scroll', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
          className="px-4 pb-8">
          <div className="flex flex-col gap-2">
            {COMMUNITY_THEMES.map(theme => {
              const selected = currentId === theme.id;
              return (
                <button
                  key={theme.id}
                  onClick={() => { onSelect(theme.id); onClose(); }}
                  className="w-full flex items-center gap-3 px-3 py-3 rounded-xl border transition-colors active:opacity-70"
                  style={{
                    borderColor: selected ? 'var(--accent-color)' : 'var(--border-subtle)',
                    backgroundColor: selected ? 'color-mix(in srgb, var(--accent-color) 8%, transparent)' : 'var(--bg-secondary)',
                  }}
                >
                  <div className="w-10 h-10 rounded-lg flex-shrink-0 overflow-hidden" style={{ backgroundColor: theme.vars['--bg-primary'] }}>
                    <div className="w-full h-1/2" style={{ backgroundColor: theme.vars['--bg-secondary'] }} />
                  </div>
                  <div className="text-left flex-1 min-w-0">
                    <p className="text-label-primary text-sm font-medium">{theme.name}</p>
                  </div>
                  {selected && <Check size={16} style={{ color: 'var(--accent-color)', flexShrink: 0 }} />}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── メイン ────────────────────────────────────────────────────────
export default function Profile() {
  const navigate = useNavigate();
  const { settings, updateSettings } = useTheme();
  const { user } = useAuth();

  const isCommunityActive = !!settings.communityThemeId;
  const [showCommunityPicker, setShowCommunityPicker] = useState(false);

  // プロフィール編集
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [homePref, setHomePref] = useState<string | null>(null);
  const [xUrl, setXUrl] = useState<string | null>(null);
  const [avatarEmoji, setAvatarEmoji] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPref, setEditPref] = useState<string | null>(null);
  const [editXUrl, setEditXUrl] = useState('');
  const [editAvatarEmoji, setEditAvatarEmoji] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);

  // 統計
  const [postedCount, setPostedCount] = useState<number | null>(null);
  const [receivedLikes, setReceivedLikes] = useState<number | null>(null);
  const [worksCount, setWorksCount] = useState<number | null>(null);
  const addedCount = loadCalendarEventIds().size;
  const totalLikesGiven = loadTotalLikesGiven();

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
    ]).then(([name, pref, x, emoji, posted, likes, works]) => {
      setDisplayName(name);
      setHomePref(pref);
      setXUrl(x);
      setAvatarEmoji(emoji);
      setPostedCount(posted);
      setReceivedLikes(likes);
      setWorksCount(works.length);
    }).catch(() => {});
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const initials = (displayName ?? '匿名').slice(0, 2).toUpperCase();

  const startEdit = () => {
    setEditName(displayName ?? '');
    setEditPref(homePref);
    setEditXUrl(xUrl ?? '');
    setEditAvatarEmoji(avatarEmoji);
    setEditing(true);
  };

  const cancelEdit = () => setEditing(false);

  const saveProfile = async () => {
    if (!user) return;
    setSavingProfile(true);
    try {
      await Promise.all([
        saveDisplayName(user.id, editName.trim()),
        saveHomePrefecture(user.id, editPref),
        saveXUrl(user.id, editXUrl.trim() || null),
        saveAvatarEmoji(user.id, editAvatarEmoji),
      ]);
      setDisplayName(editName.trim() || null);
      setHomePref(editPref);
      setXUrl(editXUrl.trim() || null);
      setAvatarEmoji(editAvatarEmoji);
      setEditing(false);
    } catch { /* ignore */ }
    finally { setSavingProfile(false); }
  };

  return (
    <>
      <div
        className="fixed inset-0 max-w-app mx-auto flex flex-col overflow-hidden"
        style={{ backgroundColor: 'var(--bg-primary)', paddingTop: 44, paddingBottom: BOTTOM_TAB_H }}
      >
        <Header leftNode={<span className="text-base font-bold text-label-primary">プロフィール</span>} />

        <div className="flex-1 overflow-y-auto px-4 pt-4 pb-8 flex flex-col gap-6">

          {/* ── テーマ ────────────────────────────── */}
          <section>
            <p className="text-label-tertiary text-xs mb-3">テーマ</p>
            <div className="flex gap-2">
              <button
                onClick={() => updateSettings({ theme: 'simple', communityThemeId: '' })}
                className={themeButtonClass(settings.theme === 'simple' && !isCommunityActive)}
              >
                <div className="h-10 bg-[#f5f5f5]" />
                <div className="py-1.5" style={{ backgroundColor: 'var(--bg-secondary)' }}>
                  <p className="text-xs text-label-primary text-center">シンプル</p>
                </div>
              </button>
              <button
                onClick={() => updateSettings({ theme: 'dark', communityThemeId: '' })}
                className={themeButtonClass(settings.theme === 'dark' && !isCommunityActive)}
              >
                <div className="h-10 bg-[#1a1a1a]" />
                <div className="py-1.5" style={{ backgroundColor: 'var(--bg-secondary)' }}>
                  <p className="text-xs text-label-primary text-center">ダーク</p>
                </div>
              </button>
              <button
                onClick={() => setShowCommunityPicker(true)}
                className={themeButtonClass(isCommunityActive)}
              >
                <div className="h-10 flex items-center justify-center" style={{ backgroundColor: 'var(--bg-secondary)' }}>
                  <Users size={18} className="text-label-tertiary" />
                </div>
                <div className="py-1.5 border-t" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-subtle)' }}>
                  <p className="text-xs text-label-secondary text-center">みんなのテーマ</p>
                </div>
              </button>
            </div>
            {isCommunityActive && (
              <p className="text-label-tertiary text-xs mt-1.5 px-1">
                適用中: {COMMUNITY_THEMES.find(t => t.id === settings.communityThemeId)?.name}
              </p>
            )}
          </section>

          {/* ── プロフィール ───────────────────────── */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <p className="text-label-tertiary text-xs">プロフィール</p>
              {!editing && (
                <button onClick={startEdit} className="flex items-center gap-1 text-xs active:opacity-60" style={{ color: 'var(--accent-color)' }}>
                  <Pencil size={12} />編集
                </button>
              )}
            </div>

            <div className="rounded-xl overflow-hidden shadow-card" style={{ backgroundColor: 'var(--bg-secondary)' }}>
              {/* アバター＋名前エリア */}
              <div className="flex items-center gap-4 px-5 pt-5 pb-4">
                <button
                  onClick={editing ? undefined : startEdit}
                  className="w-16 h-16 rounded-full flex items-center justify-center flex-shrink-0 relative"
                  style={{ backgroundColor: 'var(--accent-color)' }}
                >
                  {avatarEmoji && !editing ? (
                    <span className="text-3xl leading-none">{avatarEmoji}</span>
                  ) : editing && editAvatarEmoji ? (
                    <span className="text-3xl leading-none">{editAvatarEmoji}</span>
                  ) : (
                    <span className="text-xl font-bold" style={{ color: 'var(--bg-primary)' }}>{initials}</span>
                  )}
                  {!editing && (
                    <span className="absolute bottom-0 right-0 w-5 h-5 rounded-full flex items-center justify-center"
                      style={{ backgroundColor: 'var(--bg-primary)' }}>
                      <Pencil size={10} style={{ color: 'var(--label-secondary)' }} />
                    </span>
                  )}
                </button>
                {editing ? (
                  <div className="flex-1 min-w-0 flex flex-col gap-2">
                    <input
                      type="text"
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      placeholder="表示名"
                      className="w-full bg-bg-primary rounded-lg px-3 py-2 text-sm text-label-primary placeholder:text-label-tertiary outline-none border border-faint focus:border-strong"
                    />
                  </div>
                ) : (
                  <div className="flex-1 min-w-0">
                    <p className="text-label-primary font-semibold text-base truncate">{displayName ?? '匿名'}</p>
                    {homePref && <p className="text-label-tertiary text-xs mt-0.5">{homePref}</p>}
                  </div>
                )}
              </div>

              {/* ホーム県（編集中） */}
              {editing && (
                <div className="px-5 pb-3 flex flex-col gap-2 border-t" style={{ borderColor: 'var(--border-faint)' }}>
                  <p className="text-label-tertiary text-xs pt-3">ホーム県</p>
                  <PrefectureSearch
                    value={editPref ?? ''}
                    onChange={pref => setEditPref(pref || null)}
                  />
                </div>
              )}

              {/* X URL（編集中） */}
              {editing && (
                <div className="px-5 pb-3 flex flex-col gap-2 border-t" style={{ borderColor: 'var(--border-faint)' }}>
                  <p className="text-label-tertiary text-xs pt-3">X (Twitter) URL</p>
                  <input
                    type="url"
                    value={editXUrl}
                    onChange={e => setEditXUrl(e.target.value)}
                    placeholder="https://x.com/username"
                    className="w-full bg-bg-primary rounded-lg px-3 py-2 text-sm text-label-primary placeholder:text-label-tertiary outline-none border border-faint focus:border-strong"
                  />
                </div>
              )}

              {/* アバター選択（編集中） */}
              {editing && (
                <div className="px-5 pb-4 border-t" style={{ borderColor: 'var(--border-faint)' }}>
                  <p className="text-label-tertiary text-xs pt-3 mb-2">アバター</p>
                  <div className="grid grid-cols-8 gap-1.5">
                    {ANIMAL_AVATARS.map(emoji => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => setEditAvatarEmoji(editAvatarEmoji === emoji ? null : emoji)}
                        className="w-full aspect-square rounded-xl flex items-center justify-center text-xl active:opacity-70 transition-all"
                        style={{
                          backgroundColor: editAvatarEmoji === emoji
                            ? 'color-mix(in srgb, var(--accent-color) 20%, transparent)'
                            : 'var(--bg-primary)',
                          border: editAvatarEmoji === emoji
                            ? '2px solid var(--accent-color)'
                            : '2px solid transparent',
                        }}
                      >
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

              {/* ホーム県・X（表示中） */}
              {!editing && (homePref || xUrl) && (
                <div className="px-5 pb-4 border-t flex flex-col gap-1.5" style={{ borderColor: 'var(--border-faint)' }}>
                  {homePref && (
                    <div className="flex items-center gap-2 pt-3">
                      <span className="text-label-tertiary text-xs">ホーム県</span>
                      <span className="text-label-secondary text-xs">{homePref}</span>
                    </div>
                  )}
                  {xUrl && (
                    <a href={xUrl} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-xs active:opacity-60 w-fit"
                      style={{ color: 'var(--accent-color)', marginTop: homePref ? 0 : 12 }}>
                      <ExternalLink size={11} />X を見る
                    </a>
                  )}
                </div>
              )}
              {!editing && !homePref && !xUrl && (
                <div className="px-5 pb-4 border-t" style={{ borderColor: 'var(--border-faint)' }}>
                  <button onClick={startEdit} className="text-xs pt-3 active:opacity-60" style={{ color: 'var(--accent-color)' }}>
                    + ホーム県・X を設定する
                  </button>
                </div>
              )}

              {/* 編集ボタン行 */}
              {editing && (
                <div className="px-5 pb-4 flex gap-2 border-t" style={{ borderColor: 'var(--border-faint)' }}>
                  <button
                    onClick={cancelEdit}
                    className="flex-1 flex items-center justify-center gap-1 py-2 rounded-xl border text-xs text-label-secondary active:opacity-60"
                    style={{ borderColor: 'var(--border-default)' }}
                  >
                    <X size={13} />キャンセル
                  </button>
                  <button
                    onClick={saveProfile}
                    disabled={savingProfile}
                    className="flex-1 flex items-center justify-center gap-1 py-2 rounded-xl text-xs font-semibold active:opacity-70 disabled:opacity-40"
                    style={{ backgroundColor: 'var(--accent-color)', color: 'var(--bg-primary)' }}
                  >
                    <Check size={13} />{savingProfile ? '保存中…' : '保存'}
                  </button>
                </div>
              )}
            </div>
          </section>

          {/* ── 統計 ──────────────────────────────── */}
          <section>
            <p className="text-label-tertiary text-xs mb-3">アクティビティ</p>
            {/* 参加作品（タップで遷移） */}
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

            {/* 数値グリッド */}
            <div className="grid grid-cols-2 gap-3 mt-3">
              {[
                { label: '投稿した予定', value: postedCount, unit: '件' },
                { label: '追加した予定', value: addedCount, unit: '件' },
                { label: 'もらったいいね', value: receivedLikes, unit: '' },
                { label: 'あげたいいね', value: totalLikesGiven, unit: '' },
              ].map(({ label, value, unit }) => (
                <div key={label} className="rounded-xl px-4 py-4 shadow-card flex flex-col gap-1"
                  style={{ backgroundColor: 'var(--bg-secondary)' }}>
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

      {/* みんなのテーマモーダル */}
      {showCommunityPicker && (
        <CommunityThemePicker
          currentId={settings.communityThemeId}
          onSelect={id => updateSettings({ communityThemeId: id })}
          onClose={() => setShowCommunityPicker(false)}
        />
      )}

      <BottomTab />
    </>
  );
}

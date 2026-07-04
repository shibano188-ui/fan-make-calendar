import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, ResponsiveContainer } from 'recharts';
import { ChevronRight, Bell, Crown, CalendarSync, Moon, Palette, Pencil } from 'lucide-react';
import {
  getUserPublicProfile, getHomePrefecture, saveHomePrefecture, saveDisplayName, saveAvatarEmoji,
  listAllParticipatedWorks, leaveCalendar, listSavedEvents, type Work,
} from '../lib/api';
import { useConfirm } from '../components/ui/ConfirmDialog';
import { rescheduleAll } from '../lib/notifications';
import { calcTitle, calcRadarData, calcGrade, type AchievementStats } from '../lib/achievements';
import { REGIONS } from '../lib/prefectures';
import { loadNotifyLeadDays, saveNotifyLeadDays, FEATURE_GOOGLE_CALENDAR, FEATURE_PREMIUM } from '../lib/constants';
import { isGoogleConfigured, isGoogleLinked, linkGoogle, unlinkGoogle } from '../lib/googleCalendar';
import { useTheme, type ThemeMode } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../components/ui/Toast';
import { haptic, hapticsDebug } from '../lib/haptics';

const ALL_PREFS = REGIONS.flatMap((r) => r.prefectures);

const ANIMAL_AVATARS = [
  '🐝', '🦊', '🐱', '🐼', '🐻', '🐰', '🐨', '🐯',
  '🐶', '🦁', '🐮', '🐷', '🐸', '🦋', '🐬', '🐧',
  '🦄', '🐙', '🦜', '🦅', '🦖', '🐳', '🦓', '🐢',
];

export default function MyPage() {
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [stats, setStats] = useState<AchievementStats | null>(null);
  const [avatar, setAvatar] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [homePref, setHomePref] = useState('');
  const [works, setWorks] = useState<Work[]>([]);
  const [worksOpen, setWorksOpen] = useState(false);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const confirm = useConfirm();
  const [leadDays, setLeadDays] = useState(loadNotifyLeadDays());
  const [gcalLinked, setGcalLinked] = useState(isGoogleLinked());
  const { settings, updateSettings } = useTheme();

  const onLinkGoogle = async () => {
    haptic.select();
    if (gcalLinked) { unlinkGoogle(); setGcalLinked(false); toast('連携を解除しました'); return; }
    const ok = await linkGoogle();
    setGcalLinked(ok);
    toast(ok ? 'Googleカレンダーと連携しました' : '連携に失敗しました');
  };

  useEffect(() => {
    if (!user) return;
    let alive = true;
    getUserPublicProfile(user.id).then((p) => {
      if (!alive) return;
      setStats({ posted: p.postedCount, received: p.receivedLikes, likesGiven: p.likesGiven, reactionsGiven: p.reactionsGiven, works: p.works, birthdayPosts: p.birthdayPosts });
      setAvatar(p.avatarEmoji);
      setName(p.displayName ?? '');
    }).catch(() => {});
    getHomePrefecture(user.id).then((p) => alive && setHomePref(p ?? '')).catch(() => {});
    listAllParticipatedWorks(user.id).then((ws) => alive && setWorks(ws)).catch(() => {});
    return () => { alive = false; };
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const radar = stats ? calcRadarData(stats) : [];
  const title = stats ? calcTitle(stats) : '';
  const grade = stats ? calcGrade(stats) : 0;

  const onSaveName = async () => { if (!user) return; await saveDisplayName(user.id, name.trim()); haptic.select(); toast('表示名を保存しました'); };
  const onChangePref = async (p: string) => { setHomePref(p); if (user) { await saveHomePrefecture(user.id, p || null); toast('ホーム県を保存しました'); } };
  const onPickAvatar = async (emoji: string) => {
    haptic.select();
    setAvatar(emoji);
    setAvatarOpen(false);
    if (user) saveAvatarEmoji(user.id, emoji).catch(() => {});
  };
  const onLeave = async (w: Work) => {
    if (!user) return;
    haptic.select();
    const ok = await confirm({ title: `「${w.name}」のフォローを解除しますか？`, message: '探すタブにこの作品の予定が表示されなくなります', confirmLabel: '解除する', destructive: true });
    if (!ok) return;
    setWorks((prev) => prev.filter((x) => x.id !== w.id));
    await leaveCalendar(w.id, user.id);
  };

  return (
    <div className="px-4 pt-4 pb-4" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 16px)' }}>
      {/* プロフィール */}
      <div className="flex items-center gap-3">
        <button onClick={() => { haptic.select(); setAvatarOpen((v) => !v); }} aria-label="アバターを変更"
          className="pressable relative w-16 h-16 rounded-full flex items-center justify-center text-[32px] flex-shrink-0"
          style={{ backgroundColor: 'var(--fill-tertiary)' }}>
          {avatar ?? '🐝'}
          <span className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full flex items-center justify-center"
            style={{ backgroundColor: 'var(--accent-color)', color: 'var(--accent-on)' }}>
            <Pencil size={11} />
          </span>
        </button>
        <div className="min-w-0">
          <div className="text-[17px] font-bold truncate">{name || '名無しのファン'}</div>
          <div className="text-[13px]" style={{ color: 'var(--accent-text)' }}>{title}・グレード {grade}</div>
        </div>
      </div>

      {/* アバターピッカー（アバタータップで開閉） */}
      {avatarOpen && (
        <div className="mt-3 rounded-[14px] border border-subtle p-3 grid grid-cols-8 gap-1.5" style={{ backgroundColor: 'var(--bg-secondary)' }}>
          {ANIMAL_AVATARS.map((emoji) => (
            <button key={emoji} onClick={() => onPickAvatar(emoji)} aria-label={`アバター ${emoji}`}
              className="pressable aspect-square rounded-[10px] flex items-center justify-center text-[22px]"
              style={emoji === avatar ? { backgroundColor: 'color-mix(in srgb, var(--accent-color) 22%, transparent)' } : { backgroundColor: 'var(--fill-tertiary)' }}>
              {emoji}
            </button>
          ))}
        </div>
      )}

      {/* ファンスター */}
      <div className="mt-4 rounded-[14px] border border-subtle p-2" style={{ backgroundColor: 'var(--bg-secondary)' }}>
        <div className="text-[12px] text-label-secondary px-2 pt-1">ファンスター</div>
        {/* accessibilityLayer=false: SVGがフォーカス可能になりタップでフォーカスリング（四角）が出るのを防ぐ */}
        <div style={{ outline: 'none' }} className="[&_svg]:outline-none [&_*]:focus:outline-none">
          <ResponsiveContainer width="100%" height={220}>
            <RadarChart data={radar} outerRadius="70%" accessibilityLayer={false}>
              <PolarGrid stroke="var(--separator)" />
              <PolarAngleAxis dataKey="axis" tick={{ fontSize: 11, fill: 'var(--label-secondary)' }} />
              <Radar dataKey="value" stroke="var(--accent-color)" fill="var(--accent-color)" fillOpacity={0.4} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 統計 */}
      {stats && (
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          {[['投稿', stats.posted], ['もらったいいね', stats.received], ['フォロー作品', stats.works]].map(([label, v]) => (
            <div key={label} className="rounded-[10px] py-2" style={{ backgroundColor: 'var(--fill-tertiary)' }}>
              <div className="text-[18px] font-bold">{v}</div>
              <div className="text-[11px] text-label-secondary">{label}</div>
            </div>
          ))}
        </div>
      )}

      {/* 設定 */}
      <div className="mt-5 text-[12px] text-label-secondary mb-1">設定</div>
      <div className="rounded-[12px] border border-subtle divide-y" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-subtle)' }}>
        {/* 表示名 */}
        <div className="flex items-center gap-2 px-3 py-2.5">
          <span className="text-[13px] text-label-secondary w-16 flex-shrink-0">表示名</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="名前" className="flex-1 bg-transparent text-[14px] outline-none" style={{ color: 'var(--input-text)' }} />
          <button onClick={onSaveName} className="pressable text-[12px] font-semibold" style={{ color: 'var(--accent-text)' }}>保存</button>
        </div>
        {/* ホーム県 */}
        <div className="flex items-center gap-2 px-3 py-2.5">
          <span className="text-[13px] text-label-secondary w-16 flex-shrink-0">ホーム県</span>
          <select value={homePref} onChange={(e) => onChangePref(e.target.value)} className="flex-1 bg-transparent text-[14px] outline-none" style={{ color: 'var(--input-text)' }}>
            <option value="">未設定</option>
            {ALL_PREFS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        {/* カラーモード */}
        <div className="flex items-center gap-2 px-3 py-2.5">
          <Moon size={16} className="text-label-secondary" />
          <span className="text-[14px] flex-1">カラーモード</span>
          <select value={settings.theme} onChange={(e) => updateSettings({ theme: e.target.value as ThemeMode })}
            className="bg-transparent text-[14px] outline-none" style={{ color: 'var(--input-text)' }}>
            <option value="system">システム</option>
            <option value="simple">ライト</option>
            <option value="dark">ダーク</option>
          </select>
        </div>
        {/* カレンダーの配色・テーマ */}
        <button onClick={() => { haptic.select(); navigate('/customize'); }} className="w-full flex items-center gap-2 px-3 py-2.5 pressable text-left">
          <Palette size={16} className="text-label-secondary" />
          <span className="text-[14px] flex-1">カレンダーの配色・テーマ</span>
          <ChevronRight size={16} className="text-label-tertiary" />
        </button>
        {/* 通知リードタイム */}
        <div className="flex items-center gap-2 px-3 py-2.5">
          <Bell size={16} className="text-label-secondary" />
          <span className="text-[14px] flex-1">通知（受付開始・締切・発売の前に）</span>
          <select value={leadDays} onChange={(e) => { const d = Number(e.target.value); setLeadDays(d); saveNotifyLeadDays(d); if (user) listSavedEvents(user.id).then(rescheduleAll).catch(() => {}); }}
            className="bg-transparent text-[14px] outline-none" style={{ color: 'var(--input-text)' }}>
            {[1, 2, 3, 5, 7].map((d) => <option key={d} value={d}>{d}日前</option>)}
          </select>
        </div>
        {/* Googleカレンダー連携（実装完了まで「近日」固定） */}
        {FEATURE_GOOGLE_CALENDAR && isGoogleConfigured() ? (
          <div className="flex items-center gap-2 px-3 py-2.5">
            <CalendarSync size={16} className="text-label-secondary" />
            <span className="text-[14px] flex-1">Googleカレンダー連携</span>
            <button onClick={onLinkGoogle} className="pressable text-[12px] font-semibold px-3 py-1 rounded-full"
              style={gcalLinked ? { backgroundColor: 'var(--fill-tertiary)', color: 'var(--label-secondary)' } : { backgroundColor: 'var(--accent-color)', color: 'var(--accent-on)' }}>
              {gcalLinked ? '連携済み（解除）' : '連携する'}
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 px-3 py-2.5 opacity-50">
            <CalendarSync size={16} className="text-label-secondary" />
            <span className="text-[14px] flex-1">外部カレンダー連携</span>
            <span className="text-[11px] text-label-tertiary">近日</span>
          </div>
        )}
        {/* プレミアム（実装完了まで「近日」固定・操作不可） */}
        <div className="flex items-center gap-2 px-3 py-2.5 opacity-50">
          <Crown size={16} style={{ color: 'var(--accent-color)' }} />
          <span className="text-[14px] flex-1">プレミアム</span>
          {FEATURE_PREMIUM
            ? <ChevronRight size={16} className="text-label-tertiary" />
            : <span className="text-[11px] text-label-tertiary">近日</span>}
        </div>
      </div>

      {/* フォロー作品（ドロップダウン） */}
      <button onClick={() => setWorksOpen((v) => !v)} className="pressable w-full flex items-center justify-between mt-5 mb-1">
        <span className="text-[12px] text-label-secondary">フォロー作品（{works.length}）</span>
        <ChevronRight size={16} className="text-label-tertiary" style={{ transform: worksOpen ? 'rotate(90deg)' : 'none' }} />
      </button>
      {worksOpen && (
        works.length === 0 ? (
          <p className="text-[13px] text-label-tertiary">フォロー中の作品はありません</p>
        ) : (
          <div className="flex flex-col gap-1.5 max-h-[40vh] overflow-y-auto no-scrollbar">
            {works.map((w) => (
              <div key={w.id} className="flex items-center justify-between gap-2 rounded-[10px] px-3 py-2.5" style={{ backgroundColor: 'var(--fill-tertiary)' }}>
                <span className="text-[14px] truncate">{w.name}</span>
                <button onClick={() => onLeave(w)} className="pressable text-[12px] text-label-secondary flex-shrink-0">解除</button>
              </div>
            ))}
          </div>
        )
      )}

      {/* ビルド刻印（キャッシュ判別用）。タップで隠しハプティクス診断（バイブしない端末の切り分け用） */}
      <p className="mt-8 text-center text-[10px] text-label-tertiary" onClick={() => hapticsDebug(toast)}>build {__BUILD_TIME__}</p>
    </div>
  );
}

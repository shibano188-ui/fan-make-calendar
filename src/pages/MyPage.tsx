import { useEffect, useState } from 'react';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, ResponsiveContainer } from 'recharts';
import { ChevronRight, Bell, Crown, CalendarSync } from 'lucide-react';
import {
  getUserPublicProfile, getHomePrefecture, saveHomePrefecture, saveDisplayName,
  listAllParticipatedWorks, leaveCalendar, type Work,
} from '../lib/api';
import { calcTitle, calcRadarData, calcGrade, type AchievementStats } from '../lib/achievements';
import { REGIONS } from '../lib/prefectures';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../components/ui/Toast';
import { haptic } from '../lib/haptics';

const ALL_PREFS = REGIONS.flatMap((r) => r.prefectures);

export default function MyPage() {
  const { user } = useAuth();
  const toast = useToast();
  const [stats, setStats] = useState<AchievementStats | null>(null);
  const [avatar, setAvatar] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [homePref, setHomePref] = useState('');
  const [works, setWorks] = useState<Work[]>([]);
  const [worksOpen, setWorksOpen] = useState(false);

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
  const onLeave = async (workId: string) => { if (!user) return; haptic.select(); setWorks((prev) => prev.filter((w) => w.id !== workId)); await leaveCalendar(workId, user.id); };

  return (
    <div className="px-4 pt-4 pb-4">
      {/* プロフィール */}
      <div className="flex items-center gap-3">
        <div className="w-16 h-16 rounded-full flex items-center justify-center text-[32px]" style={{ backgroundColor: 'var(--fill-tertiary)' }}>{avatar ?? '🐝'}</div>
        <div className="min-w-0">
          <div className="text-[17px] font-bold truncate">{name || '名無しのファン'}</div>
          <div className="text-[13px]" style={{ color: 'var(--accent-text)' }}>{title}・グレード {grade}</div>
        </div>
      </div>

      {/* ファンスター */}
      <div className="mt-4 rounded-[14px] border border-subtle p-2" style={{ backgroundColor: 'var(--bg-secondary)' }}>
        <div className="text-[12px] text-label-secondary px-2 pt-1">ファンスター</div>
        <ResponsiveContainer width="100%" height={220}>
          <RadarChart data={radar} outerRadius="70%">
            <PolarGrid stroke="var(--separator)" />
            <PolarAngleAxis dataKey="axis" tick={{ fontSize: 11, fill: 'var(--label-secondary)' }} />
            <Radar dataKey="value" stroke="var(--accent-color)" fill="var(--accent-color)" fillOpacity={0.4} />
          </RadarChart>
        </ResponsiveContainer>
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
        {/* 通知（Phase6） */}
        <div className="flex items-center gap-2 px-3 py-2.5 opacity-50">
          <Bell size={16} className="text-label-secondary" />
          <span className="text-[14px] flex-1">通知</span>
          <span className="text-[11px] text-label-tertiary">近日</span>
        </div>
        {/* カレンダー連携（後） */}
        <div className="flex items-center gap-2 px-3 py-2.5 opacity-50">
          <CalendarSync size={16} className="text-label-secondary" />
          <span className="text-[14px] flex-1">外部カレンダー連携</span>
          <span className="text-[11px] text-label-tertiary">近日</span>
        </div>
        {/* プレミアム */}
        <div className="flex items-center gap-2 px-3 py-2.5 opacity-50">
          <Crown size={16} style={{ color: 'var(--accent-color)' }} />
          <span className="text-[14px] flex-1">プレミアム</span>
          <ChevronRight size={16} className="text-label-tertiary" />
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
                <button onClick={() => onLeave(w.id)} className="pressable text-[12px] text-label-secondary flex-shrink-0">解除</button>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}

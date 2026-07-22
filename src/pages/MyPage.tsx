import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Bell, Crown, CalendarSync, Moon, Palette, Pencil, Plus, Droplet, Check, MessageCircle, MapPin, UserRound } from 'lucide-react';
import { getContrastText } from '../lib/color';

// アクセント色の選択肢（先頭=デフォルトの黄色）
const MYPAGE_ACCENTS = ['#FBBF00', '#D85A30', '#1D9E75', '#378ADD', '#D4537E'] as const;
import {
  getUserPublicProfile, getHomePrefecture, saveHomePrefecture, saveDisplayName, saveAvatarEmoji,
  listAllParticipatedWorks, leaveCalendar, listSavedEvents, getProfileExtras, saveProfileExtras, type Work,
} from '../lib/api';
import { useConfirm } from '../components/ui/ConfirmDialog';
import WorkFollowSheet from '../components/WorkFollowSheet';
import AccountSheet from '../components/AccountSheet';
import { accountState, accountEmail } from '../lib/account';
import FanStarChart from '../components/FanStarChart';
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

type EditableField = 'name' | 'bio' | 'oshi' | 'fav' | 'pref';
const FIELD_META: Record<EditableField, { label: string; placeholder: string; max: number }> = {
  name: { label: '表示名', placeholder: '名前', max: 20 },
  bio:  { label: '一言コメント', placeholder: '', max: 40 },
  oshi: { label: '推し', placeholder: '', max: 30 },
  fav:  { label: '好きな作品', placeholder: '', max: 60 },
  pref: { label: 'ホーム県', placeholder: '', max: 0 },
};

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
  const [bio, setBio] = useState('');
  const [oshi, setOshi] = useState('');
  const [favWorks, setFavWorks] = useState('');
  const [works, setWorks] = useState<Work[]>([]);
  const [worksOpen, setWorksOpen] = useState(false);
  const [followSheetOpen, setFollowSheetOpen] = useState(false);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [editingField, setEditingField] = useState<EditableField | null>(null);
  const confirm = useConfirm();
  const [leadDays, setLeadDays] = useState(loadNotifyLeadDays());
  const [gcalLinked, setGcalLinked] = useState(isGoogleLinked());
  const [acctSheet, setAcctSheet] = useState<null | 'link' | 'signin'>(null);
  const { settings, updateSettings } = useTheme();

  const acctState = accountState(user);
  const acctEmail = accountEmail(user);

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
    getProfileExtras(user.id).then((x) => { if (!alive) return; setBio(x.bio ?? ''); setOshi(x.oshi ?? ''); setFavWorks(x.favWorks ?? ''); }).catch(() => {});
    return () => { alive = false; };
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // インライン編集の保存（フィールドごとに対応するAPIへ）
  const onSaveField = async () => {
    if (!user || !editingField) return;
    haptic.select();
    const field = editingField;
    setEditingField(null);
    try {
      if (field === 'name') { await saveDisplayName(user.id, name.trim()); toast('表示名を保存しました'); }
      else if (field === 'pref') { await saveHomePrefecture(user.id, homePref || null); toast('ホーム県を保存しました'); }
      else { await saveProfileExtras(user.id, { bio, oshi, favWorks }); toast('プロフィールを保存しました'); }
    } catch { toast('保存に失敗しました'); }
  };

  const radar = stats ? calcRadarData(stats) : [];
  const title = stats ? calcTitle(stats) : '';
  const grade = stats ? calcGrade(stats) : 0;

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
    <div className="px-4 pt-4 pb-4" style={{ paddingTop: 'calc(var(--sat) + 16px)' }}>
      {/* プロフィール（各項目はその場で編集: アバター=タップ / 一言=吹き出し / 名前・チップ=タップ） */}
      <div className="flex items-center gap-3">
        <button onClick={() => { haptic.select(); setAvatarOpen((v) => !v); setEditingField(null); }} aria-label="アバターを変更"
          className="pressable relative w-16 h-16 rounded-full flex items-center justify-center text-[32px] flex-shrink-0"
          style={{ backgroundColor: 'var(--fill-tertiary)' }}>
          {avatar ?? '🐝'}
          <span className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full flex items-center justify-center"
            style={{ backgroundColor: 'var(--accent-color)', color: 'var(--accent-on)' }}>
            <Pencil size={11} />
          </span>
          {/* 一言コメントの吹き出し */}
          <span onClick={(e) => { e.stopPropagation(); haptic.select(); setAvatarOpen(false); setEditingField('bio'); }}
            role="button" aria-label="一言コメントを編集"
            className="pressable absolute -top-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center border"
            style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-subtle)', color: 'var(--accent-text)' }}>
            <MessageCircle size={13} />
          </span>
        </button>
        <div className="min-w-0 flex-1">
          <button onClick={() => { haptic.select(); setEditingField('name'); }} className="pressable flex items-center gap-1.5 max-w-full">
            <span className="text-[17px] font-bold truncate">{name || '名無しのファン'}</span>
            <Pencil size={12} className="text-label-tertiary flex-shrink-0" />
          </button>
          <div className="mt-1 flex items-center gap-2">
            {title && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[13px] font-bold"
                style={{ background: 'linear-gradient(135deg, var(--accent-color), color-mix(in srgb, var(--accent-color) 55%, #ff8a00))', color: 'var(--accent-on)', boxShadow: '0 1px 6px color-mix(in srgb, var(--accent-color) 45%, transparent)' }}>
                <Crown size={13} strokeWidth={2.5} /> {title}
              </span>
            )}
            {stats && <span className="text-[12px] text-label-tertiary">Gr.{grade}</span>}
          </div>
          {bio && (
            <button onClick={() => { haptic.select(); setEditingField('bio'); }} className="pressable mt-1 max-w-full text-left">
              <span className="text-[12px] text-label-secondary line-clamp-1">💬 {bio}</span>
            </button>
          )}
        </div>
      </div>
      {/* 推し・好きな作品・ホーム県（タップで編集。未設定はゴーストチップ） */}
      <div className="mt-2 flex flex-wrap gap-1.5">
        <button onClick={() => { haptic.select(); setEditingField('oshi'); }}
          className="pressable px-2.5 py-1 rounded-full text-[11px]"
          style={oshi
            ? { backgroundColor: 'color-mix(in srgb, var(--accent-color) 16%, transparent)', color: 'var(--accent-text)' }
            : { border: '1px dashed var(--border-default)', color: 'var(--label-tertiary)' }}>
          推し: {oshi || '未設定'}
        </button>
        <button onClick={() => { haptic.select(); setEditingField('fav'); }}
          className="pressable px-2.5 py-1 rounded-full text-[11px]"
          style={favWorks
            ? { backgroundColor: 'var(--fill-tertiary)', color: 'var(--label-secondary)' }
            : { border: '1px dashed var(--border-default)', color: 'var(--label-tertiary)' }}>
          好きな作品: {favWorks || '未設定'}
        </button>
        <button onClick={() => { haptic.select(); setEditingField('pref'); }}
          className="pressable px-2.5 py-1 rounded-full text-[11px] inline-flex items-center gap-0.5"
          style={homePref
            ? { backgroundColor: 'var(--fill-tertiary)', color: 'var(--label-secondary)' }
            : { border: '1px dashed var(--border-default)', color: 'var(--label-tertiary)' }}>
          <MapPin size={11} /> {homePref || 'ホーム県'}
        </button>
      </div>

      {/* インライン編集パネル */}
      {editingField && (
        <div className="mt-3 rounded-[12px] border border-subtle p-3" style={{ backgroundColor: 'var(--bg-secondary)' }}>
          <div className="text-[12px] text-label-secondary mb-1.5">{FIELD_META[editingField].label}</div>
          {editingField === 'pref' ? (
            <select value={homePref} onChange={(e) => setHomePref(e.target.value)} autoFocus
              className="w-full rounded-[10px] px-3 py-2.5 text-[14px] outline-none"
              style={{ backgroundColor: 'var(--fill-tertiary)', color: 'var(--input-text)' }}>
              <option value="">未設定</option>
              {ALL_PREFS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          ) : (
            <input
              value={editingField === 'name' ? name : editingField === 'bio' ? bio : editingField === 'oshi' ? oshi : favWorks}
              onChange={(e) => {
                const v = e.target.value;
                if (editingField === 'name') setName(v);
                else if (editingField === 'bio') setBio(v);
                else if (editingField === 'oshi') setOshi(v);
                else setFavWorks(v);
              }}
              maxLength={FIELD_META[editingField].max} placeholder={FIELD_META[editingField].placeholder} autoFocus
              className="w-full rounded-[10px] px-3 py-2.5 text-[14px] outline-none"
              style={{ backgroundColor: 'var(--fill-tertiary)', color: 'var(--input-text)' }} />
          )}
          <div className="flex gap-2 mt-2.5">
            <button onClick={() => { haptic.select(); setEditingField(null); }}
              className="pressable flex-1 py-2 rounded-[10px] text-[13px]"
              style={{ backgroundColor: 'var(--fill-tertiary)', color: 'var(--label-primary)' }}>キャンセル</button>
            <button onClick={onSaveField}
              className="pressable flex-1 py-2 rounded-[10px] text-[13px] font-semibold"
              style={{ backgroundColor: 'var(--accent-color)', color: 'var(--accent-on)' }}>保存</button>
          </div>
        </div>
      )}

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

      {/* ファンスター（星形チャート: 実績が育つと星が大きくなる） */}
      <div className="mt-4 rounded-[14px] border border-subtle px-2 py-1.5 mx-auto" style={{ backgroundColor: 'var(--bg-secondary)', maxWidth: 240 }}>
        <div className="text-[11px] text-label-secondary px-1">ファンスター</div>
        {radar.length > 0
          ? <FanStarChart data={radar} size={190} />
          : <div className="h-[150px]" />}
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
        {/* アクセントカラー */}
        <div className="flex items-center gap-2 px-3 py-2.5">
          <Droplet size={16} className="text-label-secondary" />
          <span className="text-[14px] flex-1">アクセントカラー</span>
          <div className="flex items-center gap-1.5">
            {MYPAGE_ACCENTS.map((c) => (
              <button key={c} onClick={() => { haptic.select(); updateSettings({ accentColor: c }); }}
                aria-label={`アクセントカラー ${c}`}
                className="pressable w-6 h-6 rounded-full flex items-center justify-center"
                style={{ backgroundColor: c, boxShadow: settings.accentColor === c ? '0 0 0 2px var(--bg-primary), 0 0 0 4px var(--label-primary)' : 'none' }}>
                {settings.accentColor === c && <Check size={13} style={{ color: getContrastText(c) }} strokeWidth={3} />}
              </button>
            ))}
          </div>
        </div>
        {/* カレンダーの配色・テーマ */}
        <button onClick={() => { haptic.select(); navigate('/customize'); }} className="w-full flex items-center gap-2 px-3 py-2.5 pressable text-left">
          <Palette size={16} className="text-label-secondary" />
          <span className="text-[14px] flex-1">カレンダーの配色・テーマ</span>
          <ChevronRight size={16} className="text-label-tertiary" />
        </button>
        {/* アカウント（デバイス間のデータ引き継ぎ） */}
        {acctState === 'email' ? (
          <div className="flex items-center gap-2 px-3 py-2.5">
            <UserRound size={16} className="text-label-secondary" />
            <div className="flex-1 min-w-0">
              <div className="text-[14px]">アカウント</div>
              <div className="text-[11px] text-label-tertiary truncate">{acctEmail} で引き継ぎ済み</div>
            </div>
            <Check size={16} style={{ color: 'var(--color-success)' }} />
          </div>
        ) : (
          <div className="px-3 py-2.5">
            <div className="flex items-center gap-2">
              <UserRound size={16} className="text-label-secondary" />
              <span className="text-[14px] flex-1">アカウント（データ引き継ぎ）</span>
              <button onClick={() => { haptic.select(); setAcctSheet('link'); }}
                className="pressable text-[12px] font-semibold px-3 py-1 rounded-full"
                style={{ backgroundColor: 'var(--accent-color)', color: 'var(--accent-on)' }}>
                メールで登録
              </button>
            </div>
            <button onClick={() => { haptic.select(); setAcctSheet('signin'); }}
              className="pressable text-[11px] text-label-tertiary mt-1.5 ml-6">
              別の端末で登録済み → ログイン
            </button>
          </div>
        )}
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
      <div className="w-full flex items-center justify-between mt-5 mb-1">
        <button onClick={() => setWorksOpen((v) => !v)} className="pressable flex-1 flex items-center justify-between">
          <span className="text-[12px] text-label-secondary">フォロー作品（{works.length}）</span>
          <ChevronRight size={16} className="text-label-tertiary" style={{ transform: worksOpen ? 'rotate(90deg)' : 'none' }} />
        </button>
        <button onClick={() => { haptic.select(); setFollowSheetOpen(true); }}
          className="pressable ml-3 flex items-center gap-0.5 text-[12px] font-medium flex-shrink-0" style={{ color: 'var(--accent-text)' }}>
          <Plus size={14} /> 追加
        </button>
      </div>
      {worksOpen && (
        works.length === 0 ? (
          <p className="text-[13px] text-label-tertiary">フォロー中の作品はありません。「＋追加」から作品を探せます</p>
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

      <WorkFollowSheet open={followSheetOpen} onClose={() => setFollowSheetOpen(false)}
        onChanged={() => { if (user) listAllParticipatedWorks(user.id).then(setWorks).catch(() => {}); }} />

      {acctSheet && (
        <AccountSheet mode={acctSheet} onClose={() => setAcctSheet(null)}
          onDone={(email) => {
            setAcctSheet(null);
            toast(acctSheet === 'link' ? `${email} で引き継ぎを設定しました` : 'ログインしました');
            // セッションが更新される（onAuthStateChange）ので、少し待ってから再読込
            setTimeout(() => window.location.reload(), 600);
          }} />
      )}

      {/* ビルド刻印（キャッシュ判別用）。タップで隠しハプティクス診断（バイブしない端末の切り分け用） */}
      <p className="mt-8 text-center text-[10px] text-label-tertiary" onClick={() => hapticsDebug(toast)}>build {__BUILD_TIME__}</p>
    </div>
  );
}

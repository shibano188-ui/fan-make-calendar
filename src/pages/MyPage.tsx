import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Bell, BellRing, Crown, CalendarSync, Moon, Palette, Pencil, Plus, Droplet, Check, MessageCircle, MapPin, UserRound, Star, Trash2 } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { getContrastText } from '../lib/color';

// アクセント色の選択肢（先頭=デフォルトの黄色）
const MYPAGE_ACCENTS = ['#FBBF00', '#D85A30', '#1D9E75', '#378ADD', '#D4537E'] as const;
import {
  getUserPublicProfile, getHomePrefecture, saveHomePrefecture, saveDisplayName, saveAvatarEmoji,
  listAllParticipatedWorks, leaveCalendar, listSavedEvents, getProfileExtras, saveProfileExtras,
  getOrCreateIcsToken, regenerateIcsToken, icsSubscribeUrl, icsWebcalUrl, listNotices, listBlockedUsers, type Work,
} from '../lib/api';
import { useHiddenContent } from '../hooks/useHiddenContent';
import { unseenNotices } from '../lib/notices';
import { useFeature, usePremium } from '../lib/premium';
import { useConfirm } from '../components/ui/ConfirmDialog';
import WorkFollowSheet from '../components/WorkFollowSheet';
import DeviceCalendarSheet from '../components/DeviceCalendarSheet';
import Toggle from '../components/ui/Toggle';
import AccountSheet from '../components/AccountSheet';
import { accountState, accountEmail, signOutAccount, deleteAccount } from '../lib/account';
import FanStarChart from '../components/FanStarChart';
import { calcTitle, calcRadarData, calcGrade, type AchievementStats } from '../lib/achievements';
import { REGIONS } from '../lib/prefectures';
import { clearAccountScopedCache, FEATURE_GOOGLE_CALENDAR, FEATURE_PREMIUM } from '../lib/constants';
import { isGoogleConfigured, isGoogleLinked, linkGoogle, unlinkGoogle } from '../lib/googleCalendar';
import {
  deviceCalendarSupported, isDeviceCalendarOn, enableDeviceCalendar, disableDeviceCalendar,
  listDeviceCalendars, getTargetCalendarId, setTargetCalendarId, syncDeviceCalendar,
} from '../lib/deviceCalendar';
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
  const { unblock } = useHiddenContent(user?.id);
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
  const [blockedUsers, setBlockedUsers] = useState<{ userId: string; displayName: string | null }[]>([]);
  const [blocksOpen, setBlocksOpen] = useState(false);
  const [followSheetOpen, setFollowSheetOpen] = useState(false);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [editingField, setEditingField] = useState<EditableField | null>(null);
  const confirm = useConfirm();
  const [gcalLinked, setGcalLinked] = useState(isGoogleLinked());
  const [acctSheet, setAcctSheet] = useState<null | 'link' | 'signin'>(null);
  // お知らせの未読数（バッジ）。中身はサーバー、既読の位置だけ端末に持つ
  const [unreadNotices, setUnreadNotices] = useState(0);
  // カレンダー自動同期（プレミアム）。URLは開いたときに初めて作る（使わない人の行を作らない）
  const calendarSync = useFeature('calendarAutoSync');
  const premium = usePremium();
  // Androidには webcal: を受けるアプリが無い（タップしても何も起きない）ので出さない
  const isAndroid = Capacitor.getPlatform() === 'android' || /Android/i.test(navigator.userAgent);
  const [icsOpen, setIcsOpen] = useState(false);
  const [icsUrl, setIcsUrl] = useState<string | null>(null);
  const [icsWebcal, setIcsWebcal] = useState<string | null>(null);
  const onToggleIcs = async () => {
    haptic.select();
    const next = !icsOpen;
    setIcsOpen(next);
    if (next && !icsUrl && user) {
      const t = await getOrCreateIcsToken(user.id);
      setIcsUrl(t ? icsSubscribeUrl(t) : null);
      setIcsWebcal(t ? icsWebcalUrl(t) : null);
      if (!t) toast('URLを作れませんでした', 'error');
    }
  };
  // 端末カレンダーへの直接書き込み（プレミアム・アプリ版のみ）。ics購読より早く反映される。
  // 書き込み先は端末に既にあるカレンダーから選ぶ（Googleを選べばPCでも見える）。
  const [devCalOn, setDevCalOn] = useState(isDeviceCalendarOn());
  const [devCalId, setDevCalId] = useState<string | null>(getTargetCalendarId());
  const [devCalName, setDevCalName] = useState<string | null>(null);
  const [devCalSheet, setDevCalSheet] = useState(false);
  const syncDevCal = () => { if (user) listSavedEvents(user.id).then(syncDeviceCalendar).catch(() => {}); };
  const onToggleDevCal = async () => {
    haptic.select();
    if (devCalOn) {
      await disableDeviceCalendar();
      setDevCalOn(false);
      toast('端末のカレンダーから FanHive の予定を消しました');
      return;
    }
    // ONにしただけでは書き込まない。**先に書き込み先を選んで「決定」を押してもらう**
    // （既定のカレンダーに黙って入れると、意図しない場所に予定が増える）
    setDevCalSheet(true);
  };
  const onDecideDevCal = async (id: string) => {
    setDevCalSheet(false);
    const changing = devCalOn && devCalId !== null && devCalId !== id;
    // 書き込み先を変えるときは、前のカレンダーに入れた分を消してから入れ直す
    if (changing) await disableDeviceCalendar();
    setTargetCalendarId(id);
    setDevCalId(id);
    const ok = await enableDeviceCalendar();
    if (!ok) { toast('カレンダーへのアクセスが許可されていません。端末の設定から許可してください'); return; }
    setDevCalOn(true);
    syncDevCal();
    toast(changing ? '書き込み先を変えました' : '端末のカレンダーに書き込みます');
  };
  // 選んだカレンダーの名前だけ表示する（一覧はシートの中に閉じ込める）
  useEffect(() => {
    if (!devCalOn || !devCalId || !deviceCalendarSupported()) { setDevCalName(null); return; }
    listDeviceCalendars()
      .then((cs) => setDevCalName(cs.find((c) => c.id === devCalId)?.title ?? null))
      .catch(() => {});
  }, [devCalOn, devCalId]);

  const onCopyIcs = async () => {
    if (!icsUrl) return;
    haptic.select();
    try { await navigator.clipboard.writeText(icsUrl); toast('URLをコピーしました'); }
    catch { toast('コピーできませんでした。長押しで選択してください'); }
  };
  const onRegenIcs = async () => {
    if (!user) return;
    haptic.select();
    const ok = await confirm({ title: 'URLを作り直しますか？', message: '今のURLで購読しているカレンダーは更新されなくなります', confirmLabel: '作り直す', destructive: true });
    if (!ok) return;
    const t = await regenerateIcsToken(user.id);
    if (t) { setIcsUrl(icsSubscribeUrl(t)); setIcsWebcal(icsWebcalUrl(t)); toast('新しいURLを作りました'); }
    else toast('作り直せませんでした', 'error');
  };
  const [signOutConfirm, setSignOutConfirm] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  // アカウント削除。5.1.1(v)で「アカウント設定の中の見つけやすい場所」に置くことが要る。
  const [delConfirm, setDelConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const onDeleteAccount = async () => {
    setDeleting(true);
    const r = await deleteAccount();  // 成功したら '/' に飛ぶので戻ってこない
    if (!r.ok) { setDeleting(false); setDelConfirm(false); toast(r.error, 'error'); }
  };
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
    listNotices(user.id).then((ns) => setUnreadNotices(unseenNotices(ns).length)).catch(() => {});
  }, [user?.id]);

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
    listBlockedUsers(user.id).then((bs) => alive && setBlockedUsers(bs)).catch(() => {});
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

  const onUnblock = async (b: { userId: string; displayName: string | null }) => {
    const label = b.displayName ?? '匿名';
    haptic.select();
    const ok = await confirm({ title: `${label}さんのブロックを解除しますか？`, message: 'この人の投稿がまた表示されるようになります', confirmLabel: '解除する' });
    if (!ok) return;
    setBlockedUsers((prev) => prev.filter((x) => x.userId !== b.userId));
    await unblock(b.userId).catch(() => {});
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

      {/* プレミアムの入口。設定リストの中に埋めると「設定項目のひとつ」にしか見えず、
          一番下だと見つけられない。無料の人には何が良くなるかを添えたカードとして出し、
          既に会員の人には主張しない1行に落とす。 */}
      {FEATURE_PREMIUM && (
        premium ? (
          <button onClick={() => { haptic.select(); navigate('/premium'); }}
            className="pressable w-full flex items-center gap-2 mt-5 px-3 py-2.5 rounded-[12px] border border-subtle text-left"
            style={{ backgroundColor: 'var(--bg-secondary)' }}>
            <Crown size={16} style={{ color: 'var(--accent-color)' }} />
            <span className="text-[14px] flex-1">プレミアム</span>
            <span className="text-[11px] text-label-tertiary">利用中</span>
            <ChevronRight size={16} className="text-label-tertiary" />
          </button>
        ) : (
          <button onClick={() => { haptic.select(); navigate('/premium'); }}
            className="pressable w-full mt-5 px-3.5 py-3 rounded-[12px] text-left"
            style={{ border: '1.5px solid var(--accent-color)' }}>
            <div className="flex items-center gap-2">
              <Crown size={16} style={{ color: 'var(--accent-color)' }} />
              <span className="text-[14px] font-semibold flex-1">プレミアム</span>
              {/* 金額は見出しの右に置く。説明文に混ぜると読み流されるうえ、行が伸びて折り返しが崩れる */}
              <span className="text-[12px] font-semibold" style={{ color: 'var(--accent-text)' }}>月¥500</span>
              <ChevronRight size={16} className="text-label-tertiary" />
            </div>
            {/* 日本語は単語の区切りが無いので、CSSは文字数で機械的に折り返す＝句の途中で切れる。
                2文に分けて <br> で確実に切り、各行の中は inline-block で句のまとまりを守る。 */}
            <p className="text-[11px] text-label-secondary mt-1 ml-6 leading-relaxed">
              <span className="inline-block">受付開始と値下げはその場で、</span>
              <span className="inline-block">新着は毎朝まとめて。</span>
              <br />
              <span className="inline-block">広告なし・</span>
              <span className="inline-block">カレンダー自動同期・</span>
              <span className="inline-block">フォロー無制限。</span>
            </p>
          </button>
        )
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
        {/* フォロー中の作品（フォロー解除・作品ごとの通知はここから） */}
        <button onClick={() => { haptic.select(); navigate('/follows'); }} className="w-full flex items-center gap-2 px-3 py-2.5 pressable text-left">
          <Star size={16} className="text-label-secondary" />
          <span className="text-[14px] flex-1">フォロー中の作品</span>
          <span className="text-[13px] text-label-tertiary">{works.length}作品</span>
          <ChevronRight size={16} className="text-label-tertiary" />
        </button>
        {/* カレンダーの配色・テーマ */}
        <button onClick={() => { haptic.select(); navigate('/customize'); }} className="w-full flex items-center gap-2 px-3 py-2.5 pressable text-left">
          <Palette size={16} className="text-label-secondary" />
          <span className="text-[14px] flex-1">カレンダーの配色・テーマ</span>
          <ChevronRight size={16} className="text-label-tertiary" />
        </button>
        {/* アカウント（デバイス間のデータ引き継ぎ） */}
        {acctState === 'email' ? (
          <div className="px-3 py-2.5">
            <div className="flex items-center gap-2">
              <UserRound size={16} className="text-label-secondary" />
              <div className="flex-1 min-w-0">
                <div className="text-[14px]">アカウント</div>
                <div className="text-[11px] text-label-tertiary truncate">{acctEmail} で引き継ぎ済み</div>
              </div>
              <Check size={16} style={{ color: 'var(--color-success)' }} />
            </div>
            {!signOutConfirm ? (
              <button onClick={() => { haptic.select(); setSignOutConfirm(true); }}
                className="pressable text-[11px] text-label-tertiary mt-1.5 ml-6">
                この端末からログアウト
              </button>
            ) : (
              <div className="mt-2 ml-6 flex flex-col gap-1.5">
                <p className="text-[11px] text-label-secondary">
                  投稿・いいね・保存した予定はクラウドに残ります。同じメールでログインすれば元に戻ります。この端末の設定（重要マーク・通知ベル・配色）はそのままです。
                </p>
                <div className="flex gap-2">
                  <button onClick={async () => { haptic.select(); setSigningOut(true); const r = await signOutAccount(); if (!r.ok) { setSigningOut(false); setSignOutConfirm(false); toast(r.error, 'error'); } }}
                    disabled={signingOut}
                    className="pressable text-[12px] font-semibold px-3 py-1 rounded-full disabled:opacity-40"
                    style={{ backgroundColor: 'var(--color-destructive)', color: '#ffffff' }}>
                    {signingOut ? 'ログアウト中…' : 'ログアウトする'}
                  </button>
                  <button onClick={() => setSignOutConfirm(false)} className="pressable text-[12px] text-label-secondary px-2">
                    キャンセル
                  </button>
                </div>
              </div>
            )}
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
              別の端末でログイン済みの場合は<span className="underline" style={{ color: 'var(--accent-text)' }}>こちら</span>
            </button>
          </div>
        )}
        {/* 届いたお知らせの履歴。端末の通知欄は消えると戻せないので、見返す場所をここに置く */}
        <button onClick={() => { haptic.select(); navigate('/notices'); }}
          className="pressable w-full flex items-center gap-2 px-3 py-2.5 text-left">
          <BellRing size={16} className="text-label-secondary" />
          <span className="text-[14px] flex-1">お知らせ</span>
          {unreadNotices > 0 && (
            <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-full"
              style={{ backgroundColor: 'var(--accent-color)', color: 'var(--accent-on)' }}>
              {unreadNotices}
            </span>
          )}
          <ChevronRight size={16} className="text-label-tertiary" />
        </button>
        {/* 通知の設定（許可の状態・リマインダー・まとめ・値下げ）は1ページにまとめてある。
            「通知が来ない」ときに見る場所が分かれていると直せないため。 */}
        <button onClick={() => { haptic.select(); navigate('/notifications'); }}
          className="pressable w-full flex items-center gap-2 px-3 py-2.5 text-left">
          <Bell size={16} className="text-label-secondary" />
          <span className="text-[14px] flex-1">通知の設定</span>
          <ChevronRight size={16} className="text-label-tertiary" />
        </button>
        {/* 端末のカレンダーへ直接書き込む（プレミアム・アプリ版のみ）。
            ics購読はカレンダー側が取りに来るまで反映されない（Googleは8〜24時間）ので、
            アプリが動いた時点で書けるこちらを上位の手段として置く。Webには出さない。 */}
        {calendarSync && deviceCalendarSupported() && (
          <div className="px-3 py-2.5">
            <div className="flex items-center gap-2">
              <CalendarSync size={16} className="text-label-secondary" />
              <span className="text-[14px] flex-1">端末のカレンダーに書き込む</span>
              <Toggle checked={devCalOn} onChange={onToggleDevCal} />
            </div>
            <p className="text-[11px] text-label-secondary mt-1 ml-6">
              いいねした予定と自分の投稿が、選んだカレンダーに入ります（締切は別の予定として入ります）。
            </p>
            {devCalOn && (
              <button onClick={() => { haptic.select(); setDevCalSheet(true); }}
                className="pressable mt-2 ml-6 flex items-center gap-2 w-[calc(100%-1.5rem)] text-left">
                <span className="text-[11px] text-label-tertiary">書き込み先</span>
                <span className="text-[13px] flex-1 truncate">{devCalName ?? '—'}</span>
                <ChevronRight size={16} className="text-label-tertiary" />
              </button>
            )}
          </div>
        )}
        {/* カレンダー自動同期（プレミアム）: 購読URLをGoogle/Appleに登録してもらう方式。
            無料の人には出さない（購入導線ができるまで案内UIは出さない方針）。
            PC専用の人・アプリを入れていない人はこちらしか使えないので残す。 */}
        {calendarSync && (
          <div className="px-3 py-2.5">
            <button onClick={onToggleIcs} className="pressable w-full flex items-center gap-2 text-left">
              <CalendarSync size={16} className="text-label-secondary" />
              <span className="text-[14px] flex-1">カレンダー自動同期</span>
              <ChevronRight size={16} className="text-label-tertiary" style={{ transform: icsOpen ? 'rotate(90deg)' : undefined }} />
            </button>
            {icsOpen && (
              <div className="mt-2 ml-6 flex flex-col gap-2">
                <p className="text-[11px] text-label-secondary">
                  いいねした予定と自分の投稿が、カレンダーに自動で入ります（締切は別の予定として入ります）。登録は1回だけ。
                  Googleカレンダーは「他のカレンダーを追加 → URLで追加」に下のURLを貼ってください（スマホアプリからは登録できません）。
                </p>
                {icsWebcal && !isAndroid && (
                  <a href={icsWebcal} onClick={() => haptic.select()}
                    className="pressable inline-flex items-center justify-center gap-1 px-3 py-2 rounded-[10px] text-[12px] font-semibold"
                    style={{ backgroundColor: 'var(--accent-color)', color: 'var(--accent-on)' }}>
                    iPhone・Macで追加（タップで購読）
                  </a>
                )}
                <div className="flex gap-2">
                  <input readOnly value={icsUrl ?? '準備中…'} onFocus={(e) => e.currentTarget.select()}
                    className="flex-1 min-w-0 rounded-[10px] px-3 py-2 text-[11px] outline-none"
                    style={{ backgroundColor: 'var(--fill-tertiary)', color: 'var(--input-text)' }} />
                  <button onClick={onCopyIcs} disabled={!icsUrl}
                    className="pressable px-3 rounded-[10px] text-[12px] font-semibold flex-shrink-0"
                    style={{ backgroundColor: 'var(--accent-color)', color: 'var(--accent-on)' }}>コピー</button>
                </div>
                <p className="text-[11px] text-label-tertiary">
                  反映はカレンダー側が取りに来たときです（Appleは更新間隔を5分〜1日から選べます。Googleは8〜24時間おき）。
                </p>
                <button onClick={onRegenIcs} className="pressable text-[11px] text-label-tertiary text-left">
                  URLを作り直す（今のURLは使えなくなります）
                </button>
              </div>
            )}
          </div>
        )}
        {/* Googleカレンダー連携。フラグが立つまで**何も出さない**。
            「外部カレンダー連携（近日）」を出していたが、そのすぐ上にある
            「端末のカレンダーに書き込む」「カレンダー自動同期」で既に連携できるので矛盾する。
            再開するときは FEATURE_GOOGLE_CALENDAR を true にすれば元の行が戻る。 */}
        {FEATURE_GOOGLE_CALENDAR && isGoogleConfigured() ? (
          <div className="flex items-center gap-2 px-3 py-2.5">
            <CalendarSync size={16} className="text-label-secondary" />
            <span className="text-[14px] flex-1">Googleカレンダー連携</span>
            <button onClick={onLinkGoogle} className="pressable text-[12px] font-semibold px-3 py-1 rounded-full"
              style={gcalLinked ? { backgroundColor: 'var(--fill-tertiary)', color: 'var(--label-secondary)' } : { backgroundColor: 'var(--accent-color)', color: 'var(--accent-on)' }}>
              {gcalLinked ? '連携済み（解除）' : '連携する'}
            </button>
          </div>
        ) : null}
        {/* アカウント削除。設定リストの最終行に置く（Appleの5.1.1(v)は「見つけやすい場所」を求める）。
            誤爆しないよう2段階にする。処理は lib/account.ts に1つだけ置いてある。 */}
        {!delConfirm ? (
          <button onClick={() => { haptic.select(); setDelConfirm(true); }}
            className="pressable w-full flex items-center gap-2 px-3 py-2.5 text-left">
            <Trash2 size={16} style={{ color: 'var(--color-destructive)' }} />
            <span className="text-[14px] flex-1" style={{ color: 'var(--color-destructive)' }}>アカウントを削除する</span>
          </button>
        ) : (
          <div className="px-3 py-2.5">
            <div className="flex items-center gap-2">
              <Trash2 size={16} style={{ color: 'var(--color-destructive)' }} />
              <span className="text-[14px] flex-1" style={{ color: 'var(--color-destructive)' }}>アカウントを削除する</span>
            </div>
            <p className="text-[11px] text-label-secondary mt-1.5 ml-6">
              投稿・いいね・保存した予定を含むすべてのデータが削除されます。この操作は取り消せません。
            </p>
            <div className="mt-2 ml-6 flex gap-2">
              <button onClick={onDeleteAccount} disabled={deleting}
                className="pressable text-[12px] font-semibold px-3 py-1 rounded-full disabled:opacity-40"
                style={{ backgroundColor: 'var(--color-destructive)', color: '#ffffff' }}>
                {deleting ? '削除中…' : '本当に削除する'}
              </button>
              <button onClick={() => setDelConfirm(false)} className="pressable text-[12px] text-label-secondary px-2">
                キャンセル
              </button>
            </div>
          </div>
        )}
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

      {/* ブロック中のユーザー（0人のときは出さない。ブロックは投稿者のプロフィールから行う） */}
      {blockedUsers.length > 0 && (
        <>
          <button onClick={() => setBlocksOpen((v) => !v)}
            className="pressable w-full flex items-center justify-between mt-5 mb-1">
            <span className="text-[12px] text-label-secondary">ブロック中（{blockedUsers.length}）</span>
            <ChevronRight size={16} className="text-label-tertiary" style={{ transform: blocksOpen ? 'rotate(90deg)' : 'none' }} />
          </button>
          {blocksOpen && (
            <div className="flex flex-col gap-1.5 max-h-[40vh] overflow-y-auto no-scrollbar">
              {blockedUsers.map((b) => (
                <div key={b.userId} className="flex items-center justify-between gap-2 rounded-[10px] px-3 py-2.5" style={{ backgroundColor: 'var(--fill-tertiary)' }}>
                  <span className="text-[14px] truncate">{b.displayName ?? '匿名'}</span>
                  <button onClick={() => onUnblock(b)} className="pressable text-[12px] text-label-secondary flex-shrink-0">解除</button>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <WorkFollowSheet open={followSheetOpen} onClose={() => setFollowSheetOpen(false)}
        onChanged={() => { if (user) listAllParticipatedWorks(user.id).then(setWorks).catch(() => {}); }} />

      <DeviceCalendarSheet open={devCalSheet} onClose={() => setDevCalSheet(false)} onDecide={onDecideDevCal} />

      {acctSheet && (
        <AccountSheet mode={acctSheet} onClose={() => setAcctSheet(null)}
          onDone={(email) => {
            setAcctSheet(null);
            toast(acctSheet === 'link' ? `${email} で引き継ぎを設定しました` : 'ログインしました');
            // 別アカウントに入る場合のみ、前アカウントのサーバーキャッシュを捨てる。
            // link は同一uidの恒久化なので消さない（端末ローカルのデータもそのまま）。
            if (acctSheet === 'signin') clearAccountScopedCache();
            // セッションが更新される（onAuthStateChange）ので、少し待ってから再読込
            setTimeout(() => window.location.reload(), 600);
          }} />
      )}

      {/* 規約類（審査・ストア要件で外部から辿れる必要がある。static HTMLなので通常のリンク） */}
      <div className="mt-8 flex justify-center gap-4 text-[11px] text-label-tertiary">
        <a href="/terms.html" className="pressable">利用規約</a>
        <a href="/privacy.html" className="pressable">プライバシーポリシー</a>
        <a href="/about.html" className="pressable">運営者情報</a>
      </div>

      {/* ビルド刻印（キャッシュ判別用）。タップで隠しハプティクス診断（バイブしない端末の切り分け用） */}
      <p className="mt-3 text-center text-[10px] text-label-tertiary" onClick={() => hapticsDebug(toast)}>build {__BUILD_TIME__}</p>
    </div>
  );
}

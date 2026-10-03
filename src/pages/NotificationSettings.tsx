import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Bell, BellRing, ChevronRight, TrendingDown } from 'lucide-react';
import { App } from '@capacitor/app';
import { listSavedEvents, listAllParticipatedWorks, type Work } from '../lib/api';
import { getCached, setCached } from '../lib/swrCache';
import { buildWorkColorMap } from '../lib/workColors';
import { loadWorkImages } from '../lib/workImages';
import { loadNotifyLeadDays, saveNotifyLeadDays, loadBellPrefs, saveBellPrefs, type BellPrefs, loadMutedWorkIds, toggleMutedWorkId } from '../lib/constants';
import { ensurePermission, notificationPermission, notificationsSupported, rescheduleAll } from '../lib/notifications';
import { pushSupported, isDigestOn, setDigestOn, getNotifyMode, setNotifyMode, type NotifyMode } from '../lib/push';
import { useFeature, usePremium } from '../lib/premium';
import { FEATURE_PREMIUM } from '../lib/constants';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../components/ui/Toast';
import Toggle from '../components/ui/Toggle';
import { haptic } from '../lib/haptics';

// 通知の設定をまとめたページ。マイページから開く。
//
// バラバラにあると「通知が来ない」ときに見る場所が分からないので1枚にまとめた。
// 一番上は**許可の状態**。ここが断られていると下の設定は全部意味を持たないため、
// 最初に出して、その場で直せるなら直せるようにしている。

const MODE_TOAST: Record<NotifyMode, string> = {
  instant: '新着を30分ごとにまとめてお知らせします',
  thrice: '新着を9時・13時・19時にお知らせします',
  daily: '新着を毎朝9時にお知らせします',
};

export default function NotificationSettings() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const toast = useToast();
  const [perm, setPerm] = useState<'granted' | 'denied' | 'prompt' | 'unsupported' | null>(null);
  const [leadDays, setLeadDays] = useState(loadNotifyLeadDays());
  const [digestOn, setDigestEnabled] = useState(isDigestOn());
  const premium = usePremium();
  const [notifyMode, setNotifyModeState] = useState<NotifyMode>(getNotifyMode());
  const [bell, setBell] = useState<BellPrefs>(loadBellPrefs());
  // 作品ごとの通知（値下げ・再入荷と新着のまとめ）。フォロー中の作品を並べて、ここで切り替える
  const [works, setWorks] = useState<Work[]>(() => (user ? getCached<Work[]>(`follows:${user.id}`) ?? [] : []));
  const [mutedWorks, setMutedWorks] = useState<Set<string>>(() => loadMutedWorkIds());
  const workColors = buildWorkColorMap(works);
  const workImages = loadWorkImages();
  useEffect(() => {
    if (!user) return;
    listAllParticipatedWorks(user.id).then((ws) => { setWorks(ws); setCached(`follows:${user.id}`, ws); }).catch(() => {});
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const onToggleWork = (w: Work) => {
    haptic.select();
    const next = toggleMutedWorkId(w.id);
    setMutedWorks(next);
    toast(next.has(w.id) ? `「${w.name}」の通知を止めました` : `「${w.name}」の通知を受け取ります`);
  };
  const priceAlerts = useFeature('priceAlerts');
  const instantAlerts = useFeature('instantAlerts');

  const refreshPerm = useCallback(() => { notificationPermission().then(setPerm).catch(() => {}); }, []);

  // 端末の設定でONにして戻ってきたら、その場で表示に反映する
  useEffect(() => {
    refreshPerm();
    let handle: { remove: () => void } | undefined;
    App.addListener('resume', refreshPerm).then((h) => { handle = h; }).catch(() => {});
    return () => { handle?.remove(); };
  }, [refreshPerm]);

  const askPermission = async () => {
    haptic.select();
    const ok = await ensurePermission();
    refreshPerm();
    if (ok) {
      toast('通知を受け取ります');
      if (user) listSavedEvents(user.id).then(rescheduleAll).catch(() => {});
    }
  };

  const onChangeLead = (d: number) => {
    setLeadDays(d);
    saveNotifyLeadDays(d);
    if (user) listSavedEvents(user.id).then(rescheduleAll).catch(() => {});
  };

  const onToggleDigest = async (next: boolean) => {
    haptic.select();
    setDigestEnabled(next);
    if (user) await setDigestOn(user.id, next);
    toast(next ? '毎朝9時にまとめてお知らせします' : '新着のまとめ通知を止めました');
  };

  const onChangeMode = async (next: NotifyMode) => {
    haptic.select();
    const prev = notifyMode;
    setNotifyModeState(next);
    const ok = user ? await setNotifyMode(user.id, next) : false;
    if (!ok) { setNotifyModeState(prev); toast('変更できませんでした。時間をおいてお試しください', 'error'); return; }
    toast(MODE_TOAST[next]);
  };

  const onToggleBell = (key: keyof BellPrefs, next: boolean) => {
    haptic.select();
    const p = { ...bell, [key]: next };
    setBell(p);
    saveBellPrefs(p);
  };

  const row = 'px-3 py-2.5 border-b border-subtle';

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <div className="mx-auto w-full max-w-app flex-1 flex flex-col">
        <div className="sticky top-0 z-20 flex items-center gap-1 px-2 py-2 material-bar scroll-edge" style={{ paddingTop: 'calc(var(--sat) + 8px)' }}>
          <button onClick={() => { haptic.select(); navigate(-1); }} aria-label="戻る" className="pressable tap-44 p-2"><ArrowLeft size={22} /></button>
          <span className="text-[16px] font-bold flex-1">通知</span>
        </div>

        <div className="px-3 pt-2 pb-8">
          {/* 許可の状態。ここが断られていると下の設定は全部効かない */}
          {perm !== null && perm !== 'unsupported' && perm !== 'granted' && (
            <div className="rounded-[12px] p-3 mb-3" style={{ backgroundColor: 'var(--fill-tertiary)' }}>
              <p className="text-[14px] font-semibold mb-1">通知が許可されていません</p>
              {perm === 'prompt' ? (
                <>
                  <p className="text-[12px] text-label-secondary mb-2.5">
                    許可すると、発売日や締切の前にお知らせできます。
                  </p>
                  <button onClick={askPermission}
                    className="pressable text-[13px] font-semibold px-4 py-2 rounded-full"
                    style={{ backgroundColor: 'var(--accent-color)', color: 'var(--accent-on)' }}>
                    通知を許可する
                  </button>
                </>
              ) : (
                <p className="text-[12px] text-label-secondary">
                  一度断ると、アプリからは聞き直せません。端末の「設定」→「アプリ」→「FanHive」→「通知」からONにしてください。
                  ONにしてこの画面に戻ると、表示が切り替わります。
                </p>
              )}
            </div>
          )}
          {perm === 'unsupported' && (
            <div className="rounded-[12px] p-3 mb-3" style={{ backgroundColor: 'var(--fill-tertiary)' }}>
              <p className="text-[12px] text-label-secondary">
                ブラウザ版では通知を出せません。アプリ版をお使いください。
              </p>
            </div>
          )}

          {/* 無料プランだと、この画面から3つの項目が丸ごと消えている。
              何も言わずに消すと「機能が無い」と読まれるので、ここで違いを出して案内へ送る。
              通知を見に来ている＝取りこぼしを気にしている人なので、一番刺さる位置 */}
          {!instantAlerts && (
            <button onClick={() => { haptic.select(); navigate('/premium'); }}
              className="pressable w-full text-left rounded-[12px] p-3 mb-3"
              style={{ border: '1.5px solid var(--accent-color)' }}>
              <p className="text-[14px] font-semibold">受付開始をその場で受け取る</p>
              <p className="text-[11px] text-label-secondary mt-1 leading-relaxed">
                無料プランのお知らせは翌朝のまとめです。プレミアムなら、受付が始まった時点と、
                値下げ・再入荷があった時点でお知らせします。
              </p>
            </button>
          )}


          {/* 予定のベルを押したときに何をONにするか。ベルは1回押すだけにしたので、細かい選択はここで */}
          <p className="text-[12px] text-label-secondary px-1 mb-1.5">予定のベルを押したときにONにするもの</p>
          <div className="rounded-[12px] overflow-hidden mb-4" style={{ backgroundColor: 'var(--bg-secondary)' }}>
            <div className={row}>
              <div className="flex items-center gap-2">
                <Bell size={16} className="text-label-secondary" />
                <span className="text-[14px] flex-1">受付開始・締切・発売の前</span>
                <Toggle checked={bell.reminder} onChange={(v) => onToggleBell('reminder', v)} />
              </div>
            </div>
            <div className="px-3 py-2.5">
              <div className="flex items-center gap-2">
                <TrendingDown size={16} className="text-label-secondary" />
                <span className="text-[14px] flex-1">値下げ・再入荷（グッズ）</span>
                {priceAlerts
                  ? <Toggle checked={bell.price} onChange={(v) => onToggleBell('price', v)} />
                  : <button onClick={() => { haptic.select(); navigate('/premium'); }}
                      className="pressable text-[10px] font-bold px-1.5 py-0.5 rounded"
                      style={{ color: 'var(--accent-on)', backgroundColor: 'var(--accent-color)' }}>プレミアム</button>}
              </div>
            </div>
          </div>

          <div className="rounded-[12px] overflow-hidden" style={{ backgroundColor: 'var(--bg-secondary)' }}>
            {/* 予定のリマインダー（端末で組む・無料） */}
            <div className={row}>
              <div className="flex items-center gap-2">
                <Bell size={16} className="text-label-secondary" />
                <span className="text-[14px] flex-1">受付開始・締切・発売の前に</span>
                <select value={leadDays} onChange={(e) => onChangeLead(Number(e.target.value))}
                  className="bg-transparent text-[14px] outline-none" style={{ color: 'var(--input-text)' }}>
                  {[0, 1, 2, 3, 5, 7].map((d) => <option key={d} value={d}>{d === 0 ? '当日のみ' : `${d}日前`}</option>)}
                </select>
              </div>
              <p className="text-[11px] text-label-secondary mt-1 ml-6">
                ベルをONにした予定が対象です。{leadDays > 0 ? '当日の朝にもお知らせします。' : '当日の朝にだけお知らせします。'}
              </p>
            </div>

            {/* フォロー作品の新着まとめ（既定ON）。2026-10-04 から無料の人にも毎朝9時に送る。
                課金の人は届き方を選べる（すぐ／1日3回／1日1回） */}
            {pushSupported() && (
              <div className={row}>
                <div className="flex items-center gap-2">
                  <BellRing size={16} className="text-label-secondary" />
                  <span className="text-[14px] flex-1">フォロー作品の新着</span>
                  <Toggle checked={digestOn} onChange={onToggleDigest} />
                </div>
                {digestOn && premium && (
                  <div className="flex items-center gap-2 mt-2 ml-6">
                    <span className="text-[13px] text-label-secondary flex-1">届き方</span>
                    <select value={notifyMode} onChange={(e) => void onChangeMode(e.target.value as NotifyMode)}
                      className="bg-transparent text-[14px] outline-none" style={{ color: 'var(--input-text)' }}>
                      <option value="instant">すぐ（30分ごとにまとめて）</option>
                      <option value="thrice">1日3回（9時・13時・19時）</option>
                      <option value="daily">1日1回（9時）</option>
                    </select>
                  </div>
                )}
                <p className="text-[11px] text-label-secondary mt-1 ml-6">
                  {premium
                    ? 'フォロー中の作品に追加された予定をお知らせします。押すとホームのストーリーが開きます。'
                    : 'フォロー中の作品に追加された予定を、毎朝9時に1通でお知らせします。押すとホームのストーリーが開きます。'}
                  {!premium && FEATURE_PREMIUM && ' プレミアムなら「すぐ」「1日3回」も選べます。'}
                </p>
              </div>
            )}

            {/* 値下げ・再入荷（プレミアム・既定ONのオプトアウト） */}
            {priceAlerts && (
              <button onClick={() => { haptic.select(); navigate('/price-drops'); }} className={`pressable w-full text-left ${row}`}>
                <div className="flex items-center gap-2">
                  <TrendingDown size={16} className="text-label-secondary" />
                  <span className="text-[14px] flex-1">値下げ・再入荷</span>
                  <ChevronRight size={16} className="text-label-tertiary" />
                </div>
                <p className="text-[11px] text-label-secondary mt-1 ml-6">
                  いいねしたグッズが安くなったとき、在庫が戻ったときにお知らせします。
                  ベルをONにしたグッズが対象です。止めたいものは、そのグッズのベルをもう一度押します。
                </p>
              </button>
            )}

            {/* 受付開始の即時通知（プレミアム・設定項目は無い＝説明だけ） */}
            {instantAlerts && (
              <div className={row}>
                <div className="flex items-center gap-2">
                  <BellRing size={16} className="text-label-secondary" />
                  <span className="text-[14px] flex-1">受付開始のお知らせ</span>
                </div>
                <p className="text-[11px] text-label-secondary mt-1 ml-6">
                  いいねしたグッズの予約受付が始まったら、その時点でお知らせします。
                </p>
              </div>
            )}

          </div>

          {/* 作品ごとに止める。フォロー中の作品ページから飛ばずに、ここで切り替える */}
          {works.length > 0 && (
            <>
              <p className="text-[12px] text-label-secondary px-1 mt-4 mb-0.5">作品ごとに通知を止める</p>
              <p className="text-[11px] text-label-tertiary px-1 mb-1.5">OFFにすると、その作品の値下げ・再入荷と新着のまとめを止めます</p>
              <div className="rounded-[12px] overflow-hidden" style={{ backgroundColor: 'var(--bg-secondary)' }}>
                {works.map((w, i) => (
                  <div key={w.id} className={`flex items-center gap-2 px-3 py-2.5 ${i < works.length - 1 ? 'border-b border-subtle' : ''}`}>
                    {workImages[w.id]
                      ? <img src={workImages[w.id]} alt="" className="w-5 h-5 rounded-[5px] object-cover flex-shrink-0" />
                      : <span className="w-5 h-5 rounded-[5px] flex-shrink-0" style={{ backgroundColor: workColors.get(w.id) ?? 'var(--accent-color)' }} />}
                    <span className="text-[14px] flex-1 truncate">{w.name}</span>
                    <Toggle checked={!mutedWorks.has(w.id)} onChange={() => onToggleWork(w)} />
                  </div>
                ))}
              </div>
            </>
          )}

          {!notificationsSupported() && (
            <p className="text-[11px] text-label-tertiary mt-3 px-1">
              予定のリマインダーはアプリ版のみで動きます。
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

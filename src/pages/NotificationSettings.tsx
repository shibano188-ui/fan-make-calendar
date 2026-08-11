import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Bell, BellRing, ChevronRight, TrendingDown } from 'lucide-react';
import { App } from '@capacitor/app';
import { listSavedEvents } from '../lib/api';
import { loadNotifyLeadDays, saveNotifyLeadDays } from '../lib/constants';
import { ensurePermission, notificationPermission, notificationsSupported, rescheduleAll } from '../lib/notifications';
import { pushSupported, isDigestOn, setDigestOn } from '../lib/push';
import { useFeature } from '../lib/premium';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../components/ui/Toast';
import Toggle from '../components/ui/Toggle';
import { haptic } from '../lib/haptics';

// 通知の設定をまとめたページ。マイページから開く。
//
// バラバラにあると「通知が来ない」ときに見る場所が分からないので1枚にまとめた。
// 一番上は**許可の状態**。ここが断られていると下の設定は全部意味を持たないため、
// 最初に出して、その場で直せるなら直せるようにしている。

export default function NotificationSettings() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const toast = useToast();
  const [perm, setPerm] = useState<'granted' | 'denied' | 'prompt' | 'unsupported' | null>(null);
  const [leadDays, setLeadDays] = useState(loadNotifyLeadDays());
  const [digestOn, setDigestEnabled] = useState(isDigestOn());
  const newEventDigest = useFeature('newEventDigest');
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

          {/* 届いたお知らせの見返し先。設定ページに来る人は「来ない・見逃した」が動機なので上に置く */}
          <button onClick={() => { haptic.select(); navigate('/notices'); }}
            className="pressable w-full text-left rounded-[12px] p-3 mb-3 flex items-center gap-2"
            style={{ backgroundColor: 'var(--bg-secondary)' }}>
            <BellRing size={16} className="text-label-secondary" />
            <span className="text-[14px] flex-1">これまでのお知らせを見る</span>
            <ChevronRight size={16} className="text-label-tertiary" />
          </button>

          <div className="rounded-[12px] overflow-hidden" style={{ backgroundColor: 'var(--bg-secondary)' }}>
            {/* 予定のリマインダー（端末で組む・無料） */}
            <div className={row}>
              <div className="flex items-center gap-2">
                <Bell size={16} className="text-label-secondary" />
                <span className="text-[14px] flex-1">受付開始・締切・発売の前に</span>
                <select value={leadDays} onChange={(e) => onChangeLead(Number(e.target.value))}
                  className="bg-transparent text-[14px] outline-none" style={{ color: 'var(--input-text)' }}>
                  {[1, 2, 3, 5, 7].map((d) => <option key={d} value={d}>{d}日前</option>)}
                </select>
              </div>
              <p className="text-[11px] text-label-secondary mt-1 ml-6">
                いいねした予定のうち、ベルをONにしたものが対象です。当日の朝にもお知らせします。
              </p>
            </div>

            {/* フォロー作品の新着まとめ（プレミアム・既定ON） */}
            {newEventDigest && pushSupported() && (
              <div className={row}>
                <div className="flex items-center gap-2">
                  <BellRing size={16} className="text-label-secondary" />
                  <span className="text-[14px] flex-1">フォロー作品の新着まとめ</span>
                  <Toggle checked={digestOn} onChange={onToggleDigest} />
                </div>
                <p className="text-[11px] text-label-secondary mt-1 ml-6">
                  フォロー中の作品に追加された予定を、毎朝9時に1通でお知らせします。
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
                  うるさいものは各グッズのベルから止められます。
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

            {/* 作品ごとの通知の止め方 */}
            <button onClick={() => { haptic.select(); navigate('/follows'); }} className="pressable w-full text-left px-3 py-2.5">
              <div className="flex items-center gap-2">
                <ArrowRight size={16} className="text-label-secondary" />
                <span className="text-[14px] flex-1">作品ごとに通知を止める</span>
                <ChevronRight size={16} className="text-label-tertiary" />
              </div>
              <p className="text-[11px] text-label-secondary mt-1 ml-6">
                フォロー中のページのベルから、作品まるごと止められます。
              </p>
            </button>
          </div>

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

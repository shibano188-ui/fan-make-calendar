import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, BellRing, BellOff, ChevronRight } from 'lucide-react';
import type { CalendarEvent } from '../../types';
import { isNotifyOn, setNotifyOn, loadNotifyLeadDays, loadMutedEventIds, toggleMutedEventId } from '../../lib/constants';
import { ensurePermission, scheduleForEvent, cancelForEvent, notificationsSupported } from '../../lib/notifications';
import Sheet from '../ui/Sheet';
import Toggle from '../ui/Toggle';
import { useToast } from '../ui/Toast';
import { haptic } from '../../lib/haptics';
import { useFeature } from '../../lib/premium';

/** 予定ごとの通知ベル。いいね済み(liked)の時だけ表示し、押すと通知の内訳シートを開く。
 *  この予定について届くものはここに全部集める（値下げのミュートが値下げ一覧にしか無かったのを解消）:
 *   - 発売日・締切のリマインダー: オプトイン（既定OFF）。ローカル通知をスケジュールする
 *   - 値下げ・再入荷アラート: **プレミアム限定**。オプトアウト（既定ON・いいね済みは自動で対象）で、
 *     止めたものだけ muted に入る。無料の人は配信側（api/_alerts.ts）で弾かれて一生届かないので、
 *     トグルではなく購入画面への案内を出す（ONにできるのに届かないのが一番きつい）
 *  既定値が逆なので1つのトグルには畳めない。アイコンだけは「この予定が静かか」を映す。
 *  いいねを外す(liked=false)と発売日リマインダーは自動でOFF＋スケジュール解除する。 */
export default function NotifyBell({ event, liked, size = 18, variant = 'icon' }: { event: CalendarEvent; liked: boolean; size?: number; variant?: 'icon' | 'labeled' }) {
  const toast = useToast();
  const navigate = useNavigate();
  const priceAlerts = useFeature('priceAlerts');
  const [on, setOn] = useState(false);
  const [priceOn, setPriceOn] = useState(true);
  const [open, setOpen] = useState(false);

  // いいね状態に同期。未いいねならOFF＋解除、いいね済みなら保存値を反映。
  useEffect(() => {
    if (!liked) {
      if (isNotifyOn(event.id)) { setNotifyOn(event.id, false); cancelForEvent(event.id); }
      setOn(false);
    } else {
      setOn(isNotifyOn(event.id));
    }
    setPriceOn(!loadMutedEventIds().has(event.id));
  }, [liked, event.id]);

  // いいね済みのときだけ表示。Web版でも見せる（ON状態は保存されるが、通知の配信はアプリ版のみ）
  if (!liked) return null;

  // 値下げ・再入荷は毎日Cronが type='goods' の行だけ見るので、グッズ以外には出さない
  const isGoods = event.type === 'goods';

  const toggleReminder = async (next: boolean) => {
    haptic.light();
    const supported = notificationsSupported();
    if (next && supported) {
      const ok = await ensurePermission();
      if (!ok) { toast('通知が許可されていません。端末の設定から許可してください'); return; }
    }
    setOn(next);
    setNotifyOn(event.id, next);
    if (next) {
      if (supported) { await scheduleForEvent(event); toast(`${loadNotifyLeadDays()}日前と当日の朝にお知らせします`); }
      else { toast('設定を保存しました。通知の配信はアプリ版のみです'); }
    } else { await cancelForEvent(event.id); }
  };

  const togglePrice = (next: boolean) => {
    haptic.light();
    setPriceOn(next);
    toggleMutedEventId(event.id); // 値下げ一覧の「このグッズは通知しない」と同じ保存先
  };

  // 発売日リマインダーがON＝鳴っている。両方OFF＝この予定は静か。既定のままなら普通のベル。
  const Icon = on
    ? <BellRing size={variant === 'labeled' ? 22 : size} style={{ color: 'var(--accent-color)' }} />
    : (isGoods && priceAlerts && !priceOn)
      ? <BellOff size={variant === 'labeled' ? 22 : size} className="text-label-tertiary" />
      : <Bell size={variant === 'labeled' ? 22 : size} className="text-label-secondary" />;

  const openSheet = (e: React.MouseEvent) => { e.stopPropagation(); haptic.select(); setOpen(true); };

  return (
    <>
      {variant === 'labeled' ? (
        <button onClick={openSheet} aria-label="通知の設定" className="pressable flex flex-col items-center gap-0.5">
          {Icon}
          <span className="text-[10px] text-label-tertiary leading-none">{on ? '通知ON' : '通知'}</span>
        </button>
      ) : (
        <button onClick={openSheet} aria-label="通知の設定" className="pressable tap-44 flex items-center">
          {Icon}
        </button>
      )}
      {/* Reactのイベントはポータルの外（カード本体のonClick）まで伝播するので、ここで止める。
          止めないとシート内の操作がカードのタップ＝詳細ページへの遷移になる。 */}
      {open && (
        <div onClick={(e) => e.stopPropagation()}>
        <Sheet onClose={() => setOpen(false)} title="通知" ariaLabel="この予定の通知設定">
          <div className="px-4 pb-2">
            <div className="text-[12px] text-label-tertiary mb-3 line-clamp-2">{event.title}</div>

            <div className="flex items-center gap-3 py-2.5">
              <div className="flex-1 min-w-0">
                <div className="text-[15px] font-semibold">発売日・締切の前に</div>
                <div className="text-[11px] text-label-secondary mt-0.5">
                  {loadNotifyLeadDays()}日前と当日の朝にお知らせします（何日前かはマイページで変更できます）
                </div>
              </div>
              <Toggle checked={on} onChange={toggleReminder} />
            </div>

            {isGoods && (priceAlerts ? (
              <div className="flex items-center gap-3 py-2.5 border-t border-subtle">
                <div className="flex-1 min-w-0">
                  <div className="text-[15px] font-semibold">値下げ・再入荷</div>
                  <div className="text-[11px] text-label-secondary mt-0.5">
                    買える最安値が下がったとき・売り切れが戻ったときにお知らせします
                  </div>
                </div>
                <Toggle checked={priceOn} onChange={togglePrice} />
              </div>
            ) : (
              <button onClick={() => { haptic.select(); setOpen(false); navigate('/premium'); }}
                className="pressable w-full text-left flex items-center gap-3 py-2.5 border-t border-subtle">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[15px] font-semibold">値下げ・再入荷</span>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                      style={{ color: 'var(--accent-on)', backgroundColor: 'var(--accent-color)' }}>プレミアム</span>
                  </div>
                  <div className="text-[11px] text-label-secondary mt-0.5">
                    買える最安値が下がったとき・売り切れが戻ったときにお知らせします
                  </div>
                </div>
                <ChevronRight size={16} className="text-label-tertiary flex-shrink-0" />
              </button>
            ))}
          </div>
        </Sheet>
        </div>
      )}
    </>
  );
}

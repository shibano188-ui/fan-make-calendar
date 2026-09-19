import { useEffect, useState } from 'react';
import { Bell, BellRing } from 'lucide-react';
import type { CalendarEvent } from '../../types';
import { isNotifyOn, setNotifyOn, loadNotifyLeadDays, loadMutedEventIds, toggleMutedEventId, loadBellPrefs, takePriceHint } from '../../lib/constants';
import { ensurePermission, scheduleForEvent, cancelForEvent, notificationsSupported } from '../../lib/notifications';
import { useToast } from '../ui/Toast';
import { haptic } from '../../lib/haptics';
import { useFeature } from '../../lib/premium';

/** 予定ごとの通知ベル。押すたびに ON／OFF が切り替わる（前はシートを開いてトグルを押す2段階だった）。
 *  ON にするもの（通知の設定ページで選べる・既定はどちらも）:
 *   - 発売日・締切のリマインダー（ローカル通知をスケジュールする）
 *   - 値下げ・再入荷アラート（**プレミアム限定**・グッズのみ。配信側 api/_alerts.ts は「いいね済みかつミュートでない」を送る）
 *  保存していない予定でも押せて、押したら保存（いいね）も同時にする。保存を外すとリマインダーも止める。 */
export default function NotifyBell({ event, liked, onSave, size = 18, variant = 'icon' }: {
  event: CalendarEvent; liked: boolean; onSave?: () => unknown; size?: number; variant?: 'icon' | 'labeled';
}) {
  const toast = useToast();
  const priceAlerts = useFeature('priceAlerts');
  const isGoods = event.type === 'goods';
  const [reminder, setReminder] = useState(false);
  const [priceMuted, setPriceMuted] = useState(false);

  // 保存状態に同期。保存を外したらリマインダーも止める
  useEffect(() => {
    if (!liked && isNotifyOn(event.id)) { setNotifyOn(event.id, false); cancelForEvent(event.id); }
    setReminder(liked && isNotifyOn(event.id));
    setPriceMuted(loadMutedEventIds().has(event.id));
  }, [liked, event.id]);

  // 値下げ・再入荷が実際に届く状態か（プレミアム・グッズ・保存済み・ミュートしていない）
  const priceOn = priceAlerts && isGoods && liked && !priceMuted;
  const on = reminder || priceOn;

  const turnOn = async () => {
    const prefs = loadBellPrefs();
    if (!liked) await onSave?.();
    let msg = '';
    if (prefs.reminder) {
      const supported = notificationsSupported();
      if (supported && !(await ensurePermission())) {
        toast('通知が許可されていません。端末の設定から許可してください', 'error');
        return;
      }
      setNotifyOn(event.id, true);
      setReminder(true);
      if (supported) { await scheduleForEvent(event); msg = `${loadNotifyLeadDays()}日前と当日の朝にお知らせします`; }
      else msg = '保存しました。通知の配信はアプリ版のみです';
    }
    if (isGoods && priceAlerts && prefs.price) {
      if (priceMuted) { toggleMutedEventId(event.id); setPriceMuted(false); }
      msg = msg ? `${msg}。値下げ・再入荷も` : '値下げ・再入荷をお知らせします';
    }
    if (!msg) { toast('通知の設定で、ベルでONにするものを選んでください'); return; }
    if (isGoods && !priceAlerts && takePriceHint()) msg += '（値下げ・再入荷の通知はプレミアムで受け取れます）';
    toast(msg);
  };

  const turnOff = async () => {
    if (reminder) { setNotifyOn(event.id, false); setReminder(false); await cancelForEvent(event.id); }
    if (priceOn) { toggleMutedEventId(event.id); setPriceMuted(true); }
    toast('この予定の通知を止めました');
  };

  const onTap = (e: React.MouseEvent) => {
    e.stopPropagation();
    haptic.light();
    void (on ? turnOff() : turnOn());
  };

  const iconSize = variant === 'labeled' ? 22 : size;
  const Icon = on
    ? <BellRing size={iconSize} style={{ color: 'var(--accent-color)' }} />
    : <Bell size={iconSize} className="text-label-secondary" />;

  return variant === 'labeled' ? (
    <button onClick={onTap} aria-label="通知" aria-pressed={on} className="pressable flex flex-col items-center gap-0.5">
      {Icon}
      <span className="text-[10px] text-label-tertiary leading-none">{on ? '通知ON' : '通知'}</span>
    </button>
  ) : (
    <button onClick={onTap} aria-label="通知" aria-pressed={on} className="pressable tap-44 flex items-center">
      {Icon}
    </button>
  );
}

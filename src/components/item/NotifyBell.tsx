import { useEffect, useState } from 'react';
import { Bell, BellRing } from 'lucide-react';
import type { CalendarEvent } from '../../types';
import { isNotifyOn, setNotifyOn, loadNotifyLeadDays } from '../../lib/constants';
import { ensurePermission, scheduleForEvent, cancelForEvent, notificationsSupported } from '../../lib/notifications';
import { useToast } from '../ui/Toast';
import { haptic } from '../../lib/haptics';

/** 予定ごとの通知ベル。いいね済み(liked)の時だけ表示し、ONでローカル通知をスケジュール。
 *  いいねを外す(liked=false)と自動でOFF＋スケジュール解除する。状態はeventIdごとにlocalStorage保持。
 *  variant='labeled' は詳細ページのアクション行用（アイコン＋ラベル縦並び）。 */
export default function NotifyBell({ event, liked, size = 18, variant = 'icon' }: { event: CalendarEvent; liked: boolean; size?: number; variant?: 'icon' | 'labeled' }) {
  const toast = useToast();
  const [on, setOn] = useState(false);

  // いいね状態に同期。未いいねならOFF＋解除、いいね済みなら保存値を反映。
  useEffect(() => {
    if (!liked) {
      if (isNotifyOn(event.id)) { setNotifyOn(event.id, false); cancelForEvent(event.id); }
      setOn(false);
    } else {
      setOn(isNotifyOn(event.id));
    }
  }, [liked, event.id]);

  // いいね済みのときだけ表示。Web版でも見せる（ON状態は保存されるが、通知の配信はアプリ版のみ）
  if (!liked) return null;

  const toggle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    haptic.light();
    const next = !on;
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

  const Icon = on
    ? <BellRing size={variant === 'labeled' ? 22 : size} style={{ color: 'var(--accent-color)' }} />
    : <Bell size={variant === 'labeled' ? 22 : size} className="text-label-secondary" />;

  if (variant === 'labeled') {
    return (
      <button onClick={toggle} aria-label={on ? '通知をオフ' : '通知をオン'} className="pressable flex flex-col items-center gap-0.5">
        {Icon}
        <span className="text-[10px] text-label-tertiary leading-none">{on ? '通知ON' : '通知'}</span>
      </button>
    );
  }
  return (
    <button onClick={toggle} aria-label={on ? '通知をオフ' : '通知をオン'} className="pressable tap-44 flex items-center">
      {Icon}
    </button>
  );
}

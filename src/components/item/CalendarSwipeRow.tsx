import type { ReactNode } from 'react';
import { Bell, BellOff } from 'lucide-react';
import type { CalendarEvent } from '../../types';
import SwipeRow from '../ui/SwipeRow';
import { useEventNotify } from './NotifyBell';
import { useTourStep } from '../OnboardingTour';

/** カレンダーの予定の横スワイプ（ボード・リスト・日付のパネルで共通・2026-11-07 柴野）。
 *  左へ払う＝カレンダーから外す、右へ払う＝この予定の通知を ON／OFF（ベルと同じ） */
export const NOTIFY_SIDE_COLOR = '#3a62d8';

export default function CalendarSwipeRow({ event, onRemove, radius, disabled, children }: {
  event: CalendarEvent; onRemove: (e: CalendarEvent) => void; radius?: number; disabled?: boolean; children: ReactNode;
}) {
  const { on, toggle } = useEventNotify(event, true);
  // 案内の途中（右へ払って通知をONにする段階など）は、左へ払って外せないようにする
  const touring = !!useTourStep();
  return (
    <SwipeRow label="外す" radius={radius} disabled={disabled || event.personal} onSwipe={touring ? undefined : () => onRemove(event)}
      right={{ label: on ? <><BellOff size={15} />通知OFF</> : <><Bell size={15} />通知ON</>, color: NOTIFY_SIDE_COLOR, onSwipe: toggle }}>
      {children}
    </SwipeRow>
  );
}

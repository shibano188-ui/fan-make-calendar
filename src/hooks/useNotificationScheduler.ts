import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { App } from '@capacitor/app';
import { LocalNotifications } from '@capacitor/local-notifications';
import { useAuth } from '../contexts/AuthContext';
import { listSavedEvents } from '../lib/api';
import { rescheduleAll, notificationsSupported } from '../lib/notifications';

/** ローカル通知の運用フック（ネイティブのみ）。
 *  - 起動時・アプリ復帰時に、いいね済み×ベルON×未来の予定を組み直す
 *  - 通知タップで該当予定の詳細へ遷移 */
export function useNotificationScheduler() {
  const { user } = useAuth();
  const navigate = useNavigate();

  // 通知タップ → 詳細へ
  useEffect(() => {
    if (!notificationsSupported()) return;
    let handle: { remove: () => void } | undefined;
    LocalNotifications.addListener('localNotificationActionPerformed', (e) => {
      const id = e.notification.extra?.eventId as string | undefined;
      if (id) navigate(`/item/${id}`);
    }).then((h) => { handle = h; });
    return () => { handle?.remove(); };
  }, [navigate]);

  // 起動 + 復帰で再スケジュール
  useEffect(() => {
    if (!user || !notificationsSupported()) return;
    const run = () => { listSavedEvents(user.id).then(rescheduleAll).catch(() => {}); };
    run();
    let handle: { remove: () => void } | undefined;
    App.addListener('resume', run).then((h) => { handle = h; });
    return () => { handle?.remove(); };
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps
}

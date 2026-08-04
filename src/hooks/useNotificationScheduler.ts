import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { App } from '@capacitor/app';
import { LocalNotifications } from '@capacitor/local-notifications';
import { useAuth } from '../contexts/AuthContext';
import { listSavedEvents } from '../lib/api';
import { rescheduleAll, notificationsSupported } from '../lib/notifications';
import { syncDeviceCalendar } from '../lib/deviceCalendar';
import { registerPush, onPushOpened } from '../lib/push';

/** ローカル通知の運用フック（ネイティブのみ）。
 *  - 起動時・アプリ復帰時に、いいね済み×ベルON×未来の予定を組み直す
 *  - 同じ保存内容で端末カレンダーへの書き込みも揃える（設定がONのときだけ動く）
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

  // プッシュの宛先を登録（サーバー起点の通知＝値下げ・再入荷・受付開始の検知）。
  // ローカル通知とは独立に動く（片方が使えなくても、もう片方は生きる）。
  useEffect(() => {
    if (!user) return;
    void registerPush(user.id);
    void onPushOpened((path) => navigate(path));
  }, [user?.id, navigate]); // eslint-disable-line react-hooks/exhaustive-deps

  // 起動 + 復帰で再スケジュール
  useEffect(() => {
    if (!user || !notificationsSupported()) return;
    // 保存内容は1回だけ取って、通知の組み直しと端末カレンダーの同期の両方に使う
    const run = () => {
      listSavedEvents(user.id)
        .then(async (events) => { await rescheduleAll(events); await syncDeviceCalendar(events); })
        .catch(() => {});
    };
    run();
    let handle: { remove: () => void } | undefined;
    App.addListener('resume', run).then((h) => { handle = h; });
    return () => { handle?.remove(); };
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps
}

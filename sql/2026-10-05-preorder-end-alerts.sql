-- 予約締切の即時通知（プレミアム）のために、通知の種類に 'preorder_end' を足す。
-- 送るのは api/notify-preorder-starts（5分おき）。締切の1時間前（時刻なしは当日18時）に1回だけ。
--
-- 足すだけ（既存の行・種類は変えない）。コードより先に流すこと。
-- 先に流さないと、二重送信よけ（event_alerts_sent）とお知らせ履歴（notifications）が CHECK で弾かれ、
-- 締切の通知が出ないだけで済む（受付開始など既存の通知は影響を受けない）。

alter table public.event_alerts_sent drop constraint if exists event_alerts_sent_kind_check;
alter table public.event_alerts_sent add constraint event_alerts_sent_kind_check
  check (kind in ('preorder_start', 'preorder_end'));

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('price_drop', 'restock', 'preorder_start', 'preorder_end', 'new_events', 'nushi'));

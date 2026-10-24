-- お知らせ（notifications）に「運営から」（support）を足す。
-- 問い合わせ（feedbacks）をくれた人に、直したことを個別に知らせるため。プッシュの許可が無い人にも、
-- アプリのお知らせ欄（マイページの未読の数字）で届く。行き先（path）が https:// なら外のページを開く。
-- 足すだけなので、今ある行には影響しない。

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('price_drop', 'restock', 'preorder_start', 'preorder_end', 'new_events', 'nushi', 'support'));

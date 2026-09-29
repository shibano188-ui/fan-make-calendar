-- 自分用の予定を、みんなの予定と同じ投稿フォームで作れるようにする（2026-09-30 柴野）。
-- フォームにある項目（種別・曖昧日付・終わりの時刻・値段・予約・会場）を持てるよう列を足すだけ。
-- ⚠ 本番に流した（柴野・2026-09-30）。
-- 既存の列・ポリシーには触らない。personal_events は 2026-09-29-post-flow.sql で作ったもの。
alter table public.personal_events
  add column if not exists type                text not null default 'event' check (type in ('event', 'goods')),
  add column if not exists date_label          text,
  add column if not exists end_time            time,
  add column if not exists price               integer check (price is null or price >= 0),
  add column if not exists prefecture          text,
  add column if not exists location_detail     text,
  add column if not exists is_order_made       boolean not null default false,
  add column if not exists preorder_start_date date,
  add column if not exists preorder_end_date   date,
  add column if not exists preorder_start_time time,
  add column if not exists preorder_end_time   time;

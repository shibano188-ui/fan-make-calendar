-- 新着の通知の届き方を、作品ごとに選べるようにする（柴野の判断・2026-10-05）。足すだけ。
-- 仕様 → Obsidian: Decisions/2026-10-05-ranking-contrib-score.md（同日の追記）
--   課金の人: 作品ごとに「すぐ／1日3回／1日1回／通知しない」。選んでいない作品は全体の設定（new_events_notify）
--             「通知しない」は今までの作品ごとのミュート（muted_work_ids）で表す（値下げ・再入荷も止まる。今と同じ）
--   無料の人: 今までどおり作品ごとのトグル（ミュート）だけ
--
-- 「どこまで知らせたか」を 人 × 届き方 ごとにする。1つの時刻だと、「すぐ」の作品で進めた分だけ
-- 「1日1回」の作品の新着が抜け落ちるため。new_event_notify_cursor はまだ使われていない
-- （新しい api/notify-new-events は PR #14 で、本番に出ていない）ので、主キーを作り替えても困らない。
--
-- ⚠️ 通知の配信に関わるので、PR #14 と一緒に見てもらってから流す。PR #14 をマージする前に流してよい（今の本番の関数は見ない列だけ）。

begin;

-- 作品ごとの届き方 { "<work_id>": "instant" | "thrice" | "daily" }
alter table public.user_app_state add column if not exists new_events_notify_works jsonb;

-- どこまで知らせたか: 人 × 届き方
alter table public.new_event_notify_cursor add column if not exists mode text not null default 'daily';
alter table public.new_event_notify_cursor drop constraint if exists new_event_notify_cursor_mode_check;
alter table public.new_event_notify_cursor add constraint new_event_notify_cursor_mode_check check (mode in ('instant', 'thrice', 'daily'));
alter table public.new_event_notify_cursor drop constraint if exists new_event_notify_cursor_pkey;
alter table public.new_event_notify_cursor add primary key (user_id, mode);

commit;

-- 確認用:
--   select column_name from information_schema.columns where table_name = 'new_event_notify_cursor';  -- user_id, notified_until, mode
--   select conname from pg_constraint where conrelid = 'public.new_event_notify_cursor'::regclass;      -- pkey は (user_id, mode)

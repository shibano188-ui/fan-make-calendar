-- 2026-11-07 カレンダーのボードまわりで、アカウントに紐づける端末の設定を2つ足す。
-- 既存の列と同じ扱い（足すだけ・null＝一度も同期していない）。流すまではアプリが列なしでも動く（appState.ts の PENDING_COLS）

-- 探すで「興味なし」として左へ払って隠した予定。["<event_id>", ...]（隠した順・新しいほうから2000件まで）
alter table public.user_app_state
  add column if not exists dismissed_event_ids jsonb;

-- 日付未定の予定を、自分で「だいたいこの日」と仮に置いた日。{ "<event_id>": "YYYY-MM-DD" }
alter table public.user_app_state
  add column if not exists tentative_dates jsonb;

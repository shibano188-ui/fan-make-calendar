-- 探すで「興味なし」として左へ払って隠した予定を、アカウントに紐づける（2026-11-07）。
-- 中身は ["<event_id>", ...]（隠した順・新しいほうから2000件まで）。
-- 既存の列と同じ扱い（足すだけ・null＝一度も同期していない）。流すまではアプリが列なしでも動く（appState.ts の PENDING_COLS）
alter table public.user_app_state
  add column if not exists dismissed_event_ids jsonb;

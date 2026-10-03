-- ホームのストーリー（2026-10-04 柴野）。足すだけ。
-- 仕様 → Obsidian: Decisions/2026-10-04-fanhive-home-story-premium.md
--
-- seen_event_ids … 見た予定の id（今は端末の localStorage `fan_seen_event_ids` だけ）。
--                  iPhone と iPad で未読を揃えるためにアカウントへ写す。新しい順に最大5000件
-- streak         … 連続記録 { "count": 12, "last": "2026-10-04" }（JST の日付）
-- story_since    … ストーリーの新着を数え始める時刻。初めて開いた日の7日前（以降は「前回見たあとの全部」）
--
-- 列が無い環境でもアプリは動く（src/lib/appState.ts の PENDING_COLS）。流したら PENDING_COLS から外す。

alter table public.user_app_state add column if not exists seen_event_ids jsonb;  -- string[]
alter table public.user_app_state add column if not exists streak jsonb;          -- { count, last }
alter table public.user_app_state add column if not exists story_since jsonb;     -- "2026-09-27T00:00:00.000Z"（ISO 8601 の文字列）

-- 購読カレンダーが「いつ・どこから」取りに来たかを残す（連携できているかをアプリで見せるため）。
--
-- 例: {"google": "2026-10-06T05:02:11Z", "apple": "2026-10-06T04:55:00Z"}
-- api/ics.ts が取りに来た相手を User-Agent で見分けて書く（service_role）。
-- 読むのは本人だけ（既存の ics_tokens_select_own）。列を足すだけなので既存の画面・関数には影響しない。

alter table public.ics_tokens add column if not exists fetched jsonb not null default '{}'::jsonb;

-- 確認用:
--   select left(token, 8) || '…', fetched from public.ics_tokens;

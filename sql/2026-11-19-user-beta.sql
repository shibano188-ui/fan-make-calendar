-- 試している途中の画面を、決めた人にだけ出す（2026-11-19 柴野）。src/lib/beta.ts が読む。
-- 足すだけ。既定は false なので、ほかの人には何も変わらない。
alter table public.user_app_state add column if not exists beta boolean not null default false;

-- 自分を beta にする（SQL Editor で、自分の user_id を入れて流す。user_id はコミットしない）
-- insert into public.user_app_state (user_id, beta) values ('<自分の user_id>', true)
--   on conflict (user_id) do update set beta = true;

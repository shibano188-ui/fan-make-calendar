-- 試している途中の画面を、決めた人にだけ出す（2026-11-19 柴野）。src/lib/beta.ts が読む。
-- 足すだけ。既定は false なので、ほかの人には何も変わらない。
alter table public.user_app_state add column if not exists beta boolean not null default false;

-- 自分を beta にする（SQL Editor で、自分のメールを入れて流す。メールはコミットしない）。
-- user_app_state の行はアプリを開くと作られるので、1回アプリを開いてから流す。「1 row」と出れば済み
-- update public.user_app_state set beta = true
--   where user_id = (select id from auth.users where email = '<自分のメール>');

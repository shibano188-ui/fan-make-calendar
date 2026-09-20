-- 作品ごとのカレンダーの見た目を、端末だけでなくアカウントに紐づける。
-- 中身は { "<work_id>": { accentColor, backgroundImageUrl, bgImageOffsetX/Y,
--   calWeekday, calSaturday, calSunday, calOtherMonth, calGridColor, theme } } の形。
-- 既存の列と同じ扱い（足すだけ・null＝一度も同期していない）。
alter table public.user_app_state
  add column if not exists work_settings jsonb;

-- 作品の並び順（カスタマイズで入れ替えたもの）。["work_id", ...] の配列。
alter table public.user_app_state
  add column if not exists work_order jsonb;

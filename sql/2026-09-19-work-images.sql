-- 作品ごとの画像（カレンダー上部の作品の並びで、名前の左に出す小さな四角）。
-- 利用者が端末で選んだ画像を 96px 四方の JPEG（data URL・1枚数KB）に縮めて持つ。
-- 端末には localStorage `fan_work_images`、アカウントにはこの列。作品カラー（work_colors）と同じ扱い。
-- 列が無い環境でもアプリは動く（src/lib/appState.ts が旧列だけで読み直す）。

alter table public.user_app_state add column if not exists work_images jsonb;  -- Record<workId, dataUrl>

-- 部屋（ゲーム機の中のマイホーム）の状態をアカウントに残す（2026-11-27 柴野「残さないとね」）。足すだけ。
-- 中身: 並び（予定ID→置き場所）・キャラ（A/B）・マイステッカーと貼った位置・コイン・自販機の缶・案内の進み。
-- 読み書きは今の user_app_state と同じ（自分の行だけ。src/lib/appState.ts の room 列）
alter table public.user_app_state add column if not exists room jsonb;

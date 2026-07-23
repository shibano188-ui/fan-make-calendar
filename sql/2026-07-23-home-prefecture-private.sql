-- 居住地(home_prefecture)を公開テーブル user_settings から本人限定の user_private へ移す。
-- 背景: user_settings は公開プロフィール(display_name/avatar/bio等)のため他人もselectでき、
--       同じ行にある居住地まで第三者に見えていた（RLSは行単位で、列単位では隠せない）。
-- 注意: このSQLを実行するまで、デプロイ済みクライアントからは居住地の保存・読み出しができない。

-- 1) 受け皿の列を追加
alter table public.user_private add column if not exists home_prefecture text;

-- 2) 既存の値を移送（user_private に行が無ければ作る）
insert into public.user_private (user_id, home_prefecture)
select s.user_id, s.home_prefecture
  from public.user_settings s
 where s.home_prefecture is not null
on conflict (user_id) do update
  set home_prefecture = excluded.home_prefecture,
      updated_at      = now();

-- 3) 公開テーブルから削除（ここで穴が塞がる）
alter table public.user_settings drop column if exists home_prefecture;

-- 確認用:
--   select count(*) from public.user_private where home_prefecture is not null;
--   select column_name from information_schema.columns
--    where table_name = 'user_settings' and column_name = 'home_prefecture';  -- 0行になればOK

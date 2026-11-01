-- AMNIBUS の巡回で、作品「ジブリ」に誤って入った「ノーゲーム・ノーライフ」の予定を消す（2026-11-01）。
-- キャラ名「ジブリール」が作品名「ジブリ」に当たった。巡回の直しは PR #65。
-- いいねは0件。名前に「ノーゲーム・ノーライフ」を含み、いいねの無い AMNIBUS の予定だけを消す。
-- 7件でなければ自分でエラーにして取り消す。id を直接指定しているので本番専用（開発用では実行しない）。
--
-- 適用：
--   本番……2026-11-01 柴野（SQL Editor）

do $$
declare v_deleted int;
begin
  delete from events
  where id in (
    'a3f306fa-1aad-41e5-8671-f9e94dcda67e', '33ac383a-4779-4aa8-977a-09c1a1aa07d3', '813371ce-9bbb-4646-996b-ac9ab9db354c',
    '67e0adac-0537-4fed-82c2-70297f972336', '7299a4cb-0741-449e-b562-72cf01c354ca', '2fc2e14e-6468-499a-9a38-2048f1e7948f',
    'c83017ce-6b08-4042-9bd1-b0e319117d6f'
  )
  and title like '%ノーゲーム・ノーライフ%'
  and coalesce(like_count, 0) = 0;
  get diagnostics v_deleted = row_count;
  if v_deleted <> 7 then
    raise exception '消す件数が想定と違うので取り消しました（%件）', v_deleted;
  end if;
end $$;

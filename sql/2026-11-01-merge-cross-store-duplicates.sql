-- 別の店の同じ商品が別の予定になっていた8商品をまとめる（2026-11-01 柴野）。
-- 見つけ方: 画面に出る予定（pool=0）のうち、同じ作品で購入リンクが重なるもの・名前と発売日が同じものを出し、JAN と購入リンクを見て仕分けた。
-- 原因: 別の店の同じ商品は値段が同じときだけまとめる。進撃はムービックが箱・アニメイトが1個の値段で、別の予定になった。
-- 残す予定に外す予定の購入リンクを足し、外す予定は pool=1 にする（2026-10-04 の片付けと同じ。行は消さない）。
-- 進撃のムービックのリンクは箱なので isSet を付ける。いいねが付いた行があれば自分でエラーにして取り消す。
-- id を直接指定しているので本番専用（開発用では実行しない）。
--
-- 残す / 外す / 付けるキャラ名:
--   cbfc68de / 5df5647f / -  … 進撃 アルミンがいっぱい
--   533ceb4f / 3c589d17 / -  … 進撃 エレンがいっぱい
--   e4578741 / 6d3212d7 / -  … 進撃 グリッター
--   fdccb00d / d09ecad0 / -  … 進撃 リヴァイがいっぱい
--   7b6b43d0 / 5a70b3bf / -  … 進撃 トレーディングクリアカード
--   ae12065b / 5f30e6bd / -  … ポムポムプリン シートシール
--   57f91ec9 / c151af28 / -  … ちいかわ カレンダー2027
--   96a62a42 / 688e54cd / -  … 呪術 第2期 withCAT
--   96a62a42 / 73acf554 / 宿儺  … 呪術 第2期 withCAT/宿儺
--
-- 適用：
--   本番……2026-11-01 Claude（柴野の許可で supabase db query）

do $$
declare
  v record;
  v_more jsonb;
  v_done int := 0;
begin
  for v in select * from (values
    ('cbfc68de-f0b4-4f83-8df9-b03d59ed0490'::uuid, '5df5647f-c5e9-4b08-9bce-32f2e7cd74db'::uuid, null, true),
    ('533ceb4f-9cb5-4d7e-ae34-1caea569577e'::uuid, '3c589d17-4749-48f2-bc34-d649a1ae7d85'::uuid, null, true),
    ('e4578741-b0a4-46bf-bc51-2a3e60466315'::uuid, '6d3212d7-a53d-4e35-94f8-7f6ef8d3d1fa'::uuid, null, true),
    ('fdccb00d-3691-4eb2-8a94-7b7803cd850a'::uuid, 'd09ecad0-6419-4361-8df8-9c2566b879b0'::uuid, null, true),
    ('7b6b43d0-79e7-4c47-a08a-9cf01336aa42'::uuid, '5a70b3bf-f544-4c24-8834-b0b0d8a972b1'::uuid, null, true),
    ('ae12065b-3e9e-49b9-9c79-496087fe1b54'::uuid, '5f30e6bd-e7e9-45d8-9337-96f3b3c073ff'::uuid, null, false),
    ('57f91ec9-8bd5-445d-aaf7-25ceac035400'::uuid, 'c151af28-1937-42b9-93b8-e848c8c527f2'::uuid, null, false),
    ('96a62a42-7b6a-4a4f-9d86-a6ca9936ccd6'::uuid, '688e54cd-80cd-41db-a98e-fbc21240a996'::uuid, null, false),
    ('96a62a42-7b6a-4a4f-9d86-a6ca9936ccd6'::uuid, '73acf554-1f1d-4e32-9b59-0f1a68ad6c4c'::uuid, '宿儺', false)
  ) as t(keep_id, drop_id, label, is_set) loop
    select coalesce(jsonb_agg(
      o || case when v.label is not null then jsonb_build_object('label', v.label) else '{}'::jsonb end
        || case when v.is_set and o->>'retailer' = 'ムービック' then '{"isSet": true}'::jsonb else '{}'::jsonb end
    ), '[]'::jsonb) into v_more
    from events d, jsonb_array_elements(d.offers) o
    where d.id = v.drop_id
      and not exists (
        select 1 from events k, jsonb_array_elements(k.offers) ko
        where k.id = v.keep_id and ko->>'url' = o->>'url'
      );

    update events set offers = offers || v_more where id = v.keep_id and pool = 0;
    if not found then raise exception '残す予定が見つかりません: %', v.keep_id; end if;

    update events set pool = 1 where id = v.drop_id and pool = 0 and coalesce(like_count, 0) = 0;
    if not found then raise exception '外す予定が想定と違います: %', v.drop_id; end if;
    v_done := v_done + 1;
  end loop;

  if v_done <> 9 then raise exception '件数が想定と違うので取り消しました（%件）', v_done; end if;
end $$;

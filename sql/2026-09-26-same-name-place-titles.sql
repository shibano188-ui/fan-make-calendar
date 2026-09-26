-- 同じ名前で場所が違う予定（巡回POP UP・コラボカフェの各会場）を、タイトルの後ろに都道府県を付けて区別する。
-- 投稿画面（PostNew）にこの処理が無かった間に、同じタイトルのまま投稿されたもの（2026-09-26 時点）。
-- あわせて、同名同日で pool が上がり一覧から消えていた別会場（博多）を表に戻す。
-- ※ 同じ会場の本当の重複（呪術廻戦 PLAZA 千葉ロフト会場 718626ff）は pool 1 のままにしている。

begin;

-- 進撃の巨人 レイヴンブレイドカフェ（東京・大阪・博多）
update events set title = title || ' 東京' where id = 'e92ba85a-c9b5-40d1-8480-385df34d8834' and title = 'TVアニメ『進撃の巨人』レイヴンブレイドカフェ in TreeVillage';
update events set title = title || ' 大阪' where id = '92839a7a-73ad-45e6-bc62-0a008b7b0f9d' and title = 'TVアニメ『進撃の巨人』レイヴンブレイドカフェ in TreeVillage';
update events set title = title || ' 博多', pool = 0 where id = '20cfe897-8f22-4cd2-8081-ffcee316a777' and title = 'TVアニメ『進撃の巨人』レイヴンブレイドカフェ in TreeVillage';

-- アグリーセーターPOP UP SHOP（東京・福岡・兵庫）
update events set title = title || ' 東京' where id = '1f32f4f7-6fc8-41c6-99ca-5f77e7bc79df' and title = 'アグリーセーターPOP UP SHOP';
update events set title = title || ' 福岡' where id = 'e6c43970-a739-4aee-aa17-a6a25676777b' and title = 'アグリーセーターPOP UP SHOP';
update events set title = title || ' 兵庫' where id = '9d7b4099-6572-472a-942f-5f2a1cb65670' and title = 'アグリーセーターPOP UP SHOP';

-- ハイキュー!! わくわく文化祭 POP UP SHOP（東京・大阪・岐阜・群馬）
update events set title = title || ' 東京' where id = 'dc211551-3727-450e-9cb0-7fee55b81767' and title = 'ハイキュー!! わくわく文化祭 POP UP SHOP';
update events set title = title || ' 大阪' where id = 'c6275784-a2e4-4047-bd73-33b0475f05ee' and title = 'ハイキュー!! わくわく文化祭 POP UP SHOP';
update events set title = title || ' 岐阜' where id = '2dfc37b1-727e-4807-8cac-b115afc27fa4' and title = 'ハイキュー!! わくわく文化祭 POP UP SHOP';
update events set title = title || ' 群馬' where id = 'de9c48e1-b599-419b-8019-94940a61f2ee' and title = 'ハイキュー!! わくわく文化祭 POP UP SHOP';

commit;

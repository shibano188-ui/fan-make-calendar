-- ブラスタ公式ストアの初回の登録を直す（2026-11-01）。
-- ① 頭の【通常版】などが落ちて同じ名前が並んだ予定を、版の分かる名前にする（30件）
-- ② 発売から1か月以上たった商品が新着に出ないよう、登録日を発売日にそろえる（24件）
-- 消す行は無い。id を直接指定しているので本番専用。
--
-- 適用：
--   本番……2026-11-01 柴野（SQL Editor）
--   開発……2026-11-01 柴野（id が無いので更新0件）

begin;
update events set title = '6thアルバム「BLACKSTARⅥ」（通常盤）' where id = 'fb5331f7-eaa5-4f29-b579-c2fdf1488399' and title = '6thアルバム「BLACKSTARVI」';
update events set title = '3rd LIVE「BLACK LIVEⅢ」（初回限定版Blu-ray）' where id = 'e5a2b6a7-758a-4cc8-ab9c-f99d785eab38' and title = '3rd LIVE「BLACK LIVEIII」';
update events set title = '「BLACK LIVE -Battle of Starless-」BLACKSONIC収録版（初回限定Blu-ray）' where id = 'e51ee035-ce9e-4ec6-9160-0655e41007fd' and title = '「BLACK LIVE -Battle of Starless-」BLACKSONIC収録版';
update events set title = '「BLACK LIVE -Battle of Starless-」BLACKSONIC収録版（グッズ付き初回限定Blu-ray）' where id = '189d9ee2-1978-4fa3-be46-fa09687a6963' and title = '「BLACK LIVE -Battle of Starless-」BLACKSONIC収録版';
update events set title = '「BLACKTOUR2023」（通常版Blu-ray）' where id = '0ed5fab7-4d47-4dc9-9f8d-44f8a6c42e5e' and title = '「BLACKTOUR2023」';
update events set title = '4thアルバム「BLACKSTARⅣ」（通常盤）' where id = '4e150d05-2a0e-4a29-b9c5-eee436b00721' and title = '4thアルバム「BLACKSTARIV」';
update events set title = '6thアルバム「BLACKSTARⅥ」（初回限定盤/STAR Ver.）' where id = '40e7513c-9b6b-4bc9-b2c1-41074f67ba70' and title = '6thアルバム「BLACKSTARVI」';
update events set title = '「BLACKTOUR2023」（グッズ付初回限定版Blu-ray）' where id = '74a68458-b310-4d98-a9fa-1b2ab5cebf82' and title = '「BLACKTOUR2023」';
update events set title = '3rd LIVE「BLACK LIVEⅢ」（通常版Blu-ray）' where id = '2f95b525-efbd-4e15-83dc-6eec45a440eb' and title = '3rd LIVE「BLACK LIVEIII」';
update events set title = '4th Anniversary Single「Outsider」（豪華盤）' where id = 'e345fda8-4685-423c-867e-04323b962c07' and title = '4th Anniversary Single「Outsider」';
update events set title = '4thアルバム「BLACKSTARⅣ」（初回限定盤 / teamP Ver.）' where id = '6baaacb6-12cc-4769-a3a3-03b6253ded18' and title = '4thアルバム「BLACKSTARIV」';
update events set title = '4thアルバム「BLACKSTARⅣ」（初回限定盤 / teamC Ver.）' where id = 'c2cb9232-2538-46d4-8ba7-cb7548153973' and title = '4thアルバム「BLACKSTARIV」';
update events set title = '4thアルバム「BLACKSTARⅣ」（初回限定盤 / teamW Ver.）' where id = '906e20c5-e861-41ba-97a5-146802d72b86' and title = '4thアルバム「BLACKSTARIV」';
update events set title = '2nd LIVE「BLACK LIVEⅡ」（通常版DVD）' where id = '0cf1e6d1-0992-46e4-ae06-9cf32e3a1e26' and title = '2nd LIVE「BLACK LIVEII」';
update events set title = '2nd LIVE「BLACK LIVEⅡ」（初回限定版Blu-ray / STAR Ver.）' where id = 'e04f3c38-af20-4821-84e6-d882ca71aad7' and title = '2nd LIVE「BLACK LIVEII」';
update events set title = '「Make Your Choice」（初回限定盤 / side ODD）' where id = 'cca5f1ab-2a1c-4c0b-b504-310911676827' and title = '「Make Your Choice」';
update events set title = '4thアルバム「BLACKSTARⅣ」（初回限定盤 / teamK Ver.）' where id = '44d21488-469d-477c-b56b-582b04cb4152' and title = '4thアルバム「BLACKSTARIV」';
update events set title = '「Make Your Choice」（初回限定盤 / side EVEN）' where id = 'c6bb0bef-20d6-4367-8ebb-db41ec3acdb3' and title = '「Make Your Choice」';
update events set title = '2nd LIVE「BLACK LIVEⅡ」（初回限定版Blu-ray / BLACK Ver.）' where id = '5722eb1b-0162-47d8-a206-a1e98cbdd8dc' and title = '2nd LIVE「BLACK LIVEII」';
update events set title = '3rdアルバム「BLACKSTARⅢ」（初回限定盤 / teamC Ver.）' where id = 'c5c97d2d-049e-4149-bce5-078b01a97ec6' and title = '3rdアルバム「BLACKSTARIII」';
update events set title = '2nd LIVE「BLACK LIVEⅡ」（通常版Blu-ray）' where id = '2c017516-0b33-47f2-9031-5c3a90962267' and title = '2nd LIVE「BLACK LIVEII」';
update events set title = '3rdアルバム「BLACKSTARⅢ」（初回限定盤 / teamP Ver.）' where id = '9f7e3101-cf5a-449e-8290-fd6d0a3e59f6' and title = '3rdアルバム「BLACKSTARIII」';
update events set title = '3rdアルバム「BLACKSTARⅢ」（初回限定盤 / teamW Ver.）' where id = 'ddeb0d09-e5c9-47fa-8792-749d8f211ad8' and title = '3rdアルバム「BLACKSTARIII」';
update events set title = '3rdアルバム「BLACKSTARⅢ」（通常盤）' where id = '911931d6-2557-4cea-90b9-30445f1d8333' and title = '3rdアルバム「BLACKSTARIII」';
update events set title = '3rdアルバム「BLACKSTARⅢ」（初回限定盤 / teamK Ver.）' where id = '9a9023d0-7729-4b71-aabb-e16ce85a944e' and title = '3rdアルバム「BLACKSTARIII」';
update events set title = '3rdアルバム「BLACKSTARⅢ」（初回限定盤 / teamB Ver.）' where id = 'f12ab1ce-c1fd-4e7f-957e-dbb83d77c663' and title = '3rdアルバム「BLACKSTARIII」';
update events set title = '2ndアルバム「BLACKSTARⅡ」（初回限定盤 / BLACK Ver.）' where id = 'ef1197c5-f618-4b96-9bae-b4532a37ed97' and title = '2ndアルバム「BLACKSTARII」';
update events set title = '1stアルバム「BLACKSTAR」（通常盤）' where id = '954bc9a7-58c2-4ea1-a3fb-8b626fa01a19' and title = '1stアルバム「BLACKSTAR」';
update events set title = '1stアルバム「BLACKSTAR」（初回限定盤 / teamC Ver.）' where id = '6fb061b3-0297-4883-b377-553e61cd9697' and title = '1stアルバム「BLACKSTAR」';
update events set title = '1stアルバム「BLACKSTAR」（初回限定盤 / teamK Ver.）' where id = '27cd17f9-b1b6-49ca-ad58-280b6bc25fae' and title = '1stアルバム「BLACKSTAR」';
update events set created_at = '2024-12-10T00:00:00+09:00' where id = 'fb1caf17-d26e-4bb9-8d1c-8b0f47a16292';
update events set created_at = '2025-10-21T00:00:00+09:00' where id = 'fb5331f7-eaa5-4f29-b579-c2fdf1488399';
update events set created_at = '2025-10-21T00:00:00+09:00' where id = '0a13e740-2652-4aa6-8288-cfe62a69cc28';
update events set created_at = '2025-10-21T00:00:00+09:00' where id = 'e51ee035-ce9e-4ec6-9160-0655e41007fd';
update events set created_at = '2025-10-21T00:00:00+09:00' where id = '189d9ee2-1978-4fa3-be46-fa09687a6963';
update events set created_at = '2024-09-10T00:00:00+09:00' where id = '0ed5fab7-4d47-4dc9-9f8d-44f8a6c42e5e';
update events set created_at = '2023-04-25T00:00:00+09:00' where id = '4e150d05-2a0e-4a29-b9c5-eee436b00721';
update events set created_at = '2025-10-21T00:00:00+09:00' where id = '354dccec-8325-4368-ac07-90dfebd7ac9a';
update events set created_at = '2024-12-10T00:00:00+09:00' where id = '5547cf8d-448c-4b11-86cd-5f6c8c652e70';
update events set created_at = '2026-07-21T00:00:00+09:00' where id = 'a23282e0-92a6-481b-9ff2-6885414f715c';
update events set created_at = '2025-10-21T00:00:00+09:00' where id = '03484c71-5ac6-4596-88e8-42b07c612322';
update events set created_at = '2025-10-21T00:00:00+09:00' where id = '40e7513c-9b6b-4bc9-b2c1-41074f67ba70';
update events set created_at = '2024-09-10T00:00:00+09:00' where id = '74a68458-b310-4d98-a9fa-1b2ab5cebf82';
update events set created_at = '2023-04-25T00:00:00+09:00' where id = '6baaacb6-12cc-4769-a3a3-03b6253ded18';
update events set created_at = '2023-12-05T00:00:00+09:00' where id = 'b7fe6c32-cf93-4109-85fc-1a9f37c4d289';
update events set created_at = '2023-04-25T00:00:00+09:00' where id = 'c2cb9232-2538-46d4-8ba7-cb7548153973';
update events set created_at = '2023-11-07T00:00:00+09:00' where id = 'd876127b-251c-43d8-af2b-a183f61fb35d';
update events set created_at = '2023-04-25T00:00:00+09:00' where id = '906e20c5-e861-41ba-97a5-146802d72b86';
update events set created_at = '2022-09-27T00:00:00+09:00' where id = '0cf1e6d1-0992-46e4-ae06-9cf32e3a1e26';
update events set created_at = '2023-04-25T00:00:00+09:00' where id = '365d25f7-ed68-4b96-bb6d-902600d1521e';
update events set created_at = '2022-09-27T00:00:00+09:00' where id = 'e04f3c38-af20-4821-84e6-d882ca71aad7';
update events set created_at = '2023-04-25T00:00:00+09:00' where id = '44d21488-469d-477c-b56b-582b04cb4152';
update events set created_at = '2022-09-27T00:00:00+09:00' where id = '5722eb1b-0162-47d8-a206-a1e98cbdd8dc';
update events set created_at = '2022-09-27T00:00:00+09:00' where id = '2c017516-0b33-47f2-9031-5c3a90962267';
commit;

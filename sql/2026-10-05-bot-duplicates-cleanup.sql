-- ボットが同じ商品の予定を何度も入れていたのを片付ける（2026-10-05 柴野のバグ報告・ちいかわ9巻）。
-- 原因と直し: api/_listsource.ts の excludeRegistered が登録済みの購入リンクを1000件で切っていた（main 91525d9 で修正）。
--
-- 対象: 作品・タイトル・発売日・最初の購入リンク（商品ページ）がすべて同じで、どれもボット（FanHive公式）が入れたもの。
--       2026-10-05 に本番を読んで数えた 35組・41件（ほぼ 10/3 に入った分）。
--       名前と発売日が同じでも商品ページが違うもの（キャラ別の商品など）は対象にしていない。
-- 残す: 各組で一番早く入ったもの。外す: ほか … 消さずに pool = 1（このリポジトリの重複の扱い）。
-- 外す側にしか無い購入リンク・いいね・カレンダーへの追加・スタンプ・ピンした日は、残す側へ写してから外す。
--
-- ⚠️ 本番のデータを書き換えるので、PR で見てもらってから流す。流したら PR にそう書く。
-- 2026-10-05 に本番へ流した（柴野）。最初の版は一時表（create temp table）を使っていて、Supabase の SQL Editor では
-- 一時表が次の文から見えずに止まることがあった。流し直しても動くよう、各文に組の一覧を持たせる形にした（何度流しても同じ結果）

begin;

-- 1. 外す側にしか無い購入リンクを残す側へ（同じ URL は足さない）
with dedupe_pairs(keep_id, drop_id) as (values
    ('288d5bd6-0d3d-47d6-bff4-d8e3ee3f6fa4'::uuid, '00b1bf21-f0e2-4a5d-b091-42f804c8bbec'::uuid),
    ('8cae8809-ba29-45f7-a4ff-2663fb4c41ae'::uuid, 'a08eef5b-f114-4b2b-9fe3-4c5c33f797f5'::uuid),
    ('8cae8809-ba29-45f7-a4ff-2663fb4c41ae'::uuid, 'bccebb0c-9387-4e4b-b713-80a8175b0850'::uuid),
    ('8cae8809-ba29-45f7-a4ff-2663fb4c41ae'::uuid, '0585f7d2-c886-4bdd-b426-65fd34b197a7'::uuid),
    ('8cae8809-ba29-45f7-a4ff-2663fb4c41ae'::uuid, '968dce8e-cf64-46fc-b3d5-51f99b22c620'::uuid),
    ('0ce33255-9e6a-4ba7-b68d-efd841520103'::uuid, '6f1c9d28-02bb-43e2-91a1-4a57d3f5a4f3'::uuid),
    ('0dca7dbe-746e-4d68-b64d-c1abe4f84260'::uuid, '5aefde0b-f01f-4bc9-a03f-4c3dcc35fc07'::uuid),
    ('8959ea47-cabe-4916-a4a9-20fbffee0433'::uuid, '0e2fd041-667a-4805-ab0e-cf9e2b79318b'::uuid),
    ('0fd59d63-c972-4608-bb3f-2a01f60008d3'::uuid, '4b9976bd-74b1-4ddd-996a-e01a5d280d4a'::uuid),
    ('128be105-ae43-42c5-bc29-1c4460b91e6f'::uuid, '3744f3e6-fb1c-420d-96da-bb456c0d47d9'::uuid),
    ('12f895af-b0ec-4655-984a-186718dbcb2f'::uuid, 'f9a9d31c-2319-4564-ab83-cedb4ac0f4cc'::uuid),
    ('75571652-afa8-4419-85a3-c8270f473595'::uuid, '14ddc7ec-eeb3-4d8e-9147-d06c4842697b'::uuid),
    ('bb17a399-1ebc-4146-a61b-0946e049b00b'::uuid, '1e3d1d84-674e-44bc-8c5d-f67b42b06317'::uuid),
    ('2bf5ef6a-db0c-48ec-8b2d-e9e17d79a290'::uuid, '21b334e6-cb9a-494b-9eba-a1a3cc7980f7'::uuid),
    ('266d82a3-e4f9-408a-a3ca-434745c79905'::uuid, '66c6195c-0e70-49bd-824c-88a06e8f8326'::uuid),
    ('2d751d56-ab45-4bc4-abc5-bdd2f93c9f14'::uuid, '6d4df2a6-e17c-480d-ad32-a20ba831878b'::uuid),
    ('e15a88fd-7b61-4206-90ea-3480dcc2573a'::uuid, '309b4715-8cce-4c59-99f2-a36122f4b02a'::uuid),
    ('343a3d52-8026-4bce-81e3-4e449faf8940'::uuid, '7cdb2d48-65ae-4645-b544-d6d954455cc5'::uuid),
    ('e129afb4-3f1e-4398-821a-1efd567006ba'::uuid, '37cb0de4-1dfd-49d3-86a3-8cfaa13635fe'::uuid),
    ('b5578258-6a39-4470-886f-30c52104a984'::uuid, '395e7cb9-5f1f-4932-b269-a27cc0e931ca'::uuid),
    ('a2d960e8-16ca-48bb-b6d9-8b45ec5af267'::uuid, '3d44876b-2eff-4889-ba42-7c8e57eed4b3'::uuid),
    ('a2d960e8-16ca-48bb-b6d9-8b45ec5af267'::uuid, '8a832864-a694-49a7-ad57-3ce50b0321b5'::uuid),
    ('a2f511cf-c6fd-437d-a31b-0d637de9f5d2'::uuid, '4540f786-64d1-412d-938f-5b25ef13d9d0'::uuid),
    ('519b3c55-8a07-40c0-a0f0-39866a154f9c'::uuid, 'dc419fc0-5f7c-47cb-b44c-9216e2df1e38'::uuid),
    ('589e3fd8-5335-40b1-bee1-59c5096642cd'::uuid, 'a2ade3c5-584d-435b-a311-aa430762a811'::uuid),
    ('5ec26453-82c2-4b02-b25a-b84c70c3abca'::uuid, '67f31c06-9308-4032-99ce-9f18381274c1'::uuid),
    ('d910c6de-b601-4650-a2b8-21da6fe3ea84'::uuid, '6c24d730-7189-4730-8140-fdcd7aac62cc'::uuid),
    ('813bebe5-b188-466b-b475-b215c54bb89a'::uuid, '76146fb9-4815-4701-a2ae-18caaf94da7e'::uuid),
    ('78879ba1-b926-4a37-ba13-d671130f41e4'::uuid, 'b523cb2b-dc1a-4777-8904-460a7984fce5'::uuid),
    ('c40b293b-882a-4c6c-be4c-1816284099c7'::uuid, '795e30a4-86e1-4558-821e-d46496986894'::uuid),
    ('84f33086-5092-4d27-94be-a7312940bc80'::uuid, 'd5495d55-608a-4a5d-ae67-7a121230786f'::uuid),
    ('c355a8c3-692b-406e-b0d4-9766d5623b80'::uuid, '868572f7-0ada-4658-a5a7-b05f9c6cc69e'::uuid),
    ('97ab7709-cf03-4516-8346-8ef3fcb07b02'::uuid, 'c6625995-3a34-42e4-ba8d-d3149784e06f'::uuid),
    ('97ab7709-cf03-4516-8346-8ef3fcb07b02'::uuid, '8c416987-0abf-4cb6-a1b2-a0ff9536bd7e'::uuid),
    ('c329b53a-9c66-41c7-8d80-dc42bcb6995b'::uuid, '8d434063-5c91-49a3-8faf-b0107961bf16'::uuid),
    ('8ff04480-b253-4c30-ad18-f229d7fab706'::uuid, 'e51302b5-1754-4ed9-8b31-8ee7067061e9'::uuid),
    ('cb84ae34-fb50-4309-a3f9-a8c894b2ea4a'::uuid, 'be875dcc-4284-4c51-bae4-c64ff641dfad'::uuid),
    ('cb84ae34-fb50-4309-a3f9-a8c894b2ea4a'::uuid, '90fafb54-3759-4c0a-bb9e-e362744bd95e'::uuid),
    ('b69d40c0-bc9b-45d4-ae55-b81586e3d87f'::uuid, 'a277f098-0897-478e-8e5b-1bfeb8541fc7'::uuid),
    ('ac39f177-9b18-4197-b9f8-a119855c3dd1'::uuid, 'a9bb75e9-6302-4fd5-ad98-eaa0f220a572'::uuid),
    ('f7b2ace7-e65c-44b0-8009-fa68eb750dad'::uuid, 'ec054dc0-31dc-46b5-bc8f-c0a8313b0930'::uuid))
update public.events k
   set offers = k.offers || coalesce((
         select jsonb_agg(o)
           from dedupe_pairs p
           join public.events d on d.id = p.drop_id
           cross join lateral jsonb_array_elements(d.offers) o
          where p.keep_id = k.id
            and not exists (select 1 from jsonb_array_elements(k.offers) x where x->>'url' = o->>'url')), '[]'::jsonb)
 where k.id in (select keep_id from dedupe_pairs);

-- 2. いいね・カレンダーへの追加・スタンプ・ピンした日を残す側へ（同じ人が両方に付けていれば1つにする）
with dedupe_pairs(keep_id, drop_id) as (values
    ('288d5bd6-0d3d-47d6-bff4-d8e3ee3f6fa4'::uuid, '00b1bf21-f0e2-4a5d-b091-42f804c8bbec'::uuid),
    ('8cae8809-ba29-45f7-a4ff-2663fb4c41ae'::uuid, 'a08eef5b-f114-4b2b-9fe3-4c5c33f797f5'::uuid),
    ('8cae8809-ba29-45f7-a4ff-2663fb4c41ae'::uuid, 'bccebb0c-9387-4e4b-b713-80a8175b0850'::uuid),
    ('8cae8809-ba29-45f7-a4ff-2663fb4c41ae'::uuid, '0585f7d2-c886-4bdd-b426-65fd34b197a7'::uuid),
    ('8cae8809-ba29-45f7-a4ff-2663fb4c41ae'::uuid, '968dce8e-cf64-46fc-b3d5-51f99b22c620'::uuid),
    ('0ce33255-9e6a-4ba7-b68d-efd841520103'::uuid, '6f1c9d28-02bb-43e2-91a1-4a57d3f5a4f3'::uuid),
    ('0dca7dbe-746e-4d68-b64d-c1abe4f84260'::uuid, '5aefde0b-f01f-4bc9-a03f-4c3dcc35fc07'::uuid),
    ('8959ea47-cabe-4916-a4a9-20fbffee0433'::uuid, '0e2fd041-667a-4805-ab0e-cf9e2b79318b'::uuid),
    ('0fd59d63-c972-4608-bb3f-2a01f60008d3'::uuid, '4b9976bd-74b1-4ddd-996a-e01a5d280d4a'::uuid),
    ('128be105-ae43-42c5-bc29-1c4460b91e6f'::uuid, '3744f3e6-fb1c-420d-96da-bb456c0d47d9'::uuid),
    ('12f895af-b0ec-4655-984a-186718dbcb2f'::uuid, 'f9a9d31c-2319-4564-ab83-cedb4ac0f4cc'::uuid),
    ('75571652-afa8-4419-85a3-c8270f473595'::uuid, '14ddc7ec-eeb3-4d8e-9147-d06c4842697b'::uuid),
    ('bb17a399-1ebc-4146-a61b-0946e049b00b'::uuid, '1e3d1d84-674e-44bc-8c5d-f67b42b06317'::uuid),
    ('2bf5ef6a-db0c-48ec-8b2d-e9e17d79a290'::uuid, '21b334e6-cb9a-494b-9eba-a1a3cc7980f7'::uuid),
    ('266d82a3-e4f9-408a-a3ca-434745c79905'::uuid, '66c6195c-0e70-49bd-824c-88a06e8f8326'::uuid),
    ('2d751d56-ab45-4bc4-abc5-bdd2f93c9f14'::uuid, '6d4df2a6-e17c-480d-ad32-a20ba831878b'::uuid),
    ('e15a88fd-7b61-4206-90ea-3480dcc2573a'::uuid, '309b4715-8cce-4c59-99f2-a36122f4b02a'::uuid),
    ('343a3d52-8026-4bce-81e3-4e449faf8940'::uuid, '7cdb2d48-65ae-4645-b544-d6d954455cc5'::uuid),
    ('e129afb4-3f1e-4398-821a-1efd567006ba'::uuid, '37cb0de4-1dfd-49d3-86a3-8cfaa13635fe'::uuid),
    ('b5578258-6a39-4470-886f-30c52104a984'::uuid, '395e7cb9-5f1f-4932-b269-a27cc0e931ca'::uuid),
    ('a2d960e8-16ca-48bb-b6d9-8b45ec5af267'::uuid, '3d44876b-2eff-4889-ba42-7c8e57eed4b3'::uuid),
    ('a2d960e8-16ca-48bb-b6d9-8b45ec5af267'::uuid, '8a832864-a694-49a7-ad57-3ce50b0321b5'::uuid),
    ('a2f511cf-c6fd-437d-a31b-0d637de9f5d2'::uuid, '4540f786-64d1-412d-938f-5b25ef13d9d0'::uuid),
    ('519b3c55-8a07-40c0-a0f0-39866a154f9c'::uuid, 'dc419fc0-5f7c-47cb-b44c-9216e2df1e38'::uuid),
    ('589e3fd8-5335-40b1-bee1-59c5096642cd'::uuid, 'a2ade3c5-584d-435b-a311-aa430762a811'::uuid),
    ('5ec26453-82c2-4b02-b25a-b84c70c3abca'::uuid, '67f31c06-9308-4032-99ce-9f18381274c1'::uuid),
    ('d910c6de-b601-4650-a2b8-21da6fe3ea84'::uuid, '6c24d730-7189-4730-8140-fdcd7aac62cc'::uuid),
    ('813bebe5-b188-466b-b475-b215c54bb89a'::uuid, '76146fb9-4815-4701-a2ae-18caaf94da7e'::uuid),
    ('78879ba1-b926-4a37-ba13-d671130f41e4'::uuid, 'b523cb2b-dc1a-4777-8904-460a7984fce5'::uuid),
    ('c40b293b-882a-4c6c-be4c-1816284099c7'::uuid, '795e30a4-86e1-4558-821e-d46496986894'::uuid),
    ('84f33086-5092-4d27-94be-a7312940bc80'::uuid, 'd5495d55-608a-4a5d-ae67-7a121230786f'::uuid),
    ('c355a8c3-692b-406e-b0d4-9766d5623b80'::uuid, '868572f7-0ada-4658-a5a7-b05f9c6cc69e'::uuid),
    ('97ab7709-cf03-4516-8346-8ef3fcb07b02'::uuid, 'c6625995-3a34-42e4-ba8d-d3149784e06f'::uuid),
    ('97ab7709-cf03-4516-8346-8ef3fcb07b02'::uuid, '8c416987-0abf-4cb6-a1b2-a0ff9536bd7e'::uuid),
    ('c329b53a-9c66-41c7-8d80-dc42bcb6995b'::uuid, '8d434063-5c91-49a3-8faf-b0107961bf16'::uuid),
    ('8ff04480-b253-4c30-ad18-f229d7fab706'::uuid, 'e51302b5-1754-4ed9-8b31-8ee7067061e9'::uuid),
    ('cb84ae34-fb50-4309-a3f9-a8c894b2ea4a'::uuid, 'be875dcc-4284-4c51-bae4-c64ff641dfad'::uuid),
    ('cb84ae34-fb50-4309-a3f9-a8c894b2ea4a'::uuid, '90fafb54-3759-4c0a-bb9e-e362744bd95e'::uuid),
    ('b69d40c0-bc9b-45d4-ae55-b81586e3d87f'::uuid, 'a277f098-0897-478e-8e5b-1bfeb8541fc7'::uuid),
    ('ac39f177-9b18-4197-b9f8-a119855c3dd1'::uuid, 'a9bb75e9-6302-4fd5-ad98-eaa0f220a572'::uuid),
    ('f7b2ace7-e65c-44b0-8009-fa68eb750dad'::uuid, 'ec054dc0-31dc-46b5-bc8f-c0a8313b0930'::uuid))
insert into public.likes (event_id, user_id)
select distinct p.keep_id, l.user_id from dedupe_pairs p join public.likes l on l.event_id = p.drop_id
 where not exists (select 1 from public.likes k where k.event_id = p.keep_id and k.user_id = l.user_id);

with dedupe_pairs(keep_id, drop_id) as (values
    ('288d5bd6-0d3d-47d6-bff4-d8e3ee3f6fa4'::uuid, '00b1bf21-f0e2-4a5d-b091-42f804c8bbec'::uuid),
    ('8cae8809-ba29-45f7-a4ff-2663fb4c41ae'::uuid, 'a08eef5b-f114-4b2b-9fe3-4c5c33f797f5'::uuid),
    ('8cae8809-ba29-45f7-a4ff-2663fb4c41ae'::uuid, 'bccebb0c-9387-4e4b-b713-80a8175b0850'::uuid),
    ('8cae8809-ba29-45f7-a4ff-2663fb4c41ae'::uuid, '0585f7d2-c886-4bdd-b426-65fd34b197a7'::uuid),
    ('8cae8809-ba29-45f7-a4ff-2663fb4c41ae'::uuid, '968dce8e-cf64-46fc-b3d5-51f99b22c620'::uuid),
    ('0ce33255-9e6a-4ba7-b68d-efd841520103'::uuid, '6f1c9d28-02bb-43e2-91a1-4a57d3f5a4f3'::uuid),
    ('0dca7dbe-746e-4d68-b64d-c1abe4f84260'::uuid, '5aefde0b-f01f-4bc9-a03f-4c3dcc35fc07'::uuid),
    ('8959ea47-cabe-4916-a4a9-20fbffee0433'::uuid, '0e2fd041-667a-4805-ab0e-cf9e2b79318b'::uuid),
    ('0fd59d63-c972-4608-bb3f-2a01f60008d3'::uuid, '4b9976bd-74b1-4ddd-996a-e01a5d280d4a'::uuid),
    ('128be105-ae43-42c5-bc29-1c4460b91e6f'::uuid, '3744f3e6-fb1c-420d-96da-bb456c0d47d9'::uuid),
    ('12f895af-b0ec-4655-984a-186718dbcb2f'::uuid, 'f9a9d31c-2319-4564-ab83-cedb4ac0f4cc'::uuid),
    ('75571652-afa8-4419-85a3-c8270f473595'::uuid, '14ddc7ec-eeb3-4d8e-9147-d06c4842697b'::uuid),
    ('bb17a399-1ebc-4146-a61b-0946e049b00b'::uuid, '1e3d1d84-674e-44bc-8c5d-f67b42b06317'::uuid),
    ('2bf5ef6a-db0c-48ec-8b2d-e9e17d79a290'::uuid, '21b334e6-cb9a-494b-9eba-a1a3cc7980f7'::uuid),
    ('266d82a3-e4f9-408a-a3ca-434745c79905'::uuid, '66c6195c-0e70-49bd-824c-88a06e8f8326'::uuid),
    ('2d751d56-ab45-4bc4-abc5-bdd2f93c9f14'::uuid, '6d4df2a6-e17c-480d-ad32-a20ba831878b'::uuid),
    ('e15a88fd-7b61-4206-90ea-3480dcc2573a'::uuid, '309b4715-8cce-4c59-99f2-a36122f4b02a'::uuid),
    ('343a3d52-8026-4bce-81e3-4e449faf8940'::uuid, '7cdb2d48-65ae-4645-b544-d6d954455cc5'::uuid),
    ('e129afb4-3f1e-4398-821a-1efd567006ba'::uuid, '37cb0de4-1dfd-49d3-86a3-8cfaa13635fe'::uuid),
    ('b5578258-6a39-4470-886f-30c52104a984'::uuid, '395e7cb9-5f1f-4932-b269-a27cc0e931ca'::uuid),
    ('a2d960e8-16ca-48bb-b6d9-8b45ec5af267'::uuid, '3d44876b-2eff-4889-ba42-7c8e57eed4b3'::uuid),
    ('a2d960e8-16ca-48bb-b6d9-8b45ec5af267'::uuid, '8a832864-a694-49a7-ad57-3ce50b0321b5'::uuid),
    ('a2f511cf-c6fd-437d-a31b-0d637de9f5d2'::uuid, '4540f786-64d1-412d-938f-5b25ef13d9d0'::uuid),
    ('519b3c55-8a07-40c0-a0f0-39866a154f9c'::uuid, 'dc419fc0-5f7c-47cb-b44c-9216e2df1e38'::uuid),
    ('589e3fd8-5335-40b1-bee1-59c5096642cd'::uuid, 'a2ade3c5-584d-435b-a311-aa430762a811'::uuid),
    ('5ec26453-82c2-4b02-b25a-b84c70c3abca'::uuid, '67f31c06-9308-4032-99ce-9f18381274c1'::uuid),
    ('d910c6de-b601-4650-a2b8-21da6fe3ea84'::uuid, '6c24d730-7189-4730-8140-fdcd7aac62cc'::uuid),
    ('813bebe5-b188-466b-b475-b215c54bb89a'::uuid, '76146fb9-4815-4701-a2ae-18caaf94da7e'::uuid),
    ('78879ba1-b926-4a37-ba13-d671130f41e4'::uuid, 'b523cb2b-dc1a-4777-8904-460a7984fce5'::uuid),
    ('c40b293b-882a-4c6c-be4c-1816284099c7'::uuid, '795e30a4-86e1-4558-821e-d46496986894'::uuid),
    ('84f33086-5092-4d27-94be-a7312940bc80'::uuid, 'd5495d55-608a-4a5d-ae67-7a121230786f'::uuid),
    ('c355a8c3-692b-406e-b0d4-9766d5623b80'::uuid, '868572f7-0ada-4658-a5a7-b05f9c6cc69e'::uuid),
    ('97ab7709-cf03-4516-8346-8ef3fcb07b02'::uuid, 'c6625995-3a34-42e4-ba8d-d3149784e06f'::uuid),
    ('97ab7709-cf03-4516-8346-8ef3fcb07b02'::uuid, '8c416987-0abf-4cb6-a1b2-a0ff9536bd7e'::uuid),
    ('c329b53a-9c66-41c7-8d80-dc42bcb6995b'::uuid, '8d434063-5c91-49a3-8faf-b0107961bf16'::uuid),
    ('8ff04480-b253-4c30-ad18-f229d7fab706'::uuid, 'e51302b5-1754-4ed9-8b31-8ee7067061e9'::uuid),
    ('cb84ae34-fb50-4309-a3f9-a8c894b2ea4a'::uuid, 'be875dcc-4284-4c51-bae4-c64ff641dfad'::uuid),
    ('cb84ae34-fb50-4309-a3f9-a8c894b2ea4a'::uuid, '90fafb54-3759-4c0a-bb9e-e362744bd95e'::uuid),
    ('b69d40c0-bc9b-45d4-ae55-b81586e3d87f'::uuid, 'a277f098-0897-478e-8e5b-1bfeb8541fc7'::uuid),
    ('ac39f177-9b18-4197-b9f8-a119855c3dd1'::uuid, 'a9bb75e9-6302-4fd5-ad98-eaa0f220a572'::uuid),
    ('f7b2ace7-e65c-44b0-8009-fa68eb750dad'::uuid, 'ec054dc0-31dc-46b5-bc8f-c0a8313b0930'::uuid))
insert into public.calendar_adds (event_id, user_id)
select p.keep_id, c.user_id from dedupe_pairs p join public.calendar_adds c on c.event_id = p.drop_id
on conflict (event_id, user_id) do nothing;

with dedupe_pairs(keep_id, drop_id) as (values
    ('288d5bd6-0d3d-47d6-bff4-d8e3ee3f6fa4'::uuid, '00b1bf21-f0e2-4a5d-b091-42f804c8bbec'::uuid),
    ('8cae8809-ba29-45f7-a4ff-2663fb4c41ae'::uuid, 'a08eef5b-f114-4b2b-9fe3-4c5c33f797f5'::uuid),
    ('8cae8809-ba29-45f7-a4ff-2663fb4c41ae'::uuid, 'bccebb0c-9387-4e4b-b713-80a8175b0850'::uuid),
    ('8cae8809-ba29-45f7-a4ff-2663fb4c41ae'::uuid, '0585f7d2-c886-4bdd-b426-65fd34b197a7'::uuid),
    ('8cae8809-ba29-45f7-a4ff-2663fb4c41ae'::uuid, '968dce8e-cf64-46fc-b3d5-51f99b22c620'::uuid),
    ('0ce33255-9e6a-4ba7-b68d-efd841520103'::uuid, '6f1c9d28-02bb-43e2-91a1-4a57d3f5a4f3'::uuid),
    ('0dca7dbe-746e-4d68-b64d-c1abe4f84260'::uuid, '5aefde0b-f01f-4bc9-a03f-4c3dcc35fc07'::uuid),
    ('8959ea47-cabe-4916-a4a9-20fbffee0433'::uuid, '0e2fd041-667a-4805-ab0e-cf9e2b79318b'::uuid),
    ('0fd59d63-c972-4608-bb3f-2a01f60008d3'::uuid, '4b9976bd-74b1-4ddd-996a-e01a5d280d4a'::uuid),
    ('128be105-ae43-42c5-bc29-1c4460b91e6f'::uuid, '3744f3e6-fb1c-420d-96da-bb456c0d47d9'::uuid),
    ('12f895af-b0ec-4655-984a-186718dbcb2f'::uuid, 'f9a9d31c-2319-4564-ab83-cedb4ac0f4cc'::uuid),
    ('75571652-afa8-4419-85a3-c8270f473595'::uuid, '14ddc7ec-eeb3-4d8e-9147-d06c4842697b'::uuid),
    ('bb17a399-1ebc-4146-a61b-0946e049b00b'::uuid, '1e3d1d84-674e-44bc-8c5d-f67b42b06317'::uuid),
    ('2bf5ef6a-db0c-48ec-8b2d-e9e17d79a290'::uuid, '21b334e6-cb9a-494b-9eba-a1a3cc7980f7'::uuid),
    ('266d82a3-e4f9-408a-a3ca-434745c79905'::uuid, '66c6195c-0e70-49bd-824c-88a06e8f8326'::uuid),
    ('2d751d56-ab45-4bc4-abc5-bdd2f93c9f14'::uuid, '6d4df2a6-e17c-480d-ad32-a20ba831878b'::uuid),
    ('e15a88fd-7b61-4206-90ea-3480dcc2573a'::uuid, '309b4715-8cce-4c59-99f2-a36122f4b02a'::uuid),
    ('343a3d52-8026-4bce-81e3-4e449faf8940'::uuid, '7cdb2d48-65ae-4645-b544-d6d954455cc5'::uuid),
    ('e129afb4-3f1e-4398-821a-1efd567006ba'::uuid, '37cb0de4-1dfd-49d3-86a3-8cfaa13635fe'::uuid),
    ('b5578258-6a39-4470-886f-30c52104a984'::uuid, '395e7cb9-5f1f-4932-b269-a27cc0e931ca'::uuid),
    ('a2d960e8-16ca-48bb-b6d9-8b45ec5af267'::uuid, '3d44876b-2eff-4889-ba42-7c8e57eed4b3'::uuid),
    ('a2d960e8-16ca-48bb-b6d9-8b45ec5af267'::uuid, '8a832864-a694-49a7-ad57-3ce50b0321b5'::uuid),
    ('a2f511cf-c6fd-437d-a31b-0d637de9f5d2'::uuid, '4540f786-64d1-412d-938f-5b25ef13d9d0'::uuid),
    ('519b3c55-8a07-40c0-a0f0-39866a154f9c'::uuid, 'dc419fc0-5f7c-47cb-b44c-9216e2df1e38'::uuid),
    ('589e3fd8-5335-40b1-bee1-59c5096642cd'::uuid, 'a2ade3c5-584d-435b-a311-aa430762a811'::uuid),
    ('5ec26453-82c2-4b02-b25a-b84c70c3abca'::uuid, '67f31c06-9308-4032-99ce-9f18381274c1'::uuid),
    ('d910c6de-b601-4650-a2b8-21da6fe3ea84'::uuid, '6c24d730-7189-4730-8140-fdcd7aac62cc'::uuid),
    ('813bebe5-b188-466b-b475-b215c54bb89a'::uuid, '76146fb9-4815-4701-a2ae-18caaf94da7e'::uuid),
    ('78879ba1-b926-4a37-ba13-d671130f41e4'::uuid, 'b523cb2b-dc1a-4777-8904-460a7984fce5'::uuid),
    ('c40b293b-882a-4c6c-be4c-1816284099c7'::uuid, '795e30a4-86e1-4558-821e-d46496986894'::uuid),
    ('84f33086-5092-4d27-94be-a7312940bc80'::uuid, 'd5495d55-608a-4a5d-ae67-7a121230786f'::uuid),
    ('c355a8c3-692b-406e-b0d4-9766d5623b80'::uuid, '868572f7-0ada-4658-a5a7-b05f9c6cc69e'::uuid),
    ('97ab7709-cf03-4516-8346-8ef3fcb07b02'::uuid, 'c6625995-3a34-42e4-ba8d-d3149784e06f'::uuid),
    ('97ab7709-cf03-4516-8346-8ef3fcb07b02'::uuid, '8c416987-0abf-4cb6-a1b2-a0ff9536bd7e'::uuid),
    ('c329b53a-9c66-41c7-8d80-dc42bcb6995b'::uuid, '8d434063-5c91-49a3-8faf-b0107961bf16'::uuid),
    ('8ff04480-b253-4c30-ad18-f229d7fab706'::uuid, 'e51302b5-1754-4ed9-8b31-8ee7067061e9'::uuid),
    ('cb84ae34-fb50-4309-a3f9-a8c894b2ea4a'::uuid, 'be875dcc-4284-4c51-bae4-c64ff641dfad'::uuid),
    ('cb84ae34-fb50-4309-a3f9-a8c894b2ea4a'::uuid, '90fafb54-3759-4c0a-bb9e-e362744bd95e'::uuid),
    ('b69d40c0-bc9b-45d4-ae55-b81586e3d87f'::uuid, 'a277f098-0897-478e-8e5b-1bfeb8541fc7'::uuid),
    ('ac39f177-9b18-4197-b9f8-a119855c3dd1'::uuid, 'a9bb75e9-6302-4fd5-ad98-eaa0f220a572'::uuid),
    ('f7b2ace7-e65c-44b0-8009-fa68eb750dad'::uuid, 'ec054dc0-31dc-46b5-bc8f-c0a8313b0930'::uuid))
insert into public.event_stamps (event_id, user_id, stamp)
select p.keep_id, s.user_id, s.stamp from dedupe_pairs p join public.event_stamps s on s.event_id = p.drop_id
on conflict do nothing;

with dedupe_pairs(keep_id, drop_id) as (values
    ('288d5bd6-0d3d-47d6-bff4-d8e3ee3f6fa4'::uuid, '00b1bf21-f0e2-4a5d-b091-42f804c8bbec'::uuid),
    ('8cae8809-ba29-45f7-a4ff-2663fb4c41ae'::uuid, 'a08eef5b-f114-4b2b-9fe3-4c5c33f797f5'::uuid),
    ('8cae8809-ba29-45f7-a4ff-2663fb4c41ae'::uuid, 'bccebb0c-9387-4e4b-b713-80a8175b0850'::uuid),
    ('8cae8809-ba29-45f7-a4ff-2663fb4c41ae'::uuid, '0585f7d2-c886-4bdd-b426-65fd34b197a7'::uuid),
    ('8cae8809-ba29-45f7-a4ff-2663fb4c41ae'::uuid, '968dce8e-cf64-46fc-b3d5-51f99b22c620'::uuid),
    ('0ce33255-9e6a-4ba7-b68d-efd841520103'::uuid, '6f1c9d28-02bb-43e2-91a1-4a57d3f5a4f3'::uuid),
    ('0dca7dbe-746e-4d68-b64d-c1abe4f84260'::uuid, '5aefde0b-f01f-4bc9-a03f-4c3dcc35fc07'::uuid),
    ('8959ea47-cabe-4916-a4a9-20fbffee0433'::uuid, '0e2fd041-667a-4805-ab0e-cf9e2b79318b'::uuid),
    ('0fd59d63-c972-4608-bb3f-2a01f60008d3'::uuid, '4b9976bd-74b1-4ddd-996a-e01a5d280d4a'::uuid),
    ('128be105-ae43-42c5-bc29-1c4460b91e6f'::uuid, '3744f3e6-fb1c-420d-96da-bb456c0d47d9'::uuid),
    ('12f895af-b0ec-4655-984a-186718dbcb2f'::uuid, 'f9a9d31c-2319-4564-ab83-cedb4ac0f4cc'::uuid),
    ('75571652-afa8-4419-85a3-c8270f473595'::uuid, '14ddc7ec-eeb3-4d8e-9147-d06c4842697b'::uuid),
    ('bb17a399-1ebc-4146-a61b-0946e049b00b'::uuid, '1e3d1d84-674e-44bc-8c5d-f67b42b06317'::uuid),
    ('2bf5ef6a-db0c-48ec-8b2d-e9e17d79a290'::uuid, '21b334e6-cb9a-494b-9eba-a1a3cc7980f7'::uuid),
    ('266d82a3-e4f9-408a-a3ca-434745c79905'::uuid, '66c6195c-0e70-49bd-824c-88a06e8f8326'::uuid),
    ('2d751d56-ab45-4bc4-abc5-bdd2f93c9f14'::uuid, '6d4df2a6-e17c-480d-ad32-a20ba831878b'::uuid),
    ('e15a88fd-7b61-4206-90ea-3480dcc2573a'::uuid, '309b4715-8cce-4c59-99f2-a36122f4b02a'::uuid),
    ('343a3d52-8026-4bce-81e3-4e449faf8940'::uuid, '7cdb2d48-65ae-4645-b544-d6d954455cc5'::uuid),
    ('e129afb4-3f1e-4398-821a-1efd567006ba'::uuid, '37cb0de4-1dfd-49d3-86a3-8cfaa13635fe'::uuid),
    ('b5578258-6a39-4470-886f-30c52104a984'::uuid, '395e7cb9-5f1f-4932-b269-a27cc0e931ca'::uuid),
    ('a2d960e8-16ca-48bb-b6d9-8b45ec5af267'::uuid, '3d44876b-2eff-4889-ba42-7c8e57eed4b3'::uuid),
    ('a2d960e8-16ca-48bb-b6d9-8b45ec5af267'::uuid, '8a832864-a694-49a7-ad57-3ce50b0321b5'::uuid),
    ('a2f511cf-c6fd-437d-a31b-0d637de9f5d2'::uuid, '4540f786-64d1-412d-938f-5b25ef13d9d0'::uuid),
    ('519b3c55-8a07-40c0-a0f0-39866a154f9c'::uuid, 'dc419fc0-5f7c-47cb-b44c-9216e2df1e38'::uuid),
    ('589e3fd8-5335-40b1-bee1-59c5096642cd'::uuid, 'a2ade3c5-584d-435b-a311-aa430762a811'::uuid),
    ('5ec26453-82c2-4b02-b25a-b84c70c3abca'::uuid, '67f31c06-9308-4032-99ce-9f18381274c1'::uuid),
    ('d910c6de-b601-4650-a2b8-21da6fe3ea84'::uuid, '6c24d730-7189-4730-8140-fdcd7aac62cc'::uuid),
    ('813bebe5-b188-466b-b475-b215c54bb89a'::uuid, '76146fb9-4815-4701-a2ae-18caaf94da7e'::uuid),
    ('78879ba1-b926-4a37-ba13-d671130f41e4'::uuid, 'b523cb2b-dc1a-4777-8904-460a7984fce5'::uuid),
    ('c40b293b-882a-4c6c-be4c-1816284099c7'::uuid, '795e30a4-86e1-4558-821e-d46496986894'::uuid),
    ('84f33086-5092-4d27-94be-a7312940bc80'::uuid, 'd5495d55-608a-4a5d-ae67-7a121230786f'::uuid),
    ('c355a8c3-692b-406e-b0d4-9766d5623b80'::uuid, '868572f7-0ada-4658-a5a7-b05f9c6cc69e'::uuid),
    ('97ab7709-cf03-4516-8346-8ef3fcb07b02'::uuid, 'c6625995-3a34-42e4-ba8d-d3149784e06f'::uuid),
    ('97ab7709-cf03-4516-8346-8ef3fcb07b02'::uuid, '8c416987-0abf-4cb6-a1b2-a0ff9536bd7e'::uuid),
    ('c329b53a-9c66-41c7-8d80-dc42bcb6995b'::uuid, '8d434063-5c91-49a3-8faf-b0107961bf16'::uuid),
    ('8ff04480-b253-4c30-ad18-f229d7fab706'::uuid, 'e51302b5-1754-4ed9-8b31-8ee7067061e9'::uuid),
    ('cb84ae34-fb50-4309-a3f9-a8c894b2ea4a'::uuid, 'be875dcc-4284-4c51-bae4-c64ff641dfad'::uuid),
    ('cb84ae34-fb50-4309-a3f9-a8c894b2ea4a'::uuid, '90fafb54-3759-4c0a-bb9e-e362744bd95e'::uuid),
    ('b69d40c0-bc9b-45d4-ae55-b81586e3d87f'::uuid, 'a277f098-0897-478e-8e5b-1bfeb8541fc7'::uuid),
    ('ac39f177-9b18-4197-b9f8-a119855c3dd1'::uuid, 'a9bb75e9-6302-4fd5-ad98-eaa0f220a572'::uuid),
    ('f7b2ace7-e65c-44b0-8009-fa68eb750dad'::uuid, 'ec054dc0-31dc-46b5-bc8f-c0a8313b0930'::uuid))
insert into public.event_visits (event_id, user_id, start_date, end_date)
select p.keep_id, v.user_id, v.start_date, v.end_date from dedupe_pairs p join public.event_visits v on v.event_id = p.drop_id
 where not exists (select 1 from public.event_visits k
                    where k.event_id = p.keep_id and k.user_id = v.user_id and k.start_date = v.start_date and k.end_date = v.end_date);

-- 3. 外す（一覧・カレンダー・集計は pool = 0 だけを見る）
with dedupe_pairs(keep_id, drop_id) as (values
    ('288d5bd6-0d3d-47d6-bff4-d8e3ee3f6fa4'::uuid, '00b1bf21-f0e2-4a5d-b091-42f804c8bbec'::uuid),
    ('8cae8809-ba29-45f7-a4ff-2663fb4c41ae'::uuid, 'a08eef5b-f114-4b2b-9fe3-4c5c33f797f5'::uuid),
    ('8cae8809-ba29-45f7-a4ff-2663fb4c41ae'::uuid, 'bccebb0c-9387-4e4b-b713-80a8175b0850'::uuid),
    ('8cae8809-ba29-45f7-a4ff-2663fb4c41ae'::uuid, '0585f7d2-c886-4bdd-b426-65fd34b197a7'::uuid),
    ('8cae8809-ba29-45f7-a4ff-2663fb4c41ae'::uuid, '968dce8e-cf64-46fc-b3d5-51f99b22c620'::uuid),
    ('0ce33255-9e6a-4ba7-b68d-efd841520103'::uuid, '6f1c9d28-02bb-43e2-91a1-4a57d3f5a4f3'::uuid),
    ('0dca7dbe-746e-4d68-b64d-c1abe4f84260'::uuid, '5aefde0b-f01f-4bc9-a03f-4c3dcc35fc07'::uuid),
    ('8959ea47-cabe-4916-a4a9-20fbffee0433'::uuid, '0e2fd041-667a-4805-ab0e-cf9e2b79318b'::uuid),
    ('0fd59d63-c972-4608-bb3f-2a01f60008d3'::uuid, '4b9976bd-74b1-4ddd-996a-e01a5d280d4a'::uuid),
    ('128be105-ae43-42c5-bc29-1c4460b91e6f'::uuid, '3744f3e6-fb1c-420d-96da-bb456c0d47d9'::uuid),
    ('12f895af-b0ec-4655-984a-186718dbcb2f'::uuid, 'f9a9d31c-2319-4564-ab83-cedb4ac0f4cc'::uuid),
    ('75571652-afa8-4419-85a3-c8270f473595'::uuid, '14ddc7ec-eeb3-4d8e-9147-d06c4842697b'::uuid),
    ('bb17a399-1ebc-4146-a61b-0946e049b00b'::uuid, '1e3d1d84-674e-44bc-8c5d-f67b42b06317'::uuid),
    ('2bf5ef6a-db0c-48ec-8b2d-e9e17d79a290'::uuid, '21b334e6-cb9a-494b-9eba-a1a3cc7980f7'::uuid),
    ('266d82a3-e4f9-408a-a3ca-434745c79905'::uuid, '66c6195c-0e70-49bd-824c-88a06e8f8326'::uuid),
    ('2d751d56-ab45-4bc4-abc5-bdd2f93c9f14'::uuid, '6d4df2a6-e17c-480d-ad32-a20ba831878b'::uuid),
    ('e15a88fd-7b61-4206-90ea-3480dcc2573a'::uuid, '309b4715-8cce-4c59-99f2-a36122f4b02a'::uuid),
    ('343a3d52-8026-4bce-81e3-4e449faf8940'::uuid, '7cdb2d48-65ae-4645-b544-d6d954455cc5'::uuid),
    ('e129afb4-3f1e-4398-821a-1efd567006ba'::uuid, '37cb0de4-1dfd-49d3-86a3-8cfaa13635fe'::uuid),
    ('b5578258-6a39-4470-886f-30c52104a984'::uuid, '395e7cb9-5f1f-4932-b269-a27cc0e931ca'::uuid),
    ('a2d960e8-16ca-48bb-b6d9-8b45ec5af267'::uuid, '3d44876b-2eff-4889-ba42-7c8e57eed4b3'::uuid),
    ('a2d960e8-16ca-48bb-b6d9-8b45ec5af267'::uuid, '8a832864-a694-49a7-ad57-3ce50b0321b5'::uuid),
    ('a2f511cf-c6fd-437d-a31b-0d637de9f5d2'::uuid, '4540f786-64d1-412d-938f-5b25ef13d9d0'::uuid),
    ('519b3c55-8a07-40c0-a0f0-39866a154f9c'::uuid, 'dc419fc0-5f7c-47cb-b44c-9216e2df1e38'::uuid),
    ('589e3fd8-5335-40b1-bee1-59c5096642cd'::uuid, 'a2ade3c5-584d-435b-a311-aa430762a811'::uuid),
    ('5ec26453-82c2-4b02-b25a-b84c70c3abca'::uuid, '67f31c06-9308-4032-99ce-9f18381274c1'::uuid),
    ('d910c6de-b601-4650-a2b8-21da6fe3ea84'::uuid, '6c24d730-7189-4730-8140-fdcd7aac62cc'::uuid),
    ('813bebe5-b188-466b-b475-b215c54bb89a'::uuid, '76146fb9-4815-4701-a2ae-18caaf94da7e'::uuid),
    ('78879ba1-b926-4a37-ba13-d671130f41e4'::uuid, 'b523cb2b-dc1a-4777-8904-460a7984fce5'::uuid),
    ('c40b293b-882a-4c6c-be4c-1816284099c7'::uuid, '795e30a4-86e1-4558-821e-d46496986894'::uuid),
    ('84f33086-5092-4d27-94be-a7312940bc80'::uuid, 'd5495d55-608a-4a5d-ae67-7a121230786f'::uuid),
    ('c355a8c3-692b-406e-b0d4-9766d5623b80'::uuid, '868572f7-0ada-4658-a5a7-b05f9c6cc69e'::uuid),
    ('97ab7709-cf03-4516-8346-8ef3fcb07b02'::uuid, 'c6625995-3a34-42e4-ba8d-d3149784e06f'::uuid),
    ('97ab7709-cf03-4516-8346-8ef3fcb07b02'::uuid, '8c416987-0abf-4cb6-a1b2-a0ff9536bd7e'::uuid),
    ('c329b53a-9c66-41c7-8d80-dc42bcb6995b'::uuid, '8d434063-5c91-49a3-8faf-b0107961bf16'::uuid),
    ('8ff04480-b253-4c30-ad18-f229d7fab706'::uuid, 'e51302b5-1754-4ed9-8b31-8ee7067061e9'::uuid),
    ('cb84ae34-fb50-4309-a3f9-a8c894b2ea4a'::uuid, 'be875dcc-4284-4c51-bae4-c64ff641dfad'::uuid),
    ('cb84ae34-fb50-4309-a3f9-a8c894b2ea4a'::uuid, '90fafb54-3759-4c0a-bb9e-e362744bd95e'::uuid),
    ('b69d40c0-bc9b-45d4-ae55-b81586e3d87f'::uuid, 'a277f098-0897-478e-8e5b-1bfeb8541fc7'::uuid),
    ('ac39f177-9b18-4197-b9f8-a119855c3dd1'::uuid, 'a9bb75e9-6302-4fd5-ad98-eaa0f220a572'::uuid),
    ('f7b2ace7-e65c-44b0-8009-fa68eb750dad'::uuid, 'ec054dc0-31dc-46b5-bc8f-c0a8313b0930'::uuid))
update public.events set pool = 1
 where id in (select drop_id from dedupe_pairs) and pool = 0;

commit;

-- 確認用（外したものが 41 件・残したものは pool = 0 のまま）:
--   select pool, count(*) from events where id in ('00b1bf21-f0e2-4a5d-b091-42f804c8bbec', 'a08eef5b-f114-4b2b-9fe3-4c5c33f797f5', 'bccebb0c-9387-4e4b-b713-80a8175b0850', ...) group by 1;
--   ちいかわ9巻: select id, pool from events where title like 'ちいかわ なんか小さくてかわいいやつ(9)%' order by created_at;

-- 重複していた予定を片付ける（2026-10-04 柴野「重複は絶対に避けたい」）。本番の全件（5,174件）を読んで見つけた 57組・外す73件。
--
-- 見つけ方: 同じ作品で「同じ商品ページ（名前も同じか一方が他方を含む）」「空白・記号を除いた名前と発売日が同じ」「名前と予約・受注の期間が同じ」
--   のどれかに当たる組を出し、1組ずつ中身（購入リンク・キャラ名・発売日・JAN）を見て仕分けた。
-- 原因（直しは同じコミット）:
--   1. 投稿画面: 重複の警告が入力中の帯だけで、閉じられる・0.5秒待つ前に押すと素通り・まとめて投稿には無し。
--      予約・受注の期間と、名前の空白・記号の違い（「＆」「描き下ろし 指揮者」）も見ていなかった
--      → src/lib/api.ts findDuplicateEvents に「同じ予定と言い切れるもの」(strong) を足し、投稿ボタンでもう一度確かめて止める
--   2. ボット: 同じシリーズのキャラ違いがお店に後から追加されるたび、新しい予定を作っていた（同じ名前の予定がキャラの数だけ並ぶ）。
--      別の店の同じ商品で発売日が数日ずれていても（アニメイト 12/15・ムービック 12/18）別の予定になっていた
--      → api/_crawl.ts registerEvents で、同じ作品・同じ名前・発売日が7日以内の予定があれば、そこへ購入リンクを足す
--
-- まとめないもの（名前が似ていても別の商品）: クリアポスターと A3クリアポスター・ポストカードセット（10/3 と 10/9）・
--   まどマギのクリアカード（ムービックの別の商品・JAN 違い）とホロキャラバッジ・進撃の BIGアクリルスタンド2種・サンリオのシェイカーシール・
--   ふわぷちの 4/30 と 5/31（キャラで発売日が分かれている。キャラ単独の予定だけそれぞれへまとめる）・千葉ジェッツの3試合・各会場の POP UP
--
-- 残す / 外す / 外す側の購入リンクに付けるキャラ名（キャラ単独で登録されていた予定。まとめると誰のリンクか分からなくなるため）:
--   c9516c0e / feca3a25 / 坤の剣A  … モノノ怪 原画アクリルスタンド/薬売り
--   c9516c0e / 8b24800b / 離の剣  … モノノ怪 原画アクリルスタンド/薬売り
--   166cc00b / 4fd8e8c3 / -  … フリーレン ミミックのメガネケース
--   17466163 / 2193f6a6 / -  … フリーレン 寝相クッション
--   1b741896 / a02c647f / -  … フリーレン 脱着式フルカラーワッペン
--   bb2147cf / 979d2b19 / -  … フリーレン 寝相デスクマット
--   bb305b03 / 614eefa1 / -  … 18TRIP ダイカットステッカー
--   bb305b03 / 7cd390e5 / -  … 18TRIP ダイカットステッカー
--   bb305b03 / 1138c185 / -  … 18TRIP ダイカットステッカー
--   bb305b03 / 510f8b35 / -  … 18TRIP ダイカットステッカー
--   bb305b03 / 845897de / -  … 18TRIP ダイカットステッカー
--   bb305b03 / 0368887d / -  … 18TRIP ダイカットステッカー
--   2e41df97 / fd9342d5 / -  … 18TRIP クッション
--   d6c31f7d / 23cc7bc3 / -  … Fit Boxing 刀剣乱舞 とっておきBOX
--   eca8c029 / 3bab3164 / -  … Fit Boxing 刀剣乱舞 通常版
--   073d7ca1 / c60a843b / 爆豪 勝己  … ヒロアカ ダイカットステッカー お月見Ver.(ミニキャラ)
--   9896225b / 4f918d21 / 相澤 消太  … ヒロアカ ダイカットステッカー お月見Ver.
--   f025879a / 09fcda65 / -  … ヒロアカ ビジュアルテコレクション/OP A
--   91a321c9 / 1f0e361e / 爆豪 勝己  … ヒロアカ クリアファイル お月見Ver.
--   91a321c9 / d5d027f5 / 相澤 消太  … ヒロアカ クリアファイル お月見Ver.
--   cf21280a / 21dcccd3 / -  … ヒロアカ ぬいパル
--   dfa12642 / f08c4136 / -  … ヒロアカ ぬいパル(幼少期)
--   266d82a3 / c857b957 / 相澤 消太  … ヒロアカ アクリルスタンド お月見Ver.
--   266d82a3 / 4a52e074 / 轟 焦凍  … ヒロアカ アクリルスタンド お月見Ver.
--   41c07fce / b37dbf9c / -  … ヒロアカ ビジュアルテコレクション/ED A
--   84acdd26 / 550008e2 / -  … ヒロアカ 下敷き
--   84acdd26 / 4a3944ce / -  … ヒロアカ 下敷き
--   9874b76a / 9f6424c4 / 爆豪 勝己  … ヒロアカ レンチキュラーTシャツ
--   fcc86b0c / d8709f9d / -  … ヒロアカ ビジュアルテコレクション/ED B
--   e6698d70 / fd5ac6bf / -  … ヒロアカ ビジュアルテコレクション/OP B
--   ff743c7f / d673c2f7 / -  … 鬼滅の刃 ハロウィン2026
--   e6cd9dcf / 0fafd104 / 糸師 凛  … ブルーロック NuiFriends キャラぬい
--   4e81b6ae / 161c0773 / -  … ブルーロック2期 withCAT クリアポーチ
--   3594bf94 / 1738f8d7 / 糸師 冴  … ブルーロック クリアファイル バルーンブーケ Ver.
--   3594bf94 / a6d2aa9a / 潔 世一  … ブルーロック クリアファイル バルーンブーケ Ver.
--   189017e8 / fde128be / -  … ブルーロック2期 withCAT ゆらゆらアクリルスタンド
--   d6fb4c58 / 29976997 / -  … ブルーロック 指揮者ver. BIGアクリルスタンド
--   ae36bded / 309ed447 / -  … ブルーロック2期 withCAT ステッカーセット
--   ae36bded / e5077f35 / -  … ブルーロック2期 withCAT ステッカーセット
--   ae36bded / e0ee55ab / 凪 誠士郎  … ブルーロック2期 withCAT ステッカーセット
--   ae36bded / f368abb3 / -  … ブルーロック2期 withCAT ステッカーセット
--   3ddb42a9 / 77030a55 / 潔 世一  … ブルーロック もふまにあミニスタンド
--   47b21ece / 97576655 / -  … ブルーロック2期 withCAT 硬質カードケース
--   6591ddff / 702cdc74 / -  … ブルーロック2期 ミニアクリルスタンド ぱすてるぽっぷ第3弾
--   a54a59b3 / 7978bed9 / -  … ブルーロック2期 withCAT キャラバッジコレクション
--   7d725b44 / 7d93fc88 / -  … ブルーロック PalVerse vol.2
--   9dac67e2 / efb1ab7e / -  … ブルーロック2期 withCAT ジュエルミラー
--   c1bb25bf / c00ea9f3 / -  … ブルーロック ステッカー うたた寝
--   35665b2f / 217b01ea / -  … 一番くじ 呪術廻戦 5周年FINAL
--   35665b2f / 0074cbef / -  … 一番くじ 呪術廻戦 5周年FINAL
--   35665b2f / 0cdfb20f / -  … 一番くじ 呪術廻戦 5周年FINAL
--   01079454 / 9122303a / -  … 呪術廻戦 ちょこりんコレクション
--   03b1d54a / 811267ff / 虎杖 悠仁  … 呪術廻戦 第3期 withCAT アイマスク付きミニぬいぐるみキーホルダー
--   d45c2f80 / 44f6f027 / -  … 呪術廻戦 とびマス
--   4ab80aa9 / eae07e08 / -  … 呪術廻戦 第3期 メタリュクスバッジ
--   b3ffd85e / df7e9432 / 脹相  … 呪術廻戦 ふわぷち（5/31発売の分）
--   52012eb9 / 968ff611 / 虎杖悠仁  … 呪術廻戦 ふわぷち（4/30発売の分）
--   7d7e0309 / 2f9b4b49 / -  … 呪術廻戦PLAZA「The Wall」
--   53dada02 / 5fd26dbb / -  … 呪術廻戦×POP MART ミニキャラフィギュア
--   8c55eab5 / 6bf727d5 / -  … まどマギ ステッカー ぱすてるぽっぷ
--   8c55eab5 / abe2c588 / -  … まどマギ ステッカー ぱすてるぽっぷ
--   7cfbc496 / e9050453 / -  … まどマギ ぬいパル(ワルプルギスの廻天ver.)
--   dbeb3c34 / a319b23a / リヴァイ  … 進撃の巨人 ミニアクリルスタンド/(ベビー)
--   c77970a9 / bf428ffb / -  … 進撃の巨人 アクリルヘアクリップ/リヴァイ
--   19c3f96b / 642f0087 / -  … 映画ちいかわ オリジナル・サウンドトラック
--   1cc6df15 / ad2ca52d / -  … CHIIKAWA INTERIOR TOTE BAG BOOK
--   c6ab12bb / 338683e3 / -  … ちいかわパーク フラッグ ヘアバンド
--   13bfae5e / b699950a / 宮  … ハイキュー!! FOR YOU!アクリルスタンドプレート
--   bfe62b56 / f2d064dd / 岩泉 一  … ハイキュー!! アクリルスタンド-横断幕第1弾
--   0d754e5a / 387198ba / 進藤ヒカル  … ヒカルの碁 くいくい
--   677fa690 / 3786518a / -  … 名探偵コナン アクリルスタンド きゃらくてぃぶ秋
--   6a1b2fef / 4f9fdfa0 / 安室透  … 名探偵コナン ダイカットステッカー
--   c07d4848 / d5a34123 / -  … 神の雫 Blu-ray BOX 下巻
--
-- 外す側は消さずに pool = 1（このリポジトリの重複の扱い）。外す側にしか無い購入リンク・予約の期間と時刻・値段・メモ・画像・
-- いいね・カレンダーへの追加・スタンプ・ピンした日は、残す側へ写してから外す。何度流しても同じ結果（PGlite で2回流して確認）。
--
-- ⚠️ 本番のデータを書き換えるので、PR で見てもらってから流す。流したら PR にそう書く。

begin;

-- 1. 購入リンク（同じ URL は足さない。キャラ名の無いリンクには外す側のキャラ名を付ける）と、残す側に無い値だけを写す。
--    1つの残す側に外す側が複数あるので、1件ずつ順に写す（1回の update では同じ行に1件ぶんしか反映されないため）
do $$
declare p record;
begin
  for p in select * from (values
    ('c9516c0e-6365-4d88-90c9-d11ebfdb097d'::uuid, 'feca3a25-4cd2-40a6-b10d-e69afa276f7a'::uuid, '坤の剣A'),
    ('c9516c0e-6365-4d88-90c9-d11ebfdb097d'::uuid, '8b24800b-1f46-4bc5-a209-c50fd81b9c00'::uuid, '離の剣'),
    ('166cc00b-b9f4-4600-ba93-199da83f867d'::uuid, '4fd8e8c3-bee8-4509-bcec-99c8dff3753c'::uuid, null),
    ('17466163-0fa3-4d44-bd26-4541e06eca6d'::uuid, '2193f6a6-6011-4a3a-9d0a-6980f846a0fc'::uuid, null),
    ('1b741896-1517-496e-a4a7-93a42622796c'::uuid, 'a02c647f-afa0-4d86-b79d-d4deb2eeee48'::uuid, null),
    ('bb2147cf-6ec7-4ee9-8132-11f81d91cfc6'::uuid, '979d2b19-90ab-450e-a55f-9c5dc77998a8'::uuid, null),
    ('bb305b03-b6a0-49aa-944d-70a45c2f796f'::uuid, '614eefa1-72aa-4a43-a3a0-5dd09ec01456'::uuid, null),
    ('bb305b03-b6a0-49aa-944d-70a45c2f796f'::uuid, '7cd390e5-1297-4a58-9566-f3159695871d'::uuid, null),
    ('bb305b03-b6a0-49aa-944d-70a45c2f796f'::uuid, '1138c185-c741-4886-b34d-f7d16014efe0'::uuid, null),
    ('bb305b03-b6a0-49aa-944d-70a45c2f796f'::uuid, '510f8b35-fc9e-418d-bdd1-1b0c55a8e5cb'::uuid, null),
    ('bb305b03-b6a0-49aa-944d-70a45c2f796f'::uuid, '845897de-b41b-4fd2-9d1f-daf521150acd'::uuid, null),
    ('bb305b03-b6a0-49aa-944d-70a45c2f796f'::uuid, '0368887d-eb34-4170-b6d0-044885e16d29'::uuid, null),
    ('2e41df97-8700-40b6-93eb-30b3b2924f37'::uuid, 'fd9342d5-d1e3-41db-9e98-bad6da1f4712'::uuid, null),
    ('d6c31f7d-73f5-4f8f-bb1e-01f346d7ad47'::uuid, '23cc7bc3-a567-420b-a22d-2f9c277a93c5'::uuid, null),
    ('eca8c029-4c43-4a55-b026-3b249ec5ebc9'::uuid, '3bab3164-a09d-4cc2-9bba-332036d43670'::uuid, null),
    ('073d7ca1-8ba8-4149-bbba-c057ce0e7590'::uuid, 'c60a843b-4987-43d8-9a4f-edd8a1b7c239'::uuid, '爆豪 勝己'),
    ('9896225b-6ef8-4e35-bbf1-880ef247b734'::uuid, '4f918d21-89b8-4164-8426-889a17ac7ae5'::uuid, '相澤 消太'),
    ('f025879a-120d-4d81-94fb-2e25ea842840'::uuid, '09fcda65-4c87-489d-a853-0a2eb86ec53d'::uuid, null),
    ('91a321c9-30e3-41dc-ae5e-5c07edf459f6'::uuid, '1f0e361e-e262-453a-acce-bfa6c2199a34'::uuid, '爆豪 勝己'),
    ('91a321c9-30e3-41dc-ae5e-5c07edf459f6'::uuid, 'd5d027f5-3870-45f9-96cb-faa12a4fd8a0'::uuid, '相澤 消太'),
    ('cf21280a-4138-493e-8872-8d5e277c424f'::uuid, '21dcccd3-bf25-499b-8b95-1462818c8f11'::uuid, null),
    ('dfa12642-1610-42a0-bd9a-9cd57581f764'::uuid, 'f08c4136-740f-46af-b473-469968d739bc'::uuid, null),
    ('266d82a3-e4f9-408a-a3ca-434745c79905'::uuid, 'c857b957-f4f4-4f5a-9f06-ca58344a133c'::uuid, '相澤 消太'),
    ('266d82a3-e4f9-408a-a3ca-434745c79905'::uuid, '4a52e074-701f-47ce-b622-89fe036afbb1'::uuid, '轟 焦凍'),
    ('41c07fce-bfb2-4dc2-aa12-8a82737206fa'::uuid, 'b37dbf9c-ab75-4e4e-823f-8a465e48fb40'::uuid, null),
    ('84acdd26-a8b1-4bb2-9083-5fc609f83d2b'::uuid, '550008e2-dbe7-40c7-9ecf-c3d08cda3c41'::uuid, null),
    ('84acdd26-a8b1-4bb2-9083-5fc609f83d2b'::uuid, '4a3944ce-66b8-4c50-8a57-0ace33aa794e'::uuid, null),
    ('9874b76a-df23-4c9a-b5a4-9d7101992cec'::uuid, '9f6424c4-e0dd-4e7b-915f-84b08e2b8423'::uuid, '爆豪 勝己'),
    ('fcc86b0c-2833-43a0-a2e0-98d71e2118b0'::uuid, 'd8709f9d-12fa-493d-bc24-224df5914d0b'::uuid, null),
    ('e6698d70-3240-49a5-8cee-9417f896828a'::uuid, 'fd5ac6bf-317d-482e-86b7-302e2ee76f4a'::uuid, null),
    ('ff743c7f-ac44-47e3-a820-8baec9ac6eae'::uuid, 'd673c2f7-e96b-41b1-a8e6-72c31f890295'::uuid, null),
    ('e6cd9dcf-a71e-404d-a75f-b3941321e0c9'::uuid, '0fafd104-89a7-46f7-b5cb-351cdbf0df30'::uuid, '糸師 凛'),
    ('4e81b6ae-5c56-419d-8ece-ad2b5845400d'::uuid, '161c0773-20ca-4e4d-9c8a-52a08f2868fb'::uuid, null),
    ('3594bf94-6c12-4628-99bd-9bb7d2c0eb8e'::uuid, '1738f8d7-ae65-47fe-bcc6-d8d5f9a01b6b'::uuid, '糸師 冴'),
    ('3594bf94-6c12-4628-99bd-9bb7d2c0eb8e'::uuid, 'a6d2aa9a-dba0-4f1c-b4b5-61dc37d4f39a'::uuid, '潔 世一'),
    ('189017e8-7806-4af5-abbd-26ce078ce756'::uuid, 'fde128be-0260-411f-b4ed-d69cf8e3d4ea'::uuid, null),
    ('d6fb4c58-9650-4345-98bf-8e4a9d5220f6'::uuid, '29976997-1007-454e-9006-0a21081b9f83'::uuid, null),
    ('ae36bded-8726-49ca-9f3e-3f7b0f335183'::uuid, '309ed447-2fcb-4f02-b7c3-11af22c57832'::uuid, null),
    ('ae36bded-8726-49ca-9f3e-3f7b0f335183'::uuid, 'e5077f35-380a-4a1e-ac64-b29d192cd8a3'::uuid, null),
    ('ae36bded-8726-49ca-9f3e-3f7b0f335183'::uuid, 'e0ee55ab-80c1-4ec4-a528-99ee801cd9d1'::uuid, '凪 誠士郎'),
    ('ae36bded-8726-49ca-9f3e-3f7b0f335183'::uuid, 'f368abb3-9285-43a8-bed6-462802370a2b'::uuid, null),
    ('3ddb42a9-1eae-4f11-9ff9-552bb7108c44'::uuid, '77030a55-8da7-4928-b397-ae126694575f'::uuid, '潔 世一'),
    ('47b21ece-8bcd-4179-816e-36766c998c05'::uuid, '97576655-a07f-49b5-8a51-860136ccb65d'::uuid, null),
    ('6591ddff-12ae-4c83-b5fa-53c6ec8c8e42'::uuid, '702cdc74-ee96-43e7-9cfc-fbb6a780f9a5'::uuid, null),
    ('a54a59b3-a2ef-49d7-b16f-d28cf2695ffe'::uuid, '7978bed9-7531-4735-906c-9a745085dc83'::uuid, null),
    ('7d725b44-4255-4de2-9259-4a3254e062fc'::uuid, '7d93fc88-d73a-4d5c-8fd3-d4126d564f0b'::uuid, null),
    ('9dac67e2-0965-4d13-9ac3-1055bbdada31'::uuid, 'efb1ab7e-b0d8-4543-a090-39cb5a3e2097'::uuid, null),
    ('c1bb25bf-7a44-43d2-8262-401cf11944ec'::uuid, 'c00ea9f3-e9d3-4c09-9d7a-4fc454f1e80e'::uuid, null),
    ('35665b2f-6f32-493b-a1c4-9b41ea75a02b'::uuid, '217b01ea-cade-4187-b6dc-f98b5563d197'::uuid, null),
    ('35665b2f-6f32-493b-a1c4-9b41ea75a02b'::uuid, '0074cbef-47ea-4850-8499-4b1b3a3ecb6e'::uuid, null),
    ('35665b2f-6f32-493b-a1c4-9b41ea75a02b'::uuid, '0cdfb20f-7227-45f8-a99b-7214125a1b02'::uuid, null),
    ('01079454-2155-4309-a3cc-cb0b5191eac7'::uuid, '9122303a-be2e-41a7-a1e4-ac27778b85cd'::uuid, null),
    ('03b1d54a-7714-4c63-9442-a53d9af0aeec'::uuid, '811267ff-063e-4531-a177-04bc4601a2dd'::uuid, '虎杖 悠仁'),
    ('d45c2f80-9a4a-4b3d-bff0-670fed684241'::uuid, '44f6f027-52d9-401a-8ded-86aadbdd9c8b'::uuid, null),
    ('4ab80aa9-53a7-48fc-82b5-4f017d2b4276'::uuid, 'eae07e08-5fa4-4864-b964-a65425b2fb4a'::uuid, null),
    ('b3ffd85e-07b0-45a3-8e28-1cb79d1bcf7e'::uuid, 'df7e9432-c706-4512-868e-6295fcf08d7d'::uuid, '脹相'),
    ('52012eb9-a822-4d62-b392-1180e4b06bca'::uuid, '968ff611-a55d-4884-b8b0-eac5a036edf2'::uuid, '虎杖悠仁'),
    ('7d7e0309-6817-4400-b779-4ed057d20472'::uuid, '2f9b4b49-3f51-4984-93b9-c36f5a5af959'::uuid, null),
    ('53dada02-77b9-4c40-ab2d-157b5b1e225f'::uuid, '5fd26dbb-f656-4a13-b708-4d83c450a4a1'::uuid, null),
    ('8c55eab5-de8a-4aeb-ac77-396d32244e4f'::uuid, '6bf727d5-c948-42a1-9c25-e5692b331833'::uuid, null),
    ('8c55eab5-de8a-4aeb-ac77-396d32244e4f'::uuid, 'abe2c588-d1aa-4e35-9bd5-c860f20fab5e'::uuid, null),
    ('7cfbc496-2342-4823-bf20-2bdfdcfb9ff0'::uuid, 'e9050453-9671-4e6c-b940-d5480ae67977'::uuid, null),
    ('dbeb3c34-1f7f-4296-b5f6-2807c5f611d0'::uuid, 'a319b23a-d42d-451a-b2e6-8b2d132cc7c2'::uuid, 'リヴァイ'),
    ('c77970a9-199a-473b-af9e-80d0328bdacf'::uuid, 'bf428ffb-074c-4cec-bb9a-cb43b7a2e28c'::uuid, null),
    ('19c3f96b-7275-4f1c-a7bd-9262dbfb9a6d'::uuid, '642f0087-8ec7-4601-9a84-4ea51b2fccd2'::uuid, null),
    ('1cc6df15-cc1b-44fe-8f30-6a5d40919fbf'::uuid, 'ad2ca52d-88a1-4bf3-99ab-6a9a4185c981'::uuid, null),
    ('c6ab12bb-6ded-488e-af67-2492d3ab6486'::uuid, '338683e3-3025-47c0-904d-b378071c1f6f'::uuid, null),
    ('13bfae5e-477e-41da-829d-5883f34f7693'::uuid, 'b699950a-410c-4e59-9ca1-a55ca44aeb7d'::uuid, '宮'),
    ('bfe62b56-a44a-412f-b433-ea130cfd9c9e'::uuid, 'f2d064dd-5ed0-46ec-934b-c519bc34469d'::uuid, '岩泉 一'),
    ('0d754e5a-b8ac-4be0-9173-7b65b2716bcf'::uuid, '387198ba-1c8f-4966-bd9a-75c8ef2f0429'::uuid, '進藤ヒカル'),
    ('677fa690-5b6c-4417-8b04-7ad086b8dac5'::uuid, '3786518a-c12a-4a6f-82f0-69de32f80047'::uuid, null),
    ('6a1b2fef-b16d-490e-b482-9ac11074af4c'::uuid, '4f9fdfa0-1d2a-423c-b735-67784dd752a8'::uuid, '安室透'),
    ('c07d4848-c420-4c6d-bcd2-28c1cec2b972'::uuid, 'd5a34123-036f-4231-98cb-2cfbdd162eb0'::uuid, null)) as t(keep_id, drop_id, label)
  loop
    update public.events k
       set offers = k.offers || coalesce((
             select jsonb_agg(case when p.label is null or coalesce(o->>'label', '') <> '' then o else o || jsonb_build_object('label', p.label) end)
               from jsonb_array_elements(d.offers) o
              where not exists (select 1 from jsonb_array_elements(k.offers) x where x->>'url' = o->>'url')), '[]'::jsonb),
           price               = coalesce(k.price, d.price),
           link_url            = coalesce(k.link_url, d.link_url),
           memo                = coalesce(nullif(k.memo, ''), d.memo),
           image_url           = coalesce(k.image_url, d.image_url),
           is_order_made       = coalesce(k.is_order_made, false) or coalesce(d.is_order_made, false),
           preorder_start_date = coalesce(k.preorder_start_date, d.preorder_start_date),
           preorder_end_date   = coalesce(k.preorder_end_date, d.preorder_end_date),
           preorder_start_time = coalesce(k.preorder_start_time, d.preorder_start_time),
           preorder_end_time   = coalesce(k.preorder_end_time, d.preorder_end_time)
      from public.events d
     where k.id = p.keep_id and d.id = p.drop_id and d.pool = 0;
  end loop;
end $$;

-- 2. いいね・カレンダーへの追加・スタンプ・ピンした日を残す側へ（同じ人が両方に付けていれば1つにする）
with dedupe_pairs(keep_id, drop_id, label) as (values
    ('c9516c0e-6365-4d88-90c9-d11ebfdb097d'::uuid, 'feca3a25-4cd2-40a6-b10d-e69afa276f7a'::uuid, '坤の剣A'),
    ('c9516c0e-6365-4d88-90c9-d11ebfdb097d'::uuid, '8b24800b-1f46-4bc5-a209-c50fd81b9c00'::uuid, '離の剣'),
    ('166cc00b-b9f4-4600-ba93-199da83f867d'::uuid, '4fd8e8c3-bee8-4509-bcec-99c8dff3753c'::uuid, null),
    ('17466163-0fa3-4d44-bd26-4541e06eca6d'::uuid, '2193f6a6-6011-4a3a-9d0a-6980f846a0fc'::uuid, null),
    ('1b741896-1517-496e-a4a7-93a42622796c'::uuid, 'a02c647f-afa0-4d86-b79d-d4deb2eeee48'::uuid, null),
    ('bb2147cf-6ec7-4ee9-8132-11f81d91cfc6'::uuid, '979d2b19-90ab-450e-a55f-9c5dc77998a8'::uuid, null),
    ('bb305b03-b6a0-49aa-944d-70a45c2f796f'::uuid, '614eefa1-72aa-4a43-a3a0-5dd09ec01456'::uuid, null),
    ('bb305b03-b6a0-49aa-944d-70a45c2f796f'::uuid, '7cd390e5-1297-4a58-9566-f3159695871d'::uuid, null),
    ('bb305b03-b6a0-49aa-944d-70a45c2f796f'::uuid, '1138c185-c741-4886-b34d-f7d16014efe0'::uuid, null),
    ('bb305b03-b6a0-49aa-944d-70a45c2f796f'::uuid, '510f8b35-fc9e-418d-bdd1-1b0c55a8e5cb'::uuid, null),
    ('bb305b03-b6a0-49aa-944d-70a45c2f796f'::uuid, '845897de-b41b-4fd2-9d1f-daf521150acd'::uuid, null),
    ('bb305b03-b6a0-49aa-944d-70a45c2f796f'::uuid, '0368887d-eb34-4170-b6d0-044885e16d29'::uuid, null),
    ('2e41df97-8700-40b6-93eb-30b3b2924f37'::uuid, 'fd9342d5-d1e3-41db-9e98-bad6da1f4712'::uuid, null),
    ('d6c31f7d-73f5-4f8f-bb1e-01f346d7ad47'::uuid, '23cc7bc3-a567-420b-a22d-2f9c277a93c5'::uuid, null),
    ('eca8c029-4c43-4a55-b026-3b249ec5ebc9'::uuid, '3bab3164-a09d-4cc2-9bba-332036d43670'::uuid, null),
    ('073d7ca1-8ba8-4149-bbba-c057ce0e7590'::uuid, 'c60a843b-4987-43d8-9a4f-edd8a1b7c239'::uuid, '爆豪 勝己'),
    ('9896225b-6ef8-4e35-bbf1-880ef247b734'::uuid, '4f918d21-89b8-4164-8426-889a17ac7ae5'::uuid, '相澤 消太'),
    ('f025879a-120d-4d81-94fb-2e25ea842840'::uuid, '09fcda65-4c87-489d-a853-0a2eb86ec53d'::uuid, null),
    ('91a321c9-30e3-41dc-ae5e-5c07edf459f6'::uuid, '1f0e361e-e262-453a-acce-bfa6c2199a34'::uuid, '爆豪 勝己'),
    ('91a321c9-30e3-41dc-ae5e-5c07edf459f6'::uuid, 'd5d027f5-3870-45f9-96cb-faa12a4fd8a0'::uuid, '相澤 消太'),
    ('cf21280a-4138-493e-8872-8d5e277c424f'::uuid, '21dcccd3-bf25-499b-8b95-1462818c8f11'::uuid, null),
    ('dfa12642-1610-42a0-bd9a-9cd57581f764'::uuid, 'f08c4136-740f-46af-b473-469968d739bc'::uuid, null),
    ('266d82a3-e4f9-408a-a3ca-434745c79905'::uuid, 'c857b957-f4f4-4f5a-9f06-ca58344a133c'::uuid, '相澤 消太'),
    ('266d82a3-e4f9-408a-a3ca-434745c79905'::uuid, '4a52e074-701f-47ce-b622-89fe036afbb1'::uuid, '轟 焦凍'),
    ('41c07fce-bfb2-4dc2-aa12-8a82737206fa'::uuid, 'b37dbf9c-ab75-4e4e-823f-8a465e48fb40'::uuid, null),
    ('84acdd26-a8b1-4bb2-9083-5fc609f83d2b'::uuid, '550008e2-dbe7-40c7-9ecf-c3d08cda3c41'::uuid, null),
    ('84acdd26-a8b1-4bb2-9083-5fc609f83d2b'::uuid, '4a3944ce-66b8-4c50-8a57-0ace33aa794e'::uuid, null),
    ('9874b76a-df23-4c9a-b5a4-9d7101992cec'::uuid, '9f6424c4-e0dd-4e7b-915f-84b08e2b8423'::uuid, '爆豪 勝己'),
    ('fcc86b0c-2833-43a0-a2e0-98d71e2118b0'::uuid, 'd8709f9d-12fa-493d-bc24-224df5914d0b'::uuid, null),
    ('e6698d70-3240-49a5-8cee-9417f896828a'::uuid, 'fd5ac6bf-317d-482e-86b7-302e2ee76f4a'::uuid, null),
    ('ff743c7f-ac44-47e3-a820-8baec9ac6eae'::uuid, 'd673c2f7-e96b-41b1-a8e6-72c31f890295'::uuid, null),
    ('e6cd9dcf-a71e-404d-a75f-b3941321e0c9'::uuid, '0fafd104-89a7-46f7-b5cb-351cdbf0df30'::uuid, '糸師 凛'),
    ('4e81b6ae-5c56-419d-8ece-ad2b5845400d'::uuid, '161c0773-20ca-4e4d-9c8a-52a08f2868fb'::uuid, null),
    ('3594bf94-6c12-4628-99bd-9bb7d2c0eb8e'::uuid, '1738f8d7-ae65-47fe-bcc6-d8d5f9a01b6b'::uuid, '糸師 冴'),
    ('3594bf94-6c12-4628-99bd-9bb7d2c0eb8e'::uuid, 'a6d2aa9a-dba0-4f1c-b4b5-61dc37d4f39a'::uuid, '潔 世一'),
    ('189017e8-7806-4af5-abbd-26ce078ce756'::uuid, 'fde128be-0260-411f-b4ed-d69cf8e3d4ea'::uuid, null),
    ('d6fb4c58-9650-4345-98bf-8e4a9d5220f6'::uuid, '29976997-1007-454e-9006-0a21081b9f83'::uuid, null),
    ('ae36bded-8726-49ca-9f3e-3f7b0f335183'::uuid, '309ed447-2fcb-4f02-b7c3-11af22c57832'::uuid, null),
    ('ae36bded-8726-49ca-9f3e-3f7b0f335183'::uuid, 'e5077f35-380a-4a1e-ac64-b29d192cd8a3'::uuid, null),
    ('ae36bded-8726-49ca-9f3e-3f7b0f335183'::uuid, 'e0ee55ab-80c1-4ec4-a528-99ee801cd9d1'::uuid, '凪 誠士郎'),
    ('ae36bded-8726-49ca-9f3e-3f7b0f335183'::uuid, 'f368abb3-9285-43a8-bed6-462802370a2b'::uuid, null),
    ('3ddb42a9-1eae-4f11-9ff9-552bb7108c44'::uuid, '77030a55-8da7-4928-b397-ae126694575f'::uuid, '潔 世一'),
    ('47b21ece-8bcd-4179-816e-36766c998c05'::uuid, '97576655-a07f-49b5-8a51-860136ccb65d'::uuid, null),
    ('6591ddff-12ae-4c83-b5fa-53c6ec8c8e42'::uuid, '702cdc74-ee96-43e7-9cfc-fbb6a780f9a5'::uuid, null),
    ('a54a59b3-a2ef-49d7-b16f-d28cf2695ffe'::uuid, '7978bed9-7531-4735-906c-9a745085dc83'::uuid, null),
    ('7d725b44-4255-4de2-9259-4a3254e062fc'::uuid, '7d93fc88-d73a-4d5c-8fd3-d4126d564f0b'::uuid, null),
    ('9dac67e2-0965-4d13-9ac3-1055bbdada31'::uuid, 'efb1ab7e-b0d8-4543-a090-39cb5a3e2097'::uuid, null),
    ('c1bb25bf-7a44-43d2-8262-401cf11944ec'::uuid, 'c00ea9f3-e9d3-4c09-9d7a-4fc454f1e80e'::uuid, null),
    ('35665b2f-6f32-493b-a1c4-9b41ea75a02b'::uuid, '217b01ea-cade-4187-b6dc-f98b5563d197'::uuid, null),
    ('35665b2f-6f32-493b-a1c4-9b41ea75a02b'::uuid, '0074cbef-47ea-4850-8499-4b1b3a3ecb6e'::uuid, null),
    ('35665b2f-6f32-493b-a1c4-9b41ea75a02b'::uuid, '0cdfb20f-7227-45f8-a99b-7214125a1b02'::uuid, null),
    ('01079454-2155-4309-a3cc-cb0b5191eac7'::uuid, '9122303a-be2e-41a7-a1e4-ac27778b85cd'::uuid, null),
    ('03b1d54a-7714-4c63-9442-a53d9af0aeec'::uuid, '811267ff-063e-4531-a177-04bc4601a2dd'::uuid, '虎杖 悠仁'),
    ('d45c2f80-9a4a-4b3d-bff0-670fed684241'::uuid, '44f6f027-52d9-401a-8ded-86aadbdd9c8b'::uuid, null),
    ('4ab80aa9-53a7-48fc-82b5-4f017d2b4276'::uuid, 'eae07e08-5fa4-4864-b964-a65425b2fb4a'::uuid, null),
    ('b3ffd85e-07b0-45a3-8e28-1cb79d1bcf7e'::uuid, 'df7e9432-c706-4512-868e-6295fcf08d7d'::uuid, '脹相'),
    ('52012eb9-a822-4d62-b392-1180e4b06bca'::uuid, '968ff611-a55d-4884-b8b0-eac5a036edf2'::uuid, '虎杖悠仁'),
    ('7d7e0309-6817-4400-b779-4ed057d20472'::uuid, '2f9b4b49-3f51-4984-93b9-c36f5a5af959'::uuid, null),
    ('53dada02-77b9-4c40-ab2d-157b5b1e225f'::uuid, '5fd26dbb-f656-4a13-b708-4d83c450a4a1'::uuid, null),
    ('8c55eab5-de8a-4aeb-ac77-396d32244e4f'::uuid, '6bf727d5-c948-42a1-9c25-e5692b331833'::uuid, null),
    ('8c55eab5-de8a-4aeb-ac77-396d32244e4f'::uuid, 'abe2c588-d1aa-4e35-9bd5-c860f20fab5e'::uuid, null),
    ('7cfbc496-2342-4823-bf20-2bdfdcfb9ff0'::uuid, 'e9050453-9671-4e6c-b940-d5480ae67977'::uuid, null),
    ('dbeb3c34-1f7f-4296-b5f6-2807c5f611d0'::uuid, 'a319b23a-d42d-451a-b2e6-8b2d132cc7c2'::uuid, 'リヴァイ'),
    ('c77970a9-199a-473b-af9e-80d0328bdacf'::uuid, 'bf428ffb-074c-4cec-bb9a-cb43b7a2e28c'::uuid, null),
    ('19c3f96b-7275-4f1c-a7bd-9262dbfb9a6d'::uuid, '642f0087-8ec7-4601-9a84-4ea51b2fccd2'::uuid, null),
    ('1cc6df15-cc1b-44fe-8f30-6a5d40919fbf'::uuid, 'ad2ca52d-88a1-4bf3-99ab-6a9a4185c981'::uuid, null),
    ('c6ab12bb-6ded-488e-af67-2492d3ab6486'::uuid, '338683e3-3025-47c0-904d-b378071c1f6f'::uuid, null),
    ('13bfae5e-477e-41da-829d-5883f34f7693'::uuid, 'b699950a-410c-4e59-9ca1-a55ca44aeb7d'::uuid, '宮'),
    ('bfe62b56-a44a-412f-b433-ea130cfd9c9e'::uuid, 'f2d064dd-5ed0-46ec-934b-c519bc34469d'::uuid, '岩泉 一'),
    ('0d754e5a-b8ac-4be0-9173-7b65b2716bcf'::uuid, '387198ba-1c8f-4966-bd9a-75c8ef2f0429'::uuid, '進藤ヒカル'),
    ('677fa690-5b6c-4417-8b04-7ad086b8dac5'::uuid, '3786518a-c12a-4a6f-82f0-69de32f80047'::uuid, null),
    ('6a1b2fef-b16d-490e-b482-9ac11074af4c'::uuid, '4f9fdfa0-1d2a-423c-b735-67784dd752a8'::uuid, '安室透'),
    ('c07d4848-c420-4c6d-bcd2-28c1cec2b972'::uuid, 'd5a34123-036f-4231-98cb-2cfbdd162eb0'::uuid, null))
insert into public.likes (event_id, user_id)
select distinct p.keep_id, l.user_id from dedupe_pairs p join public.likes l on l.event_id = p.drop_id
 where not exists (select 1 from public.likes k where k.event_id = p.keep_id and k.user_id = l.user_id);

with dedupe_pairs(keep_id, drop_id, label) as (values
    ('c9516c0e-6365-4d88-90c9-d11ebfdb097d'::uuid, 'feca3a25-4cd2-40a6-b10d-e69afa276f7a'::uuid, '坤の剣A'),
    ('c9516c0e-6365-4d88-90c9-d11ebfdb097d'::uuid, '8b24800b-1f46-4bc5-a209-c50fd81b9c00'::uuid, '離の剣'),
    ('166cc00b-b9f4-4600-ba93-199da83f867d'::uuid, '4fd8e8c3-bee8-4509-bcec-99c8dff3753c'::uuid, null),
    ('17466163-0fa3-4d44-bd26-4541e06eca6d'::uuid, '2193f6a6-6011-4a3a-9d0a-6980f846a0fc'::uuid, null),
    ('1b741896-1517-496e-a4a7-93a42622796c'::uuid, 'a02c647f-afa0-4d86-b79d-d4deb2eeee48'::uuid, null),
    ('bb2147cf-6ec7-4ee9-8132-11f81d91cfc6'::uuid, '979d2b19-90ab-450e-a55f-9c5dc77998a8'::uuid, null),
    ('bb305b03-b6a0-49aa-944d-70a45c2f796f'::uuid, '614eefa1-72aa-4a43-a3a0-5dd09ec01456'::uuid, null),
    ('bb305b03-b6a0-49aa-944d-70a45c2f796f'::uuid, '7cd390e5-1297-4a58-9566-f3159695871d'::uuid, null),
    ('bb305b03-b6a0-49aa-944d-70a45c2f796f'::uuid, '1138c185-c741-4886-b34d-f7d16014efe0'::uuid, null),
    ('bb305b03-b6a0-49aa-944d-70a45c2f796f'::uuid, '510f8b35-fc9e-418d-bdd1-1b0c55a8e5cb'::uuid, null),
    ('bb305b03-b6a0-49aa-944d-70a45c2f796f'::uuid, '845897de-b41b-4fd2-9d1f-daf521150acd'::uuid, null),
    ('bb305b03-b6a0-49aa-944d-70a45c2f796f'::uuid, '0368887d-eb34-4170-b6d0-044885e16d29'::uuid, null),
    ('2e41df97-8700-40b6-93eb-30b3b2924f37'::uuid, 'fd9342d5-d1e3-41db-9e98-bad6da1f4712'::uuid, null),
    ('d6c31f7d-73f5-4f8f-bb1e-01f346d7ad47'::uuid, '23cc7bc3-a567-420b-a22d-2f9c277a93c5'::uuid, null),
    ('eca8c029-4c43-4a55-b026-3b249ec5ebc9'::uuid, '3bab3164-a09d-4cc2-9bba-332036d43670'::uuid, null),
    ('073d7ca1-8ba8-4149-bbba-c057ce0e7590'::uuid, 'c60a843b-4987-43d8-9a4f-edd8a1b7c239'::uuid, '爆豪 勝己'),
    ('9896225b-6ef8-4e35-bbf1-880ef247b734'::uuid, '4f918d21-89b8-4164-8426-889a17ac7ae5'::uuid, '相澤 消太'),
    ('f025879a-120d-4d81-94fb-2e25ea842840'::uuid, '09fcda65-4c87-489d-a853-0a2eb86ec53d'::uuid, null),
    ('91a321c9-30e3-41dc-ae5e-5c07edf459f6'::uuid, '1f0e361e-e262-453a-acce-bfa6c2199a34'::uuid, '爆豪 勝己'),
    ('91a321c9-30e3-41dc-ae5e-5c07edf459f6'::uuid, 'd5d027f5-3870-45f9-96cb-faa12a4fd8a0'::uuid, '相澤 消太'),
    ('cf21280a-4138-493e-8872-8d5e277c424f'::uuid, '21dcccd3-bf25-499b-8b95-1462818c8f11'::uuid, null),
    ('dfa12642-1610-42a0-bd9a-9cd57581f764'::uuid, 'f08c4136-740f-46af-b473-469968d739bc'::uuid, null),
    ('266d82a3-e4f9-408a-a3ca-434745c79905'::uuid, 'c857b957-f4f4-4f5a-9f06-ca58344a133c'::uuid, '相澤 消太'),
    ('266d82a3-e4f9-408a-a3ca-434745c79905'::uuid, '4a52e074-701f-47ce-b622-89fe036afbb1'::uuid, '轟 焦凍'),
    ('41c07fce-bfb2-4dc2-aa12-8a82737206fa'::uuid, 'b37dbf9c-ab75-4e4e-823f-8a465e48fb40'::uuid, null),
    ('84acdd26-a8b1-4bb2-9083-5fc609f83d2b'::uuid, '550008e2-dbe7-40c7-9ecf-c3d08cda3c41'::uuid, null),
    ('84acdd26-a8b1-4bb2-9083-5fc609f83d2b'::uuid, '4a3944ce-66b8-4c50-8a57-0ace33aa794e'::uuid, null),
    ('9874b76a-df23-4c9a-b5a4-9d7101992cec'::uuid, '9f6424c4-e0dd-4e7b-915f-84b08e2b8423'::uuid, '爆豪 勝己'),
    ('fcc86b0c-2833-43a0-a2e0-98d71e2118b0'::uuid, 'd8709f9d-12fa-493d-bc24-224df5914d0b'::uuid, null),
    ('e6698d70-3240-49a5-8cee-9417f896828a'::uuid, 'fd5ac6bf-317d-482e-86b7-302e2ee76f4a'::uuid, null),
    ('ff743c7f-ac44-47e3-a820-8baec9ac6eae'::uuid, 'd673c2f7-e96b-41b1-a8e6-72c31f890295'::uuid, null),
    ('e6cd9dcf-a71e-404d-a75f-b3941321e0c9'::uuid, '0fafd104-89a7-46f7-b5cb-351cdbf0df30'::uuid, '糸師 凛'),
    ('4e81b6ae-5c56-419d-8ece-ad2b5845400d'::uuid, '161c0773-20ca-4e4d-9c8a-52a08f2868fb'::uuid, null),
    ('3594bf94-6c12-4628-99bd-9bb7d2c0eb8e'::uuid, '1738f8d7-ae65-47fe-bcc6-d8d5f9a01b6b'::uuid, '糸師 冴'),
    ('3594bf94-6c12-4628-99bd-9bb7d2c0eb8e'::uuid, 'a6d2aa9a-dba0-4f1c-b4b5-61dc37d4f39a'::uuid, '潔 世一'),
    ('189017e8-7806-4af5-abbd-26ce078ce756'::uuid, 'fde128be-0260-411f-b4ed-d69cf8e3d4ea'::uuid, null),
    ('d6fb4c58-9650-4345-98bf-8e4a9d5220f6'::uuid, '29976997-1007-454e-9006-0a21081b9f83'::uuid, null),
    ('ae36bded-8726-49ca-9f3e-3f7b0f335183'::uuid, '309ed447-2fcb-4f02-b7c3-11af22c57832'::uuid, null),
    ('ae36bded-8726-49ca-9f3e-3f7b0f335183'::uuid, 'e5077f35-380a-4a1e-ac64-b29d192cd8a3'::uuid, null),
    ('ae36bded-8726-49ca-9f3e-3f7b0f335183'::uuid, 'e0ee55ab-80c1-4ec4-a528-99ee801cd9d1'::uuid, '凪 誠士郎'),
    ('ae36bded-8726-49ca-9f3e-3f7b0f335183'::uuid, 'f368abb3-9285-43a8-bed6-462802370a2b'::uuid, null),
    ('3ddb42a9-1eae-4f11-9ff9-552bb7108c44'::uuid, '77030a55-8da7-4928-b397-ae126694575f'::uuid, '潔 世一'),
    ('47b21ece-8bcd-4179-816e-36766c998c05'::uuid, '97576655-a07f-49b5-8a51-860136ccb65d'::uuid, null),
    ('6591ddff-12ae-4c83-b5fa-53c6ec8c8e42'::uuid, '702cdc74-ee96-43e7-9cfc-fbb6a780f9a5'::uuid, null),
    ('a54a59b3-a2ef-49d7-b16f-d28cf2695ffe'::uuid, '7978bed9-7531-4735-906c-9a745085dc83'::uuid, null),
    ('7d725b44-4255-4de2-9259-4a3254e062fc'::uuid, '7d93fc88-d73a-4d5c-8fd3-d4126d564f0b'::uuid, null),
    ('9dac67e2-0965-4d13-9ac3-1055bbdada31'::uuid, 'efb1ab7e-b0d8-4543-a090-39cb5a3e2097'::uuid, null),
    ('c1bb25bf-7a44-43d2-8262-401cf11944ec'::uuid, 'c00ea9f3-e9d3-4c09-9d7a-4fc454f1e80e'::uuid, null),
    ('35665b2f-6f32-493b-a1c4-9b41ea75a02b'::uuid, '217b01ea-cade-4187-b6dc-f98b5563d197'::uuid, null),
    ('35665b2f-6f32-493b-a1c4-9b41ea75a02b'::uuid, '0074cbef-47ea-4850-8499-4b1b3a3ecb6e'::uuid, null),
    ('35665b2f-6f32-493b-a1c4-9b41ea75a02b'::uuid, '0cdfb20f-7227-45f8-a99b-7214125a1b02'::uuid, null),
    ('01079454-2155-4309-a3cc-cb0b5191eac7'::uuid, '9122303a-be2e-41a7-a1e4-ac27778b85cd'::uuid, null),
    ('03b1d54a-7714-4c63-9442-a53d9af0aeec'::uuid, '811267ff-063e-4531-a177-04bc4601a2dd'::uuid, '虎杖 悠仁'),
    ('d45c2f80-9a4a-4b3d-bff0-670fed684241'::uuid, '44f6f027-52d9-401a-8ded-86aadbdd9c8b'::uuid, null),
    ('4ab80aa9-53a7-48fc-82b5-4f017d2b4276'::uuid, 'eae07e08-5fa4-4864-b964-a65425b2fb4a'::uuid, null),
    ('b3ffd85e-07b0-45a3-8e28-1cb79d1bcf7e'::uuid, 'df7e9432-c706-4512-868e-6295fcf08d7d'::uuid, '脹相'),
    ('52012eb9-a822-4d62-b392-1180e4b06bca'::uuid, '968ff611-a55d-4884-b8b0-eac5a036edf2'::uuid, '虎杖悠仁'),
    ('7d7e0309-6817-4400-b779-4ed057d20472'::uuid, '2f9b4b49-3f51-4984-93b9-c36f5a5af959'::uuid, null),
    ('53dada02-77b9-4c40-ab2d-157b5b1e225f'::uuid, '5fd26dbb-f656-4a13-b708-4d83c450a4a1'::uuid, null),
    ('8c55eab5-de8a-4aeb-ac77-396d32244e4f'::uuid, '6bf727d5-c948-42a1-9c25-e5692b331833'::uuid, null),
    ('8c55eab5-de8a-4aeb-ac77-396d32244e4f'::uuid, 'abe2c588-d1aa-4e35-9bd5-c860f20fab5e'::uuid, null),
    ('7cfbc496-2342-4823-bf20-2bdfdcfb9ff0'::uuid, 'e9050453-9671-4e6c-b940-d5480ae67977'::uuid, null),
    ('dbeb3c34-1f7f-4296-b5f6-2807c5f611d0'::uuid, 'a319b23a-d42d-451a-b2e6-8b2d132cc7c2'::uuid, 'リヴァイ'),
    ('c77970a9-199a-473b-af9e-80d0328bdacf'::uuid, 'bf428ffb-074c-4cec-bb9a-cb43b7a2e28c'::uuid, null),
    ('19c3f96b-7275-4f1c-a7bd-9262dbfb9a6d'::uuid, '642f0087-8ec7-4601-9a84-4ea51b2fccd2'::uuid, null),
    ('1cc6df15-cc1b-44fe-8f30-6a5d40919fbf'::uuid, 'ad2ca52d-88a1-4bf3-99ab-6a9a4185c981'::uuid, null),
    ('c6ab12bb-6ded-488e-af67-2492d3ab6486'::uuid, '338683e3-3025-47c0-904d-b378071c1f6f'::uuid, null),
    ('13bfae5e-477e-41da-829d-5883f34f7693'::uuid, 'b699950a-410c-4e59-9ca1-a55ca44aeb7d'::uuid, '宮'),
    ('bfe62b56-a44a-412f-b433-ea130cfd9c9e'::uuid, 'f2d064dd-5ed0-46ec-934b-c519bc34469d'::uuid, '岩泉 一'),
    ('0d754e5a-b8ac-4be0-9173-7b65b2716bcf'::uuid, '387198ba-1c8f-4966-bd9a-75c8ef2f0429'::uuid, '進藤ヒカル'),
    ('677fa690-5b6c-4417-8b04-7ad086b8dac5'::uuid, '3786518a-c12a-4a6f-82f0-69de32f80047'::uuid, null),
    ('6a1b2fef-b16d-490e-b482-9ac11074af4c'::uuid, '4f9fdfa0-1d2a-423c-b735-67784dd752a8'::uuid, '安室透'),
    ('c07d4848-c420-4c6d-bcd2-28c1cec2b972'::uuid, 'd5a34123-036f-4231-98cb-2cfbdd162eb0'::uuid, null))
insert into public.calendar_adds (event_id, user_id)
select p.keep_id, c.user_id from dedupe_pairs p join public.calendar_adds c on c.event_id = p.drop_id
on conflict (event_id, user_id) do nothing;

with dedupe_pairs(keep_id, drop_id, label) as (values
    ('c9516c0e-6365-4d88-90c9-d11ebfdb097d'::uuid, 'feca3a25-4cd2-40a6-b10d-e69afa276f7a'::uuid, '坤の剣A'),
    ('c9516c0e-6365-4d88-90c9-d11ebfdb097d'::uuid, '8b24800b-1f46-4bc5-a209-c50fd81b9c00'::uuid, '離の剣'),
    ('166cc00b-b9f4-4600-ba93-199da83f867d'::uuid, '4fd8e8c3-bee8-4509-bcec-99c8dff3753c'::uuid, null),
    ('17466163-0fa3-4d44-bd26-4541e06eca6d'::uuid, '2193f6a6-6011-4a3a-9d0a-6980f846a0fc'::uuid, null),
    ('1b741896-1517-496e-a4a7-93a42622796c'::uuid, 'a02c647f-afa0-4d86-b79d-d4deb2eeee48'::uuid, null),
    ('bb2147cf-6ec7-4ee9-8132-11f81d91cfc6'::uuid, '979d2b19-90ab-450e-a55f-9c5dc77998a8'::uuid, null),
    ('bb305b03-b6a0-49aa-944d-70a45c2f796f'::uuid, '614eefa1-72aa-4a43-a3a0-5dd09ec01456'::uuid, null),
    ('bb305b03-b6a0-49aa-944d-70a45c2f796f'::uuid, '7cd390e5-1297-4a58-9566-f3159695871d'::uuid, null),
    ('bb305b03-b6a0-49aa-944d-70a45c2f796f'::uuid, '1138c185-c741-4886-b34d-f7d16014efe0'::uuid, null),
    ('bb305b03-b6a0-49aa-944d-70a45c2f796f'::uuid, '510f8b35-fc9e-418d-bdd1-1b0c55a8e5cb'::uuid, null),
    ('bb305b03-b6a0-49aa-944d-70a45c2f796f'::uuid, '845897de-b41b-4fd2-9d1f-daf521150acd'::uuid, null),
    ('bb305b03-b6a0-49aa-944d-70a45c2f796f'::uuid, '0368887d-eb34-4170-b6d0-044885e16d29'::uuid, null),
    ('2e41df97-8700-40b6-93eb-30b3b2924f37'::uuid, 'fd9342d5-d1e3-41db-9e98-bad6da1f4712'::uuid, null),
    ('d6c31f7d-73f5-4f8f-bb1e-01f346d7ad47'::uuid, '23cc7bc3-a567-420b-a22d-2f9c277a93c5'::uuid, null),
    ('eca8c029-4c43-4a55-b026-3b249ec5ebc9'::uuid, '3bab3164-a09d-4cc2-9bba-332036d43670'::uuid, null),
    ('073d7ca1-8ba8-4149-bbba-c057ce0e7590'::uuid, 'c60a843b-4987-43d8-9a4f-edd8a1b7c239'::uuid, '爆豪 勝己'),
    ('9896225b-6ef8-4e35-bbf1-880ef247b734'::uuid, '4f918d21-89b8-4164-8426-889a17ac7ae5'::uuid, '相澤 消太'),
    ('f025879a-120d-4d81-94fb-2e25ea842840'::uuid, '09fcda65-4c87-489d-a853-0a2eb86ec53d'::uuid, null),
    ('91a321c9-30e3-41dc-ae5e-5c07edf459f6'::uuid, '1f0e361e-e262-453a-acce-bfa6c2199a34'::uuid, '爆豪 勝己'),
    ('91a321c9-30e3-41dc-ae5e-5c07edf459f6'::uuid, 'd5d027f5-3870-45f9-96cb-faa12a4fd8a0'::uuid, '相澤 消太'),
    ('cf21280a-4138-493e-8872-8d5e277c424f'::uuid, '21dcccd3-bf25-499b-8b95-1462818c8f11'::uuid, null),
    ('dfa12642-1610-42a0-bd9a-9cd57581f764'::uuid, 'f08c4136-740f-46af-b473-469968d739bc'::uuid, null),
    ('266d82a3-e4f9-408a-a3ca-434745c79905'::uuid, 'c857b957-f4f4-4f5a-9f06-ca58344a133c'::uuid, '相澤 消太'),
    ('266d82a3-e4f9-408a-a3ca-434745c79905'::uuid, '4a52e074-701f-47ce-b622-89fe036afbb1'::uuid, '轟 焦凍'),
    ('41c07fce-bfb2-4dc2-aa12-8a82737206fa'::uuid, 'b37dbf9c-ab75-4e4e-823f-8a465e48fb40'::uuid, null),
    ('84acdd26-a8b1-4bb2-9083-5fc609f83d2b'::uuid, '550008e2-dbe7-40c7-9ecf-c3d08cda3c41'::uuid, null),
    ('84acdd26-a8b1-4bb2-9083-5fc609f83d2b'::uuid, '4a3944ce-66b8-4c50-8a57-0ace33aa794e'::uuid, null),
    ('9874b76a-df23-4c9a-b5a4-9d7101992cec'::uuid, '9f6424c4-e0dd-4e7b-915f-84b08e2b8423'::uuid, '爆豪 勝己'),
    ('fcc86b0c-2833-43a0-a2e0-98d71e2118b0'::uuid, 'd8709f9d-12fa-493d-bc24-224df5914d0b'::uuid, null),
    ('e6698d70-3240-49a5-8cee-9417f896828a'::uuid, 'fd5ac6bf-317d-482e-86b7-302e2ee76f4a'::uuid, null),
    ('ff743c7f-ac44-47e3-a820-8baec9ac6eae'::uuid, 'd673c2f7-e96b-41b1-a8e6-72c31f890295'::uuid, null),
    ('e6cd9dcf-a71e-404d-a75f-b3941321e0c9'::uuid, '0fafd104-89a7-46f7-b5cb-351cdbf0df30'::uuid, '糸師 凛'),
    ('4e81b6ae-5c56-419d-8ece-ad2b5845400d'::uuid, '161c0773-20ca-4e4d-9c8a-52a08f2868fb'::uuid, null),
    ('3594bf94-6c12-4628-99bd-9bb7d2c0eb8e'::uuid, '1738f8d7-ae65-47fe-bcc6-d8d5f9a01b6b'::uuid, '糸師 冴'),
    ('3594bf94-6c12-4628-99bd-9bb7d2c0eb8e'::uuid, 'a6d2aa9a-dba0-4f1c-b4b5-61dc37d4f39a'::uuid, '潔 世一'),
    ('189017e8-7806-4af5-abbd-26ce078ce756'::uuid, 'fde128be-0260-411f-b4ed-d69cf8e3d4ea'::uuid, null),
    ('d6fb4c58-9650-4345-98bf-8e4a9d5220f6'::uuid, '29976997-1007-454e-9006-0a21081b9f83'::uuid, null),
    ('ae36bded-8726-49ca-9f3e-3f7b0f335183'::uuid, '309ed447-2fcb-4f02-b7c3-11af22c57832'::uuid, null),
    ('ae36bded-8726-49ca-9f3e-3f7b0f335183'::uuid, 'e5077f35-380a-4a1e-ac64-b29d192cd8a3'::uuid, null),
    ('ae36bded-8726-49ca-9f3e-3f7b0f335183'::uuid, 'e0ee55ab-80c1-4ec4-a528-99ee801cd9d1'::uuid, '凪 誠士郎'),
    ('ae36bded-8726-49ca-9f3e-3f7b0f335183'::uuid, 'f368abb3-9285-43a8-bed6-462802370a2b'::uuid, null),
    ('3ddb42a9-1eae-4f11-9ff9-552bb7108c44'::uuid, '77030a55-8da7-4928-b397-ae126694575f'::uuid, '潔 世一'),
    ('47b21ece-8bcd-4179-816e-36766c998c05'::uuid, '97576655-a07f-49b5-8a51-860136ccb65d'::uuid, null),
    ('6591ddff-12ae-4c83-b5fa-53c6ec8c8e42'::uuid, '702cdc74-ee96-43e7-9cfc-fbb6a780f9a5'::uuid, null),
    ('a54a59b3-a2ef-49d7-b16f-d28cf2695ffe'::uuid, '7978bed9-7531-4735-906c-9a745085dc83'::uuid, null),
    ('7d725b44-4255-4de2-9259-4a3254e062fc'::uuid, '7d93fc88-d73a-4d5c-8fd3-d4126d564f0b'::uuid, null),
    ('9dac67e2-0965-4d13-9ac3-1055bbdada31'::uuid, 'efb1ab7e-b0d8-4543-a090-39cb5a3e2097'::uuid, null),
    ('c1bb25bf-7a44-43d2-8262-401cf11944ec'::uuid, 'c00ea9f3-e9d3-4c09-9d7a-4fc454f1e80e'::uuid, null),
    ('35665b2f-6f32-493b-a1c4-9b41ea75a02b'::uuid, '217b01ea-cade-4187-b6dc-f98b5563d197'::uuid, null),
    ('35665b2f-6f32-493b-a1c4-9b41ea75a02b'::uuid, '0074cbef-47ea-4850-8499-4b1b3a3ecb6e'::uuid, null),
    ('35665b2f-6f32-493b-a1c4-9b41ea75a02b'::uuid, '0cdfb20f-7227-45f8-a99b-7214125a1b02'::uuid, null),
    ('01079454-2155-4309-a3cc-cb0b5191eac7'::uuid, '9122303a-be2e-41a7-a1e4-ac27778b85cd'::uuid, null),
    ('03b1d54a-7714-4c63-9442-a53d9af0aeec'::uuid, '811267ff-063e-4531-a177-04bc4601a2dd'::uuid, '虎杖 悠仁'),
    ('d45c2f80-9a4a-4b3d-bff0-670fed684241'::uuid, '44f6f027-52d9-401a-8ded-86aadbdd9c8b'::uuid, null),
    ('4ab80aa9-53a7-48fc-82b5-4f017d2b4276'::uuid, 'eae07e08-5fa4-4864-b964-a65425b2fb4a'::uuid, null),
    ('b3ffd85e-07b0-45a3-8e28-1cb79d1bcf7e'::uuid, 'df7e9432-c706-4512-868e-6295fcf08d7d'::uuid, '脹相'),
    ('52012eb9-a822-4d62-b392-1180e4b06bca'::uuid, '968ff611-a55d-4884-b8b0-eac5a036edf2'::uuid, '虎杖悠仁'),
    ('7d7e0309-6817-4400-b779-4ed057d20472'::uuid, '2f9b4b49-3f51-4984-93b9-c36f5a5af959'::uuid, null),
    ('53dada02-77b9-4c40-ab2d-157b5b1e225f'::uuid, '5fd26dbb-f656-4a13-b708-4d83c450a4a1'::uuid, null),
    ('8c55eab5-de8a-4aeb-ac77-396d32244e4f'::uuid, '6bf727d5-c948-42a1-9c25-e5692b331833'::uuid, null),
    ('8c55eab5-de8a-4aeb-ac77-396d32244e4f'::uuid, 'abe2c588-d1aa-4e35-9bd5-c860f20fab5e'::uuid, null),
    ('7cfbc496-2342-4823-bf20-2bdfdcfb9ff0'::uuid, 'e9050453-9671-4e6c-b940-d5480ae67977'::uuid, null),
    ('dbeb3c34-1f7f-4296-b5f6-2807c5f611d0'::uuid, 'a319b23a-d42d-451a-b2e6-8b2d132cc7c2'::uuid, 'リヴァイ'),
    ('c77970a9-199a-473b-af9e-80d0328bdacf'::uuid, 'bf428ffb-074c-4cec-bb9a-cb43b7a2e28c'::uuid, null),
    ('19c3f96b-7275-4f1c-a7bd-9262dbfb9a6d'::uuid, '642f0087-8ec7-4601-9a84-4ea51b2fccd2'::uuid, null),
    ('1cc6df15-cc1b-44fe-8f30-6a5d40919fbf'::uuid, 'ad2ca52d-88a1-4bf3-99ab-6a9a4185c981'::uuid, null),
    ('c6ab12bb-6ded-488e-af67-2492d3ab6486'::uuid, '338683e3-3025-47c0-904d-b378071c1f6f'::uuid, null),
    ('13bfae5e-477e-41da-829d-5883f34f7693'::uuid, 'b699950a-410c-4e59-9ca1-a55ca44aeb7d'::uuid, '宮'),
    ('bfe62b56-a44a-412f-b433-ea130cfd9c9e'::uuid, 'f2d064dd-5ed0-46ec-934b-c519bc34469d'::uuid, '岩泉 一'),
    ('0d754e5a-b8ac-4be0-9173-7b65b2716bcf'::uuid, '387198ba-1c8f-4966-bd9a-75c8ef2f0429'::uuid, '進藤ヒカル'),
    ('677fa690-5b6c-4417-8b04-7ad086b8dac5'::uuid, '3786518a-c12a-4a6f-82f0-69de32f80047'::uuid, null),
    ('6a1b2fef-b16d-490e-b482-9ac11074af4c'::uuid, '4f9fdfa0-1d2a-423c-b735-67784dd752a8'::uuid, '安室透'),
    ('c07d4848-c420-4c6d-bcd2-28c1cec2b972'::uuid, 'd5a34123-036f-4231-98cb-2cfbdd162eb0'::uuid, null))
insert into public.event_stamps (event_id, user_id, stamp)
select p.keep_id, s.user_id, s.stamp from dedupe_pairs p join public.event_stamps s on s.event_id = p.drop_id
on conflict do nothing;

with dedupe_pairs(keep_id, drop_id, label) as (values
    ('c9516c0e-6365-4d88-90c9-d11ebfdb097d'::uuid, 'feca3a25-4cd2-40a6-b10d-e69afa276f7a'::uuid, '坤の剣A'),
    ('c9516c0e-6365-4d88-90c9-d11ebfdb097d'::uuid, '8b24800b-1f46-4bc5-a209-c50fd81b9c00'::uuid, '離の剣'),
    ('166cc00b-b9f4-4600-ba93-199da83f867d'::uuid, '4fd8e8c3-bee8-4509-bcec-99c8dff3753c'::uuid, null),
    ('17466163-0fa3-4d44-bd26-4541e06eca6d'::uuid, '2193f6a6-6011-4a3a-9d0a-6980f846a0fc'::uuid, null),
    ('1b741896-1517-496e-a4a7-93a42622796c'::uuid, 'a02c647f-afa0-4d86-b79d-d4deb2eeee48'::uuid, null),
    ('bb2147cf-6ec7-4ee9-8132-11f81d91cfc6'::uuid, '979d2b19-90ab-450e-a55f-9c5dc77998a8'::uuid, null),
    ('bb305b03-b6a0-49aa-944d-70a45c2f796f'::uuid, '614eefa1-72aa-4a43-a3a0-5dd09ec01456'::uuid, null),
    ('bb305b03-b6a0-49aa-944d-70a45c2f796f'::uuid, '7cd390e5-1297-4a58-9566-f3159695871d'::uuid, null),
    ('bb305b03-b6a0-49aa-944d-70a45c2f796f'::uuid, '1138c185-c741-4886-b34d-f7d16014efe0'::uuid, null),
    ('bb305b03-b6a0-49aa-944d-70a45c2f796f'::uuid, '510f8b35-fc9e-418d-bdd1-1b0c55a8e5cb'::uuid, null),
    ('bb305b03-b6a0-49aa-944d-70a45c2f796f'::uuid, '845897de-b41b-4fd2-9d1f-daf521150acd'::uuid, null),
    ('bb305b03-b6a0-49aa-944d-70a45c2f796f'::uuid, '0368887d-eb34-4170-b6d0-044885e16d29'::uuid, null),
    ('2e41df97-8700-40b6-93eb-30b3b2924f37'::uuid, 'fd9342d5-d1e3-41db-9e98-bad6da1f4712'::uuid, null),
    ('d6c31f7d-73f5-4f8f-bb1e-01f346d7ad47'::uuid, '23cc7bc3-a567-420b-a22d-2f9c277a93c5'::uuid, null),
    ('eca8c029-4c43-4a55-b026-3b249ec5ebc9'::uuid, '3bab3164-a09d-4cc2-9bba-332036d43670'::uuid, null),
    ('073d7ca1-8ba8-4149-bbba-c057ce0e7590'::uuid, 'c60a843b-4987-43d8-9a4f-edd8a1b7c239'::uuid, '爆豪 勝己'),
    ('9896225b-6ef8-4e35-bbf1-880ef247b734'::uuid, '4f918d21-89b8-4164-8426-889a17ac7ae5'::uuid, '相澤 消太'),
    ('f025879a-120d-4d81-94fb-2e25ea842840'::uuid, '09fcda65-4c87-489d-a853-0a2eb86ec53d'::uuid, null),
    ('91a321c9-30e3-41dc-ae5e-5c07edf459f6'::uuid, '1f0e361e-e262-453a-acce-bfa6c2199a34'::uuid, '爆豪 勝己'),
    ('91a321c9-30e3-41dc-ae5e-5c07edf459f6'::uuid, 'd5d027f5-3870-45f9-96cb-faa12a4fd8a0'::uuid, '相澤 消太'),
    ('cf21280a-4138-493e-8872-8d5e277c424f'::uuid, '21dcccd3-bf25-499b-8b95-1462818c8f11'::uuid, null),
    ('dfa12642-1610-42a0-bd9a-9cd57581f764'::uuid, 'f08c4136-740f-46af-b473-469968d739bc'::uuid, null),
    ('266d82a3-e4f9-408a-a3ca-434745c79905'::uuid, 'c857b957-f4f4-4f5a-9f06-ca58344a133c'::uuid, '相澤 消太'),
    ('266d82a3-e4f9-408a-a3ca-434745c79905'::uuid, '4a52e074-701f-47ce-b622-89fe036afbb1'::uuid, '轟 焦凍'),
    ('41c07fce-bfb2-4dc2-aa12-8a82737206fa'::uuid, 'b37dbf9c-ab75-4e4e-823f-8a465e48fb40'::uuid, null),
    ('84acdd26-a8b1-4bb2-9083-5fc609f83d2b'::uuid, '550008e2-dbe7-40c7-9ecf-c3d08cda3c41'::uuid, null),
    ('84acdd26-a8b1-4bb2-9083-5fc609f83d2b'::uuid, '4a3944ce-66b8-4c50-8a57-0ace33aa794e'::uuid, null),
    ('9874b76a-df23-4c9a-b5a4-9d7101992cec'::uuid, '9f6424c4-e0dd-4e7b-915f-84b08e2b8423'::uuid, '爆豪 勝己'),
    ('fcc86b0c-2833-43a0-a2e0-98d71e2118b0'::uuid, 'd8709f9d-12fa-493d-bc24-224df5914d0b'::uuid, null),
    ('e6698d70-3240-49a5-8cee-9417f896828a'::uuid, 'fd5ac6bf-317d-482e-86b7-302e2ee76f4a'::uuid, null),
    ('ff743c7f-ac44-47e3-a820-8baec9ac6eae'::uuid, 'd673c2f7-e96b-41b1-a8e6-72c31f890295'::uuid, null),
    ('e6cd9dcf-a71e-404d-a75f-b3941321e0c9'::uuid, '0fafd104-89a7-46f7-b5cb-351cdbf0df30'::uuid, '糸師 凛'),
    ('4e81b6ae-5c56-419d-8ece-ad2b5845400d'::uuid, '161c0773-20ca-4e4d-9c8a-52a08f2868fb'::uuid, null),
    ('3594bf94-6c12-4628-99bd-9bb7d2c0eb8e'::uuid, '1738f8d7-ae65-47fe-bcc6-d8d5f9a01b6b'::uuid, '糸師 冴'),
    ('3594bf94-6c12-4628-99bd-9bb7d2c0eb8e'::uuid, 'a6d2aa9a-dba0-4f1c-b4b5-61dc37d4f39a'::uuid, '潔 世一'),
    ('189017e8-7806-4af5-abbd-26ce078ce756'::uuid, 'fde128be-0260-411f-b4ed-d69cf8e3d4ea'::uuid, null),
    ('d6fb4c58-9650-4345-98bf-8e4a9d5220f6'::uuid, '29976997-1007-454e-9006-0a21081b9f83'::uuid, null),
    ('ae36bded-8726-49ca-9f3e-3f7b0f335183'::uuid, '309ed447-2fcb-4f02-b7c3-11af22c57832'::uuid, null),
    ('ae36bded-8726-49ca-9f3e-3f7b0f335183'::uuid, 'e5077f35-380a-4a1e-ac64-b29d192cd8a3'::uuid, null),
    ('ae36bded-8726-49ca-9f3e-3f7b0f335183'::uuid, 'e0ee55ab-80c1-4ec4-a528-99ee801cd9d1'::uuid, '凪 誠士郎'),
    ('ae36bded-8726-49ca-9f3e-3f7b0f335183'::uuid, 'f368abb3-9285-43a8-bed6-462802370a2b'::uuid, null),
    ('3ddb42a9-1eae-4f11-9ff9-552bb7108c44'::uuid, '77030a55-8da7-4928-b397-ae126694575f'::uuid, '潔 世一'),
    ('47b21ece-8bcd-4179-816e-36766c998c05'::uuid, '97576655-a07f-49b5-8a51-860136ccb65d'::uuid, null),
    ('6591ddff-12ae-4c83-b5fa-53c6ec8c8e42'::uuid, '702cdc74-ee96-43e7-9cfc-fbb6a780f9a5'::uuid, null),
    ('a54a59b3-a2ef-49d7-b16f-d28cf2695ffe'::uuid, '7978bed9-7531-4735-906c-9a745085dc83'::uuid, null),
    ('7d725b44-4255-4de2-9259-4a3254e062fc'::uuid, '7d93fc88-d73a-4d5c-8fd3-d4126d564f0b'::uuid, null),
    ('9dac67e2-0965-4d13-9ac3-1055bbdada31'::uuid, 'efb1ab7e-b0d8-4543-a090-39cb5a3e2097'::uuid, null),
    ('c1bb25bf-7a44-43d2-8262-401cf11944ec'::uuid, 'c00ea9f3-e9d3-4c09-9d7a-4fc454f1e80e'::uuid, null),
    ('35665b2f-6f32-493b-a1c4-9b41ea75a02b'::uuid, '217b01ea-cade-4187-b6dc-f98b5563d197'::uuid, null),
    ('35665b2f-6f32-493b-a1c4-9b41ea75a02b'::uuid, '0074cbef-47ea-4850-8499-4b1b3a3ecb6e'::uuid, null),
    ('35665b2f-6f32-493b-a1c4-9b41ea75a02b'::uuid, '0cdfb20f-7227-45f8-a99b-7214125a1b02'::uuid, null),
    ('01079454-2155-4309-a3cc-cb0b5191eac7'::uuid, '9122303a-be2e-41a7-a1e4-ac27778b85cd'::uuid, null),
    ('03b1d54a-7714-4c63-9442-a53d9af0aeec'::uuid, '811267ff-063e-4531-a177-04bc4601a2dd'::uuid, '虎杖 悠仁'),
    ('d45c2f80-9a4a-4b3d-bff0-670fed684241'::uuid, '44f6f027-52d9-401a-8ded-86aadbdd9c8b'::uuid, null),
    ('4ab80aa9-53a7-48fc-82b5-4f017d2b4276'::uuid, 'eae07e08-5fa4-4864-b964-a65425b2fb4a'::uuid, null),
    ('b3ffd85e-07b0-45a3-8e28-1cb79d1bcf7e'::uuid, 'df7e9432-c706-4512-868e-6295fcf08d7d'::uuid, '脹相'),
    ('52012eb9-a822-4d62-b392-1180e4b06bca'::uuid, '968ff611-a55d-4884-b8b0-eac5a036edf2'::uuid, '虎杖悠仁'),
    ('7d7e0309-6817-4400-b779-4ed057d20472'::uuid, '2f9b4b49-3f51-4984-93b9-c36f5a5af959'::uuid, null),
    ('53dada02-77b9-4c40-ab2d-157b5b1e225f'::uuid, '5fd26dbb-f656-4a13-b708-4d83c450a4a1'::uuid, null),
    ('8c55eab5-de8a-4aeb-ac77-396d32244e4f'::uuid, '6bf727d5-c948-42a1-9c25-e5692b331833'::uuid, null),
    ('8c55eab5-de8a-4aeb-ac77-396d32244e4f'::uuid, 'abe2c588-d1aa-4e35-9bd5-c860f20fab5e'::uuid, null),
    ('7cfbc496-2342-4823-bf20-2bdfdcfb9ff0'::uuid, 'e9050453-9671-4e6c-b940-d5480ae67977'::uuid, null),
    ('dbeb3c34-1f7f-4296-b5f6-2807c5f611d0'::uuid, 'a319b23a-d42d-451a-b2e6-8b2d132cc7c2'::uuid, 'リヴァイ'),
    ('c77970a9-199a-473b-af9e-80d0328bdacf'::uuid, 'bf428ffb-074c-4cec-bb9a-cb43b7a2e28c'::uuid, null),
    ('19c3f96b-7275-4f1c-a7bd-9262dbfb9a6d'::uuid, '642f0087-8ec7-4601-9a84-4ea51b2fccd2'::uuid, null),
    ('1cc6df15-cc1b-44fe-8f30-6a5d40919fbf'::uuid, 'ad2ca52d-88a1-4bf3-99ab-6a9a4185c981'::uuid, null),
    ('c6ab12bb-6ded-488e-af67-2492d3ab6486'::uuid, '338683e3-3025-47c0-904d-b378071c1f6f'::uuid, null),
    ('13bfae5e-477e-41da-829d-5883f34f7693'::uuid, 'b699950a-410c-4e59-9ca1-a55ca44aeb7d'::uuid, '宮'),
    ('bfe62b56-a44a-412f-b433-ea130cfd9c9e'::uuid, 'f2d064dd-5ed0-46ec-934b-c519bc34469d'::uuid, '岩泉 一'),
    ('0d754e5a-b8ac-4be0-9173-7b65b2716bcf'::uuid, '387198ba-1c8f-4966-bd9a-75c8ef2f0429'::uuid, '進藤ヒカル'),
    ('677fa690-5b6c-4417-8b04-7ad086b8dac5'::uuid, '3786518a-c12a-4a6f-82f0-69de32f80047'::uuid, null),
    ('6a1b2fef-b16d-490e-b482-9ac11074af4c'::uuid, '4f9fdfa0-1d2a-423c-b735-67784dd752a8'::uuid, '安室透'),
    ('c07d4848-c420-4c6d-bcd2-28c1cec2b972'::uuid, 'd5a34123-036f-4231-98cb-2cfbdd162eb0'::uuid, null))
insert into public.event_visits (event_id, user_id, start_date, end_date)
select p.keep_id, v.user_id, v.start_date, v.end_date from dedupe_pairs p join public.event_visits v on v.event_id = p.drop_id
 where not exists (select 1 from public.event_visits k
                    where k.event_id = p.keep_id and k.user_id = v.user_id and k.start_date = v.start_date and k.end_date = v.end_date);

-- 3. 外す（一覧・カレンダー・集計は pool = 0 だけを見る）
with dedupe_pairs(keep_id, drop_id, label) as (values
    ('c9516c0e-6365-4d88-90c9-d11ebfdb097d'::uuid, 'feca3a25-4cd2-40a6-b10d-e69afa276f7a'::uuid, '坤の剣A'),
    ('c9516c0e-6365-4d88-90c9-d11ebfdb097d'::uuid, '8b24800b-1f46-4bc5-a209-c50fd81b9c00'::uuid, '離の剣'),
    ('166cc00b-b9f4-4600-ba93-199da83f867d'::uuid, '4fd8e8c3-bee8-4509-bcec-99c8dff3753c'::uuid, null),
    ('17466163-0fa3-4d44-bd26-4541e06eca6d'::uuid, '2193f6a6-6011-4a3a-9d0a-6980f846a0fc'::uuid, null),
    ('1b741896-1517-496e-a4a7-93a42622796c'::uuid, 'a02c647f-afa0-4d86-b79d-d4deb2eeee48'::uuid, null),
    ('bb2147cf-6ec7-4ee9-8132-11f81d91cfc6'::uuid, '979d2b19-90ab-450e-a55f-9c5dc77998a8'::uuid, null),
    ('bb305b03-b6a0-49aa-944d-70a45c2f796f'::uuid, '614eefa1-72aa-4a43-a3a0-5dd09ec01456'::uuid, null),
    ('bb305b03-b6a0-49aa-944d-70a45c2f796f'::uuid, '7cd390e5-1297-4a58-9566-f3159695871d'::uuid, null),
    ('bb305b03-b6a0-49aa-944d-70a45c2f796f'::uuid, '1138c185-c741-4886-b34d-f7d16014efe0'::uuid, null),
    ('bb305b03-b6a0-49aa-944d-70a45c2f796f'::uuid, '510f8b35-fc9e-418d-bdd1-1b0c55a8e5cb'::uuid, null),
    ('bb305b03-b6a0-49aa-944d-70a45c2f796f'::uuid, '845897de-b41b-4fd2-9d1f-daf521150acd'::uuid, null),
    ('bb305b03-b6a0-49aa-944d-70a45c2f796f'::uuid, '0368887d-eb34-4170-b6d0-044885e16d29'::uuid, null),
    ('2e41df97-8700-40b6-93eb-30b3b2924f37'::uuid, 'fd9342d5-d1e3-41db-9e98-bad6da1f4712'::uuid, null),
    ('d6c31f7d-73f5-4f8f-bb1e-01f346d7ad47'::uuid, '23cc7bc3-a567-420b-a22d-2f9c277a93c5'::uuid, null),
    ('eca8c029-4c43-4a55-b026-3b249ec5ebc9'::uuid, '3bab3164-a09d-4cc2-9bba-332036d43670'::uuid, null),
    ('073d7ca1-8ba8-4149-bbba-c057ce0e7590'::uuid, 'c60a843b-4987-43d8-9a4f-edd8a1b7c239'::uuid, '爆豪 勝己'),
    ('9896225b-6ef8-4e35-bbf1-880ef247b734'::uuid, '4f918d21-89b8-4164-8426-889a17ac7ae5'::uuid, '相澤 消太'),
    ('f025879a-120d-4d81-94fb-2e25ea842840'::uuid, '09fcda65-4c87-489d-a853-0a2eb86ec53d'::uuid, null),
    ('91a321c9-30e3-41dc-ae5e-5c07edf459f6'::uuid, '1f0e361e-e262-453a-acce-bfa6c2199a34'::uuid, '爆豪 勝己'),
    ('91a321c9-30e3-41dc-ae5e-5c07edf459f6'::uuid, 'd5d027f5-3870-45f9-96cb-faa12a4fd8a0'::uuid, '相澤 消太'),
    ('cf21280a-4138-493e-8872-8d5e277c424f'::uuid, '21dcccd3-bf25-499b-8b95-1462818c8f11'::uuid, null),
    ('dfa12642-1610-42a0-bd9a-9cd57581f764'::uuid, 'f08c4136-740f-46af-b473-469968d739bc'::uuid, null),
    ('266d82a3-e4f9-408a-a3ca-434745c79905'::uuid, 'c857b957-f4f4-4f5a-9f06-ca58344a133c'::uuid, '相澤 消太'),
    ('266d82a3-e4f9-408a-a3ca-434745c79905'::uuid, '4a52e074-701f-47ce-b622-89fe036afbb1'::uuid, '轟 焦凍'),
    ('41c07fce-bfb2-4dc2-aa12-8a82737206fa'::uuid, 'b37dbf9c-ab75-4e4e-823f-8a465e48fb40'::uuid, null),
    ('84acdd26-a8b1-4bb2-9083-5fc609f83d2b'::uuid, '550008e2-dbe7-40c7-9ecf-c3d08cda3c41'::uuid, null),
    ('84acdd26-a8b1-4bb2-9083-5fc609f83d2b'::uuid, '4a3944ce-66b8-4c50-8a57-0ace33aa794e'::uuid, null),
    ('9874b76a-df23-4c9a-b5a4-9d7101992cec'::uuid, '9f6424c4-e0dd-4e7b-915f-84b08e2b8423'::uuid, '爆豪 勝己'),
    ('fcc86b0c-2833-43a0-a2e0-98d71e2118b0'::uuid, 'd8709f9d-12fa-493d-bc24-224df5914d0b'::uuid, null),
    ('e6698d70-3240-49a5-8cee-9417f896828a'::uuid, 'fd5ac6bf-317d-482e-86b7-302e2ee76f4a'::uuid, null),
    ('ff743c7f-ac44-47e3-a820-8baec9ac6eae'::uuid, 'd673c2f7-e96b-41b1-a8e6-72c31f890295'::uuid, null),
    ('e6cd9dcf-a71e-404d-a75f-b3941321e0c9'::uuid, '0fafd104-89a7-46f7-b5cb-351cdbf0df30'::uuid, '糸師 凛'),
    ('4e81b6ae-5c56-419d-8ece-ad2b5845400d'::uuid, '161c0773-20ca-4e4d-9c8a-52a08f2868fb'::uuid, null),
    ('3594bf94-6c12-4628-99bd-9bb7d2c0eb8e'::uuid, '1738f8d7-ae65-47fe-bcc6-d8d5f9a01b6b'::uuid, '糸師 冴'),
    ('3594bf94-6c12-4628-99bd-9bb7d2c0eb8e'::uuid, 'a6d2aa9a-dba0-4f1c-b4b5-61dc37d4f39a'::uuid, '潔 世一'),
    ('189017e8-7806-4af5-abbd-26ce078ce756'::uuid, 'fde128be-0260-411f-b4ed-d69cf8e3d4ea'::uuid, null),
    ('d6fb4c58-9650-4345-98bf-8e4a9d5220f6'::uuid, '29976997-1007-454e-9006-0a21081b9f83'::uuid, null),
    ('ae36bded-8726-49ca-9f3e-3f7b0f335183'::uuid, '309ed447-2fcb-4f02-b7c3-11af22c57832'::uuid, null),
    ('ae36bded-8726-49ca-9f3e-3f7b0f335183'::uuid, 'e5077f35-380a-4a1e-ac64-b29d192cd8a3'::uuid, null),
    ('ae36bded-8726-49ca-9f3e-3f7b0f335183'::uuid, 'e0ee55ab-80c1-4ec4-a528-99ee801cd9d1'::uuid, '凪 誠士郎'),
    ('ae36bded-8726-49ca-9f3e-3f7b0f335183'::uuid, 'f368abb3-9285-43a8-bed6-462802370a2b'::uuid, null),
    ('3ddb42a9-1eae-4f11-9ff9-552bb7108c44'::uuid, '77030a55-8da7-4928-b397-ae126694575f'::uuid, '潔 世一'),
    ('47b21ece-8bcd-4179-816e-36766c998c05'::uuid, '97576655-a07f-49b5-8a51-860136ccb65d'::uuid, null),
    ('6591ddff-12ae-4c83-b5fa-53c6ec8c8e42'::uuid, '702cdc74-ee96-43e7-9cfc-fbb6a780f9a5'::uuid, null),
    ('a54a59b3-a2ef-49d7-b16f-d28cf2695ffe'::uuid, '7978bed9-7531-4735-906c-9a745085dc83'::uuid, null),
    ('7d725b44-4255-4de2-9259-4a3254e062fc'::uuid, '7d93fc88-d73a-4d5c-8fd3-d4126d564f0b'::uuid, null),
    ('9dac67e2-0965-4d13-9ac3-1055bbdada31'::uuid, 'efb1ab7e-b0d8-4543-a090-39cb5a3e2097'::uuid, null),
    ('c1bb25bf-7a44-43d2-8262-401cf11944ec'::uuid, 'c00ea9f3-e9d3-4c09-9d7a-4fc454f1e80e'::uuid, null),
    ('35665b2f-6f32-493b-a1c4-9b41ea75a02b'::uuid, '217b01ea-cade-4187-b6dc-f98b5563d197'::uuid, null),
    ('35665b2f-6f32-493b-a1c4-9b41ea75a02b'::uuid, '0074cbef-47ea-4850-8499-4b1b3a3ecb6e'::uuid, null),
    ('35665b2f-6f32-493b-a1c4-9b41ea75a02b'::uuid, '0cdfb20f-7227-45f8-a99b-7214125a1b02'::uuid, null),
    ('01079454-2155-4309-a3cc-cb0b5191eac7'::uuid, '9122303a-be2e-41a7-a1e4-ac27778b85cd'::uuid, null),
    ('03b1d54a-7714-4c63-9442-a53d9af0aeec'::uuid, '811267ff-063e-4531-a177-04bc4601a2dd'::uuid, '虎杖 悠仁'),
    ('d45c2f80-9a4a-4b3d-bff0-670fed684241'::uuid, '44f6f027-52d9-401a-8ded-86aadbdd9c8b'::uuid, null),
    ('4ab80aa9-53a7-48fc-82b5-4f017d2b4276'::uuid, 'eae07e08-5fa4-4864-b964-a65425b2fb4a'::uuid, null),
    ('b3ffd85e-07b0-45a3-8e28-1cb79d1bcf7e'::uuid, 'df7e9432-c706-4512-868e-6295fcf08d7d'::uuid, '脹相'),
    ('52012eb9-a822-4d62-b392-1180e4b06bca'::uuid, '968ff611-a55d-4884-b8b0-eac5a036edf2'::uuid, '虎杖悠仁'),
    ('7d7e0309-6817-4400-b779-4ed057d20472'::uuid, '2f9b4b49-3f51-4984-93b9-c36f5a5af959'::uuid, null),
    ('53dada02-77b9-4c40-ab2d-157b5b1e225f'::uuid, '5fd26dbb-f656-4a13-b708-4d83c450a4a1'::uuid, null),
    ('8c55eab5-de8a-4aeb-ac77-396d32244e4f'::uuid, '6bf727d5-c948-42a1-9c25-e5692b331833'::uuid, null),
    ('8c55eab5-de8a-4aeb-ac77-396d32244e4f'::uuid, 'abe2c588-d1aa-4e35-9bd5-c860f20fab5e'::uuid, null),
    ('7cfbc496-2342-4823-bf20-2bdfdcfb9ff0'::uuid, 'e9050453-9671-4e6c-b940-d5480ae67977'::uuid, null),
    ('dbeb3c34-1f7f-4296-b5f6-2807c5f611d0'::uuid, 'a319b23a-d42d-451a-b2e6-8b2d132cc7c2'::uuid, 'リヴァイ'),
    ('c77970a9-199a-473b-af9e-80d0328bdacf'::uuid, 'bf428ffb-074c-4cec-bb9a-cb43b7a2e28c'::uuid, null),
    ('19c3f96b-7275-4f1c-a7bd-9262dbfb9a6d'::uuid, '642f0087-8ec7-4601-9a84-4ea51b2fccd2'::uuid, null),
    ('1cc6df15-cc1b-44fe-8f30-6a5d40919fbf'::uuid, 'ad2ca52d-88a1-4bf3-99ab-6a9a4185c981'::uuid, null),
    ('c6ab12bb-6ded-488e-af67-2492d3ab6486'::uuid, '338683e3-3025-47c0-904d-b378071c1f6f'::uuid, null),
    ('13bfae5e-477e-41da-829d-5883f34f7693'::uuid, 'b699950a-410c-4e59-9ca1-a55ca44aeb7d'::uuid, '宮'),
    ('bfe62b56-a44a-412f-b433-ea130cfd9c9e'::uuid, 'f2d064dd-5ed0-46ec-934b-c519bc34469d'::uuid, '岩泉 一'),
    ('0d754e5a-b8ac-4be0-9173-7b65b2716bcf'::uuid, '387198ba-1c8f-4966-bd9a-75c8ef2f0429'::uuid, '進藤ヒカル'),
    ('677fa690-5b6c-4417-8b04-7ad086b8dac5'::uuid, '3786518a-c12a-4a6f-82f0-69de32f80047'::uuid, null),
    ('6a1b2fef-b16d-490e-b482-9ac11074af4c'::uuid, '4f9fdfa0-1d2a-423c-b735-67784dd752a8'::uuid, '安室透'),
    ('c07d4848-c420-4c6d-bcd2-28c1cec2b972'::uuid, 'd5a34123-036f-4231-98cb-2cfbdd162eb0'::uuid, null))
update public.events set pool = 1
 where id in (select drop_id from dedupe_pairs) and pool = 0;

commit;

-- 確認用（外す73件が pool = 1・残す57件が pool = 0）:
--   select pool, count(*) from events where id in ('feca3a25-4cd2-40a6-b10d-e69afa276f7a', '8b24800b-1f46-4bc5-a209-c50fd81b9c00', '4fd8e8c3-bee8-4509-bcec-99c8dff3753c', '2193f6a6-6011-4a3a-9d0a-6980f846a0fc', 'a02c647f-afa0-4d86-b79d-d4deb2eeee48', '979d2b19-90ab-450e-a55f-9c5dc77998a8', '614eefa1-72aa-4a43-a3a0-5dd09ec01456', '7cd390e5-1297-4a58-9566-f3159695871d', '1138c185-c741-4886-b34d-f7d16014efe0', '510f8b35-fc9e-418d-bdd1-1b0c55a8e5cb', '845897de-b41b-4fd2-9d1f-daf521150acd', '0368887d-eb34-4170-b6d0-044885e16d29', 'fd9342d5-d1e3-41db-9e98-bad6da1f4712', '23cc7bc3-a567-420b-a22d-2f9c277a93c5', '3bab3164-a09d-4cc2-9bba-332036d43670', 'c60a843b-4987-43d8-9a4f-edd8a1b7c239', '4f918d21-89b8-4164-8426-889a17ac7ae5', '09fcda65-4c87-489d-a853-0a2eb86ec53d', '1f0e361e-e262-453a-acce-bfa6c2199a34', 'd5d027f5-3870-45f9-96cb-faa12a4fd8a0', '21dcccd3-bf25-499b-8b95-1462818c8f11', 'f08c4136-740f-46af-b473-469968d739bc', 'c857b957-f4f4-4f5a-9f06-ca58344a133c', '4a52e074-701f-47ce-b622-89fe036afbb1', 'b37dbf9c-ab75-4e4e-823f-8a465e48fb40', '550008e2-dbe7-40c7-9ecf-c3d08cda3c41', '4a3944ce-66b8-4c50-8a57-0ace33aa794e', '9f6424c4-e0dd-4e7b-915f-84b08e2b8423', 'd8709f9d-12fa-493d-bc24-224df5914d0b', 'fd5ac6bf-317d-482e-86b7-302e2ee76f4a', 'd673c2f7-e96b-41b1-a8e6-72c31f890295', '0fafd104-89a7-46f7-b5cb-351cdbf0df30', '161c0773-20ca-4e4d-9c8a-52a08f2868fb', '1738f8d7-ae65-47fe-bcc6-d8d5f9a01b6b', 'a6d2aa9a-dba0-4f1c-b4b5-61dc37d4f39a', 'fde128be-0260-411f-b4ed-d69cf8e3d4ea', '29976997-1007-454e-9006-0a21081b9f83', '309ed447-2fcb-4f02-b7c3-11af22c57832', 'e5077f35-380a-4a1e-ac64-b29d192cd8a3', 'e0ee55ab-80c1-4ec4-a528-99ee801cd9d1', 'f368abb3-9285-43a8-bed6-462802370a2b', '77030a55-8da7-4928-b397-ae126694575f', '97576655-a07f-49b5-8a51-860136ccb65d', '702cdc74-ee96-43e7-9cfc-fbb6a780f9a5', '7978bed9-7531-4735-906c-9a745085dc83', '7d93fc88-d73a-4d5c-8fd3-d4126d564f0b', 'efb1ab7e-b0d8-4543-a090-39cb5a3e2097', 'c00ea9f3-e9d3-4c09-9d7a-4fc454f1e80e', '217b01ea-cade-4187-b6dc-f98b5563d197', '0074cbef-47ea-4850-8499-4b1b3a3ecb6e', '0cdfb20f-7227-45f8-a99b-7214125a1b02', '9122303a-be2e-41a7-a1e4-ac27778b85cd', '811267ff-063e-4531-a177-04bc4601a2dd', '44f6f027-52d9-401a-8ded-86aadbdd9c8b', 'eae07e08-5fa4-4864-b964-a65425b2fb4a', 'df7e9432-c706-4512-868e-6295fcf08d7d', '968ff611-a55d-4884-b8b0-eac5a036edf2', '2f9b4b49-3f51-4984-93b9-c36f5a5af959', '5fd26dbb-f656-4a13-b708-4d83c450a4a1', '6bf727d5-c948-42a1-9c25-e5692b331833', 'abe2c588-d1aa-4e35-9bd5-c860f20fab5e', 'e9050453-9671-4e6c-b940-d5480ae67977', 'a319b23a-d42d-451a-b2e6-8b2d132cc7c2', 'bf428ffb-074c-4cec-bb9a-cb43b7a2e28c', '642f0087-8ec7-4601-9a84-4ea51b2fccd2', 'ad2ca52d-88a1-4bf3-99ab-6a9a4185c981', '338683e3-3025-47c0-904d-b378071c1f6f', 'b699950a-410c-4e59-9ca1-a55ca44aeb7d', 'f2d064dd-5ed0-46ec-934b-c519bc34469d', '387198ba-1c8f-4966-bd9a-75c8ef2f0429', '3786518a-c12a-4a6f-82f0-69de32f80047', '4f9fdfa0-1d2a-423c-b735-67784dd752a8', 'd5a34123-036f-4231-98cb-2cfbdd162eb0', 'c9516c0e-6365-4d88-90c9-d11ebfdb097d', '166cc00b-b9f4-4600-ba93-199da83f867d', '17466163-0fa3-4d44-bd26-4541e06eca6d', '1b741896-1517-496e-a4a7-93a42622796c', 'bb2147cf-6ec7-4ee9-8132-11f81d91cfc6', 'bb305b03-b6a0-49aa-944d-70a45c2f796f', '2e41df97-8700-40b6-93eb-30b3b2924f37', 'd6c31f7d-73f5-4f8f-bb1e-01f346d7ad47', 'eca8c029-4c43-4a55-b026-3b249ec5ebc9', '073d7ca1-8ba8-4149-bbba-c057ce0e7590', '9896225b-6ef8-4e35-bbf1-880ef247b734', 'f025879a-120d-4d81-94fb-2e25ea842840', '91a321c9-30e3-41dc-ae5e-5c07edf459f6', 'cf21280a-4138-493e-8872-8d5e277c424f', 'dfa12642-1610-42a0-bd9a-9cd57581f764', '266d82a3-e4f9-408a-a3ca-434745c79905', '41c07fce-bfb2-4dc2-aa12-8a82737206fa', '84acdd26-a8b1-4bb2-9083-5fc609f83d2b', '9874b76a-df23-4c9a-b5a4-9d7101992cec', 'fcc86b0c-2833-43a0-a2e0-98d71e2118b0', 'e6698d70-3240-49a5-8cee-9417f896828a', 'ff743c7f-ac44-47e3-a820-8baec9ac6eae', 'e6cd9dcf-a71e-404d-a75f-b3941321e0c9', '4e81b6ae-5c56-419d-8ece-ad2b5845400d', '3594bf94-6c12-4628-99bd-9bb7d2c0eb8e', '189017e8-7806-4af5-abbd-26ce078ce756', 'd6fb4c58-9650-4345-98bf-8e4a9d5220f6', 'ae36bded-8726-49ca-9f3e-3f7b0f335183', '3ddb42a9-1eae-4f11-9ff9-552bb7108c44', '47b21ece-8bcd-4179-816e-36766c998c05', '6591ddff-12ae-4c83-b5fa-53c6ec8c8e42', 'a54a59b3-a2ef-49d7-b16f-d28cf2695ffe', '7d725b44-4255-4de2-9259-4a3254e062fc', '9dac67e2-0965-4d13-9ac3-1055bbdada31', 'c1bb25bf-7a44-43d2-8262-401cf11944ec', '35665b2f-6f32-493b-a1c4-9b41ea75a02b', '01079454-2155-4309-a3cc-cb0b5191eac7', '03b1d54a-7714-4c63-9442-a53d9af0aeec', 'd45c2f80-9a4a-4b3d-bff0-670fed684241', '4ab80aa9-53a7-48fc-82b5-4f017d2b4276', 'b3ffd85e-07b0-45a3-8e28-1cb79d1bcf7e', '52012eb9-a822-4d62-b392-1180e4b06bca', '7d7e0309-6817-4400-b779-4ed057d20472', '53dada02-77b9-4c40-ab2d-157b5b1e225f', '8c55eab5-de8a-4aeb-ac77-396d32244e4f', '7cfbc496-2342-4823-bf20-2bdfdcfb9ff0', 'dbeb3c34-1f7f-4296-b5f6-2807c5f611d0', 'c77970a9-199a-473b-af9e-80d0328bdacf', '19c3f96b-7275-4f1c-a7bd-9262dbfb9a6d', '1cc6df15-cc1b-44fe-8f30-6a5d40919fbf', 'c6ab12bb-6ded-488e-af67-2492d3ab6486', '13bfae5e-477e-41da-829d-5883f34f7693', 'bfe62b56-a44a-412f-b433-ea130cfd9c9e', '0d754e5a-b8ac-4be0-9173-7b65b2716bcf', '677fa690-5b6c-4417-8b04-7ad086b8dac5', '6a1b2fef-b16d-490e-b482-9ac11074af4c', 'c07d4848-c420-4c6d-bcd2-28c1cec2b972') group by 1;

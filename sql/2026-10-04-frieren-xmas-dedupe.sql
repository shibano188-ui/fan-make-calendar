-- 葬送のフリーレンのクリスマスグッズが2件に分かれていたのを1件にまとめる（2026-10-04 柴野の指摘）。
-- どちらも同じ東宝のページ（tohoentertainmentonline.com/shop/e/eTaS00346）・同じ締切（10/4）と発売日（11/25）・同じ投稿者。
-- タイトルが「クリスマスグッズ」「クリスマスビジュアルグッズ」と違ったので、投稿時の重複検知をすり抜けた
-- （購入先の URL でも見るように直した: src/lib/api.ts の findDuplicates）。
--
-- 残す: e7aa0230（9/16 に先に投稿・「クリスマスビジュアルグッズ」）
-- 外す: f931c10d（9/23・「クリスマスグッズ」）… 消さずに pool = 1 にして一覧から外す（このリポジトリの重複の扱い）
-- 外す側にしか無いもの（楽天の購入先・いいね2件など）は、残す側へ写してから外す。
--
-- ⚠️ 本番のデータを書き換えるので、PR で見てもらってから流す。流したら PR にそう書く。

begin;

-- 1. 楽天の購入先を残す側へ（残す側にまだ楽天が無いときだけ）
update public.events k
   set offers = k.offers || coalesce((
         select jsonb_agg(o) from public.events d, jsonb_array_elements(d.offers) o
          where d.id = 'f931c10d-e1c4-4e01-86c6-b0313b438ba0' and o->>'retailer' = '楽天'), '[]'::jsonb)
 where k.id = 'e7aa0230-428f-48e1-828e-dffac6b96258'
   and not exists (select 1 from jsonb_array_elements(k.offers) x where x->>'retailer' = '楽天');

-- 2. いいね・カレンダーへの追加・スタンプ・ピンした日を残す側へ写す（同じ人が両方に付けていれば1つにする）
insert into public.likes (event_id, user_id)
select 'e7aa0230-428f-48e1-828e-dffac6b96258', l.user_id from public.likes l
 where l.event_id = 'f931c10d-e1c4-4e01-86c6-b0313b438ba0'
   and not exists (select 1 from public.likes k where k.event_id = 'e7aa0230-428f-48e1-828e-dffac6b96258' and k.user_id = l.user_id);

insert into public.calendar_adds (event_id, user_id)
select 'e7aa0230-428f-48e1-828e-dffac6b96258', user_id from public.calendar_adds
 where event_id = 'f931c10d-e1c4-4e01-86c6-b0313b438ba0'
on conflict (event_id, user_id) do nothing;

insert into public.event_stamps (event_id, user_id, stamp)
select 'e7aa0230-428f-48e1-828e-dffac6b96258', user_id, stamp from public.event_stamps
 where event_id = 'f931c10d-e1c4-4e01-86c6-b0313b438ba0'
on conflict do nothing;

insert into public.event_visits (event_id, user_id, start_date, end_date)
select 'e7aa0230-428f-48e1-828e-dffac6b96258', v.user_id, v.start_date, v.end_date from public.event_visits v
 where v.event_id = 'f931c10d-e1c4-4e01-86c6-b0313b438ba0'
   and not exists (select 1 from public.event_visits k
                    where k.event_id = 'e7aa0230-428f-48e1-828e-dffac6b96258' and k.user_id = v.user_id
                      and k.start_date = v.start_date and k.end_date = v.end_date);

-- 3. 外す（一覧・カレンダー・集計は pool = 0 だけを見る）
update public.events set pool = 1
 where id = 'f931c10d-e1c4-4e01-86c6-b0313b438ba0' and pool = 0;

commit;

-- 確認用:
--   select id, title, pool, jsonb_array_length(offers) from events where id in ('e7aa0230-428f-48e1-828e-dffac6b96258', 'f931c10d-e1c4-4e01-86c6-b0313b438ba0');
--   select event_id, count(*) from likes where event_id in ('e7aa0230-428f-48e1-828e-dffac6b96258', 'f931c10d-e1c4-4e01-86c6-b0313b438ba0') group by 1;
--   （残す側のいいねが2〜3件（同じ人が両方に付けていれば重ならない）・外す側は pool = 1 になっていればよい。外す側のいいね2件は残るが、一覧に出ないので数えられない）

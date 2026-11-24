-- animate.shop の巡回（PR #89）で、まとまるべきなのに分かれて入った予定を1つにまとめる（PR #91 より前に入った分）。
-- 対象はすべて 11/22〜23 にボットが入れた予定で、いいね・カレンダー追加・記録などは付いていない（2026-11-24 に確認）。
-- 1つ残す予定（名前がまとまりの見出しと同じもの。無ければ一番古いもの）に、ほかの予定の購入リンクと画像を足して、ほかは消す。
-- 違いの部分（「1(初デート) アッシュ S」「エレン」）を購入リンクの label にする。
do $$
declare
  g record; keep_id uuid; r record; offs jsonb; imgs jsonb; lbl text; n int;
begin
  for g in select * from (values
    ('TVアニメ『葬送のフリーレン』 第4弾 シーンイラストスウェット', 10),
    ('TVアニメ『日本三國』Tシャツ 「痛。」', 2),
    ('キャラディショナルトイ 進撃の巨人 〈和傘〉 ちびきゃらアクリルスタンド', 2),
    ('キャラディショナルトイ 進撃の巨人 〈和傘〉 描き下ろし和紙風缶バッジ', 2),
    ('TVアニメ『葬送のフリーレン』 第4弾 シーンイラスト額縁マグネット', 2)
  ) v(base, expected) loop
    create temp table grp on commit drop as
      select id, title, offers, image_url, created_at from events
      where pool = 0 and created_at > '2026-11-22'
        and (title = g.base or title like g.base || ' %' or title like g.base || '(%');
    select count(*) into n from grp;
    if n <> g.expected then raise exception '% は % 件のはずが % 件', g.base, g.expected, n; end if;

    select id into keep_id from grp order by (title = g.base) desc, created_at limit 1;
    offs := '[]'::jsonb; imgs := '[]'::jsonb;
    for r in select * from grp order by created_at loop
      lbl := btrim(regexp_replace(substr(r.title, length(g.base) + 1), '^\s*\(|\)\s*$', '', 'g'));
      -- まとめ済みの予定は label を持っている。1件の予定は名前の違いの部分を label にする
      offs := offs || coalesce((
        select jsonb_agg(case when o ? 'label' then o else o || jsonb_build_object('label', lbl) end)
        from jsonb_array_elements(r.offers) o), '[]'::jsonb);
      imgs := imgs || case when r.image_url is null then '[]'::jsonb
                           when left(r.image_url, 1) = '[' then r.image_url::jsonb
                           else jsonb_build_array(r.image_url) end;
    end loop;
    select coalesce(jsonb_agg(u), '[]'::jsonb) into imgs from (
      select u from (select distinct on (u) u, k from jsonb_array_elements_text(imgs) with ordinality t(u, k) order by u, k) d order by k limit 10
    ) x;

    update events set title = g.base, offers = offs,
      image_url = case jsonb_array_length(imgs) when 0 then null when 1 then imgs->>0 else imgs::text end
    where id = keep_id;
    delete from events where id in (select id from grp where id <> keep_id);
    drop table grp;
  end loop;
end $$;

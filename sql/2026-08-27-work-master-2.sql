-- 作品マスタの追補。sql/2026-08-27-work-master.sql の後に流す。
--
-- 1. かな読みの前方一致でも候補を出す
--    「乃木坂46」のかな読みは Wikipedia の決まりで「のきさかふおおていいしつくす」と
--    数字まで読みに開かれる。完全一致では永久に当たらないので前方一致を足す。
-- 2. 部分一致（name_norm like '%q%'）が毎回の全件走査になっていたので索引を張る。

create extension if not exists pg_trgm;

create index if not exists idx_work_master_norm_trgm on work_master using gin (name_norm gin_trgm_ops);
create index if not exists idx_work_master_reading_prefix on work_master (reading_norm text_pattern_ops) where reading_norm <> '';

create or replace function resolve_work_name(q text)
returns table (name text, reading text, popularity int, match_kind text)
language sql stable as $$
  with q_keys as (select work_name_norm(q) as qn, work_kana_key(q) as qk)
  select t.name, t.reading, t.popularity, t.match_kind
  from (
    select distinct on (h.name) h.name, h.reading, h.popularity, h.match_kind, h.rnk
    from (
      select m.name, m.reading, m.popularity, 'exact'::text as match_kind, 1 as rnk
        from work_master m, q_keys where q_keys.qn <> '' and m.name_norm = q_keys.qn
      union all
      select m.name, m.reading, m.popularity, 'alias', 2
        from work_master_alias a join work_master m on m.id = a.master_id, q_keys
        where q_keys.qn <> '' and a.alias_norm = q_keys.qn
      union all
      select m.name, m.reading, m.popularity, 'kana', 3
        from work_master m, q_keys where q_keys.qk <> '' and m.reading_norm = q_keys.qk
      union all
      select * from (
        select m.name, m.reading, m.popularity, 'partial'::text, 4
          from work_master m, q_keys
          where length(q_keys.qn) >= 2 and m.name_norm like ('%' || q_keys.qn || '%')
          order by m.popularity desc limit 8
      ) p
      union all
      -- かな読みの前方一致。確定はさせず候補として見せる
      select * from (
        select m.name, m.reading, m.popularity, 'partial'::text, 5
          from work_master m, q_keys
          where length(q_keys.qk) >= 3 and m.reading_norm like (q_keys.qk || '%')
          order by m.popularity desc limit 5
      ) k
      union all
      select * from (
        select m.name, m.reading, m.popularity, 'typo'::text, 6
          from work_master m, q_keys
          where length(q_keys.qn) between 3 and 24
            and abs(length(m.name_norm) - length(q_keys.qn)) <= 1
            and levenshtein_less_equal(m.name_norm, q_keys.qn, 1) <= 1
          order by m.popularity desc limit 5
      ) t2
    ) h
    order by h.name, h.rnk, h.popularity desc
  ) t
  order by t.rnk, t.popularity desc
$$;

grant execute on function resolve_work_name(text) to anon, authenticated;

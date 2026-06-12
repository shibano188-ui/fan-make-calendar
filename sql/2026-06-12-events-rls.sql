-- ============================================================================
-- events テーブルの書き込みロックダウン（#1 セキュリティ修正）
-- ============================================================================
-- 目的: 現状 events は誰でも UPDATE/DELETE できる（devtools から他人の予定を
--       改竄・削除・いいね数改竄が可能）。これを「本人のみ直接書き込み可」に絞る。
--
-- ただしアプリは意図的に「他人の予定への書き込み」を行っている:
--   ① いいね（like_count を加算）
--   ② ＋情報（参加作品なら他人投稿の予約情報・日付を編集）
--   ③ カレンダー削除（参加作品の全予定を削除）
-- これらを SECURITY DEFINER の関数（RLSをバイパス・サーバー側で権限判定）に逃がし、
-- その上で events 本体の直接 UPDATE/DELETE を本人のみに制限する。
--
-- ⚠️ 実行順序が重要（逆順だと本番のいいね・＋情報が止まる）:
--   Phase 1（このファイルの上半分）… 先に実行。関数を追加するだけで既存は壊れない
--   → 連絡 → 私（Claude）が Phase 2（アプリのコードを RPC 呼び出しに差し替え）をデプロイ
--   → 動作確認後に Phase 3（このファイルの下半分・RLS厳格化）を実行
-- ============================================================================


-- ============================================================================
-- 【参考】現状の RLS / ポリシー確認用（実行して結果を Claude に共有してもOK）
-- ============================================================================
-- select tablename, rowsecurity from pg_tables where schemaname='public' and tablename in ('events','likes','participations','works');
-- select tablename, policyname, cmd, qual, with_check from pg_policies where schemaname='public' and tablename in ('events','likes');


-- ============================================================================
-- Phase 1: SECURITY DEFINER 関数を作成（★いま実行する。追加のみ・無害★）
-- ============================================================================

-- ① いいね加算（1タップ = +1）。本人の like 行を確保しつつ like_count を加算。
create or replace function public.add_like_tap(p_event_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_count integer;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  insert into likes (event_id, user_id)
  values (p_event_id, v_uid)
  on conflict (event_id, user_id) do nothing;

  update events
     set like_count = coalesce(like_count, 0) + 1
   where id = p_event_id
  returning like_count into v_count;

  if v_count is null then raise exception 'event not found'; end if;
  return v_count;
end;
$$;

-- ② 予約情報・日付の更新（＋情報ボタン）。参加作品の予定のみ許可。
create or replace function public.update_preorder_info(
  p_event_id        uuid,
  p_is_order_made   boolean,
  p_preorder_start  date,
  p_preorder_end    date,
  p_link            text,
  p_date            date,
  p_date_label      text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_work_id uuid;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  select work_id into v_work_id from events where id = p_event_id;
  if v_work_id is null then raise exception 'event not found'; end if;

  if not exists (
    select 1 from participations where work_id = v_work_id and user_id = v_uid
  ) then
    raise exception 'not a participant';
  end if;

  update events set
    is_order_made       = p_is_order_made,
    preorder_start_date = p_preorder_start,
    preorder_end_date   = p_preorder_end,
    link_url            = nullif(p_link, ''),
    event_date          = p_date,
    date_label          = p_date_label
  where id = p_event_id;
end;
$$;

-- ③ 予定の削除（本人のみ）。reactions は FK CASCADE 想定、likes は明示削除。
create or replace function public.delete_event(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_author uuid;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  select author_id into v_author from events where id = p_event_id;
  if v_author is null then raise exception 'event not found'; end if;
  if v_author <> v_uid then raise exception 'forbidden'; end if;

  delete from likes  where event_id = p_event_id;
  delete from events where id = p_event_id;
end;
$$;

-- ④ カレンダー（作品）の削除。参加者のみ許可（＝現状の挙動: 削除ボタンは参加者にのみ表示）。
create or replace function public.delete_work(p_work_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  if not exists (
    select 1 from participations where work_id = p_work_id and user_id = v_uid
  ) then
    raise exception 'not a participant';
  end if;

  delete from likes where event_id in (select id from events where work_id = p_work_id);
  delete from events        where work_id = p_work_id;
  delete from participations where work_id = p_work_id;
  delete from works         where id = p_work_id;
end;
$$;

grant execute on function public.add_like_tap(uuid)                                   to authenticated;
grant execute on function public.update_preorder_info(uuid,boolean,date,date,text,date,text) to authenticated;
grant execute on function public.delete_event(uuid)                                   to authenticated;
grant execute on function public.delete_work(uuid)                                    to authenticated;

-- ★ ここまでが Phase 1。実行したら Claude に連絡 → Phase 2（コード差し替え）へ ★


-- ============================================================================
-- Phase 3: events の RLS を本人書き込みのみに厳格化
--          （★ Phase 2 デプロイ＆動作確認の後に実行する ★）
-- ============================================================================
-- ⚠️ Phase 2 より前に実行すると、まだ直接 UPDATE しているいいね/＋情報が止まる。

-- alter table public.events enable row level security;  -- RLS未有効なら有効化

-- 既存ポリシーを全て外してから、本人書き込みのみの4本に張り替える
-- do $$
-- declare pol record;
-- begin
--   for pol in select policyname from pg_policies
--              where schemaname='public' and tablename='events' loop
--     execute format('drop policy if exists %I on public.events', pol.policyname);
--   end loop;
-- end $$;

-- create policy "events_select_all"   on public.events for select using (true);
-- create policy "events_insert_self"  on public.events for insert to authenticated with check (author_id = auth.uid());
-- create policy "events_update_self"  on public.events for update to authenticated using (author_id = auth.uid()) with check (author_id = auth.uid());
-- create policy "events_delete_self"  on public.events for delete to authenticated using (author_id = auth.uid());

-- 補足: ①②③④の他人予定への書き込みは Phase 1 の SECURITY DEFINER 関数経由になるため
--       RLS をバイパスして従来通り動く。地名サフィックス付与は /api/update-event-title
--       （service role・#2で限定済み）経由なので影響なし。

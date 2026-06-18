-- 予約の開始時間・締切時間（任意）を追加
-- 既存の preorder_start_date / preorder_end_date（日付）に対する時刻を別カラムで保持する。

alter table public.events
  add column if not exists preorder_start_time time,
  add column if not exists preorder_end_time   time;

-- update_preorder_info（＋情報ボタン）に時刻パラメータを追加。
-- 引数リストが変わるため、考えられる旧シグネチャを全て drop してから再作成する。
-- ① 元の7引数版  ② このマイグレーション初版で作った「時刻引数が中間にある」9引数版
drop function if exists public.update_preorder_info(uuid, boolean, date, date, text, date, text);
drop function if exists public.update_preorder_info(uuid, boolean, date, date, time, time, text, date, text);

-- 時刻引数は default null。旧フロント（7引数呼び出し）でも解決できるよう後方互換にする。
create or replace function public.update_preorder_info(
  p_event_id           uuid,
  p_is_order_made      boolean,
  p_preorder_start     date,
  p_preorder_end       date,
  p_link               text,
  p_date               date,
  p_date_label         text,
  p_preorder_start_time time default null,
  p_preorder_end_time   time default null
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
    preorder_start_time = p_preorder_start_time,
    preorder_end_time   = p_preorder_end_time,
    link_url            = nullif(p_link, ''),
    event_date          = p_date,
    date_label          = p_date_label
  where id = p_event_id;
end;
$$;

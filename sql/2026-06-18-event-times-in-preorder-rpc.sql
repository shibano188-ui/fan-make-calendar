-- 「情報を追加」シートから、イベント自体の開始時間(event_time)・終了時間(end_time)も
-- 設定できるようにする。update_preorder_info に p_event_time / p_end_time を追加。
--
-- 引数リストが変わるため、考えられる旧シグネチャを全て drop してから再作成する。
-- ① 元の7引数版
-- ② マイグレーション初版（時刻引数が中間にある9引数版）
-- ③ 直前の9引数版（予約時刻を末尾 default null で追加した版）
drop function if exists public.update_preorder_info(uuid, boolean, date, date, text, date, text);
drop function if exists public.update_preorder_info(uuid, boolean, date, date, time, time, text, date, text);
drop function if exists public.update_preorder_info(uuid, boolean, date, date, text, date, text, time, time);

-- 追加の時刻引数も default null（旧フロントの呼び出しでも解決できるよう後方互換）。
create or replace function public.update_preorder_info(
  p_event_id            uuid,
  p_is_order_made       boolean,
  p_preorder_start      date,
  p_preorder_end        date,
  p_link                text,
  p_date                date,
  p_date_label          text,
  p_preorder_start_time time default null,
  p_preorder_end_time   time default null,
  p_event_time          time default null,
  p_end_time            time default null
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
    -- event_time / end_time は既存イベントに値があり得るため coalesce。
    -- 引数 null（時刻を送らない旧フロント等）のときは既存値を維持し、データ消失を防ぐ。
    event_time          = coalesce(p_event_time, event_time),
    end_time            = coalesce(p_end_time, end_time),
    link_url            = nullif(p_link, ''),
    event_date          = p_date,
    date_label          = p_date_label
  where id = p_event_id;
end;
$$;

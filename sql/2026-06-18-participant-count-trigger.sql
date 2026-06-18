-- works.participant_count を participations の実行数で自動維持するトリガー。
--
-- 旧実装はクライアントが participations を count して works に書き戻していたが、
-- participations の RLS により「自分の行」しか見えず count が常に 1 になり、
-- カレンダー訪問（upsertParticipation）のたびに participant_count が 1 に上書き
-- されていた。集計をサーバー側（SECURITY DEFINER, RLS 回避）に移して恒久修正する。

create or replace function public.recompute_participant_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_work_id uuid := coalesce(new.work_id, old.work_id);
begin
  update works
    set participant_count = (select count(*) from participations where work_id = v_work_id)
    where id = v_work_id;
  return null;
end;
$$;

drop trigger if exists trg_recompute_participant_count on public.participations;
create trigger trg_recompute_participant_count
  after insert or delete or update of work_id on public.participations
  for each row execute function public.recompute_participant_count();

-- 既存データのバックフィル（現在の正しい人数に再計算）
update works w
  set participant_count = (select count(*) from participations p where p.work_id = w.id);

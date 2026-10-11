-- フォロー（participations）に、消えたアカウントの行が残らないようにする（2026-10-11 柴野）。
--
-- 何があったか：participations.user_id には auth.users への外部キーが無く、消えたアカウント2人のフォロー（3行）が残っていた。
--   新着のまとめ（api/notify-new-events・毎朝9時）は送る相手全員を user_alert_digests に1回で書く。
--   この表は auth.users への外部キーがあるので、消えた人が1人混ざると文全体が失敗し、
--   コードがそれを「送り済み」と受け取って、10/6〜10/11 の6日間だれにも届かなかった。
--   コードも、書けない人だけを飛ばすように直した（同じ日のコミット）。
-- 変えるもの：
--   ① 消えたアカウントのフォロー3行を消す（作品のフォロー数はトリガー trg_recompute_participant_count が数え直す）
--   ② user_id に auth.users への外部キーを足す。アカウントが消えたらフォローも一緒に消える
--
-- 適用：
--   本番……2026-10-11 柴野（SQL Editor で実行。3行消えて外部キーが付いたのを確かめた。2448 → 2445 行）

begin;

delete from public.participations p
where not exists (select 1 from auth.users u where u.id = p.user_id)
returning p.user_id, p.work_id;

alter table public.participations
  add constraint participations_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete cascade;

commit;

-- 確かめ：
-- select conname from pg_constraint where conrelid = 'public.participations'::regclass and contype = 'f';
-- select count(*) from public.participations p where not exists (select 1 from auth.users u where u.id = p.user_id);  -- 0

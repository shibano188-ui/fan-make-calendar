-- ============================================================================
-- いいね数・リアクション数が常に1になる不具合の修正
--
-- 原因: likes / reactions テーブルの RLS が「自分の行のみ SELECT 可」に
--       制限されていたため、クライアントの集計（count exact / 行の読み取り）が
--       自分の1件しか数えられず、events.like_count を 1 に上書き破壊していた。
--
-- 対応: カウント表示に必要な集計のため、両テーブルの SELECT を全員に許可する。
--       user_id は匿名認証の UUID のみで個人情報を含まない。
--       INSERT / DELETE の既存ポリシーは変更しない（自分の行のみ操作可のまま）。
-- ============================================================================

alter table public.likes enable row level security;
drop policy if exists "likes_select_all" on public.likes;
create policy "likes_select_all" on public.likes for select using (true);

alter table public.reactions enable row level security;
drop policy if exists "reactions_select_all" on public.reactions;
create policy "reactions_select_all" on public.reactions for select using (true);

-- バグで 0/1 に上書きされた like_count を、実際の likes 行数から再計算して修復
update public.events e
   set like_count = (select count(*) from public.likes l where l.event_id = e.id);

-- 確認用:
-- select id, like_count from public.events order by like_count desc limit 10;

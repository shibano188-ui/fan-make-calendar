-- 購入リンクの取り消しを共同編集にした（誰でも取り消せる／履歴から戻せる）ことに伴う調整。
--
-- 現状の ee_delete は「自分が作った編集しか消せない」ため、他人が取り消した購入リンクを
-- 投稿者が元に戻せない（UIには「戻す」が出るのに0行削除で無言の失敗になる）。
-- 投稿者は自分の投稿に付いた編集を取り消せるようにする。
--
-- Supabase の SQL Editor で実行すること。冪等。

drop policy if exists ee_delete on public.event_edits;

create policy ee_delete on public.event_edits
  for delete to authenticated
  using (
    created_by = auth.uid()
    or exists (
      select 1 from public.events e
      where e.id = event_edits.event_id
        and e.author_id = auth.uid()
    )
  );

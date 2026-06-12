-- ============================================================================
-- reports: 通報者非表示用の SELECT ポリシー ＋ 運営確認フロー（#4）
-- ============================================================================
-- 目的:
--   1. 通報したイベントを通報者の画面から非表示にする（アプリが自分の通報行を読むため）
--   2. 運営（Supabaseダッシュボード）で未対応の通報を確認するフローを整備する
--
-- ★ このファイル全体を Supabase SQL Editor で1回実行する ★

-- ── 1. 自分の通報行だけ SELECT できるポリシー（現状は INSERT のみ）
DROP POLICY IF EXISTS "select own reports" ON reports;
CREATE POLICY "select own reports"
ON reports FOR SELECT TO authenticated
USING (auth.uid() = reporter_id);

-- ── 2. 対応済みフラグ（運営チェック用。通報行自体は消さない:
--       行を消すと通報者の非表示が解除されてしまうため）
ALTER TABLE reports ADD COLUMN IF NOT EXISTS handled BOOLEAN NOT NULL DEFAULT false;


-- ============================================================================
-- 【運営用クエリ集】定期確認時に SQL Editor で使う（実行は都度・保存推奨）
-- ============================================================================

-- ▼ 未対応の通報一覧（イベント内容付き）
-- SELECT r.id AS report_id, r.created_at, r.reason,
--        e.title, e.event_date, e.author_id, e.id AS event_id
-- FROM reports r
-- LEFT JOIN events e ON e.id = r.event_id
-- WHERE r.handled = false
-- ORDER BY r.created_at DESC;

-- ▼ 同一イベントへの通報数（多いものから）
-- SELECT e.title, COUNT(*) AS report_count
-- FROM reports r JOIN events e ON e.id = r.event_id
-- GROUP BY e.id, e.title
-- ORDER BY report_count DESC;

-- ▼ 確認して問題なし/対処済みにする（report_id を差し替えて実行）
-- UPDATE reports SET handled = true WHERE id = '<report_id>';

-- ▼ 問題のある投稿を削除する場合（event_id を差し替えて実行）
--   ※ reports.event_id は ON DELETE CASCADE のため、イベントを消すと通報行も消える。
--     通報者の非表示は不要になる（イベント自体が消えるため）ので問題なし。
-- DELETE FROM likes  WHERE event_id = '<event_id>';
-- DELETE FROM events WHERE id = '<event_id>';

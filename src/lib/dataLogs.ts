import { supabase } from './supabase';
import { resolveBuy } from './affiliate';
import { openExternal } from './openExternal';
import type { CalendarEvent } from '../types';

// データ資産化の蛇口（Projects/fanhive-data-asset-plan.md の①④）。
// どちらも fire-and-forget: 失敗（テーブル未作成・オフライン等）は完全に握りつぶし、
// UXには一切影響させない。閲覧は service_role のみ（RLSで insert だけ許可）。

/** ①AI抽出の教師データ: 入力 × AI出力 × ユーザーが実際に保存した内容 */
export function logAiExtraction(entry: {
  userId: string;
  sourceUrl?: string;
  sourceText?: string;
  sourceKind: 'url' | 'image' | 'shared_text';
  aiOutput: unknown;
  finalSaved: unknown;
}): void {
  void supabase.from('ai_extraction_logs').insert({
    user_id: entry.userId,
    source_url: entry.sourceUrl ?? null,
    source_text: entry.sourceText ?? null,
    source_kind: entry.sourceKind,
    ai_output: entry.aiOutput,
    final_saved: entry.finalSaved,
  }).then(() => {}, () => {});
}

/**
 * ②の素材: 検索クエリログ。ユーザーが実際に使う略称・呼び方（表記ゆれ辞書の一次資料）。
 * picked あり＝「query と入力して picked を選んだ」別名ペア。
 * 同じクエリの連続ログはコンテキストごとに1回に抑える（pickedありは常に記録）。
 */
const lastSearchLogged = new Map<string, string>();
export function logSearch(
  context: 'explore' | 'saved' | 'work_follow' | 'post_work',
  query: string,
  resultCount: number | null,
  userId?: string | null,
  picked?: string,
): void {
  const q = query.trim();
  if (!q) return;
  if (!picked) {
    if (lastSearchLogged.get(context) === q) return;
    lastSearchLogged.set(context, q);
  }
  void supabase.from('search_logs').insert({
    user_id: userId ?? null,
    context,
    query: q,
    result_count: resultCount,
    picked: picked ?? null,
  }).then(() => {}, () => {});
}

/**
 * ④購入リンクを開く＋クリックをログ（需要シグナル・リンク構造の学習素材）。
 * 各ページの onBuy はこれを呼ぶだけにする。
 */
export function openBuyLink(e: CalendarEvent, from: 'home' | 'explore' | 'saved' | 'item', userId?: string | null): void {
  const { url, retailer, mode } = resolveBuy(e);
  if (!url) return;
  // ログは完全なおまけ。ここで例外が出てもリンクが開かないことが無いよう try で囲う
  // （2026-08 の審査却下は「リンクが開かない」だったので、開く動作は何があっても守る）。
  try {
    let domain: string | null = null;
    try { domain = new URL(url).hostname; } catch { /* 不正URLでもログは諦めるだけ */ }
    void supabase.from('buy_click_logs').insert({
      user_id: userId ?? null,
      event_id: e.id,
      url,
      domain,
      retailer: retailer || null,
      has_affiliate: mode === 'cart',
      source: from,
    }).then(() => {}, () => {});
  } catch { /* noop */ }
  void openExternal(url);
}

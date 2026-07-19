import { supabase } from './supabase';
import { resolveBuy } from './affiliate';
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
 * ④購入リンクを開く＋クリックをログ（需要シグナル・リンク構造の学習素材）。
 * 各ページの onBuy はこれを呼ぶだけにする。
 */
export function openBuyLink(e: CalendarEvent, from: 'home' | 'explore' | 'saved' | 'item', userId?: string | null): void {
  const { url, retailer, mode } = resolveBuy(e);
  if (!url) return;
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
  window.open(url, '_blank', 'noopener');
}

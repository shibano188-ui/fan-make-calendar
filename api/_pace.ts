// 店への機械的なアクセスの間隔（robots.txt の Crawl-delay を守る）。2026-09-28。
// アニメイトは「Crawl-delay: 1180」＝約20分に1回。巡回ボット・毎日の更新・節目の取り直しで、
// 1日に数百回アニメイトの商品ページを読んでいたので、ここで絞る。
//
// 効くのは runBotPaced() の中（ボット・定期実行）だけ。ユーザーが投稿画面でURLを貼ったときなど、
// 人の操作で読むときは今までどおり（同じ関数を通るので AsyncLocalStorage で見分ける）。
// 最後にアクセスした時刻は bot_state（key='pace'）に持ち、別の定期実行とも共有する。
import { AsyncLocalStorage } from 'node:async_hooks';
import type { SupabaseClient } from '@supabase/supabase-js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any>;

/** 店ごとの最小間隔（ミリ秒）。ここに無い店は制限なし */
const MIN_GAP: Record<string, number> = {
  'www.animate-onlineshop.jp': 1180_000,
};

interface PaceState { last: Record<string, string>; dirty: boolean }
const store = new AsyncLocalStorage<PaceState>();

/** ボット・定期実行の処理をこの中で走らせる。終わったら最後にアクセスした時刻を保存する */
export async function runBotPaced<T>(db: Db, fn: () => Promise<T>): Promise<T> {
  const { data } = await db.from('bot_state').select('value').eq('key', 'pace').maybeSingle();
  const state: PaceState = { last: { ...((data?.value ?? {}) as Record<string, string>) }, dirty: false };
  try {
    return await store.run(state, fn);
  } finally {
    if (state.dirty) {
      await db.from('bot_state').upsert({ key: 'pace', value: state.last, updated_at: new Date().toISOString() });
    }
  }
}

/** 今アクセスしてよいか（見るだけ。時刻は進めない） */
export function botCanFetch(host: string): boolean {
  const s = store.getStore();
  const gap = MIN_GAP[host];
  if (!s || !gap) return true;
  const last = s.last[host];
  return !last || Date.now() - Date.parse(last) >= gap;
}

/** アクセスしてよければ true を返し、アクセスした時刻として記録する。ボットの外では常に true */
export function botMayFetch(host: string): boolean {
  const s = store.getStore();
  if (!s || !MIN_GAP[host]) return true;
  if (!botCanFetch(host)) return false;
  s.last[host] = new Date().toISOString();
  s.dirty = true;
  return true;
}

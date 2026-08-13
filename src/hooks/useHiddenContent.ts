import { useCallback, useEffect, useState } from 'react';
import type { CalendarEvent } from '../types';
import { getReportedEventIds, getBlockedUserIds, blockUser, unblockUser } from '../lib/api';

// 自分の画面から隠すもの（通報した投稿 / ブロックした人の投稿）をまとめて持つ。
//
// 通報とブロックは別の画面（投稿の詳細 / プロフィール）から実行されるが、隠す処理は
// どの一覧でも同じなので1か所にまとめた。ページごとに個別に取りに行くと、
// 詳細画面でブロックしても一覧に戻るまで反映されないので、モジュール内に持って共有する。

let reportedIds = new Set<string>();
let blockedIds = new Set<string>();
let loadedFor: string | null = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach(fn => fn());
}

async function load(userId: string) {
  const [reported, blocked] = await Promise.all([
    getReportedEventIds(userId).catch(() => [] as string[]),
    getBlockedUserIds(userId).catch(() => [] as string[]),
  ]);
  reportedIds = new Set(reported);
  blockedIds = new Set(blocked);
  loadedFor = userId;
  notify();
}

// アカウントの切り替え・削除はどちらもページ全体を読み込み直す（location.href / reload）ので、
// ここのモジュール状態は自然に捨てられる。明示的なリセットは要らない。

export function useHiddenContent(userId: string | undefined) {
  // 中身が変わるたびに増える。isHidden / isBlocked の依存に入れることで、
  // これらを useMemo の依存に持つ一覧が作り直される（関数の同一性が変わらないと再計算されない）
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const rerender = () => setVersion(n => n + 1);
    listeners.add(rerender);
    if (userId && loadedFor !== userId) load(userId);
    return () => { listeners.delete(rerender); };
  }, [userId]);

  // 一覧の filter にそのまま渡せる述語。投稿者が分からない予定は隠さない
  const isHidden = useCallback(
    (e: Pick<CalendarEvent, 'id' | 'authorId'>) =>
      reportedIds.has(e.id) || (!!e.authorId && blockedIds.has(e.authorId)),
    [version],
  );

  const hideReportedEvent = useCallback((eventId: string) => {
    reportedIds = new Set(reportedIds).add(eventId);
    notify();
  }, []);

  const isBlocked = useCallback((otherUserId: string) => blockedIds.has(otherUserId), [version]);

  const block = useCallback(async (otherUserId: string) => {
    if (!userId) return;
    await blockUser(userId, otherUserId);
    blockedIds = new Set(blockedIds).add(otherUserId);
    notify();
  }, [userId]);

  const unblock = useCallback(async (otherUserId: string) => {
    if (!userId) return;
    await unblockUser(userId, otherUserId);
    const next = new Set(blockedIds);
    next.delete(otherUserId);
    blockedIds = next;
    notify();
  }, [userId]);

  return { isHidden, hideReportedEvent, isBlocked, block, unblock };
}

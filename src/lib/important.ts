import { useSyncExternalStore } from 'react';
import { loadImportantEventIds, toggleImportantEventId } from './constants';

// 重要な予定の印（★）。カレンダーで右へ払うと付く・外れる（2026-11-07 柴野「外すの逆は、目立たせる」）。
// 中身は前からある fan_important_event_ids（アカウントにも同期済み・constants.ts）をそのまま使う。
// ここは画面どうしで同じ状態を見せるための入れ物

const CHANGE = 'fan-important';
let cache: Set<string> | null = null;
const current = () => (cache ??= loadImportantEventIds());

/** 付け外しして、付いたかどうかを返す */
export function toggleImportant(id: string): boolean {
  cache = toggleImportantEventId(id);
  window.dispatchEvent(new Event(CHANGE));
  return cache.has(id);
}

function subscribe(cb: () => void): () => void {
  const reload = () => { cache = null; cb(); };
  window.addEventListener(CHANGE, cb);
  window.addEventListener('fan-app-state-synced', reload);
  return () => { window.removeEventListener(CHANGE, cb); window.removeEventListener('fan-app-state-synced', reload); };
}

export function useImportant(): Set<string> {
  return useSyncExternalStore(subscribe, current, current);
}

/** 右へ払ったときの地（重要にする・外す。SwipeRow の right に渡す） */
export const IMPORTANT_SIDE = (on: boolean) => ({ label: on ? '★ 重要を外す' : '★ 重要', color: '#f59e0b' });

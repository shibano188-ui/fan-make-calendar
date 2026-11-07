import { useSyncExternalStore } from 'react';
import { pushAppState } from './appState';

// 探すで「興味なし」として左へ払って隠した予定（2026-11-07 柴野）。
// 端末に覚え、ログイン中はアカウントにも上げる（user_app_state.dismissed_event_ids・sql/2026-11-07-dismissed-events.sql）。
// 隠すのは探すだけ。ホーム・カレンダー・詳細には出る（♡した予定は消えない）

const KEY = 'fan_dismissed_event_ids';
/** 増え続けないよう、新しいほうから残す数 */
const MAX = 2000;
const CHANGE = 'fan-dismissed';

function read(): string[] {
  try { const v = JSON.parse(localStorage.getItem(KEY) ?? '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
}

let cache: Set<string> | null = null;
function current(): Set<string> {
  if (!cache) cache = new Set(read());
  return cache;
}

function write(list: string[]): void {
  const kept = list.slice(-MAX);
  try { localStorage.setItem(KEY, JSON.stringify(kept)); } catch { /* noop */ }
  cache = new Set(kept);
  pushAppState('dismissed_event_ids', kept);
  window.dispatchEvent(new Event(CHANGE));
}

export function dismissEvent(id: string): void {
  const list = [...current()].filter((x) => x !== id);
  write([...list, id]);
}

export function restoreEvent(id: string): void {
  write([...current()].filter((x) => x !== id));
}

function subscribe(cb: () => void): () => void {
  // 起動時の同期（appState.ts）で localStorage が書き換わったときも読み直す
  const onChange = () => { cache = null; cb(); };
  window.addEventListener(CHANGE, cb);
  window.addEventListener('fan-app-state-synced', onChange);
  return () => { window.removeEventListener(CHANGE, cb); window.removeEventListener('fan-app-state-synced', onChange); };
}

/** 隠した予定の id（並びは隠した順） */
export function useDismissed(): Set<string> {
  return useSyncExternalStore(subscribe, current, current);
}

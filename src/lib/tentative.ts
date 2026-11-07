import { useSyncExternalStore } from 'react';
import { pushAppState } from './appState';

// 日付未定の予定を「だいたいこの日」と自分で仮に置いた日（2026-11-07 柴野）。
// ボードで、日付未定の欄から好きな日へ長押しで運んで置く。日付が決まった予定は、仮置きを無視して本当の日に出る。
// 端末に覚え、ログイン中はアカウントにも上げる（user_app_state.tentative_dates・sql/2026-11-07-dismissed-events.sql）

const KEY = 'fan_tentative_dates';
const CHANGE = 'fan-tentative';
type Map = Record<string, string>;

function read(): Map {
  try { const v = JSON.parse(localStorage.getItem(KEY) ?? '{}'); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; } catch { return {}; }
}
let cache: Map | null = null;
const current = () => (cache ??= read());

function write(m: Map): void {
  try { localStorage.setItem(KEY, JSON.stringify(m)); } catch { /* noop */ }
  cache = m;
  pushAppState('tentative_dates', m);
  window.dispatchEvent(new Event(CHANGE));
}

/** 仮に置く（day=null で取り消す） */
export function setTentative(id: string, day: string | null): void {
  const m = { ...current() };
  if (day) m[id] = day; else delete m[id];
  write(m);
}

function subscribe(cb: () => void): () => void {
  const reload = () => { cache = null; cb(); };
  window.addEventListener(CHANGE, cb);
  window.addEventListener('fan-app-state-synced', reload);
  return () => { window.removeEventListener(CHANGE, cb); window.removeEventListener('fan-app-state-synced', reload); };
}

/** 予定 id → 仮に置いた日（YYYY-MM-DD） */
export function useTentative(): Map {
  return useSyncExternalStore(subscribe, current, current);
}

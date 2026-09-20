import type { CalendarEvent } from '../types';
import { listSavedEvents } from './api';

// 「保存した予定」（いいね＝カレンダーに入れたもの）を覚えておく場所。
//
// なぜ要るか: カレンダーは詳細ページへ移ると一度消え、戻るたびにサーバーから取り直していた。
// その間は灰色の読み込み表示になり、「戻るのが重い」の正体だった（2026-09-19 実測で1.3秒）。
// さらに起動時は、通知の組み直し（useNotificationScheduler）とカレンダーが同じ取得を別々に投げていた。
//
// やること:
//  - 覚えている分があれば**すぐ返す**（画面はそれで描く）。裏で取り直して、届いたら差し替える
//  - 同時に来た取得は1本にまとめる（起動時の二重取得をなくす）
//  - 端末にも残し、アプリを開き直した直後から前回の予定を出せるようにする
// 正はあくまでサーバー。覚えている分は古いかもしれない前提で、画面を開くたびに取り直す。

const STORAGE_KEY = 'fan_saved_events_v1';

let mem: { userId: string; events: CalendarEvent[] } | null = null;
let inflight: { userId: string; p: Promise<CalendarEvent[]> } | null = null;

function readStored(userId: string): CalendarEvent[] | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as { userId: string; events: CalendarEvent[] };
    return v.userId === userId && Array.isArray(v.events) ? v.events : null;
  } catch {
    return null;
  }
}

function remember(userId: string, events: CalendarEvent[]) {
  mem = { userId, events };
  // 端末の保存は容量超過でも黙って諦める（背景画像の data URL と同じ場所を使うため）
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ userId, events })); } catch { /* 表示は続ける */ }
}

/** 覚えている保存済みの予定。無ければ null（＝初めて開いた）。同期で即答する。 */
export function peekSaved(userId: string): CalendarEvent[] | null {
  if (mem?.userId === userId) return mem.events;
  const stored = readStored(userId);
  if (stored) mem = { userId, events: stored };
  return stored;
}

/** サーバーから取り直す。取得中に呼ばれたら同じ取得を待つ。 */
export function loadSaved(userId: string): Promise<CalendarEvent[]> {
  if (inflight?.userId === userId) return inflight.p;
  const p = listSavedEvents(userId)
    .then((events) => { remember(userId, events); return events; })
    .finally(() => { if (inflight?.p === p) inflight = null; });
  inflight = { userId, p };
  return p;
}

/** 画面側で変えた結果（いいねの解除など）を覚えている分にも反映する。 */
export function updateSaved(userId: string, fn: (events: CalendarEvent[]) => CalendarEvent[]) {
  const cur = peekSaved(userId);
  if (cur) remember(userId, fn(cur));
}

/** ログアウトやアカウント削除のときに消す（別のアカウントの予定を出さない）。 */
export function clearSaved() {
  mem = null;
  inflight = null;
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* noop */ }
}

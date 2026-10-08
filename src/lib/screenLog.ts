import { Capacitor } from '@capacitor/core';
import { supabase } from './supabase';

// 見た画面を screen_views に1行ずつ足す（sql/2026-10-08-screen-views.sql）。どこで離れたか・何日使ったかを見るため。
// アプリの中では Vercel Analytics が動かないので自前で持つ。失敗しても画面には何も出さない。
//
// 記録するのはログインできてから（RLS が本人の行しか足させない）。それまでの分はためておいて、ログインしたら送る。
// 自動操作のブラウザ（動作確認のスクリプト）とクローラーは記録しない。

const PLATFORM = Capacitor.getPlatform() as 'ios' | 'android' | 'web';

export const IS_AUTOMATED = typeof navigator !== 'undefined' && (
  navigator.webdriver === true || /headless|bot|crawl|spider|lighthouse|playstore-google/i.test(navigator.userAgent)
);

type Row = { path: string; platform: typeof PLATFORM; referrer: string | null };
let userId: string | null = null;
let queue: Row[] = [];
let lastPath = '';

function send(rows: Row[]) {
  if (rows.length) supabase.from('screen_views').insert(rows).then(() => { /* noop */ }, () => { /* noop */ });
}

export function setScreenLogUser(id: string | null): void {
  userId = id;
  if (id) { send(queue); queue = []; }
}

/** 画面の名前。予定の id などは外して、同じ画面は同じ名前にする */
export function screenName(pathname: string): string {
  return pathname
    .replace(/\/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, '/:id')
    .replace(/\/\d+(?=\/|$)/g, '/:id')
    .slice(0, 80) || '/';
}

export function logScreen(path: string, referrer: string | null = null): void {
  if (IS_AUTOMATED) return;
  if (path === lastPath && !referrer && path !== '/open') return;
  lastPath = path;
  const row = { path, platform: PLATFORM, referrer };
  if (userId) send([row]);
  else if (queue.length < 50) queue.push(row);
}

/** Web の来た元。アプリの中は空。?utm_source= / ?src= があればそちらを優先する */
export function entryReferrer(): string | null {
  try {
    const q = new URLSearchParams(window.location.search);
    const tag = q.get('utm_source') || q.get('src');
    if (tag) return `utm:${tag}`.slice(0, 200);
    if (PLATFORM !== 'web' || !document.referrer) return null;
    const host = new URL(document.referrer).hostname;
    return host && host !== window.location.hostname ? host.slice(0, 200) : null;
  } catch { return null; }
}

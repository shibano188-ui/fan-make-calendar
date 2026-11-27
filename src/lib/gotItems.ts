import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { supabase } from './supabase';
import { eventFromRow } from './api';
import { parseImageUrls } from './constants';
import { optimizedImage, unstretchImage } from './image';
import { deriveItemType } from '../design/tokens';
import type { CalendarEvent } from '../types';

// 今月のまとめ画像に載せる物＝自分が「買った」「行った」を押した予定（2026-11-26 柴野）。DB は今あるものだけを読む

export type MyGot = { event: CalendarEvent; stamp: 'bought' | 'went'; at: string };

/** 自分の「買った」「行った」（新しい順） */
export async function loadMyGot(userId: string): Promise<MyGot[]> {
  const { data, error } = await supabase.from('event_stamps').select('event_id, stamp, created_at')
    .eq('user_id', userId).in('stamp', ['bought', 'went']).order('created_at', { ascending: false }).limit(80);
  if (error || !data?.length) return [];
  const ids = [...new Set(data.map((r) => r.event_id as string))];
  const evs = new Map<string, CalendarEvent>();
  for (let i = 0; i < ids.length; i += 100) {
    const { data: es } = await supabase.from('events').select('*').in('id', ids.slice(i, i + 100));
    for (const e of es ?? []) { const ev = eventFromRow(e as Record<string, unknown>); evs.set(ev.id, ev); }
  }
  const seen = new Set<string>();
  return data.flatMap((r) => {
    const ev = evs.get(r.event_id as string); if (!ev || seen.has(ev.id)) return [];
    seen.add(ev.id); return [{ event: ev, stamp: r.stamp as 'bought' | 'went', at: r.created_at as string }];
  });
}

/** 予定の最初の画像（同じ出どころで読める大きさに） */
export function imageOf(e: CalendarEvent, w: 384 | 640 = 384): string | null {
  const u = parseImageUrls(unstretchImage(e.imageUrl))[0];
  return u ? optimizedImage(u, w) : null;
}

/** 見本（まだ何も押していない人に、どんな1枚になるかを見せる）: 画像のある新しいグッズ */
export async function loadSampleGot(): Promise<MyGot[]> {
  const { data } = await supabase.from('events').select('*').not('image_url', 'is', null).order('created_at', { ascending: false }).limit(60);
  const now = new Date().toISOString();
  return (data ?? []).map((r) => eventFromRow(r as Record<string, unknown>)).filter((e) => deriveItemType(e) === 'goods' && imageOf(e)).slice(0, 9)
    .map((event, i) => ({ event, stamp: 'bought' as const, at: new Date(Date.now() - i * 2.6e8).toISOString() || now }));
}

// iPhone のアプリ（同梱・capacitor://localhost）では /_vercel/image が自分の出どころに無く、よその画像はキャンバスで読めない。
// fanhive.jp から CapacitorHttp で取って data URL にする（Web と Android はそのまま）
const IOS = Capacitor.getPlatform() === 'ios';
const dataCache = new Map<string, Promise<string | null>>();
export function canvasSafe(url: string): Promise<string | null> {
  if (!IOS) return Promise.resolve(url);
  const abs = url.startsWith('/') ? 'https://fanhive.jp' + url : url;
  let p = dataCache.get(abs);
  if (!p) {
    p = CapacitorHttp.get({ url: abs, responseType: 'blob' })
      .then((r) => (typeof r.data === 'string' && r.data ? `data:${(r.headers?.['Content-Type'] ?? r.headers?.['content-type'] ?? 'image/webp')};base64,${r.data}` : null))
      .catch(() => null);
    dataCache.set(abs, p);
  }
  return p;
}

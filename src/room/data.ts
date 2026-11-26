import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { supabase } from '../lib/supabase';
import { eventFromRow } from '../lib/api';
import { parseImageUrls } from '../lib/constants';
import { optimizedImage, unstretchImage } from '../lib/image';
import { deriveItemType } from '../design/tokens';
import type { CalendarEvent } from '../types';
import type { RoomGoods, RoomSample } from './engine';

// 部屋に飾るグッズ＝自分が「買った」「行った」のスタンプを押した予定（2026-11-26 柴野）。DB は今あるものだけを読む

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

const md = (iso: string) => { const d = new Date(iso); return `${d.getMonth() + 1}/${d.getDate()}`; };

/** 名前から、飾り方（アクスタ・缶バッジ・ポスター・カード・チケット）を決める */
function kindOf(e: CalendarEvent, stamp: string): RoomGoods['kind'] {
  if (stamp === 'went' || deriveItemType(e) === 'event') return 'ticket';
  const t = e.title;
  if (/缶バッジ|バッジ/.test(t)) return 'badge';
  if (/アクリルスタンド|アクスタ|スタンド/.test(t)) return 'stand';
  if (/ポスター|タペストリー|色紙|ボード/.test(t)) return 'poster';
  return 'card';
}
const H = { stand: 0.5, badge: 0.3, card: 0.45, poster: 0.75, ticket: 0.5 } as const;

export function toGoods(list: MyGot[]): RoomGoods[] {
  return list.flatMap(({ event: e, stamp, at }) => {
    const img = imageOf(e); if (!img) return [];
    const kind = kindOf(e, stamp);
    const sub = stamp === 'went' ? `${md(at)} に行った` : `${md(at)} に手に入れた${e.price ? ` · ¥${e.price.toLocaleString()}` : ''}`;
    return [{ id: e.id, img, kind, title: e.title, sub, h: H[kind] }];
  });
}

/** ほかの人の部屋・ファンの話に使う、アプリにある予定（画像のあるグッズ） */
export function toSamples(events: CalendarEvent[]): RoomSample[] {
  return events.flatMap((e) => { if (deriveItemType(e) === 'event') return []; const img = imageOf(e); return img ? [{ img, title: e.title, date: e.date ?? null }] : []; }).slice(0, 40);
}

/** 見本（プレビュー用）: 画像のある新しいグッズ */
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
/** img を持つ物の一覧を、iPhone でも読める形にそろえる（読めなかった物は外す） */
export async function canvasSafeAll<T extends { img: string }>(list: T[]): Promise<T[]> {
  if (!IOS) return list;
  const out: T[] = [];
  for (const x of list) { const img = await canvasSafe(x.img); if (img) out.push({ ...x, img }); }
  return out;
}

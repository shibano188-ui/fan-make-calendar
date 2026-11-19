import { useEffect, useSyncExternalStore } from 'react';
import { supabase } from './supabase';
import { eventFromRow } from './api';
import { parseImageUrls } from './constants';
import { deriveItemType } from '../design/tokens';
import type { CalendarEvent } from '../types';
import type { PrintItem, PrintMode, PrintRec, RecordKind } from './print/print';

// 自分の記録（買った・行ったを刷った1枚）。2026-11-19 柴野。表は sql/2026-11-19-records.sql。
// 読むのは自分の分だけ。書くのは RPC print_record だけ（1つの予定に1枚・刷り直しはできない）。
// 表がまだ無い環境では空のまま（画面は何も変わらない）。

export type MyRecord = PrintRec & { eventId: string; event: CalendarEvent | null; work?: string };

type State = { userId: string | null; list: MyRecord[]; ready: boolean };
let state: State = { userId: null, list: [], ready: false };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
let loading: Promise<void> | null = null;

function toRec(row: Record<string, unknown>, ev: CalendarEvent | null, work?: string): MyRecord {
  return {
    id: row.id as string, eventId: row.event_id as string, kind: row.kind as RecordKind, day: row.day as string,
    serial: row.serial as number, paper: row.paper as string, punch: row.punch as string, mode: row.mode as PrintMode,
    seed: row.seed as number, event: ev, work,
  };
}

async function workNames(ids: string[]): Promise<Map<string, string>> {
  const m = new Map<string, string>();
  if (!ids.length) return m;
  const { data } = await supabase.from('works').select('id, name').in('id', ids);
  for (const w of data ?? []) m.set(w.id as string, w.name as string);
  return m;
}

async function load(userId: string): Promise<void> {
  const { data, error } = await supabase.from('records').select('*').eq('user_id', userId).order('day').order('serial');
  if (error || state.userId !== userId) { if (state.userId === userId) { state = { ...state, ready: true }; emit(); } return; }
  const rows = (data ?? []) as Record<string, unknown>[];
  const ids = [...new Set(rows.map((r) => r.event_id as string))];
  const evs = new Map<string, CalendarEvent>();
  for (let i = 0; i < ids.length; i += 100) {
    const { data: es } = await supabase.from('events').select('*').in('id', ids.slice(i, i + 100));
    for (const e of es ?? []) { const ev = eventFromRow(e as Record<string, unknown>); evs.set(ev.id, ev); }
  }
  const names = await workNames([...new Set([...evs.values()].map((e) => e.workId).filter((w): w is string => !!w))]);
  if (state.userId !== userId) return;
  state = {
    userId, ready: true,
    list: rows.map((r) => { const ev = evs.get(r.event_id as string) ?? null; return toRec(r, ev, ev?.workId ? names.get(ev.workId) : undefined); }),
  };
  emit();
}

function ensure(userId: string | null | undefined): void {
  const id = userId ?? null;
  if (state.userId === id && (state.ready || loading)) return;
  state = { userId: id, list: [], ready: !id };
  emit();
  if (!id) return;
  loading = load(id).finally(() => { loading = null; });
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

/** 自分の記録（日付の順）。enabled が false なら取りに行かない */
export function useMyRecords(userId: string | null | undefined, enabled = true): MyRecord[] {
  useEffect(() => { if (enabled) ensure(userId); }, [userId, enabled]);
  const s = useSyncExternalStore(subscribe, () => state, () => state);
  return enabled && s.userId === (userId ?? null) ? s.list : EMPTY;
}
const EMPTY: MyRecord[] = [];

/** その予定の、自分の記録（無ければ null） */
export function findRecord(eventId: string, kind: RecordKind): MyRecord | null {
  return state.list.find((r) => r.eventId === eventId && r.kind === kind) ?? null;
}

/** 刷る。もう刷ってあればそれが返る（1つの予定に1枚）。文字だけの1枚は、刷り方を選べば1回だけ置き換わる */
export async function printMyRecord(event: CalendarEvent, kind: RecordKind, mode: PrintMode, work?: string): Promise<MyRecord | null> {
  const { data, error } = await supabase.rpc('print_record', { p_event_id: event.id, p_kind: kind, p_mode: mode });
  if (error || !data) return null;
  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown>;
  const rec = toRec(row, event, work);
  const rest = state.list.filter((r) => r.id !== rec.id);
  state = { ...state, list: [...rest, rec].sort((a, b) => a.day.localeCompare(b.day) || a.serial - b.serial) };
  emit();
  return rec;
}

/** 刷る部品に渡す、予定の中身 */
export function printItemOf(e: CalendarEvent | null, work?: string): PrintItem {
  return {
    title: e?.title ?? '（消えた予定）',
    work,
    image: e ? parseImageUrls(e.imageUrl)[0] : undefined,
    date: e?.date ?? null,
    price: e?.price,
    isEvent: e ? deriveItemType(e) === 'event' : false,
    place: e?.prefecture ?? undefined,
  };
}

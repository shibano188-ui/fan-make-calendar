import { supabase } from './supabase';
import type { CalendarEvent } from '../types';

export type Work = {
  id: string;
  name: string;
  participantCount: number;
};

// ─── 作品 ──────────────────────────────────────────────────────────

export async function listWorks(): Promise<Work[]> {
  const { data, error } = await supabase
    .from('works')
    .select('id, name, participant_count')
    .order('participant_count', { ascending: false })
    .limit(20);
  if (error) throw error;
  return (data ?? []).map(w => ({ id: w.id, name: w.name, participantCount: w.participant_count }));
}

export async function searchWorks(query: string): Promise<Work[]> {
  const { data, error } = await supabase
    .from('works')
    .select('id, name, participant_count')
    .ilike('name', `%${query}%`)
    .order('participant_count', { ascending: false })
    .limit(10);
  if (error) throw error;
  return (data ?? []).map(w => ({ id: w.id, name: w.name, participantCount: w.participant_count }));
}

export async function getWorkById(id: string): Promise<Work | null> {
  const { data, error } = await supabase
    .from('works')
    .select('id, name, participant_count')
    .eq('id', id)
    .single();
  if (error) return null;
  return { id: data.id, name: data.name, participantCount: data.participant_count };
}

export async function getOrCreateWork(name: string): Promise<Work> {
  const { data: existing } = await supabase
    .from('works')
    .select('id, name, participant_count')
    .eq('name', name)
    .maybeSingle();

  if (existing) {
    return { id: existing.id, name: existing.name, participantCount: existing.participant_count };
  }

  const { data: created, error } = await supabase
    .from('works')
    .insert({ name })
    .select('id, name, participant_count')
    .single();

  // 競合時（別ユーザーが同時作成）は再取得
  if (error) {
    if (error.code === '23505') {
      const { data: retry } = await supabase
        .from('works')
        .select('id, name, participant_count')
        .eq('name', name)
        .single();
      if (retry) return { id: retry.id, name: retry.name, participantCount: retry.participant_count };
    }
    throw error;
  }

  return { id: created.id, name: created.name, participantCount: created.participant_count };
}

// ─── イベント ──────────────────────────────────────────────────────

function rowToEvent(e: Record<string, unknown>): CalendarEvent {
  return {
    id: e.id as string,
    title: e.title as string,
    date: e.event_date as string,
    time: (e.event_time as string | null) ?? undefined,
    category: (e.category as string | null) ?? undefined,
    link: (e.link_url as string | null) ?? undefined,
    memo: (e.memo as string | null) ?? undefined,
    likes: (e.like_count as number) ?? 0,
    likedByMe: false, // 2-C で実装
    createdAt: e.created_at as string,
  };
}

export async function listEvents(workId: string, year: number, month: number): Promise<CalendarEvent[]> {
  const m = String(month + 1).padStart(2, '0');
  const lastDay = new Date(year, month + 1, 0).getDate();
  const from = `${year}-${m}-01`;
  const to = `${year}-${m}-${String(lastDay).padStart(2, '0')}`;

  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('work_id', workId)
    .eq('pool', 0)
    .gte('event_date', from)
    .lte('event_date', to)
    .order('event_date', { ascending: true });

  if (error) throw error;
  return (data ?? []).map(rowToEvent);
}

export async function listEventsByDate(workId: string, date: string, userId?: string): Promise<CalendarEvent[]> {
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('work_id', workId)
    .eq('event_date', date)
    .eq('pool', 0)
    .order('event_time', { ascending: true, nullsFirst: true });

  if (error) throw error;
  const events = (data ?? []).map(rowToEvent);

  if (userId && events.length > 0) {
    const { data: likeData } = await supabase
      .from('likes')
      .select('event_id')
      .in('event_id', events.map(e => e.id))
      .eq('user_id', userId);
    const likedSet = new Set((likeData ?? []).map(l => l.event_id as string));
    return events.map(e => ({ ...e, likedByMe: likedSet.has(e.id) }));
  }

  return events;
}

export async function createEvents(
  workId: string,
  events: Pick<CalendarEvent, 'title' | 'date' | 'time' | 'category' | 'link' | 'memo'>[],
  authorId: string,
): Promise<void> {
  const rows = await Promise.all(events.map(async e => {
    let pool = 0;
    const { data: dups } = await supabase
      .from('events')
      .select('pool')
      .eq('work_id', workId)
      .eq('event_date', e.date)
      .eq('title', e.title);
    if (dups && dups.length > 0) {
      pool = Math.max(...dups.map(d => d.pool as number)) + 1;
    }
    return {
      work_id: workId,
      title: e.title,
      event_date: e.date,
      event_time: e.time ?? null,
      category: e.category ?? null,
      link_url: e.link ?? null,
      memo: e.memo ?? null,
      author_id: authorId,
      pool,
    };
  }));

  const { error } = await supabase.from('events').insert(rows);
  if (error) throw error;
}

// ─── いいね ────────────────────────────────────────────────────────

// 1タップ = +1（10回連打対応）
export async function addLikeTap(eventId: string, userId: string): Promise<number> {
  // likesテーブルにユーザー行を確保（初回のみ挿入）
  await supabase
    .from('likes')
    .upsert({ event_id: eventId, user_id: userId }, { onConflict: 'event_id,user_id', ignoreDuplicates: true });

  // like_countをインクリメント
  const { data: ev } = await supabase.from('events').select('like_count').eq('id', eventId).single();
  const newCount = (ev?.like_count ?? 0) + 1;
  await supabase.from('events').update({ like_count: newCount }).eq('id', eventId);
  return newCount;
}

export async function toggleLike(eventId: string, userId: string): Promise<{ liked: boolean; count: number }> {
  const { data: existing } = await supabase
    .from('likes')
    .select('id')
    .eq('event_id', eventId)
    .eq('user_id', userId)
    .maybeSingle();

  if (existing) {
    await supabase.from('likes').delete().eq('id', existing.id);
  } else {
    await supabase.from('likes').insert({ event_id: eventId, user_id: userId });
  }

  const { count } = await supabase
    .from('likes')
    .select('*', { count: 'exact', head: true })
    .eq('event_id', eventId);

  await supabase.from('events').update({ like_count: count ?? 0 }).eq('id', eventId);

  return { liked: !existing, count: count ?? 0 };
}

// ─── ユーザー設定 ──────────────────────────────────────────────────

export type SupabaseUserSettings = {
  theme?: string;
  font?: string;
  accentColor?: string;
};

export async function getUserSettings(userId: string): Promise<SupabaseUserSettings | null> {
  const { data, error } = await supabase
    .from('user_settings')
    .select('theme, font, accent_color')
    .eq('user_id', userId)
    .maybeSingle();
  if (error || !data) return null;
  return { theme: data.theme, font: data.font, accentColor: data.accent_color };
}

export async function updateUserSettings(userId: string, s: SupabaseUserSettings): Promise<void> {
  const { error } = await supabase
    .from('user_settings')
    .upsert(
      { user_id: userId, theme: s.theme, font: s.font, accent_color: s.accentColor, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    );
  if (error) throw error;
}

// ─── 参加履歴 ──────────────────────────────────────────────────────

export async function upsertParticipation(workId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('participations')
    .upsert(
      { work_id: workId, user_id: userId, last_visited_at: new Date().toISOString() },
      { onConflict: 'work_id,user_id' },
    );
  if (error) throw error;
}

export async function leaveCalendar(workId: string, userId: string): Promise<void> {
  await supabase
    .from('participations')
    .delete()
    .eq('work_id', workId)
    .eq('user_id', userId);
}

export async function listRecentWorks(userId: string): Promise<Work[]> {
  const { data, error } = await supabase
    .from('participations')
    .select('work_id, last_visited_at, works(id, name, participant_count)')
    .eq('user_id', userId)
    .order('last_visited_at', { ascending: false })
    .limit(10);

  if (error) return [];

  return (data ?? [])
    .filter(p => p.works)
    .map(p => {
      const w = p.works as { id: string; name: string; participant_count: number };
      return { id: w.id, name: w.name, participantCount: w.participant_count };
    });
}

import { supabase } from './supabase';
import type { CalendarEvent, ReactionType, ReactionCounts } from '../types';

// ─── リアクション定数 ──────────────────────────────────────────────

export const REACTION_POINTS: Record<ReactionType, number> = {
  like: 1, want: 2, hot: 2, amazing: 3, best: 5,
};

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
    prefecture: (e.prefecture as string | null) ?? undefined,
    locationDetail: (e.location_detail as string | null) ?? undefined,
    locationMapLink: (e.location_map_link as string | null) ?? undefined,
    authorId: (e.author_id as string | null) ?? undefined,
    likes: (e.like_count as number) ?? 0,
    likedByMe: false,
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
  let events = (data ?? []).map(rowToEvent);

  // 投稿者の表示名を一括取得
  const authorIds = [...new Set(events.map(e => e.authorId).filter((id): id is string => !!id))];
  if (authorIds.length > 0) {
    const { data: nameData } = await supabase
      .from('user_settings')
      .select('user_id, display_name')
      .in('user_id', authorIds);
    const nameMap = Object.fromEntries((nameData ?? []).map(d => [d.user_id as string, d.display_name as string | null]));
    events = events.map(e => ({
      ...e,
      authorName: e.authorId ? (nameMap[e.authorId] ?? undefined) : undefined,
    }));
  }

  if (events.length > 0) {
    const { data: allReactions } = await supabase
      .from('likes')
      .select('event_id, reaction_type, user_id')
      .in('event_id', events.map(e => e.id));

    const countsMap: Record<string, ReactionCounts> = {};
    const userReactionMap: Record<string, ReactionType | null> = {};
    events.forEach(e => {
      countsMap[e.id] = { like: 0, want: 0, hot: 0, amazing: 0, best: 0 };
      userReactionMap[e.id] = null;
    });

    (allReactions ?? []).forEach(row => {
      const eid = row.event_id as string;
      const rt = ((row.reaction_type as string) ?? 'like') as ReactionType;
      if (eid in countsMap && rt in countsMap[eid]) countsMap[eid][rt]++;
      if (userId && row.user_id === userId) userReactionMap[eid] = rt;
    });

    return events.map(e => ({
      ...e,
      likedByMe: userReactionMap[e.id] !== null,
      userReaction: userReactionMap[e.id],
      reactionCounts: countsMap[e.id],
    }));
  }

  return events;
}

export async function createEvents(
  workId: string,
  events: Pick<CalendarEvent, 'title' | 'date' | 'time' | 'category' | 'link' | 'memo' | 'prefecture' | 'locationDetail' | 'locationMapLink'>[],
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
      prefecture: e.prefecture ?? null,
      location_detail: e.locationDetail ?? null,
      location_map_link: e.locationMapLink ?? null,
      author_id: authorId,
      pool,
    };
  }));

  const { error } = await supabase.from('events').insert(rows);
  if (error) throw error;
}

// ─── リアクション ──────────────────────────────────────────────────

export async function setReaction(
  eventId: string,
  userId: string,
  reactionType: ReactionType | null,
): Promise<ReactionCounts> {
  if (reactionType === null) {
    await supabase.from('likes').delete()
      .eq('event_id', eventId).eq('user_id', userId);
  } else {
    await supabase.from('likes').upsert(
      { event_id: eventId, user_id: userId, reaction_type: reactionType },
      { onConflict: 'event_id,user_id' },
    );
  }

  const { data } = await supabase
    .from('likes')
    .select('reaction_type')
    .eq('event_id', eventId);

  const counts: ReactionCounts = { like: 0, want: 0, hot: 0, amazing: 0, best: 0 };
  (data ?? []).forEach(row => {
    const rt = ((row.reaction_type as string) ?? 'like') as ReactionType;
    if (rt in counts) counts[rt]++;
  });

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  await supabase.from('events').update({ like_count: total }).eq('id', eventId);

  return counts;
}

// ─── いいね（後方互換・未使用） ────────────────────────────────────

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

export async function getDisplayName(userId: string): Promise<string | null> {
  const { data } = await supabase
    .from('user_settings')
    .select('display_name')
    .eq('user_id', userId)
    .maybeSingle();
  return (data?.display_name as string | null) ?? null;
}

export async function saveDisplayName(userId: string, name: string): Promise<void> {
  await supabase
    .from('user_settings')
    .upsert(
      { user_id: userId, display_name: name.trim() || null, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    );
}

export async function getHomePrefecture(userId: string): Promise<string | null> {
  const { data } = await supabase
    .from('user_settings')
    .select('home_prefecture')
    .eq('user_id', userId)
    .maybeSingle();
  return (data?.home_prefecture as string | null) ?? null;
}

export async function saveHomePrefecture(userId: string, prefecture: string | null): Promise<void> {
  await supabase
    .from('user_settings')
    .upsert(
      { user_id: userId, home_prefecture: prefecture, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    );
}

// ─── 共有テーマ ────────────────────────────────────────────────────

export type SharedThemeData = {
  theme: string;
  font: string;
  accentColor: string;
  communityThemeId: string;
  calWeekday?: string;
  calSaturday?: string;
  calSunday?: string;
  calOtherMonth?: string;
};

export type SharedTheme = {
  id: string;
  name: string;
  authorId: string;
  themeData: SharedThemeData;
  useCount: number;
  createdAt: string;
};

export async function listSharedThemes(): Promise<SharedTheme[]> {
  const { data, error } = await supabase
    .from('shared_themes')
    .select('id, name, author_id, theme_data, use_count, created_at')
    .order('use_count', { ascending: false })
    .limit(30);
  if (error) return [];
  return (data ?? []).map(r => ({
    id: r.id as string,
    name: (r.name as string) ?? '名前なし',
    authorId: r.author_id as string,
    themeData: r.theme_data as SharedThemeData,
    useCount: (r.use_count as number) ?? 0,
    createdAt: r.created_at as string,
  }));
}

export async function shareTheme(authorId: string, name: string, themeData: SharedThemeData): Promise<void> {
  const { error } = await supabase
    .from('shared_themes')
    .insert({ author_id: authorId, name, theme_data: themeData, use_count: 0 });
  if (error) throw error;
}

export async function incrementThemeUseCount(themeId: string): Promise<void> {
  const { data } = await supabase.from('shared_themes').select('use_count').eq('id', themeId).single();
  await supabase.from('shared_themes').update({ use_count: ((data?.use_count as number) ?? 0) + 1 }).eq('id', themeId);
}

export async function deleteSharedTheme(themeId: string): Promise<void> {
  const { data, error } = await supabase
    .from('shared_themes')
    .delete()
    .eq('id', themeId)
    .select();
  if (error) throw error;
  // RLSポリシーが未設定だと0行削除でもエラーにならないため明示的にチェック
  if (!data || data.length === 0) throw new Error('no_rows_deleted');
}

// ─── ウィジェット用 ────────────────────────────────────────────────

export async function getEventById(eventId: string): Promise<CalendarEvent | null> {
  const { data, error } = await supabase.from('events').select('*').eq('id', eventId).single();
  if (error) return null;
  return rowToEvent(data as Record<string, unknown>);
}

export async function listUpcomingEvents(workId: string, from: string, limit = 5): Promise<CalendarEvent[]> {
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('work_id', workId)
    .eq('pool', 0)
    .gte('event_date', from)
    .order('event_date', { ascending: true })
    .limit(limit);
  if (error) return [];
  return (data ?? []).map(e => rowToEvent(e as Record<string, unknown>));
}

export async function listAllParticipatedWorkEvents(
  userId: string, year: number, month: number,
): Promise<CalendarEvent[]> {
  const works = await listRecentWorks(userId);
  if (works.length === 0) return [];
  const m = String(month + 1).padStart(2, '0');
  const lastDay = new Date(year, month + 1, 0).getDate();
  const from = `${year}-${m}-01`;
  const to = `${year}-${m}-${String(lastDay).padStart(2, '0')}`;
  const workMap = Object.fromEntries(works.map(w => [w.id, w.name]));
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .in('work_id', works.map(w => w.id))
    .eq('pool', 0)
    .gte('event_date', from)
    .lte('event_date', to)
    .order('event_date', { ascending: true });
  if (error) throw error;
  return (data ?? []).map(e => ({
    ...rowToEvent(e as Record<string, unknown>),
    workId: e.work_id as string,
    workName: workMap[e.work_id as string] ?? '',
  }));
}

// ─── イベント削除 ─────────────────────────────────────────────────

export async function deleteEvent(eventId: string): Promise<void> {
  await supabase.from('likes').delete().eq('event_id', eventId);
  const { error } = await supabase.from('events').delete().eq('id', eventId);
  if (error) throw error;
}

// ─── 作品削除 ──────────────────────────────────────────────────────

export async function deleteWork(workId: string): Promise<void> {
  const { data: eventRows } = await supabase
    .from('events').select('id').eq('work_id', workId);
  if (eventRows && eventRows.length > 0) {
    await supabase.from('likes').delete().in('event_id', eventRows.map(e => e.id as string));
  }
  await supabase.from('events').delete().eq('work_id', workId);
  await supabase.from('participations').delete().eq('work_id', workId);
  const { error } = await supabase.from('works').delete().eq('id', workId);
  if (error) throw error;
}

// ─── 参加履歴 ──────────────────────────────────────────────────────

async function syncParticipantCount(workId: string): Promise<void> {
  const { count } = await supabase
    .from('participations')
    .select('*', { count: 'exact', head: true })
    .eq('work_id', workId);
  await supabase
    .from('works')
    .update({ participant_count: count ?? 0 })
    .eq('id', workId);
}

export async function upsertParticipation(workId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('participations')
    .upsert(
      { work_id: workId, user_id: userId, last_visited_at: new Date().toISOString() },
      { onConflict: 'work_id,user_id' },
    );
  if (error) throw error;
  await syncParticipantCount(workId);
}

export async function leaveCalendar(workId: string, userId: string): Promise<void> {
  await supabase
    .from('participations')
    .delete()
    .eq('work_id', workId)
    .eq('user_id', userId);
  await syncParticipantCount(workId);
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
      const w = p.works as unknown as { id: string; name: string; participant_count: number };
      return { id: w.id, name: w.name, participantCount: w.participant_count };
    });
}

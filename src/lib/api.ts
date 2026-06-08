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

// 投稿者名を一括解決するヘルパー
async function resolveAuthorNames(events: CalendarEvent[]): Promise<CalendarEvent[]> {
  const authorIds = [...new Set(events.map(e => e.authorId).filter((id): id is string => !!id))];
  if (authorIds.length === 0) return events;

  let nameMap: Record<string, string> = {};
  try {
    // サービスロールキーを使うVercel APIを経由してRLSを回避
    const res = await fetch('/api/display-names', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_ids: authorIds }),
    });
    if (res.ok) {
      const data = await res.json() as { user_id: string; display_name: string | null }[];
      nameMap = Object.fromEntries(data.map(d => [d.user_id, d.display_name ?? '匿名']));
    }
  } catch { /* fallback: all anonymous */ }

  return events.map(e => ({
    ...e,
    authorName: e.authorId ? (nameMap[e.authorId] ?? '匿名') : undefined,
  }));
}

// 「東京都」→「東京」「大阪府」→「大阪」「神奈川県」→「神奈川」に正規化（北海道はそのまま）
function normalizePrefecture(p: string | null | undefined): string | undefined {
  if (!p) return undefined;
  return p.replace(/[都府県]$/, '') || undefined;
}

function rowToEvent(e: Record<string, unknown>): CalendarEvent {
  return {
    id: e.id as string,
    title: e.title as string,
    date: e.event_date as string,
    time: ((e.event_time as string | null) ?? undefined)?.slice(0, 5),
    endDate: (e.end_date as string | null) ?? undefined,
    endTime: ((e.end_time as string | null) ?? undefined)?.slice(0, 5),
    category: (e.category as string | null) ?? undefined,
    link: (e.link_url as string | null) ?? undefined,
    memo: (e.memo as string | null) ?? undefined,
    prefecture: normalizePrefecture(e.prefecture as string | null),
    locationDetail: (e.location_detail as string | null) ?? undefined,
    locationMapLink: (e.location_map_link as string | null) ?? undefined,
    authorId: (e.author_id as string | null) ?? undefined,
    likes: (e.like_count as number) ?? 0,
    likedByMe: false,
    createdAt: e.created_at as string,
    imageUrl: (e.image_url as string | null) ?? undefined,
    sourceUrl: (e.source_url as string | null) ?? undefined,
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
    .lte('event_date', to)
    .or(`end_date.gte.${from},and(end_date.is.null,event_date.gte.${from})`)
    .order('event_date', { ascending: true });

  if (error) throw error;
  return resolveAuthorNames((data ?? []).map(rowToEvent));
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
  events: Pick<CalendarEvent, 'title' | 'date' | 'time' | 'endDate' | 'endTime' | 'category' | 'link' | 'memo' | 'prefecture' | 'locationDetail' | 'locationMapLink' | 'imageUrl' | 'sourceUrl'>[],
  authorId: string,
): Promise<string[]> {
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
      end_date: e.endDate ?? null,
      end_time: e.endTime ?? null,
      category: e.category ?? null,
      link_url: e.link ?? null,
      memo: e.memo ?? null,
      prefecture: normalizePrefecture(e.prefecture) ?? null,
      location_detail: e.locationDetail ?? null,
      location_map_link: e.locationMapLink ?? null,
      ...(e.imageUrl ? { image_url: e.imageUrl } : {}),
      ...(e.sourceUrl ? { source_url: e.sourceUrl } : {}),
      author_id: authorId,
      pool,
    };
  }));

  const { data, error } = await supabase.from('events').insert(rows).select('id');
  if (error) throw error;
  return (data ?? []).map(r => r.id as string);
}

// ─── 重複検知 ──────────────────────────────────────────────────────

export type DuplicateMatch = {
  id: string;
  title: string;
  date: string;
  endDate: string | null;
  prefecture: string | null;
  sourceUrl: string | null;
  authorId: string | null;
};

function normalizeTitleForDup(t: string): string {
  return t.replace(/　/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
}

function datesOverlap(aStart: string, aEnd: string | null, bStart: string, bEnd: string | null): boolean {
  const aS = aStart, aE = aEnd ?? aStart;
  const bS = bStart, bE = bEnd ?? bStart;
  return aS <= bE && bS <= aE;
}

export async function findDuplicateEvents(
  workId: string,
  title: string,
  date: string,
  endDate?: string | null,
  sourceUrl?: string | null,
  category?: string | null,
): Promise<{ byUrl: DuplicateMatch[]; byTitle: DuplicateMatch[] }> {
  const seen = new Set<string>();
  const byUrl: DuplicateMatch[] = [];
  const byTitle: DuplicateMatch[] = [];

  if (sourceUrl) {
    const { data } = await supabase
      .from('events')
      .select('id, title, event_date, end_date, prefecture, source_url, author_id')
      .eq('work_id', workId)
      .eq('source_url', sourceUrl)
      .eq('pool', 0);
    for (const row of data ?? []) {
      seen.add(row.id as string);
      byUrl.push({
        id: row.id as string,
        title: row.title as string,
        date: row.event_date as string,
        endDate: (row.end_date as string | null) ?? null,
        prefecture: normalizePrefecture(row.prefecture as string | null) ?? null,
        sourceUrl: row.source_url as string | null,
        authorId: (row.author_id as string | null) ?? null,
      });
    }
  }

  const norm = normalizeTitleForDup(title);
  // プレフィックス+ワイルドカードで検索: 「イベント」→「イベント 東京」等の地名付きも検知
  const [{ data: d1 }, { data: d2 }] = await Promise.all([
    supabase.from('events').select('id, title, event_date, end_date, prefecture, source_url, category, author_id').eq('work_id', workId).eq('pool', 0).ilike('title', `${title}%`),
    supabase.from('events').select('id, title, event_date, end_date, prefecture, source_url, category, author_id').eq('work_id', workId).eq('pool', 0).ilike('title', `${norm}%`),
  ]);
  const dedup = new Set<string>();
  const titleData = [...(d1 ?? []), ...(d2 ?? [])].filter(r => {
    if (dedup.has(r.id as string)) return false;
    dedup.add(r.id as string);
    return true;
  });
  for (const row of titleData) {
    const rowCategory = (row.category as string | null) ?? null;
    // 両方カテゴリあって異なる場合はスキップ（別イベント扱い）
    if (category && rowCategory && category !== rowCategory) continue;
    // 正規化タイトルがnormと完全一致、またはnorm+スペースで始まる（地名付きバリアント）
    const rowNorm = normalizeTitleForDup(row.title as string);
    const titleMatch = rowNorm === norm || rowNorm.startsWith(`${norm} `);
    if (
      !seen.has(row.id as string) &&
      titleMatch &&
      datesOverlap(date, endDate ?? null, row.event_date as string, (row.end_date as string | null) ?? null)
    ) {
      seen.add(row.id as string);
      byTitle.push({
        id: row.id as string,
        title: row.title as string,
        date: row.event_date as string,
        endDate: (row.end_date as string | null) ?? null,
        prefecture: normalizePrefecture(row.prefecture as string | null) ?? null,
        sourceUrl: row.source_url as string | null,
        authorId: (row.author_id as string | null) ?? null,
      });
    }
  }

  return { byUrl, byTitle };
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

export async function getAvatarEmoji(userId: string): Promise<string | null> {
  const { data } = await supabase
    .from('user_settings')
    .select('avatar_emoji')
    .eq('user_id', userId)
    .maybeSingle();
  return (data?.avatar_emoji as string | null) ?? null;
}

export async function saveAvatarEmoji(userId: string, emoji: string | null): Promise<void> {
  await supabase
    .from('user_settings')
    .upsert(
      { user_id: userId, avatar_emoji: emoji, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    );
}

export async function getXUrl(userId: string): Promise<string | null> {
  const { data } = await supabase
    .from('user_settings')
    .select('x_url')
    .eq('user_id', userId)
    .maybeSingle();
  return (data?.x_url as string | null) ?? null;
}

export async function saveXUrl(userId: string, xUrl: string | null): Promise<void> {
  await supabase
    .from('user_settings')
    .upsert(
      { user_id: userId, x_url: xUrl || null, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    );
}

export async function getUserPublicProfile(userId: string): Promise<{
  displayName: string | null;
  xUrl: string | null;
  avatarEmoji: string | null;
  postedCount: number;
  receivedLikes: number;
  likesGiven: number;
  reactionsGiven: number;
  works: number;
  birthdayPosts: number;
  collabPosts: number;
}> {
  const [posted, likes, likesGv, reactionsGv, worksArr, birthday, collab] = await Promise.all([
    countUserPostedEvents(userId),
    getTotalReceivedLikes(userId),
    countUserLikesGiven(userId),
    countUserReactionsGiven(userId),
    listRecentWorks(userId),
    countUserEventsByCategory(userId, '誕生日'),
    countUserEventsByCategory(userId, 'コラボ'),
  ]);
  // display_name / x_url / avatar_emoji はRLS回避のためAPIエンドポイント経由で取得
  let displayName: string | null = null;
  let xUrl: string | null = null;
  let avatarEmoji: string | null = null;
  try {
    const res = await fetch('/api/display-names', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_ids: [userId] }),
    });
    if (res.ok) {
      const data = await res.json() as { user_id: string; display_name: string | null; x_url: string | null; avatar_emoji: string | null }[];
      const row = data[0];
      if (row) {
        displayName = row.display_name ?? null;
        xUrl = row.x_url ?? null;
        avatarEmoji = row.avatar_emoji ?? null;
      }
    }
  } catch { /* fallback null */ }
  return {
    displayName,
    xUrl,
    avatarEmoji,
    postedCount: posted,
    receivedLikes: likes,
    likesGiven: likesGv,
    reactionsGiven: reactionsGv,
    works: worksArr.length,
    birthdayPosts: birthday,
    collabPosts: collab,
  };
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
    .lte('event_date', to)
    .or(`end_date.gte.${from},and(end_date.is.null,event_date.gte.${from})`)
    .order('event_date', { ascending: true });
  if (error) throw error;
  const events = (data ?? []).map(e => ({
    ...rowToEvent(e as Record<string, unknown>),
    workId: e.work_id as string,
    workName: workMap[e.work_id as string] ?? '',
  }));
  return resolveAuthorNames(events);
}

// ─── イベント編集 ─────────────────────────────────────────────────

export async function updateEvent(
  eventId: string,
  data: Partial<Pick<CalendarEvent, 'title' | 'date' | 'time' | 'endDate' | 'endTime' | 'category' | 'link' | 'memo' | 'prefecture' | 'locationDetail' | 'locationMapLink'>>,
): Promise<void> {
  const row: Record<string, unknown> = {};
  if (data.title !== undefined) row.title = data.title;
  if (data.date !== undefined) row.event_date = data.date;
  if ('time' in data) row.event_time = data.time || null;
  if ('endDate' in data) row.end_date = data.endDate || null;
  if ('endTime' in data) row.end_time = data.endTime || null;
  if ('category' in data) row.category = data.category || null;
  if ('link' in data) row.link_url = data.link || null;
  if ('memo' in data) row.memo = data.memo || null;
  if ('prefecture' in data) row.prefecture = normalizePrefecture(data.prefecture) ?? null;
  if ('locationDetail' in data) row.location_detail = data.locationDetail || null;
  if ('locationMapLink' in data) row.location_map_link = data.locationMapLink || null;
  const { error } = await supabase.from('events').update(row).eq('id', eventId);
  if (error) throw error;
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

// ─── リアクション ─────────────────────────────────────────────────

export async function setReaction(eventId: string, userId: string, type: string | null): Promise<void> {
  if (type === null) {
    await supabase.from('reactions').delete().eq('event_id', eventId).eq('user_id', userId);
  } else {
    await supabase.from('reactions').upsert(
      { event_id: eventId, user_id: userId, reaction_type: type },
      { onConflict: 'event_id,user_id' },
    );
  }
}

export async function getReactionData(
  eventId: string,
  userId?: string,
): Promise<{ counts: Record<string, number>; myReaction: string | null }> {
  const { data } = await supabase.from('reactions').select('reaction_type, user_id').eq('event_id', eventId);
  const counts: Record<string, number> = {};
  let myReaction: string | null = null;
  for (const row of data ?? []) {
    const t = row.reaction_type as string;
    counts[t] = (counts[t] ?? 0) + 1;
    if (userId && row.user_id === userId) myReaction = t;
  }
  return { counts, myReaction };
}

export async function getMyReactionsBatch(eventIds: string[], userId: string): Promise<Record<string, string>> {
  if (eventIds.length === 0) return {};
  const { data } = await supabase
    .from('reactions')
    .select('event_id, reaction_type')
    .in('event_id', eventIds)
    .eq('user_id', userId);
  return Object.fromEntries((data ?? []).map(r => [r.event_id as string, r.reaction_type as string]));
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

// ─── 発見タブ: 参加中の全作品の今日以降のイベント ────────────────
export async function listUpcomingParticipatedEvents(
  userId: string,
  limit = 60,
): Promise<CalendarEvent[]> {
  const { data: parts } = await supabase
    .from('participations')
    .select('work_id')
    .eq('user_id', userId);
  const workIds = (parts ?? []).map(p => p.work_id as string);
  if (workIds.length === 0) return [];

  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('events')
    .select('*, works(name)')
    .in('work_id', workIds)
    .eq('pool', 0)
    .or(`end_date.gte.${today},and(end_date.is.null,event_date.gte.${today})`)
    .limit(limit);
  if (error) throw error;

  const events = (data ?? []).map(e => {
    const ev = rowToEvent(e as Record<string, unknown>);
    const works = (e as Record<string, unknown>).works as { name: string } | null;
    return { ...ev, workId: (e as Record<string, unknown>).work_id as string, workName: works?.name ?? undefined };
  });

  // 開催中（開始日が今日より前）を先頭に終了日昇順、それ以降は開始日昇順
  const ongoing = events
    .filter(e => e.date < today)
    .sort((a, b) => (a.endDate ?? '').localeCompare(b.endDate ?? ''));
  const upcoming = events
    .filter(e => e.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date));

  return resolveAuthorNames([...ongoing, ...upcoming]);
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

export async function countUserPostedEvents(userId: string): Promise<number> {
  const { count } = await supabase
    .from('events')
    .select('id', { count: 'exact', head: true })
    .eq('author_id', userId);
  return count ?? 0;
}

export async function getTotalReceivedLikes(userId: string): Promise<number> {
  const { data } = await supabase
    .from('events')
    .select('like_count')
    .eq('author_id', userId);
  return (data ?? []).reduce((sum, e) => sum + ((e.like_count as number) ?? 0), 0);
}

export async function countUserLikesGiven(userId: string): Promise<number> {
  const { count } = await supabase
    .from('likes')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);
  return count ?? 0;
}

export async function countUserReactionsGiven(userId: string): Promise<number> {
  const { count } = await supabase
    .from('reactions')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);
  return count ?? 0;
}

export async function countUserEventsByCategory(userId: string, category: string): Promise<number> {
  const { count } = await supabase
    .from('events')
    .select('id', { count: 'exact', head: true })
    .eq('author_id', userId)
    .eq('category', category);
  return count ?? 0;
}

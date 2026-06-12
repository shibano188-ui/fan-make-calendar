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
  const { data } = await supabase
    .from('user_settings')
    .select('user_id, display_name')
    .in('user_id', authorIds);
  const nameMap = Object.fromEntries(
    (data ?? []).map(d => [d.user_id as string, (d.display_name as string | null) ?? '匿名']),
  );
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
    date: (e.event_date as string | null) ?? null,
    dateLabel: (e.date_label as string | null) ?? undefined,
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
    workId: (e.work_id as string | null) ?? undefined,
    likes: (e.like_count as number) ?? 0,
    likedByMe: false,
    createdAt: e.created_at as string,
    imageUrl: (e.image_url as string | null) ?? undefined,
    sourceUrl: (e.source_url as string | null) ?? undefined,
    isOrderMade: (e.is_order_made as boolean | null) ?? false,
    preorderStart: (e.preorder_start_date as string | null) ?? undefined,
    preorderEnd: (e.preorder_end_date as string | null) ?? undefined,
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
  events: Pick<CalendarEvent, 'title' | 'date' | 'dateLabel' | 'time' | 'endDate' | 'endTime' | 'category' | 'link' | 'memo' | 'prefecture' | 'locationDetail' | 'locationMapLink' | 'imageUrl' | 'sourceUrl' | 'isOrderMade' | 'preorderStart' | 'preorderEnd'>[],
  authorId: string,
): Promise<string[]> {
  const rows = await Promise.all(events.map(async e => {
    let pool = 0;
    if (e.date) {
      const { data: dups } = await supabase
        .from('events')
        .select('pool')
        .eq('work_id', workId)
        .eq('event_date', e.date)
        .eq('title', e.title);
      if (dups && dups.length > 0) {
        pool = Math.max(...dups.map(d => d.pool as number)) + 1;
      }
    }
    return {
      work_id: workId,
      title: e.title,
      event_date: e.date || null,
      date_label: e.dateLabel ?? null,
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
      ...(e.sourceUrl ? { source_url: normalizeSourceUrl(e.sourceUrl) } : {}),
      is_order_made: e.isOrderMade ?? false,
      preorder_start_date: e.preorderStart ?? null,
      preorder_end_date: e.preorderEnd ?? null,
      author_id: authorId,
      pool,
    };
  }));

  const { data, error } = await supabase.from('events').insert(rows).select('id');
  if (error) throw error;
  return (data ?? []).map(r => r.id as string);
}

export async function listPreorderEvents(workIds: string[]): Promise<CalendarEvent[]> {
  if (workIds.length === 0) return [];
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .in('work_id', workIds)
    .eq('pool', 0)
    .eq('is_order_made', true)
    .order('preorder_end_date', { ascending: true, nullsFirst: false });
  if (error) throw error;
  return (data ?? []).map(rowToEvent).filter(e => {
    if (e.preorderEnd && e.preorderEnd < today) return false;
    if (!e.preorderEnd && e.date && e.date < today) return false;
    return true;
  });
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

// 重複判定で情報量の少ない汎用語（同日の別イベント同士の誤検知を防ぐ）
const DUP_GENERIC_WORDS = ['発売', '開催', '開始', '決定', '予約', '受付', '販売', '登場', '公開', '情報', '解禁', 'イベント', 'グッズ', 'キャンペーン', 'コラボ'];

// タイトルから記号・作品名・汎用語を除去してキーワード部分だけを残す
function stripForKeywords(title: string, workName?: string | null): string {
  let t = title
    .replace(/[【】「」『』（）()[\]・！!？?～〜:：、。,.\s　]+/g, ' ')
    .toLowerCase()
    .trim();
  if (workName) t = t.split(workName.toLowerCase()).join(' ');
  for (const w of DUP_GENERIC_WORDS) t = t.split(w).join(' ');
  return t.replace(/\s+/g, ' ').trim();
}

// 文字バイグラムの重なり率（overlap coefficient）。日本語は分かち書き不要なバイグラム比較が実用的
function bigramSimilarity(a: string, b: string): number {
  const ca = a.replace(/\s+/g, '');
  const cb = b.replace(/\s+/g, '');
  if (!ca || !cb) return 0;
  if (ca === cb) return 1;
  if (ca.length < 2 || cb.length < 2) return 0;
  const grams = (s: string) => {
    const set = new Set<string>();
    for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2));
    return set;
  };
  const A = grams(ca);
  const B = grams(cb);
  let inter = 0;
  for (const g of A) if (B.has(g)) inter++;
  return inter / Math.min(A.size, B.size);
}

// sourceUrlを正規化: クエリパラメータ除去・twitter.com→x.com統一・末尾スラッシュ除去
export function normalizeSourceUrl(url: string): string {
  try {
    const u = new URL(url);
    u.search = '';
    u.hash = '';
    if (u.hostname === 'twitter.com') u.hostname = 'x.com';
    return u.toString().replace(/\/$/, '');
  } catch {
    return url.trim();
  }
}

// X/TwitterのツイートIDを抽出（URLフォーマットに依存しない照合用）
function extractTweetId(url: string): string | null {
  const m = url.match(/\/status\/(\d+)/);
  return m?.[1] ?? null;
}

export async function findDuplicateEvents(
  workId: string,
  title: string,
  sourceUrl?: string | null,
  category?: string | null,
  opts?: { date?: string | null; endDate?: string | null; workName?: string | null; prefecture?: string | null },
): Promise<{ byUrl: DuplicateMatch[]; byTitle: DuplicateMatch[]; byDateKeyword: DuplicateMatch[] }> {
  const seen = new Set<string>();
  const byUrl: DuplicateMatch[] = [];
  const byTitle: DuplicateMatch[] = [];
  const byDateKeyword: DuplicateMatch[] = [];

  if (sourceUrl) {
    const normUrl = normalizeSourceUrl(sourceUrl);
    const tweetId = extractTweetId(sourceUrl);
    // X/TwitterURLはツイートIDのパターンマッチで検索（twitter.com/x.com・クエリパラメータゆれを吸収）
    // 非TwitterURLは正規化URL・元URLの2クエリで対応
    const queries = tweetId
      ? [supabase.from('events').select('id, title, event_date, end_date, prefecture, source_url, author_id').eq('work_id', workId).eq('pool', 0).ilike('source_url', `%/status/${tweetId}%`)]
      : [
          supabase.from('events').select('id, title, event_date, end_date, prefecture, source_url, author_id').eq('work_id', workId).eq('pool', 0).eq('source_url', sourceUrl),
          supabase.from('events').select('id, title, event_date, end_date, prefecture, source_url, author_id').eq('work_id', workId).eq('pool', 0).eq('source_url', normUrl),
        ];
    const results = await Promise.all(queries);
    const urlDedup = new Set<string>();
    for (const { data } of results) {
      for (const row of data ?? []) {
        if (urlDedup.has(row.id as string)) continue;
        urlDedup.add(row.id as string);
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
    // event_date が null のイベントは壊れたデータとして重複対象から除外
    if (!r.event_date) return false;
    return true;
  });
  for (const row of titleData) {
    const rowCategory = (row.category as string | null) ?? null;
    // 両方カテゴリあって異なる場合はスキップ（別イベント扱い）
    if (category && rowCategory && category !== rowCategory) continue;
    // 正規化タイトルがnormと完全一致、またはnorm+スペースで始まる（地名付きバリアント）
    const rowNorm = normalizeTitleForDup(row.title as string);
    const titleMatch = rowNorm === norm || rowNorm.startsWith(`${norm} `);
    if (!seen.has(row.id as string) && titleMatch) {
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

  // ─── 日付一致 + キーワード類似度 ───
  // 期間が重なる既存予定のうち、作品名・汎用語を除いたキーワードが半分以上重なるものを検知
  if (opts?.date) {
    const newStart = opts.date;
    const newEnd = opts.endDate || opts.date;
    const newKeywords = stripForKeywords(title, opts.workName);
    if (newKeywords) {
      const { data: d3 } = await supabase
        .from('events')
        .select('id, title, event_date, end_date, prefecture, source_url, category, author_id')
        .eq('work_id', workId).eq('pool', 0)
        .lte('event_date', newEnd)
        .or(`end_date.gte.${newStart},and(end_date.is.null,event_date.gte.${newStart})`);
      const newPref = normalizePrefecture(opts.prefecture ?? null) ?? null;
      for (const row of d3 ?? []) {
        if (seen.has(row.id as string)) continue;
        if (!row.event_date) continue;
        const rowPref = normalizePrefecture(row.prefecture as string | null) ?? null;
        if (newPref && rowPref && newPref !== rowPref) continue;
        const rowKeywords = stripForKeywords(row.title as string, opts.workName);
        if (!rowKeywords) continue;
        const sim = bigramSimilarity(newKeywords, rowKeywords);
        // カテゴリ不一致は通常スキップだが、類似度が非常に高い場合は同一予定の
        // カテゴリ選択ゆれ（例: グッズ/グルメ）とみなして検知する
        const rowCategory = (row.category as string | null) ?? null;
        const catMismatch = !!(category && rowCategory && category !== rowCategory);
        if (sim < (catMismatch ? 0.75 : 0.5)) continue;
        seen.add(row.id as string);
        byDateKeyword.push({
          id: row.id as string,
          title: row.title as string,
          date: row.event_date as string,
          endDate: (row.end_date as string | null) ?? null,
          prefecture: rowPref,
          sourceUrl: row.source_url as string | null,
          authorId: (row.author_id as string | null) ?? null,
        });
      }
    }
  }

  return { byUrl, byTitle, byDateKeyword };
}

// ─── いいね ────────────────────────────────────────────────────────

// 1タップ = +1（10回連打対応）
// like行の確保と like_count 加算は SECURITY DEFINER 関数で行う（events直接UPDATEを廃止）
export async function addLikeTap(eventId: string, _userId: string): Promise<number> {
  const { data, error } = await supabase.rpc('add_like_tap', { p_event_id: eventId });
  if (error) throw error;
  return (data as number) ?? 0;
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
  const [settingsRes, posted, likes, likesGv, reactionsGv, worksArr, birthday, collab] = await Promise.all([
    supabase.from('user_settings').select('display_name, x_url, avatar_emoji').eq('user_id', userId).maybeSingle(),
    countUserPostedEvents(userId),
    getTotalReceivedLikes(userId),
    countUserLikesGiven(userId),
    countUserReactionsGiven(userId),
    listRecentWorks(userId),
    countUserEventsByCategory(userId, '誕生日'),
    countUserEventsByCategory(userId, 'コラボ'),
  ]);
  return {
    displayName: (settingsRes.data?.display_name as string | null) ?? null,
    xUrl: (settingsRes.data?.x_url as string | null) ?? null,
    avatarEmoji: (settingsRes.data?.avatar_emoji as string | null) ?? null,
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
  // 全参加作品を取得（listRecentWorks の limit(10) を使わない）
  const { data: parts } = await supabase
    .from('participations')
    .select('work_id, works(id, name)')
    .eq('user_id', userId);
  const workIds = (parts ?? []).map(p => p.work_id as string);
  if (workIds.length === 0) return [];
  const workMap: Record<string, string> = {};
  for (const p of parts ?? []) {
    const w = (p as unknown as { works: { id: string; name: string } | null }).works;
    if (w) workMap[w.id] = w.name;
  }
  const m = String(month + 1).padStart(2, '0');
  const lastDay = new Date(year, month + 1, 0).getDate();
  const from = `${year}-${m}-01`;
  const to = `${year}-${m}-${String(lastDay).padStart(2, '0')}`;
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .in('work_id', workIds)
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
  data: Partial<Pick<CalendarEvent, 'title' | 'date' | 'dateLabel' | 'time' | 'endDate' | 'endTime' | 'category' | 'link' | 'memo' | 'prefecture' | 'locationDetail' | 'locationMapLink' | 'isOrderMade' | 'preorderStart' | 'preorderEnd'>>,
): Promise<void> {
  const row: Record<string, unknown> = {};
  if (data.title !== undefined) row.title = data.title;
  if (data.date !== undefined) row.event_date = data.date || null;
  if ('dateLabel' in data) row.date_label = data.dateLabel ?? null;
  if ('time' in data) row.event_time = data.time || null;
  if ('endDate' in data) row.end_date = data.endDate || null;
  if ('endTime' in data) row.end_time = data.endTime || null;
  if ('category' in data) row.category = data.category || null;
  if ('link' in data) row.link_url = data.link || null;
  if ('memo' in data) row.memo = data.memo || null;
  if ('prefecture' in data) row.prefecture = normalizePrefecture(data.prefecture) ?? null;
  if ('locationDetail' in data) row.location_detail = data.locationDetail || null;
  if ('locationMapLink' in data) row.location_map_link = data.locationMapLink || null;
  if ('isOrderMade' in data) row.is_order_made = data.isOrderMade ?? false;
  if ('preorderStart' in data) row.preorder_start_date = data.preorderStart || null;
  if ('preorderEnd' in data) row.preorder_end_date = data.preorderEnd || null;
  const { error } = await supabase.from('events').update(row).eq('id', eventId);
  if (error) throw error;
}

export async function updatePreorderInfo(
  eventId: string,
  data: { isOrderMade: boolean; preorderStart: string; preorderEnd: string; link: string; date: string | null; dateLabel: string | null },
): Promise<void> {
  // 参加作品なら他人の予定も更新するため SECURITY DEFINER 関数（参加者チェック付き）経由
  const { error } = await supabase.rpc('update_preorder_info', {
    p_event_id: eventId,
    p_is_order_made: data.isOrderMade,
    p_preorder_start: data.preorderStart || null,
    p_preorder_end: data.preorderEnd || null,
    p_link: data.link || '',
    p_date: data.date,
    p_date_label: data.dateLabel,
  });
  if (error) throw error;
}

// ─── イベント削除 ─────────────────────────────────────────────────

export async function deleteEvent(eventId: string): Promise<void> {
  // 本人のみ削除可（投稿者チェックは関数側）。likes も関数内で削除
  const { error } = await supabase.rpc('delete_event', { p_event_id: eventId });
  if (error) throw error;
}

// ─── 通報 ──────────────────────────────────────────────────────────

export async function reportEvent(eventId: string, reporterId: string, reason: string): Promise<void> {
  const { error } = await supabase.from('reports').insert({
    event_id: eventId,
    reporter_id: reporterId,
    reason,
  });
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
  const monthStart = today.slice(0, 7) + '-01';

  // 通常イベント + 予約イベントを並列取得
  // 予約イベントは .eq('is_order_made', true) を単独メソッドで使うことで確実に取得する
  // （.or() 内の is_order_made.eq.true は Supabase クライアントの複合条件で動作しないケースがある）
  const [mainResult, preorderResult] = await Promise.all([
    supabase
      .from('events')
      .select('*, works(name)')
      .in('work_id', workIds)
      .eq('pool', 0)
      .or(`end_date.gte.${today},and(end_date.is.null,event_date.gte.${monthStart})`)
      .order('event_date', { ascending: true, nullsFirst: false })
      .limit(limit),
    supabase
      .from('events')
      .select('*, works(name)')
      .in('work_id', workIds)
      .eq('pool', 0)
      .eq('is_order_made', true),
  ]);
  if (mainResult.error) throw mainResult.error;

  // 予約イベントを listPreorderEvents と同じクライアント側フィルターで絞り込む
  const preorderRows = (preorderResult.data ?? []).filter(e => {
    const pe = e.preorder_end_date as string | null;
    const ed = e.event_date as string | null;
    if (pe && pe < today) return false;
    if (!pe && ed && ed < today) return false;
    return true;
  });

  // 重複排除してマージ（通常クエリに既に含まれる予約イベントを除く）
  const mainIds = new Set((mainResult.data ?? []).map(e => e.id as string));
  const combined = [...(mainResult.data ?? []), ...preorderRows.filter(e => !mainIds.has(e.id as string))];

  const events = combined.map(e => {
    const ev = rowToEvent(e as Record<string, unknown>);
    const works = (e as Record<string, unknown>).works as { name: string } | null;
    return { ...ev, workId: (e as Record<string, unknown>).work_id as string, workName: works?.name ?? undefined };
  });

  // dateLabel='中'（月のみ）は当月が終わるまで upcoming 扱い
  const isMonthOnlyActive = (e: CalendarEvent) =>
    e.dateLabel === '中' && !!e.date && e.date.slice(0, 7) >= today.slice(0, 7);

  const ongoing = events
    .filter(e => e.date && e.date < today && !isMonthOnlyActive(e))
    .sort((a, b) => (a.endDate ?? '').localeCompare(b.endDate ?? ''));
  const upcoming = events
    .filter(e => !e.date || e.date >= today || isMonthOnlyActive(e))
    .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));

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

export async function listAllParticipatedWorks(userId: string): Promise<Work[]> {
  const { data, error } = await supabase
    .from('participations')
    .select('work_id, last_visited_at, works(id, name, participant_count)')
    .eq('user_id', userId)
    .order('last_visited_at', { ascending: false });

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

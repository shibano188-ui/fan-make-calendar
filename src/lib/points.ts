import { supabase } from './supabase';

export type UserPoints = {
  points: number;
  total_earned: number;
};

export async function getUserPoints(userId: string): Promise<UserPoints> {
  const { data } = await supabase
    .from('user_points')
    .select('points, total_earned')
    .eq('user_id', userId)
    .maybeSingle();
  return data
    ? { points: data.points as number, total_earned: data.total_earned as number }
    : { points: 0, total_earned: 0 };
}

export type UserStats = {
  postCount: number;
  reactionsReceived: number;
};

export async function getUserStats(userId: string): Promise<UserStats> {
  const { count: postCount } = await supabase
    .from('events')
    .select('*', { count: 'exact', head: true })
    .eq('author_id', userId)
    .eq('pool', 0);

  const { data: myEvents } = await supabase
    .from('events')
    .select('id')
    .eq('author_id', userId)
    .eq('pool', 0);

  let reactionsReceived = 0;
  if (myEvents && myEvents.length > 0) {
    const { count } = await supabase
      .from('likes')
      .select('*', { count: 'exact', head: true })
      .in('event_id', myEvents.map(e => e.id as string))
      .not('reaction_type', 'is', null);
    reactionsReceived = count ?? 0;
  }

  return { postCount: postCount ?? 0, reactionsReceived };
}

export type AchievementBadge = {
  id: string;
  emoji: string;
  label: string;
  condition: string;
  check: (stats: UserStats) => boolean;
};

export const ACHIEVEMENTS: AchievementBadge[] = [
  {
    id: 'first_post',
    emoji: '🌱',
    label: 'はじめの一歩',
    condition: '初めて投稿した',
    check: s => s.postCount >= 1,
  },
  {
    id: '100_posts',
    emoji: '📚',
    label: '百投の達人',
    condition: '100件投稿した',
    check: s => s.postCount >= 100,
  },
  {
    id: '1000_reactions',
    emoji: '❤️',
    label: 'いいね王',
    condition: 'リアクション累計1000件もらった',
    check: s => s.reactionsReceived >= 1000,
  },
];

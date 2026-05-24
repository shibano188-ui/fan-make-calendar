export type ReactionType = 'like' | 'want' | 'hot' | 'amazing' | 'best';

export type ReactionCounts = {
  like: number;
  want: number;
  hot: number;
  amazing: number;
  best: number;
};

export type CalendarEvent = {
  id: string;
  title: string;
  date: string;       // 'YYYY-MM-DD'
  time?: string;      // 'HH:mm'
  category?: string;
  link?: string;
  memo?: string;
  prefecture?: string;
  locationDetail?: string;
  locationMapLink?: string;
  authorId?: string;
  authorName?: string;
  likes: number;
  likedByMe: boolean;
  userReaction?: ReactionType | null;
  reactionCounts?: ReactionCounts;
  createdAt: string;
  workId?: string;
  workName?: string;
};

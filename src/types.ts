export type CalendarEvent = {
  id: string;
  title: string;
  date: string | null;       // 'YYYY-MM-DD' or null（日付未定）
  dateLabel?: string | null; // 表示用: '上旬'|'中旬'|'下旬'|'中'
  time?: string;      // 'HH:mm'
  category?: string;
  link?: string;
  memo?: string;
  prefecture?: string;
  locationDetail?: string;
  locationMapLink?: string;
  authorId?: string;
  authorName?: string;
  endDate?: string;    // 'YYYY-MM-DD'
  endTime?: string;    // 'HH:mm'
  likes: number;
  likedByMe: boolean;
  createdAt: string;
  workId?: string;
  workName?: string;
  imageUrl?: string;
  sourceUrl?: string;
  isOrderMade?: boolean;
  reservationStartDate?: string;
  reservationEndDate?: string;
};

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
  endDate?: string;    // 'YYYY-MM-DD'
  endTime?: string;    // 'HH:mm'
  likes: number;
  likedByMe: boolean;
  createdAt: string;
  workId?: string;
  workName?: string;
  imageUrl?: string;
};

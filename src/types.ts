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
  likes: number;
  likedByMe: boolean;
  createdAt: string;
};

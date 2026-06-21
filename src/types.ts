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
  preorderStart?: string; // 'YYYY-MM-DD' 予約開始日
  preorderEnd?: string;   // 'YYYY-MM-DD' 予約締切日
  preorderStartTime?: string; // 'HH:mm' 予約開始時間（任意）
  preorderEndTime?: string;   // 'HH:mm' 予約締切時間（任意）

  // ─ ピボット拡張（既存行は未設定=event扱いで動く）─
  type?: 'event' | 'goods'; // 既定は event（DBは default 'event'）
  price?: number;           // グッズ価格（円）
  stockNote?: string;       // 在庫コメント（最新の追記ログ要約など）
  retailer?: string;        // 販路名（animate / あみあみ / プレバン 等）
  affiliateUrl?: string;    // アフィリンク化後のURL
  hasAffiliate?: boolean;   // アフィ対応販路か（false=B2B送客対象）
};

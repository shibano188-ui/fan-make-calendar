import { useCallback, useEffect, useState } from 'react';
import { getReportedEventIds } from '../lib/api';

// 自分が通報済みのイベントIDセット。通報したイベントは通報者の画面に表示しない
export function useReportedEventIds(userId: string | undefined) {
  const [reportedEventIds, setReportedEventIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!userId) return;
    getReportedEventIds(userId)
      .then(ids => setReportedEventIds(new Set(ids)))
      .catch(() => {});
  }, [userId]);

  // 通報直後に即非表示にするためのローカル追加
  const addReportedEventId = useCallback((id: string) => {
    setReportedEventIds(prev => new Set(prev).add(id));
  }, []);

  return { reportedEventIds, addReportedEventId };
}

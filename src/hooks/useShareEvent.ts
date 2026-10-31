import { useActionSheet } from '../components/ui/ActionSheet';
import type { CalendarEvent } from '../types';
import { canShareToApps, shareToApps, shareToX } from '../lib/share';

/** 共有のボタン。X かほかのアプリかを選んでもらう。OS の共有シートが出せないときは、そのまま X へ */
export function useShareEvent() {
  const actionSheet = useActionSheet();
  return async (e: CalendarEvent, workName?: string | null) => {
    if (!(await canShareToApps())) { shareToX(e, workName); return; }
    const picked = await actionSheet({ title: '共有', options: [{ id: 'x', label: 'Xでポスト' }, { id: 'apps', label: 'ほかのアプリ' }] });
    if (picked === 'x') shareToX(e, workName);
    else if (picked === 'apps') await shareToApps(e, workName);
  };
}

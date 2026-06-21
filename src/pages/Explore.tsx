import { useState } from 'react';
import type { CalendarEvent } from '../types';
import ItemCard from '../components/item/ItemCard';
import Chip from '../components/ui/Chip';
import { todayStr } from '../design/tokens';

// Phase 0 のデザイン検証用サンプル（Phase 1 で lib/api.ts から実データに差し替え）
const SAMPLE: CalendarEvent[] = [
  {
    id: 's1', title: 'ちいかわ POP UP STORE アクスタ 全8種', date: '2026-07-10',
    workName: 'ちいかわ', type: 'goods', category: 'アクスタ', price: 1320, likes: 340, likedByMe: false,
    createdAt: todayStr(), preorderStart: '2026-06-01', preorderEnd: '2026-06-14',
  },
  {
    id: 's2', title: 'ハイキュー!! 缶バッジ', date: '2026-06-10',
    workName: 'ハイキュー!!', type: 'goods', category: '缶バッジ', price: 550, likes: 120, likedByMe: false,
    createdAt: todayStr(),
  },
];

export default function Explore() {
  const [mode, setMode] = useState<'goods' | 'event'>('goods');
  return (
    <div className="px-3 pt-3">
      <div className="flex gap-2 mb-3">
        <Chip active={mode === 'goods'} onClick={() => setMode('goods')}>グッズ</Chip>
        <Chip active={mode === 'event'} onClick={() => setMode('event')}>イベント</Chip>
      </div>
      <p className="text-[12px] text-label-secondary mb-2">Phase 0: デザインシステム検証用サンプル</p>
      <div className="grid grid-cols-2 gap-2">
        {SAMPLE.map((e) => (
          <ItemCard key={e.id} event={e} layout="grid" />
        ))}
      </div>
    </div>
  );
}

import { BadgeCheck } from 'lucide-react';

/** FanHive公式アカウントの名前の横に出す印 */
export default function OfficialBadge({ size = 15 }: { size?: number }) {
  return (
    <span className="inline-flex items-center flex-shrink-0" aria-label="公式" title="FanHive公式">
      <BadgeCheck size={size} strokeWidth={2.5} style={{ color: 'var(--accent-text)' }} />
    </span>
  );
}

import { getTitleTier } from '../lib/titles';

export default function TitleBadge({
  totalEarned,
  size = 'sm',
}: {
  totalEarned: number;
  size?: 'sm' | 'lg';
}) {
  const tier = getTitleTier(totalEarned);
  const cls = size === 'sm'
    ? 'px-1.5 py-0.5 text-[9px]'
    : 'px-3 py-1.5 text-sm';

  return (
    <span
      className={`rounded-full font-bold text-white inline-block ${cls} ${tier.rainbow ? 'rainbow-badge' : ''}`}
      style={tier.rainbow ? {} : { backgroundColor: tier.color }}
    >
      {tier.label}
    </span>
  );
}

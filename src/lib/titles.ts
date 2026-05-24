export type TitleTier = {
  label: string;
  minPoints: number;
  color: string;
  rainbow?: boolean;
};

export const TITLE_TIERS: TitleTier[] = [
  { label: '見習いファン', minPoints: 0,     color: '#9CA3AF' },
  { label: 'ファン',       minPoints: 100,   color: '#60A5FA' },
  { label: '熱心なファン', minPoints: 500,   color: '#34D399' },
  { label: '伝道師',       minPoints: 1500,  color: '#A78BFA' },
  { label: 'レジェンド',   minPoints: 5000,  color: '#FBBF24' },
  { label: '神',           minPoints: 10000, color: '#EC4899', rainbow: true },
];

export function getTitleTier(totalEarned: number): TitleTier {
  let current = TITLE_TIERS[0];
  for (const tier of TITLE_TIERS) {
    if (totalEarned >= tier.minPoints) current = tier;
  }
  return current;
}

export function getNextTier(totalEarned: number): TitleTier | null {
  const idx = TITLE_TIERS.findIndex(t => t.minPoints > totalEarned);
  return idx >= 0 ? TITLE_TIERS[idx] : null;
}

export function getProgress(totalEarned: number): number {
  const current = getTitleTier(totalEarned);
  const next = getNextTier(totalEarned);
  if (!next) return 1;
  return Math.min(1, (totalEarned - current.minPoints) / (next.minPoints - current.minPoints));
}

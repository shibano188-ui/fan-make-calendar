export type AchievementStats = {
  posted: number;
  received: number;
  likesGiven: number;
  reactionsGiven: number;
  works: number;
  birthdayPosts: number;
};

export const TITLE_TIERS = [
  { label: '推し活レジェンド', check: (s: AchievementStats) => s.posted >= 200 && s.received >= 1000 },
  { label: 'カリスマファン',   check: (s: AchievementStats) => s.posted >= 100 && s.received >= 500 },
  { label: 'ファン記者',       check: (s: AchievementStats) => s.posted >= 50  && s.received >= 200 },
  { label: '現地勢',           check: (s: AchievementStats) => s.posted >= 30  || s.received >= 100 },
  { label: '情報屋',           check: (s: AchievementStats) => s.posted >= 10 },
  { label: '見習いファン',     check: (s: AchievementStats) => s.posted >= 1 },
];

export function calcTitle(s: AchievementStats): string {
  return TITLE_TIERS.find(t => t.check(s))?.label ?? 'ルーキー';
}

export function calcRadarData(s: AchievementStats) {
  // ゆるやかな成長カーブ: ベースライン15（デフォルトでも小さな星の形になる）から
  // べき乗(0.8)でじわじわ 100 へ。一項目だけ一気に張り付いて星が歪になるのを防ぐ。
  const sc = (val: number, max: number) =>
    Math.min(100, Math.round(15 + 85 * Math.pow(Math.min(1, val / max), 0.8)));
  return [
    { axis: '投稿力', value: sc(s.posted, 200) },
    { axis: '影響力', value: sc(s.received, 1000) },
    { axis: '応援力', value: sc(s.likesGiven, 500) },
    { axis: '収集力', value: sc(s.reactionsGiven, 200) },
    { axis: '開拓力', value: sc(s.works, 30) },
  ];
}

export function calcGrade(s: AchievementStats): number {
  return calcRadarData(s).reduce((sum, d) => sum + d.value, 0);
}

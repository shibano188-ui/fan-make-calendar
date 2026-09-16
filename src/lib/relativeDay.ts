/** 'YYYY-MM-DD' 同士の日数差（to − from）。端末ローカルの0時どうしで数えるので時差・夏時間でずれない。 */
export function daysBetween(from: string, to: string): number {
  const a = new Date(from + 'T00:00:00');
  const b = new Date(to + 'T00:00:00');
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

/** 今日から見たその日の近さ。今日は null（「今日」バッジを別に出すため）。 */
export function relativeDayLabel(day: string, today: string): string | null {
  const n = daysBetween(today, day);
  if (n === 0) return null;
  if (n === 1) return '明日';
  if (n === -1) return '昨日';
  return n > 0 ? `あと${n}日` : `${-n}日前`;
}

type CountdownFields = {
  date?: string | null; endDate?: string | null; preorderStart?: string | null; preorderEnd?: string | null;
  visits?: { start: string; end: string }[];
};

/** 詳細ページの「あと◯日」。その予定でいま一番気になる日までを1つだけ返す。
 *  優先: 受付開始前 → 受付中の締切 → ピンした日 → 発売・開催日 → 開催中の終了日。何も無ければ null。 */
export function countdownLabel(e: CountdownFields, isGoods: boolean, today: string): string | null {
  const word = isGoods ? '発売' : '開催';
  const until = (day: string, what: string, todayText: string) => {
    const n = daysBetween(today, day);
    return n === 0 ? todayText : `${what}まであと${n}日`;
  };
  if (e.preorderStart && e.preorderStart > today) return until(e.preorderStart, '受付開始', '本日受付開始');
  if (e.preorderEnd && e.preorderEnd >= today && (!e.preorderStart || e.preorderStart <= today)) {
    return until(e.preorderEnd, '締切', '本日締切');
  }
  const pin = (e.visits ?? []).map((v) => v.start).filter((d) => d >= today).sort()[0];
  if (pin) return until(pin, 'ピンした日', '本日はピンした日');
  if (e.date && e.date >= today) return until(e.date, word, `本日${word}`);
  // 期間のある予定の最中（開催中・販売期間中）
  if (e.date && e.endDate && e.endDate >= today) {
    const n = daysBetween(today, e.endDate);
    return n === 0 ? '本日まで' : `終了まであと${n}日`;
  }
  return null;
}

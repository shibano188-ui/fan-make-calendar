// スタンプ。2026-11-07 から「投稿した人へのお礼」ではなく、♡（カレンダーに入れる）ほどではないけど
// 「とっておく」ための印にした（柴野）。押した予定はカレンダーの「スタンプ」で見返せる。
// 押せるのはこの4つ。並びはこの順（ボタンに出す1つ・一覧の絞り込みもこの順）
export const REACTIONS = [
  { type: 'want',    label: '欲しい',   image: '/reactions/want.png' },
  { type: 'want_go', label: '行きたい', image: '/reactions/want_go.png' },
  { type: 'bought',  label: '買った',   image: '/reactions/bought.png' },
  { type: 'went',    label: '行った',   image: '/reactions/went.png' },
] as const;
export type ReactionType = typeof REACTIONS[number]['type'];

/** 前に押せたスタンプ。もう押せないが、押してあるものは「スタンプ」の一覧に出す（古い iOS アプリからは今も押される） */
export const LEGACY_REACTIONS = [
  { type: 'excited',    label: '楽しみ',     image: '/reactions/excited.png' },
  { type: 'congrats',   label: 'おめでとう', image: '/reactions/congrats.png' },
  { type: 'thanks',     label: 'ありがとう', image: '/reactions/thanks.png' },
  { type: 'didnt_know', label: '知らなかった', image: '/reactions/didnt_know.png' },
] as const;

/** 種類から絵と名前を引く（前の種類も含む）。知らない種類は null */
export function stampInfo(type: string): { type: string; label: string; image: string } | null {
  return [...REACTIONS, ...LEGACY_REACTIONS].find((r) => r.type === type) ?? null;
}

// 自分のリアクションは localStorage に保持（カードごとの取得クエリを避ける／main と同じキー）
const MY_REACTIONS_KEY = 'fan_reactions';

function loadMyReactions(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(MY_REACTIONS_KEY) ?? '{}'); } catch { return {}; }
}

export function getMyReaction(eventId: string): ReactionType | null {
  return (loadMyReactions()[eventId] as ReactionType) ?? null;
}

export function saveMyReaction(eventId: string, type: ReactionType | null): void {
  const all = loadMyReactions();
  if (type === null) delete all[eventId]; else all[eventId] = type;
  try { localStorage.setItem(MY_REACTIONS_KEY, JSON.stringify(all)); } catch { /* ignore */ }
}

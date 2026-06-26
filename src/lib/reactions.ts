export const REACTIONS = [
  { type: 'want_go',    label: '行きたい！',    image: '/reactions/want_go.png' },
  { type: 'want',       label: '欲しい！',      image: '/reactions/want.png' },
  { type: 'excited',    label: '楽しみ！',      image: '/reactions/excited.png' },
  { type: 'congrats',   label: 'おめでとう！',  image: '/reactions/congrats.png' },
  { type: 'thanks',     label: 'ありがとう！',  image: '/reactions/thanks.png' },
  { type: 'didnt_know', label: '知らなかった！', image: '/reactions/didnt_know.png' },
] as const;
export type ReactionType = typeof REACTIONS[number]['type'];

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

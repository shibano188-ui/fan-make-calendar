export const REACTIONS = [
  { type: 'want_go', label: '行きたい！', emoji: '📅' },
  { type: 'want',    label: '欲しい！',   emoji: '⭐' },
  { type: 'happy',   label: '嬉しい！',   emoji: '😊' },
  { type: 'excited', label: '楽しみ！',   emoji: '🎉' },
] as const;
export type ReactionType = typeof REACTIONS[number]['type'];

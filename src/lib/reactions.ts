export const REACTIONS = [
  { type: 'want_go',    label: '行きたい！',    image: '/reactions/want_go.png' },
  { type: 'want',       label: '欲しい！',      image: '/reactions/want.png' },
  { type: 'excited',    label: '楽しみ！',      image: '/reactions/excited.png' },
  { type: 'congrats',   label: 'おめでとう！',  image: '/reactions/congrats.png' },
  { type: 'thanks',     label: 'ありがとう！',  image: '/reactions/thanks.png' },
  { type: 'didnt_know', label: '知らなかった！', image: '/reactions/didnt_know.png' },
] as const;
export type ReactionType = typeof REACTIONS[number]['type'];

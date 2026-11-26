// 部屋とまとめ画像は、まだプレビュー（*.vercel.app）と手元の開発でだけ出す（2026-11-26 柴野「とりあえずプレビューにしておく」）。
// fanhive.jp（Web と Android）と iPhone のアプリ（同梱）には出ない
export const ROOM_PREVIEW = typeof location !== 'undefined'
  && (location.hostname.endsWith('.vercel.app') || (import.meta.env.DEV && location.protocol.startsWith('http')));
